import { byActivity } from '$lib/candidates';
import { fetchServers } from '$lib/instances';
import { isJoinable, isListed } from '$lib/match';
import { fetchSampleNotes } from '$lib/sample';
import type { ServerInfo, ServerProfile } from '$lib/types';
import {
	type ClefInput,
	type ClefOutput,
	type ClefRunner,
	getOrComputeVibe,
	readVibeEntry,
	type VibeKv
} from '$lib/vibe';

// ServerInfo の形を変えたら上げる
const SERVERS_KEY = 'servers:v6';
const SERVERS_TTL_SECONDS = 60 * 60;
// 1 リクエストで新たに Clef にかける候補の上限（レイテンシとコストの上限になる）
export const CANDIDATE_LIMIT = 40;
// 組み立て済みの属性表のキャッシュ。欠けが無くなったときだけ置き、毎回 97〜576 件の KV 読みを避ける
const PROFILES_TTL_SECONDS = 60 * 5;
const profilesKey = (scope: Scope) => `profiles:v2:${scope}`;
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

export async function computeVibes(servers: ServerInfo[], deps: Deps): Promise<ServerProfile[]> {
	if (!deps.runner) return servers.map((server) => ({ server, vibe: null }));
	const runner = deps.runner;
	const results: ServerProfile[] = new Array(servers.length);
	let next = 0;
	const worker = async () => {
		while (next < servers.length) {
			const i = next++;
			const server = servers[i];
			const vibe = await getOrComputeVibe(server, {
				kv: deps.kv,
				runner,
				// LTL を公開していないサーバーには触らず、説明文とルールだけで判定する
				sampler: (s) => (s.ltlAvailable ? fetchSampleNotes(s.host) : Promise.resolve([]))
			});
			results[i] = { server, vibe };
		}
	};
	await Promise.all(Array.from({ length: Math.min(CONCURRENCY, servers.length) }, worker));
	return results;
}

// 診断に使う属性表: 推薦され得る全サーバー。
// 雰囲気はキャッシュ済みの分だけ即座に返し、未判定は活発な順に上限まで応答後に計算する（defer があれば）。
// ユーザーを Clef の計算で待たせない。欠けは次のアクセスか warm で埋まる
export type Scope = 'open' | 'all';

export async function loadProfiles(
	deps: Deps,
	defer?: (work: Promise<unknown>) => void,
	scope: Scope = 'open'
): Promise<{ profiles: ServerProfile[]; totalCount: number; pendingCount: number }> {
	const cachedAll = await deps.kv.get(profilesKey(scope));
	if (cachedAll) {
		const parsed = JSON.parse(cachedAll) as { profiles: ServerProfile[]; totalCount: number };
		return { ...parsed, pendingCount: 0 };
	}
	const servers = await getServers(deps.kv);
	const joinable = servers.filter(scope === 'all' ? isListed : isJoinable);
	const entries = await Promise.all(
		joinable.map(async (server) => ({ server, entry: await readVibeEntry(deps.kv, server.host) }))
	);
	const profiles: ServerProfile[] = entries.map(({ server, entry }) => ({
		server,
		vibe: entry.vibe
	}));
	// 最近失敗したものは欠けに数えない（しばらく再試行しないし、キャッシュを止めもしない）
	const missing = entries
		.filter(({ entry }) => entry.vibe === null && !entry.failed)
		.map(({ server }) => server)
		.sort(byActivity)
		.slice(0, CANDIDATE_LIMIT);
	if (missing.length > 0 && deps.runner) {
		const work = computeVibes(missing, deps);
		if (defer) {
			defer(work);
		} else {
			const byHost = new Map((await work).map((p) => [p.server.host, p.vibe]));
			for (const p of profiles) p.vibe = byHost.get(p.server.host) ?? p.vibe;
		}
	}
	const pendingCount = defer ? missing.length : 0;
	if (pendingCount === 0 && missing.length === 0) {
		await deps.kv.put(
			profilesKey(scope),
			JSON.stringify({ profiles, totalCount: servers.length }),
			{ expirationTtl: PROFILES_TTL_SECONDS }
		);
	}
	return { profiles, totalCount: servers.length, pendingCount };
}
