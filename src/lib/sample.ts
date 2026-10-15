const MAX_TEXT_LENGTH = 200;

export interface NoteLike {
	text?: string | null;
	cw?: string | null;
	userId?: string | null;
}

// 1 ユーザーあたりの採用上限。瞬間の LTL は 1 人の連投で埋まりがちで、
// そのままだとサーバーではなく個人の雰囲気を測ってしまう
const DEFAULT_PER_USER = 5;

export function cleanNoteText(text: string): string {
	return text
		.replace(/https?:\/\/\S+/g, ' ')
		.replace(/@[\w.-]+(@[\w.-]+)?/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, MAX_TEXT_LENGTH);
}

// サンプルとして使える本文だけを重複なく取り出す。CW は成人向け度などの手がかりになるので本文の前に付ける
export function pickSampleTexts(
	notes: NoteLike[],
	limit: number,
	perUser = DEFAULT_PER_USER
): string[] {
	const seen = new Set<string>();
	const perUserCount = new Map<string, number>();
	const out: string[] = [];
	for (const note of notes) {
		const body = cleanNoteText(note.text ?? '');
		const cw = note.cw ? cleanNoteText(note.cw) : '';
		const text = cw ? `[CW: ${cw}] ${body}`.trim() : body;
		if (text.length < 2 || seen.has(text)) continue;
		if (note.userId) {
			const n = perUserCount.get(note.userId) ?? 0;
			if (n >= perUser) continue;
			perUserCount.set(note.userId, n + 1);
		}
		seen.add(text);
		out.push(text);
		if (out.length >= limit) break;
	}
	return out;
}

export async function fetchSampleNotes(
	host: string,
	limit = 50,
	fetchFn: typeof fetch = fetch
): Promise<string[]> {
	try {
		const res = await fetchFn(`https://${host}/api/notes/local-timeline`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'User-Agent': 'missmatch/1.0 (Misskey server finder)'
			},
			body: JSON.stringify({
				limit: Math.min(limit * 2, 100),
				withRenotes: false,
				withFiles: false
			}),
			signal: AbortSignal.timeout(8000)
		});
		if (!res.ok) return [];
		const notes = (await res.json()) as unknown;
		if (!Array.isArray(notes)) return [];
		return pickSampleTexts(notes as NoteLike[], limit);
	} catch {
		return [];
	}
}
