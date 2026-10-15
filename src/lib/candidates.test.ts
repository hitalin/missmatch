import { describe, expect, it } from 'vitest';
import { selectCandidates } from './candidates';
import type { ServerInfo } from './types';

const mk = (host: string, dru15: number): ServerInfo => ({
	host,
	name: null,
	description: null,
	iconUrl: null,
	bannerUrl: null,
	usersCount: 0,
	dru15,
	npd15: 0,
	softwareName: 'misskey',
	softwareVersion: '',
	registrationOpen: true,
	approvalRequired: false,
	emailRequired: false,
	ageRestriction: 'unknown',
	serverRules: [],
	langs: ['ja']
});

describe('selectCandidates', () => {
	const servers = [mk('a', 5), mk('b', 50), mk('c', 500), mk('d', 1), mk('e', 100)];

	it('判定済みは全部、未判定は活発な順に上限まで含める', () => {
		const picked = selectCandidates(servers, new Set(['a', 'd']), 2).map((s) => s.host);
		expect(picked).toEqual(['c', 'e', 'a', 'd']);
	});

	it('判定済みが無ければ活発な順に上限件数だけ', () => {
		expect(selectCandidates(servers, new Set(), 3).map((s) => s.host)).toEqual(['c', 'e', 'b']);
	});
});
