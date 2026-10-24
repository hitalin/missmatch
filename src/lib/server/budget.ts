import type { ClefRunner, VibeKv } from '$lib/vibe';

// Workers AI の無料枠（1 日 10,000 Neurons、00:00 UTC にリセット）に収めるための予算。
// Clef は入力 100 万トークンあたり 21,818 Neurons で、出力は無料。使った分を KV の日付鍵に足す。
// 利用者が送った言葉は枠に関係なく必ず判定する（結果を劣化させない）。枠を守るのは裏側の仕事だけ:
// 先読み（入力が止まるたびの投機的な判定）は半分を超えたら止め、cron の温めと雰囲気の欠け埋めは
// 閾値で止めて翌日に回す。並行するリクエスト同士の加算は取りこぼすことがあるので、閾値は上限より下に置く
export const DAILY_FREE_NEURONS = 10_000;
export const GUARD_NEURONS = 9_000; // 温めと欠け埋めを止める
export const PREFETCH_NEURONS = 5_000; // 先読みを止める（残りは送った言葉のために取っておく）
export const CLEF_NEURONS_PER_MILLION_TOKENS = 21_818;
const KEEP_SECONDS = 60 * 60 * 48;

export const neuronsKey = (now: number) => `ai:neurons:${new Date(now).toISOString().slice(0, 10)}`;
export const clefNeurons = (inputTokens: number) =>
	(inputTokens * CLEF_NEURONS_PER_MILLION_TOKENS) / 1_000_000;

export interface Budget {
	spent(): Promise<number>; // 今日ここまでに使った Neurons（KV の分 + このリクエストの分）
	exhausted(): Promise<boolean>; // 裏側の仕事を止める閾値を超えた
	charge(neurons: number): void;
	flush(): Promise<void>; // このリクエストの分を KV に足す。応答後（waitUntil）に呼ぶ
}

export function createBudget(
	kv: Pick<VibeKv, 'get' | 'put'>,
	now: () => number = Date.now,
	limit = GUARD_NEURONS
): Budget {
	const key = neuronsKey(now());
	let base: Promise<number> | null = null; // KV の今日の分。リクエスト内で 1 回だけ読む
	let pending = 0;
	const read = () => {
		base ??= kv.get(key).then((v) => Number(v) || 0);
		return base;
	};
	return {
		spent: async () => (await read()) + pending,
		exhausted: async () => (await read()) + pending >= limit,
		charge: (neurons) => {
			pending += neurons;
		},
		flush: async () => {
			if (pending <= 0) return;
			const add = pending;
			pending = 0;
			// 置く直前に読み直し、他のリクエストが足した分を上書きしない
			const current = Number(await kv.get(key)) || 0;
			const total = current + add;
			base = Promise.resolve(total);
			await kv.put(key, String(total), { expirationTtl: KEEP_SECONDS });
		}
	};
}

// Clef の呼び出しに使用量の記録を付ける。止めはしない（止める判断は呼ぶ側が budget.exhausted() で行う）
export function meteredRunner(runner: ClefRunner, budget: Budget): ClefRunner {
	return async (input) => {
		const output = await runner(input);
		budget.charge(clefNeurons(output.usage?.input_tokens ?? 0));
		return output;
	};
}
