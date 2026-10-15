import { json } from '@sveltejs/kit';
import {
	buildAffinityRequests,
	buildIntentRequest,
	MAX_INTENT_LENGTH,
	parseAffinity
} from '$lib/intent';
import { clefRunner, loadProfiles, memoryKv, type Scope } from '$lib/server/recommend';
import type { RequestHandler } from './$types';

const devKv = memoryKv();

// 「どんな場所を探している？」への一言を、
// (1) 発見の設定への読み取り（Clef の生の回答）と (2) 各サーバーとの噛み合い確率に変換する
export const POST: RequestHandler = async ({ request, platform }) => {
	let body: { text?: unknown; scope?: unknown };
	try {
		body = (await request.json()) as { text?: unknown; scope?: unknown };
	} catch {
		return json({ error: 'invalid json' }, { status: 400 });
	}
	const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_INTENT_LENGTH) : '';
	const scope: Scope = body.scope === 'all' ? 'all' : 'open';
	if (!text) return json({ error: 'text is required' }, { status: 400 });

	const env = platform?.env;
	if (!env?.AI) return json({ answers: {}, affinity: {} }); // AI が無い環境では読み取りなし
	const runner = clefRunner(env.AI);
	try {
		const { profiles } = await loadProfiles({ kv: env.VIBE_KV ?? devKv, runner }, undefined, scope);
		const [intent, ...affinities] = await Promise.all([
			runner(buildIntentRequest(text)),
			...buildAffinityRequests(text, profiles).map((req) => runner(req))
		]);
		return json({ answers: intent.answers, affinity: parseAffinity(affinities, profiles) });
	} catch (e) {
		console.error('[intent]', e);
		return json({ answers: {}, affinity: {} });
	}
};
