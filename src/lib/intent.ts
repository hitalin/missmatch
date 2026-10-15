import { DEALBREAKER_LABELS, type Preferences, TOPIC_LABELS, TOPICS, type Topic } from './prefs';
import type { ServerProfile } from './types';
import { type ClefAnswer, type ClefInput, type ClefQuestion, vibeTags } from './vibe';

export const MAX_INTENT_LENGTH = 300;
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

export function buildIntentRequest(text: string): ClefInput {
	return {
		model: 'clef',
		state: { userMessage: text.slice(0, MAX_INTENT_LENGTH) },
		questions: INTENT_QUESTIONS
	};
}

function confidentChoice(a: ClefAnswer | undefined): string | null {
	if (a?.type !== 'choice' || a.choice === NONE) return null;
	return (a.probabilities[a.choice] ?? 0) >= MIN_PROBABILITY ? a.choice : null;
}
const confidentYes = (a: ClefAnswer | undefined) => a?.type === 'noul' && a.noul >= 0.7;

// 読み取れた希望で設定を埋める。ユーザーが既に触った項目（既定値でないもの）は上書きしない
export function applyIntent(prefs: Preferences, answers: Record<string, ClefAnswer>): Preferences {
	const next: Preferences = {
		...prefs,
		scales: [...prefs.scales],
		paces: [...prefs.paces],
		topics: [...prefs.topics],
		dealbreakers: { ...prefs.dealbreakers }
	};
	for (const t of TOPICS) {
		if (confidentYes(answers[`topic.${t}`]) && !next.topics.includes(t))
			next.topics.push(t as Topic);
	}
	for (const key of ['tone', 'community', 'rules'] as const) {
		const c = confidentChoice(answers[key]);
		if (next[key] === 'any' && (c === 'left' || c === 'right')) next[key] = c;
	}
	const scale = confidentChoice(answers.scale);
	if (next.scales.length === 0 && scale === 'small') next.scales = ['small', 'medium'];
	if (next.scales.length === 0 && scale === 'large') next.scales = ['medium', 'large'];
	const pace = confidentChoice(answers.pace);
	if (next.paces.length === 0 && pace === 'quiet') next.paces = ['quiet', 'relaxed'];
	if (next.paces.length === 0 && pace === 'busy') next.paces = ['relaxed', 'busy'];
	for (const key of ['emailFree', 'adsFree', 'gtl', 'official'] as const) {
		if (confidentYes(answers[key])) next.dealbreakers[key] = true;
	}
	return next;
}

// Clef の応答時間は state のトークン数にほぼ比例するので、小さなバッチに分けて並列に投げる
export const AFFINITY_BATCH = 12;
const DESCRIPTION_CHARS = 200;
const RULES_CHARS = 160;

// 「この一言と各サーバーは噛み合うか」を、サーバーの説明・ルール・雰囲気タグを見せて直接判定させる。
// 設定項目に無い切り口（例: 病み垢の居場所）でも説明文に書いてあれば拾える
export function buildAffinityRequests(text: string, profiles: ServerProfile[]): ClefInput[] {
	const requests: ClefInput[] = [];
	for (let i = 0; i < profiles.length; i += AFFINITY_BATCH) {
		const batch = profiles.slice(i, i + AFFINITY_BATCH);
		const questions: Record<string, ClefQuestion> = {};
		for (const p of batch) {
			questions[p.server.host] = {
				type: 'noul',
				instructions: `servers のうち host が ${p.server.host} のサーバーは、ユーザーが望む使い方・話題・居心地に合う場所か`,
				criteria: {
					true: '説明文・ルール・雰囲気が、ユーザーの望む使い方や話題と噛み合う',
					false: '噛み合わない、無関係、またはユーザーが避けたいものに当たる'
				}
			};
		}
		requests.push({
			model: 'clef',
			state: {
				userMessage: text.slice(0, MAX_INTENT_LENGTH),
				servers: batch.map((p) => ({
					host: p.server.host,
					name: p.server.name ?? p.server.host,
					description: (p.server.description ?? '').slice(0, DESCRIPTION_CHARS),
					rules: p.server.serverRules.join(' / ').slice(0, RULES_CHARS),
					vibeTags: p.vibe ? vibeTags(p.vibe) : []
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
