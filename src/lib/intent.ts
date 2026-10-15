import { DEALBREAKER_LABELS, type Preferences, TOPIC_LABELS, TOPICS, type Topic } from './prefs';
import { GENRE_LABELS, GENRES, type ServerProfile } from './types';
import type { ClefAnswer, ClefInput, ClefQuestion } from './vibe';

export const MAX_INTENT_LENGTH = 300; // 1 回の発言の長さ
export const MAX_TURNS = 8; // 最初の言葉 + 絞り込みの数
// この確率未満の読み取りは採用しない
const MIN_PROBABILITY = 0.6;
const NONE = 'none';

// 「どんな場所を探している？」の一言を、発見の設定に変換するための Clef の質問。
// 年齢と R-18 は安全のため読み取らない
const INTENT_QUESTIONS: Record<string, ClefQuestion> = {
	...Object.fromEntries(
		TOPICS.map((t) => [
			`topic.${t}`,
			{
				type: 'noul',
				instructions: `ユーザーは「${TOPIC_LABELS[t]}」の話題ができる場所を求めているか`
			} satisfies ClefQuestion
		])
	),
	tone: {
		type: 'choice',
		instructions: 'ユーザーが求める空気感',
		criteria: { right: 'ほのぼの・穏やか', left: 'ドライ・自由・干渉が少ない', [NONE]: '言及なし' }
	},
	community: {
		type: 'choice',
		instructions: 'ユーザーが求めるコミュニティとの関わり方',
		criteria: {
			right: '初心者でも気軽に入れる',
			left: '濃い身内の関係を築きたい',
			[NONE]: '言及なし'
		}
	},
	rules: {
		type: 'choice',
		instructions: 'ユーザーがルールや運営に求めるもの',
		criteria: { right: 'しっかりしていて安心', left: 'ゆるくて気楽', [NONE]: '言及なし' }
	},
	scale: {
		type: 'choice',
		instructions: 'ユーザーが求めるサーバーの規模',
		criteria: { small: '小さなコミュニティ', large: '人の多い大手', [NONE]: '言及なし' }
	},
	pace: {
		type: 'choice',
		instructions: 'ユーザーが求めるタイムラインの流速',
		criteria: { quiet: 'のんびり静か', busy: 'にぎやかで速い', [NONE]: '言及なし' }
	},
	emailFree: {
		type: 'noul',
		instructions: `ユーザーは「${DEALBREAKER_LABELS.emailFree}」ことを求めているか`
	},
	adsFree: {
		type: 'noul',
		instructions: `ユーザーは「${DEALBREAKER_LABELS.adsFree}」ことを求めているか`
	},
	gtl: { type: 'noul', instructions: `ユーザーは「${DEALBREAKER_LABELS.gtl}」ことを求めているか` },
	official: {
		type: 'noul',
		instructions: 'ユーザーは本家 Misskey（カスタム版でない）を求めているか'
	}
};

// ユーザーの発言の並び。最初が「どんな場所を探している？」への一言、あとは絞り込み。
// 後の発言ほど新しい希望なので、食い違うときは後を優先するよう添える
export function userState(turns: string[]): Record<string, unknown> {
	return {
		userMessages: turns.slice(0, MAX_TURNS).map((t) => t.slice(0, MAX_INTENT_LENGTH)),
		note: 'userMessages はユーザーの発言を古い順に並べたもの。後の発言ほど新しい希望で、食い違うときは後の発言を優先する'
	};
}

export function buildIntentRequest(turns: string[]): ClefInput {
	return { model: 'clef', state: userState(turns), questions: INTENT_QUESTIONS };
}

function confidentChoice(a: ClefAnswer | undefined): string | null {
	if (a?.type !== 'choice' || a.choice === NONE) return null;
	return (a.probabilities[a.choice] ?? 0) >= MIN_PROBABILITY ? a.choice : null;
}
const confidentYes = (a: ClefAnswer | undefined) => a?.type === 'noul' && a.noul >= 0.7;

// 一言から読み取る choice 型の軸。読み取れなかったものは、あとで選択肢にして聞く
export const ASK_AXES = ['scale', 'pace', 'tone', 'community', 'rules'] as const;
export type AskAxis = (typeof ASK_AXES)[number];
export const ASK_PROMPTS: Record<AskAxis, string> = {
	scale: '規模は',
	pace: '流速は',
	tone: '空気感は',
	community: '関わり方は',
	rules: 'ルールは'
};
export function askOptions(axis: AskAxis): { value: string; label: string }[] {
	return Object.entries(INTENT_QUESTIONS[axis].criteria ?? {})
		.filter(([value]) => value !== NONE)
		.map(([value, label]) => ({ value, label: label ?? value }));
}

// その軸の設定がまだ既定値（聞く意味がある）か
export function isAxisDefault(prefs: Preferences, axis: AskAxis): boolean {
	if (axis === 'scale') return prefs.scales.length === 0;
	if (axis === 'pace') return prefs.paces.length === 0;
	return prefs[axis] === 'any';
}

