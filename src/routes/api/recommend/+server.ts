import { json } from '@sveltejs/kit';
import { toPreference } from '$lib/quiz';
import { clefRunner, memoryKv, recommend } from '$lib/server/recommend';
import type { QuizAnswers } from '$lib/types';
import type { RequestHandler } from './$types';

// vite dev ではバインディングがないため、プロセス内メモリで代用する
const devKv = memoryKv();

export const POST: RequestHandler = async ({ request, platform }) => {
	let body: { answers?: unknown };
	try {
		body = (await request.json()) as { answers?: unknown };
	} catch {
		return json({ error: 'invalid json' }, { status: 400 });
	}
	if (!body.answers || typeof body.answers !== 'object') {
		return json({ error: 'answers is required' }, { status: 400 });
	}
	const answers: QuizAnswers = {};
	for (const [k, v] of Object.entries(body.answers as Record<string, unknown>)) {
		if (typeof v === 'string') answers[k] = v;
	}

	const env = platform?.env;
	try {
		const result = await recommend(toPreference(answers), {
			kv: env?.VIBE_KV ?? devKv,
			runner: env?.AI ? clefRunner(env.AI) : null
		});
		return json(result);
	} catch (e) {
		console.error('[recommend]', e);
		return json({ error: 'failed to recommend' }, { status: 502 });
	}
};
