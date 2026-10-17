import { json } from '@sveltejs/kit';
import { byActivity } from '$lib/candidates';
import { EXAMPLES } from '$lib/examples';
import { isInScope } from '$lib/match';
import { defaultPreferences, scopeFor } from '$lib/prefs';
import {
	clefRunner,
	computeVibes,
	getServers,
	kvFrom,
	parseScope,
	readIntent
} from '$lib/server/recommend';
import type { RequestHandler } from './$types';

// 雰囲気プロファイルを事前計算する（外部 cron から叩く想定）。
// 既定は登録受付中のサーバー。scope=all で招待制・停止中（生きているもの）も対象にする
export const POST: RequestHandler = async ({ request, url, platform }) => {
	const env = platform?.env;
	if (!env?.WARM_SECRET || request.headers.get('authorization') !== `Bearer ${env.WARM_SECRET}`) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	// mode=intents: トップページの例文の読み取りを既定の範囲で温め直す（キャッシュの期限内でも置き直す）
	if (url.searchParams.get('mode') === 'intents') {
		const deps = { kv: kvFrom(env.VIBE_KV), runner: clefRunner(env.AI) };
		const scope = scopeFor(defaultPreferences());
		let warmed = 0;
		for (const text of EXAMPLES) {
			await readIntent(deps, [text], scope, undefined, { fresh: true });
			warmed++;
		}
		return json({ warmed, scope });
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
