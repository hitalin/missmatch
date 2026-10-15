import { GENRES, type Genre, type Preference, type QuizAnswers } from './types';

export interface QuizOption {
	value: string;
	label: string;
	hint?: string;
}

export interface QuizQuestion {
	id: string;
	title: string;
	options: QuizOption[];
}

export const QUIZ: QuizQuestion[] = [
	{
		id: 'genre',
		title: 'どんな話題を中心に投稿したい？',
		options: [
			{ value: 'general', label: '日常の雑談' },
			{ value: 'creative', label: '創作（絵・文章・音楽）' },
			{ value: 'tech', label: '技術・プログラミング' },
			{ value: 'game', label: 'ゲーム' },
			{ value: 'otaku', label: 'アニメ・推し活' },
			{ value: 'any', label: '特に決めていない' }
		]
	},
	{
		id: 'pace',
		title: 'タイムラインの流れる速さは？',
		options: [
			{ value: 'quiet', label: 'のんびり', hint: '1日100投稿まで' },
			{ value: 'relaxed', label: 'ほどほど', hint: '1日100〜5,000投稿' },
			{ value: 'busy', label: 'にぎやか', hint: '1日5,000投稿以上' },
			{ value: 'any', label: 'こだわらない' }
		]
	},
	{
		id: 'scale',
		title: 'サーバーの規模は？',
		options: [
			{ value: 'small', label: '小さなコミュニティ', hint: '100人まで' },
			{ value: 'medium', label: '中規模', hint: '100〜1,000人' },
			{ value: 'large', label: '大手', hint: '1,000人以上' },
			{ value: 'any', label: 'こだわらない' }
		]
	},
	{
		id: 'tone',
		title: '好きな空気感は？',
		options: [
			{ value: 'warm', label: 'ほのぼの・穏やか' },
			{ value: 'dry', label: 'ドライ・自由', hint: '干渉が少ない' },
			{ value: 'any', label: 'どちらでも' }
		]
	},
	{
		id: 'age',
		title: '年齢を教えてください',
		options: [
			{ value: 'adult', label: '18歳以上' },
			{ value: 'minor', label: '18歳未満' }
		]
	},
	{
		id: 'nsfw',
		title: '成人向けコンテンツについて',
		options: [
			{ value: 'avoid', label: '見たくない' },
			{ value: 'neutral', label: '気にしない' },
			{ value: 'welcome', label: 'むしろ歓迎' }
		]
	},
	{
		id: 'community',
		title: 'コミュニティとの関わり方は？',
		options: [
			{ value: 'easyEntry', label: '気軽に入れる場所がいい', hint: '初心者歓迎・身内ノリ少なめ' },
			{ value: 'deep', label: '濃い関係を築きたい', hint: '身内ノリがあっても良い' }
		]
	}
];

function pick<T extends string>(value: string | undefined, allowed: readonly T[]): T | null {
	return value !== undefined && (allowed as readonly string[]).includes(value)
		? (value as T)
		: null;
}

export function toPreference(answers: QuizAnswers): Preference {
	return {
		genre: pick<Genre>(answers.genre, GENRES),
		pace: pick(answers.pace, ['quiet', 'relaxed', 'busy'] as const),
		scale: pick(answers.scale, ['small', 'medium', 'large'] as const),
		tone: pick(answers.tone, ['warm', 'dry'] as const),
		adult: answers.age === 'adult',
		nsfw: pick(answers.nsfw, ['avoid', 'neutral', 'welcome'] as const) ?? 'avoid',
		community: pick(answers.community, ['easyEntry', 'deep'] as const) ?? 'easyEntry'
	};
}
