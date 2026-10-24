import type { Handle } from '@sveltejs/kit';
import { SESSION_COOKIE } from '$lib/auth';
import { readSession, sessionKv } from '$lib/server/session';

// Cookie のセッション id から、ログイン中のユーザーを locals に載せる
export const handle: Handle = async ({ event, resolve }) => {
	const session = await readSession(sessionKv(event.platform), event.cookies.get(SESSION_COOKIE));
	event.locals.user = session?.user ?? null;
	return resolve(event);
};
