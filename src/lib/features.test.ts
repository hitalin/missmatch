import { describe, expect, it } from 'vitest';
import { featuresOf } from './features';
import { mk } from './fixtures.test-helper';

describe('featuresOf', () => {
	it('静的属性と雰囲気を 0..1 の特徴にし、判定できないものは含めない', () => {
		const f = featuresOf(
			mk({ dru15: 5000, npd15: 10, driveCapacityMb: 20480, emailRequired: false })
		);
		expect(f.scale).toBe(1);
		expect(f.pace).toBe(0);
		expect(f.drive).toBe(1);
		expect(f.emailFree).toBe(1);
		expect(f['genre.illust']).toBe(0.8);
		expect(f.community).toBeCloseTo(0.8);
		const blind = featuresOf(mk({ driveCapacityMb: null, versionMonthsBehind: null }, null));
		expect(blind.drive).toBeUndefined();
		expect(blind.fresh).toBeUndefined();
		expect(blind.tone).toBeUndefined();
	});
});
