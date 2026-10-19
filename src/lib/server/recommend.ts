import { byActivity } from '$lib/candidates';
import { EXAMPLES } from '$lib/examples';
import { fetchServers } from '$lib/instances';
import { buildAffinityRequests, buildIntentRequest, parseAffinity, runAffinity } from '$lib/intent';
import { isInScope } from '$lib/match';
import { defaultPreferences, type Scope, scopeFor } from '$lib/prefs';
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
const SERVERS_KEY = 'servers:v8';
// 一覧は 1 時間より古ければ応答後に取り直す（取りに行くのを待たせない）。KV には 1 日置く
const SERVERS_FRESH_MS = 60 * 60 * 1000;
const SERVERS_KEEP_SECONDS = 60 * 60 * 24;
// 1 リクエストで新たに Clef にかける候補の上限（レイテンシとコストの上限になる）
export const CANDIDATE_LIMIT = 40;
// 組み立て済みの属性表。欠けがあっても置き（埋まったら置き直す）、毎回 97〜576 件の KV 読みを避ける。
// 5 分より古ければ古いまま返して応答後に作り直すので、ユーザーが待つのは KV 1 回の読みだけ
const PROFILES_FRESH_MS = 5 * 60 * 1000;
const PROFILES_KEEP_SECONDS = 60 * 60 * 24;
const profilesKey = (scope: Scope) => `profiles:v5:${scope}`;
const CONCURRENCY = 8;
// 同じ言葉の読み取りは使い回す（トップページの例文など、同じ言葉は何度も来る）。
// 雰囲気は 7 日おきにしか変わらないので、6 時間古くても順位はほぼ同じ
const INTENT_TTL_SECONDS = 60 * 60 * 6;
// 噛み合い判定に渡す state や基準を変えたら上げる（古い判定を 1 時間引きずらない）
const intentKeyPrefix = (scope: Scope) => `intent:v5:${scope}:`;

// 応答を返したあとに続ける仕事（Workers の ctx.waitUntil）
type Defer = (work: Promise<unknown>) => void;

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

interface ServersCache {
	fetchedAt: number;
	servers: ServerInfo[];
}
async function refreshServers(kv: VibeKv, fetcher: () => Promise<ServerInfo[]>) {
	const servers = await fetcher();
	await kv.put(SERVERS_KEY, JSON.stringify({ fetchedAt: Date.now(), servers } as ServersCache), {
		expirationTtl: SERVERS_KEEP_SECONDS
	});
	return servers;
}

// サーバー一覧。古ければ古いまま返し、取り直しは defer に回す（defer が無ければ取り直して返す）
export async function getServers(
	kv: VibeKv,
	defer?: Defer,
	fetcher: () => Promise<ServerInfo[]> = fetchServers
): Promise<ServerInfo[]> {
	const cached = await kv.get(SERVERS_KEY);
	if (!cached) return refreshServers(kv, fetcher);
	const { fetchedAt, servers } = JSON.parse(cached) as ServersCache;
	if (Date.now() - fetchedAt <= SERVERS_FRESH_MS) return servers;
	if (!defer) return refreshServers(kv, fetcher);
	defer(refreshServers(kv, fetcher).catch((e) => console.error('[servers] refresh', e)));
	return servers;
}

