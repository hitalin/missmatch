import { describe, expect, it, vi } from 'vitest';
import type { ClefInput, ClefOutput } from '$lib/vibe';
import { clefNeurons, createBudget, GUARD_NEURONS, meteredRunner, neuronsKey } from './budget';

function memKv() {
	const store = new Map<string, string>();
	return {
		store,
		get: async (k: string) => store.get(k) ?? null,
		put: async (k: string, v: string) => {
			store.set(k, v);
		}
	};
}
const out = (tokens: number): ClefOutput => ({
	model: 'clef',
	answers: {},
	usage: { input_tokens: tokens, output_tokens: 0 }
});
const input: ClefInput = { model: 'clef', state: {}, questions: {} };

describe('neuronsKey / clefNeurons', () => {
	it('鍵は UTC の日付（無料枠は 00:00 UTC にリセットされる）', () => {
		expect(neuronsKey(Date.UTC(2026, 9, 24, 23, 59))).toBe('ai:neurons:2026-10-24');
		expect(neuronsKey(Date.UTC(2026, 9, 25, 0, 0))).toBe('ai:neurons:2026-10-25');
	});
	it('Clef は入力 100 万トークンで 21,818 Neurons', () => {
		expect(clefNeurons(1_000_000)).toBe(21_818);
		expect(clefNeurons(4_000)).toBeCloseTo(87.3, 1);
	});
});

describe('createBudget', () => {
	it('KV の今日の分にこのリクエストの分を足して判定し、flush で置く', async () => {
		const kv = memKv();
		const now = Date.UTC(2026, 9, 24, 12);
		kv.store.set('ai:neurons:2026-10-24', '8000');
		const budget = createBudget(kv, () => now);
		expect(await budget.exhausted()).toBe(false);
		budget.charge(500);
		expect(await budget.spent()).toBe(8500);
		expect(await budget.exhausted()).toBe(false);
		budget.charge(600);
		expect(await budget.exhausted()).toBe(true); // 9100 >= 9000
		await budget.flush();
		expect(kv.store.get('ai:neurons:2026-10-24')).toBe('9100');
	});
	it('flush は置く直前に読み直し、他のリクエストが足した分を上書きしない', async () => {
		const kv = memKv();
		const now = Date.UTC(2026, 9, 24, 12);
		const budget = createBudget(kv, () => now);
		await budget.spent(); // 0 を読む
		kv.store.set('ai:neurons:2026-10-24', '300'); // 別のリクエストが置いた
		budget.charge(100);
		await budget.flush();
		expect(kv.store.get('ai:neurons:2026-10-24')).toBe('400');
		await budget.flush(); // 足す分が無ければ書かない
		expect(kv.store.get('ai:neurons:2026-10-24')).toBe('400');
	});
	it('既定の閾値は 9,000 Neurons', () => {
		expect(GUARD_NEURONS).toBe(9000);
	});
});

describe('meteredRunner', () => {
	it('呼ぶたびに usage の入力トークンを Neurons に換算して加算する', async () => {
		const kv = memKv();
		const budget = createBudget(kv, () => Date.UTC(2026, 9, 24));
		const runner = vi.fn(async () => out(10_000));
		const metered = meteredRunner(runner, budget);
		await metered(input);
		await metered(input);
		expect(await budget.spent()).toBeCloseTo(clefNeurons(20_000), 5);
	});
	it('枠を使い切っていても止めない（送った言葉は必ず判定する）', async () => {
		const kv = memKv();
		kv.store.set('ai:neurons:2026-10-24', String(GUARD_NEURONS * 2));
		const budget = createBudget(kv, () => Date.UTC(2026, 9, 24));
		const runner = vi.fn(async () => out(1));
		await meteredRunner(runner, budget)(input);
		expect(runner).toHaveBeenCalledTimes(1);
		expect(await budget.exhausted()).toBe(true);
	});
});
