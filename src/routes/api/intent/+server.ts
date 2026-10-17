import { json } from '@sveltejs/kit';
import { MAX_INTENT_LENGTH, MAX_TURNS } from '$lib/intent';
import { clefRunner, kvFrom, memoryKv, parseScope, readIntent } from '$lib/server/recommend';
import type { RequestHandler } from './$types';

const devKv = memoryKv();

// 「どんな場所を探している？」への一言と、そのあとの絞り込みの発言を、
// (1) 発見の設定への読み取り（Clef の生の回答）と (2) 各サーバーとの噛み合い確率に変換する
export const POST: RequestHandler = async ({ request, platform }) => {
	let body: { turns?: unknown; scope?: unknown; fresh?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return json({ error: 'invalid json' }, { status: 400 });
	}
	const turns = (Array.isArray(body.turns) ? body.turns : [])
		.filter((t): t is string => typeof t === 'string')
		.map((t) => t.trim().slice(0, MAX_INTENT_LENGTH))
		.filter((t) => t.length > 0)
		.slice(0, MAX_TURNS);
	const scope = parseScope(body.scope);
	if (turns.length === 0) return json({ error: 'turns is required' }, { status: 400 });

	const env = platform?.env;
	const ctx = platform?.context;
	if (!env?.AI) return json({ answers: {}, affinity: {} }); // AI が無い環境では読み取りなし
	try {
		const result = await readIntent(
			{ kv: env.VIBE_KV ? kvFrom(env.VIBE_KV) : devKv, runner: clefRunner(env.AI) },
			turns,
			scope,
			ctx ? (work) => ctx.waitUntil(work) : undefined,
			{ fresh: body.fresh === true } // 評価スクリプト用。キャッシュを読まずに判定し直す
		);
		return json(result);
	} catch (e) {
		console.error('[intent]', e);
		return json({ answers: {}, affinity: {} });
	}
};
