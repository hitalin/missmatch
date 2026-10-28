import { describe, expect, it, vi } from 'vitest';
import type { Member } from '$lib/people';
import { keyFromSecret } from './crypto';
import {
	buildDeck,
	cardFor,
	followAcct,
	matchesFor,
	relationsFor,
	report,
	unfollowAcct
} from './deck';
import type { PeopleDeps } from './members';

const now = Date.UTC(2026, 9, 28, 12);
const day = 24 * 60 * 60 * 1000;
function memKv() {
	const store = new Map<string, string>();
	return {
		store,
		get: async (k: string) => store.get(k) ?? null,
		put: async (k: string, v: string) => {
			store.set(k, v);
		},
		delete: async (k: string) => {
			store.delete(k);
		},
		list: async ({ prefix }: { prefix: string }) => ({
			keys: [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })),
			list_complete: true
		})
	};
}
const genre = Object.fromEntries(
	[
		'general',
		'diary',
		'illust',
		'writing',
		'music',
		'making',
		'tech',
		'game',
		'anime',
		'fandom',
		'vr',
		'food',
		'animal',
		'vent',
		'niche'
	].map((g) => [g, 0])
) as Member['estimate'] extends infer E ? (E extends { genre: infer G } ? G : never) : never;
const member = (username: string, host: string, over: Partial<Member> = {}): Member => ({
	version: 1,
	host,
	userId: `id-${username}`,
	username,
	name: username,
	acct: `${username}@${host}`,
	joinedAt: now - 10 * day,
	chips: [],
	profileOnly: false,
	followingPublic: true,
	noteIds: ['n1', 'n2'],
	estimate: { genre, replyRatio: 0, notesPerDay: 1, sampleCount: 10, hash: 'h', at: now },
	warning: null,
	hidden: null,
	...over
});
// 閲覧者 me@x のサーバー x に、相手を username+host で解決すると id が `x:<acct>` になる世界
function api(opts: { followed?: string[]; followers?: string[]; blocked?: string[] } = {}) {
	return vi.fn(async (host: string, endpoint: string, body: Record<string, unknown>) => {
		if (endpoint === 'users/show' && body.username)
			return { id: `x:${body.username}@${body.host ?? host}` };
		if (endpoint === 'users/show' && Array.isArray(body.userIds)) {
			return (body.userIds as string[]).map((id) => {
				const acct = id.slice(2);
				return {
					id,
					username: acct.split('@')[0],
					host: acct.split('@')[1],
					description: `bio of ${acct.split('@')[0]}`,
					fields: [],
					pinnedNotes: [{ text: 'pinned' }],
					isLocked: acct.startsWith('locked'),
					isFollowing: false,
					isFollowed: (opts.followed ?? []).includes(acct),
					hasPendingFollowRequestFromYou: false,
					isBlocking: false,
					isBlocked: (opts.blocked ?? []).includes(acct),
					isMuted: false
				};
			});
		}
		if (endpoint === 'users/followers') {
			if (body.untilId) return [];
			return (opts.followers ?? []).map((acct, i) => ({
				id: `f${i}`,
				follower: { username: acct.split('@')[0], host: acct.split('@')[1] }
			}));
		}
		if (endpoint === 'following/create') {
			if ((opts.blocked ?? []).some((a) => `x:${a}` === body.userId))
				throw Object.assign(new Error('BLOCKED'), { status: 400, code: 'BLOCKED' });
			return {};
		}
		if (endpoint === 'following/delete' || endpoint === 'following/requests/cancel') return {};
		if (endpoint === 'notes/show')
			return {
				id: body.noteId,
				text: `本文 ${body.noteId}`,
				createdAt: new Date(now).toISOString(),
				reactions: { '👍': 2 }
			};
		throw new Error(`unexpected ${endpoint}`);
	});
}
async function deps(over: Partial<PeopleDeps> = {}): Promise<PeopleDeps> {
	return {
		kv: memKv(),
		api: api(),
		runner: vi.fn(),
		servers: [],
		tokenKey: await keyFromSecret('k'),
		now: () => now,
		...over
	};
}
async function seed(d: PeopleDeps, members: Member[]) {
	for (const m of members) {
		await d.kv.put(`member:v1:${m.host}:${m.userId}`, JSON.stringify(m));
		if (m.followingPublic)
			await d.kv.put(
				`following:v1:${m.host}:${m.userId}`,
				JSON.stringify([`p@q`, `${m.username}only@q`])
			);
	}
}
const me = member('me', 'x');
const viewer = { member: me, token: 'tok' };

describe('buildDeck', () => {
	it('相手を本人のサーバーで解決し、関係と bio を 1 往復で取り、並べて配給分だけ返す', async () => {
		const d = await deps({ api: api({ followed: ['fan@y'] }) });
		await seed(d, [
			me,
			member('fan', 'y'),
			member('a', 'y'),
			member('b', 'z'),
			member('hid', 'z', { hidden: { kind: 'report', noteIds: [], at: now } })
		]);
		const deck = await buildDeck(d, viewer, new Set());
		expect(deck.cards.map((c) => c.acct)).toEqual(['fan@y', 'a@y', 'b@z']); // フォローしてくれている人が先頭
		expect(deck.cards[0].badges).toEqual({ followsYou: true, common: 1, sameHost: false });
		expect(deck.cards[0].description).toBe('bio of fan');
		expect(deck.count).toBe(4);
		// 解決した id はキャッシュされ、2 回目は username+host の往復が無い
		const calls = (d.api as ReturnType<typeof api>).mock.calls.filter(
			([, ep, b]) => ep === 'users/show' && b.username
		).length;
		await buildDeck(d, viewer, new Set());
		expect(
			(d.api as ReturnType<typeof api>).mock.calls.filter(
				([, ep, b]) => ep === 'users/show' && b.username
			).length
		).toBe(calls);
	});
	it('いいね・よくないね済みと、ブロック関係は出さない', async () => {
		const d = await deps({ api: api({ blocked: ['b@z'] }) });
		await seed(d, [me, member('a', 'y'), member('b', 'z'), member('c', 'z')]);
		const deck = await buildDeck(d, viewer, new Set(['a@y']));
		expect(deck.cards.map((c) => c.acct)).toEqual(['c@z']);
	});
});

