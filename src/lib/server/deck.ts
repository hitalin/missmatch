import { runAffinity } from '$lib/intent';
import type { HiddenKind, Member } from '$lib/people';
import {
	type Badges,
	diversify,
	matchesOf,
	type Relation,
	rankCandidates,
	rationSize
} from '$lib/people-deck';
import {
	buildPeopleAffinityRequests,
	type PersonState,
	parsePeopleAffinity
} from '$lib/people-intent';
import { cleanNoteText } from '$lib/sample';
import type { Genre } from '$lib/types';
import {
	listMembers,
	type MemberKv,
	type PeopleDeps,
	readMemberToken,
	updateMember
} from './members';
import type { MisskeyApiError } from './misskey';

// デッキ・フォロー・マッチ・通報（docs/PEOPLE.md v6.4 §4・§4a・§5）。
// 相手のサーバーへ未認証で行かない。関係と bio は閲覧者本人のサーバーの users/show（userIds バッチ）で読み、
// 代表ノートは相手本人のトークンで相手のサーバーから読む

export interface Viewer {
	member: Member;
	token: string; // 閲覧者のトークン（read:account。フォローには write:following 付きが要る）
}

export interface Card {
	acct: string;
	host: string;
	username: string;
	name: string;
	avatarUrl: string;
	chips: Genre[];
	badges: Badges;
	description: string;
	fields: { name: string; value: string }[];
	pinned: string[];
	noteIds: string[];
	profileOnly: boolean;
	isLocked: boolean;
}

const RESOLVE_TTL_SECONDS = 60 * 60 * 24 * 30;
const RESOLVE_PER_REQUEST = 10; // 同期で解決する上限（残りは次回）
const FOLLOW_COOLDOWN_SECONDS = 60 * 60 * 24;
const FOLLOWS_PER_HOUR = 30;
const UNDO_WINDOW_MS = 60 * 1000;
const REPORTS_PER_DAY = 10;
const REPORTER_SENIORITY_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FOLLOWERS = 2000;

const resolveKey = (myHost: string, acct: string) => `resolve:v1:${myHost}:${acct}`;
const followingKey = (m: Member) => `following:v1:${m.host}:${m.userId}`;
const dateOf = (now: number) => new Date(now).toISOString().slice(0, 10);
const hourOf = (now: number) => new Date(now).toISOString().slice(0, 13);
const avatarUrlOf = (host: string, username: string) =>
	`https://${host}/avatar/@${encodeURIComponent(username)}`;

// 相手の acct → 閲覧者のサーバーでの userId。無ければ同期で解決（上限あり、並列 6）し 30 日置く
async function resolveIds(
	deps: PeopleDeps,
	viewer: Viewer,
	accts: string[]
): Promise<Map<string, string>> {
	const myHost = viewer.member.host;
	const ids = new Map<string, string>();
	const missing: string[] = [];
	for (const acct of accts) {
		const cached = await deps.kv.get(resolveKey(myHost, acct));
		if (cached) ids.set(acct, cached);
		else missing.push(acct);
	}
	const todo = missing.slice(0, RESOLVE_PER_REQUEST);
	const resolveOne = async (acct: string) => {
		const [username, host] = acct.split('@');
		try {
			const u = (await deps.api(
				myHost,
				'users/show',
				{ username, host: host === myHost ? null : host },
				viewer.token
			)) as { id: string };
			ids.set(acct, u.id);
			await deps.kv.put(resolveKey(myHost, acct), u.id, { expirationTtl: RESOLVE_TTL_SECONDS });
		} catch (e) {
			console.error('[people] resolve', acct, (e as Error).message);
		}
	};
	for (let i = 0; i < todo.length; i += 6) await Promise.all(todo.slice(i, i + 6).map(resolveOne));
	return ids;
}

interface Detailed {
	id: string;
	description: string | null;
	fields: { name: string; value: string }[];
	pinnedNotes: { text?: string | null }[];
	isLocked: boolean;
	isFollowing: boolean;
	isFollowed: boolean;
	hasPendingFollowRequestFromYou: boolean;
	isBlocking: boolean;
	isBlocked: boolean;
	isMuted: boolean;
}

// 閲覧者のサーバーに userIds バッチで 1 往復（DB 直読みで再同期しない）
async function fetchDetailed(
	deps: PeopleDeps,
	viewer: Viewer,
	ids: string[]
): Promise<Map<string, Detailed>> {
	const out = new Map<string, Detailed>();
	for (let i = 0; i < ids.length; i += 100) {
		const chunk = ids.slice(i, i + 100);
		const users = (await deps.api(
			viewer.member.host,
			'users/show',
			{ userIds: chunk },
			viewer.token
		)) as Detailed[];
		for (const u of users) out.set(u.id, u);
	}
	return out;
}
const relationOf = (d: Detailed): Relation => ({
	isFollowing: d.isFollowing,
	isFollowed: d.isFollowed,
	hasPendingFollowRequestFromYou: d.hasPendingFollowRequestFromYou,
	isBlocking: d.isBlocking,
	isBlocked: d.isBlocked,
	isMuted: d.isMuted
});

