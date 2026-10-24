import { PACE_HINTS, PACE_LABELS, paceOf, SCALE_LABELS, scaleOf } from '$lib/prefs';
import { GENRE_LABELS, GENRES, type ServerProfile } from '$lib/types';
import { STRICTNESS_LEVELS, TONE_LEVELS } from '$lib/vibe';

// 言葉との噛み合い判定を Clef に頼む前に、埋め込みの類似度で候補を上位 K 件に絞る実験（評価用）。
// 2026-10-24 の A/B（32 言葉、招待制まで 182 件、基準 = 全サーバー 13 バッチ recall@5 74% / @10 87%）:
//   bge-m3 K=16: 60% / 64%、K=32: 66% / 68%、K=48: 66% / 72%、gemma K=16: 59% / 64%、
//   plamo K=16: 69% / 77%（応答 4.7 秒）、qwen3 K=16: 54% / 63%
// 「英語で話せる」「静かな場所」のように意味で決まる言葉を埋め込みが拾えず、字面の一致を足しても
// 戻らなかったので本番では使わない（AFFINITY_CANDIDATES = 0）。/api/intent の candidates と embed で評価だけできる。
// 人探し（docs/PEOPLE.md）の候補づくりに使う部品としては残す

// Workers AI の多言語埋め込みモデル。eval で比べて既定を決める（docs/PEOPLE.md §10）
export const EMBED_MODELS = {
	'bge-m3': '@cf/baai/bge-m3',
	gemma: '@cf/google/embeddinggemma-300m',
	plamo: '@cf/pfnet/plamo-embedding-1b',
	qwen3: '@cf/qwen/qwen3-embedding-0.6b'
} as const;
export type EmbedModel = keyof typeof EMBED_MODELS;
export const DEFAULT_EMBED_MODEL: EmbedModel = 'bge-m3';
// Clef に渡す候補の数。0 なら絞らず全サーバーを渡す（本番）。評価では 16 や 32 を試せる
export const AFFINITY_CANDIDATES = 0;
// 表の形を変えたら上げる
const TABLE_VERSION = 1;
export const tableKey = (model: EmbedModel, scope: string) =>
	`embeddings:v${TABLE_VERSION}:${model}:${scope}`;
export const EMBED_CHUNK = 50; // 1 回の埋め込みに渡す本数

export type Embedder = (texts: string[]) => Promise<number[][]>;

export function embedRunner(ai: Ai, model: EmbedModel): Embedder {
	return async (texts) => {
		const out = (await ai.run(EMBED_MODELS[model] as never, { text: texts } as never)) as {
			data?: number[][];
		};
		if (!out.data || out.data.length !== texts.length) {
			throw new Error(
				`embedding returned ${out.data?.length ?? 0} vectors for ${texts.length} texts`
			);
		}
		return out.data;
	};
}

const level = (levels: string[], v: number) =>
	levels[Math.min(levels.length - 1, Math.max(0, Math.round(v * (levels.length - 1))))];

// 噛み合い判定に渡す state と同じ情報を、埋め込み向けに 1 本の日本語にする
export function serverText(p: ServerProfile): string {
	const s = p.server;
	const lines = [
		`${s.name ?? s.host}（${s.host}）`,
		(s.description ?? '').slice(0, 300),
		s.serverRules.length > 0 ? `ルール: ${s.serverRules.join(' / ').slice(0, 200)}` : '',
		`規模: ${SCALE_LABELS[scaleOf(s)]}、流速: ${PACE_LABELS[paceOf(s)]}（${PACE_HINTS[paceOf(s)]}）`,
		s.ltlAvailable ? '' : 'ローカルタイムラインなし（他人の投稿が流れてこない）'
	];
	const v = p.vibe;
	if (v) {
		const topics = GENRES.filter((g) => v.genre[g] >= 0.5)
			.sort((a, b) => v.genre[b] - v.genre[a])
			.map((g) => GENRE_LABELS[g]);
		lines.push(
			`空気: ${level(TONE_LEVELS, v.tone)}、ルールは${level(STRICTNESS_LEVELS, v.strictness)}`
		);
		if (v.newcomerFriendly >= 0.6) lines.push('初心者を歓迎する');
		if (v.closedCommunity >= 0.6) lines.push('身内の付き合いが濃い');
		if (v.nsfw >= 0.5) lines.push('成人向けの投稿がある');
		if (topics.length > 0) lines.push(`話題: ${topics.join('、')}`);
	}
	return lines.filter((l) => l.length > 0).join('\n');
}

