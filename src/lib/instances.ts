import type { Registration, ServerInfo } from './types';

export const JOINMISSKEY_API = 'https://instanceapp.misskey.page/instances.json';
// joinmisskey が軽量化して配っている画像。各サーバー本体に取りに行かずに済む
const JOINMISSKEY_ASSETS = 'https://instanceapp.misskey.page';

// joinmisskey の instances.json の必要部分だけ
export interface JoinMisskeyInstance {
	url: string;
	langs?: string[];
	name?: string;
	description?: string;
	isAlive: boolean;
	banner?: boolean;
	background?: boolean;
	icon?: boolean;
	dru15?: number;
	npd15?: number;
	meta?: {
		name?: string;
		description?: string;
		disableRegistration?: boolean;
		emailRequiredForSignup?: boolean;
		approvalRequiredForSignup?: boolean;
		iconUrl?: string;
		serverRules?: string[];
		themeColor?: string;
		repositoryUrl?: string;
		notesPerOneAd?: number;
		noteSearchableScope?: string;
		translatorAvailable?: boolean;
		tosUrl?: string;
		privacyPolicyUrl?: string;
		policies?: {
			ltlAvailable?: boolean;
			gtlAvailable?: boolean;
			driveCapacityMb?: number;
			canInvite?: boolean;
			canSearchNotes?: boolean;
			canUseTranslator?: boolean;
			chatAvailability?: string;
			uploadableFileTypes?: string[];
		};
		features?: { localTimeline?: boolean; globalTimeline?: boolean };
	};
	nodeinfo?: {
		software?: { name?: string; version?: string; repository?: string };
		usage?: { users?: { total?: number } };
		openRegistrations?: boolean;
	};
	iconUrl?: string;
}

export interface JoinMisskeyResponse {
	latestMisskeyStableVersion?: string;
	instancesInfos: JoinMisskeyInstance[];
}

const OFFICIAL_REPO = /github\.com\/misskey-dev\/misskey\/?$/i;

// CalVer (YYYY.M.x) を通算月に。フォークの接尾辞 (2026.10.0-yami.1) も先頭一致で読む
export function versionToMonths(version: string | undefined): number | null {
	const m = version?.trim().match(/^v?(\d{4})\.(\d{1,2})\./);
	return m ? Number(m[1]) * 12 + Number(m[2]) : null;
}

export function monthsBehind(
	version: string | undefined,
	latest: string | undefined
): number | null {
	const a = versionToMonths(version);
	const b = versionToMonths(latest);
	return a === null || b === null ? null : Math.max(0, b - a);
}

export function stripHtml(text: string): string {
	return text
		.replace(/<br\s*\/?>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/\s+/g, ' ')
		.trim();
}

// 登録できる下限年齢を、説明文とルールの「登録者の年齢を制限する」文言から読む。
// 「未成年の自撮り禁止」「18歳未満は R18 をミュート」のような投稿内容のルールは年齢制限ではないので、
// 投稿内容を表す語を含む文は対象外にする。複数あれば一番高い下限を採る
const CONTENT_WORDS =
	/自撮り|顔|写真|投稿|ミュート|描写|個人情報|コンテンツ|運営して|r-?18|nsfw|閲覧/;
const AT_LEAST = /(?:満)?(\d{1,2})歳以上/g;
const AT_LEAST_CUE =
	/のみ|限定|に限|であること|である必要|でないと|から登録|が登録|ご利用|利用可能|登録可能|利用でき|登録でき|の方が|且つ|推奨|が対象|です/;
const UNDER = /(\d{1,2})歳未満/g;
const FORBID_CUE =
	/禁止|禁ず|禁じ|できません|出来ません|できない|お断り|不可|ご遠慮|いただけません|だめ|ダメ|非推奨/;
// 禁止事項の列挙（「18歳未満の者による利用。」）は、文の後ろに禁止の語が無くても制限とみなす
const UNDER_USE = /(\d{1,2})歳未満(?:の者|の方|の人)?による(?:本?サービスの)?(?:利用|登録)/g;
const MINOR_FORBID =
	/未成年(?:者)?(?:ノ|の|は)?[^。\n]{0,8}?(?:登録|利用|入村|参加)[^。\n]{0,10}?(?:禁|できません|出来ません|不可|お断り)/;
const NOT_ADULT = /成人に満たない|成人(?:の方)?(?:のみ|限定)/;
const NOT_SCHOOL = /小中学生向けのサーバーではありません/;
const SCHOOL_UP = /中学生以上/;
const PLUS_18 = /(?:^|[^r\-\d])18\+/;
const sane = (n: number) => n >= 10 && n <= 25;

export function inferMinAge(text: string): number | null {
	const normalized = text.normalize('NFKC').toLowerCase();
	const ages: number[] = [];
	for (const m of normalized.matchAll(UNDER_USE)) ages.push(Number(m[1]));
	for (const clause of normalized.split(/[。．!?！？\n]/)) {
		if (CONTENT_WORDS.test(clause)) continue;
		if (AT_LEAST_CUE.test(clause))
			for (const m of clause.matchAll(AT_LEAST)) ages.push(Number(m[1]));
		if (FORBID_CUE.test(clause)) for (const m of clause.matchAll(UNDER)) ages.push(Number(m[1]));
		if (MINOR_FORBID.test(clause) || NOT_ADULT.test(clause) || PLUS_18.test(clause)) ages.push(18);
		if (NOT_SCHOOL.test(clause)) ages.push(15);
		if (SCHOOL_UP.test(clause)) ages.push(12);
	}
	const valid = ages.filter(sane);
	return valid.length > 0 ? Math.max(...valid) : null;
}

