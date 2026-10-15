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
	.ask {
		display: flex;
		flex-wrap: nowrap;
		overflow-x: auto;
		scrollbar-width: none;
		white-space: nowrap;
		align-items: center;
		gap: 6px;
		margin-bottom: 8px;
		font-size: 0.82rem;
	}
	@media (min-width: 900px) {
		.ask {
			flex-wrap: wrap;
			overflow: visible;
		}
	}
	.prompt {
		font-weight: 700;
		color: var(--fg-muted);
		margin-right: 2px;
	}
</style>
