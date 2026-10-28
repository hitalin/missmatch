import { describe, expect, it } from 'vitest';
import type { Member } from './people';
import {
	commonFollowing,
	diversify,
	matchesOf,
	type Relation,
	rankCandidates,
	rationSize,
	topicScore
} from './people-deck';

const genre = (over: Partial<Record<string, number>> = {}) =>
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
		].map((g) => [g, over[g] ?? 0])
	) as Member['estimate'] extends infer E ? (E extends { genre: infer G } ? G : never) : never;
const member = (over: Partial<Member>): Member => ({
	version: 1,
	host: 'a.tld',
	userId: 'u',
	username: 'u',
	name: 'u',
	acct: 'u@a.tld',
	joinedAt: 0,
	chips: [],
	profileOnly: false,
	followingPublic: true,
	noteIds: [],
	estimate: { genre: genre(), replyRatio: 0, notesPerDay: 1, sampleCount: 10, hash: 'h', at: 0 },
	warning: null,
	hidden: null,
	...over
});
const rel = (over: Partial<Relation> = {}): Relation => ({
	isFollowing: false,
	isFollowed: false,
	hasPendingFollowRequestFromYou: false,
	isBlocking: false,
	isBlocked: false,
	isMuted: false,
	...over
});

describe('commonFollowing / topicScore', () => {
	it('共通のフォロー先の数', () => {
		expect(commonFollowing(['a@x', 'b@x', 'c@x'], ['b@x', 'c@x', 'd@x'])).toBe(2);
		expect(commonFollowing([], ['a@x'])).toBe(0);
	});
	it('話題は自己申告のチップを優先し、無ければ推定で比べる', () => {
		const me = member({ chips: ['food', 'music'] });
		const same = member({ acct: 's', chips: ['food'] });
		const est = member({
			acct: 'e',
			chips: [],
			estimate: {
				...(me.estimate as NonNullable<Member['estimate']>),
				genre: genre({ food: 0.9, music: 0.8 })
			}
		});
		const far = member({ acct: 'f', chips: ['tech'] });
		expect(topicScore(me, same)).toBeGreaterThan(topicScore(me, far));
		expect(topicScore(me, est)).toBeGreaterThan(topicScore(me, far));
	});
});

describe('rankCandidates', () => {
	const me = member({ acct: 'me@x', userId: 'me', host: 'x', chips: ['food'] });
	const follower = member({ acct: 'fol@x', userId: 'fol', host: 'x', joinedAt: 1 });
	const common = member({ acct: 'com@y', userId: 'com', host: 'y', joinedAt: 2 });
	const topic = member({ acct: 'top@z', userId: 'top', host: 'z', chips: ['food'], joinedAt: 3 });
	const fresh = member({ acct: 'new@z', userId: 'new', host: 'z', joinedAt: 9 });
	const relations: Record<string, Relation> = { 'fol@x': rel({ isFollowed: true }) };
	const following: Record<string, string[]> = { 'me@x': ['p@q', 'r@q'], 'com@y': ['p@q', 'r@q'] };
	it('①あなたをフォローしている人 ②共通のフォロー先 ③話題 ④新着 の順', () => {
		const ranked = rankCandidates(me, [fresh, topic, common, follower], relations, following);
		expect(ranked.map((r) => r.member.acct)).toEqual(['fol@x', 'com@y', 'top@z', 'new@z']);
		expect(ranked[0].badges).toEqual({ followsYou: true, common: 0, sameHost: true });
		expect(ranked[1].badges.common).toBe(2);
	});
	it('自分・非表示・フォロー済み・ブロック関係・いいね済み・よくないね済みは出さない', () => {
		const hidden = member({
			acct: 'h@x',
			userId: 'h',
			hidden: { kind: 'report', noteIds: [], at: 0 }
		});
		const followed = member({ acct: 'f2@x', userId: 'f2' });
		const blocked = member({ acct: 'b@x', userId: 'b' });
		const liked = member({ acct: 'l@x', userId: 'l' });
		const ranked = rankCandidates(
			me,
			[me, hidden, followed, blocked, liked, fresh],
			{ 'f2@x': rel({ isFollowing: true }), 'b@x': rel({ isBlocked: true }) },
			{},
			{ exclude: new Set(['l@x']) }
		);
		expect(ranked.map((r) => r.member.acct)).toEqual(['new@z']);
	});
	it('フォロー一覧が公開でない相手とは共通のフォロー先を計算しない', () => {
		const priv = member({ acct: 'p@y', userId: 'p', host: 'y', followingPublic: false });
		const ranked = rankCandidates(me, [priv], {}, { 'me@x': ['p@q'], 'p@y': ['p@q'] });
		expect(ranked[0].badges.common).toBe(0);
	});
});

describe('diversify / rationSize', () => {
	it('同じサーバーは 10 枚中 4 枚まで（足りなければ順位どおりに埋める）', () => {
		const items = ['a', 'b', 'c'].flatMap((h) =>
			Array.from({ length: 6 }, (_, i) => ({ host: h, id: `${h}${i}` }))
		);
		const out = diversify(items, (x) => x.host, 10, 4);
		expect(out.filter((x) => x.host === 'a')).toHaveLength(4);
		expect(out.filter((x) => x.host === 'c')).toHaveLength(2);
		expect(out).toHaveLength(10);
		// 2 サーバーしか無ければ上限を超えて埋める
		expect(
			diversify(
				items.filter((x) => x.host !== 'c'),
				(x) => x.host,
				10,
				4
			)
		).toHaveLength(10);
	});
	it('参加 100 人までは 1 日 10 枚、それ以上は 30 枚', () => {
		expect(rationSize(30)).toBe(10);
		expect(rationSize(500)).toBe(30);
	});
});

describe('matchesOf', () => {
	it('参加者 ∩ 自分のフォロー ∩ 自分のフォロワー', () => {
		const a = member({ acct: 'a@x' });
		const b = member({ acct: 'b@x' });
		const c = member({ acct: 'c@x' });
		expect(matchesOf([a, b, c], ['a@x', 'b@x', 'z@x'], ['b@x', 'c@x']).map((m) => m.acct)).toEqual([
			'b@x'
		]);
	});
});
