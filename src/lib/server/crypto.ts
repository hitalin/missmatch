// トークンを KV に平文で置かないための AES-GCM。鍵は Workers Secret（TOKEN_KEY）から作り、KV とは別経路で持つ。
// KV 単体の流出ではトークンが使えない（docs/PEOPLE.md §6）

export async function keyFromSecret(secret: string): Promise<CryptoKey> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
	return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// 返すのは `iv.ciphertext`（どちらも base64）
export async function encryptText(key: CryptoKey, text: string): Promise<string> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const data = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv },
		key,
		new TextEncoder().encode(text)
	);
	return `${toBase64(iv)}.${toBase64(new Uint8Array(data))}`;
}

export async function decryptText(key: CryptoKey, packed: string): Promise<string> {
	const [iv, data] = packed.split('.');
	const plain = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv: fromBase64(iv) },
		key,
		fromBase64(data)
	);
	return new TextDecoder().decode(plain);
}
