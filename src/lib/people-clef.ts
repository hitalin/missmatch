import type { Genre } from './types';
import { GENRES } from './types';
import type { ClefAnswer, ClefInput, ClefQuestion } from './vibe';

// 参加者本人の公開ノート・bio・固定ノートを Clef に 1 回読ませ、話題の確率と、
// 募集・勧誘の表明（bio と各ノート）・宣伝・未成年の記述を同じ呼び出しで判定する。
// 空気と会話の型は推定しない（並びに使わないものは計算しない。docs/PEOPLE.md §3）

// サーバー向けの設問（vibe.ts）は「サーバーか」と問うものがあるので、人向けに言い換える
const PERSON_GENRE_QUESTIONS: Record<Genre, string> = {
	general: '日常の雑談が投稿の中心を占めているか',
	diary: '交流よりも、日記やひとりごとのように自分の記録として書く投稿が中心か',
	illust: 'イラストや漫画を描く、または絵の話題が目立つか',
	writing: '小説・詩・文章を書く創作（文芸）の話題が目立つか',
	music: '音楽（演奏・作曲・DTM・合成音声・歌）の話題が目立つか',
	making: 'ものづくりや制作（3DCG・ゲーム制作・電子工作・ロボット・ハンドメイド）の話題が目立つか',
	tech: 'プログラミングや IT・技術の話題が目立つか',
	game: 'ゲーム（ビデオゲーム・TRPG・ボードゲーム）の話題が目立つか',
	anime: 'アニメ・漫画作品の感想や実況が目立つか',
	fandom: '特定の作品・アイドル・VTuber・声優・アーティストなど「推し」の話題が目立つか',
	vr: 'VRChat・Resonite などの VR・メタバースの話題が目立つか',
	food: '食べ物・料理・お酒の話題が目立つか',
	animal: '犬や猫などの動物・ペットの話題が目立つか',
	vent: '愚痴・弱音・心身の不調など、心の内を吐き出す投稿が目立つか',
	niche: '地域・職業・特定の趣味など、限られたテーマの話題が中心か'
};

// 止めるのは「募集・勧誘の表明」だけ。恋人・家族・失恋の話題は対象外（docs/PEOPLE.md §2）
const SEEKING =
	'恋人・出会い・性的関係・容姿の条件を付けて相手を募集・勧誘する表明があるか。恋人や家族の話題、失恋の話は含まない';
const SEEKING_CRITERIA = {
	true: '「彼女募集」「出会いたい」「寝落ち通話できる人」「年上希望」のように、交際や性的関係の相手を求めている',
	false: '相手を求めていない。恋人や家族について語っている、失恋の愚痴、趣味の仲間募集は該当しない'
};

const MAX_NOTE_QUESTIONS = 50; // Clef は 1 リクエスト 64 問まで。ノート 50 + bio + 話題 15 + 宣伝 + 未成年 < 64 にはならないので、ノートは 45 本に切る
const NOTE_QUESTION_LIMIT = 64 - GENRES.length - 3; // 46

export interface MemberInput {
	name: string;
	description: string;
	fields: { name: string; value: string }[];
	pinned: string[];
	notes: { id: string; text: string }[];
}

export function buildMemberRequest(input: MemberInput): ClefInput {
	const notes = input.notes.slice(0, Math.min(MAX_NOTE_QUESTIONS, NOTE_QUESTION_LIMIT));
	const questions: Record<string, ClefQuestion> = {};
	for (const g of GENRES) {
		questions[`genre.${g}`] = {
			type: 'noul',
			instructions: `この人の投稿について: ${PERSON_GENRE_QUESTIONS[g]}`
		};
	}
	questions['seeking.bio'] = {
		type: 'noul',
		instructions: `自己紹介（description・fields・固定ノート）に ${SEEKING}`,
		criteria: SEEKING_CRITERIA
	};
	for (const n of notes) {
		questions[`seeking.${n.id}`] = {
			type: 'noul',
			instructions: `notes のうち id が ${n.id} のノートに ${SEEKING}`,
			criteria: SEEKING_CRITERIA
		};
	}
	questions.ads = {
		type: 'noul',
		instructions:
			'商品・サービスの価格や購入、有料の入会、別サーバーへの移住を呼びかける宣伝・勧誘が投稿の中心か'
	};
	questions.minor = {
		type: 'noul',
		instructions: '学年・年齢・保護者・部活・学校など、本人が 18 歳未満であることを示す記述があるか'
	};
	return {
		model: 'clef',
		state: {
			name: input.name,
			description: input.description,
			fields: input.fields,
			pinnedNotes: input.pinned,
			notes,
			note: 'この人（Misskey のユーザー 1 人）のプロフィールと公開ノート。notes は新しい順'
		},
		questions
	};
}

export interface MemberAnswers {
	genre: Record<Genre, number>;
	seekingBio: boolean;
	seekingNotes: string[]; // 募集の表明と判定したノートの id
	ads: number;
	minor: number;
}

const THRESHOLD = 0.7;
const noul = (a: ClefAnswer | undefined) => (a?.type === 'noul' ? a.noul : 0);

export function parseMemberAnswers(
	answers: Record<string, ClefAnswer>,
	noteIds: string[]
): MemberAnswers {
	const genre = Object.fromEntries(GENRES.map((g) => [g, noul(answers[`genre.${g}`])])) as Record<
		Genre,
		number
	>;
	return {
		genre,
		seekingBio: noul(answers['seeking.bio']) >= THRESHOLD,
		seekingNotes: noteIds.filter((id) => noul(answers[`seeking.${id}`]) >= THRESHOLD),
		ads: noul(answers.ads),
		minor: noul(answers.minor)
	};
}

export type Judgement =
	| { verdict: 'ok' }
	| { verdict: 'warn'; noteIds: string[] } // 募集の表明がノート 1 件。本人に該当ノートを見せる
	| { verdict: 'reject'; kind: 'seeking' | 'ads' | 'minor'; noteIds: string[] };

// bio・固定ノートは 1 件で止め、ノートは 2 件以上で止める（docs/PEOPLE.md §2）。
// 未成年の記述は理由を細かく出さない（noteIds を返さない）
export function judgeMember(a: MemberAnswers): Judgement {
	if (a.minor >= THRESHOLD) return { verdict: 'reject', kind: 'minor', noteIds: [] };
	if (a.seekingBio || a.seekingNotes.length >= 2) {
		return { verdict: 'reject', kind: 'seeking', noteIds: a.seekingNotes };
	}
	if (a.ads >= THRESHOLD) return { verdict: 'reject', kind: 'ads', noteIds: [] };
	if (a.seekingNotes.length === 1) return { verdict: 'warn', noteIds: a.seekingNotes };
	return { verdict: 'ok' };
}
