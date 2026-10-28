import { describe, expect, it } from 'vitest';
import type { Member } from './people';
import {
	buildPeopleAffinityRequests,
	buildPeopleIntentRequest,
	intentMatch,
	type PeopleIntent,
	type PersonState,
	parsePeopleAffinity,
	parsePeopleIntent
} from './people-intent';
import type { ClefAnswer } from './vibe';

const person = (acct: string): PersonState => ({
	acct,
	name: acct,
	description: 'ジャズと料理',
	pinned: [],
	chips: ['food'],
	topics: { food: 0.9, music: 0.6 },
	replyRatio: 0.5,
	notesPerDay: 2
});

describe('buildPeopleAffinityRequests', () => {
	it('16 人ずつのバッチに分け、各人の話題と投稿のしかたを言葉で渡す', () => {
		const people = Array.from({ length: 20 }, (_, i) => person(`u${i}@x`));
		const reqs = buildPeopleAffinityRequests(['ジャズの話がしたい'], people);
		expect(reqs).toHaveLength(2);
		expect(Object.keys(reqs[0].questions).filter((k) => k.startsWith('fit.'))).toHaveLength(16);
		const state = reqs[0].state as { people: { acct: string; topics: string[]; style: string }[] };
		expect(state.people[0].topics).toEqual(['食べ物・お酒 90%', '音楽・歌 60%']);
		expect(state.people[0].style).toContain('返信');
	});
});

describe('parsePeopleAffinity', () => {
	it('噛み合いの確率と、拒否の判定を取り出す', () => {
		const noul = (v: number): ClefAnswer => ({ type: 'noul', noul: v });
		const out = parsePeopleAffinity(
			[
				{ answers: { refuse: noul(0.1), 'fit.a@x': noul(0.8) } },
				{ answers: { 'fit.b@x': noul(0.3) } }
			],
			['a@x', 'b@x']
		);
		expect(out).toEqual({ refused: false, affinity: { 'a@x': 0.8, 'b@x': 0.3 } });
		expect(parsePeopleAffinity([{ answers: { refuse: noul(0.9) } }], []).refused).toBe(true);
	});
});

const noul = (v: number): ClefAnswer => ({ type: 'noul', noul: v });
const choice = (c: string): ClefAnswer => ({
	type: 'choice',
	choice: c,
	probabilities: { [c]: 1 },
	confidence: 1
});

describe('buildPeopleIntentRequest / parsePeopleIntent', () => {
	it('言葉を 1 回で、望む話題 15 軸・会話の型・夜型・投稿量・拒否に読む', () => {
		const req = buildPeopleIntentRequest(['深夜に小説の話をしたい']);
		const keys = Object.keys(req.questions);
		expect(keys.filter((k) => k.startsWith('want.'))).toHaveLength(15);
		expect(keys).toEqual(expect.arrayContaining(['style', 'night', 'pace', 'refuse']));
		expect(keys.length).toBeLessThanOrEqual(64);
		expect((req.state as { userMessages: string[] }).userMessages).toEqual([
			'深夜に小説の話をしたい'
		]);
	});
	it('答えを希望に直す。無い設問は 0 / any', () => {
		const got = parsePeopleIntent({
			'want.writing': noul(0.9),
			'want.food': noul(0.2),
			style: choice('talk'),
			night: noul(0.8),
			pace: choice('any'),
			refuse: noul(0.1)
		});
		expect(got.want.writing).toBe(0.9);
		expect(got.want.illust).toBe(0);
		expect(got.style).toBe('talk');
		expect(got.night).toBe(0.8);
		expect(got.pace).toBe('any');
		expect(got.refused).toBe(false);
		expect(parsePeopleIntent({ refuse: noul(0.8) }).refused).toBe(true);
	});
});

describe('intentMatch', () => {
	type Est = NonNullable<Member['estimate']>;
	const est = (
		over: Partial<Omit<Est, 'genre'>> & { genre?: Partial<Est['genre']> }
	): Member['estimate'] => ({
		genre: Object.assign(
			Object.fromEntries(
				[
					'general',
					'diary',
					'illust',
					'writing',
					'music',
					'making',
					'tech',
					'game',
					'anime',
					'fandom',
					'vr',
					'food',
					'animal',
					'vent',
					'niche'
				].map((g) => [g, 0])
			),
			over.genre ?? {}
		) as NonNullable<Member['estimate']>['genre'],
		replyRatio: over.replyRatio ?? 0,
		notesPerDay: over.notesPerDay ?? 1,
		nightRatio: over.nightRatio,
		sampleCount: 10,
		hash: 'h',
		at: 0
	});
	const want = (over: Partial<PeopleIntent>): PeopleIntent => ({
		want: { writing: 0.9 } as PeopleIntent['want'],
		style: 'any',
		night: 0,
		pace: 'any',
		refused: false,
		...over
	});
	it('望む話題を持つ人ほど高く、推定の無い人は中立', () => {
		const novelist = est({ genre: { writing: 0.9 } });
		const cook = est({ genre: { food: 0.9 } });
		expect(intentMatch(want({}), novelist)).toBeGreaterThan(intentMatch(want({}), cook));
		expect(intentMatch(want({}), null)).toBeCloseTo(0.5, 5);
	});
	it('会話したい・夜型・投稿量の希望は、返信の割合・夜の割合・投稿頻度で効く', () => {
		const talker = est({
			genre: { writing: 0.9 },
			replyRatio: 0.6,
			nightRatio: 0.5,
			notesPerDay: 8
		});
		const quiet = est({
			genre: { writing: 0.9 },
			replyRatio: 0.05,
			nightRatio: 0.0,
			notesPerDay: 0.3
		});
		expect(intentMatch(want({ style: 'talk' }), talker)).toBeGreaterThan(
			intentMatch(want({ style: 'talk' }), quiet)
		);
		expect(intentMatch(want({ night: 0.9 }), talker)).toBeGreaterThan(
			intentMatch(want({ night: 0.9 }), quiet)
		);
		expect(intentMatch(want({ pace: 'active' }), talker)).toBeGreaterThan(
			intentMatch(want({ pace: 'active' }), quiet)
		);
		expect(intentMatch(want({ pace: 'calm' }), quiet)).toBeGreaterThan(
			intentMatch(want({ pace: 'calm' }), talker)
		);
		// 希望が無い軸は差を付けない
		expect(intentMatch(want({}), talker)).toBeCloseTo(intentMatch(want({}), quiet), 5);
	});
});
