import { json } from '@sveltejs/kit';
import { cardFor } from '$lib/server/deck';
import { viewerFrom } from '$lib/server/people-routes';
import type { RequestHandler } from './$types';

// いいね一覧の詳細シート: 1 人分のカード（bio・プロフィール欄・固定ノート）と関係
export const GET: RequestHandler = async ({ url, cookies, platform }) => {
	const v = await viewerFrom(cookies, platform);
	if (v instanceof Response) return v;
	const acct = (url.searchParams.get('acct') ?? '').toLowerCase();
	if (!acct.includes('@')) return json({ error: 'acct' }, { status: 400 });
	const r = await cardFor(v.deps, v.viewer, acct);
	if (!r) return json({ error: 'unknown' }, { status: 404 });
	return json(r);
};