function allText(instance: JoinMisskeyInstance): string {
	return [
		instance.name,
		instance.description,
		instance.meta?.description,
		...(instance.meta?.serverRules ?? [])
	]
		.filter((t): t is string => Boolean(t))
		.map(stripHtml)
		.join('\n') // ルールの区切りを文の区切りとして残す（年齢の判定が文ごとに読む）
		.toLowerCase();
}

// 招待制かどうかは公開情報に直接のフラグが無い。一般ユーザーが招待コードを発行できる設定か、
// 説明文に招待の案内があれば招待制、そうでなければ単なる登録停止中とみなす
export function inferRegistration(instance: JoinMisskeyInstance): Registration {
	const open = instance.nodeinfo?.openRegistrations ?? instance.meta?.disableRegistration !== true;
	if (open) return instance.meta?.approvalRequiredForSignup === true ? 'approval' : 'open';
	if (instance.meta?.policies?.canInvite === true) return 'invite';
	if (/招待|invite/.test(allText(instance))) return 'invite';
	return 'closed';
}

function hostOf(url: string): string {
	try {
		return url.includes('://') ? new URL(url).hostname : url.replace(/\/$/, '');
	} catch {
		return url;
	}
}

export function normalizeInstance(
	instance: JoinMisskeyInstance,
	latestVersion?: string
): ServerInfo | null {
	if (!instance.isAlive) return null;
	const host = hostOf(instance.url);
	const meta = instance.meta;
	const repository = (instance.nodeinfo?.software?.repository ?? meta?.repositoryUrl ?? '').trim();
	const scope = meta?.noteSearchableScope;
	const policies = meta?.policies;

	let iconUrl = instance.iconUrl ?? meta?.iconUrl ?? null;
	if (iconUrl && !iconUrl.startsWith('http')) {
		iconUrl = `https://${host}${iconUrl.startsWith('/') ? '' : '/'}${iconUrl}`;
	}
	if (instance.icon) iconUrl = `${JOINMISSKEY_ASSETS}/instance-icons/${host}.webp`;
	const bannerUrl = instance.banner
		? `${JOINMISSKEY_ASSETS}/instance-banners/${host}.webp`
		: instance.background
			? `${JOINMISSKEY_ASSETS}/instance-backgrounds/${host}.webp`
			: null;
	const themeColor = /^#[0-9a-f]{6}$/i.test(meta?.themeColor ?? '')
		? (meta?.themeColor as string)
		: null;

	const description = instance.description ?? instance.meta?.description ?? null;

	return {
		host,
		name: instance.name ?? instance.meta?.name ?? null,
		description: description ? stripHtml(description) : null,
		iconUrl,
		bannerUrl,
		themeColor,
		usersCount: instance.nodeinfo?.usage?.users?.total ?? null,
		dru15: instance.dru15 ?? null,
		npd15: instance.npd15 ?? null,
		softwareName: instance.nodeinfo?.software?.name ?? 'misskey',
		softwareVersion: instance.nodeinfo?.software?.version ?? '',
		versionMonthsBehind: monthsBehind(instance.nodeinfo?.software?.version, latestVersion),
		// リポジトリ不明は本家扱いにしない（フォークの可能性を残す）
		officialMisskey: OFFICIAL_REPO.test(repository),
		registration: inferRegistration(instance),
		emailRequired: instance.meta?.emailRequiredForSignup === true,
		minAge: inferMinAge(allText(instance)),
		ltlAvailable: meta?.policies?.ltlAvailable ?? meta?.features?.localTimeline ?? true,
		gtlAvailable: meta?.policies?.gtlAvailable ?? meta?.features?.globalTimeline ?? true,
		driveCapacityMb: meta?.policies?.driveCapacityMb ?? null,
		adsEnabled: (meta?.notesPerOneAd ?? 0) > 0,
		noteSearchableScope: scope === 'global' || scope === 'local' ? scope : null,
		// 機能はロールのポリシー（一般ユーザー）で見る。書いていなければ「ない」とみなす
		noteSearch: policies?.canSearchNotes === true,
		translator: meta?.translatorAvailable === true && policies?.canUseTranslator !== false,
		chat: policies?.chatAvailability === 'available',
		videoUpload: (policies?.uploadableFileTypes ?? []).some(
			(t) => t === '*/*' || t.startsWith('video/')
		),
		hasTos: !!meta?.tosUrl?.trim(),
		hasPrivacyPolicy: !!meta?.privacyPolicyUrl?.trim(),
		serverRules: meta?.serverRules ?? [],
		langs: instance.langs ?? []
	};
}

export async function fetchServers(fetchFn: typeof fetch = fetch): Promise<ServerInfo[]> {
	const res = await fetchFn(JOINMISSKEY_API, {
		headers: { 'User-Agent': 'missmatch/1.0 (Misskey server finder)' }
	});
	if (!res.ok) throw new Error(`joinmisskey API error: ${res.status}`);
	const data = (await res.json()) as JoinMisskeyResponse;
	return data.instancesInfos
		.map((i) => normalizeInstance(i, data.latestMisskeyStableVersion))
		.filter((s): s is ServerInfo => s !== null);
}
