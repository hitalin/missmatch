import { json } from '@sveltejs/kit';
import { type ReportKind, report } from '$lib/server/deck';
import { viewerFrom } from '$lib/server/people-routes';
import type { RequestHandler } from './$types';

const KINDS: ReportKind[] = ['seeking', 'ads', 'impersonation', 'others-info'];

export const POST: RequestHandler = async ({ request, cookies, platform }) => {
	const v = await viewerFrom(cookies, platform);
	if (v instanceof Response) return v;
	const body = (await request.json().catch(() => ({}))) as { acct?: unknown; kind?: unknown };
	if (typeof body.acct !== 'string' || !KINDS.includes(body.kind as ReportKind)) {
		return json({ error: 'bad request' }, { status: 400 });
	}
	const r = await report(v.deps, v.viewer.member, body.acct.toLowerCase(), body.kind as ReportKind);
	return json(r, { status: r.ok ? 200 : 422 });
};
