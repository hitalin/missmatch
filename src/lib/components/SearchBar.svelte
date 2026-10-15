<script lang="ts">
	import { resolve } from '$app/paths';
	import { MAX_INTENT_LENGTH } from '$lib/intent';
	import type { Search } from '$lib/search';

	// いまの検索: 最初の言葉、足した絞り込み（外せる）、もう一言足す入力欄
	let {
		search,
		reading,
		applied,
		onrefine,
		ondrop,
		onclear
	}: {
		search: Search;
		reading: boolean; // 読み取り中
		applied: boolean; // 噛み合いが今の言葉に対して付いている
		onrefine: (text: string) => void;
		ondrop: (index: number) => void; // 絞り込みを外す
		onclear: () => void; // 検索を外して条件だけに
	} = $props();

	let text = $state('');

	function submit(e: SubmitEvent) {
		e.preventDefault();
		const t = text.trim().slice(0, MAX_INTENT_LENGTH);
		if (t.length < 2 || reading) return;
		onrefine(t);
		text = '';
	}
</script>

<div class="bar" class:applied>
	<div class="head">
		{#if reading}
			<span class="spin" aria-hidden="true"></span>
			<span class="q">「{search.query}」を読み取っています…</span>
		{:else if search.query}
			<span class="mark" aria-hidden="true">✦</span>
			<span class="q">「{search.query}」{applied ? 'に合う順' : ''}</span>
			<a class="change" href={resolve('/')}>別の言葉で</a>
			<button class="x" aria-label="検索を外す" onclick={onclear}>✕</button>
		{:else}
			<span class="q muted">条件だけで並べています</span>
		{/if}
	</div>
	{#if search.turns.length > 0}
		<ul class="turns">
			{#each search.turns as turn, i (i)}
				<li>
					<span>{turn}</span>
					<button aria-label="「{turn}」を外す" disabled={reading} onclick={() => ondrop(i)}>✕</button>
				</li>
			{/each}
		</ul>
	{/if}
	<form class="refine" onsubmit={submit}>
		<label class="sr-only" for="refine">{search.query ? 'もっと絞る' : '言葉を入れて絞る'}</label>
		<input
			id="refine"
			type="search"
			bind:value={text}
			maxlength={MAX_INTENT_LENGTH}
			placeholder={search.query ? 'もっと絞る（例: 小さめ、イラストの話が多い）' : '言葉を入れて絞る'}
			enterkeyhint="search"
			autocomplete="off"
			disabled={reading}
		/>
		<button type="submit" disabled={reading || text.trim().length < 2} aria-label="絞る">→</button>
	</form>
</div>

<style>
	.bar {
		margin-bottom: 10px;
		padding: 8px 12px;
		border-radius: 18px;
		background: var(--panel);
		border: 1px solid var(--border);
		font-size: 0.82rem;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.bar.applied {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--accent-fg);
	}
	.head {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.q {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 700;
	}
	.mark {
		color: var(--accent);
	}
	.change {
		font-weight: 800;
		font-size: 0.8rem;
		white-space: nowrap;
	}
	.x {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--fg-muted);
		font-weight: 800;
		padding: 2px 4px;
	}
	.spin {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		border: 2px solid var(--border);
		border-top-color: var(--accent);
		animation: spin 0.8s linear infinite;
		flex-shrink: 0;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.turns {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.turns li {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 3px 6px 3px 10px;
		border-radius: 999px;
		background: var(--panel);
		border: 1px solid var(--border);
		color: var(--fg);
		font-weight: 700;
	}
	.turns button {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--fg-muted);
		font-weight: 800;
		padding: 0 2px;
	}
	.refine {
		display: flex;
		align-items: center;
		gap: 6px;
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 2px 2px 2px 12px;
	}
	.refine:focus-within {
		border-color: var(--accent);
	}
	.refine input {
		flex: 1;
		min-width: 0;
		font: inherit;
		font-size: 0.9rem;
		background: none;
		border: none;
		color: var(--fg);
		padding: 6px 0;
	}
	.refine input:focus {
		outline: none;
	}
	.refine input::-webkit-search-cancel-button {
		display: none;
	}
	.refine button {
		width: 30px;
		height: 30px;
		border-radius: 50%;
		border: none;
		background: var(--accent);
		color: #fff;
		font-weight: 900;
		cursor: pointer;
		flex-shrink: 0;
	}
	.refine button:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
</style>
