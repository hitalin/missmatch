// 人モードの「いいね」「よくないね」「見たマッチ」はブラウザにだけ残す（docs/PEOPLE.md §4・§6）。
// サーバーには誰をスワイプしたかを送らない（デッキを頼むときに除外一覧として送るだけ）

const KEY = 'missmatch:people:v1';
const PASS_TTL_MS = 30 * 24 * 60 * 60 * 1000; // よくないねは 30 日で再び出る

export interface LikedPerson {
	at: number;
	name: string;
	username: string;
	host: string;
}
interface Stored {
	liked: Record<string, LikedPerson>; // acct → いいねした時刻と表示用の名前
	passed: Record<string, LikedPerson>;
	seenMatches: string[];
	mode?: 'server' | 'people';
}

function load(): Stored {
	if (typeof localStorage === 'undefined') return { liked: {}, passed: {}, seenMatches: [] };
	try {
		const raw = localStorage.getItem(KEY);
		if (raw)
			return { liked: {}, passed: {}, seenMatches: [], ...(JSON.parse(raw) as Partial<Stored>) };
	} catch {
		// 壊れていれば作り直す
	}
	return { liked: {}, passed: {}, seenMatches: [] };
}

let data = $state<Stored>(load());

function save() {
	try {
		localStorage.setItem(KEY, JSON.stringify(data));
	} catch {
		// 保存できない環境では一時的に動く
	}
}

export const peopleStore = {
	get liked(): (LikedPerson & { acct: string })[] {
		return Object.entries(data.liked)
			.sort((a, b) => b[1].at - a[1].at)
			.map(([acct, p]) => ({ acct, ...p }));
	},
	get passed(): (LikedPerson & { acct: string })[] {
		const now = Date.now();
		return Object.entries(data.passed)
			.filter(([, p]) => now - p.at < PASS_TTL_MS)
			.sort((a, b) => b[1].at - a[1].at)
			.map(([acct, p]) => ({ acct, ...p }));
	},
	get mode(): 'server' | 'people' {
		return data.mode ?? 'server';
	},
	setMode(mode: 'server' | 'people') {
		data = { ...data, mode };
		save();
	},
	like(acct: string, who: Omit<LikedPerson, 'at'>) {
		const { [acct]: _p, ...passed } = data.passed;
		data = { ...data, liked: { ...data.liked, [acct]: { ...who, at: Date.now() } }, passed };
		save();
	},
	pass(acct: string, who: Omit<LikedPerson, 'at'>) {
		const { [acct]: _l, ...liked } = data.liked;
		data = { ...data, passed: { ...data.passed, [acct]: { ...who, at: Date.now() } }, liked };
		save();
	},
	unlike(acct: string) {
		const { [acct]: _l, ...liked } = data.liked;
		data = { ...data, liked };
		save();
	},
	restore(acct: string) {
		const { [acct]: _p, ...passed } = data.passed;
		data = { ...data, passed };
		save();
	},
	// デッキから外す acct（いいね済み + 30 日以内のよくないね）
	get excluded(): string[] {
		return [...this.liked, ...this.passed].map((p) => p.acct);
	},
	get seenMatches(): string[] {
		return data.seenMatches;
	},
	markMatchesSeen(accts: string[]) {
		data = { ...data, seenMatches: [...new Set([...data.seenMatches, ...accts])] };
		save();
	}
};
