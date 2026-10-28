import { describe, expect, it } from 'vitest';
import { createSession, readSession, type SessionKv } from './session';

function memKv(): SessionKv & { store: Map<string, string> } {
	const store = new Map<string, string>();
	return {
		store,
		get: (async (k: string) => store.get(k) ?? null) as SessionKv['get'],
		put: async (k: string, v: string | ArrayBuffer | ArrayBufferView | ReadableStream) => {
			store.set(k, String(v));
		},
		delete: async (k: string) => {
			store.delete(k);
		}
	};
}
const user = { host: 'misskey.io', id: 'u1', username: 'taka', name: 'たか', avatarUrl: 'x' };

describe('セッションのトークン', () => {
	it('read:account のセッションは従来どおり平文で読める', async () => {
		const kv = memKv();
		const id = await createSession(kv, user, 'tok');
		expect((await readSession(kv, id))?.token).toBe('tok');
		expect((await readSession(kv, id))?.scope).toBe('read');
	});
	it('write:following のセッションは Cookie の鍵で暗号化され、鍵が無ければトークンが読めない', async () => {
		const kv = memKv();
		const { id, key } = await createSession(kv, user, 'tok-w', { scope: 'follow' });
		expect([...kv.store.values()].some((v) => v.includes('tok-w'))).toBe(false);
		const withKey = await readSession(kv, id, key);
		expect(withKey?.token).toBe('tok-w');
		expect(withKey?.scope).toBe('follow');
		const withoutKey = await readSession(kv, id);
		expect(withoutKey?.user.username).toBe('taka');
		expect(withoutKey?.token).toBeUndefined();
		expect(await readSession(kv, id, 'wrong-key')).toMatchObject({ token: undefined });
	});
});
