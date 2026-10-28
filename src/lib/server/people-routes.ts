import { json } from '@sveltejs/kit';
import type { Viewer } from './deck';
import { type PeopleDeps, readMember } from './members';
import { peopleDeps } from './people';
import { type Session, sessionFromCookies } from './session';

// 人モードの API に共通の前置き: ログイン・参加の確認と依存一式
export async function viewerFrom(
	cookies: { get(name: string): string | undefined },
	platform: App.Platform | undefined
): Promise<{ deps: PeopleDeps; session: Session; viewer: Viewer } | Response> {
	const session = await sessionFromCookies(cookies, platform);
	if (!session?.token) return json({ error: 'login' }, { status: 401 });
	const deps = await peopleDeps(platform);
	const member = await readMember(deps.kv, session.user.host, session.user.id);
	if (!member) return json({ error: 'not-member' }, { status: 403 });
	return { deps, session, viewer: { member, token: session.token } };
}
