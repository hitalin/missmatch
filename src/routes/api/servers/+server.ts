import { json } from '@sveltejs/kit';
import {
	clefDeps,
	clefRunner,
	type Deps,
	loadProfiles,
	memoryKv,
	parseScope
} from '$lib/server/recommend';
import type { RequestHandler } from './$types';

// vite dev ではバインディングがないため、プロセス内メモリで代用する
const devKv = memoryKv();

// 診断に使うサーバー属性表。絞り込みと採点はブラウザ側で行う。
// 組み立て済みの属性表を KV 1 回の読みで返す。古ければ作り直し、雰囲気の欠けは計算を、
// どちらも応答後に回す（waitUntil）ので、このリクエストは joinmisskey も Clef も待たない
// scope=invite で生きている招待制まで、scope=all で停止中（生きているもの）まで含める
export const GET: RequestHandler = async ({ url, platform, setHeaders }) => {
	const env = platform?.env;
	const ctx = platform?.context;
	const scope = parseScope(url.searchParams.get('scope'));
	const deps: Deps =
		env?.AI && env.VIBE_KV
			? clefDeps(env)
			: { kv: devKv, runner: env?.AI ? clefRunner(env.AI) : null };
	// 応答後の欠け埋めで使った Neurons は、その仕事が終わってから KV へ足す
	const defer = ctx
		? (work: Promise<unknown>) =>
				ctx.waitUntil(deps.budget ? work.finally(() => deps.budget?.flush()) : work)
		: undefined;
	try {
		const result = await loadProfiles(deps, defer, scope);
		setHeaders({ 'cache-control': result.pendingCount > 0 ? 'no-store' : 'public, max-age=300' });
		return json(result);
	} catch (e) {
		console.error('[servers]', e);
		return json({ error: 'failed to load servers' }, { status: 502 });
	}
};
