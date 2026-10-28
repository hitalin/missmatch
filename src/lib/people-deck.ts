import type { Member } from './people';
import { GENRES } from './types';

// デッキの並び順とマッチの判定（docs/PEOPLE.md v6.4 §4）。すべて純粋関数でブラウザでもサーバーでも使う

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

export interface Ranked {
	member: Member;
	badges: Badges;
	topic: number;
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
	const a = topicVector(me);
	const b = topicVector(other);
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

export function rankCandidates(
	me: Member,
	members: Member[],
	relations: Record<string, Relation>, // acct → 関係（解決できていない人は無い）
	following: Record<string, string[]>, // acct → フォロー一覧（キャッシュにある分）
	options: { exclude?: Set<string> } = {}
): Ranked[] {
	const mine = me.followingPublic ? (following[me.acct] ?? []) : [];
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
		ranked.push({
			member: m,
			badges: { followsYou: r.isFollowed, common, sameHost: m.host === me.host },
			topic: topicScore(me, m)
		});
	}
	return ranked.sort(
		(a, b) =>
			Number(b.badges.followsYou) - Number(a.badges.followsYou) ||
			b.badges.common - a.badges.common ||
			b.topic - a.topic ||
			b.member.joinedAt - a.member.joinedAt
	);
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
