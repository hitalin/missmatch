/// <reference types="@sveltejs/kit" />
/// <reference types="@cloudflare/workers-types" />

declare global {
	namespace App {
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

export {};
