import { describe, expect, it } from 'vitest';
import { type JoinMisskeyInstance, monthsBehind, normalizeInstance, stripHtml } from './instances';

const base: JoinMisskeyInstance = {
	url: 'https://example.tld/',
	langs: ['ja'],
	name: 'テスト鯖',
	description: 'こんにちは<br>よろしく',
	isAlive: true,
	banner: true,
	icon: true,
	dru15: 12.5,
	npd15: 300,
	meta: {
		serverRules: ['仲良く', '18歳以上限定'],
		disableRegistration: false,
		emailRequiredForSignup: true,
		approvalRequiredForSignup: false,
		iconUrl: '/icon.png',
		themeColor: '#86b300',
		repositoryUrl: 'https://github.com/misskey-dev/misskey',
		notesPerOneAd: 0,
		noteSearchableScope: 'global',
		policies: { ltlAvailable: true, gtlAvailable: true, driveCapacityMb: 1024 }
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
		expect(s?.iconUrl).toBe('https://instanceapp.misskey.page/instance-icons/example.tld.webp');
		expect(s?.bannerUrl).toBe('https://instanceapp.misskey.page/instance-banners/example.tld.webp');
		expect(s?.themeColor).toBe('#86b300');
		expect(s?.registration).toBe('open');
		expect(s?.emailRequired).toBe(true);
		expect(s?.serverRules).toEqual(['仲良く', '18歳以上限定']);
		expect(s?.langs).toEqual(['ja']);
		expect(s?.ltlAvailable).toBe(true);
		expect(s?.gtlAvailable).toBe(true);
		expect(s?.driveCapacityMb).toBe(1024);
		expect(s?.adsEnabled).toBe(false);
		expect(s?.noteSearchableScope).toBe('global');
		expect(s?.officialMisskey).toBe(true);
	});

	it('最新安定版からの遅れを月数で持つ', () => {
		expect(normalizeInstance(base, '2026.10.0')?.versionMonthsBehind).toBe(13);
		expect(normalizeInstance(base)?.versionMonthsBehind).toBeNull();
	});

	it('フォークと広告を判定する', () => {
		const s = normalizeInstance({
			...base,
			meta: { ...base.meta, repositoryUrl: 'https://github.com/foo/misskey', notesPerOneAd: 20 }
		});
		expect(s?.officialMisskey).toBe(false);
		expect(s?.adsEnabled).toBe(true);
	});

	it('nodeinfo のリポジトリを meta より優先する', () => {
		const s = normalizeInstance({
			...base,
			nodeinfo: {
				...base.nodeinfo,
				software: {
					name: 'misskey',
					version: '2026.10.0-yami.1',
					repository: 'https://github.com/yamisskey-dev/yamisskey'
				}
			}
		});
		expect(s?.officialMisskey).toBe(false);
	});

	it('バナーが無ければ背景画像、それも無ければ null。アイコンが無ければサーバー自身のもの', () => {
		expect(normalizeInstance({ ...base, banner: false, background: true })?.bannerUrl).toBe(
			'https://instanceapp.misskey.page/instance-backgrounds/example.tld.webp'
		);
		expect(normalizeInstance({ ...base, banner: false })?.bannerUrl).toBeNull();
		expect(normalizeInstance({ ...base, icon: false })?.iconUrl).toBe(
			'https://example.tld/icon.png'
		);
		expect(
			normalizeInstance({ ...base, meta: { ...base.meta, themeColor: 'red' } })?.themeColor
		).toBeNull();
	});

	it('isAlive でないものは除外する', () => {
		expect(normalizeInstance({ ...base, isAlive: false })).toBeNull();
	});

	it('登録状態: 承認制 / 招待制（canInvite か説明文の「招待」）/ 停止中 を見分ける', () => {
		expect(
			normalizeInstance({ ...base, meta: { ...base.meta, approvalRequiredForSignup: true } })
				?.registration
		).toBe('approval');
		const closed = {
			...base,
			nodeinfo: { ...base.nodeinfo, openRegistrations: false },
			meta: { ...base.meta, disableRegistration: true }
		};
		expect(normalizeInstance(closed)?.registration).toBe('closed');
		expect(
			normalizeInstance({
				...closed,
				meta: { ...closed.meta, policies: { ...closed.meta.policies, canInvite: true } }
			})?.registration
		).toBe('invite');
		expect(
			normalizeInstance({
				...closed,
				description: '完全招待制です。既存ユーザーに招待コードをもらってください'
			})?.registration
		).toBe('invite');
		// nodeinfo が無くても meta から判定する
		expect(normalizeInstance({ ...closed, nodeinfo: undefined })?.registration).toBe('closed');
	});

	it('ポリシーで LTL / GTL が無効ならそれぞれ false', () => {
		const s = normalizeInstance({
			...base,
			meta: { ...base.meta, policies: { ltlAvailable: false, gtlAvailable: false } }
		});
		expect(s?.ltlAvailable).toBe(false);
		expect(s?.gtlAvailable).toBe(false);
	});
});

describe('monthsBehind', () => {
	it('CalVer の年月差を返し、フォーク接尾辞や v は無視する', () => {
		expect(monthsBehind('2026.10.0', '2026.10.0')).toBe(0);
		expect(monthsBehind('2026.10.0-yami-1.9.41', '2026.10.0')).toBe(0);
		expect(monthsBehind('v2025.4.1-nijimiss.7', '2026.10.0')).toBe(18);
		expect(monthsBehind('2026.10.1-alpha.0', '2026.10.0')).toBe(0);
	});
	it('CalVer でなければ null', () => {
		expect(monthsBehind('13.14.2', '2026.10.0')).toBeNull();
		expect(monthsBehind('2026.10.0', undefined)).toBeNull();
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
