import { describe, expect, it } from 'vitest';
import { formatCount } from './format';

describe('formatCount', () => {
	it('1,000 未満はそのまま、以上は K / M で丸める', () => {
		expect(formatCount(0)).toBe('0');
		expect(formatCount(999)).toBe('999');
		expect(formatCount(1000)).toBe('1K');
		expect(formatCount(1234)).toBe('1.2K');
		expect(formatCount(12345)).toBe('12K');
		expect(formatCount(1_500_000)).toBe('1.5M');
	});
});
