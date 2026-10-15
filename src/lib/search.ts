import type { AskAxis } from './intent';

// 探す言葉ごとのセッション。いいね / よくないねは言葉ごとに分ける
// （別の目的で外した鯖が、次の目的のときも消えたままにならないように）
export interface Search {
	id: string;
	query: string; // 最初の言葉（この検索の題名）。空 = 条件だけで並べる
	turns: string[]; // そのあと足した絞り込みの言葉（順序あり）
	affinity: Record<string, number>; // 言葉の並びと各サーバーの噛み合い確率（未読み取りなら空）
	affinityFor: string; // affinity を読み取ったときの言葉の並び（searchTurns を改行で結合）
	unsure: AskAxis[]; // 言葉から読み取れず、選択肢で聞く軸（答えるか「こだわらない」で消える）
	liked: string[]; // いいねした host（順序あり）
	passed: string[]; // よくないねした host（この検索では二度と出さない）
	at: number; // 最後に使った時刻
}

export function newSearch(query = ''): Search {
	return {
		id: crypto.randomUUID(),
		query,
		turns: [],
		affinity: {},
		affinityFor: '',
		unsure: [],
		liked: [],
		passed: [],
		at: Date.now()
	};
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
	return s.query ? { ...s, turns: [...s.turns, text] } : { ...s, query: text };
}

// 今の言葉の並びに対して噛み合いが読み取り済みか（言葉を足したり消したりすると古くなる）
export function hasAffinity(s: Search): boolean {
	const text = searchText(s);
	return text.length > 0 && s.affinityFor === text && Object.keys(s.affinity).length > 0;
}

export function seenHosts(s: Search): Set<string> {
	return new Set([...s.liked, ...s.passed]);
}
