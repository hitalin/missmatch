import { describe, expect, it } from 'vitest';
import { featuresOf } from './features';
import { mk } from './fixtures.test-helper';
import {
	applyFilters,
	buildDeck,
	isJoinable,
	learn,
	scoreProfile,
	type Taste,
	tasteFit,
	tasteSummary,
	tasteWeight
} from './match';
import { defaultPreferences, type Preferences } from './prefs';
import { newSearch } from './search';
import type { Genre } from './types';

const emptyGenre = (): Record<Genre, number> => ({
	general: 0,
	diary: 0,
	illust: 0,
	writing: 0,
	music: 0,
	making: 0,
	tech: 0,
	game: 0,
	anime: 0,
	fandom: 0,
	vr: 0,
	food: 0,
	animal: 0,
	vent: 0,
	niche: 0
});

const prefs = (over: Partial<Preferences> = {}): Preferences => ({
	...defaultPreferences(),
	age: 'adult',
	nsfw: 'neutral',
	...over
});

describe('passesFilters', () => {
	const profiles = [
		mk({ host: 'ok.tld' }),
		mk({ host: 'en.tld', langs: ['en'] }),
		mk({ host: 'closed.tld', registration: 'closed', dru15: 5 }),
		mk({ host: 'invite.tld', registration: 'invite', dru15: 5 }),
		mk({ host: 'dead.tld', registration: 'closed', dru15: 0 }),
		mk({ host: 'approval.tld', registration: 'approval' }),
		mk({ host: 'adult.tld', ageRestriction: '18+' }),
		mk({ host: 'teen.tld', ageRestriction: '13+' }),
		mk({ host: 'ads.tld', adsEnabled: true }),
		mk({ host: 'fork.tld', officialMisskey: false, versionMonthsBehind: 5 }),
		mk({ host: 'small.tld', usersCount: 20, npd15: 5, emailRequired: false })
	];
	const hosts = (p: Preferences) => applyFilters(profiles, p).map((x) => x.server.host);

	it('既定は日本語・登録受付中（承認制含む）。年齢に合わない年齢制限のサーバーは出さない', () => {
		expect(isJoinable(profiles[1].server)).toBe(false);
		expect(hosts(prefs())).not.toContain('en.tld');
		expect(hosts(prefs())).not.toContain('closed.tld');
		expect(hosts(prefs())).not.toContain('invite.tld');
		expect(hosts(prefs())).toContain('approval.tld');
		expect(hosts(prefs())).toContain('adult.tld');
		expect(hosts(prefs({ age: 'minor' }))).not.toContain('adult.tld');
		expect(hosts(prefs({ age: 'minor' }))).toContain('teen.tld');
		// 12 歳未満には 13 歳以上限定も出さない
		expect(hosts(prefs({ age: 'child' }))).not.toContain('adult.tld');
		expect(hosts(prefs({ age: 'child' }))).not.toContain('teen.tld');
		expect(hosts(prefs({ age: 'child' }))).toContain('ok.tld');
	});

	it('毎日いる人の数（15 日平均の読者数）で絞る', () => {
		const ps = [
			mk({ host: 'quiet.tld', dru15: 3 }),
			mk({ host: 'some.tld', dru15: 40 }),
			mk({ host: 'busy.tld', dru15: 300 })
		];
		const hs = (activity: Preferences['activity']) =>
			applyFilters(ps, prefs({ activity })).map((x) => x.server.host);
		expect(hs('any')).toEqual(['quiet.tld', 'some.tld', 'busy.tld']);
		expect(hs('some')).toEqual(['some.tld', 'busy.tld']);
		expect(hs('lively')).toEqual(['busy.tld']);
	});

	it('機能と運営の絶対条件で絞る', () => {
		const ps = [
			mk({
				host: 'full.tld',
				ltlAvailable: true,
				noteSearch: true,
				translator: true,
				chat: true,
				videoUpload: true,
				driveCapacityMb: 20480,
				hasTos: true,
				hasPrivacyPolicy: true
			}),
			mk({
				host: 'bare.tld',
				ltlAvailable: false,
				noteSearch: false,
				translator: false,
				chat: false,
				videoUpload: false,
				driveCapacityMb: 1024,
				hasTos: false,
				hasPrivacyPolicy: false
			})
		];
		const only = (d: Partial<Preferences['dealbreakers']>) =>
			applyFilters(ps, prefs({ dealbreakers: { ...defaultPreferences().dealbreakers, ...d } })).map(
				(x) => x.server.host
			);
		for (const key of [
			'ltl',
			'noteSearch',
			'translator',
			'chat',
			'videoUpload',
			'bigDrive',
			'tos',
			'privacyPolicy'
		] as const) {
			expect(only({ [key]: true })).toEqual(['full.tld']);
		}
		expect(only({})).toEqual(['full.tld', 'bare.tld']);
	});

	it('招待制・停止中を含める設定なら生きているものだけ出す（休眠は出さない）', () => {
		const all = hosts(prefs({ registrations: ['open', 'approval', 'invite', 'closed'] }));
		expect(all).toContain('invite.tld');
		expect(all).toContain('closed.tld');
		expect(all).not.toContain('dead.tld');
		expect(hosts(prefs({ registrations: ['invite'] }))).toEqual(['invite.tld']);
	});

	it('絶対条件はハードフィルターになる', () => {
		expect(
			hosts(prefs({ dealbreakers: { ...defaultPreferences().dealbreakers, adsFree: true } }))
		).not.toContain('ads.tld');
		expect(
			hosts(
				prefs({
					dealbreakers: { ...defaultPreferences().dealbreakers, official: true, fresh: true }
				})
			)
		).not.toContain('fork.tld');
		expect(
			hosts(prefs({ dealbreakers: { ...defaultPreferences().dealbreakers, emailFree: true } }))
		).toEqual(['small.tld']);
	});

	it('規模と流速は選んだ区分だけ残し、空なら絞らない', () => {
		expect(hosts(prefs({ scales: ['small'] }))).toEqual(['small.tld']);
		expect(hosts(prefs({ paces: ['quiet'] }))).toEqual(['small.tld']);
		expect(hosts(prefs({ scales: ['personal'] }))).toEqual([]);
		expect(hosts(prefs({ scales: [], paces: [] })).length).toBe(7);
	});
});

