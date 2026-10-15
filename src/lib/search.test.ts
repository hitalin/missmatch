import { describe, expect, it } from 'vitest';
import { hasAffinity, newSearch, refineSearch, searchTurns, seenHosts } from './search';

describe('search', () => {
	it('newSearch は空のいいね・よくないねで始まり、言葉を持つ', () => {
		const s = newSearch('病み垢');
		expect(s.query).toBe('病み垢');
		expect(s.turns).toEqual([]);
		expect(s.liked).toEqual([]);
		expect(s.passed).toEqual([]);
		expect(s.affinity).toEqual({});
		expect(s.id).not.toBe(newSearch().id);
	});

	it('searchTurns は最初の言葉と絞り込みを順に並べ、空の言葉は飛ばす', () => {
		expect(searchTurns(newSearch())).toEqual([]);
		expect(searchTurns({ ...newSearch('病み垢'), turns: ['小さめ', '広告なし'] })).toEqual([
			'病み垢',
			'小さめ',
			'広告なし'
		]);
	});

	it('refineSearch は言葉が無ければ最初の言葉に、あれば絞り込みに足す', () => {
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

	it('seenHosts はいいねとよくないねの両方', () => {
		const s = { ...newSearch(), liked: ['a.tld'], passed: ['b.tld'] };
		expect([...seenHosts(s)].sort()).toEqual(['a.tld', 'b.tld']);
	});
});
