import { describe, expect, it } from 'vitest';
import { defaultPreferences } from './prefs';
import {
	currentSearch,
	deleteSearch,
	emptyProfile,
	PREFS_VERSION,
	parseSavedProfile,
	patchSearch,
	renameSearch,
	selectSearch
} from './profile';
import { newSearch } from './search';

describe('parseSavedProfile', () => {
	it('壊れた JSON や未知の値は捨てて既定値にする', () => {
		expect(parseSavedProfile(null)).toEqual(emptyProfile());
		expect(parseSavedProfile('{')).toEqual(emptyProfile());
		expect(parseSavedProfile('"str"')).toEqual(emptyProfile());
	});

	it('妥当な値だけ残し、設定項目の増減に耐える', () => {
		const p = parseSavedProfile(
			JSON.stringify({
				prefsVersion: PREFS_VERSION,
				prefs: {
					age: 'minor',
					activity: 'lively',
					nsfw: 'welcome',
					registrations: ['invite', 'bogus'],
					scales: ['small', 'huge'],
					paces: 'busy',
					topics: ['vent', 'cooking'],
					tone: 'right',
					rules: 'nope',
					dealbreakers: { adsFree: true, removed: true, gtl: 'yes' }
				},
				taste: { scale: -0.5, bogus: 5 },
				swipes: 3.7,
				searches: [
					{
						id: 's1',
						query: '病み垢',
						title: '弱音用',
						turns: ['小さめ', 3],
						affinity: { 'a.tld': 0.9, 'b.tld': 2 },
						affinityFor: '病み垢\n小さめ',
						unsure: ['scale', 'bogus'],
						liked: ['a.tld', 1],
						passed: null,
						at: 100
					},
					{ id: 7, query: 'id が無いので捨てる' },
					'bogus'
				],
				current: 's1'
			})
		);
		expect(p.prefs.age).toBe('minor');
		expect(p.prefs.activity).toBe('lively');
		expect(p.prefs.nsfw).toBe('welcome');
		expect(p.prefs.registrations).toEqual(['invite']);
		expect(p.prefs.scales).toEqual(['small']);
		expect(p.prefs.paces).toEqual([]);
		expect(p.prefs.topics).toEqual(['vent']);
		expect(p.prefs.tone).toBe('right');
		expect(p.prefs.rules).toBe('any');
		expect(p.prefs.dealbreakers.adsFree).toBe(true);
		expect(p.prefs.dealbreakers.gtl).toBe(false);
		expect(p.searches).toEqual([
			{
				id: 's1',
				query: '病み垢',
				title: '弱音用',
				turns: ['小さめ'],
				affinity: { 'a.tld': 0.9 },
				affinityFor: '病み垢\n小さめ',
				unsure: ['scale'],
				intent: {},
				choices: {},
				// 旧形式の全体の好みは、開いていた検索に移す
				taste: { scale: -0.5 },
				swipes: 3,
				liked: ['a.tld'],
				passed: [],
				at: 100
			}
		]);
		expect(p.current).toBe('s1');
	});

	it('検索ごとの読み取り・聞き返しの答え・学習した好みを読む', () => {
		const p = parseSavedProfile(
			JSON.stringify({
				searches: [
					{
						id: 'x',
						query: 'a',
						intent: {
							tone: {
								type: 'choice',
								choice: 'right',
								probabilities: { right: 0.9 },
								confidence: 0.9
							},
							'topic.game': { type: 'noul', noul: 0.8 },
							bogus: { type: 'nope' }
						},
						choices: { scale: 'small', pace: 3, nope: 'x' },
						taste: { tone: 0.4, bogus: 9 },
						swipes: 2
					}
				]
			})
		);
		const s = p.searches[0];
		expect(Object.keys(s.intent).sort()).toEqual(['tone', 'topic.game']);
		expect(s.choices).toEqual({ scale: 'small' });
		expect(s.taste).toEqual({ tone: 0.4 });
		expect(s.swipes).toBe(2);
	});

	it('読み取り結果が全体の設定に書き込まれていた頃の保存値は、絞り込みと加点を初期値に戻す（年齢・R-18・登録のしかたは残す）', () => {
		const old = {
			prefs: {
				age: 'adult',
				nsfw: 'welcome',
				registrations: ['open', 'invite'],
				activity: 'lively',
				scales: ['small'],
				paces: ['quiet'],
				topics: ['game'],
				tone: 'right',
				community: 'left',
				rules: 'right',
				dealbreakers: { emailFree: true, chat: true }
			}
		};
		const p = parseSavedProfile(JSON.stringify(old)).prefs;
		const d = defaultPreferences();
		expect(p.age).toBe('adult');
		expect(p.nsfw).toBe('welcome');
		expect(p.registrations).toEqual(['open', 'invite']);
		expect(p.activity).toBe(d.activity);
		expect(p.scales).toEqual([]);
		expect(p.paces).toEqual([]);
		expect(p.topics).toEqual([]);
		expect([p.tone, p.community, p.rules]).toEqual(['any', 'any', 'any']);
		expect(p.dealbreakers).toEqual(d.dealbreakers);
		// 今の形式で保存したものはそのまま
		const now = parseSavedProfile(JSON.stringify({ ...old, prefsVersion: PREFS_VERSION })).prefs;
		expect(now.topics).toEqual(['game']);
		expect(now.dealbreakers.emailFree).toBe(true);
	});

	it('年齢: 旧形式の adult を移し、知らない値は未設定にする', () => {
		const age = (prefs: unknown) => parseSavedProfile(JSON.stringify({ prefs })).prefs.age;
		expect(age({ adult: true })).toBe('adult');
		expect(age({ adult: false })).toBe('minor');
		expect(age({ age: 'child' })).toBe('child');
		expect(age({ age: 'bogus' })).toBeNull();
		expect(age({})).toBeNull();
	});

	it('current が無い・存在しない id なら先頭の検索を指す', () => {
		const p = parseSavedProfile(
			JSON.stringify({
				searches: [
					{ id: 'x', query: 'a' },
					{ id: 'y', query: 'b' }
				],
				current: 'nope'
			})
		);
		expect(p.current).toBe('x');
	});

	it('旧形式（一言・いいね・よくないねが 1 本）は 1 件の検索に移す', () => {
		const p = parseSavedProfile(
			JSON.stringify({
				prefs: { adult: true, wish: '病み垢', affinityFor: '病み垢', affinity: { 'a.tld': 0.9 } },
				liked: ['a.tld'],
				passed: ['b.tld']
			})
		);
		expect(p.searches).toHaveLength(1);
		const s = p.searches[0];
		expect(s.query).toBe('病み垢');
		expect(s.affinity).toEqual({ 'a.tld': 0.9 });
		expect(s.affinityFor).toBe('病み垢');
		expect(s.liked).toEqual(['a.tld']);
		expect(s.passed).toEqual(['b.tld']);
		expect(p.current).toBe(s.id);
	});

	it('旧形式で一言が変わっていた（噛み合いが古い）なら噛み合いは持ち越さない', () => {
		const p = parseSavedProfile(
			JSON.stringify({
				prefs: { wish: '創作', affinityFor: '病み垢', affinity: { 'a.tld': 0.9 } },
				liked: ['a.tld']
			})
		);
		expect(p.searches[0].query).toBe('創作');
		expect(p.searches[0].affinity).toEqual({});
	});
});

