import { byActivity } from '$lib/candidates';
import { fetchServers } from '$lib/instances';
import { buildAffinityRequests, buildIntentRequest, parseAffinity, runAffinity } from '$lib/intent';
import { isJoinable, isListed } from '$lib/match';
import { fetchSampleNotes } from '$lib/sample';
import type { ServerInfo, ServerProfile } from '$lib/types';
import {
	type ClefAnswer,
	type ClefInput,
	type ClefOutput,
	type ClefRunner,
	getOrComputeVibe,
	parseExcerpts,
	parseVibeEntry,
	readMany,
	sampleKey,
	saveExcerpts,
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
const intentKeyPrefix = (scope: Scope) => `intent:v3:${scope}:`;

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
const EXCERPT_NOTES = 30; // 抜粋のために取る投稿数（長いものから 5 件残す）

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

// 投稿の抜粋が無いサーバーだけ LTL を取りに行って保存する（Clef は使わない）。
// 抜粋を持つ前に雰囲気を判定したサーバーを、判定し直さずに埋めるため
export async function fillExcerpts(
	servers: ServerInfo[],
	kv: VibeKv,
	sampler: Deps['sampler'] = fetchSampleNotes
): Promise<number> {
	let filled = 0;
	let next = 0;
	const worker = async () => {
		while (next < servers.length) {
			const s = servers[next++];
			if (!s.ltlAvailable || (await kv.get(sampleKey(s.host))) !== null) continue;
			const notes = await sampler(s.host, EXCERPT_NOTES);
			await saveExcerpts(kv, s.host, notes);
			if (notes.length > 0) filled++;
		}
	};
	await Promise.all(Array.from({ length: Math.min(CONCURRENCY, servers.length) }, worker));
	return filled;
}

// 抜粋はサーバー内（噛み合い判定）だけで使う。ブラウザに送る属性表からは外す
export function forClient(profiles: ServerProfile[]): ServerProfile[] {
	return profiles.map(({ excerpts: _excerpts, ...p }) => p);
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
		joinable.flatMap((s) => [vibeKey(s.host), sampleKey(s.host)])
	);
	const entries = joinable.map((server) => ({
		server,
		entry: parseVibeEntry(raw.get(vibeKey(server.host)) ?? null),
		excerpts: parseExcerpts(raw.get(sampleKey(server.host)) ?? null)
	}));
	const profiles: ServerProfile[] = entries.map(({ server, entry, excerpts }) => ({
		server,
		vibe: entry.vibe,
		excerpts
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
	// 雰囲気はあるのに抜粋が無いサーバー（抜粋を保存する前に判定したもの）は、応答後に LTL を取って埋める。
	// warm を待たずに自前で埋まるようにしておく: 本番で抜粋が 585 件中 3 件しか無く、噛み合い判定が
	// ずっと投稿なしで動いていた
	const excerptMissing = entries
		.filter(
			({ server, entry }) =>
				entry.vibe && server.ltlAvailable && raw.get(sampleKey(server.host)) === null
		)
		.map(({ server }) => server)
		.sort(byActivity)
		.slice(0, CANDIDATE_LIMIT);
	if (excerptMissing.length > 0 && defer)
		defer(fillExcerpts(excerptMissing, deps.kv, deps.sampler));
	const pendingCount = defer ? missing.length + excerptMissing.length : 0;
	if (pendingCount === 0 && missing.length === 0 && excerptMissing.length === 0) {
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
	const result: IntentResult = {
		answers: intent.answers,
		affinity: parseAffinity(outputs, profiles)
	};
	if (failed === 0) {
		await deps.kv.put(key, JSON.stringify(result), { expirationTtl: INTENT_TTL_SECONDS });
	}
	return result;
}
