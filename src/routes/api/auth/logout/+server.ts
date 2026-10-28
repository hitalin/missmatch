import { json } from '@sveltejs/kit';
import { SESSION_COOKIE } from '$lib/auth';
import { deleteSession, KEY_COOKIE, sessionKv } from '$lib/server/session';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies, platform }) => {
	await deleteSession(sessionKv(platform), cookies.get(SESSION_COOKIE));
	cookies.delete(SESSION_COOKIE, { path: '/' });
	cookies.delete(KEY_COOKIE, { path: '/' });
	return json({ ok: true });
};
