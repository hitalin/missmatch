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
	.seg {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		background: var(--panel-2);
		border-radius: 12px;
		padding: 3px;
		gap: 3px;
	}
	button {
		border: none;
		background: none;
		border-radius: 10px;
		padding: 9px 10px;
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--fg-muted);
		cursor: pointer;
	}
	button.any {
		font-weight: 600;
		font-size: 0.78rem;
	}
	button.on {
		background: var(--panel);
		color: var(--accent-fg);
		box-shadow: var(--shadow);
	}
</style>
