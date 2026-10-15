<script lang="ts">
	import type { Search } from '$lib/search';

	// さがした言葉の一覧（ChatGPT のセッション一覧）。新しい順、開いているものを強調
	let {
		searches,
		current,
		onselect,
		ondelete
	}: {
		searches: Search[];
		current: string;
		onselect: (id: string) => void;
		ondelete: (id: string) => void;
	} = $props();

	const sorted = $derived([...searches].sort((a, b) => b.at - a.at));
</script>

{#if sorted.length > 0}
	<ul class="list" aria-label="さがした言葉">
		{#each sorted as s (s.id)}
			<li class:active={s.id === current}>
				<button class="open" onclick={() => onselect(s.id)}>
					<span class="q" class:muted={!s.query}>{s.query || '条件だけ'}</span>
					{#if s.liked.length > 0}<span class="n">♥{s.liked.length}</span>{/if}
				</button>
				<button class="x" aria-label="「{s.query || '条件だけ'}」を消す" onclick={() => ondelete(s.id)}>
					✕
				</button>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	li {
		display: flex;
		align-items: center;
		border-radius: 10px;
	}
	li.active {
		background: var(--accent-soft);
		color: var(--accent-fg);
	}
	li:hover:not(.active) {
		background: var(--panel-2);
	}
	.open {
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
		font-size: 0.86rem;
		font-weight: 700;
		text-align: left;
		cursor: pointer;
	}
	.q {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.muted {
		color: var(--fg-muted);
		font-weight: 600;
	}
	.n {
		font-size: 0.72rem;
		color: var(--nope);
		flex-shrink: 0;
	}
	.x {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--fg-muted);
		font-weight: 800;
		padding: 8px 10px;
		opacity: 0.6;
	}
	.x:hover {
		opacity: 1;
	}
</style>
