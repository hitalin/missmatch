import { isListed } from './match';
import type { ServerInfo } from './types';

// MiAuth でのログイン。サーバーもブラウザも使う、副作用のない部分

export interface AuthUser {
	host: string;
	id: string;
	username: string;
	name: string;
	avatarUrl: string; // 本人ホストの転送 URL（応答の URL は信用しない）
}

// Misskey に求める権限。いまはアカウント情報の読み取りだけ
export const PERMISSIONS = ['read:account'];
export const APP_NAME = 'みすまっち';
export const SESSION_COOKIE = 'missmatch_session';
// ログイン開始から戻ってくるまでの照合に使う（MiAuth のセッション id とホスト）
export const PENDING_COOKIE = 'missmatch_miauth';

// 入力（ホスト名・URL・@user@host）からホスト名だけを取り出す。ホストと言えなければ null
export function normalizeHost(input: string): string | null {
	let s = input.trim().toLowerCase();
	const at = s.match(/^@?[^@/]+@([^@/]+)$/);
	if (at) s = at[1];
	if (!s) return null;
	let host: string;
	try {
		host = new URL(s.includes('://') ? s : `https://${s}`).hostname;
	} catch {
		return null;
	}
	// ドットを含むドメイン名だけ（localhost や IP は対象外）
	if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) return null;
	if (/^\d+(\.\d+){3}$/.test(host)) return null;
	return host;
}

// ログインできるのは joinmisskey に掲載され生きているサーバーだけ。
// /api/meta と /api/miauth/*/check を返すだけの偽ホストで任意の表示名・アバターのセッションを作らせない
export function isAllowedHost(servers: ServerInfo[], host: string): boolean {
	return servers.some((s) => s.host === host && isListed(s));
}

// アバターは本人ホストの転送（Misskey の /avatar/@user）。任意オリジンの画像を全員に配らない
export const avatarUrlOf = (host: string, username: string) =>
	`https://${host}/avatar/@${encodeURIComponent(username)}`;

// MiAuth の開始 URL。ユーザーをここに送ると、許可後に callback?session=<session> へ戻ってくる
export function miauthUrl(host: string, session: string, origin: string): string {
	const u = new URL(`https://${host}/miauth/${session}`);
	u.searchParams.set('name', APP_NAME);
	u.searchParams.set('callback', `${origin}/auth/callback`);
	u.searchParams.set('permission', PERMISSIONS.join(','));
	return u.toString();
}

// /api/miauth/{session}/check の応答を読む
export function parseCheck(data: unknown, host: string): { token: string; user: AuthUser } | null {
	if (!data || typeof data !== 'object') return null;
	const d = data as { ok?: unknown; token?: unknown; user?: unknown };
	if (d.ok !== true || typeof d.token !== 'string' || !d.user || typeof d.user !== 'object') {
		return null;
	}
	const u = d.user as { id?: unknown; username?: unknown; name?: unknown; avatarUrl?: unknown };
	if (typeof u.id !== 'string' || typeof u.username !== 'string') return null;
	return {
		token: d.token,
		user: {
			host,
			id: u.id,
			username: u.username,
			name: typeof u.name === 'string' && u.name ? u.name : u.username,
			avatarUrl: avatarUrlOf(host, u.username)
		}
	};
}
