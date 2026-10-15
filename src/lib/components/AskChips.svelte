<script lang="ts">
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
	<div class="ask">
		<span class="prompt">{ASK_PROMPTS[axis]}？</span>
		{#each askOptions(axis) as o (o.value)}
			<button onclick={() => onpick(axis, o.value)}>{o.label}</button>
		{/each}
		<button class="skip" onclick={() => onpick(axis, null)}>こだわらない</button>
	</div>
{/each}

<style>
	.ask {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		margin-bottom: 8px;
		font-size: 0.82rem;
	}
	.prompt {
		font-weight: 700;
		color: var(--fg-muted);
		margin-right: 2px;
	}
	button {
		font: inherit;
		font-size: 0.8rem;
		font-weight: 700;
		padding: 5px 11px;
		border-radius: 999px;
		border: 1px solid var(--border);
		background: var(--panel);
		color: var(--fg);
		cursor: pointer;
	}
	button:hover {
		border-color: var(--accent);
	}
	.skip {
		color: var(--fg-muted);
		font-weight: 600;
	}
</style>
