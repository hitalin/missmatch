/// <reference types="@sveltejs/kit" />
/// <reference types="@cloudflare/workers-types" />

import type { AuthUser } from '$lib/auth';

declare global {
	namespace App {
		interface Locals {
			user: AuthUser | null;
		}
		interface Platform {
			env: {
				AI: Ai;
				VIBE_KV: KVNamespace;
				WARM_SECRET?: string;
				TOKEN_KEY?: string; // 参加者のトークンを KV に置くときの暗号化の鍵（wrangler secret put TOKEN_KEY）
			};
			context: ExecutionContext;
		}
	}
}
