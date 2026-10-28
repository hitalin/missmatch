import { describe, expect, it } from 'vitest';
import type { Member } from './people';
import {
	activityOf,
	commonFollowing,
	diversify,
	matchesOf,
	pickDeck,
	type Relation,
	rankCandidates,
	rationSize,
	reciprocityOf,
	tasteOf,
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
	it('重み付きの合算: あなたをフォローしている人 > 共通のフォロー先 > 話題の近さ > 新着（他の信号が同じなら）', () => {
		const ranked = rankCandidates(me, [fresh, topic, common, follower], relations, following);
		expect(ranked.map((r) => r.member.acct)).toEqual(['fol@x', 'com@y', 'top@z', 'new@z']);
		expect(ranked[0].badges).toEqual({ followsYou: true, common: 0, sameHost: true });
		expect(ranked[1].badges.common).toBe(2);
		expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
	});
	it('言葉があるときは Clef の噛み合いが最も重く、無い人は希望との一致で埋める', () => {
		const a = member({ acct: 'a@y', userId: 'a', host: 'y' });
		const b = member({ acct: 'b@y', userId: 'b', host: 'y' });
		const c = member({
			acct: 'c@y',
			userId: 'c',
			host: 'y',
			estimate: {
				genre: genre({ writing: 0.9 }),
				replyRatio: 0,
				notesPerDay: 1,
				sampleCount: 10,
				hash: 'h',
				at: 0
			}
		});
		const intent = {
			want: { writing: 0.9 },
			style: 'any',
			night: 0,
			pace: 'any',
			refused: false
		} as const;
		const ranked = rankCandidates(
			me,
			[a, b, c],
			{},
			{},
			{ intent, fit: { 'a@y': 0.9, 'b@y': 0.2 } }
		);
		expect(ranked[0].member.acct).toBe('a@y');
		expect(ranked[0].signals.fit).toBe(0.9);
		expect(ranked.find((r) => r.member.acct === 'c@y')?.signals.fit).toBeNull();
		expect(ranked.find((r) => r.member.acct === 'c@y')?.signals.intent).toBeGreaterThan(0.5);
	});
	it('最近の活動・フォロー返しの見込み・いいねから学んだ好みが加点になる', () => {
		const now = Date.UTC(2026, 9, 28);
		const day = 24 * 60 * 60 * 1000;
		const active = member({ acct: 'act@y', userId: 'act', host: 'y' });
		const stale = member({ acct: 'old@y', userId: 'old', host: 'y' });
		const details = {
			'act@y': { followersCount: 100, followingCount: 120, updatedAt: now - day },
			'old@y': { followersCount: 100, followingCount: 120, updatedAt: now - 60 * day }
		};
		const ranked = rankCandidates(me, [stale, active], {}, {}, { details, now });
		expect(ranked.map((r) => r.member.acct)).toEqual(['act@y', 'old@y']);
		expect(ranked[0].signals.activity).toBeGreaterThan(ranked[1].signals.activity);

		const cook = member({
			acct: 'cook@y',
			userId: 'cook',
			host: 'y',
			estimate: {
				genre: genre({ food: 0.9 }),
				replyRatio: 0,
				notesPerDay: 1,
				sampleCount: 10,
				hash: 'h',
				at: 0
			}
		});
		const coder = member({
			acct: 'code@y',
			userId: 'code',
			host: 'y',
			estimate: {
				genre: genre({ tech: 0.9 }),
				replyRatio: 0,
				notesPerDay: 1,
				sampleCount: 10,
				hash: 'h',
				at: 0
			}
		});
		const likedCooks = [1, 2, 3].map((i) =>
			member({
				acct: `l${i}@y`,
				userId: `l${i}`,
				estimate: {
					genre: genre({ food: 0.8 }),
					replyRatio: 0,
					notesPerDay: 1,
					sampleCount: 10,
					hash: 'h',
					at: 0
				}
			})
		);
		const me2 = member({ acct: 'me@x', userId: 'me', host: 'x' }); // 自分の話題は空
		const r2 = rankCandidates(me2, [coder, cook], {}, {}, { liked: likedCooks });
		expect(r2[0].member.acct).toBe('cook@y');
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

describe('signals', () => {
	it('activityOf: 1 日以内は 1、30 日で 0、不明は 0.3', () => {
		const now = 1_000_000_000_000;
		const day = 24 * 60 * 60 * 1000;
		expect(activityOf(now - day / 2, now)).toBe(1);
		expect(activityOf(now - 30 * day, now)).toBe(0);
		expect(activityOf(now - 15 * day, now)).toBeCloseTo(0.5, 1);
		expect(activityOf(null, now)).toBe(0.3);
	});
	it('reciprocityOf: フォロー返ししそうな人（フォロー数がフォロワー数に見合う）ほど高く、有名人は低い', () => {
		expect(reciprocityOf(100, 100)).toBeCloseTo(0.5, 5);
		expect(reciprocityOf(10000, 50)).toBeLessThan(0.1);
		expect(reciprocityOf(0, 0)).toBe(0.5);
		expect(reciprocityOf(undefined, undefined)).toBe(0.5);
	});
	it('tasteOf: いいね 3 人未満なら 0。いいねの中心に近いほど正、よくないねの中心に近いほど負', () => {
		const e = (g: Partial<Record<string, number>>) => ({
			genre: genre(g),
			replyRatio: 0,
			notesPerDay: 1,
			sampleCount: 10,
			hash: 'h',
			at: 0
		});
		const cooks = [1, 2, 3].map((i) =>
			member({ acct: `c${i}@y`, userId: `c${i}`, estimate: e({ food: 0.8 }) })
		);
		const cook = member({ acct: 'x@y', userId: 'x', estimate: e({ food: 0.9 }) });
		const coder = member({ acct: 'z@y', userId: 'z', estimate: e({ tech: 0.9 }) });
		expect(tasteOf(cooks.slice(0, 2), [], cook)).toBe(0);
		expect(tasteOf(cooks, [], cook)).toBeGreaterThan(0.9);
		expect(tasteOf(cooks, [], coder)).toBeCloseTo(0, 5);
		expect(tasteOf(cooks, [coder, coder, coder], coder)).toBeLessThan(0);
	});
	it('pickDeck: 順位どおりに揃えたあと、最後の 1 枚を圏外から 1 人入れて探索する', () => {
		const items = Array.from({ length: 20 }, (_, i) => ({
			acct: `u${i}@h${i % 5}`,
			host: `h${i % 5}`
		}));
		const picked = pickDeck(
			items,
			(x) => x.host,
			10,
			4,
			() => 0.5
		);
		expect(picked).toHaveLength(10);
		expect(picked.slice(0, 9).map((x) => x.acct)).toEqual(items.slice(0, 9).map((x) => x.acct));
		expect(items.slice(10).map((x) => x.acct)).toContain(picked[9].acct);
		// 圏外が無ければ探索枠は作らない
		expect(
			pickDeck(
				items.slice(0, 10),
				(x) => x.host,
				10,
				4,
				() => 0.5
			).map((x) => x.acct)
		).toEqual(items.slice(0, 10).map((x) => x.acct));
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
