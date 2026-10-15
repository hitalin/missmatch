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
</script>

<div class="backdrop" aria-hidden="true">
	<div class="blob a"></div>
	<div class="blob b"></div>
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

<style>
	/* 本文の余白で切れないよう、サイドバーを除いた画面全体に敷く */
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: -1;
		overflow: hidden;
		pointer-events: none;
		user-select: none;
		/* 中央（検索ボックスのあたり）を抜く */
		mask-image: radial-gradient(ellipse 38% 42% at 50% 46%, transparent 55%, #000 100%);
	}
	.blob {
		position: absolute;
		width: 46vmax;
		height: 46vmax;
		border-radius: 50%;
		filter: blur(60px);
		opacity: 0.35;
		background: radial-gradient(circle, #9ad11b, transparent 65%);
	}
	.blob.a {
		left: -14vmax;
		top: -16vmax;
	}
	.blob.b {
		right: -16vmax;
		bottom: -18vmax;
		background: radial-gradient(circle, #4ab300, transparent 65%);
	}
	.planet,
	.spark {
		position: absolute;
		line-height: 1;
	}
	/* 惑星はゆっくり漂いながら少し傾く、星はまたたく */
	.planet {
		filter: drop-shadow(0 12px 18px rgba(0, 0, 0, 0.18));
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
		.spark {
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
		.backdrop {
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
