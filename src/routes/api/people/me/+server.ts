import { json } from '@sveltejs/kit';
import { MAX_CHIPS } from '$lib/people';
import { updateMember } from '$lib/server/members';
import { viewerFrom } from '$lib/server/people-routes';
import { GENRES, type Genre } from '$lib/types';
import type { RequestHandler } from './$types';

// 「あなた」で、話したいこと（話題チップ）と、カードにノートを出すかを変える
export const PATCH: RequestHandler = async ({ request, cookies, platform }) => {
	const v = await viewerFrom(cookies, platform);
	if (v instanceof Response) return v;
	const body = (await request.json().catch(() => ({}))) as {
		chips?: unknown;
		profileOnly?: unknown;
	};
	const member = { ...v.viewer.member };
	if (Array.isArray(body.chips)) {
		member.chips = body.chips
			.filter((c): c is Genre => typeof c === 'string' && (GENRES as readonly string[]).includes(c))
			.slice(0, MAX_CHIPS);
	}
	if (typeof body.profileOnly === 'boolean') member.profileOnly = body.profileOnly;
	await updateMember(v.deps.kv, member);
	return json({ ok: true, member });
};
