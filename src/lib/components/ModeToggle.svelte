<script lang="ts">
	import Icon from './Icon.svelte';

	// ChatGPT の「チャット / Work」、Claude の「チャット / Cowork」と同じ、画面上部のモード切替。
	// サーバーとマッチングするか、人とマッチングするか
	let { mode, onchange }: { mode: 'server' | 'people'; onchange: (m: 'server' | 'people') => void } =
		$props();
</script>

<div class="toggle" role="tablist" aria-label="何とマッチングするか">
	<button role="tab" aria-selected={mode === 'server'} class:on={mode === 'server'} onclick={() => onchange('server')}>
		<Icon name="flame" size={16} /><span>Server</span>
	</button>
	<button role="tab" aria-selected={mode === 'people'} class:on={mode === 'people'} onclick={() => onchange('people')}>
		<Icon name="user" size={16} /><span>User</span>
	</button>
</div>

<style>
	.toggle {
		position: relative;
		z-index: 5; /* ランディングの背景（上にはみ出す）より前に出す */
		align-self: center;
		margin-bottom: 4px;
		display: inline-flex;
		gap: 2px;
		padding: 3px;
		border-radius: 999px;
		background: var(--panel-2);
		box-shadow: inset 0 0 0 1px var(--border);
	}
	button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 16px;
		border: none;
		border-radius: 999px;
		background: none;
		color: var(--fg-muted);
		font-family: inherit;
		font-size: 0.84rem;
		font-weight: 700;
		cursor: pointer;
		transition:
			background 0.15s,
			color 0.15s;
	}
	button:hover:not(.on) {
		color: var(--fg);
	}
	button.on {
		background: var(--panel);
		color: var(--fg);
		box-shadow: var(--shadow);
	}
</style>
