<script lang="ts">
	// 読み込み中の表示（misskey-hub のスピナーと同じ形: 薄い輪の上を円弧が回る）
	let { size = 38, label = '読み込み中' }: { size?: number; label?: string } = $props();
</script>

<span class="spinner" role="status" aria-label={label} style:--size="{size}px">
	<svg class="bg" viewBox="0 0 168 168"><circle cx="84" cy="84" r="72" /></svg>
	<svg class="fg" viewBox="0 0 168 168"><path d="M156 84A72 72 0 0 0 84 12" /></svg>
</span>

<style>
	.spinner {
		position: relative;
		display: inline-block;
		width: var(--size);
		height: var(--size);
		color: var(--spinner-color, var(--accent));
		cursor: wait;
	}
	svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		fill: none;
		stroke: currentColor;
		stroke-width: 24;
		stroke-linecap: round;
	}
	.bg {
		opacity: 0.275;
	}
	.fg {
		animation: spin 0.5s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
