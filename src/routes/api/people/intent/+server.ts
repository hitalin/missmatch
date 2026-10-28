import { json } from '@sveltejs/kit';
import { readPeopleIntent } from '$lib/server/deck';
import { viewerFrom } from '$lib/server/people-routes';
import type { RequestHandler } from './$types';

// 言葉 → 希望（話題・会話の型・夜型・投稿量・拒否）。デッキの中で使うものを、評価のために単体で返す。
// 参加者だけが呼べる。fresh: true でキャッシュを読まず判定し直す（評価用）
export const POST: RequestHandler = async ({ request, cookies, platform }) => {
	const v = await viewerFrom(cookies, platform);
	if (v instanceof Response) return v;
	let body: { turns?: unknown; fresh?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return json({ error: 'invalid json' }, { status: 400 });
	}
	const turns = (Array.isArray(body.turns) ? body.turns : [])
		.filter((t): t is string => typeof t === 'string')
		.map((t) => t.trim().slice(0, 200))
		.filter((t) => t.length > 0)
		.slice(0, 5);
	if (turns.length === 0) return json({ error: 'turns is required' }, { status: 400 });
	try {
		return json(await readPeopleIntent(v.deps, turns, body.fresh === true));
	} catch (e) {
		console.error('[people/intent]', e);
		return json({ error: 'failed' }, { status: 502 });
	}
};
