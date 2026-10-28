import { json } from '@sveltejs/kit';
import { SESSION_COOKIE } from '$lib/auth';
import { MAX_CHIPS } from '$lib/people';
import { joinMember } from '$lib/server/members';
import { peopleDeps } from '$lib/server/people';
import { readSession, sessionKv } from '$lib/server/session';
import { GENRES, type Genre } from '$lib/types';
import type { RequestHandler } from './$types';

// 参加する（docs/PEOPLE.md §3）。検査と推定はその場で行い、通らなければ理由を返す
export const POST: RequestHandler = async ({ request, cookies, platform }) => {
	const session = await readSession(sessionKv(platform), cookies.get(SESSION_COOKIE));
	if (!session) return json({ error: 'login' }, { status: 401 });
	let body: { adultChecked?: unknown; aiConsent?: unknown; chips?: unknown; profileOnly?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return json({ error: 'invalid json' }, { status: 400 });
	}
	if (body.aiConsent !== true) return json({ error: 'consent' }, { status: 400 });
	const chips = (Array.isArray(body.chips) ? body.chips : [])
		.filter((c): c is Genre => typeof c === 'string' && (GENRES as readonly string[]).includes(c))
		.slice(0, MAX_CHIPS);
	try {
		const deps = await peopleDeps(platform);
		const result = await joinMember(deps, session, {
			adultChecked: body.adultChecked === true,
			chips,
			profileOnly: body.profileOnly === true
		});
		return json(result, { status: result.ok ? 200 : 422 });
	} catch (e) {
		console.error('[people/join]', e);
		return json({ error: 'failed' }, { status: 502 });
	}
};
