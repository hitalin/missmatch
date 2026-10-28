import { describe, expect, it } from 'vitest';
import { defaultPreferences } from './prefs';
import {
	effectivePrefs,
	groupSearches,
	hasAffinity,
	newSearch,
	refineSearch,
	searchTitle,
	searchTurns,
	seenHosts
} from './search';

describe('effectivePrefs', () => {
	it('全体の設定に、その検索の読み取りと聞き返しの答えを重ねる（全体の設定は変えない）', () => {
		const prefs = { ...defaultPreferences(), age: 'adult' as const, topics: ['tech' as const] };
		const s = {
			...newSearch('ゲーム'),
			intent: {
				'topic.game': { type: 'noul' as const, noul: 0.9 },
				tone: {
					type: 'choice' as const,
					choice: 'right',
					probabilities: { right: 0.9 },
					confidence: 0.9
				}
			},
			choices: { scale: 'small' }
		};
		const eff = effectivePrefs(prefs, s);
		expect(eff.topics).toEqual(['tech', 'game']);
		expect(eff.tone).toBe('right');
		expect(eff.scales).toEqual(['small', 'medium']);
		expect(prefs.topics).toEqual(['tech']);
		expect(prefs.tone).toBe('any');
		// 別の検索には効かない
		expect(effectivePrefs(prefs, newSearch('病み垢')).topics).toEqual(['tech']);
	});
});

describe('search', () => {
	it('newSearch は空のいいね・よくないねで始まり、言葉を持つ', () => {
		const s = newSearch('病み垢');
		expect(s.query).toBe('病み垢');
		expect(s.turns).toEqual([]);
		expect(s.liked).toEqual([]);
		expect(s.passed).toEqual([]);
		expect(s.affinity).toEqual({});
		expect(s.intent).toEqual({});
		expect(s.choices).toEqual({});
		expect(s.taste).toEqual({});
		expect(s.swipes).toBe(0);
		expect(s.id).not.toBe(newSearch().id);
	});

	it('newSearch はサーバー探しが既定で、人探しのセッションも同じ形で持てる', () => {
		expect(newSearch('病み垢').mode).toBe('server');
		expect(newSearch('ジャズの話ができる人', 'people').mode).toBe('people');
	});
	it('searchTurns は最初の言葉と絞り込みを順に並べ、空の言葉は飛ばす', () => {
		expect(searchTurns(newSearch())).toEqual([]);
		expect(searchTurns({ ...newSearch('病み垢'), turns: ['小さめ', '広告なし'] })).toEqual([
			'病み垢',
			'小さめ',
			'広告なし'
		]);
	});

	it('refineSearch は言葉が無ければ最初の言葉に、あれば絞り込みに足し、最後に動いた時刻を更新する', () => {
		const old = { ...newSearch(), at: 1 };
		expect(refineSearch(old, 'x').at).toBeGreaterThan(1);
		const first = refineSearch(newSearch(), '病み垢');
		expect(first.query).toBe('病み垢');
		expect(first.turns).toEqual([]);
		const second = refineSearch(first, '小さめ');
		expect(second.query).toBe('病み垢');
		expect(second.turns).toEqual(['小さめ']);
	});

	it('hasAffinity は今の言葉の並びに対して読み取り済みのときだけ真', () => {
		expect(hasAffinity(newSearch())).toBe(false);
		expect(hasAffinity(newSearch('病み垢'))).toBe(false);
		const read = { ...newSearch('病み垢'), affinity: { 'a.tld': 0.9 }, affinityFor: '病み垢' };
		expect(hasAffinity(read)).toBe(true);
		// 絞り込みを足したら読み直すまで古い
		expect(hasAffinity({ ...read, turns: ['小さめ'] })).toBe(false);
		expect(hasAffinity({ ...read, turns: ['小さめ'], affinityFor: '病み垢\n小さめ' })).toBe(true);
		expect(hasAffinity({ ...newSearch(''), affinity: { 'a.tld': 0.9 }, affinityFor: '' })).toBe(
			false
		);
	});

	it('searchTitle は付けた名前 → 最初の言葉 → 条件だけ の順', () => {
		expect(searchTitle(newSearch())).toBe('条件だけ');
		expect(searchTitle(newSearch('病み垢'))).toBe('病み垢');
		expect(searchTitle({ ...newSearch('病み垢'), title: '弱音用' })).toBe('弱音用');
	});

	it('groupSearches は言葉のある検索だけを新しい順に 今日 / 昨日 / 過去 7 日 / それ以前 で分け、空の組は出さない', () => {
		const now = new Date(2026, 9, 16, 15, 0).getTime(); // 2026-10-16 15:00
		const day = 24 * 60 * 60 * 1000;
		const at = (ms: number) => ({ ...newSearch('x'), at: ms });
		const today = at(now - 60 * 1000);
		const todayEarly = at(new Date(2026, 9, 16, 0, 30).getTime());
		const yesterday = at(now - day);
		const fiveDays = at(now - 5 * day);
		const old = at(now - 30 * day);
		const plain = { ...newSearch(''), at: now }; // 言葉なし（条件だけ）は一覧に出さない
		const groups = groupSearches([old, fiveDays, todayEarly, yesterday, today, plain], now);
		expect(groups.map((g) => g.label)).toEqual(['今日', '昨日', '過去 7 日', 'それ以前']);
		expect(groups[0].searches.map((s) => s.at)).toEqual([today.at, todayEarly.at]);
		expect(groups[1].searches).toEqual([yesterday]);
		expect(groups[2].searches).toEqual([fiveDays]);
		expect(groups[3].searches).toEqual([old]);
		expect(groupSearches([], now)).toEqual([]);
	});

	it('seenHosts はいいねとよくないねの両方', () => {
		const s = { ...newSearch(), liked: ['a.tld'], passed: ['b.tld'] };
		expect([...seenHosts(s)].sort()).toEqual(['a.tld', 'b.tld']);
	});
});
