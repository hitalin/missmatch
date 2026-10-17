import { GENRE_LABELS, GENRES, type Genre, type Registration, type ServerInfo } from './types';

// 「発見の設定」: マッチングアプリの Discovery settings。1 タップで決まる項目だけを置く
export type Scale = 'personal' | 'small' | 'medium' | 'large';
export type Pace = 'quiet' | 'relaxed' | 'busy';
export const SCALES: Scale[] = ['personal', 'small', 'medium', 'large'];
export const PACES: Pace[] = ['quiet', 'relaxed', 'busy'];
export const SCALE_LABELS: Record<Scale, string> = {
	personal: '個人',
	small: '小規模',
	medium: '中規模',
	large: '大手'
};
export const SCALE_HINTS: Record<Scale, string> = {
	personal: '毎日 〜2人',
	small: '毎日 3〜29人',
	medium: '毎日 30〜299人',
	large: '毎日 300人〜'
};
export const REGISTRATIONS: Registration[] = ['open', 'approval', 'invite', 'closed'];
export const REGISTRATION_HINTS: Record<Registration, string> = {
	open: 'すぐ使える',
	approval: '申請して承認待ち',
	invite: '既存ユーザーの招待が要る',
	closed: '今は新規登録できない'
};
export const PACE_LABELS: Record<Pace, string> = {
	quiet: 'のんびり',
	relaxed: 'ほどほど',
	busy: 'にぎやか'
};
export const PACE_HINTS: Record<Pace, string> = {
	quiet: '〜100投稿/日',
	relaxed: '100〜5,000',
	busy: '5,000〜'
};

// 話したいこと: 雰囲気判定のジャンルから「特定テーマ」を除いたもの
export type Topic = Exclude<Genre, 'niche'>;
export const TOPICS = GENRES.filter((g): g is Topic => g !== 'niche');
export const TOPIC_LABELS: Record<Topic, string> = GENRE_LABELS;

export type Lean = 'left' | 'any' | 'right';

// 絶対条件（Hinge の Dealbreaker）。true のものはハードフィルターになる
export interface Dealbreakers {
	emailFree: boolean; // メールアドレスなしで登録できる
	adsFree: boolean; // 広告なし
	gtl: boolean; // グローバル TL がある
	official: boolean; // 本家 Misskey のみ
	fresh: boolean; // 最新版に追従（1 ヶ月以内）
	ltl: boolean; // ローカル TL がある
	noteSearch: boolean; // ノートを検索できる
	translator: boolean; // 翻訳機能が使える
	chat: boolean; // チャットが使える
	videoUpload: boolean; // 動画を上げられる
	bigDrive: boolean; // ドライブ 10GB 以上
	tos: boolean; // 利用規約がある
	privacyPolicy: boolean; // プライバシーポリシーがある
}
// 「大容量ドライブ」の閾値（登録受付中の日本語サーバーの上位 15% ほど）
export const BIG_DRIVE_MB = 10 * 1024;
export const DEALBREAKER_LABELS: Record<keyof Dealbreakers, string> = {
	emailFree: 'メールアドレスなしで登録できる',
	adsFree: '広告が出ない',
	gtl: 'グローバル TL がある',
	official: '本家 Misskey のみ（カスタム版を除く）',
	fresh: '最新版に追従している',
	ltl: 'ローカル TL がある',
	noteSearch: 'ノートを検索できる',
	translator: '翻訳機能が使える',
	chat: 'チャットが使える',
	videoUpload: '動画をアップロードできる',
	bigDrive: 'ドライブが 10GB 以上',
	tos: '利用規約がある',
	privacyPolicy: 'プライバシーポリシーがある'
};

// 年齢区分。登録年齢を制限しているサーバーの絞り込みに使う
export type Age = 'adult' | 'minor' | 'child';
export const AGES: Age[] = ['adult', 'minor', 'child'];
export const AGE_LABELS: Record<Age, string> = {
	adult: '18 歳以上',
	minor: '12〜17 歳',
	child: '12 歳未満'
};

// 毎日いる人の数（dru15: 15 日平均で 1 日に読んでいる人）。過疎を避けたいときに使う
export type Activity = 'any' | 'some' | 'lively';
export const ACTIVITIES: Activity[] = ['any', 'some', 'lively'];
export const ACTIVITY_LABELS: Record<Activity, string> = {
	any: '気にしない',
	some: '10 人以上',
	lively: '100 人以上'
};
const ACTIVITY_MIN: Record<Activity, number> = { any: 0, some: 10, lively: 100 };
export function meetsActivity(s: ServerInfo, a: Activity): boolean {
	return (s.dru15 ?? 0) >= ACTIVITY_MIN[a];
}

export interface Preferences {
	age: Age | null; // null = 未設定（オンボーディングで必ず決める）
	activity: Activity;
	nsfw: 'avoid' | 'neutral' | 'welcome';
	registrations: Registration[]; // 出す登録状態。既定は招待制まで（約 185 件）。停止中を含めると約 580 件に広がる
	scales: Scale[]; // 空 = 指定なし
	paces: Pace[];
	dealbreakers: Dealbreakers;
	topics: Topic[]; // 選んだ話題のどれかが多ければ加点（絞り込みではない）
	tone: Lean; // left = ドライ・自由, right = ほのぼの・穏やか
	community: Lean; // left = 濃い身内, right = 初心者歓迎
	rules: Lean; // left = ゆるめ, right = しっかり
}

export function defaultPreferences(): Preferences {
	return {
		age: null,
		activity: 'any',
		nsfw: 'neutral',
		registrations: ['open', 'approval', 'invite'],
		scales: [],
		paces: [],
		dealbreakers: {
			emailFree: false,
			adsFree: false,
			gtl: false,
			official: false,
			fresh: false,
			ltl: false,
			noteSearch: false,
			translator: false,
			chat: false,
			videoUpload: false,
			bigDrive: false,
			tos: false,
			privacyPolicy: false
		},
		topics: [],
		tone: 'any',
		community: 'any',
		rules: 'any'
	};
}

// 規模は登録者数でなく 1 日に読んでいる人数（dru15）で決める。登録者数は離れた人を含んで膨らみ、
// 登録 1,142 人で毎日 8 人の鯖が「大手」になっていた。閾値は登録受付中 95 件の分布から
// （毎日 3 人未満 20 / 30 人未満 36 / 300 人未満 26 / それ以上 13。登録者数だと「個人」は 1 件だけだった）
export function scaleOf(s: ServerInfo): Scale {
	const n = s.dru15 ?? 0;
	return n < 3 ? 'personal' : n < 30 ? 'small' : n < 300 ? 'medium' : 'large';
}

// 属性表と噛み合い判定をどこまで取りに行くか。open: 登録受付中（約 95 件）/ invite: 生きている招待制まで（約 185 件）/
// all: 生きている停止中まで（約 580 件）。広いほど Clef の判定が増えて遅く・高くなるので、設定が要るぶんだけ取る
export type Scope = 'open' | 'invite' | 'all';
export const SCOPE_ORDER: Scope[] = ['open', 'invite', 'all'];
export function scopeFor(prefs: Preferences): Scope {
	if (prefs.registrations.includes('closed')) return 'all';
	if (prefs.registrations.includes('invite')) return 'invite';
	return 'open';
}
export function paceOf(s: ServerInfo): Pace {
	const n = s.npd15 ?? 0;
	return n < 100 ? 'quiet' : n < 5000 ? 'relaxed' : 'busy';
}

// デッキを出すのに最低限必要な設定が済んでいるか
export function isComplete(prefs: Preferences): boolean {
	return prefs.age !== null;
}
