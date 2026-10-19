<script lang="ts">
	import type { ServerInfo } from '$lib/types';

	// ランディングの背景（マッチングアプリの文法）: 明るい地に、実際のサーバーのカードが周縁に浮かび、
	// 小さなハートが瞬く。中央の検索ボックスの周りは空け、本文の読みやすさを優先する。装飾なので支援技術からは隠す
	let { servers = [] }: { servers?: ServerInfo[] } = $props();

	// カードの置き場（6 枚）。上段は上から、下段は下からの距離で置き、画面の外に落とさない。
	// corner は四隅で、モバイルではそこだけ出す
	const SLOTS = [
		{ x: '4%', top: '4%', r: -8, d: 0, corner: true },
		{ x: '3%', top: '40%', r: 6, d: 1.2, corner: false },
		{ x: '5%', bottom: '4%', r: -5, d: 2.1, corner: true },
		{ x: '84%', top: '4%', r: 7, d: 0.6, corner: true },
		{ x: '87%', top: '40%', r: -6, d: 1.8, corner: false },
		{ x: '83%', bottom: '4%', r: 5, d: 2.6, corner: true }
	];
	const FALLBACK = '#86b300';
	const gradient = (color: string | null) =>
		`linear-gradient(160deg, ${color ?? FALLBACK}, color-mix(in srgb, ${color ?? FALLBACK} 55%, #000))`;

	// 瞬くハート。SSR とずれないよう、乱数は固定の種から作る
	let seed = 7;
	const rand = () => {
		seed = (seed * 16807) % 2147483647;
		return seed / 2147483647;
	};
	const HEARTS = Array.from({ length: 22 }, (_, i) => ({
		love: i % 3 !== 0, // 2/3 は桃色、残りは黄緑
		x: rand() * 100,
		y: rand() * 100,
		size: 8 + rand() * 12,
		delay: rand() * 4,
		duration: 3 + rand() * 4
	}));
</script>

<div class="backdrop" aria-hidden="true">
	{#each HEARTS as h, i (i)}
		<svg
			class="heart"
			class:love={h.love}
			viewBox="0 0 24 24"
			style:left="{h.x}%"
			style:top="{h.y}%"
			style:width="{h.size}px"
			style:--delay="{h.delay}s"
			style:--duration="{h.duration}s"
		>
			<path
				d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.6 5 6 5c2 0 3.3 1.1 4 2.2.7-1.1 2-2.2 4-2.2 3.4 0 5.1 3.4 3.6 6.8C19.5 16.4 12 21 12 21z"
				fill="currentColor"
			/>
		</svg>
	{/each}
	<div class="field">
		{#each SLOTS as slot, i (i)}
			{@const s = servers[i]}
			<div
				class="card"
				class:corner={slot.corner}
				class:empty={!s}
				style:left={slot.x}
				style:top={slot.top}
				style:bottom={slot.bottom}
				style:--r="{slot.r}deg"
				style:--d="{slot.d}s"
				style:background={gradient(s?.themeColor ?? null)}
			>
				{#if s}
					{#if s.bannerUrl}<img class="photo" src={s.bannerUrl} alt="" loading="lazy" decoding="async" />{/if}
					<div class="scrim"></div>
					<div class="who">
						{#if s.iconUrl}<img class="icon" src={s.iconUrl} alt="" width="22" height="22" loading="lazy" />{/if}
						<b>{s.name ?? s.host}</b>
					</div>
				{/if}
			</div>
		{/each}
	</div>
</div>

<style>
	/* 本文の余白で切れないよう、サイドバーを除いた画面全体に敷く。
	   白地に黄緑（accent）と桃色（love）の淡い光。ダークは中性の暗色に同じ 2 色 */
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: -1;
		overflow: hidden;
		pointer-events: none;
		user-select: none;
		background:
			radial-gradient(ellipse 70% 55% at 15% 20%, color-mix(in srgb, var(--accent) 22%, transparent) 0%, transparent 60%),
			radial-gradient(ellipse 60% 50% at 85% 80%, color-mix(in srgb, var(--love) 18%, transparent) 0%, transparent 60%),
			radial-gradient(ellipse 50% 40% at 80% 15%, color-mix(in srgb, var(--love) 10%, transparent) 0%, transparent 55%),
			var(--bg);
	}
	/* カードは中央（検索ボックスのあたり）を抜く */
	.field {
		position: absolute;
		inset: 0;
		mask-image: radial-gradient(ellipse 40% 44% at 50% 46%, transparent 55%, #000 100%);
	}
	.heart {
		position: absolute;
		height: auto;
		color: var(--accent);
		opacity: 0.35;
		animation: twinkle var(--duration) ease-in-out var(--delay) infinite;
	}
	.heart.love {
		color: var(--love);
	}
	@keyframes twinkle {
		50% {
			opacity: 0.85;
			scale: 1.25;
		}
	}
	/* 浮かぶサーバーのカード（Tinder のトップで背景に散らばるプロフィール写真）。少し傾いてゆっくり漂う */
	.card {
		position: absolute;
		width: 150px;
		aspect-ratio: 3 / 4;
		border-radius: var(--radius);
		overflow: hidden;
		box-shadow: var(--shadow-lg);
		color: #fff;
		rotate: var(--r);
		animation: drift 9s ease-in-out var(--d) infinite;
	}
	.card.empty {
		opacity: 0.45;
	}
	.photo {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.scrim {
		position: absolute;
		inset: 0;
		background: linear-gradient(to top, rgba(0, 0, 0, 0.75) 0%, rgba(0, 0, 0, 0.1) 50%, transparent 75%);
	}
	.who {
		position: absolute;
		left: 10px;
		right: 10px;
		bottom: 10px;
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.7rem;
		min-width: 0;
	}
	.who b {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.icon {
		border-radius: 6px;
		flex-shrink: 0;
	}
	@keyframes drift {
		50% {
			translate: 0 -12px;
			rotate: calc(var(--r) + 3deg);
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
	/* モバイルは四隅のカードだけ、小さく薄く。下段は下のバーとフッターの上に置く */
	@media (max-width: 899px) {
		.field {
			bottom: calc(var(--nav-h) + env(safe-area-inset-bottom) + 40px);
			mask-image: linear-gradient(to bottom, #000 0, transparent 20%, transparent 80%, #000 100%);
		}
		.card {
			width: 80px;
			opacity: 0.6;
		}
		.card:not(.corner) {
			display: none;
		}
	}
</style>
