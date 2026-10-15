import { json } from '@sveltejs/kit';
import { byActivity } from '$lib/candidates';
import { isJoinable, isListed } from '$lib/match';
import { clefRunner, computeVibes, fillExcerpts, getServers } from '$lib/server/recommend';
import type { RequestHandler } from './$types';

// 雰囲気プロファイルを事前計算する（外部 cron から叩く想定）。mode=samples なら投稿の抜粋だけ。
// 既定は登録受付中のサーバー。scope=all で招待制・停止中（生きているもの）も対象にする
export const POST: RequestHandler = async ({ request, url, platform }) => {
	const env = platform?.env;
	if (!env?.WARM_SECRET || request.headers.get('authorization') !== `Bearer ${env.WARM_SECRET}`) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200);
	const offset = Number(url.searchParams.get('offset') ?? 0);

	const servers = (await getServers(env.VIBE_KV))
		.filter(url.searchParams.get('scope') === 'all' ? isListed : isJoinable)
		.sort(byActivity)
		.slice(offset, offset + limit);

	// mode=samples: 噛み合い判定用の投稿の抜粋だけを埋める（Clef を呼ばない）
	if (url.searchParams.get('mode') === 'samples') {
		const filled = await fillExcerpts(servers, env.VIBE_KV);
		return json({ requested: servers.length, filled });
	}

	const results = await computeVibes(servers, { kv: env.VIBE_KV, runner: clefRunner(env.AI) });
	const computed = results.filter((r) => r.vibe !== null).length;
	return json({ requested: servers.length, computed, failed: servers.length - computed });
};
