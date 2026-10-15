import { describe, expect, it } from 'vitest';
import { mkServer } from './fixtures.test-helper';
import { defaultPreferences, isComplete, needsAllServers, scaleOf } from './prefs';

describe('scaleOf', () => {
	it('10 人未満は個人、100 人未満は小規模', () => {
		expect(scaleOf(mkServer({ usersCount: 3 }))).toBe('personal');
		expect(scaleOf(mkServer({ usersCount: 9 }))).toBe('personal');
		expect(scaleOf(mkServer({ usersCount: 10 }))).toBe('small');
		expect(scaleOf(mkServer({ usersCount: 500 }))).toBe('medium');
		expect(scaleOf(mkServer({ usersCount: 5000 }))).toBe('large');
	});
});

describe('年齢', () => {
	it('年齢を決めるまでは未完了', () => {
		const d = defaultPreferences();
		expect(isComplete(d)).toBe(false);
		expect(isComplete({ ...d, age: 'child' })).toBe(true);
	});
});

describe('needsAllServers', () => {
	it('招待制か停止中を含めるときだけ全件が要る', () => {
		expect(needsAllServers(defaultPreferences())).toBe(false);
		expect(needsAllServers({ ...defaultPreferences(), registrations: ['open', 'invite'] })).toBe(
			true
		);
	});
});
