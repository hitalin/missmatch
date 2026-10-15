// 人数や投稿数を短く（misspace と同じ K / M 表記）。10K 以上は小数を出さない
export function formatCount(n: number): string {
	const short = (v: number, unit: string) =>
		`${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10}${unit}`;
	if (n >= 1_000_000) return short(n / 1_000_000, 'M');
	if (n >= 1000) return short(n / 1000, 'K');
	return String(Math.round(n));
}
