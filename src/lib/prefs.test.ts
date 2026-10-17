import { describe, expect, it } from 'vitest';
import { mkServer } from './fixtures.test-helper';
import { defaultPreferences, isComplete, needsAllServers, scaleOf } from './prefs';

describe('scaleOf', () => {
	it('規模は登録者数でなく 1 日の読者数で決める（毎日 3 人未満は個人、30 人未満は小規模、300 人未満は中規模）', () => {
		expect(scaleOf(mkServer({ dru15: 0 }))).toBe('personal');
		expect(scaleOf(mkServer({ dru15: 2.9 }))).toBe('personal');
		expect(scaleOf(mkServer({ dru15: 3 }))).toBe('small');
		expect(scaleOf(mkServer({ dru15: 50 }))).toBe('medium');
		expect(scaleOf(mkServer({ dru15: 300 }))).toBe('large');
		// 登録 1,142 人でも毎日 8 人しか読まないなら小規模（さいばれすきー）
		expect(scaleOf(mkServer({ usersCount: 1142, dru15: 8 }))).toBe('small');
		expect(scaleOf(mkServer({ dru15: null }))).toBe('personal');
	});
});

describe('年齢', () => {
	it('年齢を決めるまでは未完了', () => {
		const d = defaultPreferences();
		expect(isComplete(d)).toBe(false);
		expect(d.activity).toBe('any');
		// 初期値はできるだけ多く通す: R-18 は気にしない、絶対条件はすべてオフ
		expect(d.nsfw).toBe('neutral');
		expect(Object.values(d.dealbreakers).every((v) => v === false)).toBe(true);
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
