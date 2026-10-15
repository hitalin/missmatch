import { describe, expect, it } from 'vitest';
import {
	currentSearch,
	emptyProfile,
	parseSavedProfile,
	patchSearch,
	selectSearch
} from './profile';
import { newSearch } from './search';

describe('parseSavedProfile', () => {
	it('壊れた JSON や未知の値は捨てて既定値にする', () => {
		expect(parseSavedProfile(null)).toEqual(emptyProfile());
		expect(parseSavedProfile('{')).toEqual(emptyProfile());
		expect(parseSavedProfile('"str"')).toEqual(emptyProfile());
	});

	it('妥当な値だけ残し、設定項目の増減に耐える', () => {
		const p = parseSavedProfile(
			JSON.stringify({
				prefs: {
					adult: true,
					nsfw: 'welcome',
					registrations: ['invite', 'bogus'],
					scales: ['small', 'huge'],
					paces: 'busy',
					topics: ['vent', 'cooking'],
					tone: 'right',
					rules: 'nope',
					dealbreakers: { adsFree: true, removed: true, gtl: 'yes' }
				},
				taste: { scale: -0.5, bogus: 5 },
				swipes: 3.7,
				searches: [
					{
						id: 's1',
						query: '病み垢',
						affinity: { 'a.tld': 0.9, 'b.tld': 2 },
						liked: ['a.tld', 1],
						passed: null,
						at: 100
					},
					{ id: 7, query: 'id が無いので捨てる' },
					'bogus'
				],
				current: 's1'
			})
		);
		expect(p.prefs.adult).toBe(true);
		expect(p.prefs.nsfw).toBe('welcome');
		expect(p.prefs.registrations).toEqual(['invite']);
		expect(p.prefs.scales).toEqual(['small']);
		expect(p.prefs.paces).toEqual([]);
		expect(p.prefs.topics).toEqual(['vent']);
		expect(p.prefs.tone).toBe('right');
		expect(p.prefs.rules).toBe('any');
		expect(p.prefs.dealbreakers.adsFree).toBe(true);
		expect(p.prefs.dealbreakers.gtl).toBe(false);
		expect(p.taste).toEqual({ scale: -0.5 });
		expect(p.swipes).toBe(3);
		expect(p.searches).toEqual([
			{
				id: 's1',
				query: '病み垢',
				affinity: { 'a.tld': 0.9 },
				liked: ['a.tld'],
				passed: [],
				at: 100
			}
		]);
		expect(p.current).toBe('s1');
	});

	it('current が無い・存在しない id なら先頭の検索を指す', () => {
		const p = parseSavedProfile(
			JSON.stringify({
				searches: [
					{ id: 'x', query: 'a' },
					{ id: 'y', query: 'b' }
				],
				current: 'nope'
			})
		);
		expect(p.current).toBe('x');
	});

	it('旧形式（一言・いいね・よくないねが 1 本）は 1 件の検索に移す', () => {
		const p = parseSavedProfile(
			JSON.stringify({
				prefs: { adult: true, wish: '病み垢', affinityFor: '病み垢', affinity: { 'a.tld': 0.9 } },
				liked: ['a.tld'],
				passed: ['b.tld']
			})
		);
		expect(p.searches).toHaveLength(1);
		const s = p.searches[0];
		expect(s.query).toBe('病み垢');
		expect(s.affinity).toEqual({ 'a.tld': 0.9 });
		expect(s.liked).toEqual(['a.tld']);
		expect(s.passed).toEqual(['b.tld']);
		expect(p.current).toBe(s.id);
	});

	it('旧形式で一言が変わっていた（噛み合いが古い）なら噛み合いは持ち越さない', () => {
		const p = parseSavedProfile(
			JSON.stringify({
				prefs: { wish: '創作', affinityFor: '病み垢', affinity: { 'a.tld': 0.9 } },
				liked: ['a.tld']
			})
		);
		expect(p.searches[0].query).toBe('創作');
		expect(p.searches[0].affinity).toEqual({});
	});
});

describe('検索の切り替え', () => {
	it('selectSearch は新しい検索を加えて current にし、既存なら差し替える', () => {
		const a = newSearch('a');
		const b = newSearch('b');
		let p = selectSearch(emptyProfile(), a);
		p = selectSearch(p, b);
		expect(p.searches.map((s) => s.id)).toEqual([a.id, b.id]);
		expect(currentSearch(p)?.id).toBe(b.id);
		p = selectSearch(p, { ...a, liked: ['x.tld'] });
		expect(p.searches).toHaveLength(2);
		expect(currentSearch(p)?.liked).toEqual(['x.tld']);
	});

	it('patchSearch は current の検索だけを書き換える', () => {
		const a = newSearch('a');
		const b = newSearch('b');
		let p = selectSearch(selectSearch(emptyProfile(), a), b);
		p = patchSearch(p, { passed: ['y.tld'] });
		expect(currentSearch(p)?.passed).toEqual(['y.tld']);
		expect(p.searches.find((s) => s.id === a.id)?.passed).toEqual([]);
	});

	it('currentSearch は検索が無ければ null', () => {
		expect(currentSearch(emptyProfile())).toBeNull();
	});
});
