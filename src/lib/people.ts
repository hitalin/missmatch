import { cleanNoteText } from './sample';
import type { Genre } from './types';

// 人を見つける（docs/PEOPLE.md v6.4）の、サーバーもブラウザも使う副作用のない部分。
// 参加者本人の公開ノートから話題を推定し、参加の条件を判定する

export const PEOPLE_VERSION = 1;
export const MIN_ELIGIBLE_NOTES = 10; // 参加に要る公開ノートの数
export const MIN_ACCOUNT_AGE_DAYS = 30;
export const MAX_NOTES_READ = 50; // Clef に読ませる上限
export const MIN_NOTE_CHARS = 20;
export const REPRESENTATIVE_NOTES = 3;
export const MAX_CHIPS = 3;
export const MAX_FOLLOWING = 2000;
export const MEMBER_CAP = 500; // 全体の上限
export const DECK_OPENS_AT = 30; // この人数までデッキを開かない
export const ESTIMATE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Misskey の notes の、ここで使う部分
export interface MisskeyNote {
	id: string;
	createdAt: string;
	text: string | null;
	cw: string | null;
	visibility: 'public' | 'home' | 'followers' | 'specified';
	localOnly?: boolean;
	renoteId: string | null;
	renote?: { text?: string | null } | null;
	replyId: string | null;
	fileIds?: string[];
	reactions: Record<string, number>;
}

export interface EligibleNote {
	id: string;
	text: string; // 整形済み（URL・メンション除去、200 字まで）
	createdAt: number;
	isReply: boolean;
	reactions: number;
}

// 読んでよいノート: 公開、CW なし、連合あり、純リノートでない、本文 20 字以上。
// 引用リノートは本人の本文だけ（引用元の本文は非参加者のものなので読まない）。
// CW と連合なしは本人の意思表示なので、それがそのまま opt-out になる
export function eligibleNotes(notes: MisskeyNote[]): EligibleNote[] {
	const out: EligibleNote[] = [];
	for (const n of notes) {
		if (n.visibility !== 'public' || n.cw || n.localOnly) continue;
		if (n.renoteId && !n.text) continue;
		const text = cleanNoteText(n.text ?? '');
		if (text.length < MIN_NOTE_CHARS) continue;
		out.push({
			id: n.id,
			text,
			createdAt: Date.parse(n.createdAt),
			isReply: n.replyId !== null,
			reactions: Object.values(n.reactions ?? {}).reduce((s, v) => s + v, 0)
		});
	}
	return out;
}

// 代表ノート: 反応の多い順、同数なら新しい順
export function representativeNoteIds(notes: EligibleNote[], n = REPRESENTATIVE_NOTES): string[] {
	return [...notes]
		.sort((a, b) => b.reactions - a.reactions || b.createdAt - a.createdAt)
		.slice(0, n)
		.map((x) => x.id);
}

export function replyRatio(notes: EligibleNote[]): number {
	if (notes.length === 0) return 0;
	return notes.filter((n) => n.isReply).length / notes.length;
}

// 最古から最新までの日数で割る。1 件や同日なら 1 日に数える
export function notesPerDay(notes: EligibleNote[]): number {
	if (notes.length === 0) return 0;
	const times = notes.map((n) => n.createdAt);
	const span = Math.max(...times) - Math.min(...times);
	const days = Math.max(1, span / (24 * 60 * 60 * 1000));
	return notes.length / days;
}

// Misskey の birthday（YYYY-MM-DD、任意項目）から 18 歳以上か。無ければ null
export function isAdultByBirthday(
	birthday: string | null | undefined,
	now: number
): boolean | null {
	if (!birthday) return null;
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthday);
	if (!m) return null;
	const birth = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
	if (Number.isNaN(birth)) return null;
	const eighteenth = Date.UTC(Number(m[1]) + 18, Number(m[2]) - 1, Number(m[3]));
	return now >= eighteenth;
}

export type JoinReason = 'notes' | 'account-age' | 'adult' | 'minor';

export function joinEligibility(input: {
	eligibleCount: number;
	createdAt: string;
	birthday: string | null;
	adultChecked: boolean;
	now: number;
}): { ok: true } | { ok: false; reason: JoinReason } {
	if (!input.adultChecked) return { ok: false, reason: 'adult' };
	if (isAdultByBirthday(input.birthday, input.now) === false) return { ok: false, reason: 'minor' };
	const ageMs = input.now - Date.parse(input.createdAt);
	if (!(ageMs >= MIN_ACCOUNT_AGE_DAYS * 24 * 60 * 60 * 1000))
		return { ok: false, reason: 'account-age' };
	if (input.eligibleCount < MIN_ELIGIBLE_NOTES) return { ok: false, reason: 'notes' };
	return { ok: true };
}

export function normalizeAcct(usernameOrAcct: string, host?: string): string {
	const s = usernameOrAcct.replace(/^@/, '').toLowerCase();
	return host ? `${s}@${host.toLowerCase()}` : s;
}

// サーバーごとの参加上限: 毎日読む人（dru15）の 10% か 5 人の大きい方（1 人鯖は 5 人）
export function serverCap(dru15: number | null): number {
	return Math.max(5, Math.round((dru15 ?? 0) * 0.1));
}

export type HiddenKind = 'seeking' | 'ads' | 'minor' | 'report';

// KV に置く参加者の記録。ノート本文・bio・アバターは置かない
export interface Member {
	version: number;
	host: string;
	userId: string;
	username: string;
	name: string;
	acct: string; // user@host（小文字）
	joinedAt: number;
	adultCheckedAt: number;
	chips: Genre[]; // 本人が選んだ話題（任意）
	profileOnly: boolean; // 代表ノートをカードに出さない
	followingPublic: boolean; // followingVisibility が public なら共通のフォロー先を計算する
	noteIds: string[]; // 代表ノート（id だけ）
	estimate: {
		genre: Record<Genre, number>;
		replyRatio: number;
		notesPerDay: number;
		sampleCount: number;
		hash: string; // 読んだ範囲
		at: number;
	} | null;
	warning: { noteIds: string[]; at: number } | null; // 募集の表明が 1 件（本人にだけ見せる）
	hidden: { kind: HiddenKind; noteIds: string[]; at: number } | null;
}
