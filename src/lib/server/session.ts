import type { AuthUser } from '$lib/auth';

// ログイン中のセッション。Misskey のアクセストークンはブラウザに渡さず、KV にだけ置く
export interface Session {
	user: AuthUser;
	token: string;
	createdAt: number;
}

export type SessionKv = Pick<KVNamespace, 'get' | 'put' | 'delete'>;

// 30 日使わなければ消える
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const key = (id: string) => `session:v1:${id}`;

// `vite dev` などバインディングがない環境向けの代替
const memory = new Map<string, string>();
const memoryKv: SessionKv = {
	get: (async (k: string) => memory.get(k) ?? null) as SessionKv['get'],
	put: async (k: string, v: string | ArrayBuffer | ArrayBufferView | ReadableStream) => {
		memory.set(k, String(v));
	},
	delete: async (k: string) => {
		memory.delete(k);
	}
};

export function sessionKv(platform: App.Platform | undefined): SessionKv {
	return platform?.env.VIBE_KV ?? memoryKv;
}

export async function createSession(kv: SessionKv, user: AuthUser, token: string): Promise<string> {
	const id = crypto.randomUUID();
	const session: Session = { user, token, createdAt: Date.now() };
	await kv.put(key(id), JSON.stringify(session), { expirationTtl: SESSION_TTL_SECONDS });
	return id;
}

export async function readSession(kv: SessionKv, id: string | undefined): Promise<Session | null> {
	if (!id) return null;
	const raw = await kv.get(key(id));
	if (!raw) return null;
	try {
		return JSON.parse(raw) as Session;
	} catch {
		return null;
	}
}

export async function deleteSession(kv: SessionKv, id: string | undefined): Promise<void> {
	if (id) await kv.delete(key(id));
}
