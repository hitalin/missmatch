import { json } from '@sveltejs/kit';
import { MEMBER_CAP } from '$lib/people';
import { listMembers, readMember } from '$lib/server/members';
import { misskeyApi } from '$lib/server/misskey';
import { peopleDeps } from '$lib/server/people';
import { sessionFromCookies } from '$lib/server/session';
import type { RequestHandler } from './$types';

// 人モードの入口の状態: 人数とアバター列、自分の参加、同意画面に要る本人の設定、フォローの権限があるか
export const GET: RequestHandler = async ({ cookies, platform }) => {
	const session = await sessionFromCookies(cookies, platform);
	try {
		const deps = await peopleDeps(platform);
		const members = (await listMembers(deps.kv)).filter((m) => !m.hidden);
		const avatars = members
			.sort((a, b) => b.joinedAt - a.joinedAt)
			.slice(0, 24)
			.map((m) => ({ host: m.host, username: m.username }));
		let me = null;
		let self = null;
		if (session?.token) {
			me = await readMember(deps.kv, session.user.host, session.user.id);
			if (!me) {
				const i = (await misskeyApi(session.user.host, 'i', {}, session.token)) as {
					preventAiLearning?: boolean;
				};
				self = { preventAiLearning: i.preventAiLearning === true };
			}
		}
		return json({
			count: members.length,
			cap: MEMBER_CAP,
			avatars,
			me,
			self,
			canFollow: session?.scope === 'follow' && !!session.token
		});
	} catch (e) {
		console.error('[people/status]', e);
		return json({ error: 'failed' }, { status: 502 });
	}
};
