import { describe, expect, it } from 'vitest';
import { hardFilter, paceOf, rankServers, scaleOf, scoreServer } from './match';
import type { Preference, ServerInfo, VibeProfile } from './types';

const mk = (over: Partial<ServerInfo> = {}): ServerInfo => ({
	host: 'a.tld',
	name: 'A',
	description: null,
	iconUrl: null,
	bannerUrl: null,
	usersCount: 500,
	dru15: 50,
	npd15: 1000,
	softwareName: 'misskey',
	softwareVersion: '2025.9.0',
	registrationOpen: true,
	approvalRequired: false,
	emailRequired: false,
	ageRestriction: 'all',
	serverRules: [],
	langs: ['ja'],
	...over
});

const vibe = (over: Partial<VibeProfile> = {}): VibeProfile => ({
	version: 1,
	host: 'a.tld',
	genre: { general: 0.1, creative: 0.8, tech: 0.1, game: 0, otaku: 0, adult: 0, niche: 0 },
	tone: 0.8,
	strictness: 0.5,
	newcomerFriendly: 0.8,
	nsfw: 0.05,
	closedCommunity: 0.2,
	sampleCount: 20,
	computedAt: '2026-10-15T00:00:00Z',
	...over
});

const pref: Preference = {
	genre: 'creative',
	pace: 'relaxed',
	scale: 'medium',
	tone: 'warm',
	registration: 'openOnly',
	adult: false,
	nsfw: 'avoid',
	community: 'easyEntry'
};

describe('paceOf / scaleOf', () => {
	it('npd15 から流速を分類する', () => {
		expect(paceOf(mk({ npd15: 20 }))).toBe('quiet');
		expect(paceOf(mk({ npd15: 1000 }))).toBe('relaxed');
		expect(paceOf(mk({ npd15: 20000 }))).toBe('busy');
	});
	it('usersCount から規模を分類する', () => {
		expect(scaleOf(mk({ usersCount: 50 }))).toBe('small');
		expect(scaleOf(mk({ usersCount: 500 }))).toBe('medium');
		expect(scaleOf(mk({ usersCount: 5000 }))).toBe('large');
	});
});

describe('hardFilter', () => {
	it('日本語・登録可能・年齢条件を満たすものだけ残す', () => {
		const servers = [
			mk({ host: 'ok.tld' }),
			mk({ host: 'en.tld', langs: ['en'] }),
			mk({ host: 'closed.tld', registrationOpen: false }),
			mk({ host: 'approval.tld', registrationOpen: false, approvalRequired: true }),
			mk({ host: 'adult.tld', ageRestriction: '18+' })
		];
		expect(hardFilter(servers, pref).map((s) => s.host)).toEqual(['ok.tld']);
		expect(hardFilter(servers, { ...pref, registration: 'approvalOk' }).map((s) => s.host)).toEqual(
			['ok.tld', 'approval.tld']
		);
		expect(hardFilter(servers, { ...pref, adult: true }).map((s) => s.host)).toEqual([
			'ok.tld',
			'adult.tld'
		]);
	});
});

describe('scoreServer', () => {
	it('希望に合うサーバーは高得点で、理由が付く', () => {
		const m = scoreServer(mk(), vibe(), pref);
		expect(m.score).toBeGreaterThan(80);
		expect(m.reasons.length).toBeGreaterThan(0);
		expect(m.reasons.join(' ')).toContain('創作');
	});

	it('ジャンルが外れると下がる', () => {
		const good = scoreServer(mk(), vibe(), pref).score;
		const bad = scoreServer(
			mk(),
			vibe({
				genre: { general: 0.1, creative: 0, tech: 0.9, game: 0, otaku: 0, adult: 0, niche: 0 }
			}),
			pref
		).score;
		expect(bad).toBeLessThan(good - 15);
	});

	it('成人向けを避けたい人には nsfw 高めのサーバーが強く減点される', () => {
		const good = scoreServer(mk(), vibe(), pref).score;
		const bad = scoreServer(mk(), vibe({ nsfw: 0.9 }), pref).score;
		expect(bad).toBeLessThan(good - 20);
	});

	it('vibe がなくても静的項目だけで採点できる', () => {
		const m = scoreServer(mk(), null, pref);
		expect(m.score).toBeGreaterThan(0);
		expect(m.vibe).toBeNull();
	});

	it('こだわらない軸は採点に含めない', () => {
		const anyPref: Preference = { ...pref, genre: null, pace: null, scale: null, tone: null };
		const a = scoreServer(mk({ npd15: 10, usersCount: 10 }), vibe(), anyPref).score;
		const b = scoreServer(mk({ npd15: 50000, usersCount: 50000 }), vibe(), anyPref).score;
		expect(a).toBe(b);
	});
});

describe('rankServers', () => {
	it('スコア降順で上位 N 件を返す', () => {
		const items = [
			{ server: mk({ host: 'x.tld' }), vibe: vibe({ nsfw: 0.9 }) },
			{ server: mk({ host: 'y.tld' }), vibe: vibe() },
			{ server: mk({ host: 'z.tld' }), vibe: null }
		];
		const ranked = rankServers(items, pref, 2);
		expect(ranked).toHaveLength(2);
		expect(ranked[0].server.host).toBe('y.tld');
	});
});
