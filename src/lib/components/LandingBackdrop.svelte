<script lang="ts">
	// ランディングの背景: サーバー（＝それぞれの星）が周りに浮かぶ宇宙。
	// 中央の検索ボックスの周りは空け、本文の読みやすさを優先する。装飾なので支援技術からは隠す
	const PLANETS = [
		{ e: '🪐', x: '6%', y: '10%', s: 84, d: 0, corner: true },
		{ e: '🌏', x: '12%', y: '50%', s: 60, d: 1.2, corner: false },
		{ e: '🌕', x: '4%', y: '80%', s: 52, d: 2.1, corner: true },
		{ e: '🌍', x: '84%', y: '9%', s: 66, d: 0.6, corner: true },
		{ e: '🪐', x: '88%', y: '46%', s: 56, d: 1.8, corner: false },
		{ e: '🌑', x: '82%', y: '80%', s: 72, d: 2.6, corner: true }
	];
	const SPARKS = [
		{ e: '✨', x: '24%', y: '20%', s: 22, d: 0.3 },
		{ e: '⭐', x: '70%', y: '26%', s: 16, d: 1.5 },
		{ e: '💫', x: '28%', y: '82%', s: 22, d: 2.2 },
		{ e: '✨', x: '66%', y: '88%', s: 18, d: 0.9 },
		{ e: '⭐', x: '93%', y: '28%', s: 14, d: 2.8 },
		{ e: '☄️', x: '40%', y: '6%', s: 26, d: 1.1 }
	];
	// 瞬く星（misspace の連合グラフと同じ）。SSR とずれないよう、乱数は固定の種から作る
	let seed = 7;
	const rand = () => {
		seed = (seed * 16807) % 2147483647;
		return seed / 2147483647;
	};
	const STARS = Array.from({ length: 40 }, (_, i) => ({
		kind: (['accent', 'purple', 'bright', '', ''] as const)[i % 5],
		x: rand() * 100,
		y: rand() * 100,
		size: 0.5 + rand() * 2.5,
		delay: rand() * 4,
		duration: 2 + rand() * 4
	}));
</script>

<div class="backdrop" aria-hidden="true">
	{#each STARS as st, i (i)}
		<i
			class="star {st.kind}"
			style:left="{st.x}%"
			style:top="{st.y}%"
			style:--size="{st.size}px"
			style:--delay="{st.delay}s"
			style:--duration="{st.duration}s"
		></i>
	{/each}
	<div class="field">
	{#each PLANETS as p, i (i)}
		<span
			class="planet"
			class:corner={p.corner}
			style:left={p.x}
			style:top={p.y}
			style:font-size="{p.s}px"
			style:--d="{p.d}s">{p.e}</span
		>
	{/each}
	{#each SPARKS as p, i (i)}
		<span class="spark" style:left={p.x} style:top={p.y} style:font-size="{p.s}px" style:--d="{p.d}s"
			>{p.e}</span
		>
	{/each}
	</div>
</div>

<style>
	/* 本文の余白で切れないよう、サイドバーを除いた画面全体に敷く */
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: -1;
		overflow: hidden;
		pointer-events: none;
		user-select: none;
		/* misspace の連合グラフと同じ宇宙（ライト・ダークどちらでも暗い） */
		background:
			radial-gradient(ellipse 80% 50% at 20% 30%, rgba(134, 179, 0, 0.08) 0%, transparent 50%),
			radial-gradient(ellipse 60% 40% at 75% 70%, rgba(163, 116, 255, 0.1) 0%, transparent 45%),
			radial-gradient(ellipse 70% 60% at 50% 50%, rgba(214, 85, 214, 0.06) 0%, transparent 50%),
			linear-gradient(180deg, #0c0818 0%, #130e26 50%, #0f0a1e 100%);
	}
	/* 惑星は中央（検索ボックスのあたり）を抜く */
	.field {
		position: absolute;
		inset: 0;
		mask-image: radial-gradient(ellipse 38% 42% at 50% 46%, transparent 55%, #000 100%);
	}
	.star {
		position: absolute;
		width: var(--size);
		height: var(--size);
		border-radius: 50%;
		background: #fff;
		opacity: 0.5;
		box-shadow: 0 0 calc(var(--size) * 2) rgba(255, 255, 255, 0.3);
		animation: shine var(--duration) ease-in-out var(--delay) infinite;
	}
	.star.accent {
		background: #86b300;
		box-shadow: 0 0 calc(var(--size) * 3) rgba(134, 179, 0, 0.5);
	}
	.star.purple {
		background: #a374ff;
		box-shadow: 0 0 calc(var(--size) * 3) rgba(163, 116, 255, 0.5);
	}
	.star.bright {
		box-shadow: 0 0 calc(var(--size) * 4) rgba(255, 255, 255, 0.6);
	}
	@keyframes shine {
		50% {
			opacity: 0.9;
			scale: 1.2;
		}
	}
	.planet,
	.spark {
		position: absolute;
		line-height: 1;
	}
	/* 惑星はゆっくり漂いながら少し傾く、星はまたたく */
	.planet {
		filter: drop-shadow(0 0 18px rgba(163, 116, 255, 0.25));
		animation: drift 9s ease-in-out var(--d) infinite;
	}
	.spark {
		opacity: 0.8;
		animation: twinkle 3.5s ease-in-out var(--d) infinite;
	}
	@keyframes drift {
		50% {
			translate: 0 -14px;
			rotate: 8deg;
		}
	}
	@keyframes twinkle {
		50% {
			opacity: 0.3;
			scale: 0.8;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.planet,
		.spark,
		.star {
			animation: none;
		}
	}
	@media (min-width: 900px) {
		.backdrop {
			left: var(--rail-w);
		}
	}
	/* モバイルは四隅の惑星だけ、小さく薄く */
	@media (max-width: 899px) {
		.field {
			mask-image: linear-gradient(to bottom, #000 0, transparent 22%, transparent 78%, #000 100%);
		}
		.planet {
			scale: 0.6;
			opacity: 0.7;
		}
		.planet:not(.corner) {
			display: none;
		}
	}
</style>
