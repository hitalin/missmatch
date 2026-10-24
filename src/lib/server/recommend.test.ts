import { describe, expect, it, vi } from 'vitest';
import { EXAMPLES } from '$lib/examples';
import { mkServer, mkVibe } from '$lib/fixtures.test-helper';
import type { ServerInfo } from '$lib/types';
import type { ClefAnswer, ClefInput, ClefOutput, VibeKv } from '$lib/vibe';
import { VIBE_VERSION, vibeKey } from '$lib/vibe';
import { createBudget, meteredRunner } from './budget';
import { loadProfiles, readIntent, warmIntents } from './recommend';

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

	it('warmIntents はキャッシュの無い例文だけ判定し、ある例文は飛ばす', async () => {
		const kv = kvWith(base);
		const runner = vi.fn(async (input: ClefInput) => output(input));
		await readIntent({ kv, runner }, [EXAMPLES[0]], 'invite');
		const before = runner.mock.calls.length;
		const { warmed, skipped } = await warmIntents({ kv, runner });
		expect(warmed).toBe(EXAMPLES.length - 1);
		expect(skipped).toBe(1);
		// 例文 1 つにつき読み取り 1 本 + 噛み合い 1 バッチ（3 件）
		expect(runner.mock.calls.length - before).toBe((EXAMPLES.length - 1) * 2);
	});

	it('warmIntents は枠を使い切ったら残りを翌日に回す', async () => {
		const kv = kvWith(base);
		// 1 本で 100,000 トークン（約 2,182 Neurons）使う Clef。閾値 1 Neuron なので最初の例文で尽きる
		const runner = vi.fn(async (input: ClefInput) => ({
			...output(input),
			usage: { input_tokens: 100_000, output_tokens: 0 }
		}));
		const budget = createBudget(kv, () => Date.UTC(2026, 9, 24), 1);
		const { warmed } = await warmIntents({ kv, runner: meteredRunner(runner, budget), budget });
		expect(warmed).toBe(1);
		expect(runner.mock.calls.length).toBe(2); // 読み取り 1 本 + 噛み合い 1 バッチ。2 例文目は呼ばない
	});

	it('枠を使い切っていても、送った言葉は Clef で判定して返す（劣化させない）', async () => {
		const kv = kvWith({ ...base, 'ai:neurons:2026-10-24': '9000' });
		const runner = vi.fn(async (input: ClefInput) => output(input));
		const budget = createBudget(kv, () => Date.UTC(2026, 9, 24));
		const result = await readIntent(
			{ kv, runner: meteredRunner(runner, budget), budget },
			['静かな場所'],
			'open'
		);
		expect(Object.keys(result.affinity)).toHaveLength(3);
		expect(runner.mock.calls.length).toBeGreaterThan(1);
	});

	it('枠を使い切っていれば雰囲気の欠けは計算せず、失敗マーカーも置かない', async () => {
		const kv = kvWith({ ...withMissing, 'ai:neurons:2026-10-24': '9000' });
		const runner = vi.fn(async (input: ClefInput) => output(input));
		const budget = createBudget(kv, () => Date.UTC(2026, 9, 24));
		const deferred: Promise<unknown>[] = [];
		await loadProfiles(
			{ kv, runner: meteredRunner(runner, budget), budget },
			(w) => deferred.push(w),
			'open'
		);
		await Promise.all(deferred);
		expect(runner).not.toHaveBeenCalled();
		expect(await kv.get(vibeKey('s1.tld'))).toBeNull();
	});

	it('埋め込みがあれば、言葉に近い上位 K 件だけを Clef に渡し、外側は類似度順の 0.5 未満にする', async () => {
		const kv = kvWith(base);
		// s0 は言葉と同じ向き、s1 は直交、s2 は逆向き
		const vectors: Record<string, number[]> = { s0: [1, 0], s1: [0, 1], s2: [-1, 0] };
		const embedder = vi.fn(async (texts: string[]) =>
			texts.map((t) => {
				const m = t.match(/\((s\d)\.tld\)/);
				return m ? vectors[m[1]] : [1, 0]; // 言葉は [1, 0]
			})
		);
		const runner = vi.fn(async (input: ClefInput) => output(input));
		const result = await readIntent({ kv, runner, embedder }, ['静かな場所'], 'open', undefined, {
			candidates: 1
		});
		const affinityCalls = runner.mock.calls.filter(([i]) => 'servers' in (i.state as object));
		expect(affinityCalls).toHaveLength(1);
		expect(Object.keys(affinityCalls[0][0].questions)).toEqual(['s0.tld']);
		expect(result.affinity['s0.tld']).toBe(0.8); // Clef の判定
		expect(result.affinity['s1.tld']).toBeLessThan(0.5);
		expect(result.affinity['s2.tld']).toBeLessThan(result.affinity['s1.tld']);
		// 表は KV に置かれ、2 回目は埋め込み直さない（言葉の 1 本だけ）
		expect(await kv.get('embeddings:v1:bge-m3:open')).not.toBeNull();
		const before = embedder.mock.calls.length;
		await readIntent({ kv, runner, embedder }, ['別の言葉'], 'open', undefined, { candidates: 1 });
		expect(embedder.mock.calls.length - before).toBe(1);
	});

	it('既定と違う候補数（評価用）の結果はキャッシュに置かない', async () => {
		const kv = kvWith(base);
		const embedder = vi.fn(async (texts: string[]) => texts.map(() => [1, 0]));
		const runner = vi.fn(async (input: ClefInput) => output(input));
		await readIntent({ kv, runner, embedder }, ['静かな場所'], 'open', undefined, {
			candidates: 16
		});
		const calls = runner.mock.calls.length;
		await readIntent({ kv, runner, embedder }, ['静かな場所'], 'open', undefined, {
			candidates: 0
		});
		expect(runner.mock.calls.length).toBe(calls * 2);
	});

	it('噛み合いのキャッシュは 7 日置く', async () => {
		const kv = kvWith(base);
		const ttls: (number | undefined)[] = [];
		const put = kv.put;
		kv.put = async (key, value, options) => {
			if (key.startsWith('intent:')) ttls.push(options?.expirationTtl);
			return put(key, value, options);
		};
		await readIntent({ kv, runner: async (input) => output(input) }, ['静かな場所'], 'open');
		expect(ttls).toEqual([60 * 60 * 24 * 7]);
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
