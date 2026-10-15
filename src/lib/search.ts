// 探す言葉ごとのセッション。いいね / よくないねは言葉ごとに分ける
// （別の目的で外した鯖が、次の目的のときも消えたままにならないように）
export interface Search {
	id: string;
	query: string; // 探す言葉。空 = 条件だけで並べる
	affinity: Record<string, number>; // query と各サーバーの噛み合い確率（未読み取りなら空）
	liked: string[]; // いいねした host（順序あり）
	passed: string[]; // よくないねした host（この検索では二度と出さない）
	at: number; // 最後に使った時刻
}

export function newSearch(query = ''): Search {
	return { id: crypto.randomUUID(), query, affinity: {}, liked: [], passed: [], at: Date.now() };
}

// 言葉があり、その噛み合いが読み取り済みか
export function hasAffinity(s: Search): boolean {
	return s.query.length > 0 && Object.keys(s.affinity).length > 0;
}

export function seenHosts(s: Search): Set<string> {
	return new Set([...s.liked, ...s.passed]);
}
