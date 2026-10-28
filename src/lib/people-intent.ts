import { AFFINITY_BATCH, userState } from './intent';
import { GENRE_LABELS, GENRES, type Genre } from './types';
import type { ClefAnswer, ClefInput, ClefQuestion } from './vibe';

// 言葉で人を絞る（docs/PEOPLE.md §4）。サーバーの噛み合い判定と同じ形で、state は本人のプロフィールと
// 推定した話題だけ（ノート本文は渡さない）。候補は呼ぶ側で上位 48 人に絞るので、参加者数に依存しない

export interface PersonState {
	acct: string;
	name: string;
	description: string;
	pinned: string[];
	chips: Genre[];
	topics: Partial<Record<Genre, number>>; // 推定した話題の確率
}

const TOPIC_MIN = 0.5;
const REFUSE_THRESHOLD = 0.7;

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
		topics
	};
}

export function buildPeopleAffinityRequests(turns: string[], people: PersonState[]): ClefInput[] {
	const requests: ClefInput[] = [];
	for (let i = 0; i < people.length; i += AFFINITY_BATCH) {
		const batch = people.slice(i, i + AFFINITY_BATCH);
		const questions: Record<string, ClefQuestion> = {};
		if (i === 0) {
			// 恋愛・性的・容姿・性別・年齢・精神状態・居住地を軸にした探し方は受けない（運営方針の証跡）
			questions.refuse = {
				type: 'noul',
				instructions:
					'userMessages は、恋愛・性的な関係・容姿・性別・年齢・精神状態・居住地のいずれかを軸にして人を探しているか',
				criteria: {
					true: '「彼女になってくれる人」「可愛い子」「年下の女性」「病んでる人」「東京の人」のように、それらを条件にしている',
					false: '話題・趣味・活動・話し方など、それ以外を手がかりにしている'
				}
			};
		}
		for (const p of batch) {
			questions[`fit.${p.acct}`] = {
				type: 'noul',
				instructions: `people のうち acct が ${p.acct} の人は、ユーザーが望む話し相手として噛み合うか`,
				criteria: {
					true: 'プロフィール・固定ノート・話題が、ユーザーの望む話題や関わり方と噛み合う',
					false: '噛み合わない、無関係、またはユーザーが避けたいものに当たる'
				}
			};
		}
		requests.push({
			model: 'clef',
			state: { ...userState(turns), people: batch.map(stateOf) },
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
