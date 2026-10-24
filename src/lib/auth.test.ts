import { describe, expect, it } from 'vitest';
import { miauthUrl, normalizeHost, parseCheck } from './auth';

describe('normalizeHost', () => {
	it('ホスト名だけなら小文字にして返す', () => {
		expect(normalizeHost('Misskey.io')).toBe('misskey.io');
		expect(normalizeHost('  misskey.io  ')).toBe('misskey.io');
	});
	it('URL や @user@host の形でもホストだけ取り出す', () => {
		expect(normalizeHost('https://misskey.io/@taka')).toBe('misskey.io');
		expect(normalizeHost('@taka@misskey.io')).toBe('misskey.io');
		expect(normalizeHost('misskey.io:443')).toBe('misskey.io');
	});
	it('日本語ドメインは punycode にする', () => {
		expect(normalizeHost('みすきー.jp')).toMatch(/^xn--[a-z0-9]+\.jp$/);
	});
	it('ホストと言えないものは null', () => {
		expect(normalizeHost('')).toBeNull();
		expect(normalizeHost('localhost')).toBeNull();
		expect(normalizeHost('not a host')).toBeNull();
		expect(normalizeHost('http://')).toBeNull();
	});
});

describe('miauthUrl', () => {
	it('MiAuth の開始 URL を組む（アプリ名・戻り先・権限）', () => {
		const u = new URL(miauthUrl('misskey.io', 'abc-123', 'https://missmatch.example'));
		expect(u.origin).toBe('https://misskey.io');
		expect(u.pathname).toBe('/miauth/abc-123');
		expect(u.searchParams.get('name')).toBe('みすまっち');
		expect(u.searchParams.get('callback')).toBe('https://missmatch.example/auth/callback');
		expect(u.searchParams.get('permission')).toBe('read:account');
	});
});

describe('parseCheck', () => {
	const ok = {
		ok: true,
		token: 'tok',
		user: { id: 'u1', username: 'taka', name: 'たか', avatarUrl: 'https://x/a.png' }
	};
	it('ok な応答からユーザーとトークンを取り出す', () => {
		expect(parseCheck(ok, 'misskey.io')).toEqual({
			token: 'tok',
			user: {
				host: 'misskey.io',
				id: 'u1',
				username: 'taka',
				name: 'たか',
				avatarUrl: 'https://x/a.png'
			}
		});
	});
	it('name が無ければ username を使い、avatarUrl が無ければ null', () => {
		const r = parseCheck({ ...ok, user: { id: 'u1', username: 'taka' } }, 'misskey.io');
		expect(r?.user.name).toBe('taka');
		expect(r?.user.avatarUrl).toBeNull();
	});
	it('ok でない・形が違う応答は null', () => {
		expect(parseCheck({ ok: false }, 'misskey.io')).toBeNull();
		expect(parseCheck({ ok: true, token: 'tok' }, 'misskey.io')).toBeNull();
		expect(parseCheck(null, 'misskey.io')).toBeNull();
		expect(parseCheck('x', 'misskey.io')).toBeNull();
	});
});
