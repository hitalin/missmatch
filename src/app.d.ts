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
			};
			context: ExecutionContext;
		}
	}
}
