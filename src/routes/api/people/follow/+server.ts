import { json } from '@sveltejs/kit';
import { followAcct } from '$lib/server/deck';
import { viewerFrom } from '$lib/server/people-routes';
import type { RequestHandler } from './$types';

// 「フォローする」ボタン。write:following 付きのセッション（step-up）が要る
export const POST: RequestHandler = async ({ request, cookies, platform }) => {
	const v = await viewerFrom(cookies, platform);
	if (v instanceof Response) return v;
	if (v.session.scope !== 'follow') return json({ error: 'scope' }, { status: 403 });
	const body = (await request.json().catch(() => ({}))) as { acct?: unknown };
	if (typeof body.acct !== 'string') return json({ error: 'acct' }, { status: 400 });
	const r = await followAcct(v.deps, v.viewer, body.acct.toLowerCase());
	return json(r, { status: r.ok ? 200 : 422 });
};
