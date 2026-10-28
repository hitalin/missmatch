import { json } from '@sveltejs/kit';
import { representativeNotes } from '$lib/server/deck';
import { listMembers } from '$lib/server/members';
import { viewerFrom } from '$lib/server/people-routes';
import type { RequestHandler } from './$types';

// カードの代表ノート（相手本人のトークンで相手のサーバーから）。1 時間キャッシュ
export const GET: RequestHandler = async ({ url, cookies, platform }) => {
	const v = await viewerFrom(cookies, platform);
	if (v instanceof Response) return v;
	const acct = (url.searchParams.get('acct') ?? '').toLowerCase();
	const [username, host] = acct.split('@');
	if (!username || !host) return json({ error: 'acct' }, { status: 400 });
	const cacheKey = `card:v1:${acct}`;
	const cached = await v.deps.kv.get(cacheKey);
	if (cached) return json(JSON.parse(cached));
	const member = (await listMembers(v.deps.kv, `member:v1:${host}:`)).find(
		(m) => m.username.toLowerCase() === username && !m.hidden
	);
	if (!member) return json({ error: 'unknown' }, { status: 404 });
	const notes = await representativeNotes(v.deps, member);
	await v.deps.kv.put(cacheKey, JSON.stringify({ notes }), { expirationTtl: 60 * 60 });
	return json({ notes });
};
