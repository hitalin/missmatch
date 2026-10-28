import { json } from '@sveltejs/kit';
import { matchesFor } from '$lib/server/deck';
import { viewerFrom } from '$lib/server/people-routes';
import type { RequestHandler } from './$types';

// マッチ = 参加者 ∩ 自分のフォロー ∩ 自分のフォロワー（Misskey の事実だけで決まる）
export const GET: RequestHandler = async ({ cookies, platform }) => {
	const v = await viewerFrom(cookies, platform);
	if (v instanceof Response) return v;
	try {
		const matches = await matchesFor(v.deps, v.viewer);
		return json({
			matches: matches.map((m) => ({
				acct: m.acct,
				host: m.host,
				username: m.username,
				name: m.name,
				chips: m.chips
			}))
		});
	} catch (e) {
		console.error('[people/matches]', e);
		return json({ error: 'failed' }, { status: 502 });
	}
};
