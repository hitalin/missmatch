import { describe, expect, it } from 'vitest';
import { mk } from './fixtures.test-helper';
import {
	AFFINITY_BATCH,
	applyIntent,
	askOptions,
	buildAffinityRequests,
	buildIntentRequest,
	chooseAxis,
	isAxisDefault,
	MAX_TURNS,
	parseAffinity,
	unsureAxes
} from './intent';
import { defaultPreferences } from './prefs';
import type { ClefAnswer } from './vibe';

const choice = (c: string, p: number): ClefAnswer => ({
	type: 'choice',
	choice: c,
	probabilities: { [c]: p },
	confidence: p
});
const noul = (n: number): ClefAnswer => ({ type: 'noul', noul: n });

describe('buildIntentRequest', () => {
	it('話題は noul、空気感・規模・流速は choice にし、年齢と R-18 は読み取らない', () => {
		const req = buildIntentRequest(['創作垢を置ける落ち着いたサーバーがいい']);
		expect(req.questions['topic.illust'].type).toBe('noul');
		expect(req.questions.tone.type).toBe('choice');
		expect(req.questions.age).toBeUndefined();
		expect(req.questions.nsfw).toBeUndefined();
		expect((req.state as { userMessages: string[] }).userMessages[0]).toContain('創作');
	});
	it('発言は順に並べ、長すぎる発言と多すぎる発言は切り詰める', () => {
		const state = buildIntentRequest(['あ'.repeat(1000), ...Array(20).fill('小さめ')]).state as {
			userMessages: string[];
		};
		expect(state.userMessages).toHaveLength(MAX_TURNS);
		expect(state.userMessages[0].length).toBe(300);
		expect(state.userMessages[1]).toBe('小さめ');
	});
});

describe('applyIntent', () => {
	it('自信のある読み取りで空いている設定を埋め、ユーザーが決めた項目は上書きしない', () => {
		const base = { ...defaultPreferences(), tone: 'left' as const, topics: ['game' as const] };
		const next = applyIntent(base, {
			'topic.illust': noul(0.9),
			'topic.tech': noul(0.3),
			tone: choice('right', 0.95),
			community: choice('right', 0.8),
			rules: choice('left', 0.4),
			scale: choice('small', 0.9),
			pace: choice('none', 0.9),
			emailFree: noul(0.85),
			adsFree: noul(0.2)
		});
		expect(next.topics).toEqual(['game', 'illust']);
		expect(next.tone).toBe('left'); // ユーザーが決めていた
		expect(next.community).toBe('right');
		expect(next.rules).toBe('any'); // 低確率
		expect(next.scales).toEqual(['small', 'medium']);
		expect(next.paces).toEqual([]);
		expect(next.dealbreakers.emailFree).toBe(true);
		expect(next.dealbreakers.adsFree).toBe(false);
		expect(base.topics).toEqual(['game']); // 元は変えない
	});
});

describe('読み取れなかった軸を選択肢で聞く', () => {
	it('unsureAxes は choice の回答が無い・低確率の軸だけ（回答が無い軸は聞かない）', () => {
		expect(
			unsureAxes({
				tone: choice('right', 0.95),
				community: choice('none', 0.9),
				rules: choice('left', 0.4),
				scale: choice('small', 0.9)
			})
		).toEqual(['community', 'rules']);
		expect(unsureAxes({})).toEqual([]);
	});

	it('askOptions は「言及なし」を除いた選択肢', () => {
		expect(askOptions('scale').map((o) => o.value)).toEqual(['small', 'large']);
		expect(askOptions('tone').map((o) => o.label)).toContain('ほのぼの・穏やか');
	});

	it('chooseAxis はユーザーの選択なので既定値でなくても上書きする', () => {
		const base = { ...defaultPreferences(), tone: 'left' as const, scales: ['large' as const] };
		expect(chooseAxis(base, 'tone', 'right').tone).toBe('right');
		expect(chooseAxis(base, 'scale', 'small').scales).toEqual(['small', 'medium']);
		expect(chooseAxis(base, 'pace', 'busy').paces).toEqual(['relaxed', 'busy']);
	});

	it('isAxisDefault は設定がまだ既定値か', () => {
		const d = defaultPreferences();
		expect(isAxisDefault(d, 'tone')).toBe(true);
		expect(isAxisDefault(d, 'scale')).toBe(true);
		expect(isAxisDefault({ ...d, scales: ['small'] }, 'scale')).toBe(false);
		expect(isAxisDefault({ ...d, rules: 'right' }, 'rules')).toBe(false);
	});
});

describe('buildAffinityRequests / parseAffinity', () => {
	it('小さなバッチに分け、host を質問 id にし、state に説明とルールを入れる', () => {
		const profiles = Array.from({ length: AFFINITY_BATCH + 6 }, (_, i) =>
			mk({ host: `s${i}.tld`, description: `説明 ${i}` })
		);
		const reqs = buildAffinityRequests(['病み垢を置きたい', '小さめ'], profiles);
		expect(reqs).toHaveLength(2);
		expect(Object.keys(reqs[0].questions)).toHaveLength(AFFINITY_BATCH);
		expect(Object.keys(reqs[1].questions)).toHaveLength(6);
		const state = reqs[1].state as { userMessages: string[]; servers: { host: string }[] };
		expect(state.userMessages).toEqual(['病み垢を置きたい', '小さめ']);
		expect(state.servers.map((s) => s.host)).toEqual(Object.keys(reqs[1].questions));
	});

	it('回答を host → 確率にまとめ、知らない host は捨てる', () => {
		const affinity = parseAffinity(
			[{ answers: { 'a.tld': noul(0.9), 'x.tld': noul(1) } }, { answers: { 'b.tld': noul(0.2) } }],
			[mk({ host: 'a.tld' }), mk({ host: 'b.tld' })]
		);
		expect(affinity).toEqual({ 'a.tld': 0.9, 'b.tld': 0.2 });
	});
});