describe('followAcct / unfollowAcct', () => {
	it('フォローし、同じ相手は 24 時間に 1 回。1 分以内なら取り消せる', async () => {
		const d = await deps();
		await seed(d, [me, member('a', 'y')]);
		expect(await followAcct(d, viewer, 'a@y')).toEqual({ ok: true, pending: false });
		expect(await followAcct(d, viewer, 'a@y')).toEqual({ ok: false, reason: 'cooldown' });
		expect(await unfollowAcct(d, viewer, 'a@y')).toEqual({ ok: true });
		expect(await unfollowAcct({ ...d, now: () => now + 2 * 60 * 1000 }, viewer, 'a@y')).toEqual({
			ok: false,
			reason: 'too-late'
		});
	});
	it('鍵アカはリクエストになり、取り消しは requests/cancel', async () => {
		const d = await deps();
		await seed(d, [me, member('locked', 'y')]);
		expect(await followAcct(d, viewer, 'locked@y')).toEqual({ ok: true, pending: true });
		await unfollowAcct(d, viewer, 'locked@y');
		expect(
			(d.api as ReturnType<typeof api>).mock.calls.some(
				([, ep]) => ep === 'following/requests/cancel'
			)
		).toBe(true);
	});
	it('相手にブロックされていれば blocked', async () => {
		const d = await deps({ api: api({ blocked: ['b@z'] }) });
		await seed(d, [me, member('b', 'z')]);
		expect(await followAcct(d, viewer, 'b@z')).toEqual({ ok: false, reason: 'blocked' });
	});
	it('1 時間に 30 回まで', async () => {
		const d = await deps();
		const others = Array.from({ length: 31 }, (_, i) => member(`u${i}`, 'y'));
		await seed(d, [me, ...others]);
		for (let i = 0; i < 30; i++) expect((await followAcct(d, viewer, `u${i}@y`)).ok).toBe(true);
		expect(await followAcct(d, viewer, 'u30@y')).toEqual({ ok: false, reason: 'rate' });
	});
});

describe('matchesFor / relationsFor', () => {
	it('マッチ = 参加者 ∩ 自分のフォロー ∩ 自分のフォロワー', async () => {
		const d = await deps({ api: api({ followers: ['a@y', 'c@z'] }) });
		await seed(d, [member('me', 'x'), member('a', 'y'), member('b', 'z'), member('c', 'z')]);
		await d.kv.put('following:v1:x:id-me', JSON.stringify(['a@y', 'b@z']));
		const m = await matchesFor(d, viewer);
		expect(m.map((x) => x.acct)).toEqual(['a@y']);
	});
	it('いいね一覧の詳細: 1 人分のカードと関係を閲覧者のサーバーから取る。非参加者と非表示は null', async () => {
		const d = await deps({ api: api({ followed: ['a@y'] }) });
		await seed(d, [
			me,
			member('a', 'y'),
			member('h', 'z', { hidden: { kind: 'report', noteIds: [], at: now } })
		]);
		const r = await cardFor(d, viewer, 'a@y');
		expect(r?.card.description).toBe('bio of a');
		expect(r?.card.badges.followsYou).toBe(true);
		expect(r?.relation.isFollowed).toBe(true);
		expect(await cardFor(d, viewer, 'nobody@y')).toBeNull();
		expect(await cardFor(d, viewer, 'h@z')).toBeNull();
	});
	it('いいね一覧の状態', async () => {
		const d = await deps({ api: api({ followed: ['a@y'] }) });
		await seed(d, [me, member('a', 'y'), member('b', 'z')]);
		const r = await relationsFor(d, viewer, ['a@y', 'b@z']);
		expect(r['a@y'].isFollowed).toBe(true);
		expect(r['b@z'].isFollowed).toBe(false);
	});
});

describe('report', () => {
	it('別ホストの 2 人の通報で非表示、1 人なら保留。1 人 1 日 10 件まで', async () => {
		const d = await deps();
		const r1 = member('r1', 'x', { joinedAt: now - 1 * day });
		const r2 = member('r2', 'y', { joinedAt: now - 1 * day });
		const target = member('t', 'z');
		await seed(d, [r1, r2, target]);
		expect(await report(d, r1, 't@z', 'ads')).toEqual({ ok: true, hidden: false });
		expect(await report(d, r1, 't@z', 'ads')).toEqual({ ok: false, reason: 'duplicate' });
		expect(await report(d, r2, 't@z', 'ads')).toEqual({ ok: true, hidden: true });
		const t = JSON.parse(
			(d.kv as ReturnType<typeof memKv>).store.get('member:v1:z:id-t') ?? '{}'
		) as Member;
		expect(t.hidden?.kind).toBe('report');
	});
	it('参加 7 日以上の通報者なら 1 人で非表示', async () => {
		const d = await deps();
		const old = member('old', 'x', { joinedAt: now - 8 * day });
		const target = member('t', 'z');
		await seed(d, [old, target]);
		expect(await report(d, old, 't@z', 'seeking')).toEqual({ ok: true, hidden: true });
	});
});
