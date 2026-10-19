import { json } from '@sveltejs/kit';
import { byActivity } from '$lib/candidates';
import { isInScope } from '$lib/match';
import {
	clefRunner,
	computeVibes,
	getServers,
	kvFrom,
	parseScope,
	warmIntents
} from '$lib/server/recommend';
import type { RequestHandler } from './$types';

// 雰囲気プロファイルを事前計算する（手で叩く用。例文の温めは Cron Triggers が src/worker.ts から回す）。
// 既定は登録受付中のサーバー。scope=all で招待制・停止中（生きているもの）も対象にする
export const POST: RequestHandler = async ({ request, url, platform }) => {
	const env = platform?.env;
	if (!env?.WARM_SECRET || request.headers.get('authorization') !== `Bearer ${env.WARM_SECRET}`) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	// mode=intents: トップページの例文の読み取りを温め直す（cron を待たずに手で温めたいとき）
	if (url.searchParams.get('mode') === 'intents') {
		return json(await warmIntents({ kv: kvFrom(env.VIBE_KV), runner: clefRunner(env.AI) }));
	}

	const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200);
	const offset = Number(url.searchParams.get('offset') ?? 0);

	const servers = (await getServers(kvFrom(env.VIBE_KV)))
		.filter((s) => isInScope(s, parseScope(url.searchParams.get('scope'))))
		.sort(byActivity)
		.slice(offset, offset + limit);

	const results = await computeVibes(servers, {
		kv: kvFrom(env.VIBE_KV),
		runner: clefRunner(env.AI)
	});
	const computed = results.filter((r) => r.vibe !== null).length;
	return json({ requested: servers.length, computed, failed: servers.length - computed });
};
