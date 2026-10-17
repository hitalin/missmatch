import {
	FEATURE_LABELS,
	FEATURES,
	type Feature,
	type FeatureVector,
	featuresOf,
	GENRE_FEATURES
} from './features';
import { BIG_DRIVE_MB, meetsActivity, type Preferences, paceOf, scaleOf } from './prefs';
import { hasAffinity, type Search, seenHosts } from './search';
import type { Match, RelativeVibe, ServerInfo, ServerProfile } from './types';
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
// 検索語があるときは「文章との噛み合い」が主、設定と学習した好みは従。
// 好みを同列に足すと、話題や R-18 の重みに噛み合いが埋もれて検索の精度が落ちる
export const AFFINITY_SHARE = 0.75;

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
	// 年齢: 18 歳以上はすべて、12〜17 歳は 18 歳以上が必要なサーバーを除き、
	// 12 歳未満は下限年齢のあるサーバー（12 歳以上が必要）をすべて除く
	if (s.minAge !== null) {
		if (prefs.age === 'minor' && s.minAge >= 18) return false;
		if (prefs.age === 'child' && s.minAge >= 12) return false;
	}
	if (!meetsActivity(s, prefs.activity)) return false;
	if (prefs.scales.length > 0 && !prefs.scales.includes(scaleOf(s))) return false;
	if (prefs.paces.length > 0 && !prefs.paces.includes(paceOf(s))) return false;
	const d = prefs.dealbreakers;
	if (d.emailFree && s.emailRequired) return false;
	if (d.adsFree && s.adsEnabled) return false;
	if (d.gtl && !s.gtlAvailable) return false;
	if (d.official && !s.officialMisskey) return false;
	if (d.fresh && (s.versionMonthsBehind === null || s.versionMonthsBehind > 1)) return false;
	if (d.ltl && !s.ltlAvailable) return false;
	if (d.noteSearch && !s.noteSearch) return false;
	if (d.translator && !s.translator) return false;
	if (d.chat && !s.chat) return false;
	if (d.videoUpload && !s.videoUpload) return false;
	if (d.bigDrive && (s.driveCapacityMb ?? 0) < BIG_DRIVE_MB) return false;
	if (d.tos && !s.hasTos) return false;
	if (d.privacyPolicy && !s.hasPrivacyPolicy) return false;
	return true;
}

export function applyFilters(profiles: ServerProfile[], prefs: Preferences): ServerProfile[] {
	return profiles.filter((p) => passesFilters(p, prefs));
}

// 候補の中での順位（0..1、同値は平均順位）。元の判定値は表示用にそのまま残す
const REL_KEYS: (keyof RelativeVibe)[] = [
	'tone',
	'strictness',
	'newcomerFriendly',
	'closedCommunity'
];
export function withRelativeVibes(profiles: ServerProfile[]): ServerProfile[] {
	const judged = profiles.filter((p) => p.vibe !== null);
	const n = judged.length;
	const ranks = new Map<ServerProfile, RelativeVibe>();
	for (const p of judged)
		ranks.set(p, { tone: 0.5, strictness: 0.5, newcomerFriendly: 0.5, closedCommunity: 0.5 });
	if (n > 1) {
		for (const key of REL_KEYS) {
			const values = judged.map((p) => p.vibe?.[key] ?? 0);
			for (const p of judged) {
				const v = p.vibe?.[key] ?? 0;
				const below = values.filter((x) => x < v).length;
				const same = values.filter((x) => x === v).length;
				(ranks.get(p) as RelativeVibe)[key] = (below + (same - 1) / 2) / (n - 1);
			}
		}
	}
	return profiles.map((p) => (ranks.has(p) ? { ...p, rel: ranks.get(p) } : p));
}

// 毎日読む人の数を 0..1 に（対数、300 人で 1）。初心者向けの減点にだけ使う
const LIVELY_AT = 300;
const LIVELINESS_PENALTY = 0.1;
function liveliness(s: ServerInfo): number {
	return Math.min(1, Math.log10((s.dru15 ?? 0) + 1) / Math.log10(LIVELY_AT + 1));
}

