import { selectCandidates } from '$lib/candidates';
import { fetchServers } from '$lib/instances';
import { hardFilter, rankServers } from '$lib/match';
import { fetchSampleNotes } from '$lib/sample';
import type { Match, Preference, ServerInfo, VibeProfile } from '$lib/types';
import {
	type ClefInput,
	type ClefOutput,
	type ClefRunner,
	getOrComputeVibe,
	listCachedHosts,
	type VibeKv
} from '$lib/vibe';

// ServerInfo の形を変えたら上げる
const SERVERS_KEY = 'servers:v2';
const SERVERS_TTL_SECONDS = 60 * 60;
// 1 リクエストで新たに Clef にかける候補の上限（レイテンシとコストの上限になる）
export const CANDIDATE_LIMIT = 40;
export const RESULT_LIMIT = 10;
const CONCURRENCY = 8;

// `vite dev` などバインディングがない環境向けの代替
export function memoryKv(): VibeKv {
	const store = new Map<string, string>();
	return {
		get: async (key) => store.get(key) ?? null,
		put: async (key, value) => {
			store.set(key, value);
		},
		list: async ({ prefix }) => ({
			keys: [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })),
			list_complete: true
		})
	};
}

export function clefRunner(ai: Ai): ClefRunner {
	return (input: ClefInput) =>
		ai.run('@cf/cloudflare/clef' as never, input as never) as unknown as Promise<ClefOutput>;
}

export async function getServers(kv: VibeKv): Promise<ServerInfo[]> {
	const cached = await kv.get(SERVERS_KEY);
	if (cached) return JSON.parse(cached) as ServerInfo[];
	const servers = await fetchServers();
	await kv.put(SERVERS_KEY, JSON.stringify(servers), { expirationTtl: SERVERS_TTL_SECONDS });
	return servers;
}

export interface Deps {
	kv: VibeKv;
	runner: ClefRunner | null;
}

export async function computeVibes(
	servers: ServerInfo[],
	deps: Deps
): Promise<{ server: ServerInfo; vibe: VibeProfile | null }[]> {
	if (!deps.runner) return servers.map((server) => ({ server, vibe: null }));
	const runner = deps.runner;
	const results: { server: ServerInfo; vibe: VibeProfile | null }[] = new Array(servers.length);
	let next = 0;
	const worker = async () => {
		while (next < servers.length) {
			const i = next++;
			const server = servers[i];
			const vibe = await getOrComputeVibe(server, {
				kv: deps.kv,
				runner,
				sampler: (host) => fetchSampleNotes(host)
			});
			results[i] = { server, vibe };
		}
	};
	await Promise.all(Array.from({ length: Math.min(CONCURRENCY, servers.length) }, worker));
	return results;
}

export async function recommend(
	pref: Preference,
	deps: Deps
): Promise<{ matches: Match[]; candidateCount: number; totalCount: number }> {
	const servers = await getServers(deps.kv);
	const cachedHosts = deps.runner ? await listCachedHosts(deps.kv) : new Set<string>();
	const candidates = selectCandidates(hardFilter(servers, pref), cachedHosts, CANDIDATE_LIMIT);
	const scored = await computeVibes(candidates, deps);
	return {
		matches: rankServers(scored, pref, RESULT_LIMIT),
		candidateCount: candidates.length,
		totalCount: servers.length
	};
}
