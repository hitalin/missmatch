import type { AgeRestriction, ServerInfo } from './types';

export const JOINMISSKEY_API = 'https://instanceapp.misskey.page/instances.json';
const JOINMISSKEY_BANNERS = 'https://instanceapp.misskey.page/instance-banners';

// joinmisskey の instances.json の必要部分だけ
export interface JoinMisskeyInstance {
	url: string;
	langs?: string[];
	name?: string;
	description?: string;
	isAlive: boolean;
	banner?: boolean;
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
		policies?: { ltlAvailable?: boolean };
		features?: { localTimeline?: boolean };
	};
	nodeinfo?: {
		software?: { name?: string; version?: string };
		usage?: { users?: { total?: number } };
		openRegistrations?: boolean;
	};
	iconUrl?: string;
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

export function inferAgeRestriction(instance: JoinMisskeyInstance): AgeRestriction {
	const text = [
		instance.name,
		instance.description,
		instance.meta?.description,
		...(instance.meta?.serverRules ?? [])
	]
		.filter((t): t is string => Boolean(t))
		.map(stripHtml)
		.join(' ')
		.toLowerCase();
	if (AGE_18.test(text)) return '18+';
	if (AGE_13.test(text)) return '13+';
	return 'unknown';
}

function hostOf(url: string): string {
	try {
		return url.includes('://') ? new URL(url).hostname : url.replace(/\/$/, '');
	} catch {
		return url;
	}
}

export function normalizeInstance(instance: JoinMisskeyInstance): ServerInfo | null {
	if (!instance.isAlive) return null;
	const host = hostOf(instance.url);

	const registrationOpen =
		instance.nodeinfo?.openRegistrations ?? instance.meta?.disableRegistration !== true;

	let iconUrl = instance.iconUrl ?? instance.meta?.iconUrl ?? null;
	if (iconUrl && !iconUrl.startsWith('http')) {
		iconUrl = `https://${host}${iconUrl.startsWith('/') ? '' : '/'}${iconUrl}`;
	}

	const description = instance.description ?? instance.meta?.description ?? null;

	return {
		host,
		name: instance.name ?? instance.meta?.name ?? null,
		description: description ? stripHtml(description) : null,
		iconUrl,
		bannerUrl: instance.banner ? `${JOINMISSKEY_BANNERS}/${host}.jpeg` : null,
		usersCount: instance.nodeinfo?.usage?.users?.total ?? null,
		dru15: instance.dru15 ?? null,
		npd15: instance.npd15 ?? null,
		softwareName: instance.nodeinfo?.software?.name ?? 'misskey',
		softwareVersion: instance.nodeinfo?.software?.version ?? '',
		registrationOpen,
		approvalRequired: instance.meta?.approvalRequiredForSignup === true,
		emailRequired: instance.meta?.emailRequiredForSignup === true,
		ageRestriction: inferAgeRestriction(instance),
		ltlAvailable:
			instance.meta?.policies?.ltlAvailable ?? instance.meta?.features?.localTimeline ?? true,
		serverRules: instance.meta?.serverRules ?? [],
		langs: instance.langs ?? []
	};
}

export async function fetchServers(fetchFn: typeof fetch = fetch): Promise<ServerInfo[]> {
	const res = await fetchFn(JOINMISSKEY_API, {
		headers: { 'User-Agent': 'missmatch/1.0 (Misskey server finder)' }
	});
	if (!res.ok) throw new Error(`joinmisskey API error: ${res.status}`);
	const data = (await res.json()) as { instancesInfos: JoinMisskeyInstance[] };
	return data.instancesInfos.map(normalizeInstance).filter((s): s is ServerInfo => s !== null);
}
