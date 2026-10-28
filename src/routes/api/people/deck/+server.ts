import { json } from '@sveltejs/kit';
import { buildDeck } from '$lib/server/deck';
import { viewerFrom } from '$lib/server/people-routes';
import type { RequestHandler } from './$types';

// デッキ（1 日の配給分）。いいね・よくないね済みの acct はブラウザから送る
export const POST: RequestHandler = async ({ request, cookies, platform }) => {
	const v = await viewerFrom(cookies, platform);
	if (v instanceof Response) return v;
	let body: { exclude?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		body = {};
	}
	const exclude = new Set(
		(Array.isArray(body.exclude) ? body.exclude : [])
			.filter((a): a is string => typeof a === 'string')
			.slice(0, 2000)
	);
	try {
		return json(await buildDeck(v.deps, v.viewer, exclude));
	} catch (e) {
		console.error('[people/deck]', e);
		return json({ error: 'failed' }, { status: 502 });
	}
};
