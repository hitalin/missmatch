import { paceOf, scaleOf } from './prefs';
import { GENRE_LABELS, GENRES, type Genre, type ServerProfile } from './types';

// スワイプから学習する特徴。すべて 0..1 で、判定できないものは含めない
export type GenreFeature = `genre.${Exclude<Genre, 'niche'>}`;
export const GENRE_FEATURES = GENRES.filter((g) => g !== 'niche').map(
	(g) => `genre.${g}` as GenreFeature
);
export const FEATURES = [
	...GENRE_FEATURES,
	'tone',
	'strictness',
	'community',
	'nsfw',
	'scale',
	'pace',
	'drive',
	'official',
	'gtl',
	'emailFree',
	'adsFree',
	'fresh'
] as const;
export type Feature = (typeof FEATURES)[number];
export type FeatureVector = Partial<Record<Feature, number>>;

// 学習した傾向をチップで見せるときの言葉（up = 1 寄り、down = 0 寄り）
export const FEATURE_LABELS: Record<Feature, { up: string; down: string }> = {
	...(Object.fromEntries(
		GENRE_FEATURES.map((f) => {
			const label = GENRE_LABELS[f.slice('genre.'.length) as Genre];
			return [f, { up: label, down: `${label}は少なめ` }];
		})
	) as Record<GenreFeature, { up: string; down: string }>),
	tone: { up: 'ほのぼの', down: 'ドライ' },
	strictness: { up: 'ルールしっかり', down: 'ルールゆるめ' },
	community: { up: '初心者歓迎', down: '濃い身内' },
	nsfw: { up: 'R-18 寛容', down: 'R-18 少なめ' },
	scale: { up: '大規模', down: '小規模' },
	pace: { up: 'にぎやか', down: 'のんびり' },
	drive: { up: '大容量', down: '小容量' },
	official: { up: '本家', down: 'カスタム版' },
	gtl: { up: 'GTL あり', down: 'GTL なし' },
	emailFree: { up: 'メアド不要', down: 'メアド必須' },
	adsFree: { up: '広告なし', down: '広告あり' },
	fresh: { up: '最新版', down: '更新ゆっくり' }
};

const LEVEL: Record<string, number> = {
	personal: 0,
	small: 1 / 3,
	medium: 2 / 3,
	large: 1,
	quiet: 0,
	relaxed: 0.5,
	busy: 1
};

function driveLevel(mb: number | null): number | undefined {
	if (mb === null || mb <= 0) return undefined;
	const t = (Math.log10(mb) - Math.log10(256)) / (Math.log10(20480) - Math.log10(256));
	return Math.min(1, Math.max(0, t));
}

export function featuresOf(p: ServerProfile): FeatureVector {
	const s = p.server;
	const v = p.vibe;
	const f: FeatureVector = {
		scale: LEVEL[scaleOf(s)],
		pace: LEVEL[paceOf(s)],
		official: s.officialMisskey ? 1 : 0,
		gtl: s.gtlAvailable ? 1 : 0,
		emailFree: s.emailRequired ? 0 : 1,
		adsFree: s.adsEnabled ? 0 : 1
	};
	const drive = driveLevel(s.driveCapacityMb);
	if (drive !== undefined) f.drive = drive;
	if (s.versionMonthsBehind !== null) f.fresh = Math.max(0, 1 - s.versionMonthsBehind / 6);
	if (v) {
		for (const g of GENRES) if (g !== 'niche') f[`genre.${g}`] = v.genre[g];
		// 空気感などは候補の中での順位があればそちらを使う（判定値は似た値に固まりやすい）
		const r = p.rel ?? v;
		f.tone = r.tone;
		f.strictness = r.strictness;
		f.community = (r.newcomerFriendly + (1 - r.closedCommunity)) / 2;
		f.nsfw = v.nsfw;
	}
	return f;
}
