import { describe, expect, it } from 'vitest';
import { type JoinMisskeyInstance, normalizeInstance, stripHtml } from './instances';

const base: JoinMisskeyInstance = {
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

const withRules = (...rules: string[]) =>
	normalizeInstance({ ...base, meta: { ...base.meta, serverRules: rules } });

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
		expect(s?.ltlAvailable).toBe(true);
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

	it('ポリシーで LTL が無効なら ltlAvailable は false', () => {
		const s = normalizeInstance({
			...base,
			meta: { ...base.meta, policies: { ltlAvailable: false } }
		});
		expect(s?.ltlAvailable).toBe(false);
	});
});

describe('年齢制限の推定', () => {
	it('登録者の年齢を制限する文言は 18+', () => {
		expect(withRules('18歳以上限定')?.ageRestriction).toBe('18+');
		expect(withRules('このサーバーに登録できるのは満18歳以上の方のみです')?.ageRestriction).toBe(
			'18+'
		);
		expect(withRules('18歳以上であること')?.ageRestriction).toBe('18+');
		expect(withRules('18歳未満の方は登録できません')?.ageRestriction).toBe('18+');
		expect(withRules('本サービスの登録は原則、18歳以上限定です。')?.ageRestriction).toBe('18+');
		expect(withRules('18+ only')?.ageRestriction).toBe('18+');
	});

	it('13 歳未満の制限は 13+', () => {
		expect(withRules('13歳未満の登録は禁止です')?.ageRestriction).toBe('13+');
	});

	it('内容に関するルールは年齢制限とみなさない（実データで誤検出していた文言）', () => {
		const falsePositives = [
			'未成年の自撮りは禁止されているのでやらないで',
			'nsfwガイドラインに違反しないこと',
			'nsfw（水着以上の肌の露出のある）コンテンツには「閲覧注意」を付けてください',
			'r-18コンテンツは2d/3dともに投稿およびrenoteを禁止します',
			'r18作品につきましては、nsfwチャンネルやセンシティブ設定をご利用ください',
			'未成年者が運営しているサーバーです。登録する際はご注意を。',
			'18歳未満の方は必ず「r18」をハードミュートに設定してください',
			'成人向けコンテンツの投稿は禁止です'
		];
		for (const text of falsePositives) {
			expect(withRules(text)?.ageRestriction, text).toBe('unknown');
		}
	});

	it('メール必須なだけでは年齢制限とみなさない', () => {
		expect(withRules()?.ageRestriction).toBe('unknown');
	});
});
