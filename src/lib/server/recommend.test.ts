import { describe, expect, it, vi } from 'vitest';
import { mkServer, mkVibe } from '$lib/fixtures.test-helper';
import type { ClefInput, ClefOutput, VibeKv } from '$lib/vibe';
import { sampleKey, VIBE_VERSION, vibeKey } from '$lib/vibe';
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
	[vibeKey('s0.tld')]: JSON.stringify(mkVibe({ version: VIBE_VERSION, host: 's0.tld' })),
	[sampleKey('s0.tld')]: JSON.stringify(['最近の投稿'])
};
// 欠けなし（s1 と s2 は最近失敗したので再試行しない）
const base = {
	...withMissing,
	[vibeKey('s1.tld')]: failed('s1.tld'),
	[vibeKey('s2.tld')]: failed('s2.tld')
};

describe('loadProfiles', () => {
	it('雰囲気はあるが抜粋が無い（LTL 公開）サーバーの抜粋を defer で埋め、埋まるまで属性表をキャッシュしない', async () => {
		const s3 = mkServer({ host: 's3.tld', ltlAvailable: true });
		const kv = kvWith({
			...base,
			'servers:v7': JSON.stringify([...servers, s3]),
			[vibeKey('s3.tld')]: JSON.stringify(mkVibe({ version: VIBE_VERSION, host: 's3.tld' }))
		});
		const sampler = vi.fn(async () => ['最近の投稿をひとつ', 'もうひとつの投稿']);
		const deferred: Promise<unknown>[] = [];
		const { pendingCount } = await loadProfiles({ kv, runner: null, sampler }, (w) =>
			deferred.push(w)
		);
		expect(pendingCount).toBe(1);
		expect(deferred).toHaveLength(1);
		await Promise.all(deferred);
		expect(sampler).toHaveBeenCalledTimes(1);
		expect(await kv.get(sampleKey('s3.tld'))).toContain('最近の投稿をひとつ');
		expect(await kv.get('profiles:v4:open')).toBeNull();
		// 埋まった次は抜粋付きで返り、キャッシュも置く
		const again = await loadProfiles({ kv, runner: null, sampler }, (w) => deferred.push(w));
		expect(again.pendingCount).toBe(0);
		expect(again.profiles.find((p) => p.server.host === 's3.tld')?.excerpts).toHaveLength(2);
		expect(await kv.get('profiles:v4:open')).not.toBeNull();
	});

	it('KV は一括読みでまとめ、雰囲気と抜粋を付ける', async () => {
		const kv = kvWith(base);
		const { profiles } = await loadProfiles({ kv, runner: null });
		expect(profiles.map((p) => p.server.host)).toEqual(['s0.tld', 's1.tld', 's2.tld']);
		expect(profiles[0].vibe?.host).toBe('s0.tld');
		expect(profiles[0].excerpts).toEqual(['最近の投稿']);
		expect(profiles[1].vibe).toBeNull();
		// 一覧 1 + 属性表キャッシュ 1 + 雰囲気・抜粋の一括 1
		expect(kv.reads).toBe(3);
	});

	it('一括読みが無い KV でも 1 件ずつ読んで同じ結果になる', async () => {
		const kv = kvWith(base, false);
		const { profiles } = await loadProfiles({ kv, runner: null });
		expect(profiles[0].vibe?.host).toBe('s0.tld');
		expect(profiles[0].excerpts).toEqual(['最近の投稿']);
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
		expect(first.affinity).toEqual({});
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
