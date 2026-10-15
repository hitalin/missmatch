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
			{ text: '今日はいい天気' }
		];
		expect(pickSampleTexts(notes, 10)).toEqual(['おはよう', '今日はいい天気']);
		expect(pickSampleTexts(notes, 1)).toEqual(['おはよう']);
	});

	it('CW 付きの投稿は CW 本文を先頭に付ける', () => {
		expect(pickSampleTexts([{ cw: '注意', text: '中身' }], 10)).toEqual(['[CW: 注意] 中身']);
	});

	it('同じユーザーの投稿は上限件数までしか採らない', () => {
		const notes = [
			...Array.from({ length: 10 }, (_, i) => ({ userId: 'a', text: `A の投稿 ${i}` })),
			{ userId: 'b', text: 'B の投稿' }
		];
		const picked = pickSampleTexts(notes, 10, 3);
		expect(picked).toHaveLength(4);
		expect(picked.filter((t) => t.startsWith('A'))).toHaveLength(3);
		expect(picked).toContain('B の投稿');
	});
});
