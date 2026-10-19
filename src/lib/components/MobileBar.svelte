<script lang="ts">
	import Icon from './Icon.svelte';
	import type { Tab } from './Shell.svelte';

	// モバイルの下タブバー（yamix 型）: 左端がメニュー（ドロワー）、あとはタブ
	let {
		tab,
		likes,
		passed,
		discoverEnabled,
		onchange,
		onmenu
	}: {
		tab: Tab | null;
		likes: number;
		passed: number;
		discoverEnabled: boolean;
		onchange: (t: Tab) => void;
		onmenu: () => void;
	} = $props();
</script>

<nav class="bar" aria-label="画面切り替え">
	<button onclick={onmenu} aria-label="メニュー"><Icon name="menu" /></button>
	<button
		class:active={tab === 'discover'}
		disabled={!discoverEnabled}
		onclick={() => onchange('discover')}
		aria-label="さがす"
	>
		<Icon name="flame" />
	</button>
	<button class:active={tab === 'likes'} onclick={() => onchange('likes')} aria-label="いいね">
		<Icon name="heart" />
		{#if likes > 0}<i class="badge">{likes}</i>{/if}
	</button>
	<button class:active={tab === 'passed'} onclick={() => onchange('passed')} aria-label="よくないね">
		<Icon name="x" />
		{#if passed > 0}<i class="badge dim">{passed}</i>{/if}
	</button>
	<button class:active={tab === 'you'} onclick={() => onchange('you')} aria-label="あなた">
		<Icon name="user" />
	</button>
</nav>

<style>
	.bar {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 30;
		height: calc(var(--nav-h) + env(safe-area-inset-bottom));
		padding-bottom: env(safe-area-inset-bottom);
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 1fr;
		justify-items: center;
		align-items: center;
		background: var(--glass);
		-webkit-backdrop-filter: blur(12px);
		backdrop-filter: blur(12px);
		border-top: 1px solid var(--border);
	}
	button {
		position: relative;
		width: 42px;
		height: 42px;
		border: none;
		border-radius: 50%;
		background: none;
		color: var(--fg-muted);
		cursor: pointer;
		display: grid;
		place-items: center;
	}
	button.active {
		background: var(--accent-soft);
		color: var(--accent-fg);
	}
	button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.badge {
		position: absolute;
		top: 2px;
		right: -2px;
		min-width: 17px;
		height: 17px;
		padding: 0 4px;
		border-radius: 999px;
		background: var(--love);
		color: #fff;
		font-style: normal;
		font-size: 0.64rem;
		display: grid;
		place-items: center;
	}
	.badge.dim {
		background: var(--fg-muted);
	}
	@media (min-width: 900px) {
		.bar {
			display: none;
		}
	}
</style>
