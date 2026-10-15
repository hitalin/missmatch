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

	it('機能と運営の情報を読む（無ければ「ない」とみなす）', () => {
		const s = normalizeInstance({
			...base,
			meta: {
				...base.meta,
				translatorAvailable: true,
				tosUrl: 'https://example.tld/tos',
				privacyPolicyUrl: '',
				policies: {
					...base.meta?.policies,
					canSearchNotes: true,
					canUseTranslator: true,
					chatAvailability: 'available',
					uploadableFileTypes: ['image/*', 'video/*']
				}
			}
		});
		expect(s?.noteSearch).toBe(true);
		expect(s?.translator).toBe(true);
		expect(s?.chat).toBe(true);
		expect(s?.videoUpload).toBe(true);
		expect(s?.hasTos).toBe(true);
		expect(s?.hasPrivacyPolicy).toBe(false);
		const none = normalizeInstance({ ...base, meta: { ...base.meta, policies: {} } });
		expect(none?.noteSearch).toBe(false);
		expect(none?.translator).toBe(false);
		expect(none?.chat).toBe(false);
		expect(none?.videoUpload).toBe(false);
		// 翻訳はサーバーで有効でも、一般ユーザーに許可されていなければ使えない
		const noRole = normalizeInstance({
			...base,
			meta: { ...base.meta, translatorAvailable: true, policies: { canUseTranslator: false } }
		});
		expect(noRole?.translator).toBe(false);
		// 「何でも」は動画も含む
		const any = normalizeInstance({
			...base,
			meta: { ...base.meta, policies: { uploadableFileTypes: ['*/*'] } }
		});
		expect(any?.videoUpload).toBe(true);
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

describe('登録できる下限年齢の推定', () => {
	const age = (text: string) => withRules(text)?.minAge;

	it('「N歳以上」の制限（実データの言い回し）', () => {
		const cases: [string, number][] = [
			['18歳以上限定', 18],
			['このサーバーに登録できるのは満18歳以上の方のみです', 18],
			['18歳以上であること', 18],
			['本サービスの登録は原則、18歳以上限定です。', 18],
			['ご利用は18歳以上の方に限定させていただきます。', 18],
			['18歳以上から登録可能です！', 18],
			['18歳以上の方がご利用になれます。', 18],
			['20歳以上のユーザが登録できます', 20],
			['私は20歳以上です', 20],
			['※Misskiraraは16歳以上の方がご利用可能です。', 16],
			['16歳以上であること。', 16],
			['登録・利用は15歳以上のみ', 15],
			['15歳以上且つGDPR対象国外在住で、心がお嬢様なら誰でも', 15],
			['「滝維吹が好きな方」、「13歳以上の方」がご利用いただけます。', 13],
			['13歳以上でないといけません', 13],
			['はなみすきーを利用するには、13歳以上である必要があり', 13],
			['18+ only', 18]
		];
		for (const [text, min] of cases) expect(age(text), text).toBe(min);
	});

	it('「N歳未満は禁止」の制限（実データの言い回し）', () => {
		const cases: [string, number][] = [
			['18歳未満の方は登録できません', 18],
			['18歳未満のユーザーの登録は禁止させていただきます', 18],
			['18歳未満は利用禁止です。', 18],
			['当サーバーは年齢が18歳未満の方はご利用いただけません。', 18],
			['18歳未満の方の本サーバーへの登録はご遠慮ください。', 18],
			['18歳未満の人間の方の登録は禁止しております。', 18],
			['16歳未満（義務教育課程修了含む）の利用は禁止しています', 16],
			['16歳未満は登録できないよ', 16],
			['運営による許可のない15歳未満の登録と、捨てメアドを使った登録は禁止しています', 15],
			['2. 15歳未満/GDPR対象国からの申請は登録不可とします。', 15],
			['13歳未満の登録は禁止です', 13],
			['13歳未満の利用はお断りしています', 13],
			['13歳未満は登録しちゃだめだよ', 13],
			['13歳未満の方、EUのようなプロバイダーに厳しい要件を課す国からの登録はできません', 13],
			[
				'児童への安全性とプライバシー保護の観点から13歳未満によるサービスの利用および未成年者による本名や顔写真など個人を特定出来る情報を本サービスへ送信する行為',
				13
			],
			['18歳未満の者による利用。', 18],
			['えっちな内容が多めです。18歳未満の登録は非推奨といたします。', 18],
			['12歳未満の新規登録は禁止されています。', 12],
			['なお、12歳未満の方は利用出来ません。', 12]
		];
		for (const [text, min] of cases) expect(age(text), text).toBe(min);
	});

	it('未成年・成人・学校の段階での制限', () => {
		expect(age('法律上の成人に満たない方は、当サーバーにご登録いただくことは出来ません')).toBe(18);
		expect(age('未成年ノ入村ヲ禁ズ。')).toBe(18);
		expect(age('未成年者の登録は禁止です')).toBe(18);
		expect(age('成人の方のみ')).toBe(18);
		expect(age('小中学生向けのサーバーではありません。')).toBe(15);
		expect(age('中学生以上')).toBe(12);
	});

	it('複数あれば一番高い下限', () => {
		expect(age('13歳未満の登録は禁止です / 18歳未満の利用は禁止しています')).toBe(18);
	});

	it('投稿内容のルールは年齢制限とみなさない（実データで誤検出しうる文言）', () => {
		const contentRules = [
			'未成年の自撮りは禁止されているのでやらないで',
			'nsfwガイドラインに違反しないこと',
			'nsfw（水着以上の肌の露出のある）コンテンツには「閲覧注意」を付けてください',
			'r-18コンテンツは2d/3dともに投稿およびrenoteを禁止します',
			'r18作品につきましては、nsfwチャンネルやセンシティブ設定をご利用ください',
			'未成年者が運営しているサーバーです。登録する際はご注意を。',
			'18歳未満の方は必ず「r18」をハードミュートに設定してください',
			'18歳未満は自分の顔写真を投稿しないでね',
			'13歳未満のユーザーは顔写真などの個人を特定できる投稿は禁止です',
			'18歳未満に不適切な描写を含む投稿については文章の場合は',
			'未成年者の個人情報や写真などの情報をみだりに投稿してはいけません',
			'成人向けコンテンツの投稿は禁止です',
			'グロテスクや成人向けなどのセンシティブな投稿を禁じます。'
		];
		for (const text of contentRules) expect(age(text), text).toBeNull();
	});

	it('メール必須なだけでは年齢制限とみなさない', () => {
		expect(withRules()?.minAge).toBeNull();
	});
});
