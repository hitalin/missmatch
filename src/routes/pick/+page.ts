import { redirect } from '@sveltejs/kit';

// 以前のアプリの URL。今は / に統合した
export function load() {
	redirect(308, '/');
}
