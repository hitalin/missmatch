import { keyFromSecret } from './crypto';
import type { PeopleDeps } from './members';
import { misskeyApi } from './misskey';
import { clefDeps, getServers, kvFrom } from './recommend';

// ルートと cron が使う、人を見つける機能の依存一式。AI と KV のバインディングと、
// 参加者のトークンを暗号化する鍵 TOKEN_KEY（本番は `wrangler secret put TOKEN_KEY`、ローカルは .dev.vars）が要る

export async function peopleDeps(platform: App.Platform | undefined): Promise<PeopleDeps> {
	const env = platform?.env;
	if (!env?.AI || !env.VIBE_KV) {
		throw new Error('people: AI と VIBE_KV のバインディングが要る（wrangler dev で動かす）');
	}
	if (!env.TOKEN_KEY) {
		throw new Error('people: TOKEN_KEY が未設定（wrangler secret put TOKEN_KEY / .dev.vars）');
	}
	const { runner, budget } = clefDeps(env);
	const ctx = platform?.context;
	const servers = await getServers(kvFrom(env.VIBE_KV), ctx ? (w) => ctx.waitUntil(w) : undefined);
	return {
		kv: {
			get: (key) => env.VIBE_KV.get(key),
			put: (key, value, options) => env.VIBE_KV.put(key, value, options),
			delete: (key) => env.VIBE_KV.delete(key),
			list: (options) => env.VIBE_KV.list(options)
		},
		api: misskeyApi,
		runner,
		budget,
		servers,
		tokenKey: await keyFromSecret(env.TOKEN_KEY)
	};
}
