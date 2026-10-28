import type { AuthUser } from '$lib/auth';
import {
	DECK_OPENS_AT,
	type EligibleNote,
	ESTIMATE_TTL_MS,
	eligibleNotes,
	type HiddenKind,
	type JoinReason,
	joinEligibility,
	MAX_FOLLOWING,
	MAX_NOTES_READ,
	MEMBER_CAP,
	type Member,
	type MisskeyNote,
	normalizeAcct,
	notesPerDay,
	PEOPLE_VERSION,
	replyRatio,
	representativeNoteIds,
	serverCap
} from '$lib/people';
import { buildMemberRequest, judgeMember, parseMemberAnswers } from '$lib/people-clef';
import { cleanNoteText } from '$lib/sample';
import type { Genre, ServerInfo } from '$lib/types';
import type { ClefRunner } from '$lib/vibe';
import type { Budget } from './budget';
import { decryptText, encryptText } from './crypto';
import type { MisskeyApi } from './misskey';

// 参加者（docs/PEOPLE.md §3・§6）。missmatch が預かるのは参加の記録・推定した数値・本人のフォロー一覧・
// 暗号化したトークン（7 日おきの再推定と月 1 回の生存確認のため）だけ。ノート本文・bio・アバターは置かない

// KVNamespace のうち使う部分（テストではメモリで代用する）
export interface MemberKv {
	get(key: string): Promise<string | null>;
	put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
	delete(key: string): Promise<void>;
	list(options: {
		prefix: string;
		cursor?: string;
	}): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor?: string }>;
}

export interface PeopleDeps {
	kv: MemberKv;
	api: MisskeyApi;
	runner: ClefRunner;
	budget?: Budget;
	servers: ServerInfo[]; // joinmisskey の一覧（サーバーごとの上限に使う）
	tokenKey: CryptoKey;
	now?: () => number;
}

const memberKey = (host: string, userId: string) => `member:v1:${host}:${userId}`;
const followingKey = (host: string, userId: string) => `following:v1:${host}:${userId}`;
const tokenKeyOf = (host: string, userId: string) => `membertoken:v1:${host}:${userId}`;
const banKey = (host: string, userId: string) => `ban:v1:${host}:${userId}`;
const FOLLOWING_TTL_SECONDS = 60 * 60 * 24;
const LIVENESS_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

export async function readMember(
	kv: MemberKv,
	host: string,
	userId: string
): Promise<Member | null> {
	const raw = await kv.get(memberKey(host, userId));
	return raw ? (JSON.parse(raw) as Member) : null;
}

export async function listMembers(kv: MemberKv, prefix = 'member:v1:'): Promise<Member[]> {
	const names: string[] = [];
	let cursor: string | undefined;
	do {
		const page = await kv.list({ prefix, cursor });
		names.push(...page.keys.map((k) => k.name));
		cursor = page.list_complete ? undefined : page.cursor;
	} while (cursor);
	const members: Member[] = [];
	for (const name of names) {
		const raw = await kv.get(name);
		if (raw) members.push(JSON.parse(raw) as Member);
	}
	return members;
}

export async function countMembers(kv: MemberKv, host?: string): Promise<number> {
	const prefix = host ? `member:v1:${host}:` : 'member:v1:';
	let n = 0;
	let cursor: string | undefined;
	do {
		const page = await kv.list({ prefix, cursor });
		n += page.keys.length;
		cursor = page.list_complete ? undefined : page.cursor;
	} while (cursor);
	return n;
}

export async function readMemberToken(
	deps: PeopleDeps,
	host: string,
	userId: string
): Promise<string | null> {
	const packed = await deps.kv.get(tokenKeyOf(host, userId));
	return packed ? decryptText(deps.tokenKey, packed) : null;
}

export async function leaveMember(kv: MemberKv, host: string, userId: string): Promise<void> {
	await Promise.all([
		kv.delete(memberKey(host, userId)),
		kv.delete(followingKey(host, userId)),
		kv.delete(tokenKeyOf(host, userId))
	]);
}

