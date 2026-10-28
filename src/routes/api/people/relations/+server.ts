import { json } from '@sveltejs/kit';
import { relationsFor } from '$lib/server/deck';
import { viewerFrom } from '$lib/server/people-routes';
import type { RequestHandler } from './$types';

// いいね一覧の状態（未フォロー / リクエスト送信済み / フォロー中 / 相互）
export const POST: RequestHandler = async ({ request, cookies, platform }) => {
	const v = await viewerFrom(cookies, platform);
	if (v instanceof Response) return v;
	const body = (await request.json().catch(() => ({}))) as { accts?: unknown };
	const accts = (Array.isArray(body.accts) ? body.accts : [])
		.filter((a): a is string => typeof a === 'string')
		.map((a) => a.toLowerCase())
		.slice(0, 100);
	return json(await relationsFor(v.deps, v.viewer, accts));
};
