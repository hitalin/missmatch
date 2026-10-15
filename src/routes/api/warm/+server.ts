import { json } from '@sveltejs/kit';
import { byActivity } from '$lib/candidates';
import { isJoinable } from '$lib/match';
import { clefRunner, computeVibes, getServers } from '$lib/server/recommend';
import type { RequestHandler } from './$types';

// 雰囲気プロファイルを事前計算する（外部 cron から叩く想定）。
// 推薦され得るサーバー（日本語・登録受付中）だけを対象にする
export const POST: RequestHandler = async ({ request, url, platform }) => {
	const env = platform?.env;
	if (!env?.WARM_SECRET || request.headers.get('authorization') !== `Bearer ${env.WARM_SECRET}`) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200);
	const offset = Number(url.searchParams.get('offset') ?? 0);

	const servers = (await getServers(env.VIBE_KV))
		.filter(isJoinable)
		.sort(byActivity)
		.slice(offset, offset + limit);

	const results = await computeVibes(servers, { kv: env.VIBE_KV, runner: clefRunner(env.AI) });
	const computed = results.filter((r) => r.vibe !== null).length;
	return json({ requested: servers.length, computed, failed: servers.length - computed });
};
