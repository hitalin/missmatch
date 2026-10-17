import { describe, expect, it, vi } from 'vitest';
import { mkServer, mkVibe } from '$lib/fixtures.test-helper';
import type { ClefInput, ClefOutput, VibeKv } from '$lib/vibe';
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
// s0 は判定済み、s1 と s2 は欠け
const withMissing = {
	'servers:v7': JSON.stringify(servers),
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
});

describe('readIntent', () => {
	const output = (input: ClefInput): ClefOutput => ({
		model: 'clef',
		answers: Object.fromEntries(
			Object.keys(input.questions).map((id) => [id, { type: 'noul', noul: 0.8 }])
		),
		usage: { input_tokens: 1, output_tokens: 0 }
	});

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

	it('第 1 段の上位を 1 リクエストで再判定し、噛み合いを半々に混ぜる（失敗したら第 1 段のまま）', async () => {
		const many = Array.from({ length: 20 }, (_, i) =>
			mkServer({ host: `m${i}.tld`, ltlAvailable: false })
		);
		const kv = kvWith({
			'servers:v7': JSON.stringify(many),
			...Object.fromEntries(many.map((s) => [vibeKey(s.host), failed(s.host)]))
		});
		const runner = vi.fn(async (input: ClefInput): Promise<ClefOutput> => {
			const ids = Object.keys(input.questions);
			const first = input.questions[ids[0]];
			if (first.type === 'score') {
				// 再判定: m0 は最低、m1 は最高、残りは中間
				return {
					model: 'clef',
					answers: Object.fromEntries(
						ids.map((id) => [
							id,
							{
								type: 'score',
								score: id === 'm0.tld' ? 0 : id === 'm1.tld' ? 4 : 2,
								legend: {},
								probabilities: {},
								confidence: 1
							}
						])
					),
					usage: { input_tokens: 1, output_tokens: 0 }
				};
			}
			// 第 1 段: m0 が 1.0、m1 が 0.9、他は番号が小さいほど高い
			return {
				model: 'clef',
				answers: Object.fromEntries(
					ids.map((id) => [
						id,
						{ type: 'noul', noul: id === 'm0.tld' ? 1 : 1 - Number(id.slice(1, -4)) / 40 }
					])
				),
				usage: { input_tokens: 1, output_tokens: 0 }
			};
		});
		const { affinity } = await readIntent({ kv, runner }, ['静かな場所'], 'open');
		const rerank = runner.mock.calls.filter(
			([input]) => input.questions[Object.keys(input.questions)[0]].type === 'score'
		);
		expect(rerank).toHaveLength(1);
		expect(Object.keys(rerank[0][0].questions)).toHaveLength(16);
		expect(affinity['m0.tld']).toBeCloseTo(0.5); // (1 + 0) / 2
		expect(affinity['m1.tld']).toBeCloseTo((0.975 + 1) / 2);
		expect(affinity['m19.tld']).toBeCloseTo(1 - 19 / 40); // 上位 16 件に入らず第 1 段のまま

		// 再判定が 2 回とも失敗したら第 1 段のまま
		const flaky = vi.fn(async (input: ClefInput) => {
			if (input.questions[Object.keys(input.questions)[0]].type === 'score') throw new Error('x');
			return runner(input);
		});
		const kv2 = kvWith({
			'servers:v7': JSON.stringify(many),
			...Object.fromEntries(many.map((s) => [vibeKey(s.host), failed(s.host)]))
		});
		const second = await readIntent({ kv: kv2, runner: flaky }, ['静かな場所'], 'open');
		expect(second.affinity['m0.tld']).toBe(1);
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
