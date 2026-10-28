import { redirect } from '@sveltejs/kit';

// 人モードはトップのモード切替（サーバー / 人）に統合した
export function load() {
	redirect(308, '/?mode=people');
}
