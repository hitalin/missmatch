<script lang="ts">
	import type { AuthUser } from '$lib/auth';
	import type { Search } from '$lib/search';
	import Icon from './Icon.svelte';
	import SearchList from './SearchList.svelte';
	import type { Tab } from './Shell.svelte';

	// サイドバー（yamix 型）: ロゴ → ナビ → さがした言葉（ここだけスクロール）→ 新しくさがす → アカウント。
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
		onnew,
		onrename,
		ondelete,
		user,
		onlogin,
		onlogout
	}: {
		tab: Tab | null;
		likes: number;
		passed: number;
		discoverEnabled: boolean;
		searches: Search[];
		current: string;
		onchange: (t: Tab) => void;
		onselect: (id: string) => void;
		onnew: () => void; // 新しくさがす（言葉の無い検索＝ランディングに戻る）
		onrename: (id: string, title: string) => void;
		ondelete: (id: string) => void;
		user: AuthUser | null; // Misskey でログイン中なら表示
		onlogin: () => void;
		onlogout: () => void;
	} = $props();

	let menu = $state(false); // アカウントメニューの開閉

	const items: { tab: Tab; label: string; icon: 'flame' | 'heart' | 'x' | 'user'; badge?: number }[] =
		$derived([
			{ tab: 'discover', label: 'さがす', icon: 'flame' },
			{ tab: 'likes', label: 'いいね', icon: 'heart', badge: likes },
			{ tab: 'passed', label: 'よくないね', icon: 'x', badge: passed },
			{ tab: 'you', label: 'あなた', icon: 'user' }
		]);
</script>

<svelte:window onkeydown={(e) => menu && e.key === 'Escape' && (menu = false)} />

<div class="sidebar">
	<button class="logo" aria-label="みすまっち（新しくさがす）" onclick={onnew}>
		<img src="/logo.svg" alt="" width="26" height="26" />
		<span>みすまっち</span>
	</button>
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
		{#if searches.some((s) => s.query)}
			<SearchList {searches} {current} {onselect} {onrename} {ondelete} />
		{:else}
			<p class="empty">まだありません</p>
		{/if}
	</div>
	<button class="new" onclick={onnew}>
		<Icon name="plus" size={18} />
		<span>新しくさがす</span>
	</button>
	<!-- アカウント（Misskey 本家のナビバー下部）: アバター + @user@host。押すとメニュー -->
	<div class="account">
		{#if user}
			<button
				class="who"
				aria-haspopup="menu"
				aria-expanded={menu}
				title="アカウント: @{user.username}@{user.host}"
				onclick={() => (menu = !menu)}
			>
				<img class="avatar" src={user.avatarUrl} alt="" width="32" height="32" referrerpolicy="no-referrer" />
				<span class="acct"><span>@{user.username}</span><span class="host">@{user.host}</span></span>
			</button>
			{#if menu}
				<button class="menu-backdrop" aria-label="メニューを閉じる" onclick={() => (menu = false)}></button>
				<div class="menu" role="menu">
					<a class="item" role="menuitem" href="https://{user.host}/@{user.username}" target="_blank" rel="noopener" onclick={() => (menu = false)}>
						<Icon name="external" size={18} /><span>Misskey で開く</span>
					</a>
					<button class="item" role="menuitem" onclick={() => { menu = false; onlogout(); }}>
						<Icon name="power" size={18} /><span>ログアウト</span>
					</button>
				</div>
			{/if}
		{:else}
			<button class="who" onclick={onlogin}>
				<span class="avatar noavatar"><Icon name="user" size={18} /></span>
				<span class="acct">Misskey でログイン</span>
			</button>
		{/if}
	</div>
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
		border: none;
		background: none;
		cursor: pointer;
		font-family: inherit;
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
		background: var(--love);
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
		border: none;
		cursor: pointer;
		font-family: inherit;
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
	.account {
		position: relative;
		margin: 16px 0 0;
		flex-shrink: 0;
	}
	/* 行はナビの項目と同じ字下げ・ピル形。アバター 32px は本家の MkAvatar と同じ */
	.who {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 14px;
		border: none;
		border-radius: 999px;
		background: none;
		font-family: inherit;
		color: var(--fg);
		cursor: pointer;
		text-align: left;
		transition: background 0.15s;
	}
	.who:hover,
	.who[aria-expanded='true'] {
		background: var(--panel-2);
	}
	.avatar {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		flex-shrink: 0;
		object-fit: cover;
	}
	.noavatar {
		display: grid;
		place-items: center;
		background: var(--panel-2);
		color: var(--fg-muted);
	}
	/* acct は 2 行（@user / @host）で、host を省略しない（偽ホストの見分けのため） */
	.acct {
		min-width: 0;
		display: flex;
		flex-direction: column;
		line-height: 1.2;
		font-size: 0.9rem;
		font-weight: 700;
	}
	.acct > span {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.host {
		font-size: 0.72rem;
		font-weight: 400;
		opacity: 0.5;
	}
	/* メニュー（本家の MkMenu）: 行の上に出す。選択中の項目はアクセント色で塗る */
	.menu-backdrop {
		position: fixed;
		inset: 0;
		z-index: 60;
		border: none;
		background: transparent;
		cursor: default;
	}
	.menu {
		position: absolute;
		left: 8px;
		bottom: calc(100% + 6px);
		z-index: 61;
		min-width: 200px;
		padding: 8px 0;
		border-radius: 12px;
		background: var(--panel);
		border: 1px solid var(--border);
		box-shadow: var(--shadow-lg);
		animation: pop 0.14s cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	@keyframes pop {
		from {
			opacity: 0;
			transform: translateY(6px) scale(0.96);
		}
	}
	.item {
		display: flex;
		align-items: center;
		gap: 8px;
		width: calc(100% - 16px);
		margin: 0 8px;
		min-height: 32px;
		padding: 5px 12px;
		border: none;
		border-radius: 6px;
		background: none;
		font: inherit;
		font-size: 0.86rem;
		color: var(--fg);
		text-align: left;
		text-decoration: none;
		cursor: pointer;
	}
	.item:hover {
		background: var(--accent);
		color: #fff;
	}
</style>