import { json } from '@sveltejs/kit';
import { MAX_INTENT_LENGTH, MAX_TURNS } from '$lib/intent';
import { PREFETCH_NEURONS } from '$lib/server/budget';
import { EMBED_MODELS, type EmbedModel } from '$lib/server/embed';
import {
	clefDeps,
	clefRunner,
	type Deps,
	memoryKv,
	parseScope,
	readIntent
} from '$lib/server/recommend';
import type { ClefRunner } from '$lib/vibe';
import type { RequestHandler } from './$types';

const devKv = memoryKv();

// 「どんな場所を探している？」への一言と、そのあとの絞り込みの発言を、
// (1) 発見の設定への読み取り（Clef の生の回答）と (2) 各サーバーとの噛み合い確率に変換する
export const POST: RequestHandler = async ({ request, platform }) => {
	let body: {
		turns?: unknown;
		scope?: unknown;
		fresh?: unknown;
		prefetch?: unknown;
		candidates?: unknown; // 評価用: Clef に渡す候補の数（0 で全サーバー）
		embed?: unknown; // 評価用: 埋め込みモデル
	};
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
	const defer = ctx ? (work: Promise<unknown>) => ctx.waitUntil(work) : undefined;
	const embed =
		typeof body.embed === 'string' && body.embed in EMBED_MODELS
			? (body.embed as EmbedModel)
			: undefined;
	const deps: Deps & { runner: ClefRunner } = env.VIBE_KV
		? clefDeps(env, embed)
		: { kv: devKv, runner: clefRunner(env.AI) };
	// 入力が止まるたびの先読みは、今日の枠の半分を超えたら受けない（残りは送った言葉のために取っておく）。
	// 503 を返すとブラウザは先読みの結果を持ち越さず、送ったときに読み直す
	if (body.prefetch === true && deps.budget && (await deps.budget.spent()) >= PREFETCH_NEURONS) {
		return json({ error: 'prefetch budget exhausted' }, { status: 503 });
	}
	try {
		const result = await readIntent(deps, turns, scope, defer, {
			fresh: body.fresh === true, // 評価スクリプト用。キャッシュを読まずに判定し直す
			candidates: typeof body.candidates === 'number' ? body.candidates : undefined
		});
		// 使った Neurons は応答後に KV へ足す
		if (deps.budget) defer ? defer(deps.budget.flush()) : await deps.budget.flush();
		return json(result);
	} catch (e) {
		console.error('[intent]', e);
		return json({ answers: {}, affinity: {} });
	}
};
