import { json } from '@sveltejs/kit';
import { exampleUsers } from '$lib/server/examples';
import { peopleDeps } from '$lib/server/people';
import type { RequestHandler } from './$types';

// ランディングの背景に出す実在ユーザーの例（ログイン不要）
export const GET: RequestHandler = async ({ platform, setHeaders }) => {
	try {
		const users = await exampleUsers(await peopleDeps(platform));
		setHeaders({ 'cache-control': 'public, max-age=600' });
		return json({ users });
	} catch (e) {
		console.error('[people/examples]', e);
		return json({ users: [] });
	}
};