describe('検索の切り替え', () => {
	it('selectSearch は新しい検索を加えて current にし、既存なら差し替える', () => {
		const a = newSearch('a');
		const b = newSearch('b');
		let p = selectSearch(emptyProfile(), a);
		p = selectSearch(p, b);
		expect(p.searches.map((s) => s.id)).toEqual([a.id, b.id]);
		expect(currentSearch(p)?.id).toBe(b.id);
		p = selectSearch(p, { ...a, liked: ['x.tld'] });
		expect(p.searches).toHaveLength(2);
		expect(currentSearch(p)?.liked).toEqual(['x.tld']);
	});

	it('開いただけでは並び順（最後に動いた時刻）を変えず、中身が変わったら更新する（AI のチャット一覧と同じ）', () => {
		const a = { ...newSearch('a'), at: 100 };
		const b = { ...newSearch('b'), at: 200 };
		let p = { ...emptyProfile(), searches: [a, b], current: b.id };
		p = selectSearch(p, a);
		expect(currentSearch(p)?.at).toBe(100);
		p = patchSearch(p, { liked: ['x.tld'] });
		expect(currentSearch(p)?.at).toBeGreaterThan(200);
		// 名前を変えても並びは変えない
		const before = currentSearch(p)?.at;
		p = renameSearch(p, a.id, '名前');
		expect(currentSearch(p)?.at).toBe(before);
	});

	it('patchSearch は current の検索だけを書き換える', () => {
		const a = newSearch('a');
		const b = newSearch('b');
		let p = selectSearch(selectSearch(emptyProfile(), a), b);
		p = patchSearch(p, { passed: ['y.tld'] });
		expect(currentSearch(p)?.passed).toEqual(['y.tld']);
		expect(p.searches.find((s) => s.id === a.id)?.passed).toEqual([]);
	});

	it('deleteSearch は検索を消し、current だったなら最後に使ったものに移る', () => {
		const a = { ...newSearch('a'), at: 1 };
		const b = { ...newSearch('b'), at: 2 };
		const c = { ...newSearch('c'), at: 3 };
		let p = { ...emptyProfile(), searches: [a, b, c], current: c.id };
		p = deleteSearch(p, c.id);
		expect(p.searches.map((s) => s.id)).toEqual([a.id, b.id]);
		expect(p.current).toBe(b.id);
		p = deleteSearch(p, a.id); // current でないものを消しても current は変わらない
		expect(p.current).toBe(b.id);
		p = deleteSearch(p, b.id);
		expect(p.searches).toEqual([]);
		expect(p.current).toBe('');
	});

	it('renameSearch は名前だけ変え、空白なら名前を外す', () => {
		const a = newSearch('a');
		let p = selectSearch(emptyProfile(), a);
		p = renameSearch(p, a.id, '  弱音用 ');
		expect(p.searches[0].title).toBe('弱音用');
		expect(p.searches[0].query).toBe('a');
		p = renameSearch(p, a.id, '   ');
		expect(p.searches[0].title).toBe('');
	});

	it('currentSearch は検索が無ければ null', () => {
		expect(currentSearch(emptyProfile())).toBeNull();
	});
});