// Misskey の `i`（MeDetailed）のうち使う部分
interface Self {
	id: string;
	username: string;
	name: string | null;
	createdAt: string;
	birthday: string | null;
	followingVisibility: 'public' | 'followers' | 'private';
	preventAiLearning: boolean;
	description: string | null;
	fields: { name: string; value: string }[];
	pinnedNotes: { text?: string | null }[];
	isLocked: boolean;
}

export interface JoinInput {
	chips: Genre[];
	profileOnly: boolean;
}
export type JoinResult =
	| { ok: true; warning?: string[] }
	| {
			ok: false;
			reason: JoinReason | 'banned' | 'cap' | 'server-cap' | 'seeking' | 'ads';
			noteIds?: string[];
	  };

async function fetchEligible(deps: PeopleDeps, host: string, userId: string, token: string) {
	const notes = (await deps.api(
		host,
		'users/notes',
		{ userId, limit: 100, withReplies: true, withRenotes: true },
		token
	)) as MisskeyNote[];
	return eligibleNotes(notes);
}

// 直近 50 件（無ければ bio と固定ノートだけ）を Clef に読ませ、推定と判定を返す
async function estimate(deps: PeopleDeps, self: Self, eligible: EligibleNote[]) {
	const read = eligible.slice(0, MAX_NOTES_READ);
	const request = buildMemberRequest({
		name: self.name ?? self.username,
		description: cleanNoteText(self.description ?? ''),
		fields: self.fields ?? [],
		pinned: (self.pinnedNotes ?? [])
			.map((n) => cleanNoteText(n.text ?? ''))
			.filter((t) => t.length > 0),
		notes: read.map((n) => ({ id: n.id, text: n.text }))
	});
	const output = await deps.runner(request);
	const answers = parseMemberAnswers(
		output.answers,
		read.map((n) => n.id)
	);
	const digest = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(read.map((n) => n.id).join(','))
	);
	const hash = [...new Uint8Array(digest).slice(0, 8)]
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
	return {
		judgement: judgeMember(answers),
		estimate: {
			genre: answers.genre,
			replyRatio: replyRatio(eligible),
			notesPerDay: notesPerDay(eligible),
			sampleCount: read.length,
			hash,
			at: (deps.now ?? Date.now)()
		}
	};
}

// 本人のフォロー一覧を acct の集合として 1 日置く（followingVisibility が public のときだけ）
async function cacheFollowing(
	deps: PeopleDeps,
	self: Self,
	host: string,
	token: string
): Promise<boolean> {
	if (self.followingVisibility !== 'public') return false;
	const accts: string[] = [];
	let untilId: string | undefined;
	while (accts.length < MAX_FOLLOWING) {
		const page = (await deps.api(
			host,
			'users/following',
			{ userId: self.id, limit: 100, ...(untilId ? { untilId } : {}) },
			token
		)) as { id: string; followee: { username: string; host: string | null } }[];
		if (page.length === 0) break;
		for (const f of page) accts.push(normalizeAcct(f.followee.username, f.followee.host ?? host));
		untilId = page[page.length - 1].id;
		if (page.length < 100) break;
	}
	await deps.kv.put(followingKey(host, self.id), JSON.stringify(accts), {
		expirationTtl: FOLLOWING_TTL_SECONDS
	});
	return true;
}

