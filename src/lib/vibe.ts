import { GENRE_LABELS, GENRES, type Genre, type ServerInfo, type VibeProfile } from './types';

// VibeProfile のスキーマを変えたら上げる（古いキャッシュを無効化する）
export const VIBE_VERSION = 2;
const KV_TTL_SECONDS = 60 * 60 * 24 * 7;

// Clef (System One API) の入出力
export type ClefQuestion =
	| { type: 'noul'; instructions: string; criteria?: { true?: string; false?: string } }
	| { type: 'choice'; instructions: string; criteria: Record<string, string | null> }
	| { type: 'score'; instructions: string; criteria: string[] };

export interface ClefInput {
	model: 'clef' | 'clef-flash';
	state: unknown;
	questions: Record<string, ClefQuestion>;
}

export type ClefAnswer =
	| { type: 'noul'; noul: number }
	| { type: 'choice'; choice: string; probabilities: Record<string, number>; confidence: number }
	| {
			type: 'score';
			score: number;
			legend: Record<string, unknown>;
			probabilities: Record<string, number>;
			confidence: number;
	  };

export interface ClefOutput {
	model: string;
	answers: Record<string, ClefAnswer>;
	usage: { input_tokens: number; output_tokens: number };
}

export type ClefRunner = (input: ClefInput) => Promise<ClefOutput>;

const TONE_LEVELS = [
	'殺伐としていて攻撃的な投稿が目立つ',
	'ドライで淡々としている',
	'穏やかで落ち着いている',
	'ほのぼのしていて互いに優しい'
];
const STRICTNESS_LEVELS = [
	'ルールがほとんどなく自由',
	'一般的なルールがある程度',
	'ルールが多く細かい、または厳格に運用されている'
];

// ジャンルは択一ではなく軸ごとに独立して問う。「創作も推し活も多い」サーバーを表現するため
const GENRE_QUESTIONS: Record<Genre, string> = {
	general: '日常の雑談が投稿の中心を占めているか',
	creative: 'イラスト・小説・音楽などの創作活動の投稿が目立つか',
	tech: 'プログラミングや技術の話題が目立つか',
	game: 'ゲームの話題が目立つか',
	otaku: 'アニメ・VTuber・アイドルなどの推し活の話題が目立つか',
	niche: '地域・職業・特定の趣味など、限られたテーマのためのサーバーか'
};

export const genreQuestionId = (g: Genre) => `genre.${g}`;

export const VIBE_QUESTIONS: Record<string, ClefQuestion> = {
	...Object.fromEntries(
		GENRES.map((g) => [genreQuestionId(g), { type: 'noul', instructions: GENRE_QUESTIONS[g] }])
	),
	tone: {
		type: 'score',
		instructions: 'サーバーの空気感（投稿の口調やユーザー同士の関わり方）を評価せよ',
		criteria: TONE_LEVELS
	},
	strictness: {
		type: 'score',
		instructions: 'サーバールールと説明文から、運営のルールの厳しさを評価せよ',
		criteria: STRICTNESS_LEVELS
	},
	newcomerFriendly: {
		type: 'noul',
		instructions: '新しく登録した初心者が会話に入りやすい雰囲気か',
		criteria: {
			true: '自己紹介への反応や歓迎の投稿があり、ひとりごとでも浮かない',
			false: '既存ユーザー同士の会話が中心で、新規が入り込む余地が少ない'
		}
	},
	nsfw: {
		type: 'noul',
		instructions: '性的・暴力的など成人向けの投稿が目立つか'
	},
	closedCommunity: {
		type: 'noul',
		instructions: '身内ノリや内輪の文脈が強く、外部の人には分かりにくい会話が多いか'
	}
};

export function buildVibeRequest(server: ServerInfo, sampleNotes: string[]): ClefInput {
	return {
		model: 'clef',
		state: {
			name: server.name ?? server.host,
			host: server.host,
			description: server.description ?? '',
			rules: server.serverRules,
			usersCount: server.usersCount,
			notesPerDay: server.npd15 === null ? null : Math.round(server.npd15),
			recentNotes: sampleNotes
		},
		questions: VIBE_QUESTIONS
	};
}

function requireAnswer<T extends ClefAnswer['type']>(
	answers: Record<string, ClefAnswer>,
	id: string,
	type: T
): Extract<ClefAnswer, { type: T }> {
	const a = answers[id];
	if (!a || a.type !== type) throw new Error(`Clef answer missing or wrong type: ${id}`);
	return a as Extract<ClefAnswer, { type: T }>;
}

