import type { Member } from './people';
import { intentMatch, type PeopleIntent } from './people-intent';
import { GENRES } from './types';

// デッキの並び順とマッチの判定（docs/PEOPLE.md §4）。すべて純粋関数でブラウザでもサーバーでも使う。
// 並びは商業のマッチングアプリ・SNS のおすすめと同じ「信号の重み付き合算」:
//   言葉との噛み合い（Clef）> 希望との一致（言葉の読み取り × 推定）> 相互性（あなたをフォロー、フォロー返しの見込み）
//   > 社会的証明（共通のフォロー先）> 内容の近さ（話題、いいねから学んだ好み）> 活動（最近投稿した）> 新着 > 同じサーバー
// 最後に同じサーバーを間引き、1 枚だけ圏外から入れて探索する

// 本人のサーバーの users/show が返す関係
export interface Relation {
	isFollowing: boolean;
	isFollowed: boolean;
	hasPendingFollowRequestFromYou: boolean;
	isBlocking: boolean;
	isBlocked: boolean;
	isMuted: boolean;
}

const NO_RELATION: Relation = {
	isFollowing: false,
	isFollowed: false,
	hasPendingFollowRequestFromYou: false,
	isBlocking: false,
	isBlocked: false,
	isMuted: false
};

export interface Badges {
	followsYou: boolean;
	common: number; // 共通のフォロー先の数（両者のフォロー一覧が公開のときだけ）
	sameHost: boolean;
}

// 並びに使う信号（0..1。taste だけ -1..1）
export interface Signals {
	fit: number | null; // Clef の噛み合い（言葉があり、候補に入ったときだけ）
	intent: number | null; // 言葉の読み取り（希望）と推定の一致（言葉があるときだけ）
	topic: number; // 本人と相手の話題の近さ
	taste: number; // いいねした人たちに近いほど正、よくないねに近いほど負
	followsYou: number;
	common: number; // 共通のフォロー先（3 人で頭打ち）
	activity: number; // 最近投稿したか（users/show の updatedAt）
	reciprocity: number; // フォロー返しの見込み（フォロー数 / (フォロワー数 + フォロー数)）
	fresh: number; // 参加したばかり（コールドスタートの露出）
	sameHost: number;
}
export interface Ranked {
	member: Member;
	badges: Badges;
	signals: Signals;
	score: number;
}

// 重み。言葉があるときは噛み合い・希望が主役、無いときは相互性と近さで並べる
const WEIGHTS = {
	fit: 3.0,
	intent: 2.0,
	topic: 0.8, // 話題の近さは密で雑音が多いので、事実の信号（共通のフォロー先）より軽く
	topicWithWords: 0.4,
	taste: 1.0,
	followsYou: 1.5,
	common: 1.5,
	activity: 0.8,
	reciprocity: 0.5,
	fresh: 0.4,
	sameHost: 0.3
};
export function scoreOf(s: Signals, withWords: boolean): number {
	const match = s.fit ?? s.intent;
	return (
		(match !== null ? (s.fit !== null ? WEIGHTS.fit : WEIGHTS.intent) * match : 0) +
		(withWords ? WEIGHTS.topicWithWords : WEIGHTS.topic) * s.topic +
		WEIGHTS.taste * s.taste +
		WEIGHTS.followsYou * s.followsYou +
		WEIGHTS.common * s.common +
		WEIGHTS.activity * s.activity +
		WEIGHTS.reciprocity * s.reciprocity +
		WEIGHTS.fresh * s.fresh +
		WEIGHTS.sameHost * s.sameHost
	);
}

const DAY = 24 * 60 * 60 * 1000;
// 最近投稿したか: 1 日以内で 1、30 日で 0。分からなければ 0.3
export function activityOf(updatedAt: number | null | undefined, now: number): number {
	if (updatedAt === null || updatedAt === undefined || !Number.isFinite(updatedAt)) return 0.3;
	const days = (now - updatedAt) / DAY;
	if (days <= 1) return 1;
	if (days >= 30) return 0;
	return 1 - (days - 1) / 29;
}
// フォロー返しの見込み: フォロー数がフォロワー数に見合う人ほど高く、フォロワーばかりの有名人は低い。不明は 0.5
export function reciprocityOf(
	followers: number | undefined,
	following: number | undefined
): number {
	if (followers === undefined || following === undefined) return 0.5;
	const total = followers + following;
	if (total <= 0) return 0.5;
	return Math.min(1, following / total);
}
// 参加したばかり: 3 日以内で 1、14 日で 0
function freshOf(joinedAt: number, now: number): number {
	const days = (now - joinedAt) / DAY;
	if (days <= 3) return 1;
	if (days >= 14) return 0;
	return 1 - (days - 3) / 11;
}

type Vec = Record<string, number>;
function cosine(a: Vec, b: Vec): number {
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (const g of GENRES) {
		const x = a[g] ?? 0;
		const y = b[g] ?? 0;
		dot += x * y;
		na += x * x;
		nb += y * y;
	}
	return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}
function centroid(members: Member[]): Vec | null {
	const vecs = members.map(topicVector).filter((v) => Object.values(v).some((x) => x > 0));
	if (vecs.length === 0) return null;
	const out: Vec = {};
	for (const g of GENRES) out[g] = vecs.reduce((s, v) => s + (v[g] ?? 0), 0) / vecs.length;
	return out;
}
// いいねから学んだ好み（スワイプ学習）: いいね 3 人以上で、いいねの中心との近さ − 0.5 × よくないねの中心との近さ
const TASTE_MIN_LIKES = 3;
export function tasteOf(liked: Member[], passed: Member[], other: Member): number {
	if (liked.length < TASTE_MIN_LIKES) return 0;
	const like = centroid(liked);
	if (!like) return 0;
	const v = topicVector(other);
	const pass = passed.length >= TASTE_MIN_LIKES ? centroid(passed) : null;
	return cosine(like, v) - (pass ? 0.5 * cosine(pass, v) : 0);
}

