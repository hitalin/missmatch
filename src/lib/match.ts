import {
	type AxisScore,
	GENRE_LABELS,
	type Match,
	type Pace,
	type Preference,
	type Scale,
	type ServerInfo,
	type VibeProfile
} from './types';
import { vibeTags } from './vibe';

const PACE_ORDER: Pace[] = ['quiet', 'relaxed', 'busy'];
const SCALE_ORDER: Scale[] = ['small', 'medium', 'large'];
const PACE_LABELS: Record<Pace, string> = {
	quiet: 'のんびり',
	relaxed: 'ほどほど',
	busy: 'にぎやか'
};
const SCALE_LABELS: Record<Scale, string> = { small: '小規模', medium: '中規模', large: '大手' };

export function paceOf(server: ServerInfo): Pace {
	const n = server.npd15 ?? 0;
	if (n < 100) return 'quiet';
	if (n < 5000) return 'relaxed';
	return 'busy';
}

export function scaleOf(server: ServerInfo): Scale {
	const n = server.usersCount ?? 0;
	if (n < 100) return 'small';
	if (n < 1000) return 'medium';
	return 'large';
}

export function hardFilter(servers: ServerInfo[], pref: Preference): ServerInfo[] {
	return servers.filter((s) => {
		if (!s.langs.includes('ja')) return false;
		const joinable =
			pref.registration === 'openOnly'
				? s.registrationOpen
				: s.registrationOpen || s.approvalRequired;
		if (!joinable) return false;
		if (!pref.adult && s.ageRestriction === '18+') return false;
		return true;
	});
}

// 順序付きカテゴリの近さ: 一致 1、隣 0.4、それ以外 0
function ordinalMatch<T>(order: T[], actual: T, wanted: T): number {
	const d = Math.abs(order.indexOf(actual) - order.indexOf(wanted));
	return d === 0 ? 1 : d === 1 ? 0.4 : 0;
}

// vibe 未取得の軸は「分からない」として中立値にする
const UNKNOWN = 0.5;

export function scoreServer(server: ServerInfo, vibe: VibeProfile | null, pref: Preference): Match {
	const axes: AxisScore[] = [];

	if (pref.genre) {
		const p = vibe ? vibe.genre[pref.genre] : UNKNOWN;
		axes.push({
			axis: 'genre',
			score: p,
			weight: 3,
			reason: vibe ? `${GENRE_LABELS[pref.genre]}の話題が多い` : null
		});
	}

	if (pref.pace) {
		const actual = paceOf(server);
		axes.push({
			axis: 'pace',
			score: ordinalMatch(PACE_ORDER, actual, pref.pace),
			weight: 2,
			reason: `流速は${PACE_LABELS[actual]}`
		});
	}

	if (pref.scale) {
		const actual = scaleOf(server);
		axes.push({
			axis: 'scale',
			score: ordinalMatch(SCALE_ORDER, actual, pref.scale),
			weight: 1.5,
			reason: `${SCALE_LABELS[actual]}のサーバー`
		});
	}

	if (pref.tone) {
		let score = UNKNOWN;
		if (vibe) {
			score = pref.tone === 'warm' ? vibe.tone : (1 - vibe.tone + (1 - vibe.strictness)) / 2;
		}
		axes.push({
			axis: 'tone',
			score,
			weight: 2,
			reason: vibe ? (pref.tone === 'warm' ? '空気が穏やか' : '干渉が少なく自由') : null
		});
	}

	if (pref.nsfw === 'avoid') {
		axes.push({
			axis: 'nsfw',
			score: vibe ? 1 - vibe.nsfw : UNKNOWN,
			weight: 4,
			reason: null // 「ない」ことは売りにならないので理由には出さない
		});
	} else if (pref.nsfw === 'welcome') {
		axes.push({
			axis: 'nsfw',
			score: vibe ? vibe.nsfw : UNKNOWN,
			weight: 2,
			reason: vibe ? '成人向け投稿に寛容' : null
		});
	}

	if (pref.community === 'easyEntry') {
		axes.push({
			axis: 'community',
			score: vibe ? (vibe.newcomerFriendly + (1 - vibe.closedCommunity)) / 2 : UNKNOWN,
			weight: 2,
			reason: vibe ? '初心者が入りやすい' : null
		});
	} else {
		axes.push({
			axis: 'community',
			score: vibe ? 0.5 + vibe.closedCommunity / 2 : UNKNOWN,
			weight: 1,
			reason: vibe ? 'コミュニティの結びつきが強い' : null
		});
	}

	const totalWeight = axes.reduce((s, a) => s + a.weight, 0);
	const weighted = axes.reduce((s, a) => s + a.score * a.weight, 0);
	const score = totalWeight === 0 ? 50 : Math.round((weighted / totalWeight) * 100);

	const reasons = axes
		.filter((a) => a.reason && a.score >= 0.6)
		.sort((a, b) => b.score * b.weight - a.score * a.weight)
		.map((a) => a.reason as string);

	return { server, vibe, score, axes, reasons, tags: vibe ? vibeTags(vibe) : [] };
}

export function rankServers(
	items: { server: ServerInfo; vibe: VibeProfile | null }[],
	pref: Preference,
	limit: number
): Match[] {
	return items
		.map(({ server, vibe }) => scoreServer(server, vibe, pref))
		.sort((a, b) => b.score - a.score || (b.server.dru15 ?? 0) - (a.server.dru15 ?? 0))
		.slice(0, limit);
}
