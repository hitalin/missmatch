import type { AgeRestriction, Registration, ServerInfo } from './types';

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

// 「登録者の年齢を制限する」文言だけを拾う。
// 「R-18 は投稿禁止」「未成年の自撮り禁止」のような内容ルールは年齢制限ではないので対象外。
const RESTRICT_SUFFIX =
	'(の方|の人|のユーザー|の登録|の利用)?(のみ|限定|に限|であること|が対象|を推奨)';
const FORBID_SUFFIX = '[^。.\\n]{0,12}?(できません|出来ません|禁止|お断り|不可|ご遠慮)';
const AGE_18 = new RegExp(
	[
		`満?18歳以上${RESTRICT_SUFFIX}`,
		`18歳未満${FORBID_SUFFIX}`,
		`未成年者?(の|は)(登録|利用|ご利用|参加)${FORBID_SUFFIX}`,
		`成人(の方)?(のみ|限定)`,
		'(^|[^r\\-])18\\+'
	].join('|')
);
const AGE_13 = new RegExp(
	[`満?13歳以上${RESTRICT_SUFFIX}`, `13歳未満${FORBID_SUFFIX}`, '中学生以上'].join('|')
);

function allText(instance: JoinMisskeyInstance): string {
	return [
		instance.name,
		instance.description,
		instance.meta?.description,
		...(instance.meta?.serverRules ?? [])
	]
		.filter((t): t is string => Boolean(t))
		.map(stripHtml)
		.join(' ')
		.toLowerCase();
}

export function inferAgeRestriction(instance: JoinMisskeyInstance): AgeRestriction {
	const text = allText(instance);
	if (AGE_18.test(text)) return '18+';
	if (AGE_13.test(text)) return '13+';
	return 'unknown';
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
		ageRestriction: inferAgeRestriction(instance),
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
