import { type AskAxis, applyIntent, chooseAxis } from './intent';
import type { Taste } from './match';
import type { Preferences } from './prefs';
import type { ClefAnswer } from './vibe';

// 探す言葉ごとのセッション。いいね / よくないねは言葉ごとに分ける
// （別の目的で外した鯖が、次の目的のときも消えたままにならないように）
export interface Search {
	id: string;
	query: string; // 最初の言葉。空 = 条件だけで並べる
	title: string; // 付けた名前（空なら query を題名にする）
	turns: string[]; // そのあと足した絞り込みの言葉（順序あり）
	affinity: Record<string, number>; // 言葉の並びと各サーバーの噛み合い確率（未読み取りなら空）
	affinityFor: string; // affinity を読み取ったときの言葉の並び（searchTurns を改行で結合）
	unsure: AskAxis[]; // 言葉から読み取れず、選択肢で聞く軸（答えるか「こだわらない」で消える）
	// 言葉の読み取り結果と聞き返しへの答え。全体の設定には書き込まず、この検索で並べるときだけ重ねる
	intent: Record<string, ClefAnswer>;
	choices: Partial<Record<AskAxis, string>>;
	// この検索のスワイプから学んだ好み（目的の違う検索のいいねを混ぜない）
	taste: Taste;
	swipes: number;
	liked: string[]; // いいねした host（順序あり）
	passed: string[]; // よくないねした host（この検索では二度と出さない）
	at: number; // 最後に使った時刻
}

export function newSearch(query = ''): Search {
	return {
		id: crypto.randomUUID(),
		query,
		title: '',
		turns: [],
		affinity: {},
		affinityFor: '',
		unsure: [],
		intent: {},
		choices: {},
		taste: {},
		swipes: 0,
		liked: [],
		passed: [],
		at: Date.now()
	};
}

// この検索で並べるときの設定: 全体の設定の空いている所を読み取りで埋め、聞き返しの答えで上書きする
export function effectivePrefs(prefs: Preferences, s: Search): Preferences {
	let p = applyIntent(prefs, s.intent);
	for (const [axis, choice] of Object.entries(s.choices) as [AskAxis, string][]) {
		p = chooseAxis(p, axis, choice);
	}
	return p;
}

// Clef に渡す発言の並び（最初の言葉 → 絞り込み）
export function searchTurns(s: Search): string[] {
	return [s.query, ...s.turns].filter((t) => t.length > 0);
}
export function searchText(s: Search): string {
	return searchTurns(s).join('\n');
}

// 言葉を足す。まだ最初の言葉が無ければそれになり、あれば絞り込みになる
export function refineSearch(s: Search, text: string): Search {
	const at = Date.now();
	return s.query ? { ...s, turns: [...s.turns, text], at } : { ...s, query: text, at };
}

// 今の言葉の並びに対して噛み合いが読み取り済みか（言葉を足したり消したりすると古くなる）
export function hasAffinity(s: Search): boolean {
	const text = searchText(s);
	return text.length > 0 && s.affinityFor === text && Object.keys(s.affinity).length > 0;
}

export function seenHosts(s: Search): Set<string> {
	return new Set([...s.liked, ...s.passed]);
}

export function searchTitle(s: Search): string {
	return s.title || s.query || '条件だけ';
}

// 一覧の見出し用: 言葉のある検索だけを、最後に使った日で 今日 / 昨日 / 過去 7 日 / それ以前 に分け、各組は新しい順
export interface SearchGroup {
	label: string;
	searches: Search[];
}
export function groupSearches(searches: Search[], now = Date.now()): SearchGroup[] {
	const day = 24 * 60 * 60 * 1000;
	const startOfToday = new Date(now).setHours(0, 0, 0, 0);
	const groups: SearchGroup[] = [
		{ label: '今日', searches: [] },
		{ label: '昨日', searches: [] },
		{ label: '過去 7 日', searches: [] },
		{ label: 'それ以前', searches: [] }
	];
	for (const s of searches.filter((x) => x.query).sort((a, b) => b.at - a.at)) {
		const i =
			s.at >= startOfToday
				? 0
				: s.at >= startOfToday - day
					? 1
					: s.at >= startOfToday - 7 * day
						? 2
						: 3;
		groups[i].searches.push(s);
	}
	return groups.filter((g) => g.searches.length > 0);
}
