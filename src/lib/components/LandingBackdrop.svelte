<script lang="ts">
	// ランディングの背景（マッチングアプリの LP 風）: 傾いたプロフィールカードとハートが周りに浮かぶ。
	// 中央の検索ボックスの周りは空け、本文の読みやすさを優先する。装飾なので支援技術からは隠す
	const CARDS = [
		{ x: '5%', y: '10%', r: -12, hue: 82, d: 0, side: true },
		{ x: '11%', y: '48%', r: 8, hue: 140, d: 1.2, side: false },
		{ x: '3%', y: '80%', r: -6, hue: 30, d: 2.1, side: true },
		{ x: '84%', y: '8%', r: 10, hue: 200, d: 0.6, side: true },
		{ x: '88%', y: '44%', r: -9, hue: 330, d: 1.8, side: false },
		{ x: '81%', y: '78%', r: 6, hue: 82, d: 2.6, side: true }
	];
	const HEARTS = [
		{ x: '24%', y: '22%', s: 18, d: 0.3 },
		{ x: '70%', y: '28%', s: 14, d: 1.5 },
		{ x: '28%', y: '80%', s: 12, d: 2.2 },
		{ x: '66%', y: '88%', s: 20, d: 0.9 },
		{ x: '92%', y: '26%', s: 12, d: 2.8 }
	];
</script>

<div class="backdrop" aria-hidden="true">
	<div class="blob a"></div>
	<div class="blob b"></div>
	{#each CARDS as c, i (i)}
		<div class="card" class:corner={c.side} style:left={c.x} style:top={c.y} style:--r="{c.r}deg" style:--d="{c.d}s">
			<div class="photo" style:--h={c.hue}></div>
			<div class="who">
				<span class="avatar" style:--h={c.hue}></span>
				<span class="lines"><i></i><i class="short"></i></span>
			</div>
		</div>
	{/each}
	{#each HEARTS as h, i (i)}
		<svg
			class="heart"
			style:left={h.x}
			style:top={h.y}
			style:--d="{h.d}s"
			width={h.s}
			height={h.s}
			viewBox="0 0 24 24"
		>
			<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
		</svg>
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
	.card {
		position: absolute;
		width: 132px;
		padding: 6px;
		border-radius: 18px;
		background: var(--panel);
		box-shadow: var(--shadow-lg);
		transform: rotate(var(--r));
		animation: float 7s ease-in-out var(--d) infinite;
		opacity: 0.9;
	}
	.photo {
		height: 120px;
		border-radius: 13px;
		background: linear-gradient(
			160deg,
			hsl(var(--h) 70% 72%),
			hsl(calc(var(--h) + 40) 60% 48%)
		);
	}
	.who {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 7px 3px 3px;
	}
	.avatar {
		width: 20px;
		height: 20px;
		border-radius: 6px;
		background: hsl(var(--h) 60% 60%);
		flex-shrink: 0;
	}
	.lines {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.lines i {
		display: block;
		height: 5px;
		border-radius: 3px;
		background: var(--panel-2);
		box-shadow: inset 0 0 0 1px var(--border);
	}
	.lines i.short {
		width: 60%;
	}
	.heart {
		position: absolute;
		fill: var(--accent);
		opacity: 0.55;
		animation: float 6s ease-in-out var(--d) infinite;
	}
	@keyframes float {
		50% {
			translate: 0 -10px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.card,
		.heart {
			animation: none;
		}
	}
	@media (min-width: 900px) {
		.backdrop {
			left: var(--rail-w);
		}
	}
	/* モバイルは四隅の 4 枚だけ、小さく薄く */
	@media (max-width: 899px) {
		.backdrop {
			mask-image: linear-gradient(to bottom, #000 0, transparent 22%, transparent 78%, #000 100%);
		}
		.card {
			width: 84px;
			opacity: 0.6;
		}
		.card:not(.corner) {
			display: none;
		}
		.photo {
			height: 72px;
		}
	}
</style>
