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
import { newSearch, type Search } from './search';

// ブラウザに保持するもの。マッチングアプリと同じく、作ったプロフィールと履歴は残す。
// 設定と学習した好みは「その人」のものなので 1 本、いいね / よくないねは検索ごと
export interface SavedProfile {
	prefs: Preferences;
	taste: Taste; // スワイプから学習した好み
	swipes: number; // 学習に使ったスワイプ数
	searches: Search[]; // 探した言葉ごとのセッション
	current: string; // 今開いている検索の id（searches が空なら ''）
}

export const PROFILE_KEY = 'missmatch:profile:v2';

export function emptyProfile(): SavedProfile {
	return { prefs: defaultPreferences(), taste: {}, swipes: 0, searches: [], current: '' };
}

export function currentSearch(p: SavedProfile): Search | null {
	return p.searches.find((s) => s.id === p.current) ?? null;
}

// 検索を current にする。既存の id なら差し替え、無ければ加える
export function selectSearch(p: SavedProfile, s: Search): SavedProfile {
	const next = { ...s, at: Date.now() };
	const searches = p.searches.some((x) => x.id === s.id)
		? p.searches.map((x) => (x.id === s.id ? next : x))
		: [...p.searches, next];
	return { ...p, searches, current: s.id };
}

export function patchSearch(p: SavedProfile, patch: Partial<Search>): SavedProfile {
	return {
		...p,
		searches: p.searches.map((s) => (s.id === p.current ? { ...s, ...patch } : s))
	};
}

const isStr = (x: unknown): x is string => typeof x === 'string';
const strArray = (x: unknown): string[] => (Array.isArray(x) ? x.filter(isStr) : []);
const oneOf = <T extends string>(x: unknown, allowed: readonly T[], fallback: T): T =>
	isStr(x) && (allowed as readonly string[]).includes(x) ? (x as T) : fallback;
const affinityOf = (x: unknown): Record<string, number> => {
	const out: Record<string, number> = {};
	if (x && typeof x === 'object') {
		for (const [host, v] of Object.entries(x as Record<string, unknown>)) {
			if (typeof v === 'number' && v >= 0 && v <= 1) out[host] = v;
		}
	}
	return out;
};

function parseSearch(x: unknown): Search | null {
	if (!x || typeof x !== 'object') return null;
	const s = x as Record<string, unknown>;
	if (!isStr(s.id) || !isStr(s.query)) return null;
	return {
		id: s.id,
		query: s.query,
		affinity: affinityOf(s.affinity),
		liked: strArray(s.liked),
		passed: strArray(s.passed),
		at: typeof s.at === 'number' ? s.at : 0
	};
}

// 旧形式: 一言・噛み合い・いいね・よくないねがプロフィールに 1 本だけ入っていた。1 件の検索に移す
function migrateLegacySearch(
	d: Record<string, unknown>,
	p: Record<string, unknown>
): Search | null {
	const query = isStr(p.wish) ? p.wish : '';
	const liked = strArray(d.liked);
	const passed = strArray(d.passed);
	if (!query && liked.length === 0 && passed.length === 0) return null;
	return {
		...newSearch(query),
		affinity: query && p.affinityFor === query ? affinityOf(p.affinity) : {},
		liked,
		passed
	};
}

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
	if (d.taste && typeof d.taste === 'object') {
		for (const [k, v] of Object.entries(d.taste as Record<string, unknown>)) {
			if (typeof v === 'number' && v >= -1 && v <= 1) profile.taste[k as keyof Taste] = v;
		}
	}
	if (typeof d.swipes === 'number' && d.swipes >= 0) profile.swipes = Math.floor(d.swipes);
	if (Array.isArray(d.searches)) {
		profile.searches = d.searches.map(parseSearch).filter((s): s is Search => s !== null);
	} else {
		const legacy = migrateLegacySearch(d, p);
		if (legacy) profile.searches = [legacy];
	}
	profile.current =
		isStr(d.current) && profile.searches.some((s) => s.id === d.current)
			? d.current
			: (profile.searches[0]?.id ?? '');
	return profile;
}

// localStorage との読み書き。読めない・書けない環境でも動く
export function loadSavedProfile(): SavedProfile {
	try {
		return parseSavedProfile(localStorage.getItem(PROFILE_KEY));
	} catch {
		return emptyProfile();
	}
}
export function persistProfile(profile: SavedProfile): void {
	try {
		localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
	} catch {
		// 保存できなくても続ける
	}
}
