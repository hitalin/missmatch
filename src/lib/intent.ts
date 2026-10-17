import {
	DEALBREAKER_LABELS,
	PACE_HINTS,
	PACE_LABELS,
	type Preferences,
	paceOf,
	SCALE_LABELS,
	scaleOf,
	TOPIC_LABELS,
	TOPICS,
	type Topic
} from './prefs';
import { GENRE_LABELS, GENRES, type ServerProfile, type VibeProfile } from './types';
import {
	type ClefAnswer,
	type ClefInput,
	type ClefOutput,
	type ClefQuestion,
	type ClefRunner,
	STRICTNESS_LEVELS,
	TONE_LEVELS
} from './vibe';

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

// 読み取れた希望で設定を埋める。ユーザーが既に触った項目（既定値でないもの）は上書きしない。
// 規模・流速は読み取りからはハードフィルターにしない: 「のんびり雑談」で大手が全部消え、
// 「盛り上がりたい」でアニメ実況の小さな鯖が消えていた。噛み合い判定が規模・流速を見て加減する
const SOFT_AXES = new Set<AskAxis>(['scale', 'pace']);
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
		if (SOFT_AXES.has(axis)) continue;
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

// Clef の応答時間は state のトークン数にほぼ比例するので、バッチに分けて並列に投げる。
// 1 バッチの件数は実測で決めた（2026-10-17、32 言葉、招待制まで 185 件）:
//   8 件 recall@5 81% / p50 2.1 秒、16 件 86% / 2.2 秒、32 件 81% / 2.6 秒。
// 同じ state に並ぶ数が多いほど物差しがそろって精度が上がるが、32 件では落ちて遅くなる
export const AFFINITY_BATCH = 16;
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

// 雰囲気の判定値を言葉にして渡す。「静か」「身内」「初心者でも」のような希望は
// 説明文や抜粋 3 件だけでは読めないことが多く、事前計算した判定を見せると噛み合いが安定する
const pct = (n: number) => `${Math.round(n * 100)}%`;
const level = (levels: string[], v: number) =>
	levels[Math.min(levels.length - 1, Math.max(0, Math.round(v * (levels.length - 1))))];
function atmosphereOf(v: VibeProfile) {
	return {
		tone: level(TONE_LEVELS, v.tone),
		strictness: level(STRICTNESS_LEVELS, v.strictness),
		newcomerFriendly: pct(v.newcomerFriendly),
		closedCommunity: pct(v.closedCommunity),
		nsfw: pct(v.nsfw)
	};
}

// 「この一言と各サーバーは噛み合うか」を、サーバーの説明・ルール・雰囲気・規模を見せて直接判定させる。
// 設定項目に無い切り口（例: 病み垢の居場所）でも説明文に書いてあれば拾える。
// 最近の投稿の抜粋は渡さない: 瞬間の LTL は bot・ニュース・告知が多く、誰でもする食べ物や仕事の話が
// どの鯖にもあるので、説明文で決まるテーマ性を薄めるだけだった（2026-10-17、recall@5 82 → 74%）
function serverState(p: ServerProfile, descriptionChars: number, rulesChars: number) {
	return {
		host: p.server.host,
		name: p.server.name ?? p.server.host,
		description: (p.server.description ?? '').slice(0, descriptionChars),
		rules: p.server.serverRules.join(' / ').slice(0, rulesChars),
		// 規模は 1 日の読者数で伝える。登録者数だけだと、離れた人で膨らんだ鯖を「大手」と読んでしまう
		scale: `${SCALE_LABELS[scaleOf(p.server)]}（毎日 ${Math.round(p.server.dru15 ?? 0)} 人が読む）`,
		pace: `${PACE_LABELS[paceOf(p.server)]}（${PACE_HINTS[paceOf(p.server)]}）`,
		registeredUsers: p.server.usersCount,
		// LTL が無い鯖は流速が速くても本人のホームは静か（「干渉が少ない」「隠居」の判定に効く）
		localTimeline: p.server.ltlAvailable
			? 'あり'
			: 'なし（自分のホームタイムラインだけで、他人の投稿が流れてこない）',
		atmosphere: p.vibe ? atmosphereOf(p.vibe) : undefined,
		topics: topicsOf(p)
	};
}

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
					true: '説明文・ルール・雰囲気・規模・話題・最近の投稿が、ユーザーの望む使い方や話題と噛み合う',
					false: '噛み合わない、無関係、またはユーザーが避けたいものに当たる'
				}
			};
		}
		requests.push({
			model: 'clef',
			state: {
				...userState(turns),
				servers: batch.map((p) => serverState(p, DESCRIPTION_CHARS, RULES_CHARS))
			},
			questions
		});
	}
	return requests;
}

// バッチを並列に投げ、失敗した分は半分に割ってもう一度投げる。1 つの失敗で全部の噛み合いを捨てない
// （以前は Promise.all だったので、13 本のうち 1 本が 429 などで落ちると全サーバーが 0.5 になっていた。
// 同じ入力をそのまま投げ直しても、Clef が決定を返せない入力なら同じ結果になるので割る）
export function splitRequest(req: ClefInput): ClefInput[] {
	const ids = Object.keys(req.questions);
	if (ids.length < 2) return [req];
	const state = req.state as { servers?: { host: string }[] };
	const half = Math.ceil(ids.length / 2);
	return [ids.slice(0, half), ids.slice(half)].map((part) => {
		const keep = new Set(part);
		return {
			...req,
			state: state.servers
				? { ...state, servers: state.servers.filter((s) => keep.has(s.host)) }
				: req.state,
			questions: Object.fromEntries(part.map((id) => [id, req.questions[id]]))
		};
	});
}
export async function runAffinity(
	runner: ClefRunner,
	requests: ClefInput[]
): Promise<{ outputs: ClefOutput[]; failed: number }> {
	const attempt = async (reqs: ClefInput[]) => {
		const settled = await Promise.allSettled(reqs.map((r) => runner(r)));
		const outputs: ClefOutput[] = [];
		const retry: ClefInput[] = [];
		settled.forEach((s, i) => {
			if (s.status === 'fulfilled') outputs.push(s.value);
			else retry.push(reqs[i]);
		});
		return { outputs, retry };
	};
	const first = await attempt(requests);
	if (first.retry.length === 0) return { outputs: first.outputs, failed: 0 };
	const second = await attempt(first.retry.flatMap(splitRequest));
	if (second.retry.length > 0) console.error(`[affinity] ${second.retry.length} batches failed`);
	return { outputs: [...first.outputs, ...second.outputs], failed: second.retry.length };
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
