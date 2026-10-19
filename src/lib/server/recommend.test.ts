import { describe, expect, it, vi } from 'vitest';
import { mkServer, mkVibe } from '$lib/fixtures.test-helper';
import type { ServerInfo } from '$lib/types';
import type { ClefAnswer, ClefInput, ClefOutput, VibeKv } from '$lib/vibe';
import { VIBE_VERSION, vibeKey } from '$lib/vibe';
import { loadProfiles, readIntent } from './recommend';

// joinmisskey へ取りに行かないよう、サーバー一覧はキャッシュ済みにしておく
function kvWith(entries: Record<string, string>, bulk = true): VibeKv & { reads: number } {
	const store = new Map(Object.entries(entries));
	const kv: VibeKv & { reads: number } = {
		reads: 0,
		get: async (key) => {
			kv.reads++;
			return store.get(key) ?? null;
		},
		put: async (key, value) => {
			store.set(key, value);
		},
		list: async () => ({ keys: [], list_complete: true })
	};
	if (bulk) {
		kv.getMany = async (keys) => {
			kv.reads++;
			return new Map(keys.map((k) => [k, store.get(k) ?? null]));
		};
	}
	return kv;
}

// LTL を公開していないことにして、欠けの計算がネットワークに出ないようにする
const servers = Array.from({ length: 3 }, (_, i) =>
	mkServer({ host: `s${i}.tld`, ltlAvailable: false })
);
const failed = (host: string) => JSON.stringify({ version: VIBE_VERSION, host, failed: true });
const listed = (list: ServerInfo[], fetchedAt = Date.now()) =>
	JSON.stringify({ fetchedAt, servers: list });
const HOUR = 60 * 60 * 1000;
// どの質問にも中庸な答えを返す Clef（雰囲気も読み取りも噛み合いもこれで通る）
function answerAll(input: ClefInput): ClefOutput {
	const answers: Record<string, ClefAnswer> = {};
	for (const [id, q] of Object.entries(input.questions)) {
		if (q.type === 'noul') answers[id] = { type: 'noul', noul: 0.8 };
		else if (q.type === 'score')
			answers[id] = { type: 'score', score: 1, legend: {}, probabilities: {}, confidence: 1 };
		else
			answers[id] = {
				type: 'choice',
				choice: Object.keys(q.criteria)[0],
				probabilities: {},
				confidence: 1
			};
	}
	return { model: 'clef', answers, usage: { input_tokens: 1, output_tokens: 0 } };
}
// s0 は判定済み、s1 と s2 は欠け
const withMissing = {
	'servers:v8': listed(servers),
	[vibeKey('s0.tld')]: JSON.stringify(mkVibe({ version: VIBE_VERSION, host: 's0.tld' }))
};
// 欠けなし（s1 と s2 は最近失敗したので再試行しない）
const base = {
	...withMissing,
	[vibeKey('s1.tld')]: failed('s1.tld'),
	[vibeKey('s2.tld')]: failed('s2.tld')
};

describe('loadProfiles', () => {
	it('KV は一括読みでまとめ、雰囲気を付ける', async () => {
		const kv = kvWith(base);
		const { profiles } = await loadProfiles({ kv, runner: null });
		expect(profiles.map((p) => p.server.host)).toEqual(['s0.tld', 's1.tld', 's2.tld']);
		expect(profiles[0].vibe?.host).toBe('s0.tld');
		expect(profiles[1].vibe).toBeNull();
		// 一覧 1 + 属性表キャッシュ 1 + 雰囲気の一括 1
		expect(kv.reads).toBe(3);
	});

	it('一括読みが無い KV でも 1 件ずつ読んで同じ結果になる', async () => {
		const kv = kvWith(base, false);
		const { profiles } = await loadProfiles({ kv, runner: null });
		expect(profiles[0].vibe?.host).toBe('s0.tld');
	});

	it('defer があれば欠けの計算を待たずに返し、pendingCount に数える', async () => {
		const kv = kvWith(withMissing);
		const runner = vi.fn(() => new Promise<ClefOutput>(() => {})); // 終わらない
		const deferred: Promise<unknown>[] = [];
		const { profiles, pendingCount } = await loadProfiles(
			{ kv, runner },
			(w) => deferred.push(w),
			'open'
		);
		expect(profiles).toHaveLength(3);
		expect(pendingCount).toBe(2);
		expect(deferred).toHaveLength(1);
	});

	it('欠けがあっても属性表は置き、欠けの計算が終わったら置き直す', async () => {
		const kv = kvWith(withMissing);
		const runner = vi.fn(async (input: ClefInput) => answerAll(input));
		const deferred: Promise<unknown>[] = [];
		await loadProfiles({ kv, runner }, (w) => deferred.push(w), 'open');
		const first = JSON.parse((await kv.get('profiles:v5:open')) ?? '{}');
		expect(first.profiles).toHaveLength(3);
		expect(first.profiles[1].vibe).toBeNull();
		await Promise.all(deferred);
		const second = JSON.parse((await kv.get('profiles:v5:open')) ?? '{}');
		expect(second.profiles[1].vibe?.host).toBe('s1.tld');
		expect(second.profiles[2].vibe?.host).toBe('s2.tld');
	});

	it('属性表が古ければそのまま返し、作り直しは defer に回す', async () => {
		const old = {
			builtAt: Date.now() - 10 * 60 * 1000,
			profiles: [{ server: servers[0], vibe: null }],
			totalCount: 1
		};
		const kv = kvWith({ ...base, 'profiles:v5:open': JSON.stringify(old) });
		const deferred: Promise<unknown>[] = [];
		const { profiles } = await loadProfiles({ kv, runner: null }, (w) => deferred.push(w), 'open');
		expect(profiles).toHaveLength(1); // 古いまま返す
		expect(deferred).toHaveLength(1);
		await Promise.all(deferred);
		const rebuilt = JSON.parse((await kv.get('profiles:v5:open')) ?? '{}');
		expect(rebuilt.profiles).toHaveLength(3);
		expect(rebuilt.builtAt).toBeGreaterThan(old.builtAt);
	});

	it('サーバー一覧が古ければそのまま使い、取り直しは defer に回す', async () => {
		const kv = kvWith({ ...base, 'servers:v8': listed(servers, Date.now() - 2 * HOUR) });
		const fetcher = vi.fn(async () => [
			...servers,
			mkServer({ host: 's3.tld', ltlAvailable: false })
		]);
		const deferred: Promise<unknown>[] = [];
		const { profiles } = await loadProfiles(
			{ kv, runner: null, fetcher },
			(w) => deferred.push(w),
			'open'
		);
		expect(profiles).toHaveLength(3);
		expect(fetcher).toHaveBeenCalledTimes(1);
		await Promise.all(deferred);
		expect(JSON.parse((await kv.get('servers:v8')) ?? '{}').servers).toHaveLength(4);
	});
});

