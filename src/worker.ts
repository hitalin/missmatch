// Worker の入口。SvelteKit が生成した Worker（fetch）に、Cron Triggers から呼ばれる scheduled を足す。
// adapter-cloudflare は fetch しか出さないので、ここで包んで wrangler.toml の main にする

// wrangler.toml の [alias] で .svelte-kit/cloudflare/_worker.js に向けている（型は src/kit-worker.d.ts）。
// 直接 import すると svelte-check が生成物まで型検査して大量のエラーになる
import kit from 'kit-worker';
import { clefRunner, kvFrom, warmIntents } from '$lib/server/recommend';

type Env = App.Platform['env'];

export default {
	fetch: kit.fetch,
	// 例文の読み取りは 25 時間で切れるので、1 日 1 回温め直す（例文クリックを待たせない）
	async scheduled(_controller, env, ctx) {
		ctx.waitUntil(
			warmIntents({ kv: kvFrom(env.VIBE_KV), runner: clefRunner(env.AI) })
				.then((r) => console.log(`[cron] warmed ${r.warmed} intents (${r.scope})`))
				.catch((e) => console.error('[cron] warm', e))
		);
	}
} satisfies ExportedHandler<Env>;
