<script lang="ts">
	import { slide } from 'svelte/transition';
	import { groupSearches, type Search, searchTitle } from '$lib/search';
	import Icon from './Icon.svelte';

	// さがした言葉の一覧（yamix のセッション一覧）: 日付でまとめ、1 行は題名だけ。
	// 操作はホバーで出る「…」メニュー（名前を変更 / 消す）に集約
	let {
		searches,
		current,
		onselect,
		onrename,
		ondelete
	}: {
		searches: Search[];
		current: string;
		onselect: (id: string) => void;
		onrename: (id: string, title: string) => void;
		ondelete: (id: string) => void;
	} = $props();

	const groups = $derived(groupSearches(searches));
	let menuFor = $state<string | null>(null);
	let editing = $state<{ id: string; title: string } | null>(null);

	function startRename(s: Search) {
		menuFor = null;
		editing = { id: s.id, title: searchTitle(s) };
	}
	function commitRename() {
		if (editing) onrename(editing.id, editing.title);
		editing = null;
	}
	function onkey(e: KeyboardEvent) {
		if (e.key === 'Enter') commitRename();
		if (e.key === 'Escape') editing = null;
	}
	// メニューの外を押したら閉じる
	$effect(() => {
		if (!menuFor) return;
		const close = (e: PointerEvent) => {
			if (!(e.target as Element).closest('[data-menu]')) menuFor = null;
		};
		window.addEventListener('pointerdown', close);
		return () => window.removeEventListener('pointerdown', close);
	});
</script>

{#each groups as g (g.label)}
	<p class="group"><span>{g.label}</span></p>
	<ul class="list">
		{#each g.searches as s (s.id)}
			<li class:active={s.id === current} class:open={menuFor === s.id}>
				{#if editing?.id === s.id}
					<!-- svelte-ignore a11y_autofocus -->
					<input
						class="rename"
						bind:value={editing.title}
						onkeydown={onkey}
						onblur={commitRename}
						autofocus
						aria-label="名前"
					/>
				{:else}
					<button class="open-btn" onclick={() => onselect(s.id)}>
						<span class="title" class:muted={!s.query && !s.title}>{searchTitle(s)}</span>
						{#if s.liked.length > 0}<span class="n"><Icon name="heart" size={11} filled />{s.liked.length}</span>{/if}
					</button>
					<div class="menu-wrap" data-menu>
						<button
							class="more"
							aria-label="メニュー"
							aria-expanded={menuFor === s.id}
							onclick={() => (menuFor = menuFor === s.id ? null : s.id)}
						>
							<Icon name="more" size={16} />
						</button>
						{#if menuFor === s.id}
							<div class="menu" role="menu" transition:slide={{ duration: 150 }}>
								<button role="menuitem" onclick={() => startRename(s)}>
									<Icon name="edit" size={15} />名前を変更
								</button>
								<button
									role="menuitem"
									class="danger"
									onclick={() => {
										menuFor = null;
										ondelete(s.id);
									}}
								>
									<Icon name="trash" size={15} />消す
								</button>
							</div>
						{/if}
					</div>
				{/if}
			</li>
		{/each}
	</ul>
{/each}

<style>
	.group {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 10px 0 4px;
		padding: 0 10px;
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--fg-muted);
	}
	.group::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--border);
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	li {
		position: relative;
		display: flex;
		align-items: center;
		border-radius: 12px;
		border: 1px solid transparent;
		transition: background 0.15s;
	}
	li.active {
		background: var(--accent-soft);
		border-color: color-mix(in srgb, var(--accent) 30%, transparent);
		color: var(--accent-fg);
	}
	li:hover:not(.active) {
		background: var(--panel-2);
	}
	.open-btn {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		background: none;
		border: none;
		color: inherit;
		font: inherit;
		font-size: 0.82rem;
		font-weight: 700;
		text-align: left;
		cursor: pointer;
	}
	.title {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.muted {
		color: var(--fg-muted);
		font-weight: 400;
	}
	.n {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		font-size: 0.7rem;
		color: var(--nope);
		flex-shrink: 0;
	}
	.menu-wrap {
		position: relative;
		flex-shrink: 0;
	}
	.more {
		width: 26px;
		height: 26px;
		margin-right: 4px;
		border: none;
		border-radius: 50%;
		background: none;
		color: var(--fg-muted);
		cursor: pointer;
		display: grid;
		place-items: center;
		opacity: 0;
		transition: opacity 0.15s;
	}
	li:hover .more,
	li.open .more,
	.more:focus-visible {
		opacity: 1;
	}
	@media (hover: none) {
		.more {
			opacity: 1;
		}
	}
	.more:hover {
		background: var(--panel);
	}
	.menu {
		position: absolute;
		right: 0;
		top: 100%;
		z-index: 10;
		min-width: 150px;
		padding: 4px;
		border-radius: 10px;
		background: var(--panel);
		border: 1px solid var(--border);
		box-shadow: var(--shadow-lg);
		display: flex;
		flex-direction: column;
	}
	.menu button {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 12px;
		border: none;
		border-radius: 8px;
		background: none;
		color: var(--fg);
		font-size: 0.82rem;
		font-weight: 400;
		text-align: left;
		cursor: pointer;
	}
	.menu button:hover {
		background: var(--panel-2);
	}
	.menu .danger {
		color: var(--nope);
	}
	.rename {
		flex: 1;
		min-width: 0;
		margin: 3px 4px;
		padding: 5px 8px;
		font: inherit;
		font-size: 0.82rem;
		font-weight: 700;
		border: 1px solid var(--accent);
		border-radius: 8px;
		background: var(--panel);
		color: var(--fg);
	}
	.rename:focus {
		outline: none;
	}
</style>
