<script lang="ts">
	export type Tab = 'discover' | 'likes' | 'passed' | 'you';
	let {
		tab,
		likes,
		passed,
		discoverEnabled,
		onchange
	}: {
		tab: Tab;
		likes: number;
		passed: number;
		discoverEnabled: boolean;
		onchange: (t: Tab) => void;
	} = $props();
</script>

<nav class="nav" aria-label="画面切り替え">
	<p class="brand" aria-hidden="true"><span class="logo">♥</span> みすまっち</p>
	<button
		class="main"
		class:active={tab === 'discover'}
		disabled={!discoverEnabled}
		onclick={() => onchange('discover')}
		aria-label="さがす"
	>
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<path
				d="M12 3c1 3.2 4 4.3 4 8.2A4.2 4.2 0 0 1 12 15a4.2 4.2 0 0 1-4-3.8C8 8.8 9.6 7.6 9.6 5.2 10.6 5.8 11.4 6.8 11.5 8 12.4 6.6 12.5 4.8 12 3Z"
			/>
			<path d="M6.5 13.5C6.5 17 9 20 12 20s5.5-3 5.5-6.5" />
		</svg>
		<span>さがす</span>
	</button>
	<button class:active={tab === 'likes'} onclick={() => onchange('likes')} aria-label="いいね">
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
		</svg>
		<span>いいね</span>
		{#if likes > 0}<i class="badge">{likes}</i>{/if}
	</button>
	<button class:active={tab === 'passed'} onclick={() => onchange('passed')} aria-label="よくないね">
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<path d="M6 6l12 12M18 6L6 18" />
		</svg>
		<span>よくないね</span>
		{#if passed > 0}<i class="badge dim">{passed}</i>{/if}
	</button>
	<button class:active={tab === 'you'} onclick={() => onchange('you')} aria-label="あなた">
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<circle cx="12" cy="8" r="4" />
			<path d="M4 20c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
		</svg>
		<span>あなた</span>
	</button>
</nav>

<style>
	.nav {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 30;
		height: calc(var(--nav-h) + env(safe-area-inset-bottom));
		padding-bottom: env(safe-area-inset-bottom);
		background: var(--panel);
		border-top: 1px solid var(--border);
		display: flex;
		justify-content: center;
	}
	.brand {
		display: none;
	}
	.nav button {
		position: relative;
		flex: 1;
		max-width: calc(var(--maxw) / 4);
		background: none;
		border: none;
		cursor: pointer;
		color: var(--fg-muted);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		font-size: 0.68rem;
		font-weight: 700;
	}
	.nav button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.nav button.active {
		color: var(--accent);
	}
	svg {
		width: 26px;
		height: 26px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.9;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.active svg {
		fill: var(--accent-soft);
	}
	.badge.dim {
		background: var(--fg-muted);
	}
	.badge {
		position: absolute;
		top: 8px;
		right: calc(50% - 22px);
		min-width: 18px;
		height: 18px;
		padding: 0 5px;
		border-radius: 999px;
		background: var(--nope);
		color: #fff;
		font-style: normal;
		font-size: 0.68rem;
		display: grid;
		place-items: center;
	}

	/* デスクトップ: 左の縦レール（Misskey / Tinder Web） */
	@media (min-width: 900px) {
		.nav {
			top: 0;
			right: auto;
			bottom: 0;
			width: var(--rail-w);
			height: auto;
			padding: 20px 12px;
			border-top: none;
			border-right: 1px solid var(--border);
			flex-direction: column;
			justify-content: flex-start;
			gap: 4px;
		}
		.brand {
			display: block;
			margin: 0 0 18px 12px;
			font-weight: 900;
			font-size: 1.25rem;
		}
		.logo {
			color: var(--accent);
		}
		.nav button {
			flex: 0 0 auto;
			max-width: none;
			width: 100%;
			flex-direction: row;
			justify-content: flex-start;
			gap: 12px;
			padding: 12px 14px;
			border-radius: 12px;
			font-size: 0.98rem;
		}
		.nav button:hover:not(:disabled) {
			background: var(--panel-2);
		}
		.nav button.active {
			background: var(--accent-soft);
			color: var(--accent-fg);
		}
		.badge {
			position: static;
			margin-left: auto;
		}
	}
</style>
