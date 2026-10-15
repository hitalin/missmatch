import { describe, expect, it } from 'vitest';
import {
	currentSearch,
	deleteSearch,
	emptyProfile,
	parseSavedProfile,
	patchSearch,
	renameSearch,
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
					age: 'minor',
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
						title: '弱音用',
						turns: ['小さめ', 3],
						affinity: { 'a.tld': 0.9, 'b.tld': 2 },
						affinityFor: '病み垢\n小さめ',
						unsure: ['scale', 'bogus'],
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
		expect(p.prefs.age).toBe('minor');
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
				title: '弱音用',
				turns: ['小さめ'],
				affinity: { 'a.tld': 0.9 },
				affinityFor: '病み垢\n小さめ',
				unsure: ['scale'],
				liked: ['a.tld'],
				passed: [],
				at: 100
			}
		]);
		expect(p.current).toBe('s1');
	});

	it('年齢: 旧形式の adult を移し、知らない値は未設定にする', () => {
		const age = (prefs: unknown) => parseSavedProfile(JSON.stringify({ prefs })).prefs.age;
		expect(age({ adult: true })).toBe('adult');
		expect(age({ adult: false })).toBe('minor');
		expect(age({ age: 'child' })).toBe('child');
		expect(age({ age: 'bogus' })).toBeNull();
		expect(age({})).toBeNull();
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
		expect(s.affinityFor).toBe('病み垢');
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

	it('deleteSearch は検索を消し、current だったなら最後に使ったものに移る', () => {
		const a = { ...newSearch('a'), at: 1 };
		const b = { ...newSearch('b'), at: 2 };
		const c = { ...newSearch('c'), at: 3 };
		let p = { ...emptyProfile(), searches: [a, b, c], current: c.id };
		p = deleteSearch(p, c.id);
		expect(p.searches.map((s) => s.id)).toEqual([a.id, b.id]);
		expect(p.current).toBe(b.id);
		p = deleteSearch(p, a.id); // current でないものを消しても current は変わらない
		expect(p.current).toBe(b.id);
		p = deleteSearch(p, b.id);
		expect(p.searches).toEqual([]);
		expect(p.current).toBe('');
	});

	it('renameSearch は名前だけ変え、空白なら名前を外す', () => {
		const a = newSearch('a');
		let p = selectSearch(emptyProfile(), a);
		p = renameSearch(p, a.id, '  弱音用 ');
		expect(p.searches[0].title).toBe('弱音用');
		expect(p.searches[0].query).toBe('a');
		p = renameSearch(p, a.id, '   ');
		expect(p.searches[0].title).toBe('');
	});

	it('currentSearch は検索が無ければ null', () => {
		expect(currentSearch(emptyProfile())).toBeNull();
	});
});
