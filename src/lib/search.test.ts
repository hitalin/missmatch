import { describe, expect, it } from 'vitest';
import { hasAffinity, newSearch, seenHosts } from './search';

describe('search', () => {
	it('newSearch は空のいいね・よくないねで始まり、言葉を持つ', () => {
		const s = newSearch('病み垢');
		expect(s.query).toBe('病み垢');
		expect(s.liked).toEqual([]);
		expect(s.passed).toEqual([]);
		expect(s.affinity).toEqual({});
		expect(s.id).not.toBe(newSearch().id);
	});

	it('hasAffinity は言葉があり噛み合いが読み取り済みのときだけ真', () => {
		expect(hasAffinity(newSearch())).toBe(false);
		expect(hasAffinity(newSearch('病み垢'))).toBe(false);
		expect(hasAffinity({ ...newSearch('病み垢'), affinity: { 'a.tld': 0.9 } })).toBe(true);
		expect(hasAffinity({ ...newSearch(''), affinity: { 'a.tld': 0.9 } })).toBe(false);
	});

	it('seenHosts はいいねとよくないねの両方', () => {
		const s = { ...newSearch(), liked: ['a.tld'], passed: ['b.tld'] };
		expect([...seenHosts(s)].sort()).toEqual(['a.tld', 'b.tld']);
	});
});