describe('readIntent', () => {
	const output = answerAll;

	it('読み取りと噛み合いを返し、同じ言葉の 2 回目は KV のキャッシュから返す', async () => {
		const kv = kvWith(base);
		const runner = vi.fn(async (input: ClefInput) => output(input));
		const first = await readIntent({ kv, runner }, ['静かな場所'], 'open');
		expect(first.affinity).toEqual({ 's0.tld': 0.8, 's1.tld': 0.8, 's2.tld': 0.8 });
		expect(first.answers['topic.general']).toEqual({ type: 'noul', noul: 0.8 });
		const calls = runner.mock.calls.length;
		expect(calls).toBeGreaterThan(1);
		const second = await readIntent({ kv, runner }, ['静かな場所'], 'open');
		expect(second).toEqual(first);
		expect(runner.mock.calls.length).toBe(calls);
		// 言葉が違えば読み直す
		await readIntent({ kv, runner }, ['静かな場所', '小さめ'], 'open');
		expect(runner.mock.calls.length).toBeGreaterThan(calls);
	});

	it('fresh ならキャッシュを読まずに判定し直し、結果は置き直す', async () => {
		const kv = kvWith(base);
		const runner = vi.fn(async (input: ClefInput) => output(input));
		await readIntent({ kv, runner }, ['静かな場所'], 'open');
		const calls = runner.mock.calls.length;
		await readIntent({ kv, runner }, ['静かな場所'], 'open', undefined, { fresh: true });
		expect(runner.mock.calls.length).toBe(calls * 2);
		await readIntent({ kv, runner }, ['静かな場所'], 'open');
		expect(runner.mock.calls.length).toBe(calls * 2);
	});

	it('噛み合いのバッチが欠けたときはキャッシュに置かない', async () => {
		const kv = kvWith(base);
		const runner = vi.fn(async (input: ClefInput) => {
			if ('s0.tld' in input.questions) throw new Error('down');
			return output(input);
		});
		const first = await readIntent({ kv, runner }, ['静かな場所'], 'open');
		expect(first.affinity['s0.tld']).toBeUndefined(); // 割っても s0 を含む半分は失敗する
		expect(first.answers['topic.general']).toBeDefined();
		const calls = runner.mock.calls.length;
		await readIntent({ kv, runner }, ['静かな場所'], 'open');
		expect(runner.mock.calls.length).toBeGreaterThan(calls);
	});

	it('雰囲気の欠けは defer に回し、判定を待たせない', async () => {
		const kv = kvWith(withMissing);
		const runner = vi.fn(async (input: ClefInput) => {
			if ('genre.general' in input.questions) return new Promise<ClefOutput>(() => {});
			return output(input);
		});
		const deferred: Promise<unknown>[] = [];
		const result = await readIntent({ kv, runner }, ['静かな場所'], 'open', (w) =>
			deferred.push(w)
		);
		expect(Object.keys(result.affinity)).toHaveLength(3);
		expect(deferred).toHaveLength(1);
	});
});
