import { json } from '@sveltejs/kit';
import {
	buildAffinityRequests,
	buildIntentRequest,
	MAX_INTENT_LENGTH,
	MAX_TURNS,
	parseAffinity
} from '$lib/intent';
import { clefRunner, loadProfiles, memoryKv, type Scope } from '$lib/server/recommend';
import type { RequestHandler } from './$types';

const devKv = memoryKv();

// 「どんな場所を探している？」への一言と、そのあとの絞り込みの発言を、
// (1) 発見の設定への読み取り（Clef の生の回答）と (2) 各サーバーとの噛み合い確率に変換する
export const POST: RequestHandler = async ({ request, platform }) => {
	let body: { turns?: unknown; scope?: unknown };
	try {
		body = (await request.json()) as { turns?: unknown; scope?: unknown };
	} catch {
		return json({ error: 'invalid json' }, { status: 400 });
	}
	const turns = (Array.isArray(body.turns) ? body.turns : [])
		.filter((t): t is string => typeof t === 'string')
		.map((t) => t.trim().slice(0, MAX_INTENT_LENGTH))
		.filter((t) => t.length > 0)
		.slice(0, MAX_TURNS);
	const scope: Scope = body.scope === 'all' ? 'all' : 'open';
	if (turns.length === 0) return json({ error: 'turns is required' }, { status: 400 });

	const env = platform?.env;
	if (!env?.AI) return json({ answers: {}, affinity: {} }); // AI が無い環境では読み取りなし
	const runner = clefRunner(env.AI);
	try {
		const { profiles } = await loadProfiles({ kv: env.VIBE_KV ?? devKv, runner }, undefined, scope);
		const [intent, ...affinities] = await Promise.all([
			runner(buildIntentRequest(turns)),
			...buildAffinityRequests(turns, profiles).map((req) => runner(req))
		]);
		return json({ answers: intent.answers, affinity: parseAffinity(affinities, profiles) });
	} catch (e) {
		console.error('[intent]', e);
		return json({ answers: {}, affinity: {} });
	}
};
