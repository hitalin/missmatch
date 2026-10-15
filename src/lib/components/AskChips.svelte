<script lang="ts">
	import { fly } from 'svelte/transition';
	import { ASK_PROMPTS, type AskAxis, askOptions } from '$lib/intent';

	// 言葉から読み取れなかった軸を、生成文でなく選択肢で聞き返す
	let {
		axes,
		onpick
	}: {
		axes: AskAxis[];
		onpick: (axis: AskAxis, choice: string | null) => void; // null = こだわらない
	} = $props();
</script>

{#each axes as axis (axis)}
	<div class="ask" in:fly={{ y: 6, duration: 200 }}>
		<span class="prompt">{ASK_PROMPTS[axis]}？</span>
		{#each askOptions(axis) as o (o.value)}
			<button class="chip" onclick={() => onpick(axis, o.value)}>{o.label}</button>
		{/each}
		<button class="chip ghost" onclick={() => onpick(axis, null)}>こだわらない</button>
	</div>
{/each}

<style>
	/* 1 問 1 行に固定し、入りきらない選択肢は横にスクロール（右端はフェード）。入力欄の高さを変えない */
	.ask {
		display: flex;
		flex-wrap: nowrap;
		overflow-x: auto;
		scrollbar-width: none;
		white-space: nowrap;
		align-items: center;
		gap: 6px;
		padding: 2px 24px 6px 2px;
		margin: 0 -12px 2px 0;
		font-size: 0.82rem;
		mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent);
	}
	.ask::-webkit-scrollbar {
		display: none;
	}
	.ask > :global(*) {
		flex-shrink: 0;
	}
	.prompt {
		font-weight: 700;
		color: var(--fg-muted);
		margin-right: 2px;
	}
</style>
