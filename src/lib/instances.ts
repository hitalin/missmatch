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

function inferAgeRestriction(instance: JoinMisskeyInstance): AgeRestriction {
	const text = [
		instance.name,
		instance.description,
		instance.meta?.description,
		...(instance.meta?.serverRules ?? [])
	]
		.filter(Boolean)
		.join(' ')
		.toLowerCase();
	if (/18\+|18歳以上|成人|成年|アダルト|r-?18|nsfw/.test(text)) return '18+';
	if (/13\+|13歳|13才|中学生以上/.test(text)) return '13+';
	if (instance.meta?.emailRequiredForSignup) return '13+';
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
