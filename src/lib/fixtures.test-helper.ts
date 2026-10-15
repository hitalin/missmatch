import type { ServerInfo, ServerProfile, VibeProfile } from './types';

// テスト用のサーバーと雰囲気の雛形
export const mkServer = (over: Partial<ServerInfo> = {}): ServerInfo => ({
	host: 'a.tld',
	name: 'A',
	description: null,
	iconUrl: null,
	bannerUrl: null,
	themeColor: null,
	usersCount: 500,
	dru15: 50,
	npd15: 1000,
	softwareName: 'misskey',
	softwareVersion: '2026.10.0',
	versionMonthsBehind: 0,
	officialMisskey: true,
	registration: 'open',
	emailRequired: true,
	ageRestriction: 'all',
	ltlAvailable: true,
	gtlAvailable: true,
	driveCapacityMb: 1024,
	adsEnabled: false,
	noteSearchableScope: 'global',
	serverRules: [],
	langs: ['ja'],
	...over
});

export const mkVibe = (over: Partial<VibeProfile> = {}): VibeProfile => ({
	version: 3,
	host: 'a.tld',
	genre: {
		general: 0.1,
		diary: 0,
		illust: 0.8,
		writing: 0,
		music: 0,
		making: 0,
		tech: 0.1,
		game: 0,
		anime: 0,
		fandom: 0,
		vr: 0,
		food: 0,
		animal: 0,
		vent: 0,
		niche: 0
	},
	tone: 0.8,
	strictness: 0.5,
	newcomerFriendly: 0.8,
	nsfw: 0.05,
	closedCommunity: 0.2,
	sampleCount: 20,
	computedAt: '2026-10-15T00:00:00Z',
	...over
});

export const mk = (
	server: Partial<ServerInfo> = {},
	vibe: Partial<VibeProfile> | null = {}
): ServerProfile => ({
	server: mkServer(server),
	vibe: vibe === null ? null : mkVibe(vibe)
});
