import { FEATURES, type Feature } from './features';
import { ASK_AXES, type AskAxis } from './intent';
import type { Taste } from './match';
import {
	ACTIVITIES,
	AGES,
	type Age,
	DEALBREAKER_LABELS,
	defaultPreferences,
	PACES,
	type Preferences,
	REGISTRATIONS,
	SCALES,
	TOPICS
} from './prefs';
import { newSearch, type Search } from './search';
import type { ClefAnswer } from './vibe';

// ブラウザに保持するもの。マッチングアプリと同じく、作ったプロフィールと履歴は残す。
// 設定と学習した好みは「その人」のものなので 1 本、いいね / よくないねは検索ごと
export interface SavedProfile {
	prefs: Preferences;
	searches: Search[]; // 探した言葉ごとのセッション
	current: string; // 今開いている検索の id（searches が空なら ''）
}

export const PROFILE_KEY = 'missmatch:profile:v2';

export function emptyProfile(): SavedProfile {
	return { prefs: defaultPreferences(), searches: [], current: '' };
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

// 検索を消す。開いていたものなら、最後に使った検索に移る
export function deleteSearch(p: SavedProfile, id: string): SavedProfile {
	const searches = p.searches.filter((s) => s.id !== id);
	if (p.current !== id) return { ...p, searches };
	const latest = searches.reduce<Search | null>((a, s) => (!a || s.at > a.at ? s : a), null);
	return { ...p, searches, current: latest?.id ?? '' };
}

export function renameSearch(p: SavedProfile, id: string, title: string): SavedProfile {
	const t = title.trim();
	return { ...p, searches: p.searches.map((s) => (s.id === id ? { ...s, title: t } : s)) };
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

const isAxis = (a: string): a is AskAxis => (ASK_AXES as readonly string[]).includes(a);
const ANSWER_TYPES = ['noul', 'choice', 'score'];
// Clef の回答（読み取り結果）。形の崩れたものは捨てる
function intentOf(x: unknown): Record<string, ClefAnswer> {
	const out: Record<string, ClefAnswer> = {};
	if (!x || typeof x !== 'object') return out;
	for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
		if (v && typeof v === 'object' && ANSWER_TYPES.includes((v as { type?: string }).type ?? '')) {
			out[k] = v as ClefAnswer;
		}
	}
	return out;
}
function choicesOf(x: unknown): Partial<Record<AskAxis, string>> {
	const out: Partial<Record<AskAxis, string>> = {};
	if (!x || typeof x !== 'object') return out;
	for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
		if (isAxis(k) && isStr(v)) out[k] = v;
	}
	return out;
}
function tasteOf(x: unknown): Taste {
	const out: Taste = {};
	if (!x || typeof x !== 'object') return out;
	for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
		if ((FEATURES as readonly string[]).includes(k) && typeof v === 'number' && v >= -1 && v <= 1) {
			out[k as Feature] = v;
		}
	}
	return out;
}
const swipesOf = (x: unknown): number => (typeof x === 'number' && x >= 0 ? Math.floor(x) : 0);

function parseSearch(x: unknown): Search | null {
	if (!x || typeof x !== 'object') return null;
	const s = x as Record<string, unknown>;
	if (!isStr(s.id) || !isStr(s.query)) return null;
	return {
		id: s.id,
		query: s.query,
		title: isStr(s.title) ? s.title : '',
		turns: strArray(s.turns),
		affinity: affinityOf(s.affinity),
		affinityFor: isStr(s.affinityFor) ? s.affinityFor : '',
		unsure: strArray(s.unsure).filter((a): a is AskAxis =>
			(ASK_AXES as readonly string[]).includes(a)
		),
		intent: intentOf(s.intent),
		choices: choicesOf(s.choices),
		taste: tasteOf(s.taste),
		swipes: swipesOf(s.swipes),
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
	const fresh = query.length > 0 && p.affinityFor === query;
	return {
		...newSearch(query),
		affinity: fresh ? affinityOf(p.affinity) : {},
		affinityFor: fresh ? query : '',
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
	// 旧形式は adult: boolean（18 歳以上か）
	if (typeof p.adult === 'boolean') prefs.age = p.adult ? 'adult' : 'minor';
	if (isStr(p.age) && (AGES as string[]).includes(p.age)) prefs.age = p.age as Age;
	prefs.nsfw = oneOf(p.nsfw, ['avoid', 'neutral', 'welcome'] as const, 'avoid');
	prefs.activity = oneOf(p.activity, ACTIVITIES, 'any');
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
	// 旧形式: 学習した好みは全体で 1 本だった。開いている検索がまだ何も学んでいなければそこへ移す
	const legacyTaste = tasteOf(d.taste);
	const cur = profile.searches.find((s) => s.id === profile.current);
	if (cur && cur.swipes === 0 && Object.keys(legacyTaste).length > 0) {
		cur.taste = legacyTaste;
		cur.swipes = swipesOf(d.swipes);
	}
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
