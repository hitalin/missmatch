<script lang="ts">
	import type { Search } from '$lib/search';
	import Icon from './Icon.svelte';
	import SearchList from './SearchList.svelte';
	import type { Tab } from './Shell.svelte';

	// サイドバー（yamix 型）: ロゴ → ナビ → さがした言葉（ここだけスクロール）→ 新しくさがす。
	// デスクトップの左に常駐し、モバイルではドロワーの中身になる
	let {
		tab,
		likes,
		passed,
		discoverEnabled,
		searches,
		current,
		onchange,
		onselect,
		onrename,
		ondelete
	}: {
		tab: Tab | null;
		likes: number;
		passed: number;
		discoverEnabled: boolean;
		searches: Search[];
		current: string;
		onchange: (t: Tab) => void;
		onselect: (id: string) => void;
		onrename: (id: string, title: string) => void;
		ondelete: (id: string) => void;
	} = $props();

	const items: { tab: Tab; label: string; icon: 'flame' | 'heart' | 'x' | 'user'; badge?: number }[] =
		$derived([
			{ tab: 'discover', label: 'さがす', icon: 'flame' },
			{ tab: 'likes', label: 'いいね', icon: 'heart', badge: likes },
			{ tab: 'passed', label: 'よくないね', icon: 'x', badge: passed },
			{ tab: 'you', label: 'あなた', icon: 'user' }
		]);
</script>

<div class="sidebar">
	<a href="/" class="logo" aria-label="みすまっち（ホーム）">
		<Icon name="heart" size={24} filled />
		<span>みすまっち</span>
	</a>
	<nav aria-label="画面切り替え">
		{#each items as it (it.tab)}
			<button
				class:active={tab === it.tab}
				disabled={it.tab === 'discover' && !discoverEnabled}
				aria-current={tab === it.tab ? 'page' : undefined}
				onclick={() => onchange(it.tab)}
			>
				<Icon name={it.icon} />
				<span>{it.label}</span>
				{#if it.badge}<i class="badge" class:dim={it.tab === 'passed'}>{it.badge}</i>{/if}
			</button>
		{/each}
	</nav>
	<div class="history">
		<p class="head">さがした言葉</p>
		{#if searches.length > 0}
			<SearchList {searches} {current} {onselect} {onrename} {ondelete} />
		{:else}
			<p class="empty">まだありません</p>
		{/if}
	</div>
	<a href="/" class="new">
		<Icon name="plus" size={18} />
		<span>新しくさがす</span>
	</a>
</div>

<style>
	.sidebar {
		height: 100%;
		display: flex;
		flex-direction: column;
		padding: 20px 12px calc(16px + env(safe-area-inset-bottom));
		background: var(--panel);
	}
	.logo {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 14px 20px;
		color: var(--accent);
		font-size: 1.15rem;
		font-weight: 700;
		text-decoration: none;
	}
	nav {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	nav button {
		position: relative;
		height: 40px;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 0 14px;
		border: none;
		border-radius: 999px;
		background: none;
		color: var(--fg-muted);
		font-size: 0.95rem;
		font-weight: 700;
		cursor: pointer;
		transition: background 0.15s;
	}
	nav button:hover:not(:disabled) {
		background: var(--panel-2);
	}
	nav button.active {
		background: var(--accent-soft);
		color: var(--accent-fg);
	}
	nav button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.badge {
		margin-left: auto;
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
	.badge.dim {
		background: var(--fg-muted);
	}
	.history {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		margin-top: 16px;
		padding-top: 14px;
		border-top: 1px solid var(--border);
	}
	.head {
		margin: 0 0 6px;
		padding: 0 10px;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--fg-muted);
	}
	.empty {
		margin: 0;
		padding: 4px 10px;
		font-size: 0.8rem;
		color: var(--fg-muted);
	}
	.new {
		margin-top: 14px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		border-radius: 999px;
		background: var(--accent-grad);
		background-size: 200% 100%;
		box-shadow: var(--shadow-accent);
		transition: background-position 0.3s;
		color: #fff;
		font-size: 0.9rem;
		font-weight: 700;
		text-decoration: none;
		flex-shrink: 0;
	}
	.new:hover {
		background-position: 100% 0;
	}
</style>
