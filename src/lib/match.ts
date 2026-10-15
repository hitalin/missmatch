import {
	FEATURE_LABELS,
	FEATURES,
	type Feature,
	type FeatureVector,
	featuresOf,
	GENRE_FEATURES
} from './features';
import { hasFreshAffinity, type Preferences, paceOf, scaleOf } from './prefs';
import type { Match, ServerInfo, ServerProfile } from './types';
import { vibeTags } from './vibe';

// 判定不能な軸は「分からない」として中立値にする
const UNKNOWN = 0.5;

// スワイプから学習した好み。特徴ごとに -1（0 寄りが好き）..1（1 寄りが好き）
export type Taste = Partial<Record<Feature, number>>;
const LEARN_LIKE = 0.3;
const LEARN_PASS = 0.15; // パスはいいねより弱い信号（興味がないだけかもしれない）
// 学習しない特徴: 絶対条件のトグルの領分で、大手に偏ったいいねから「メアド必須が好き」のような偽の好みを作ってしまう
const NOT_LEARNED = new Set<Feature>(['emailFree', 'adsFree', 'gtl', 'fresh']);
// 「好き」の方向だけ学ぶ特徴: 創作が多い鯖を好むことはあっても「技術が少ない鯖を好む」は好みではない
const ONE_WAY = new Set<Feature>([...GENRE_FEATURES, 'drive']);
// 学習の軸の重みはスワイプ数とともに増え、この回数で最大になる
const TASTE_FULL_AT = 8;
const TASTE_MAX_WEIGHT = 3;

// 新規登録を受け付けているサーバー（既定の候補）
export function isJoinable(s: ServerInfo): boolean {
	return s.langs.includes('ja') && (s.registration === 'open' || s.registration === 'approval');
}

// 候補になり得るサーバー: 日本語で、登録受付中か、停止中でも生きている（1 日 1 人以上が読んでいる）
export function isListed(s: ServerInfo): boolean {
	return s.langs.includes('ja') && (isJoinable(s) || (s.dru15 ?? 0) >= 1);
}

// 発見の設定のうちハードフィルターになるもの
export function passesFilters(p: ServerProfile, prefs: Preferences): boolean {
	const s = p.server;
	if (!isListed(s) || !prefs.registrations.includes(s.registration)) return false;
	if (prefs.adult === false && s.ageRestriction === '18+') return false;
	if (prefs.scales.length > 0 && !prefs.scales.includes(scaleOf(s))) return false;
	if (prefs.paces.length > 0 && !prefs.paces.includes(paceOf(s))) return false;
	const d = prefs.dealbreakers;
	if (d.emailFree && s.emailRequired) return false;
	if (d.adsFree && s.adsEnabled) return false;
	if (d.gtl && !s.gtlAvailable) return false;
	if (d.official && !s.officialMisskey) return false;
	if (d.fresh && (s.versionMonthsBehind === null || s.versionMonthsBehind > 1)) return false;
	return true;
}

export function applyFilters(profiles: ServerProfile[], prefs: Preferences): ServerProfile[] {
	return profiles.filter((p) => passesFilters(p, prefs));
}

interface Axis {
	fit: number;
	weight: number;
	reason: string | null;
}

// 学習した好みへの近さ 0..1。好みが無ければ null
export function tasteFit(features: FeatureVector, taste: Taste): number | null {
	let num = 0;
	let den = 0;
	for (const key of FEATURES) {
		const t = taste[key];
		const f = features[key];
		if (!t || f === undefined) continue;
		num += t * (f - 0.5);
		den += Math.abs(t) * 0.5;
	}
	return den === 0 ? null : Math.min(1, Math.max(0, 0.5 + num / den / 2));
}

export function tasteWeight(swipes: number): number {
	return Math.min(TASTE_MAX_WEIGHT, (swipes / TASTE_FULL_AT) * TASTE_MAX_WEIGHT);
}

