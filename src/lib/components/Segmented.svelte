<script lang="ts">
	// 3 段のセグメント（左 / どちらでも / 右）。1 タップで決まり、見た目が揺れない
	import type { Lean } from '$lib/prefs';
	let {
		value,
		left,
		right,
		onchange
	}: { value: Lean; left: string; right: string; onchange: (v: Lean) => void } = $props();
	const items: { v: Lean; label: string }[] = $derived([
		{ v: 'left', label: left },
		{ v: 'any', label: 'どちらでも' },
		{ v: 'right', label: right }
	]);
</script>

<div class="seg" role="radiogroup">
	{#each items as item (item.v)}
		<button
			role="radio"
			aria-checked={value === item.v}
			class:on={value === item.v}
			class:any={item.v === 'any'}
			onclick={() => onchange(item.v)}
		>
			{item.label}
		</button>
	{/each}
</div>

<style>
	/* Settings の .seg と同じ形（ピル型トラック + 選んだものだけ黄緑のピル） */
	.seg {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 4px;
		padding: 4px;
		border-radius: 999px;
		background: var(--panel-2);
		box-shadow: inset 0 0 0 1px var(--border);
	}
	button {
		white-space: nowrap;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		border: none;
		background: none;
		border-radius: 999px;
		padding: 10px 8px;
		font-size: 0.84rem;
		font-weight: 700;
		color: var(--fg-muted);
		cursor: pointer;
		transition: color 0.15s;
	}
	button:hover:not(.on) {
		color: var(--fg);
	}
	button.any {
		font-weight: 400;
		font-size: 0.78rem;
	}
	button.on {
		background: var(--accent-grad);
		color: #fff;
		box-shadow: var(--shadow-accent);
	}
</style>
