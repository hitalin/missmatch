// Misskey の API を叩く最小の関数。タイムアウトと User-Agent を必ず付ける

export const USER_AGENT = 'missmatch/1.0 (+https://github.com/hitalin/missmatch; match@hital.in)';
const TIMEOUT_MS = 10_000;

export class MisskeyApiError extends Error {
	constructor(
		public host: string,
		public endpoint: string,
		public status: number,
		public code?: string
	) {
		super(`${host} ${endpoint}: HTTP ${status}${code ? ` ${code}` : ''}`);
		this.name = 'MisskeyApiError';
	}
}

export type MisskeyApi = (
	host: string,
	endpoint: string,
	body: Record<string, unknown>,
	token?: string
) => Promise<unknown>;

export const misskeyApi: MisskeyApi = async (host, endpoint, body, token) => {
	const res = await fetch(`https://${host}/api/${endpoint}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
		body: JSON.stringify(token ? { ...body, i: token } : body),
		redirect: 'manual',
		signal: AbortSignal.timeout(TIMEOUT_MS)
	});
	if (!res.ok) {
		const err = (await res.json().catch(() => ({}))) as { error?: { code?: string } };
		throw new MisskeyApiError(host, endpoint, res.status, err.error?.code);
	}
	if (res.status === 204) return null;
	return res.json();
};