export function scoreProfile(
	p: ServerProfile,
	prefs: Preferences,
	taste: Taste = {},
	swipes = 0
): Match {
	const v = p.vibe;
	const axes: Axis[] = [];

	if (prefs.nsfw === 'avoid') axes.push({ fit: v ? 1 - v.nsfw : UNKNOWN, weight: 4, reason: null });
	else if (prefs.nsfw === 'welcome')
		axes.push({ fit: v ? v.nsfw : UNKNOWN, weight: 2, reason: '成人向け投稿に寛容' });

	if (prefs.topics.length > 0) {
		// 選んだ話題のどれかが多ければよい
		const best = v
			? prefs.topics.reduce((b, t) => (v.genre[t] > v.genre[b] ? t : b), prefs.topics[0])
			: null;
		axes.push({
			fit: v && best ? v.genre[best] : UNKNOWN,
			weight: 3,
			reason: best ? `${FEATURE_LABELS[`genre.${best}`].up}の話題が多い` : null
		});
	}
	if (prefs.tone !== 'any') {
		const warm = prefs.tone === 'right';
		axes.push({
			fit: v ? (warm ? v.tone : (1 - v.tone + (1 - v.strictness)) / 2) : UNKNOWN,
			weight: 2,
			reason: warm ? '空気が穏やか' : '干渉が少なく自由'
		});
	}
	if (prefs.community !== 'any') {
		const open = prefs.community === 'right';
		axes.push({
			fit: v
				? open
					? (v.newcomerFriendly + (1 - v.closedCommunity)) / 2
					: 0.5 + v.closedCommunity / 2
				: UNKNOWN,
			weight: 2,
			reason: open ? '初心者が入りやすい' : 'コミュニティの結びつきが強い'
		});
	}
	if (prefs.rules !== 'any') {
		const strict = prefs.rules === 'right';
		axes.push({
			fit: v ? (strict ? v.strictness : 1 - v.strictness) : UNKNOWN,
			weight: 1.5,
			reason: strict ? 'ルールがしっかりしている' : 'ルールがゆるめ'
		});
	}
	if (hasFreshAffinity(prefs)) {
		axes.push({
			fit: prefs.affinity[p.server.host] ?? UNKNOWN,
			weight: 3,
			reason: '書いてくれた希望と噛み合う'
		});
	}
	const tw = tasteWeight(swipes);
	if (tw > 0) {
		const fit = tasteFit(featuresOf(p), taste);
		if (fit !== null) axes.push({ fit, weight: tw, reason: 'いいねした鯖と似ている' });
	}

	const totalWeight = axes.reduce((s, a) => s + a.weight, 0);
	const weighted = axes.reduce((s, a) => s + a.fit * a.weight, 0);
	const score = totalWeight === 0 ? 50 : Math.round((weighted / totalWeight) * 100);
	const reasons = axes
		.filter((a) => a.reason && a.fit >= 0.6)
		.sort((a, b) => b.fit * b.weight - a.fit * a.weight)
		.map((a) => a.reason as string);
	return { server: p.server, vibe: v, score, reasons, tags: v ? vibeTags(v) : [] };
}

// 次に見せるカード: フィルターを通り、まだスワイプしていないものを相性順に
export function buildDeck(
	profiles: ServerProfile[],
	prefs: Preferences,
	taste: Taste,
	swipes: number,
	seen: Set<string>,
	limit: number
): Match[] {
	return applyFilters(profiles, prefs)
		.filter((p) => !seen.has(p.server.host))
		.map((p) => scoreProfile(p, prefs, taste, swipes))
		.sort((a, b) => b.score - a.score || (b.server.dru15 ?? 0) - (a.server.dru15 ?? 0))
		.slice(0, limit);
}

// いいね / パスから好みを更新する。特徴が 0.5 から離れているほど強く学ぶ
export function learn(taste: Taste, features: FeatureVector, action: 'like' | 'pass'): Taste {
	const rate = action === 'like' ? LEARN_LIKE : -LEARN_PASS;
	const next: Taste = { ...taste };
	for (const key of FEATURES) {
		const f = features[key];
		if (f === undefined || NOT_LEARNED.has(key)) continue;
		const delta = rate * (f - 0.5) * 2;
		const floor = ONE_WAY.has(key) ? 0 : -1;
		next[key] = Math.min(1, Math.max(floor, (next[key] ?? 0) + delta));
	}
	return next;
}

// 学習した好みのうち目立つものをチップにする
export function tasteSummary(
	taste: Taste,
	max = 5,
	threshold = 0.3
): { feature: Feature; label: string; strength: number }[] {
	return FEATURES.map((feature) => ({ feature, t: taste[feature] ?? 0 }))
		.filter((x) => Math.abs(x.t) >= threshold)
		.sort((a, b) => Math.abs(b.t) - Math.abs(a.t))
		.slice(0, max)
		.map((x) => ({
			feature: x.feature,
			label: x.t > 0 ? FEATURE_LABELS[x.feature].up : FEATURE_LABELS[x.feature].down,
			strength: Math.abs(x.t)
		}));
}