export function commonFollowing(a: string[], b: string[]): number {
	const set = new Set(a);
	let n = 0;
	for (const x of b) if (set.has(x)) n++;
	return n;
}

// 話題の近さ 0..1。本人の自己申告チップがあればそれを、無ければ推定の確率を使う（両者とも）
function topicVector(m: Member): Record<string, number> {
	if (m.chips.length > 0) return Object.fromEntries(m.chips.map((c) => [c, 1]));
	return m.estimate?.genre ?? {};
}
export function topicScore(me: Member, other: Member): number {
	return cosine(topicVector(me), topicVector(other));
}

export interface Detail {
	followersCount?: number;
	followingCount?: number;
	updatedAt?: number | null; // 最後の投稿（ms）
}

export function rankCandidates(
	me: Member,
	members: Member[],
	relations: Record<string, Relation>, // acct → 関係（解決できていない人は無い）
	following: Record<string, string[]>, // acct → フォロー一覧（キャッシュにある分）
	options: {
		exclude?: Set<string>;
		intent?: PeopleIntent | null; // 言葉の読み取り（言葉があるとき）
		fit?: Record<string, number>; // Clef の噛み合い（候補に入った人）
		liked?: Member[]; // いいねした参加者（スワイプ学習）
		passed?: Member[];
		details?: Record<string, Detail>; // acct → users/show の数（活動・フォロー返し）
		now?: number;
	} = {}
): Ranked[] {
	const now = options.now ?? Date.now();
	const mine = me.followingPublic ? (following[me.acct] ?? []) : [];
	const withWords = !!options.intent;
	const liked = options.liked ?? [];
	const passed = options.passed ?? [];
	const ranked: Ranked[] = [];
	for (const m of members) {
		if (m.acct === me.acct || m.hidden || options.exclude?.has(m.acct)) continue;
		// 関係が無い（本人のサーバーで未解決）相手は、関係なしとして扱う（解決は呼ぶ側で済ませておく）
		const r = relations[m.acct] ?? NO_RELATION;
		if (
			r.isFollowing ||
			r.hasPendingFollowRequestFromYou ||
			r.isBlocking ||
			r.isBlocked ||
			r.isMuted
		)
			continue;
		const common =
			m.followingPublic && mine.length > 0 ? commonFollowing(mine, following[m.acct] ?? []) : 0;
		const d = options.details?.[m.acct];
		const signals: Signals = {
			fit: options.fit?.[m.acct] ?? null,
			intent: options.intent ? intentMatch(options.intent, m.estimate) : null,
			topic: topicScore(me, m),
			taste: tasteOf(liked, passed, m),
			followsYou: r.isFollowed ? 1 : 0,
			common: Math.min(common, 3) / 3,
			activity: activityOf(d?.updatedAt, now),
			reciprocity: reciprocityOf(d?.followersCount, d?.followingCount),
			fresh: freshOf(m.joinedAt, now),
			sameHost: m.host === me.host ? 1 : 0
		};
		ranked.push({
			member: m,
			badges: { followsYou: r.isFollowed, common, sameHost: m.host === me.host },
			signals,
			score: scoreOf(signals, withWords)
		});
	}
	return ranked.sort((a, b) => b.score - a.score || b.member.joinedAt - a.member.joinedAt);
}

// 順位どおりに size 枚（同じサーバーは maxPerHost まで）。圏外に人がいれば最後の 1 枚を圏外から入れて探索する
// （毎回同じ上位だけ出すと、並びの外にいる人に一度も露出が回らない）
export function pickDeck<T>(
	items: T[],
	hostOf: (t: T) => string,
	size: number,
	maxPerHost: number,
	rand: () => number = Math.random
): T[] {
	const picked = diversify(items, hostOf, size, maxPerHost);
	if (picked.length < size) return picked;
	const chosen = new Set(picked);
	const rest = items.filter((it) => !chosen.has(it));
	if (rest.length === 0) return picked;
	const explore = rest[Math.min(rest.length - 1, Math.floor(rand() * rest.length))];
	return [...picked.slice(0, size - 1), explore];
}

// 同じサーバーが size 枚中 maxPerHost 枚を超えないよう、順位を保ったまま間引く
export function diversify<T>(
	items: T[],
	hostOf: (t: T) => string,
	size: number,
	maxPerHost: number
): T[] {
	const out: T[] = [];
	const perHost = new Map<string, number>();
	const deferred: T[] = [];
	for (const it of items) {
		if (out.length >= size) break;
		const h = hostOf(it);
		const n = perHost.get(h) ?? 0;
		if (n >= maxPerHost) {
			deferred.push(it);
			continue;
		}
		perHost.set(h, n + 1);
		out.push(it);
	}
	for (const it of deferred) {
		if (out.length >= size) break;
		out.push(it);
	}
	return out;
}

// 配給: 参加 100 人までは 1 日 10 枚（デッキが数日で尽きるのを防ぐ）
export function rationSize(memberCount: number): number {
	return memberCount <= 100 ? 10 : 30;
}

export function matchesOf(
	members: Member[],
	myFollowing: string[],
	myFollowers: string[]
): Member[] {
	const f = new Set(myFollowing);
	const r = new Set(myFollowers);
	return members.filter((m) => f.has(m.acct) && r.has(m.acct));
}
