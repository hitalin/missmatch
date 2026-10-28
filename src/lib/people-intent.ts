import { AFFINITY_BATCH, userState } from './intent';
import type { Member } from './people';
import { GENRE_LABELS, GENRES, type Genre } from './types';
import type { ClefAnswer, ClefInput, ClefQuestion } from './vibe';

// 言葉で人を絞る（docs/PEOPLE.md §4）。2 段構え:
//   1. 言葉を Clef に 1 回読ませて「望む話題・会話の型・夜型・投稿量」の希望にし（言葉ごとに 7 日キャッシュ）、
//      参加者全員を推定した数値と突き合わせて採点する（参加者数に依存せず、Neurons を使わない）
//   2. 上位 48 人だけ、プロフィール + 推定を state にして噛み合いを Clef に聞く（3 バッチ）
// state にノート本文は渡さない

export interface PersonState {
	acct: string;
	name: string;
	description: string;
	pinned: string[];
	chips: Genre[];
	topics: Partial<Record<Genre, number>>; // 推定した話題の確率
	replyRatio?: number;
	notesPerDay?: number;
	nightRatio?: number;
}

const TOPIC_MIN = 0.5;
const REFUSE_THRESHOLD = 0.7;

// 数値を言葉にして渡す（Clef は数値の大小を読み取りにくいので、意味の付いた短い語にする）
function styleOf(p: PersonState): string {
	const parts: string[] = [];
	if (p.replyRatio !== undefined)
		parts.push(
			p.replyRatio >= 0.4
				? '返信が多く、会話中心'
				: p.replyRatio >= 0.15
					? '返信もひとりごともある'
					: '返信は少なく、ひとりごと中心'
		);
	if (p.notesPerDay !== undefined)
		parts.push(
			p.notesPerDay >= 5 ? '毎日たくさん投稿' : p.notesPerDay >= 1 ? '毎日投稿' : '投稿は少なめ'
		);
	if (p.nightRatio !== undefined && p.nightRatio >= 0.3) parts.push('深夜によく投稿（夜型）');
	return parts.join('、');
}

function stateOf(p: PersonState) {
	const topics = GENRES.filter((g) => (p.topics[g] ?? 0) >= TOPIC_MIN)
		.sort((a, b) => (p.topics[b] ?? 0) - (p.topics[a] ?? 0))
		.map((g) => `${GENRE_LABELS[g]} ${Math.round((p.topics[g] ?? 0) * 100)}%`);
	return {
		acct: p.acct,
		name: p.name,
		description: p.description.slice(0, 300),
		pinnedNotes: p.pinned.slice(0, 2),
		selfDeclaredTopics: p.chips.map((c) => GENRE_LABELS[c]),
		topics,
		style: styleOf(p)
	};
}

// ---- 1. 言葉 → 希望

export type Style = 'talk' | 'read' | 'any';
export type Pace = 'active' | 'calm' | 'any';
export interface PeopleIntent {
	want: Partial<Record<Genre, number>>; // 望む話題の確率
	style: Style; // 会話したい / 投稿を読みたい / どちらでも
	night: number; // 深夜・夜型の相手を望む確率
	pace: Pace; // よく投稿する人 / 静かな人 / どちらでも
	refused: boolean; // 恋愛・性的・容姿・性別・年齢・精神状態・居住地を軸にしている
}

const REFUSE_QUESTION: ClefQuestion = {
	// 恋愛・性的・容姿・性別・年齢・精神状態・居住地を軸にした探し方は受けない（運営方針の証跡）
	type: 'noul',
	instructions:
		'userMessages は、恋愛・性的な関係・容姿・性別・年齢・精神状態・居住地のいずれかを軸にして人を探しているか',
	criteria: {
		true: '「彼女になってくれる人」「可愛い子」「年下の女性」「病んでる人」「東京の人」のように、それらを条件にしている',
		false: '話題・趣味・活動・話し方など、それ以外を手がかりにしている'
	}
};

// 雑談と「限られたテーマ」は他の話題に付いて回りやすいので、望んでいるときだけ真にする基準を付ける
const WANT_CRITERIA: Partial<Record<Genre, { true: string; false: string }>> = {
	general: {
		true: '雑談やおしゃべりそのものを望んでいる（「ゆるく雑談」「たわいない話」「おしゃべりできる人」）',
		false: '特定の話題（音楽・ゲーム・技術など）を挙げているだけで、雑談そのものは求めていない'
	},
	niche: {
		true: '地域・職業・特定の狭い趣味など、限られたテーマを名指ししている',
		false: '一般的な趣味や話題を挙げているだけ'
	}
};

