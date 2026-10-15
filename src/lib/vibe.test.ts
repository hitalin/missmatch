import { describe, expect, it, vi } from 'vitest';
import type { ServerInfo } from './types';
import {
	buildVibeRequest,
	type ClefAnswer,
	type ClefOutput,
	getOrComputeVibe,
	parseVibeAnswers,
	VIBE_VERSION,
	vibeTags
} from './vibe';

const server: ServerInfo = {
	host: 'example.tld',
	name: 'テスト鯖',
	description: '創作好きが集まる場所',
	iconUrl: null,
	bannerUrl: null,
	usersCount: 100,
	dru15: 10,
	npd15: 50,
	softwareName: 'misskey',
	softwareVersion: '2025.9.0',
	registrationOpen: true,
	approvalRequired: false,
	emailRequired: false,
	ageRestriction: 'all',
	serverRules: ['誹謗中傷禁止'],
	langs: ['ja']
};

describe('buildVibeRequest', () => {
	it('state にサーバー情報とサンプル投稿を含め、質問を揃える', () => {
		const req = buildVibeRequest(server, ['おはよう', '絵描いた']);
		expect(req.model).toBe('clef');
		const state = req.state as Record<string, unknown>;
		expect(state.name).toBe('テスト鯖');
		expect(state.rules).toEqual(['誹謗中傷禁止']);
		expect(state.recentNotes).toEqual(['おはよう', '絵描いた']);
		expect(Object.keys(req.questions).sort()).toEqual(
			['closedCommunity', 'genre', 'newcomerFriendly', 'nsfw', 'strictness', 'tone'].sort()
		);
		expect(req.questions.genre.type).toBe('choice');
		expect(req.questions.tone.type).toBe('score');
		expect(req.questions.nsfw.type).toBe('noul');
	});
});

describe('parseVibeAnswers', () => {
	const answers: Record<string, ClefAnswer> = {
		genre: {
			type: 'choice',
			choice: 'creative',
			probabilities: { creative: 0.7, general: 0.2, tech: 0.1 },
			confidence: 0.7
		},
		tone: {
			type: 'score',
			score: 2.4,
			legend: { '0': 'a', '1': 'b', '2': 'c', '3': 'd' },
			probabilities: {},
			confidence: 0.5
		},
		strictness: {
			type: 'score',
			score: 0,
			legend: { '0': 'a', '1': 'b', '2': 'c' },
			probabilities: {},
			confidence: 0.9
		},
		newcomerFriendly: { type: 'noul', noul: 0.8 },
		nsfw: { type: 'noul', noul: 0.05 },
		closedCommunity: { type: 'noul', noul: 0.3 }
	};

	it('確率を 0..1 に正規化して VibeProfile を作る', () => {
		const v = parseVibeAnswers('example.tld', answers, 20);
		expect(v.version).toBe(VIBE_VERSION);
		expect(v.host).toBe('example.tld');
		expect(v.genre.creative).toBe(0.7);
		expect(v.genre.adult).toBe(0); // 欠けている選択肢は 0
		expect(v.tone).toBeCloseTo(0.8); // 2.4 / 3
		expect(v.strictness).toBe(0);
		expect(v.newcomerFriendly).toBe(0.8);
		expect(v.nsfw).toBe(0.05);
		expect(v.closedCommunity).toBe(0.3);
		expect(v.sampleCount).toBe(20);
	});

	it('必要な回答が欠けていれば例外を投げる', () => {
		const { tone: _tone, ...rest } = answers;
		expect(() => parseVibeAnswers('example.tld', rest, 1)).toThrow();
	});
});

describe('vibeTags', () => {
	it('目立つ軸だけタグにする', () => {
		const answers: Record<string, ClefAnswer> = {
			genre: {
				type: 'choice',
				choice: 'tech',
				probabilities: { tech: 0.6, general: 0.4 },
				confidence: 0.6
			},
			tone: { type: 'score', score: 2.7, legend: {}, probabilities: {}, confidence: 1 },
			strictness: { type: 'score', score: 1.8, legend: {}, probabilities: {}, confidence: 1 },
			newcomerFriendly: { type: 'noul', noul: 0.9 },
			nsfw: { type: 'noul', noul: 0.1 },
			closedCommunity: { type: 'noul', noul: 0.2 }
		};
		const v = parseVibeAnswers('example.tld', answers, 10);
		const tags = vibeTags(v);
		expect(tags).toContain('技術');
		expect(tags).toContain('ほのぼの');
		expect(tags).toContain('ルール厳しめ');
		expect(tags).toContain('初心者歓迎');
		expect(tags).not.toContain('成人向け多め');
		expect(tags).not.toContain('身内ノリ強め');
	});
});

describe('getOrComputeVibe', () => {
	const store = new Map<string, string>();
	const kv = {
		get: vi.fn(async (k: string) => store.get(k) ?? null),
		put: vi.fn(async (k: string, v: string) => {
			store.set(k, v);
		})
	};
	const runner = vi.fn(
		async (): Promise<ClefOutput> => ({
			model: 'clef',
			answers: {
				genre: { type: 'choice', choice: 'general', probabilities: { general: 1 }, confidence: 1 },
				tone: { type: 'score', score: 1.5, legend: {}, probabilities: {}, confidence: 1 },
				strictness: { type: 'score', score: 1, legend: {}, probabilities: {}, confidence: 1 },
				newcomerFriendly: { type: 'noul', noul: 0.5 },
				nsfw: { type: 'noul', noul: 0.5 },
				closedCommunity: { type: 'noul', noul: 0.5 }
			},
			usage: { input_tokens: 1, output_tokens: 0 }
		})
	);
	const sampler = vi.fn(async () => ['a', 'b']);

	it('初回は計算して KV に保存し、2回目はキャッシュを返す', async () => {
		const first = await getOrComputeVibe(server, { kv, runner, sampler });
		expect(first?.genre.general).toBe(1);
		expect(runner).toHaveBeenCalledTimes(1);
		expect(kv.put).toHaveBeenCalledTimes(1);

		const second = await getOrComputeVibe(server, { kv, runner, sampler });
		expect(second).toEqual(first);
		expect(runner).toHaveBeenCalledTimes(1);
	});

	it('古いバージョンのキャッシュは無視して再計算する', async () => {
		store.set(`vibe:${server.host}`, JSON.stringify({ version: VIBE_VERSION - 1 }));
		await getOrComputeVibe(server, { kv, runner, sampler });
		expect(runner).toHaveBeenCalledTimes(2);
	});

	it('runner が失敗したら null を返す', async () => {
		store.clear();
		runner.mockRejectedValueOnce(new Error('boom'));
		expect(await getOrComputeVibe(server, { kv, runner, sampler })).toBeNull();
	});
});
