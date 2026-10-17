import { byActivity } from '$lib/candidates';
import { fetchServers } from '$lib/instances';
import {
	buildAffinityRequests,
	buildIntentRequest,
	buildRerankRequest,
	parseAffinity,
	parseRerank,
	RERANK_SHARE,
	RERANK_TOP,
	runAffinity
} from '$lib/intent';
import { isJoinable, isListed } from '$lib/match';
import { fetchSampleNotes } from '$lib/sample';
import type { ServerInfo, ServerProfile } from '$lib/types';
import {
	type ClefAnswer,
	type ClefInput,
	type ClefOutput,
	type ClefRunner,
	getOrComputeVibe,
	parseVibeEntry,
	readMany,
	type VibeKv,
	vibeKey
} from '$lib/vibe';

// ServerInfo の形を変えたら上げる
const SERVERS_KEY = 'servers:v7';
const SERVERS_TTL_SECONDS = 60 * 60;
// 1 リクエストで新たに Clef にかける候補の上限（レイテンシとコストの上限になる）
export const CANDIDATE_LIMIT = 40;
// 組み立て済みの属性表のキャッシュ。欠けが無くなったときだけ置き、毎回 97〜576 件の KV 読みを避ける
const PROFILES_TTL_SECONDS = 60 * 5;
const profilesKey = (scope: Scope) => `profiles:v4:${scope}`;
const CONCURRENCY = 8;
// 同じ言葉の読み取りは使い回す（トップページの例文など、同じ言葉は何度も来る）。
// 雰囲気は 7 日おきにしか変わらないので、1 時間古くても順位はほぼ同じ
const INTENT_TTL_SECONDS = 60 * 60;
// 噛み合い判定に渡す state や基準を変えたら上げる（古い判定を 1 時間引きずらない）
const intentKeyPrefix = (scope: Scope) => `intent:v4:${scope}:`;

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

// KVNamespace を VibeKv に合わせる（一括読みを付ける）
export function kvFrom(ns: KVNamespace): VibeKv {
	return {
		get: (key) => ns.get(key),
		getMany: (keys) => ns.get(keys),
		put: (key, value, options) => ns.put(key, value, options),
		list: (options) => ns.list(options)
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
	sampler?: (host: string, limit?: number) => Promise<string[]>; // 既定は LTL を取りに行く（テストで差し替える）
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
				sampler: (s) =>
					s.ltlAvailable ? (deps.sampler ?? fetchSampleNotes)(s.host) : Promise.resolve([])
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
	const raw = await readMany(
		deps.kv,
		joinable.map((s) => vibeKey(s.host))
	);
	const entries = joinable.map((server) => ({
		server,
		entry: parseVibeEntry(raw.get(vibeKey(server.host)) ?? null)
	}));
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

export interface IntentResult {
	answers: Record<string, ClefAnswer>;
	affinity: Record<string, number>;
}

async function intentKey(scope: Scope, turns: string[]): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(turns.join('\n')));
	const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
	return `${intentKeyPrefix(scope)}${hex}`;
}

// 言葉の並びを (1) 設定の読み取りと (2) 各サーバーとの噛み合いに変換する。
// 雰囲気の欠けは defer に回して判定を待たせない（以前は欠け 40 件の LTL 取得と Clef を待ってから判定を始めていた）。
// 噛み合いが全バッチそろったときだけ KV に置き、同じ言葉はキャッシュから返す（fresh なら読まずに判定し直す。評価用）
export async function readIntent(
	deps: Deps & { runner: ClefRunner },
	turns: string[],
	scope: Scope,
	defer?: (work: Promise<unknown>) => void,
	options: { fresh?: boolean } = {}
): Promise<IntentResult> {
	const key = await intentKey(scope, turns);
	const cached = options.fresh ? null : await deps.kv.get(key);
	if (cached) {
		try {
			return JSON.parse(cached) as IntentResult;
		} catch {
			// 壊れていれば読み直す
		}
	}
	const { profiles } = await loadProfiles(deps, defer, scope);
	const [intent, { outputs, failed }] = await Promise.all([
		deps.runner(buildIntentRequest(turns)),
		runAffinity(deps.runner, buildAffinityRequests(turns, profiles))
	]);
	const affinity = parseAffinity(outputs, profiles);
	// 第 2 段: 上位を 1 リクエストで比べ直す（失敗したら第 1 段のまま）
	const top = profiles
		.filter((p) => affinity[p.server.host] !== undefined)
		.sort((a, b) => affinity[b.server.host] - affinity[a.server.host])
		.slice(0, RERANK_TOP);
	if (top.length > 1) {
		const { outputs: rerankOut } = await runAffinity(deps.runner, [buildRerankRequest(turns, top)]);
		if (rerankOut.length > 0) {
			const rerank = parseRerank(
				rerankOut[0],
				top.map((p) => p.server.host)
			);
			for (const [host, r] of Object.entries(rerank)) {
				affinity[host] = (1 - RERANK_SHARE) * affinity[host] + RERANK_SHARE * r;
			}
		}
	}
	const result: IntentResult = { answers: intent.answers, affinity };
	if (failed === 0) {
		await deps.kv.put(key, JSON.stringify(result), { expirationTtl: INTENT_TTL_SECONDS });
	}
	return result;
}
