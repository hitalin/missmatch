import { json } from '@sveltejs/kit';
import { buildDeck } from '$lib/server/deck';
import { viewerFrom } from '$lib/server/people-routes';
import type { RequestHandler } from './$types';

// デッキ（1 日の配給分）。いいね・よくないね済みの acct はブラウザから送る
export const POST: RequestHandler = async ({ request, cookies, platform }) => {
	const v = await viewerFrom(cookies, platform);
	if (v instanceof Response) return v;
	let body: { exclude?: unknown; turns?: unknown };
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
	const turns = (Array.isArray(body.turns) ? body.turns : [])
		.filter((t): t is string => typeof t === 'string')
		.map((t) => t.trim().slice(0, 200))
		.filter((t) => t.length > 0)
		.slice(0, 5);
	try {
		return json(await buildDeck(v.deps, v.viewer, exclude, turns));
	} catch (e) {
		console.error('[people/deck]', e);
		return json({ error: 'failed' }, { status: 502 });
	}
};