describe('scoreProfile', () => {
	it('話題・空気感・R-18 の設定が点と理由になる', () => {
		const p = prefs({
			nsfw: 'avoid',
			topics: ['illust', 'tech'],
			tone: 'right',
			community: 'right'
		});
		const m = scoreProfile(mk(), p);
		expect(m.score).toBeGreaterThan(80);
		expect(m.reasons).toContain('イラスト・漫画を描くの話題が多い');
		expect(m.reasons).toContain('空気が穏やか');
		const nsfw = scoreProfile(mk({}, { nsfw: 0.9 }), p).score;
		expect(nsfw).toBeLessThan(m.score - 20);
	});

	it('設定が何も無ければ全員 50 点で、雰囲気未判定は中立', () => {
		expect(scoreProfile(mk(), prefs()).score).toBe(50);
		expect(scoreProfile(mk({}, null), prefs({ topics: ['illust'] })).score).toBe(50);
	});

	it('検索語があるときは噛み合いが主で、好みは従（好みが完璧でも噛み合わない鯖は下）', () => {
		const p = prefs({ nsfw: 'avoid', topics: ['illust'], tone: 'right' });
		const affinity = { 'yami.tld': 0.95, 'other.tld': 0.1 };
		// yami は好み（創作・ほのぼの・R-18 少なめ）には全く合わないが、文章には噛み合う
		const yami = scoreProfile(
			mk({ host: 'yami.tld' }, { genre: { ...emptyGenre(), vent: 0.95 }, tone: 0.3, nsfw: 0.5 }),
			p,
			{},
			0,
			affinity
		);
		// other は好みには完璧に合うが、文章には噛み合わない
		const other = scoreProfile(mk({ host: 'other.tld' }), p, {}, 0, affinity);
		expect(yami.score).toBeGreaterThan(other.score);
		expect(yami.reasons[0]).toBe('書いてくれた希望と噛み合う');
		expect(yami.affinity).toBe(0.95);
		expect(scoreProfile(mk(), p).affinity).toBeUndefined();
		// 噛み合い 0.95 が 75% を占めるので、好みが低くても 71 点以上。逆は 33 点以下
		expect(yami.score).toBeGreaterThanOrEqual(71);
		expect(other.score).toBeLessThanOrEqual(33);
	});
});

