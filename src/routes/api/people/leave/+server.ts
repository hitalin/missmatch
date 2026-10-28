import { json } from '@sveltejs/kit';
import { leaveMember } from '$lib/server/members';
import { peopleDeps } from '$lib/server/people';
import { sessionFromCookies } from '$lib/server/session';
import type { RequestHandler } from './$types';

// やめる = 参加の記録・フォロー一覧・トークンを即時に消す
export const POST: RequestHandler = async ({ cookies, platform }) => {
	const session = await sessionFromCookies(cookies, platform);
	if (!session?.token) return json({ error: 'login' }, { status: 401 });
	const deps = await peopleDeps(platform);
	await leaveMember(deps.kv, session.user.host, session.user.id);
	return json({ ok: true });
};