export function queryText(turns: string[]): string {
	return turns.join('\n');
}

// FNV-1a。説明文が変わったサーバーだけ埋め込み直すための印
export function textHash(text: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, '0');
}

export interface EmbeddingTable {
	hosts: string[];
	hashes: Record<string, string>; // host → 埋め込んだ文面の textHash
	vectors: number[][];
}

export function cosine(a: number[], b: number[]): number {
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		na += a[i] * a[i];
		nb += b[i] * b[i];
	}
	return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

// 言葉のベクトルに近い順に K 件を候補にする。外側のサーバーには Clef を使わず、
// 類似度の順位を 0.2〜0.49 に写した値を付ける（Clef が「噛み合う」と判定した候補より常に下に並ぶ）
export function pickCandidates(
	query: number[],
	table: EmbeddingTable,
	k: number
): { candidates: string[]; others: Record<string, number> } {
	const ranked = table.hosts
		.map((host, i) => ({ host, sim: cosine(query, table.vectors[i]) }))
		.sort((a, b) => b.sim - a.sim);
	if (k <= 0) return { candidates: ranked.map((r) => r.host), others: {} };
	const candidates = ranked.slice(0, k).map((r) => r.host);
	const rest = ranked.slice(k);
	const others: Record<string, number> = {};
	rest.forEach((r, i) => {
		others[r.host] = 0.2 + 0.29 * (1 - i / Math.max(1, rest.length));
	});
	return { candidates, others };
}

// KV に置く形: ベクトルは Float32 の base64（185 件 × 1,024 次元で約 750 KB）
export function packTable(table: EmbeddingTable): string {
	const dims = table.vectors[0]?.length ?? 0;
	const flat = new Float32Array(table.hosts.length * dims);
	table.vectors.forEach((v, i) => {
		flat.set(v, i * dims);
	});
	const bytes = new Uint8Array(flat.buffer);
	let binary = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return JSON.stringify({ hosts: table.hosts, hashes: table.hashes, dims, data: btoa(binary) });
}

export function unpackTable(raw: string | null): EmbeddingTable | null {
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as {
			hosts: string[];
			hashes: Record<string, string>;
			dims: number;
			data: string;
		};
		const binary = atob(parsed.data);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
		const flat = new Float32Array(bytes.buffer);
		const vectors = parsed.hosts.map((_, i) =>
			Array.from(flat.subarray(i * parsed.dims, (i + 1) * parsed.dims))
		);
		return { hosts: parsed.hosts, hashes: parsed.hashes, vectors };
	} catch {
		return null;
	}
}

// 表を今の属性表に合わせる: 文面が変わった・無いサーバーだけ埋め込み直し、消えたサーバーは落とす
export async function refreshTable(
	profiles: ServerProfile[],
	table: EmbeddingTable | null,
	embedder: Embedder
): Promise<{ table: EmbeddingTable; embedded: number }> {
	const texts = profiles.map((p) => serverText(p));
	const hashes = texts.map(textHash);
	const index = new Map((table?.hosts ?? []).map((h, i) => [h, i]));
	const todo: number[] = [];
	profiles.forEach((p, i) => {
		const j = index.get(p.server.host);
		if (j === undefined || table?.hashes[p.server.host] !== hashes[i]) todo.push(i);
	});
	const fresh = new Map<number, number[]>();
	for (let i = 0; i < todo.length; i += EMBED_CHUNK) {
		const chunk = todo.slice(i, i + EMBED_CHUNK);
		const vectors = await embedder(chunk.map((j) => texts[j]));
		chunk.forEach((j, k) => {
			fresh.set(j, vectors[k]);
		});
	}
	const next: EmbeddingTable = { hosts: [], hashes: {}, vectors: [] };
	profiles.forEach((p, i) => {
		const vector =
			fresh.get(i) ?? (table ? table.vectors[index.get(p.server.host) as number] : null);
		if (!vector) return;
		next.hosts.push(p.server.host);
		next.hashes[p.server.host] = hashes[i];
		next.vectors.push(vector);
	});
	return { table: next, embedded: todo.length };
}
