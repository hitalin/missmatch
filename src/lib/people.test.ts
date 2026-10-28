import { describe, expect, it } from 'vitest';
import {
	eligibleNotes,
	joinEligibility,
	type MisskeyNote,
	nightRatio,
	normalizeAcct,
	notesPerDay,
	replyRatio,
	representativeNoteIds,
	serverCap
} from './people';

const day = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 9, 28);
const note = (over: Partial<MisskeyNote> = {}): MisskeyNote => ({
	id: 'n1',
	createdAt: new Date(now - day).toISOString(),
	text: 'きょうはジャズを聴きながらカレーを煮込んでいる。スパイスの配合をまた変えた',
	cw: null,
	visibility: 'public',
	localOnly: false,
	renoteId: null,
	renote: null,
	replyId: null,
	fileIds: [],
	reactions: {},
	...over
});

describe('eligibleNotes', () => {
	it('公開・CW なし・連合あり・8 字以上の本文だけを残し、本文は整形する', () => {
		const out = eligibleNotes([
			note({
				id: 'ok',
				text: 'https://example.com/x きょうはジャズを聴きながらカレーを煮込んでいる @someone'
			}),
			note({ id: 'home', visibility: 'home' }),
			note({ id: 'cw', cw: '体調' }),
			note({ id: 'local', localOnly: true }),
			note({ id: 'short', text: 'ねむい' }),
			note({ id: 'files', text: null, fileIds: ['f1'] })
		]);
		expect(out.map((n) => n.id)).toEqual(['ok']);
		expect(out[0].text).toBe('きょうはジャズを聴きながらカレーを煮込んでいる');
	});
	it('純リノートは外し、引用リノートは本人の本文だけ使う', () => {
		const out = eligibleNotes([
			note({
				id: 'pure',
				text: null,
				renoteId: 'r1',
				renote: { text: '他人の本文がここにある長い文章です' }
			}),
			note({
				id: 'quote',
				text: 'この話、自分も先週まったく同じことを考えていた',
				renoteId: 'r2',
				renote: { text: '他人の本文' }
			})
		]);
		expect(out.map((n) => n.id)).toEqual(['quote']);
		expect(out[0].text).not.toContain('他人の本文');
	});
});

describe('nightRatio', () => {
	it('日本時間 0〜5 時台に投稿した割合', () => {
		const at = (iso: string) => ({
			id: iso,
			text: 'x',
			createdAt: Date.parse(iso),
			isReply: false,
			reactions: 0
		});
		expect(nightRatio([])).toBe(0);
		expect(
			nightRatio([
				at('2026-10-28T16:30:00Z'), // 01:30 JST
				at('2026-10-28T20:00:00Z'), // 05:00 JST
				at('2026-10-28T21:00:00Z'), // 06:00 JST
				at('2026-10-28T03:00:00Z') // 12:00 JST
			])
		).toBe(0.5);
	});
});

describe('representativeNoteIds / replyRatio / notesPerDay', () => {
	const notes = eligibleNotes([
		note({ id: 'a', reactions: { '👍': 3 }, createdAt: new Date(now - 10 * day).toISOString() }),
		note({ id: 'b', reactions: { '👍': 1, '❤': 1 }, replyId: 'x' }),
		note({ id: 'c', reactions: {}, createdAt: new Date(now - 5 * day).toISOString() }),
		note({
			id: 'd',
			reactions: { '🎉': 5 },
			replyId: 'y',
			createdAt: new Date(now - 2 * day).toISOString()
		})
	]);
	it('反応の多い順に 3 件。同数なら新しい順', () => {
		expect(representativeNoteIds(notes, 3)).toEqual(['d', 'a', 'b']);
	});
	it('返信の割合と 1 日あたりの投稿数', () => {
		expect(replyRatio(notes)).toBe(0.5);
		expect(notesPerDay(notes)).toBeCloseTo(4 / 9, 2); // 最古から最新まで 9 日に 4 件
	});
	it('1 件しか無ければ 1 日 1 件と数える', () => {
		expect(notesPerDay(notes.slice(0, 1))).toBe(1);
	});
});

describe('joinEligibility', () => {
	it('ノートが無くても参加できる（年齢やアカウントの古さも見ない）', () => {
		expect(joinEligibility({ eligibleCount: 3 })).toEqual({ ok: true });
		expect(joinEligibility({ eligibleCount: 0 })).toEqual({ ok: true });
	});
});

describe('normalizeAcct / serverCap', () => {
	it('acct は小文字で @ を外す', () => {
		expect(normalizeAcct('@Taka@Misskey.IO')).toBe('taka@misskey.io');
		expect(normalizeAcct('taka', 'misskey.io')).toBe('taka@misskey.io');
	});
	it('サーバーごとの上限は毎日読む人の 10% か 5 人の大きい方', () => {
		expect(serverCap(1000)).toBe(100);
		expect(serverCap(20)).toBe(5);
		expect(serverCap(null)).toBe(5);
	});
});