describe('スワイプからの学習', () => {
	it('いいねした鯖の特徴に寄り、パスした鯖の特徴から離れる', () => {
		let taste: Taste = {};
		taste = learn(
			taste,
			featuresOf(
				mk(
					{ usersCount: 3 },
					{
						genre: {
							general: 0,
							diary: 0,
							illust: 0.9,
							writing: 0,
							music: 0,
							making: 0,
							tech: 0,
							game: 0,
							anime: 0,
							fandom: 0,
							vr: 0,
							food: 0,
							animal: 0,
							vent: 0,
							niche: 0
						}
					}
				)
			),
			'like'
		);
		expect(taste['genre.illust']).toBeGreaterThan(0);
		expect(taste.scale).toBeLessThan(0);
		taste = learn(taste, featuresOf(mk({ usersCount: 50000 })), 'pass');
		expect(taste.scale).toBeLessThan(-0.3);
	});

	it('絶対条件の領分（メアド・広告・GTL・更新）は学習せず、話題と容量は好きな方向だけ学ぶ', () => {
		const noTech = featuresOf(
			mk(
				{ emailRequired: true, adsEnabled: true },
				{
					genre: {
						general: 0.9,
						diary: 0,
						illust: 0,
						writing: 0,
						music: 0,
						making: 0,
						tech: 0,
						game: 0,
						anime: 0,
						fandom: 0,
						vr: 0,
						food: 0,
						animal: 0,
						vent: 0,
						niche: 0
					}
				}
			)
		);
		let taste: Taste = {};
		for (let i = 0; i < 5; i++) taste = learn(taste, noTech, 'like');
		expect(taste.emailFree).toBeUndefined();
		expect(taste.adsFree).toBeUndefined();
		expect(taste['genre.tech']).toBe(0); // 「技術が少ない鯖が好き」にはならない
		expect(taste['genre.general']).toBeGreaterThan(0.5);
		expect(tasteSummary(taste).map((c) => c.label)).not.toContain('技術は少なめ');
	});

	it('パスはいいねより弱く、値は -1..1 に収まる', () => {
		const f = featuresOf(mk({ usersCount: 50000 }));
		const like = learn({}, f, 'like').scale ?? 0;
		const pass = learn({}, f, 'pass').scale ?? 0;
		expect(Math.abs(pass)).toBeLessThan(like);
		let t: Taste = {};
		for (let i = 0; i < 20; i++) t = learn(t, f, 'like');
		expect(t.scale).toBe(1);
	});

	it('学習した好みに近い鯖の tasteFit が高く、好みが無ければ null', () => {
		const taste: Taste = { scale: -1, 'genre.illust': 1 };
		const small = tasteFit(featuresOf(mk({ usersCount: 10 })), taste) ?? 0;
		const large = tasteFit(featuresOf(mk({ usersCount: 50000 })), taste) ?? 0;
		expect(small).toBeGreaterThan(large);
		expect(tasteFit(featuresOf(mk()), {})).toBeNull();
	});

	it('学習の重みはスワイプ数とともに増え、採点に入ると順位が変わる', () => {
		expect(tasteWeight(0)).toBe(0);
		expect(tasteWeight(8)).toBe(3);
		const taste: Taste = { scale: -1 };
		const small = mk({ host: 's.tld', usersCount: 10, dru15: 1 });
		const large = mk({ host: 'l.tld', usersCount: 50000, dru15: 1000 });
		const before = buildDeck([small, large], prefs(), taste, 0, newSearch(), 2).map(
			(m) => m.server.host
		);
		const after = buildDeck([small, large], prefs(), taste, 8, newSearch(), 2).map(
			(m) => m.server.host
		);
		expect(before[0]).toBe('l.tld'); // 同点なら活発な順
		expect(after[0]).toBe('s.tld');
	});

	it('tasteSummary は目立つ好みだけを言葉にする', () => {
		const chips = tasteSummary({ scale: -0.8, 'genre.vent': 0.6, tone: 0.1 });
		expect(chips.map((c) => c.label)).toEqual(['小規模', '愚痴・弱音']);
	});
});

describe('buildDeck', () => {
	it('スワイプ済みを除き、フィルターを通ったものを相性順に上限まで', () => {
		const profiles = [
			mk({ host: 'a.tld' }),
			mk({ host: 'b.tld' }, { nsfw: 0.9 }),
			mk({ host: 'c.tld' })
		];
		const search = { ...newSearch(), liked: ['a.tld'] };
		const deck = buildDeck(profiles, prefs({ nsfw: 'avoid' }), {}, 0, search, 10);
		expect(deck.map((m) => m.server.host)).toEqual(['c.tld', 'b.tld']);
	});

	it('検索の噛み合いで並び、別の検索でスワイプした鯖は除かれない', () => {
		const profiles = [mk({ host: 'a.tld' }), mk({ host: 'b.tld' })];
		const search = {
			...newSearch('病み垢'),
			affinity: { 'a.tld': 0.2, 'b.tld': 0.9 },
			affinityFor: '病み垢'
		};
		const deck = buildDeck(profiles, prefs(), {}, 0, search, 10);
		expect(deck.map((m) => m.server.host)).toEqual(['b.tld', 'a.tld']);
		expect(deck[0].reasons).toContain('書いてくれた希望と噛み合う');
	});
});
