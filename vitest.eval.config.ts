import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// 精度の評価（Clef 実機を叩くので課金対象。pnpm eval で明示的に回す）
export default defineConfig({
	plugins: [sveltekit()],
	test: {
		include: ['src/eval/**/*.eval.ts'],
		testTimeout: 15 * 60 * 1000,
		fileParallelism: false
	}
});
