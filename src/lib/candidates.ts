import type { ServerInfo } from './types';

export function byActivity(a: ServerInfo, b: ServerInfo): number {
	return (b.dru15 ?? 0) - (a.dru15 ?? 0);
}

// 雰囲気判定済みのサーバーは全件候補にし、未判定は活発な順に uncachedLimit 件まで Clef にかける。
// キャッシュが育つほど候補が広がり、初回のレイテンシは上限で抑えられる。
export function selectCandidates(
	servers: ServerInfo[],
	cachedHosts: Set<string>,
	uncachedLimit: number
): ServerInfo[] {
	const sorted = [...servers].sort(byActivity);
	const uncached = sorted.filter((s) => !cachedHosts.has(s.host)).slice(0, uncachedLimit);
	const cached = sorted.filter((s) => cachedHosts.has(s.host));
	return [...uncached, ...cached];
}
