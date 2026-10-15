import { json } from '@sveltejs/kit';
import { clefRunner, loadProfiles, memoryKv, type Scope } from '$lib/server/recommend';
import type { RequestHandler } from './$types';

// vite dev ではバインディングがないため、プロセス内メモリで代用する
const devKv = memoryKv();

// 診断に使うサーバー属性表。絞り込みと採点はブラウザ側で行う。
// 雰囲気の欠けは応答後に計算する（waitUntil）ので、このリクエストは Clef を待たない
// scope=all で招待制・停止中（生きているもの）まで含める
export const GET: RequestHandler = async ({ url, platform, setHeaders }) => {
	const env = platform?.env;
	const ctx = platform?.context;
	const scope: Scope = url.searchParams.get('scope') === 'all' ? 'all' : 'open';
	try {
		const result = await loadProfiles(
			{ kv: env?.VIBE_KV ?? devKv, runner: env?.AI ? clefRunner(env.AI) : null },
			ctx ? (work) => ctx.waitUntil(work) : undefined,
			scope
		);
		setHeaders({ 'cache-control': result.pendingCount > 0 ? 'no-store' : 'public, max-age=300' });
		return json(result);
	} catch (e) {
		console.error('[servers]', e);
		return json({ error: 'failed to load servers' }, { status: 502 });
	}
};
