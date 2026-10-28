import { describe, expect, it } from 'vitest';
import { buildMemberRequest, judgeMember, parseMemberAnswers } from './people-clef';
import type { ClefAnswer } from './vibe';

const notes = [
	{ id: 'n1', text: 'ジャズの新譜を聴きながらカレーを煮込む夜' },
	{ id: 'n2', text: '彼女募集中です。年上希望。DM ください' }
];

describe('buildMemberRequest', () => {
	it('話題の設問と、募集の表明（bio と各ノート）・宣伝の設問を 1 本にまとめる', () => {
		const req = buildMemberRequest({
			name: 'たか',
			description: 'ジャズと料理',
			fields: [{ name: 'site', value: 'https://x' }],
			pinned: ['固定ノートの本文'],
			notes
		});
		expect(req.model).toBe('clef');
		expect(Object.keys(req.questions)).toEqual(
			expect.arrayContaining([
				'genre.general',
				'genre.vent',
				'seeking.bio',
				'seeking.n1',
				'seeking.n2',
				'ads'
			])
		);
		expect(Object.keys(req.questions).length).toBeLessThanOrEqual(64);
		const state = req.state as { notes: { id: string; text: string }[]; description: string };
		expect(state.notes).toHaveLength(2);
		expect(state.description).toBe('ジャズと料理');
	});
	it('ノートが 64 本の上限を超えないよう、設問は 50 本までに切る', () => {
		const many = Array.from({ length: 60 }, (_, i) => ({ id: `n${i}`, text: `本文 ${i}` }));
		const req = buildMemberRequest({
			name: 'x',
			description: '',
			fields: [],
			pinned: [],
			notes: many
		});
		expect(Object.keys(req.questions).length).toBeLessThanOrEqual(64);
	});
});

describe('parseMemberAnswers / judgeMember', () => {
	const noul = (v: number): ClefAnswer => ({ type: 'noul', noul: v });
	const answers: Record<string, ClefAnswer> = {
		'genre.general': noul(0.8),
		'genre.food': noul(0.9),
		'seeking.bio': noul(0.1),
		'seeking.n1': noul(0.05),
		'seeking.n2': noul(0.95),
		ads: noul(0.1)
	};
	it('話題の確率と、募集の表明があったノートの id を取り出す', () => {
		const r = parseMemberAnswers(
			answers,
			notes.map((n) => n.id)
		);
		expect(r.genre.food).toBe(0.9);
		expect(r.genre.illust).toBe(0); // 無い設問は 0
		expect(r.seekingNotes).toEqual(['n2']);
		expect(r.seekingBio).toBe(false);
	});
	it('ノート 1 件の募集は警告（該当ノートの id 付き）、2 件以上か bio なら拒否', () => {
		expect(judgeMember(parseMemberAnswers(answers, ['n1', 'n2']))).toEqual({
			verdict: 'warn',
			noteIds: ['n2']
		});
		expect(
			judgeMember(parseMemberAnswers({ ...answers, 'seeking.n1': noul(0.9) }, ['n1', 'n2']))
		).toEqual({ verdict: 'reject', kind: 'seeking', noteIds: ['n1', 'n2'] });
		expect(
			judgeMember(parseMemberAnswers({ ...answers, 'seeking.bio': noul(0.9) }, ['n1', 'n2']))
		).toEqual({
			verdict: 'reject',
			kind: 'seeking',
			noteIds: ['n2']
		});
	});
	it('宣伝は拒否', () => {
		expect(
			judgeMember(
				parseMemberAnswers({ ...answers, 'seeking.n2': noul(0.1), ads: noul(0.9) }, ['n1', 'n2'])
			)
		).toEqual({ verdict: 'reject', kind: 'ads', noteIds: [] });
	});
	it('何も無ければ ok', () => {
		expect(
			judgeMember(parseMemberAnswers({ ...answers, 'seeking.n2': noul(0.1) }, ['n1', 'n2']))
		).toEqual({ verdict: 'ok' });
	});
});
