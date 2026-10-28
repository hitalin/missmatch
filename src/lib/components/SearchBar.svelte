<script lang="ts">
	import Icon from './Icon.svelte';

	// 足した絞り込みの言葉（外せる）。最初の言葉はサイドバーの一覧に、言葉を足す箱は Composer にある
	// サーバー探しと人探しで同じものを使う
	let {
		turns,
		reading,
		ondrop
	}: {
		turns: string[];
		reading: boolean; // 読み取り中
		ondrop: (index: number) => void; // 絞り込みを外す
	} = $props();
</script>

{#if turns.length > 0}
	<ul class="turns">
		{#each turns as turn, i (i)}
			<li>
				<span>{turn}</span>
				<button aria-label="「{turn}」を外す" disabled={reading} onclick={() => ondrop(i)}>
					<Icon name="x" size={12} />
				</button>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.turns {
		list-style: none;
		margin: 0 0 10px;
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
