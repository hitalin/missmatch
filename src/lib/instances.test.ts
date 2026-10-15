import { describe, expect, it } from 'vitest';
import { normalizeInstance, stripHtml } from './instances';

const base = {
	url: 'https://example.tld/',
	langs: ['ja'],
	name: 'テスト鯖',
	description: 'こんにちは<br>よろしく',
	isAlive: true,
	banner: true,
	dru15: 12.5,
	npd15: 300,
	meta: {
		serverRules: ['仲良く', '18歳以上限定'],
		disableRegistration: false,
		emailRequiredForSignup: true,
		approvalRequiredForSignup: false,
		iconUrl: '/icon.png'
	},
	nodeinfo: {
		software: { name: 'misskey', version: '2025.9.0' },
		usage: { users: { total: 1234 } },
		openRegistrations: true
	}
};

describe('stripHtml', () => {
	it('タグを除去し改行を空白にまとめる', () => {
		expect(stripHtml('a<br>b<a href="x">c</a>\n\nd')).toBe('a b c d');
	});
});

describe('normalizeInstance', () => {
	it('基本フィールドを変換する', () => {
		const s = normalizeInstance(base);
		expect(s).not.toBeNull();
		expect(s?.host).toBe('example.tld');
		expect(s?.name).toBe('テスト鯖');
		expect(s?.usersCount).toBe(1234);
		expect(s?.iconUrl).toBe('https://example.tld/icon.png');
		expect(s?.bannerUrl).toBe('https://instanceapp.misskey.page/instance-banners/example.tld.jpeg');
		expect(s?.registrationOpen).toBe(true);
		expect(s?.emailRequired).toBe(true);
		expect(s?.serverRules).toEqual(['仲良く', '18歳以上限定']);
		expect(s?.langs).toEqual(['ja']);
	});

	it('ルールから 18+ を推測する', () => {
		expect(normalizeInstance(base)?.ageRestriction).toBe('18+');
	});

	it('メール必須なら 13+ と推測する', () => {
		const s = normalizeInstance({ ...base, meta: { ...base.meta, serverRules: [] } });
		expect(s?.ageRestriction).toBe('13+');
	});

	it('バナーが無ければ bannerUrl は null', () => {
		expect(normalizeInstance({ ...base, banner: false })?.bannerUrl).toBeNull();
	});

	it('isAlive でないものは除外する', () => {
		expect(normalizeInstance({ ...base, isAlive: false })).toBeNull();
	});

	it('nodeinfo がなくても meta から登録状態を判定する', () => {
		const s = normalizeInstance({
			...base,
			nodeinfo: undefined,
			meta: { ...base.meta, disableRegistration: true, approvalRequiredForSignup: true }
		});
		expect(s?.registrationOpen).toBe(false);
		expect(s?.approvalRequired).toBe(true);
	});
});
