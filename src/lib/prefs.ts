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
	personal: '〜9人',
	small: '10〜99人',
	medium: '100〜999人',
	large: '1,000人〜'
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
	registrations: Registration[]; // 出す登録状態。招待制・停止中を含めると候補が約 100 → 約 580 件に広がる
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
		nsfw: 'avoid',
		registrations: ['open', 'approval'],
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

// 10 人未満は管理者と知り合いだけの個人サーバーとみなす（説明文に「個人サーバー」とある鯖はほぼ 5 人以下）
export function scaleOf(s: ServerInfo): Scale {
	const n = s.usersCount ?? 0;
	return n < 10 ? 'personal' : n < 100 ? 'small' : n < 1000 ? 'medium' : 'large';
}

// 招待制・停止中のサーバーまで含める設定か（属性表を全件取りに行く必要がある）
export function needsAllServers(prefs: Preferences): boolean {
	return prefs.registrations.includes('invite') || prefs.registrations.includes('closed');
}
export function paceOf(s: ServerInfo): Pace {
	const n = s.npd15 ?? 0;
	return n < 100 ? 'quiet' : n < 5000 ? 'relaxed' : 'busy';
}

// デッキを出すのに最低限必要な設定が済んでいるか
export function isComplete(prefs: Preferences): boolean {
	return prefs.age !== null;
}
