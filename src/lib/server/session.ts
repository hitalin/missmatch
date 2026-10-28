import { type AuthUser, SESSION_COOKIE } from '$lib/auth';
import { decryptText, encryptText, keyFromSecret } from './crypto';

// ログイン中のセッション。Misskey のアクセストークンはブラウザに渡さず、KV にだけ置く。
// read:account だけのトークンは平文、write:following 付き（フォローの step-up）は
// Cookie にだけある鍵で暗号化して置く（KV 単体の流出では使えない。docs/PEOPLE.md §6）
export type SessionScope = 'read' | 'follow';
export interface Session {
	user: AuthUser;
	token?: string; // 読めたとき（read は常に、follow は Cookie の鍵があるとき）
	tokenEnc?: string;
	scope: SessionScope;
	createdAt: number;
}

export type SessionKv = Pick<KVNamespace, 'get' | 'put' | 'delete'>;

// 30 日使わなければ消える。フォロー用は 7 日
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const FOLLOW_TTL_SECONDS = 60 * 60 * 24 * 7;
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

const randomKey = () => {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '');
};

export async function createSession(kv: SessionKv, user: AuthUser, token: string): Promise<string>;
export async function createSession(
	kv: SessionKv,
	user: AuthUser,
	token: string,
	options: { scope: 'follow' }
): Promise<{ id: string; key: string }>;
export async function createSession(
	kv: SessionKv,
	user: AuthUser,
	token: string,
	options?: { scope: 'follow' }
): Promise<string | { id: string; key: string }> {
	const id = crypto.randomUUID();
	if (options?.scope === 'follow') {
		const cookieKey = randomKey();
		const session: Session = {
			user,
			tokenEnc: await encryptText(await keyFromSecret(cookieKey), token),
			scope: 'follow',
			createdAt: Date.now()
		};
		await kv.put(key(id), JSON.stringify(session), { expirationTtl: FOLLOW_TTL_SECONDS });
		return { id, key: cookieKey };
	}
	const session: Session = { user, token, scope: 'read', createdAt: Date.now() };
	await kv.put(key(id), JSON.stringify(session), { expirationTtl: SESSION_TTL_SECONDS });
	return id;
}

export async function readSession(
	kv: SessionKv,
	id: string | undefined,
	cookieKey?: string
): Promise<Session | null> {
	if (!id) return null;
	const raw = await kv.get(key(id));
	if (!raw) return null;
	let session: Session;
	try {
		session = JSON.parse(raw) as Session;
	} catch {
		return null;
	}
	session.scope ??= 'read';
	if (session.tokenEnc && cookieKey) {
		try {
			session.token = await decryptText(await keyFromSecret(cookieKey), session.tokenEnc);
		} catch {
			session.token = undefined; // 鍵が違う
		}
	}
	return session;
}

// フォロー用セッションの鍵を入れる Cookie
export const KEY_COOKIE = 'missmatch_k';

// Cookie（セッション id と鍵）からセッションを読む。ルートはこれを使う
export async function sessionFromCookies(
	cookies: { get(name: string): string | undefined },
	platform: App.Platform | undefined
): Promise<Session | null> {
	return readSession(sessionKv(platform), cookies.get(SESSION_COOKIE), cookies.get(KEY_COOKIE));
}

export async function deleteSession(kv: SessionKv, id: string | undefined): Promise<void> {
	if (id) await kv.delete(key(id));
}
