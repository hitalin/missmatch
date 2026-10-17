// open: 誰でも登録できる / approval: 申請して承認 / invite: 既存ユーザーの招待が要る / closed: 新規登録停止中
export type Registration = 'open' | 'approval' | 'invite' | 'closed';
export const REGISTRATION_LABELS: Record<Registration, string> = {
	open: '登録受付中',
	approval: '承認制',
	invite: '招待制',
	closed: '登録停止中'
};

// joinmisskey から正規化したサーバー情報
export interface ServerInfo {
	host: string;
	name: string | null;
	description: string | null;
	iconUrl: string | null; // joinmisskey の軽量アイコン（無ければサーバー自身のもの）
	bannerUrl: string | null; // joinmisskey の軽量バナー（無ければ背景画像）
	themeColor: string | null; // サーバーのテーマ色。画像が無いときのカード背景に使う
	usersCount: number | null;
	dru15: number | null; // Daily Read Users (15日平均)
	npd15: number | null; // Notes Per Day (15日平均)
	softwareName: string;
	softwareVersion: string;
	versionMonthsBehind: number | null; // 最新安定版から何ヶ月遅れているか（CalVer から算出、不明なら null）
	officialMisskey: boolean; // 本家 misskey-dev/misskey を動かしているか（false ならフォーク）
	registration: Registration;
	emailRequired: boolean;
	minAge: number | null; // 登録できる下限年齢（説明文・ルールから推定。書いていなければ null。内容の成人向け度は VibeProfile.nsfw）
	ltlAvailable: boolean; // ローカル TL が有効か（無効なら投稿サンプリングしない）
	gtlAvailable: boolean; // グローバル TL が有効か
	driveCapacityMb: number | null; // 一般ユーザーのドライブ容量
	adsEnabled: boolean; // 広告が表示されるか
	noteSearchableScope: 'global' | 'local' | null; // 投稿がどこから検索されうるか
	noteSearch: boolean; // 一般ユーザーがノートを検索できる
	translator: boolean; // 翻訳機能が有効で、一般ユーザーも使える
	chat: boolean; // チャットが使える
	videoUpload: boolean; // 動画をアップロードできる
	hasTos: boolean; // 利用規約の URL がある
	hasPrivacyPolicy: boolean; // プライバシーポリシーの URL がある
	serverRules: string[];
	langs: string[];
}

// Clef に判定させるジャンル。軸ごとに独立した確率なので、複数が同時に高くてよい。
// 区分は登録可能な日本語サーバー 97 件の説明文に実在するコンセプトから選んでいる（docs/REQUIREMENTS.md F3）
export const GENRES = [
	'general',
	'diary',
	'illust',
	'writing',
	'music',
	'making',
	'tech',
	'game',
	'anime',
	'fandom',
	'vr',
	'food',
	'animal',
	'vent',
	'niche'
] as const;
export type Genre = (typeof GENRES)[number];

export const GENRE_LABELS: Record<Genre, string> = {
	general: '雑談',
	diary: '日記・ひとりごと',
	illust: 'イラスト・漫画を描く',
	writing: '小説・文章',
	music: '音楽・歌',
	making: 'ものづくり・制作',
	tech: '技術・IT',
	game: 'ゲーム',
	anime: 'アニメ・漫画',
	fandom: '推し活・ファン',
	vr: 'VRChat・メタバース',
	food: '食べ物・お酒',
	animal: '動物・ペット',
	vent: '愚痴・弱音',
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

// 診断の対象となる 1 サーバー分の属性表（静的情報 + 雰囲気）
// 空気感などを候補の中での順位（0..1）にしたもの。Clef の判定値は似た値に固まりやすいので、採点はこちらを使う
export interface RelativeVibe {
	tone: number;
	strictness: number;
	newcomerFriendly: number;
	closedCommunity: number;
}

export interface ServerProfile {
	server: ServerInfo;
	vibe: VibeProfile | null;
	rel?: RelativeVibe; // クライアントで withRelativeVibes が付ける
	affinity?: number; // ユーザーの自由記述とこのサーバーが噛み合う確率（Clef、診断ごとに付く）
}

// 質問 id → 選択した選択肢の value
export type Answers = Record<string, string>;

export interface Match {
	server: ServerInfo;
	vibe: VibeProfile | null;
	score: number; // 0..100
	affinity?: number; // 検索の言葉との噛み合い確率（言葉があるときだけ）
	reasons: string[];
	tags: string[];
}
