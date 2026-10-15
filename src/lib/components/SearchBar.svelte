<script lang="ts">
	import { resolve } from '$app/paths';
	import type { AskAxis } from '$lib/intent';
	import type { Search } from '$lib/search';
	import AskChips from './AskChips.svelte';
	import Icon from './Icon.svelte';
	import PromptBox from './PromptBox.svelte';

	// いまの検索: 最初の言葉、足した絞り込み（外せる）、もう一言足す箱。
	// 読み取れなかった軸の選択肢は箱の上の行に出す（yamix の入力欄まわりのトグル行）
	let {
		search,
		reading,
		applied,
		asks,
		onrefine,
		ondrop,
		onclear,
		onask
	}: {
		search: Search;
		reading: boolean; // 読み取り中
		applied: boolean; // 噛み合いが今の言葉に対して付いている
		asks: AskAxis[];
		onrefine: (text: string) => void;
		ondrop: (index: number) => void; // 絞り込みを外す
		onclear: () => void; // 検索を外して条件だけに
		onask: (axis: AskAxis, choice: string | null) => void;
	} = $props();

	let text = $state('');
	function submit(t: string) {
		onrefine(t);
		text = '';
	}
</script>

<div class="bar">
	<div class="head" class:applied>
		{#if reading}
			<span class="spin" aria-hidden="true"></span>
			<span class="q">「{search.query}」を読み取っています…</span>
		{:else if search.query}
			<span class="mark"><Icon name="sparkle" size={16} filled /></span>
			<span class="q">「{search.query}」{applied ? 'に合う順' : ''}</span>
			<a class="change" href={resolve('/')}>別の言葉で</a>
			<button class="x" aria-label="検索を外す" onclick={onclear}><Icon name="x" size={14} /></button>
		{:else}
			<span class="q muted">条件だけで並べています</span>
		{/if}
	</div>
	{#if search.turns.length > 0}
		<ul class="turns">
			{#each search.turns as turn, i (i)}
				<li>
					<span>{turn}</span>
					<button aria-label="「{turn}」を外す" disabled={reading} onclick={() => ondrop(i)}>
						<Icon name="x" size={12} />
					</button>
				</li>
			{/each}
		</ul>
	{/if}
	<PromptBox
		bind:value={text}
		label={search.query ? 'もっと絞る' : '言葉を入れて絞る'}
		placeholder={search.query ? 'もっと絞る（例: 小さめ、イラストの話が多い）' : '言葉を入れて絞る'}
		disabled={reading}
		onsubmit={submit}
	>
		{#snippet top()}
			{#if !reading && asks.length > 0}
				<AskChips axes={asks} onpick={onask} />
			{/if}
		{/snippet}
		{#snippet left()}
			<span>Enter で送る · Shift+Enter で改行</span>
		{/snippet}
	</PromptBox>
</div>

<style>
	.bar {
		margin-bottom: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		font-size: 0.82rem;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 4px 0;
		color: var(--fg-muted);
	}
	.head.applied {
		color: var(--accent-fg);
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
		display: inline-flex;
	}
	.change {
		font-weight: 800;
		font-size: 0.78rem;
		white-space: nowrap;
	}
	.x {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--fg-muted);
		padding: 2px;
		display: inline-flex;
		border-radius: 50%;
	}
	.x:hover {
		background: var(--panel-2);
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
		padding: 0 4px;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.turns li {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 6px 4px 10px;
		border-radius: 999px;
		background: var(--accent-soft);
		border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
		color: var(--accent-fg);
		font-size: 0.74rem;
		font-weight: 700;
	}
	.turns button {
		background: none;
		border: none;
		cursor: pointer;
		color: inherit;
		display: inline-flex;
		padding: 2px;
		border-radius: 50%;
		opacity: 0.7;
	}
	.turns button:hover {
		opacity: 1;
	}
</style>