export interface Deps {
	kv: VibeKv;
	runner: ClefRunner | null;
	sampler?: (host: string, limit?: number) => Promise<string[]>; // 既定は LTL を取りに行く（テストで差し替える）
	fetcher?: () => Promise<ServerInfo[]>; // 既定は joinmisskey の一覧を取りに行く（テストで差し替える）
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

export type { Scope };
export function parseScope(value: unknown): Scope {
	return value === 'all' || value === 'invite' ? value : 'open';
}

interface ProfilesSnapshot {
	builtAt: number;
	profiles: ServerProfile[];
	totalCount: number;
}
// 置けなくても応答は返す（同じ鍵への書き込みは 1 秒に 1 回までで、同時に組み立てると片方が弾かれる）
async function putSnapshot(kv: VibeKv, scope: Scope, snapshot: ProfilesSnapshot) {
	try {
		await kv.put(profilesKey(scope), JSON.stringify(snapshot), {
			expirationTtl: PROFILES_KEEP_SECONDS
		});
	} catch (e) {
		console.error('[profiles] put', e);
	}
}

// 一覧と判定済みの雰囲気から属性表を組み立てて置く。
// 欠けは活発な順に上限まで計算し、終わったら埋めて置き直す（defer があれば応答後に）
async function buildProfiles(
	deps: Deps,
	scope: Scope,
	defer?: Defer
): Promise<{ snapshot: ProfilesSnapshot; pendingCount: number }> {
	const servers = await getServers(deps.kv, defer, deps.fetcher);
	const joinable = servers.filter((s) => isInScope(s, scope));
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
	const snapshot: ProfilesSnapshot = { builtAt: Date.now(), profiles, totalCount: servers.length };
	await putSnapshot(deps.kv, scope, snapshot);
	// 最近失敗したものは欠けに数えない（しばらく再試行しない）
	const missing = entries
		.filter(({ entry }) => entry.vibe === null && !entry.failed)
		.map(({ server }) => server)
		.sort(byActivity)
		.slice(0, CANDIDATE_LIMIT);
	if (missing.length === 0 || !deps.runner) return { snapshot, pendingCount: 0 };
	const fill = computeVibes(missing, deps).then((computed) => {
		const byHost = new Map(computed.map((p) => [p.server.host, p.vibe]));
		const filled: ProfilesSnapshot = {
			...snapshot,
			profiles: profiles.map((p) => ({ ...p, vibe: byHost.get(p.server.host) ?? p.vibe }))
		};
		return putSnapshot(deps.kv, scope, filled).then(() => filled);
	});
	if (!defer) return { snapshot: await fill, pendingCount: 0 };
	defer(fill.catch((e) => console.error('[profiles] fill', e)));
	return { snapshot, pendingCount: missing.length };
}

// 診断に使う属性表: 推薦され得る全サーバー。
// 組み立て済みがあればそれを返す（古ければ作り直しを defer に回す）。無ければ組み立てる。
// ユーザーを Clef の計算で待たせない。欠けは応答後に埋まる
export async function loadProfiles(
	deps: Deps,
	defer?: Defer,
	scope: Scope = 'open'
): Promise<{ profiles: ServerProfile[]; totalCount: number; pendingCount: number }> {
	const cached = await deps.kv.get(profilesKey(scope));
	if (cached) {
		const snapshot = JSON.parse(cached) as ProfilesSnapshot;
		const stale = Date.now() - snapshot.builtAt > PROFILES_FRESH_MS;
		if (!stale || defer) {
			if (stale && defer)
				defer(
					buildProfiles(deps, scope, defer).catch((e) => console.error('[profiles] rebuild', e))
				);
			return { profiles: snapshot.profiles, totalCount: snapshot.totalCount, pendingCount: 0 };
		}
	}
	const { snapshot, pendingCount } = await buildProfiles(deps, scope, defer);
	return { profiles: snapshot.profiles, totalCount: snapshot.totalCount, pendingCount };
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
	defer?: Defer,
	options: { fresh?: boolean } = {}
): Promise<IntentResult> {
	const key = await intentKey(scope, turns);
	// 属性表は判定キャッシュの読みと並行して読み始める（外れたとき KV 1 往復ぶん早く Clef に入れる）
	const loading = loadProfiles(deps, defer, scope);
	loading.catch(() => {}); // 判定キャッシュが当たって使わなかったときの未処理 rejection を防ぐ
	const cached = options.fresh ? null : await deps.kv.get(key);
	if (cached) {
		try {
			const result = JSON.parse(cached) as IntentResult;
			defer?.(loading); // 読み始めた属性表の作り直しが走るなら、応答後も続けさせる
			return result;
		} catch {
			// 壊れていれば読み直す
		}
	}
	const { profiles } = await loading;
	const [intent, { outputs, failed }] = await Promise.all([
		deps.runner(buildIntentRequest(turns)),
		// clef-flash は A/B で recall@5 81 → 48%、しかも遅かった（平均 2.2 → 3.3 秒）ので使わない（2026-10-17）
		runAffinity(deps.runner, buildAffinityRequests(turns, profiles))
	]);
	const affinity = parseAffinity(outputs, profiles);
	// 上位 16 件を 1 本で比べ直す再ランキングは試したが、A/B で recall@5 84 vs 83%、MRR 90 vs 89% と
	// 誤差の範囲で、応答が 1.6 → 2.8 秒に伸びたので外した（2026-10-17、32 言葉）
	const result: IntentResult = { answers: intent.answers, affinity };
	if (failed === 0) {
		await deps.kv.put(key, JSON.stringify(result), { expirationTtl: INTENT_TTL_SECONDS });
	}
	return result;
}

// トップページの例文の読み取りを、既定の範囲で温め直す（キャッシュの期限内でも置き直す）。
// Cron Triggers（wrangler.toml の crons）と /api/warm?mode=intents の両方から呼ぶ
export async function warmIntents(
	deps: Deps & { runner: ClefRunner }
): Promise<{ warmed: number; scope: Scope }> {
	const scope = scopeFor(defaultPreferences());
	let warmed = 0;
	for (const text of EXAMPLES) {
		await readIntent(deps, [text], scope, undefined, { fresh: true });
		warmed++;
	}
	return { warmed, scope };
}
