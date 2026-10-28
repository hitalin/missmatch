import { json } from '@sveltejs/kit';
import { isAllowedHost, miauthUrl, normalizeHost, PENDING_COOKIE } from '$lib/auth';
import { getServers, kvFrom, memoryKv } from '$lib/server/recommend';
import type { RequestHandler } from './$types';

// vite dev ではバインディングがないため、プロセス内メモリで代用する
const devKv = memoryKv();

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
export const POST: RequestHandler = async ({ request, url, cookies, platform }) => {
	let body: { host?: unknown; next?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return json({ error: 'invalid json' }, { status: 400 });
	}
	const host = typeof body.host === 'string' ? normalizeHost(body.host) : null;
	if (!host) return json({ error: 'サーバーのドメインを入れてください' }, { status: 400 });

	// 掲載サーバーに限る（一覧は KV に 1 時間。無ければ joinmisskey から取る）
	const kv = platform?.env.VIBE_KV ? kvFrom(platform.env.VIBE_KV) : devKv;
	const ctx = platform?.context;
	const servers = await getServers(kv, ctx ? (work) => ctx.waitUntil(work) : undefined);
	if (!isAllowedHost(servers, host)) {
		return json(
			{
				error:
					'ログインできるのは joinmisskey に掲載されている日本語の Misskey サーバーのアカウントだけです'
			},
			{ status: 400 }
		);
	}

	const check = await isMisskey(host);
	if (!check.ok) return json({ error: check.error }, { status: 400 });

	// 戻り先はサイト内のパスだけ（既定はトップ）
	const next = typeof body.next === 'string' && /^\/[^/\\]/.test(body.next) ? body.next : '/';
	const session = crypto.randomUUID();
	cookies.set(PENDING_COOKIE, `${session}:${host}:${next}`, { path: '/', maxAge: PENDING_SECONDS });
	return json({ url: miauthUrl(host, session, url.origin) });
};
