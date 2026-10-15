import { describe, expect, it } from 'vitest';
import { emptyProfile, parseSavedProfile } from './profile';

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
					dealbreakers: { adsFree: true, removed: true, gtl: 'yes' },
					wish: '病み垢',
					affinity: { 'a.tld': 0.9, 'b.tld': 2 },
					affinityFor: '病み垢'
				},
				taste: { scale: -0.5, bogus: 5 },
				swipes: 3.7,
				liked: ['a.tld', 1],
				passed: null
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
		expect(p.prefs.affinity).toEqual({ 'a.tld': 0.9 });
		expect(p.taste).toEqual({ scale: -0.5 });
		expect(p.swipes).toBe(3);
		expect(p.liked).toEqual(['a.tld']);
		expect(p.passed).toEqual([]);
	});
});
