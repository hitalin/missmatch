import { describe, expect, it } from 'vitest';
import { QUIZ, toPreference } from './quiz';

describe('QUIZ', () => {
	it('各設問の id と選択肢 value が一意である', () => {
		const ids = QUIZ.map((q) => q.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const q of QUIZ) {
			const values = q.options.map((o) => o.value);
			expect(new Set(values).size).toBe(values.length);
			expect(values.length).toBeGreaterThanOrEqual(2);
		}
	});
});

describe('toPreference', () => {
	it('回答を Preference に変換する', () => {
		const pref = toPreference({
			genre: 'creative',
			pace: 'busy',
			scale: 'small',
			tone: 'warm',
			registration: 'openOnly',
			age: 'adult',
			nsfw: 'avoid',
			community: 'easyEntry'
		});
		expect(pref).toEqual({
			genre: 'creative',
			pace: 'busy',
			scale: 'small',
			tone: 'warm',
			registration: 'openOnly',
			adult: true,
			nsfw: 'avoid',
			community: 'easyEntry'
		});
	});

	it('未回答や「こだわらない」は null になり、安全側のデフォルトが入る', () => {
		const pref = toPreference({ genre: 'any', tone: 'any' });
		expect(pref.genre).toBeNull();
		expect(pref.pace).toBeNull();
		expect(pref.scale).toBeNull();
		expect(pref.tone).toBeNull();
		expect(pref.registration).toBe('approvalOk');
		expect(pref.adult).toBe(false);
		expect(pref.nsfw).toBe('avoid');
		expect(pref.community).toBe('easyEntry');
	});

	it('不正な値は無視する', () => {
		const pref = toPreference({ genre: 'hacker', nsfw: 'yes' });
		expect(pref.genre).toBeNull();
		expect(pref.nsfw).toBe('avoid');
	});
});
