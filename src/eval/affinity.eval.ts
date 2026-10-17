import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildDeck, withRelativeVibes } from '$lib/match';
import { defaultPreferences } from '$lib/prefs';
import { effectivePrefs, newSearch, searchText } from '$lib/search';
import type { ServerProfile } from '$lib/types';
import type { ClefAnswer } from '$lib/vibe';
import { CASES, type EvalCase } from './cases';

// 代表的な言葉で /api/intent を叩き、「上位に来てほしいサーバー」が上位 5 件に入る割合を測る。
// ブラウザと同じ手順（読み取りで設定を埋め、噛み合い 0.75 + 好み 0.25 で並べる）で順位を出す。
// Clef 実機を叩くので課金対象。EVAL_BASE_URL が無ければ何もしない
//   EVAL_BASE_URL=https://<host> pnpm eval
//   EVAL_LABEL=<名前>       結果を src/eval/results/<名前>.json に残す（既定は日時）
//   EVAL_COMPARE=<path>    以前の結果と比べて差を出す
//   EVAL_CACHE=1           サーバー側の読み取りキャッシュを使う（既定はキャッシュを読まず判定し直す）
const BASE = process.env.EVAL_BASE_URL?.replace(/\/$/, '');
const TOP = 5;

interface CaseResult {
	id: string;
	turns: string[];
	ranks: Record<string, number | null>; // 期待した host → 順位（1 始まり、候補に無ければ null）
	top: { host: string; score: number; affinity: number | undefined }[];
	recallAt5: number;
	recallAt10: number;
	best: number | null;
}
interface Report {
	at: string;
	base: string;
	cases: CaseResult[];
	summary: { recallAt5: number; recallAt10: number; mrr: number; cases: number };
}

async function fetchProfiles(): Promise<ServerProfile[]> {
	const res = await fetch(`${BASE}/api/servers`);
	if (!res.ok) throw new Error(`GET /api/servers: HTTP ${res.status}`);
	const data = (await res.json()) as { profiles: ServerProfile[]; pendingCount: number };
	if (data.pendingCount > 0) {
		console.warn(`[eval] 雰囲気の欠け ${data.pendingCount} 件。warm を回してから測ると比べやすい`);
	}
	return withRelativeVibes(data.profiles);
}

async function runCase(c: EvalCase, profiles: ServerProfile[]): Promise<CaseResult> {
	const res = await fetch(`${BASE}/api/intent`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ turns: c.turns, scope: 'open', fresh: process.env.EVAL_CACHE !== '1' })
	});
	if (!res.ok) throw new Error(`POST /api/intent (${c.id}): HTTP ${res.status}`);
	const data = (await res.json()) as {
		answers: Record<string, ClefAnswer>;
		affinity: Record<string, number>;
	};
	const search = {
		...newSearch(c.turns[0]),
		turns: c.turns.slice(1),
		intent: data.answers,
		affinity: data.affinity
	};
	search.affinityFor = searchText(search);
	const prefs = effectivePrefs({ ...defaultPreferences(), age: 'adult' }, search);
	const deck = buildDeck(profiles, prefs, {}, 0, search, profiles.length);
	const rankOf = (host: string) => {
		const i = deck.findIndex((m) => m.server.host === host);
		return i < 0 ? null : i + 1;
	};
	const ranks = Object.fromEntries(c.expect.map((h) => [h, rankOf(h)]));
	const within = (n: number) =>
		c.expect.filter((h) => (ranks[h] ?? Infinity) <= n).length / c.expect.length;
	const found = Object.values(ranks).filter((r): r is number => r !== null);
	return {
		id: c.id,
		turns: c.turns,
		ranks,
		top: deck
			.slice(0, TOP)
			.map((m) => ({ host: m.server.host, score: m.score, affinity: m.affinity })),
		recallAt5: within(5),
		recallAt10: within(10),
		best: found.length > 0 ? Math.min(...found) : null
	};
}

function summarize(cases: CaseResult[]): Report['summary'] {
	const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
	return {
		cases: cases.length,
		recallAt5: mean(cases.map((c) => c.recallAt5)),
		recallAt10: mean(cases.map((c) => c.recallAt10)),
		mrr: mean(cases.map((c) => (c.best ? 1 / c.best : 0)))
	};
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
function print(report: Report, compare: Report | null) {
	const lines: string[] = [];
	lines.push(`| case | 期待 host → 順位 | 上位 ${TOP} | R@5 |`, '|---|---|---|---|');
	for (const c of report.cases) {
		const before = compare?.cases.find((x) => x.id === c.id);
		const ranks = Object.entries(c.ranks)
			.map(([h, r]) => {
				const prev = before?.ranks[h];
				const delta = prev !== undefined && prev !== r ? `（前回 ${prev ?? '-'}）` : '';
				return `${h} → ${r ?? '-'}${delta}`;
			})
			.join('<br>');
		const top = c.top.map((t) => `${t.host} ${t.score}`).join('<br>');
		lines.push(`| ${c.id} | ${ranks} | ${top} | ${pct(c.recallAt5)} |`);
	}
	const s = report.summary;
	const d = compare ? compare.summary : null;
	const delta = (k: 'recallAt5' | 'recallAt10' | 'mrr') => (d ? `（前回 ${pct(d[k])}）` : '');
	lines.push(
		'',
		`cases ${s.cases} / recall@5 ${pct(s.recallAt5)}${delta('recallAt5')} / recall@10 ${pct(s.recallAt10)}${delta('recallAt10')} / MRR ${pct(s.mrr)}${delta('mrr')}`
	);
	console.log(lines.join('\n'));
}

describe.skipIf(!BASE)('精度の評価（Clef 実機）', () => {
	it('上位 5 件に期待したサーバーが入る割合を出す', async () => {
		const profiles = await fetchProfiles();
		const results: CaseResult[] = [];
		for (const c of CASES) results.push(await runCase(c, profiles)); // 1 件ずつ（Clef に一度に投げすぎない）
		const report: Report = {
			at: new Date().toISOString(),
			base: BASE as string,
			cases: results,
			summary: summarize(results)
		};
		const comparePath = process.env.EVAL_COMPARE;
		const compare = comparePath ? (JSON.parse(readFileSync(comparePath, 'utf8')) as Report) : null;
		print(report, compare);
		const label = process.env.EVAL_LABEL ?? report.at.replace(/[:.]/g, '-');
		mkdirSync('src/eval/results', { recursive: true });
		const out = `src/eval/results/${label}.json`;
		writeFileSync(out, JSON.stringify(report, null, '\t'));
		console.log(`→ ${out}`);
		expect(results.length).toBe(CASES.length);
	});
});