export function parseVibeAnswers(
	host: string,
	answers: Record<string, ClefAnswer>,
	sampleCount: number
): VibeProfile {
	const genre = Object.fromEntries(
		GENRES.map((g) => [g, requireAnswer(answers, genreQuestionId(g), 'noul').noul])
	) as Record<Genre, number>;

	const tone = requireAnswer(answers, 'tone', 'score').score / (TONE_LEVELS.length - 1);
	const strictness =
		requireAnswer(answers, 'strictness', 'score').score / (STRICTNESS_LEVELS.length - 1);

	return {
		version: VIBE_VERSION,
		host,
		genre,
		tone: clamp01(tone),
		strictness: clamp01(strictness),
		newcomerFriendly: requireAnswer(answers, 'newcomerFriendly', 'noul').noul,
		nsfw: requireAnswer(answers, 'nsfw', 'noul').noul,
		closedCommunity: requireAnswer(answers, 'closedCommunity', 'noul').noul,
		sampleCount,
		computedAt: new Date().toISOString()
	};
}

function clamp01(n: number): number {
	return Math.min(1, Math.max(0, n));
}

export function topGenre(vibe: VibeProfile): Genre {
	return GENRES.reduce((best, g) => (vibe.genre[g] > vibe.genre[best] ? g : best), GENRES[0]);
}

export function vibeTags(vibe: VibeProfile): string[] {
	const tags: string[] = GENRES.filter((g) => vibe.genre[g] >= 0.6)
		.sort((a, b) => vibe.genre[b] - vibe.genre[a])
		.slice(0, 2)
		.map((g) => GENRE_LABELS[g]);
	if (vibe.tone >= 0.7) tags.push('ほのぼの');
	else if (vibe.tone <= 0.3) tags.push('ドライ');
	if (vibe.strictness >= 0.65) tags.push('ルール厳しめ');
	else if (vibe.strictness <= 0.3) tags.push('ルールゆるめ');
	if (vibe.newcomerFriendly >= 0.7) tags.push('初心者歓迎');
	if (vibe.nsfw >= 0.5) tags.push('成人向け多め');
	if (vibe.closedCommunity >= 0.6) tags.push('身内ノリ強め');
	return tags;
}

// KVNamespace のうち使う部分だけ（テストや vite dev で差し替えやすくする）
export interface VibeKv {
	get(key: string): Promise<string | null>;
	put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
	list(options: {
		prefix: string;
		cursor?: string;
	}): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor?: string }>;
}

export interface VibeDeps {
	kv: Pick<VibeKv, 'get' | 'put'>;
	runner: ClefRunner;
	sampler: (server: ServerInfo) => Promise<string[]>;
}

const KEY_PREFIX = 'vibe:';

export function vibeKey(host: string): string {
	return `${KEY_PREFIX}${host}`;
}

// 判定済みのホスト一覧（KV の list はページングされるので全部たどる）
export async function listCachedHosts(kv: Pick<VibeKv, 'list'>): Promise<Set<string>> {
	const hosts = new Set<string>();
	let cursor: string | undefined;
	do {
		const page = await kv.list({ prefix: KEY_PREFIX, cursor });
		for (const k of page.keys) hosts.add(k.name.slice(KEY_PREFIX.length));
		cursor = page.list_complete ? undefined : page.cursor;
	} while (cursor);
	return hosts;
}

// KV キャッシュがあればそれを、なければ Clef で計算して保存する。失敗時は null。
export async function getOrComputeVibe(
	server: ServerInfo,
	deps: VibeDeps
): Promise<VibeProfile | null> {
	const key = vibeKey(server.host);
	const cached = await deps.kv.get(key);
	if (cached) {
		try {
			const parsed = JSON.parse(cached) as Partial<VibeProfile>;
			if (parsed.version === VIBE_VERSION) return parsed as VibeProfile;
		} catch {
			// 壊れたキャッシュは作り直す
		}
	}

	try {
		const notes = await deps.sampler(server);
		const output = await deps.runner(buildVibeRequest(server, notes));
		const vibe = parseVibeAnswers(server.host, output.answers, notes.length);
		await deps.kv.put(key, JSON.stringify(vibe), { expirationTtl: KV_TTL_SECONDS });
		return vibe;
	} catch (e) {
		console.error(`[vibe] ${server.host}:`, e);
		return null;
	}
}