export async function joinMember(
	deps: PeopleDeps,
	session: { user: AuthUser; token: string },
	input: JoinInput
): Promise<JoinResult> {
	const now = (deps.now ?? Date.now)();
	const { host } = session.user;
	if (await deps.kv.get(banKey(host, session.user.id))) return { ok: false, reason: 'banned' };
	const [total, onHost] = await Promise.all([countMembers(deps.kv), countMembers(deps.kv, host)]);
	if (total >= MEMBER_CAP) return { ok: false, reason: 'cap' };
	const server = deps.servers.find((s) => s.host === host);
	if (onHost >= serverCap(server?.dru15 ?? null)) return { ok: false, reason: 'server-cap' };

	const self = (await deps.api(host, 'i', {}, session.token)) as Self;
	const eligible = await fetchEligible(deps, host, self.id, session.token);
	const eligibility = joinEligibility({ eligibleCount: eligible.length });
	if (!eligibility.ok) return { ok: false, reason: eligibility.reason };

	const { judgement, estimate: est } = await estimate(deps, self, eligible);
	if (judgement.verdict === 'reject')
		return { ok: false, reason: judgement.kind, noteIds: judgement.noteIds };

	const followingPublic = await cacheFollowing(deps, self, host, session.token);
	const member: Member = {
		version: PEOPLE_VERSION,
		host,
		userId: self.id,
		username: self.username,
		name: self.name ?? self.username,
		acct: normalizeAcct(self.username, host),
		joinedAt: now,
		chips: input.chips.slice(0, 3),
		profileOnly: input.profileOnly,
		followingPublic,
		noteIds: representativeNoteIds(eligible),
		estimate: est,
		warning: judgement.verdict === 'warn' ? { noteIds: judgement.noteIds, at: now } : null,
		hidden: null
	};
	await Promise.all([
		deps.kv.put(memberKey(host, self.id), JSON.stringify(member)),
		deps.kv.put(tokenKeyOf(host, self.id), await encryptText(deps.tokenKey, session.token))
	]);
	return judgement.verdict === 'warn' ? { ok: true, warning: judgement.noteIds } : { ok: true };
}

export async function updateMember(kv: MemberKv, member: Member): Promise<void> {
	await kv.put(memberKey(member.host, member.userId), JSON.stringify(member));
}

export async function hideMember(
	kv: MemberKv,
	member: Member,
	kind: HiddenKind,
	noteIds: string[],
	at: number
) {
	await updateMember(kv, { ...member, hidden: { kind, noteIds, at } });
}

// 7 日おきの再推定と、月 1 回の生存確認（cron）。裏側の仕事なので枠が無ければ止める。
// 推定の無い人・古い人から順に。連携解除・凍結・消滅（i が 401 / 403 / 404）なら参加を解く
export async function refreshMembers(
	deps: PeopleDeps
): Promise<{ refreshed: number; removed: number }> {
	const now = (deps.now ?? Date.now)();
	const members = (await listMembers(deps.kv))
		.filter((m) => !m.estimate || now - m.estimate.at >= ESTIMATE_TTL_MS)
		.sort((a, b) => (a.estimate?.at ?? 0) - (b.estimate?.at ?? 0));
	let refreshed = 0;
	let removed = 0;
	for (const m of members) {
		if (await deps.budget?.exhausted()) break;
		const token = await readMemberToken(deps, m.host, m.userId);
		if (!token) continue;
		let self: Self;
		try {
			self = (await deps.api(m.host, 'i', {}, token)) as Self;
		} catch (e) {
			const status = (e as { status?: number }).status;
			if (status === 401 || status === 403 || status === 404) {
				await leaveMember(deps.kv, m.host, m.userId);
				removed++;
			}
			continue;
		}
		const eligible = await fetchEligible(deps, m.host, m.userId, token);
		const { judgement, estimate: est } = await estimate(deps, self, eligible);
		const hidden =
			judgement.verdict === 'reject'
				? { kind: judgement.kind as HiddenKind, noteIds: judgement.noteIds, at: now }
				: m.hidden?.kind === 'report'
					? m.hidden
					: null;
		const followingPublic = await cacheFollowing(deps, self, m.host, token);
		await updateMember(deps.kv, {
			...m,
			name: self.name ?? self.username,
			followingPublic,
			noteIds: representativeNoteIds(eligible),
			estimate: est,
			warning: judgement.verdict === 'warn' ? { noteIds: judgement.noteIds, at: now } : null,
			hidden
		});
		refreshed++;
	}
	return { refreshed, removed };
}

export const LIVENESS_INTERVAL = LIVENESS_INTERVAL_MS;
export const deckOpensAt = DECK_OPENS_AT;