export function buildPeopleIntentRequest(turns: string[]): ClefInput {
	const questions: Record<string, ClefQuestion> = {};
	for (const g of GENRES) {
		questions[`want.${g}`] = {
			type: 'noul',
			instructions: `ユーザーは「${GENRE_LABELS[g]}」の話ができる相手を望んでいるか`,
			criteria: WANT_CRITERIA[g] ?? {
				true: 'その話題を明示している、または望む相手像から自然にその話題が導ける',
				false: 'その話題に触れていない、または避けている'
			}
		};
	}
	questions.style = {
		type: 'choice',
		instructions: 'ユーザーは相手とどう関わりたいか',
		criteria: {
			talk: '返信やリプライで会話のやり取りをしたい（「話せる人」「雑談できる」「語り合いたい」）',
			read: '相手の投稿を読みたい・見せ合いたい（「見せ合いたい」「読み合いたい」「進捗を追いたい」）',
			any: '関わり方の希望は読み取れない'
		}
	};
	questions.night = {
		type: 'noul',
		instructions: 'ユーザーは深夜に活動している相手（夜型）を望んでいるか',
		criteria: {
			true: '「深夜」「夜中」「夜更かし」など夜の時間帯を挙げている',
			false: '時間帯に触れていない'
		}
	};
	questions.pace = {
		type: 'choice',
		instructions: 'ユーザーは相手の投稿量についてどう望んでいるか',
		criteria: {
			active: 'よく投稿する、にぎやかな人がいい',
			calm: '投稿が少なめ、静かな人がいい',
			any: '投稿量の希望は読み取れない'
		}
	};
	questions.refuse = REFUSE_QUESTION;
	return { model: 'clef', state: userState(turns), questions };
}

const noulOf = (a: ClefAnswer | undefined) => (a?.type === 'noul' ? a.noul : 0);
function choiceOf<T extends string>(
	a: ClefAnswer | undefined,
	allowed: readonly T[],
	fallback: T
): T {
	if (a?.type !== 'choice') return fallback;
	return (allowed as readonly string[]).includes(a.choice) ? (a.choice as T) : fallback;
}

export function parsePeopleIntent(answers: Record<string, ClefAnswer>): PeopleIntent {
	const want: Partial<Record<Genre, number>> = {};
	for (const g of GENRES) want[g] = noulOf(answers[`want.${g}`]);
	return {
		want,
		style: choiceOf(answers.style, ['talk', 'read', 'any'] as const, 'any'),
		night: noulOf(answers.night),
		pace: choiceOf(answers.pace, ['active', 'calm', 'any'] as const, 'any'),
		refused: noulOf(answers.refuse) >= REFUSE_THRESHOLD
	};
}

// 希望と 1 人の推定の一致 0..1。希望の無い軸は 0.5（中立）で差を付けない。推定の無い人は 0.5
const WANT_MIN = 0.5;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export function intentMatch(intent: PeopleIntent, est: Member['estimate']): number {
	if (!est) return 0.5;
	const wanted = GENRES.filter((g) => (intent.want[g] ?? 0) >= WANT_MIN);
	let topic = 0.5;
	if (wanted.length > 0) {
		let num = 0;
		let den = 0;
		for (const g of wanted) {
			// 0.5 を超えた分だけを重みにする（はっきり望んだ話題ほど効き、付いて回っただけの話題は薄く）
			const w = ((intent.want[g] ?? 0) - WANT_MIN) * 2;
			num += w * (est.genre[g] ?? 0);
			den += w;
		}
		topic = den > 0 ? num / den : 0.5;
	}
	const talk = clamp01(est.replyRatio / 0.4);
	const style = intent.style === 'talk' ? talk : intent.style === 'read' ? 1 - talk * 0.5 : 0.5;
	const night =
		intent.night >= 0.5 && est.nightRatio !== undefined ? clamp01(est.nightRatio / 0.35) : 0.5;
	const active = clamp01(est.notesPerDay / 5);
	const pace = intent.pace === 'active' ? active : intent.pace === 'calm' ? 1 - active : 0.5;
	return 0.6 * topic + 0.2 * style + 0.1 * night + 0.1 * pace;
}

// ---- 2. 上位の候補だけ噛み合いを聞く

export function buildPeopleAffinityRequests(turns: string[], people: PersonState[]): ClefInput[] {
	const requests: ClefInput[] = [];
	for (let i = 0; i < people.length; i += AFFINITY_BATCH) {
		const batch = people.slice(i, i + AFFINITY_BATCH);
		const questions: Record<string, ClefQuestion> = {};
		for (const p of batch) {
			questions[`fit.${p.acct}`] = {
				type: 'noul',
				instructions: `people のうち acct が ${p.acct} の人は、ユーザーが望む話し相手として噛み合うか`,
				criteria: {
					true: 'プロフィール・固定ノート・話題・style（返信の多さ、投稿量、夜型）が、ユーザーの望む話題や関わり方・時間帯と噛み合う',
					false: '噛み合わない、無関係、またはユーザーが避けたいものに当たる'
				}
			};
		}
		requests.push({
			model: 'clef',
			state: {
				...userState(turns),
				people: batch.map(stateOf),
				peopleNote:
					'people は候補の一覧。topics は公開ノートから推定した話題と確率、style は投稿のしかた'
			},
			questions
		});
	}
	return requests;
}

export function parsePeopleAffinity(
	outputs: { answers: Record<string, ClefAnswer> }[],
	accts: string[]
): { refused: boolean; affinity: Record<string, number> } {
	const affinity: Record<string, number> = {};
	let refused = false;
	const set = new Set(accts);
	for (const o of outputs) {
		for (const [id, a] of Object.entries(o.answers)) {
			if (a.type !== 'noul') continue;
			if (id === 'refuse') refused = a.noul >= REFUSE_THRESHOLD;
			else if (id.startsWith('fit.') && set.has(id.slice(4))) affinity[id.slice(4)] = a.noul;
		}
	}
	return { refused, affinity };
}