// 軸の選択を設定に反映する（ユーザーが選んだので既定値でなくても上書き）。
// 規模・流速は隣の区分も含めて広めに取る
export function chooseAxis(prefs: Preferences, axis: AskAxis, choice: string): Preferences {
	const next = { ...prefs };
	if (axis === 'scale') {
		if (choice === 'small') next.scales = ['small', 'medium'];
		if (choice === 'large') next.scales = ['medium', 'large'];
	} else if (axis === 'pace') {
		if (choice === 'quiet') next.paces = ['quiet', 'relaxed'];
		if (choice === 'busy') next.paces = ['relaxed', 'busy'];
	} else if (choice === 'left' || choice === 'right') {
		next[axis] = choice;
	}
	return next;
}

// 読み取れた希望で設定を埋める。ユーザーが既に触った項目（既定値でないもの）は上書きしない
export function applyIntent(prefs: Preferences, answers: Record<string, ClefAnswer>): Preferences {
	let next: Preferences = {
		...prefs,
		topics: [...prefs.topics],
		dealbreakers: { ...prefs.dealbreakers }
	};
	for (const t of TOPICS) {
		if (confidentYes(answers[`topic.${t}`]) && !next.topics.includes(t))
			next.topics.push(t as Topic);
	}
	for (const axis of ASK_AXES) {
		const c = confidentChoice(answers[axis]);
		if (c && isAxisDefault(next, axis)) next = chooseAxis(next, axis, c);
	}
	for (const key of ['emailFree', 'adsFree', 'gtl', 'official'] as const) {
		if (confidentYes(answers[key])) next.dealbreakers[key] = true;
	}
	return next;
}

// 回答はあったが自信を持って読み取れなかった軸（「言及なし」か低確率）。回答自体が無ければ聞かない
export function unsureAxes(answers: Record<string, ClefAnswer>): AskAxis[] {
	return ASK_AXES.filter(
		(axis) => answers[axis]?.type === 'choice' && confidentChoice(answers[axis]) === null
	);
}

// Clef の応答時間は state のトークン数にほぼ比例するので、小さなバッチに分けて並列に投げる。
// 1 回にまとめる数が多いと、同じバッチ内のサーバー同士で判定が引きずられやすい
export const AFFINITY_BATCH = 8;
const DESCRIPTION_CHARS = 300;
const RULES_CHARS = 200;
// 話題は確率付きで渡す（タグに丸めると「どのくらい」が消える）
const TOPIC_MIN = 0.5;
function topicsOf(p: ServerProfile): string[] {
	const v = p.vibe;
	if (!v) return [];
	return GENRES.filter((g) => v.genre[g] >= TOPIC_MIN)
		.sort((a, b) => v.genre[b] - v.genre[a])
		.map((g) => `${GENRE_LABELS[g]} ${Math.round(v.genre[g] * 100)}%`);
}

// 「この一言と各サーバーは噛み合うか」を、サーバーの説明・ルール・雰囲気タグを見せて直接判定させる。
// 設定項目に無い切り口（例: 病み垢の居場所）でも説明文に書いてあれば拾える
export function buildAffinityRequests(turns: string[], profiles: ServerProfile[]): ClefInput[] {
	const requests: ClefInput[] = [];
	for (let i = 0; i < profiles.length; i += AFFINITY_BATCH) {
		const batch = profiles.slice(i, i + AFFINITY_BATCH);
		const questions: Record<string, ClefQuestion> = {};
		for (const p of batch) {
			questions[p.server.host] = {
				type: 'noul',
				instructions: `servers のうち host が ${p.server.host} のサーバーは、ユーザーが望む使い方・話題・居心地に合う場所か`,
				criteria: {
					true: '説明文・ルール・話題・最近の投稿が、ユーザーの望む使い方や話題と噛み合う',
					false: '噛み合わない、無関係、またはユーザーが避けたいものに当たる'
				}
			};
		}
		requests.push({
			model: 'clef',
			state: {
				...userState(turns),
				servers: batch.map((p) => ({
					host: p.server.host,
					name: p.server.name ?? p.server.host,
					description: (p.server.description ?? '').slice(0, DESCRIPTION_CHARS),
					rules: p.server.serverRules.join(' / ').slice(0, RULES_CHARS),
					topics: topicsOf(p),
					recentNotes: p.excerpts ?? []
				}))
			},
			questions
		});
	}
	return requests;
}

export function parseAffinity(
	outputs: { answers: Record<string, ClefAnswer> }[],
	profiles: ServerProfile[]
): Record<string, number> {
	const out: Record<string, number> = {};
	const hosts = new Set(profiles.map((p) => p.server.host));
	for (const o of outputs) {
		for (const [host, a] of Object.entries(o.answers)) {
			if (hosts.has(host) && a.type === 'noul') out[host] = a.noul;
		}
	}
	return out;
}
