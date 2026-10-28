import { SESSION_COOKIE } from '$lib/auth';
import { DECK_OPENS_AT, MEMBER_CAP } from '$lib/people';
import { listMembers, readMember } from '$lib/server/members';
import { misskeyApi } from '$lib/server/misskey';
import { peopleDeps } from '$lib/server/people';
import { readSession, sessionKv } from '$lib/server/session';
import type { PageServerLoad } from './$types';

// 参加の入口。人数とアバター列、自分の参加状態、同意画面に要る本人の設定（AI 学習防止・誕生日の有無）
export const load: PageServerLoad = async ({ cookies, platform, locals }) => {
	const session = await readSession(sessionKv(platform), cookies.get(SESSION_COOKIE));
	let count = 0;
	let avatars: { host: string; username: string }[] = [];
	let me = null;
	let self: { preventAiLearning: boolean; hasBirthday: boolean; followingPublic: boolean } | null =
		null;
	try {
		const deps = await peopleDeps(platform);
		const members = (await listMembers(deps.kv)).filter((m) => !m.hidden);
		count = members.length;
		avatars = members
			.sort((a, b) => b.joinedAt - a.joinedAt)
			.slice(0, 24)
			.map((m) => ({ host: m.host, username: m.username }));
		if (session) {
			me = await readMember(deps.kv, session.user.host, session.user.id);
			if (!me) {
				const i = (await misskeyApi(session.user.host, 'i', {}, session.token)) as {
					preventAiLearning?: boolean;
					birthday?: string | null;
					followingVisibility?: string;
				};
				self = {
					preventAiLearning: i.preventAiLearning === true,
					hasBirthday: !!i.birthday,
					followingPublic: i.followingVisibility === 'public'
				};
			}
		}
	} catch (e) {
		console.error('[match]', e);
	}
	return { user: locals.user, count, avatars, me, self, opensAt: DECK_OPENS_AT, cap: MEMBER_CAP };
};
