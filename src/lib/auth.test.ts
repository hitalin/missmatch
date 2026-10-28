import { describe, expect, it } from 'vitest';
import { isAllowedHost, miauthUrl, normalizeHost, parseCheck } from './auth';
import { mkServer } from './fixtures.test-helper';

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
	it('ok な応答からユーザーとトークンを取り出す。アバターは応答の URL を信用せず本人ホストの転送にする', () => {
		expect(parseCheck(ok, 'misskey.io')).toEqual({
			token: 'tok',
			user: {
				host: 'misskey.io',
				id: 'u1',
				username: 'taka',
				name: 'たか',
				avatarUrl: 'https://misskey.io/avatar/@taka'
			}
		});
	});
	it('name が無ければ username を使う', () => {
		const r = parseCheck({ ...ok, user: { id: 'u1', username: 'taka' } }, 'misskey.io');
		expect(r?.user.name).toBe('taka');
		expect(r?.user.avatarUrl).toBe('https://misskey.io/avatar/@taka');
	});
	it('ok でない・形が違う応答は null', () => {
		expect(parseCheck({ ok: false }, 'misskey.io')).toBeNull();
		expect(parseCheck({ ok: true, token: 'tok' }, 'misskey.io')).toBeNull();
		expect(parseCheck(null, 'misskey.io')).toBeNull();
		expect(parseCheck('x', 'misskey.io')).toBeNull();
	});
});

describe('isAllowedHost', () => {
	// ログインできるのは joinmisskey に掲載され生きているサーバーだけ（/api/meta を返すだけの偽ホストを防ぐ）
	const servers = [
		mkServer({ host: 'misskey.io', dru15: 1000 }),
		mkServer({ host: 'dead.tld', registration: 'closed', dru15: 0 }),
		mkServer({ host: 'en.tld', langs: ['en'] })
	];
	it('掲載されていて生きているホストだけ通す', () => {
		expect(isAllowedHost(servers, 'misskey.io')).toBe(true);
		expect(isAllowedHost(servers, 'dead.tld')).toBe(false);
		expect(isAllowedHost(servers, 'en.tld')).toBe(false);
		expect(isAllowedHost(servers, 'misskey.io.example.com')).toBe(false);
	});
});
