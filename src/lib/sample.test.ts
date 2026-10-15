import { describe, expect, it } from 'vitest';
import { cleanNoteText, pickSampleTexts } from './sample';

describe('cleanNoteText', () => {
	it('URL とメンションを除き、空白をまとめる', () => {
		expect(cleanNoteText('見て https://example.com/a?b=c  @foo@bar.tld  すごい\n\nね')).toBe(
			'見て すごい ね'
		);
	});
	it('長すぎる本文は切り詰める', () => {
		expect(cleanNoteText('あ'.repeat(500)).length).toBeLessThanOrEqual(200);
	});
});

describe('pickSampleTexts', () => {
	it('空文字・短すぎる・重複を除いて上限件数まで返す', () => {
		const notes = [
			{ text: 'おはよう' },
			{ text: '' },
			{ text: null },
			{ text: 'おはよう' },
			{ text: 'w' },
			{ text: 'https://example.com' },
			{ text: '今日はいい天気' },
			{ cw: '注意', text: '中身' }
		];
		expect(pickSampleTexts(notes, 10)).toEqual(['おはよう', '今日はいい天気', '中身']);
		expect(pickSampleTexts(notes, 1)).toEqual(['おはよう']);
	});
});