async function followingOf(kv: MemberKv, members: Member[]): Promise<Record<string, string[]>> {
	const out: Record<string, string[]> = {};
	for (const m of members) {
		if (!m.followingPublic) continue;
		const raw = await kv.get(followingKey(m));
		if (raw) out[m.acct] = JSON.parse(raw) as string[];
	}
	return out;
}

const AFFINITY_CANDIDATES = 48; // 言葉で絞るとき Clef に渡す上限（3 バッチ。参加者数に依存しない）
const PEOPLE_INTENT_TTL_SECONDS = 60 * 60 * 24 * 7;

async function sha(text: string): Promise<string> {
	const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return [...new Uint8Array(d).slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function buildDeck(
	deps: PeopleDeps,
	viewer: Viewer,
	exclude: Set<string>, // いいね・よくないね済み（ブラウザから）
	turns: string[] = [] // 言葉で絞る（空なら並び順だけ）
): Promise<{ cards: Card[]; count: number; refused: boolean }> {
	const me = viewer.member;
	const all = (await listMembers(deps.kv)).filter((m) => !m.hidden);
	const candidates = all.filter((m) => m.acct !== me.acct && !exclude.has(m.acct));
	const ids = await resolveIds(
		deps,
		viewer,
		candidates.map((m) => m.acct)
	);
	const detailed = await fetchDetailed(deps, viewer, [...ids.values()]);
	const relations: Record<string, Relation> = {};
	for (const m of candidates) {
		const id = ids.get(m.acct);
		const d = id ? detailed.get(id) : undefined;
		if (d) relations[m.acct] = relationOf(d);
	}
	const resolved = candidates.filter((m) => relations[m.acct]);
	const following = await followingOf(deps.kv, [me, ...resolved]);
	let ranked = rankCandidates(me, resolved, relations, following);
	let refused = false;
	if (turns.length > 0 && ranked.length > 0) {
		// 上位 48 人だけ Clef に渡し、噛み合いの高い順に並べ直す。同じ言葉と候補なら 7 日は使い回す
		const top = ranked.slice(0, AFFINITY_CANDIDATES);
		const people: PersonState[] = top.map(({ member: m }) => {
			const d = detailed.get(ids.get(m.acct) as string) as Detailed;
			return {
				acct: m.acct,
				name: m.name,
				description: cleanNoteText(d.description ?? ''),
				pinned: (d.pinnedNotes ?? [])
					.map((n) => cleanNoteText(n.text ?? ''))
					.filter((t) => t.length > 0),
				chips: m.chips,
				topics: m.estimate?.genre ?? {}
			};
		});
		const key = `intent:people:v1:${await sha(turns.join('\n'))}:${await sha(top.map((r) => `${r.member.acct}:${r.member.estimate?.at ?? 0}`).join(','))}`;
		let result: { refused: boolean; affinity: Record<string, number> } | null = null;
		const cached = await deps.kv.get(key);
		if (cached) result = JSON.parse(cached) as typeof result;
		if (!result) {
			const { outputs, failed } = await runAffinity(
				deps.runner,
				buildPeopleAffinityRequests(turns, people)
			);
			result = parsePeopleAffinity(
				outputs,
				people.map((p) => p.acct)
			);
			if (failed === 0)
				await deps.kv.put(key, JSON.stringify(result), {
					expirationTtl: PEOPLE_INTENT_TTL_SECONDS
				});
		}
		refused = result.refused;
		if (!refused) {
			const aff = result.affinity;
			ranked = [...top].sort((a, b) => (aff[b.member.acct] ?? 0) - (aff[a.member.acct] ?? 0));
		}
	}
	const picked = refused ? [] : diversify(ranked, (r) => r.member.host, rationSize(all.length), 4);
	const cards: Card[] = picked.map(({ member: m, badges }) => {
		const d = detailed.get(ids.get(m.acct) as string) as Detailed;
		return {
			acct: m.acct,
			host: m.host,
			username: m.username,
			name: m.name,
			avatarUrl: avatarUrlOf(m.host, m.username),
			chips: m.chips,
			badges,
			description: cleanNoteText(d.description ?? ''),
			fields: (d.fields ?? []).slice(0, 4),
			pinned: (d.pinnedNotes ?? [])
				.map((n) => cleanNoteText(n.text ?? ''))
				.filter((t) => t.length > 0)
				.slice(0, 2),
			noteIds: m.profileOnly ? [] : m.noteIds,
			profileOnly: m.profileOnly,
			isLocked: d.isLocked
		};
	});
	return { cards, count: all.length, refused };
}

// 代表ノートは相手本人のトークンで相手のサーバーから（未認証で見せないサーバーでも取れる）
export async function representativeNotes(
	deps: PeopleDeps,
	member: Member
): Promise<{ id: string; text: string; createdAt: string; reactions: number; url: string }[]> {
	if (member.profileOnly || member.noteIds.length === 0) return [];
	const token = await readMemberToken(deps, member.host, member.userId);
	if (!token) return [];
	const out = [];
	for (const id of member.noteIds) {
		try {
			const n = (await deps.api(member.host, 'notes/show', { noteId: id }, token)) as {
				id: string;
				text: string | null;
				createdAt: string;
				reactions: Record<string, number>;
			};
			out.push({
				id: n.id,
				text: cleanNoteText(n.text ?? ''),
				createdAt: n.createdAt,
				reactions: Object.values(n.reactions ?? {}).reduce((s, v) => s + v, 0),
				url: `https://${member.host}/notes/${n.id}`
			});
		} catch (e) {
			console.error('[people] note', member.acct, id, (e as Error).message); // 消えたノートは飛ばす
		}
	}
	return out;
}

async function findMember(kv: MemberKv, acct: string): Promise<Member | null> {
	const [username, host] = acct.split('@');
	const members = await listMembers(kv, `member:v1:${host}:`);
	return members.find((m) => m.username.toLowerCase() === username) ?? null;
}

export type FollowResult =
	| { ok: true; pending: boolean }
	| { ok: false; reason: 'cooldown' | 'rate' | 'blocked' | 'unknown' | 'failed' };

export async function followAcct(
	deps: PeopleDeps,
	viewer: Viewer,
	acct: string
): Promise<FollowResult> {
	const now = (deps.now ?? Date.now)();
	const me = viewer.member;
	const cooldown = `follow:v1:${me.acct}:${acct}`;
	if (await deps.kv.get(cooldown)) return { ok: false, reason: 'cooldown' };
	const rateKey = `followrate:v1:${me.acct}:${hourOf(now)}`;
	const used = Number(await deps.kv.get(rateKey)) || 0;
	if (used >= FOLLOWS_PER_HOUR) return { ok: false, reason: 'rate' };
	const target = await findMember(deps.kv, acct);
	if (!target) return { ok: false, reason: 'unknown' };
	const ids = await resolveIds(deps, viewer, [acct]);
	const id = ids.get(acct);
	if (!id) return { ok: false, reason: 'failed' };
	const [d] = [...(await fetchDetailed(deps, viewer, [id])).values()];
	try {
		await deps.api(me.host, 'following/create', { userId: id }, viewer.token);
	} catch (e) {
		const code = (e as { code?: string }).code ?? (e as Error).message;
		if (code === 'BLOCKED' || (e as MisskeyApiError).code === 'BLOCKED')
			return { ok: false, reason: 'blocked' };
		return { ok: false, reason: 'failed' };
	}
	await Promise.all([
		deps.kv.put(cooldown, String(now), { expirationTtl: FOLLOW_COOLDOWN_SECONDS }),
		deps.kv.put(rateKey, String(used + 1), { expirationTtl: 60 * 60 * 2 })
	]);
	return { ok: true, pending: d?.isLocked === true };
}

// 取り消しは 1 分以内だけ。鍵アカ（リクエスト中）は requests/cancel、成立済みは following/delete
export async function unfollowAcct(
	deps: PeopleDeps,
	viewer: Viewer,
	acct: string
): Promise<{ ok: true } | { ok: false; reason: 'too-late' | 'failed' }> {
	const now = (deps.now ?? Date.now)();
	const me = viewer.member;
	const at = Number(await deps.kv.get(`follow:v1:${me.acct}:${acct}`));
	if (!at || now - at > UNDO_WINDOW_MS) return { ok: false, reason: 'too-late' };
	const id = (await resolveIds(deps, viewer, [acct])).get(acct);
	if (!id) return { ok: false, reason: 'failed' };
	const [d] = [...(await fetchDetailed(deps, viewer, [id])).values()];
	try {
		const endpoint =
			d?.hasPendingFollowRequestFromYou || d?.isLocked
				? 'following/requests/cancel'
				: 'following/delete';
		await deps.api(me.host, endpoint, { userId: id }, viewer.token);
	} catch {
		return { ok: false, reason: 'failed' };
	}
	await deps.kv.delete(`follow:v1:${me.acct}:${acct}`);
	return { ok: true };
}

// いいね一覧に出す関係（未フォロー / リクエスト送信済み / フォロー中 / 相互）
export async function relationsFor(
	deps: PeopleDeps,
	viewer: Viewer,
	accts: string[]
): Promise<Record<string, Relation>> {
	const ids = await resolveIds(deps, viewer, accts);
	const detailed = await fetchDetailed(deps, viewer, [...ids.values()]);
	const out: Record<string, Relation> = {};
	for (const acct of accts) {
		const d = ids.get(acct) ? detailed.get(ids.get(acct) as string) : undefined;
		if (d) out[acct] = relationOf(d);
	}
	return out;
}

// マッチ = 参加者 ∩ 自分のフォロー一覧（1 日キャッシュ）∩ 自分のフォロワー一覧（本人のトークンで常に見える）
export async function matchesFor(deps: PeopleDeps, viewer: Viewer): Promise<Member[]> {
	const me = viewer.member;
	const following = JSON.parse((await deps.kv.get(followingKey(me))) ?? '[]') as string[];
	const followers: string[] = [];
	let untilId: string | undefined;
	while (followers.length < MAX_FOLLOWERS) {
		const page = (await deps.api(
			me.host,
			'users/followers',
			{ userId: me.userId, limit: 100, ...(untilId ? { untilId } : {}) },
			viewer.token
		)) as { id: string; follower: { username: string; host: string | null } }[];
		if (page.length === 0) break;
		for (const f of page)
			followers.push(
				`${f.follower.username.toLowerCase()}@${(f.follower.host ?? me.host).toLowerCase()}`
			);
		untilId = page[page.length - 1].id;
		if (page.length < 100) break;
	}
	const members = (await listMembers(deps.kv)).filter((m) => m.acct !== me.acct);
	return matchesOf(members, following, followers);
}

export type ReportKind = 'seeking' | 'ads' | 'impersonation' | 'others-info';

// 通報。非表示の発動は「別ホストの通報者 2 人以上」か「参加 7 日以上の通報者 1 人」
export async function report(
	deps: PeopleDeps,
	reporter: Member,
	acct: string,
	kind: ReportKind
): Promise<
	{ ok: true; hidden: boolean } | { ok: false; reason: 'rate' | 'duplicate' | 'unknown' }
> {
	const now = (deps.now ?? Date.now)();
	const rateKey = `reportrate:v1:${reporter.acct}:${dateOf(now)}`;
	const hostRateKey = `reportrate:v1:host:${reporter.host}:${dateOf(now)}`;
	if ((Number(await deps.kv.get(rateKey)) || 0) >= REPORTS_PER_DAY)
		return { ok: false, reason: 'rate' };
	if ((Number(await deps.kv.get(hostRateKey)) || 0) >= REPORTS_PER_DAY)
		return { ok: false, reason: 'rate' };
	const target = await findMember(deps.kv, acct);
	if (!target) return { ok: false, reason: 'unknown' };
	const prefix = `report:v1:${target.host}:${target.userId}:`;
	const existing = await listMembers(deps.kv, prefix).catch(() => []);
	const reports = (
		await Promise.all((await deps.kv.list({ prefix })).keys.map((k) => deps.kv.get(k.name)))
	)
		.filter((r): r is string => !!r)
		.map(
			(r) =>
				JSON.parse(r) as {
					reporter: string;
					reporterHost: string;
					reporterJoinedAt: number;
					kind: string;
					at: number;
				}
		);
	void existing;
	if (reports.some((r) => r.reporter === reporter.acct)) return { ok: false, reason: 'duplicate' };
	const entry = {
		reporter: reporter.acct,
		reporterHost: reporter.host,
		reporterJoinedAt: reporter.joinedAt,
		kind,
		at: now
	};
	await Promise.all([
		deps.kv.put(`${prefix}${now}:${reporter.acct}`, JSON.stringify(entry)),
		deps.kv.put(rateKey, String((Number(await deps.kv.get(rateKey)) || 0) + 1), {
			expirationTtl: 60 * 60 * 48
		}),
		deps.kv.put(hostRateKey, String((Number(await deps.kv.get(hostRateKey)) || 0) + 1), {
			expirationTtl: 60 * 60 * 48
		})
	]);
	const all = [...reports, entry];
	const hosts = new Set(all.map((r) => r.reporterHost));
	const senior = all.some((r) => now - r.reporterJoinedAt >= REPORTER_SENIORITY_MS);
	const hide = hosts.size >= 2 || senior;
	if (hide && !target.hidden) {
		await updateMember(deps.kv, {
			...target,
			hidden: { kind: 'report' as HiddenKind, noteIds: [], at: now }
		});
	}
	return { ok: true, hidden: hide };
}
