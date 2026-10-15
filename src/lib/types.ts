export type AgeRestriction = 'all' | '13+' | '18+' | 'unknown';

// joinmisskey から正規化したサーバー情報
export interface ServerInfo {
	host: string;
	name: string | null;
	description: string | null;
	iconUrl: string | null;
	bannerUrl: string | null;
	usersCount: number | null;
	dru15: number | null; // Daily Read Users (15日平均)
	npd15: number | null; // Notes Per Day (15日平均)
	softwareName: string;
	softwareVersion: string;
	registrationOpen: boolean;
	approvalRequired: boolean;
	emailRequired: boolean;
	ageRestriction: AgeRestriction; // 登録者の年齢制限（内容の成人向け度は VibeProfile.nsfw）
	ltlAvailable: boolean; // ローカル TL が有効か（無効なら投稿サンプリングしない）
	serverRules: string[];
	langs: string[];
}

// Clef に判定させるジャンル。軸ごとに独立した確率なので、複数が同時に高くてよい
export const GENRES = ['general', 'creative', 'tech', 'game', 'otaku', 'niche'] as const;
export type Genre = (typeof GENRES)[number];

export const GENRE_LABELS: Record<Genre, string> = {
	general: '雑談',
	creative: '創作',
	tech: '技術',
	game: 'ゲーム',
	otaku: 'アニメ・推し活',
	niche: '特定テーマ'
};

// Clef の判定結果（確率はすべて 0..1）
export interface VibeProfile {
	version: number;
	host: string;
	genre: Record<Genre, number>; // 各ジャンルの話題が目立つ確率
	tone: number; // 0 = 殺伐, 1 = ほのぼの
	strictness: number; // 0 = ゆるい, 1 = 厳しめ
	newcomerFriendly: number;
	nsfw: number;
	closedCommunity: number; // 身内ノリの強さ
	sampleCount: number;
	computedAt: string;
}

export type Pace = 'quiet' | 'relaxed' | 'busy';
export type Scale = 'small' | 'medium' | 'large';

// 診断回答から導いたユーザーの希望
export interface Preference {
	genre: Genre | null;
	pace: Pace | null;
	scale: Scale | null;
	tone: 'warm' | 'dry' | null;
	adult: boolean; // 18歳以上か
	nsfw: 'avoid' | 'neutral' | 'welcome';
	community: 'easyEntry' | 'deep';
}

export type QuizAnswers = Record<string, string>;

export interface AxisScore {
	axis: string;
	score: number; // 0..1
	weight: number;
	reason: string | null; // 一致したときの説明
}

export interface Match {
	server: ServerInfo;
	vibe: VibeProfile | null;
	score: number; // 0..100
	axes: AxisScore[];
	reasons: string[];
	tags: string[];
}
