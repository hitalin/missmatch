import type { Taste } from './match';
import {
	DEALBREAKER_LABELS,
	defaultPreferences,
	PACES,
	type Preferences,
	REGISTRATIONS,
	SCALES,
	TOPICS
} from './prefs';

// ブラウザに保持するもの。マッチングアプリと同じく、作ったプロフィールと履歴は残す
export interface SavedProfile {
	prefs: Preferences;
	taste: Taste; // スワイプから学習した好み
	swipes: number; // 学習に使ったスワイプ数
	liked: string[]; // いいねした host（順序あり）
	passed: string[]; // パスした host（二度と出さない）
}

export const PROFILE_KEY = 'missmatch:profile:v2';

export function emptyProfile(): SavedProfile {
	return { prefs: defaultPreferences(), taste: {}, swipes: 0, liked: [], passed: [] };
}

const isStr = (x: unknown): x is string => typeof x === 'string';
const strArray = (x: unknown): string[] => (Array.isArray(x) ? x.filter(isStr) : []);
const oneOf = <T extends string>(x: unknown, allowed: readonly T[], fallback: T): T =>
	isStr(x) && (allowed as readonly string[]).includes(x) ? (x as T) : fallback;

// 不正な保存値は黙って既定値に戻す。設定項目の増減にも耐える
export function parseSavedProfile(raw: string | null): SavedProfile {
	const profile = emptyProfile();
	if (!raw) return profile;
	let data: unknown;
	try {
		data = JSON.parse(raw);
	} catch {
		return profile;
	}
	if (!data || typeof data !== 'object') return profile;
	const d = data as Record<string, unknown>;
	const p = (d.prefs && typeof d.prefs === 'object' ? d.prefs : {}) as Record<string, unknown>;
	const prefs = profile.prefs;
	if (typeof p.adult === 'boolean') prefs.adult = p.adult;
	prefs.nsfw = oneOf(p.nsfw, ['avoid', 'neutral', 'welcome'] as const, 'avoid');
	const regs = strArray(p.registrations).filter((x): x is Preferences['registrations'][number] =>
		(REGISTRATIONS as string[]).includes(x)
	);
	if (regs.length > 0) prefs.registrations = regs;
	prefs.scales = strArray(p.scales).filter((x): x is Preferences['scales'][number] =>
		(SCALES as string[]).includes(x)
	);
	prefs.paces = strArray(p.paces).filter((x): x is Preferences['paces'][number] =>
		(PACES as string[]).includes(x)
	);
	prefs.topics = strArray(p.topics).filter((x): x is Preferences['topics'][number] =>
		(TOPICS as string[]).includes(x)
	);
	const lean = ['left', 'any', 'right'] as const;
	prefs.tone = oneOf(p.tone, lean, 'any');
	prefs.community = oneOf(p.community, lean, 'any');
	prefs.rules = oneOf(p.rules, lean, 'any');
	const db = (p.dealbreakers && typeof p.dealbreakers === 'object' ? p.dealbreakers : {}) as Record<
		string,
		unknown
	>;
	for (const key of Object.keys(DEALBREAKER_LABELS) as (keyof Preferences['dealbreakers'])[]) {
		if (typeof db[key] === 'boolean') prefs.dealbreakers[key] = db[key] as boolean;
	}
	if (isStr(p.wish)) prefs.wish = p.wish;
	if (isStr(p.affinityFor)) prefs.affinityFor = p.affinityFor;
	if (p.affinity && typeof p.affinity === 'object') {
		for (const [host, v] of Object.entries(p.affinity as Record<string, unknown>)) {
			if (typeof v === 'number' && v >= 0 && v <= 1) prefs.affinity[host] = v;
		}
	}
	if (d.taste && typeof d.taste === 'object') {
		for (const [k, v] of Object.entries(d.taste as Record<string, unknown>)) {
			if (typeof v === 'number' && v >= -1 && v <= 1) profile.taste[k as keyof Taste] = v;
		}
	}
	if (typeof d.swipes === 'number' && d.swipes >= 0) profile.swipes = Math.floor(d.swipes);
	profile.liked = strArray(d.liked);
	profile.passed = strArray(d.passed);
	return profile;
}
