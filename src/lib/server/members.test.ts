import { describe, expect, it, vi } from 'vitest';
import { mkServer } from '$lib/fixtures.test-helper';
import type { MisskeyNote } from '$lib/people';
import type { ClefAnswer, ClefInput, ClefOutput } from '$lib/vibe';
import { keyFromSecret } from './crypto';
import {
	countMembers,
	joinMember,
	leaveMember,
	listMembers,
	type MemberKv,
	type PeopleDeps,
	readMember,
	readMemberToken,
	refreshMembers
} from './members';

const day = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 9, 28);

function memKv(): MemberKv & { store: Map<string, string> } {
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
const note = (i: number, over: Partial<MisskeyNote> = {}): MisskeyNote => ({
	id: `n${i}`,
	createdAt: new Date(now - i * day).toISOString(),
	text: `ノート ${i}: ジャズの新譜を聴きながらカレーを煮込んでいる夜の記録`,
	cw: null,
	visibility: 'public',
	localOnly: false,
	renoteId: null,
	renote: null,
	replyId: i % 2 ? 'r' : null,
	fileIds: [],
	reactions: { '👍': 20 - i },
	...over
});
const self = {
	id: 'u1',
	username: 'taka',
	name: 'たか',
	createdAt: new Date(now - 100 * day).toISOString(),
	birthday: null,
	followingVisibility: 'public',
	preventAiLearning: true,
	description: 'ジャズと料理',
	fields: [],
	pinnedNotes: [{ text: '固定' }],
	isLocked: false
};
// Clef: 話題は food が高い、募集は無し（上書き可能）
function clef(over: Record<string, number> = {}) {
	return vi.fn(async (input: ClefInput): Promise<ClefOutput> => {
		const answers: Record<string, ClefAnswer> = {};
		for (const id of Object.keys(input.questions)) {
			const v = over[id] ?? (id === 'genre.food' ? 0.9 : id.startsWith('genre.') ? 0.2 : 0.05);
			answers[id] = { type: 'noul', noul: v };
		}
		return { model: 'clef', answers, usage: { input_tokens: 1, output_tokens: 0 } };
	});
}
function api(notes = Array.from({ length: 15 }, (_, i) => note(i)), selfOver = {}) {
	return vi.fn(async (host: string, endpoint: string, body: Record<string, unknown>) => {
		if (endpoint === 'i') return { ...self, ...selfOver };
		if (endpoint === 'users/notes') return notes;
		if (endpoint === 'users/following') {
			if (body.untilId) return [];
			return [
				{ id: 'f1', followee: { username: 'Alice', host: 'a.tld' } },
				{ id: 'f2', followee: { username: 'bob', host: null } } // 同じサーバーの人（host は null）
			];
		}
		throw new Error(`unexpected ${endpoint} on ${host}`);
	});
}
async function deps(over: Partial<PeopleDeps> = {}): Promise<PeopleDeps> {
	return {
		kv: memKv(),
		api: api(),
		runner: clef(),
		servers: [mkServer({ host: 'misskey.io', dru15: 1000 })],
		tokenKey: await keyFromSecret('0123456789abcdef0123456789abcdef'),
		now: () => now,
		...over
	};
}
const session = {
	user: { host: 'misskey.io', id: 'u1', username: 'taka', name: 'たか', avatarUrl: 'x' },
	token: 'tok-1'
};
const input = { chips: ['food' as const], profileOnly: false };

describe('joinMember', () => {
	it('条件を満たせば、推定・代表ノート・フォロー一覧・暗号化したトークンを置いて参加する', async () => {
		const d = await deps();
		const r = await joinMember(d, session, input);
		expect(r.ok).toBe(true);
		const m = await readMember(d.kv, 'misskey.io', 'u1');
		expect(m?.acct).toBe('taka@misskey.io');
		expect(m?.chips).toEqual(['food']);
		expect(m?.estimate?.genre.food).toBe(0.9);
		expect(m?.estimate?.sampleCount).toBe(15);
		expect(m?.noteIds).toEqual(['n0', 'n1', 'n2']); // 反応の多い順
		expect(m?.followingPublic).toBe(true);
		expect(m?.hidden).toBeNull();
		expect(
			JSON.parse((d.kv as ReturnType<typeof memKv>).store.get('following:v1:misskey.io:u1') ?? '[]')
		).toEqual(['alice@a.tld', 'bob@misskey.io']);
		expect(await readMemberToken(d, 'misskey.io', 'u1')).toBe('tok-1');
		expect(
			(d.kv as ReturnType<typeof memKv>).store.get('membertoken:v1:misskey.io:u1')
		).not.toContain('tok-1');
		expect(await countMembers(d.kv)).toBe(1);
	});
	it('公開ノートが 10 件未満なら参加できない', async () => {
		const d = await deps({ api: api(Array.from({ length: 9 }, (_, i) => note(i))) });
		expect(await joinMember(d, session, input)).toEqual({ ok: false, reason: 'notes' });
		expect(await countMembers(d.kv)).toBe(0);
	});
	it('home 可視性や CW のノートは数えない', async () => {
		const notes = [
			...Array.from({ length: 8 }, (_, i) => note(i)),
			note(20, { visibility: 'home' }),
			note(21, { cw: 'x' }),
			note(22, { localOnly: true })
		];
		const d = await deps({ api: api(notes) });
		expect(await joinMember(d, session, input)).toEqual({ ok: false, reason: 'notes' });
	});
	it('bio に募集の表明があれば参加できず、ノート 1 件なら警告付きで参加する', async () => {
		const bio = await deps({ runner: clef({ 'seeking.bio': 0.9 }) });
		expect(await joinMember(bio, session, input)).toEqual({
			ok: false,
			reason: 'seeking',
			noteIds: []
		});
		const one = await deps({ runner: clef({ 'seeking.n3': 0.9 }) });
		const r = await joinMember(one, session, input);
		expect(r).toEqual({ ok: true, warning: ['n3'] });
		expect((await readMember(one.kv, 'misskey.io', 'u1'))?.warning?.noteIds).toEqual(['n3']);
	});
	it('サーバーごとの上限と全体の上限', async () => {
		const d = await deps({ servers: [mkServer({ host: 'misskey.io', dru15: 10 })] }); // 上限 5
		for (let i = 0; i < 5; i++) {
			await d.kv.put(
				`member:v1:misskey.io:x${i}`,
				JSON.stringify({ host: 'misskey.io', userId: `x${i}` })
			);
		}
		expect(await joinMember(d, session, input)).toEqual({ ok: false, reason: 'server-cap' });
	});
	it('followingVisibility が public でなければフォロー一覧を取らない', async () => {
		const d = await deps({ api: api(undefined, { followingVisibility: 'followers' }) });
		await joinMember(d, session, input);
		expect((await readMember(d.kv, 'misskey.io', 'u1'))?.followingPublic).toBe(false);
		expect((d.kv as ReturnType<typeof memKv>).store.has('following:v1:misskey.io:u1')).toBe(false);
	});
	it('利用停止中は参加できない', async () => {
		const d = await deps();
		await d.kv.put('ban:v1:misskey.io:u1', '1');
		expect(await joinMember(d, session, input)).toEqual({ ok: false, reason: 'banned' });
	});
});

describe('leaveMember / listMembers', () => {
	it('やめると記録・フォロー一覧・トークンが消える', async () => {
		const d = await deps();
		await joinMember(d, session, input);
		await leaveMember(d.kv, 'misskey.io', 'u1');
		expect(await readMember(d.kv, 'misskey.io', 'u1')).toBeNull();
		const store = (d.kv as ReturnType<typeof memKv>).store;
		expect([...store.keys()].filter((k) => k.includes('misskey.io:u1'))).toEqual([]);
		expect(await listMembers(d.kv)).toEqual([]);
	});
});

describe('refreshMembers', () => {
	it('推定が 7 日より古い人だけ読み直し、枠が無ければ止める', async () => {
		const d = await deps();
		await joinMember(d, session, input);
		const calls = (d.runner as ReturnType<typeof clef>).mock.calls.length;
		expect(await refreshMembers(d)).toEqual({ refreshed: 0, removed: 0 });
		const later = { ...d, now: () => now + 8 * day };
		expect(await refreshMembers(later)).toEqual({ refreshed: 1, removed: 0 });
		expect((d.runner as ReturnType<typeof clef>).mock.calls.length).toBe(calls + 1);
		expect((await readMember(d.kv, 'misskey.io', 'u1'))?.estimate?.at).toBe(now + 8 * day);
	});
	it('連携が解除されていれば（i が 401）参加を解く', async () => {
		const d = await deps();
		await joinMember(d, session, input);
		const gone = vi.fn(async (_h: string, endpoint: string) => {
			if (endpoint === 'i') throw Object.assign(new Error('401'), { status: 401 });
			return [];
		});
		expect(await refreshMembers({ ...d, api: gone, now: () => now + 8 * day })).toEqual({
			refreshed: 0,
			removed: 1
		});
		expect(await readMember(d.kv, 'misskey.io', 'u1')).toBeNull();
	});
});
