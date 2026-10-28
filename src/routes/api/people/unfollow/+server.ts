import { json } from '@sveltejs/kit';
import { unfollowAcct } from '$lib/server/deck';
import { viewerFrom } from '$lib/server/people-routes';
import type { RequestHandler } from './$types';

// 1 分以内の取り消し
export const POST: RequestHandler = async ({ request, cookies, platform }) => {
	const v = await viewerFrom(cookies, platform);
	if (v instanceof Response) return v;
	if (v.session.scope !== 'follow') return json({ error: 'scope' }, { status: 403 });
	const body = (await request.json().catch(() => ({}))) as { acct?: unknown };
	if (typeof body.acct !== 'string') return json({ error: 'acct' }, { status: 400 });
	const r = await unfollowAcct(v.deps, v.viewer, body.acct.toLowerCase());
	return json(r, { status: r.ok ? 200 : 422 });
};
