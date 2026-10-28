import { describe, expect, it } from 'vitest';
import {
	buildPeopleAffinityRequests,
	type PersonState,
	parsePeopleAffinity
} from './people-intent';
import type { ClefAnswer } from './vibe';

const person = (acct: string): PersonState => ({
	acct,
	name: acct,
	description: 'ジャズと料理',
	pinned: [],
	chips: ['food'],
	topics: { food: 0.9, music: 0.6 }
});

describe('buildPeopleAffinityRequests', () => {
	it('16 人ずつのバッチに分け、最初のバッチに拒否の設問を 1 本足す', () => {
		const people = Array.from({ length: 20 }, (_, i) => person(`u${i}@x`));
		const reqs = buildPeopleAffinityRequests(['ジャズの話がしたい'], people);
		expect(reqs).toHaveLength(2);
		expect(Object.keys(reqs[0].questions)).toContain('refuse');
		expect(Object.keys(reqs[0].questions).filter((k) => k.startsWith('fit.'))).toHaveLength(16);
		expect(Object.keys(reqs[1].questions)).not.toContain('refuse');
		const state = reqs[0].state as { people: { acct: string; topics: string[] }[] };
		expect(state.people[0].topics).toEqual(['食べ物・お酒 90%', '音楽・歌 60%']);
	});
});

describe('parsePeopleAffinity', () => {
	it('噛み合いの確率と、拒否の判定を取り出す', () => {
		const noul = (v: number): ClefAnswer => ({ type: 'noul', noul: v });
		const out = parsePeopleAffinity(
			[
				{ answers: { refuse: noul(0.1), 'fit.a@x': noul(0.8) } },
				{ answers: { 'fit.b@x': noul(0.3) } }
			],
			['a@x', 'b@x']
		);
		expect(out).toEqual({ refused: false, affinity: { 'a@x': 0.8, 'b@x': 0.3 } });
		expect(parsePeopleAffinity([{ answers: { refuse: noul(0.9) } }], []).refused).toBe(true);
	});
});