// 投稿サンプルが少ないほど、投稿から読む軸（空気感・関わり方）を中立に寄せる。
// 話題は説明文からも読める（「病んでいい場所」で LTL 非公開でも vent 0.95）ので寄せない
const SAMPLE_FULL_AT = 30;
const MIN_CONFIDENCE = 0.3;
function sampleConfidence(sampleCount: number): number {
	return Math.min(1, MIN_CONFIDENCE + (1 - MIN_CONFIDENCE) * (sampleCount / SAMPLE_FULL_AT));
}
const shrink = (fit: number, conf: number) => UNKNOWN + (fit - UNKNOWN) * conf;

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
	swipes = 0,
	affinity: Record<string, number> = {} // 検索の噛み合い。空なら設定と好みだけで採点
): Match {
	const v = p.vibe;
	const r = p.rel ?? v; // 空気感などは相対値で採点する
	const conf = v ? sampleConfidence(v.sampleCount) : 1;
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
			fit: r ? shrink(warm ? r.tone : (1 - r.tone + (1 - r.strictness)) / 2, conf) : UNKNOWN,
			weight: 2,
			reason: warm ? '空気が穏やか' : '干渉が少なく自由'
		});
	}
	if (prefs.community !== 'any') {
		const open = prefs.community === 'right';
		axes.push({
			fit: r
				? shrink(
						open ? (r.newcomerFriendly + (1 - r.closedCommunity)) / 2 : 0.5 + r.closedCommunity / 2,
						conf
					)
				: UNKNOWN,
			weight: 2,
			reason: open ? '初心者が入りやすい' : 'コミュニティの結びつきが強い'
		});
	}
	if (prefs.rules !== 'any') {
		const strict = prefs.rules === 'right';
		axes.push({
			fit: r ? (strict ? r.strictness : 1 - r.strictness) : UNKNOWN,
			weight: 1.5,
			reason: strict ? 'ルールがしっかりしている' : 'ルールがゆるめ'
		});
	}
	const tw = tasteWeight(swipes);
	if (tw > 0) {
		const fit = tasteFit(featuresOf(p), taste);
		if (fit !== null) axes.push({ fit, weight: tw, reason: 'いいねした鯖と似ている' });
	}

	// 好み（設定 + 学習）の適合度。軸が無ければ中立
	const totalWeight = axes.reduce((s, a) => s + a.weight, 0);
	const weighted = axes.reduce((s, a) => s + a.fit * a.weight, 0);
	const prefFit = totalWeight === 0 ? 0.5 : weighted / totalWeight;
	const reasons = axes
		.filter((a) => a.reason && a.fit >= 0.6)
		.sort((a, b) => b.fit * b.weight - a.fit * a.weight)
		.map((a) => a.reason as string);

	let fit = prefFit;
	let a: number | undefined;
	if (Object.keys(affinity).length > 0) {
		a = affinity[p.server.host] ?? UNKNOWN;
		fit = AFFINITY_SHARE * a + (1 - AFFINITY_SHARE) * prefFit;
		if (a >= 0.6) reasons.unshift('書いてくれた希望と噛み合う');
	}
	// 初心者でも気軽に入れる場所を求めているときは、毎日読む人がほとんどいない鯖を少し下げる
	// （会話が成り立たない）。他の希望では下げない: 噛み合い判定の基準に「人がいること」を足したら、
	// 言葉に関係なく小さな鯖が全部下がった（recall@5 88 → 82%）
	if (prefs.community === 'right') fit *= 1 - LIVELINESS_PENALTY * (1 - liveliness(p.server));
	const score = Math.round(fit * 100);
	return { server: p.server, vibe: v, score, affinity: a, reasons, tags: v ? vibeTags(v) : [] };
}

// 次に見せるカード: フィルターを通り、この検索でまだスワイプしていないものを相性順に
export function buildDeck(
	profiles: ServerProfile[],
	prefs: Preferences,
	taste: Taste,
	swipes: number,
	search: Search,
	limit: number
): Match[] {
	const seen = seenHosts(search);
	const affinity = hasAffinity(search) ? search.affinity : {};
	return applyFilters(profiles, prefs)
		.filter((p) => !seen.has(p.server.host))
		.map((p) => scoreProfile(p, prefs, taste, swipes, affinity))
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
