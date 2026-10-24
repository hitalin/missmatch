import { json } from '@sveltejs/kit';
import { miauthUrl, normalizeHost, PENDING_COOKIE } from '$lib/auth';
import type { RequestHandler } from './$types';

const UA = 'missmatch/1.0 (+https://github.com/hitalin/missmatch)';
const META_TIMEOUT_MS = 10_000;
const PENDING_SECONDS = 60 * 10;

// Misskey 系かを /api/meta で確かめる（存在しないホストや他のソフトに飛ばさない）
async function isMisskey(host: string): Promise<{ ok: true } | { ok: false; error: string }> {
	try {
		const res = await fetch(`https://${host}/api/meta`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
			body: '{}',
			signal: AbortSignal.timeout(META_TIMEOUT_MS)
		});
		if (!res.ok)
			return { ok: false, error: `Misskey のサーバーとして応答しませんでした（${res.status}）` };
		const meta = (await res.json()) as { version?: unknown };
		if (typeof meta.version !== 'string')
			return { ok: false, error: 'Misskey の API が見つかりません' };
		return { ok: true };
	} catch (e) {
		if ((e as Error).name === 'TimeoutError')
			return { ok: false, error: '接続がタイムアウトしました' };
		return { ok: false, error: 'サーバーに接続できません' };
	}
}

// MiAuth を始める。戻り先で照合するため、セッション id とホストを短命の Cookie に残す
export const POST: RequestHandler = async ({ request, url, cookies }) => {
	let body: { host?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return json({ error: 'invalid json' }, { status: 400 });
	}
	const host = typeof body.host === 'string' ? normalizeHost(body.host) : null;
	if (!host) return json({ error: 'サーバーのドメインを入れてください' }, { status: 400 });

	const check = await isMisskey(host);
	if (!check.ok) return json({ error: check.error }, { status: 400 });

	const session = crypto.randomUUID();
	cookies.set(PENDING_COOKIE, `${session}:${host}`, { path: '/', maxAge: PENDING_SECONDS });
	return json({ url: miauthUrl(host, session, url.origin) });
};
