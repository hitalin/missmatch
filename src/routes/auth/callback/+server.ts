import { redirect } from '@sveltejs/kit';
import { PENDING_COOKIE, parseCheck, SESSION_COOKIE } from '$lib/auth';
import { createSession, KEY_COOKIE, sessionKv } from '$lib/server/session';
import type { RequestHandler } from './$types';

const UA = 'missmatch/1.0 (+https://github.com/hitalin/missmatch)';
const SESSION_COOKIE_SECONDS = 60 * 60 * 24 * 30;

const fail = (reason: string): never =>
	redirect(303, `/?login_error=${encodeURIComponent(reason)}`);

// Misskey で許可したあとの戻り先。セッション id を照合し、トークンを受け取ってログイン状態にする
export const GET: RequestHandler = async ({ url, cookies, platform }) => {
	const session = url.searchParams.get('session');
	const pending = cookies.get(PENDING_COOKIE);
	cookies.delete(PENDING_COOKIE, { path: '/' });
	if (!session || !pending)
		return fail('ログインの途中の情報が見つかりません。もう一度お試しください');
	const [pendingSession, host, next = '/', scope = 'read'] = pending.split(':');
	if (pendingSession !== session || !host)
		return fail('ログインの照合に失敗しました。もう一度お試しください');

	let data: unknown;
	try {
		const res = await fetch(`https://${host}/api/miauth/${encodeURIComponent(session)}/check`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
			body: '{}',
			signal: AbortSignal.timeout(10_000)
		});
		if (!res.ok) return fail(`${host} が認証を確認できませんでした`);
		data = await res.json();
	} catch {
		return fail(`${host} に接続できません`);
	}
	const result = parseCheck(data, host);
	if (!result) return fail('認証が許可されませんでした');

	if (scope === 'follow') {
		const { id, key } = await createSession(sessionKv(platform), result.user, result.token, {
			scope: 'follow'
		});
		cookies.set(SESSION_COOKIE, id, { path: '/', maxAge: 60 * 60 * 24 * 7 });
		cookies.set(KEY_COOKIE, key, { path: '/', maxAge: 60 * 60 * 24 * 7 });
	} else {
		const id = await createSession(sessionKv(platform), result.user, result.token);
		cookies.set(SESSION_COOKIE, id, { path: '/', maxAge: SESSION_COOKIE_SECONDS });
		cookies.delete(KEY_COOKIE, { path: '/' });
	}
	redirect(303, next.startsWith('/') ? next : '/');
};
