// Worker の入口。SvelteKit が生成した Worker（fetch）に、Cron Triggers から呼ばれる scheduled を足す。
// adapter-cloudflare は fetch しか出さないので、ここで包んで wrangler.toml の main にする

// wrangler.toml の [alias] で .svelte-kit/cloudflare/_worker.js に向けている（型は src/kit-worker.d.ts）。
// 直接 import すると svelte-check が生成物まで型検査して大量のエラーになる
import kit from 'kit-worker';
import { refreshMembers } from '$lib/server/members';
import { peopleDeps } from '$lib/server/people';
import { clefDeps, warmIntents } from '$lib/server/recommend';

type Env = App.Platform['env'];

export default {
	fetch: kit.fetch,
	// 例文の読み取りは 7 日で切れるので、1 日 1 回、切れた分だけ温める（例文クリックを待たせない）
	async scheduled(_controller, env, ctx) {
		const deps = clefDeps(env);
		// 参加者の推定を 7 日おきに読み直し、連携が切れた人を外す（枠が無ければ翌日）
		ctx.waitUntil(
			peopleDeps({ env, context: ctx })
				.then((p) => refreshMembers(p))
				.then((r) => console.log(`[cron] members refreshed ${r.refreshed}, removed ${r.removed}`))
				.catch((e) => console.error('[cron] members', e))
		);
		ctx.waitUntil(
			warmIntents(deps)
				.then(async (r) => {
					await deps.budget.flush();
					console.log(
						`[cron] warmed ${r.warmed}, skipped ${r.skipped} intents (${r.scope}), neurons today ${Math.round(await deps.budget.spent())}`
					);
				})
				.catch((e) => console.error('[cron] warm', e))
		);
	}
} satisfies ExportedHandler<Env>;
