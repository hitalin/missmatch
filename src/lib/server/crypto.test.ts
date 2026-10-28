import { describe, expect, it } from 'vitest';
import { decryptText, encryptText, keyFromSecret } from './crypto';

describe('encryptText / decryptText', () => {
	it('同じ鍵で往復でき、毎回違う暗号文になる', async () => {
		const key = await keyFromSecret('0123456789abcdef0123456789abcdef');
		const a = await encryptText(key, 'tok-1');
		const b = await encryptText(key, 'tok-1');
		expect(a).not.toBe(b);
		expect(await decryptText(key, a)).toBe('tok-1');
	});
	it('違う鍵では復号できない', async () => {
		const k1 = await keyFromSecret('0123456789abcdef0123456789abcdef');
		const k2 = await keyFromSecret('fedcba9876543210fedcba9876543210');
		const c = await encryptText(k1, 'tok');
		await expect(decryptText(k2, c)).rejects.toThrow();
	});
});
