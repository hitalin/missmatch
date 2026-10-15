const MAX_TEXT_LENGTH = 200;

export interface NoteLike {
	text?: string | null;
	cw?: string | null;
}

export function cleanNoteText(text: string): string {
	return text
		.replace(/https?:\/\/\S+/g, ' ')
		.replace(/@[\w.-]+(@[\w.-]+)?/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, MAX_TEXT_LENGTH);
}

// サンプルとして使える本文だけを重複なく取り出す
export function pickSampleTexts(notes: NoteLike[], limit: number): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const note of notes) {
		const text = cleanNoteText(note.text ?? '');
		if (text.length < 2 || seen.has(text)) continue;
		seen.add(text);
		out.push(text);
		if (out.length >= limit) break;
	}
	return out;
}

export async function fetchSampleNotes(
	host: string,
	limit = 30,
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
