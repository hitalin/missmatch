import { byActivity } from '$lib/candidates';
import { isJoinable } from '$lib/match';
import { listMembers, type PeopleDeps } from './members';

// 人モードのランディングの背景に浮かべる実在ユーザーの例。参加者を優先し、
// 少ない間は各サーバーの管理者が「みつける」に載せると選んだピン留めユーザー（/api/pinned-users、公開の名簿）で埋める。
// Clef で読まず、保存は名前・アバターの 1 日キャッシュだけ、出典のサーバーを付ける

export interface ExampleUser {
	host: string;
	username: string;
	name: string;
	avatarUrl: string;
	source: 'member' | 'pinned';
}

const WANT = 6;
const SERVERS_TO_ASK = 8;
const PINNED_TTL_SECONDS = 60 * 60 * 24;
const avatarUrlOf = (host: string, username: string) =>
	`https://${host}/avatar/@${encodeURIComponent(username)}`;

export async function exampleUsers(deps: PeopleDeps): Promise<ExampleUser[]> {
	const members = (await listMembers(deps.kv)).filter((m) => !m.hidden);
	const out: ExampleUser[] = members
		.sort((a, b) => b.joinedAt - a.joinedAt)
		.slice(0, WANT)
		.map((m) => ({
			host: m.host,
			username: m.username,
			name: m.name,
			avatarUrl: avatarUrlOf(m.host, m.username),
			source: 'member'
		}));
	if (out.length >= WANT) return out;
	const hosts = deps.servers.filter(isJoinable).sort(byActivity).slice(0, SERVERS_TO_ASK);
	for (const s of hosts) {
		if (out.length >= WANT) break;
		const key = `pinned:v1:${s.host}`;
		let pinned: ExampleUser[];
		const cached = await deps.kv.get(key);
		if (cached) pinned = JSON.parse(cached) as ExampleUser[];
		else {
			try {
				const users = (await deps.api(s.host, 'pinned-users', {})) as {
					username: string;
					name: string | null;
					isBot?: boolean;
				}[];
				pinned = users
					.filter((u) => !u.isBot)
					.slice(0, 2)
					.map((u) => ({
						host: s.host,
						username: u.username,
						name: u.name ?? u.username,
						avatarUrl: avatarUrlOf(s.host, u.username),
						source: 'pinned' as const
					}));
			} catch {
				pinned = []; // 取れないサーバーは飛ばす（1 日は再試行しない）
			}
			await deps.kv.put(key, JSON.stringify(pinned), { expirationTtl: PINNED_TTL_SECONDS });
		}
		for (const u of pinned) {
			if (out.length >= WANT) break;
			if (!out.some((o) => o.host === u.host && o.username === u.username)) out.push(u);
		}
	}
	return out;
}
