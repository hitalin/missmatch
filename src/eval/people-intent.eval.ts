import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { PeopleIntent } from '$lib/people-intent';
import { GENRES } from '$lib/types';
import { PEOPLE_CASES, type PeopleCase } from './people-cases';

// 人探しの「言葉 → 希望」を /api/people/intent で測る（Clef 実機。課金対象）。
//   EVAL_BASE_URL=http://localhost:8788 EVAL_COOKIE="missmatch_session=<id>" pnpm eval
//   EVAL_MODEL=clef-flash で小さいモデルを試す
// 参加者のセッション Cookie が要る（ローカルの KV にある session:v1:<id>）。
// 指標: want の再現率（読み取ってほしい話題が 0.5 以上）、avoid の精度（読み取ってはいけない話題が 0.5 未満）、
// style / night / pace / refused の一致率
const BASE = process.env.EVAL_BASE_URL?.replace(/\/$/, '');
const COOKIE = process.env.EVAL_COOKIE ?? '';

interface CaseResult {
	id: string;
	turns: string[];
	intent: PeopleIntent;
	wantHit: number;
	wantTotal: number;
	avoidHit: number;
	avoidTotal: number;
	style: boolean | null;
	night: boolean | null;
	pace: boolean | null;
	refused: boolean;
	ms: number;
}

async function runCase(c: PeopleCase): Promise<CaseResult> {
	const t0 = Date.now();
	const res = await fetch(`${BASE}/api/people/intent`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Cookie: COOKIE },
		body: JSON.stringify({
			turns: c.turns,
			fresh: process.env.EVAL_CACHE !== '1',
			model: process.env.EVAL_MODEL // clef-flash を試すとき
		})
	});
	if (!res.ok) throw new Error(`POST /api/people/intent: HTTP ${res.status}`);
	const intent = (await res.json()) as PeopleIntent;
	const ms = Date.now() - t0;
	const hi = (g: string) => (intent.want[g as (typeof GENRES)[number]] ?? 0) >= 0.5;
	return {
		id: c.id,
		turns: c.turns,
		intent,
		wantHit: c.want.filter(hi).length,
		wantTotal: c.want.length,
		avoidHit: (c.avoid ?? []).filter((g) => !hi(g)).length,
		avoidTotal: (c.avoid ?? []).length,
		style: c.style ? intent.style === c.style : null,
		night: c.night !== undefined ? intent.night >= 0.5 === c.night : null,
		pace: c.pace ? intent.pace === c.pace : null,
		refused: intent.refused === (c.refused ?? false),
		ms
	};
}

const rate = (xs: (boolean | null)[]) => {
	const v = xs.filter((x): x is boolean => x !== null);
	return v.length === 0 ? null : v.filter(Boolean).length / v.length;
};

describe.skipIf(!BASE)('people intent', () => {
	it('言葉から望む話題・関わり方・時間帯・投稿量・断るべきかを読み取る', async () => {
		const results: CaseResult[] = [];
		for (const c of PEOPLE_CASES) results.push(await runCase(c));
		const summary = {
			cases: results.length,
			wantRecall:
				results.reduce((s, r) => s + r.wantHit, 0) /
				Math.max(
					1,
					results.reduce((s, r) => s + r.wantTotal, 0)
				),
			avoidPrecision:
				results.reduce((s, r) => s + r.avoidHit, 0) /
				Math.max(
					1,
					results.reduce((s, r) => s + r.avoidTotal, 0)
				),
			style: rate(results.map((r) => r.style)),
			night: rate(results.map((r) => r.night)),
			pace: rate(results.map((r) => r.pace)),
			refused: rate(results.map((r) => r.refused)),
			meanMs: Math.round(results.reduce((s, r) => s + r.ms, 0) / results.length)
		};
		for (const r of results) {
			const top = GENRES.filter((g) => (r.intent.want[g] ?? 0) >= 0.5)
				.sort((a, b) => (r.intent.want[b] ?? 0) - (r.intent.want[a] ?? 0))
				.map((g) => `${g}:${Math.round((r.intent.want[g] ?? 0) * 100)}`)
				.join(' ');
			console.log(
				`${r.id.padEnd(16)} want ${r.wantHit}/${r.wantTotal} avoid ${r.avoidHit}/${r.avoidTotal} style ${r.style ?? '-'} night ${r.night ?? '-'} pace ${r.pace ?? '-'} refused ${r.refused} | ${r.intent.style}/${r.intent.pace}/night ${Math.round(r.intent.night * 100)} | ${top}`
			);
		}
		console.log('summary', JSON.stringify(summary));
		mkdirSync('src/eval/results', { recursive: true });
		const label =
			process.env.EVAL_LABEL ?? `people-intent-${new Date().toISOString().slice(0, 10)}`;
		writeFileSync(
			`src/eval/results/${label}.json`,
			JSON.stringify({ at: new Date().toISOString(), summary, results }, null, '\t')
		);
		expect(summary.refused).toBe(1);
	});
});
