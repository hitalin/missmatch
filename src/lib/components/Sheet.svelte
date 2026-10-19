<script lang="ts">
	import type { Snippet } from 'svelte';

	// 下から出る詳細シート（背景タップか Esc で閉じる）。さがすの詳細と、いいね一覧の詳細で共有
	let { label, onclose, children }: { label: string; onclose: () => void; children: Snippet } =
		$props();
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<button class="backdrop" aria-label="閉じる" onclick={onclose}></button>
<div class="sheet" role="dialog" aria-modal="true" aria-label={label}>
	<div class="grip"></div>
	{@render children()}
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
		background: rgba(0, 0, 0, 0.45);
		border: none;
		cursor: pointer;
	}
	.sheet {
		position: fixed;
		left: 50%;
		bottom: 0;
		transform: translateX(-50%);
		width: min(100%, var(--maxw));
		max-height: 82dvh;
		overflow-y: auto;
		z-index: 50;
		background: var(--panel);
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		padding: 8px 20px calc(20px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 10px;
		animation: up 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
		box-shadow: var(--shadow-lg);
	}
	@keyframes up {
		from {
			transform: translate(-50%, 40px);
			opacity: 0;
		}
	}
	.grip {
		width: 40px;
		height: 4px;
		border-radius: 2px;
		background: var(--border);
		margin: 0 auto 6px;
	}
	/* デスクトップは下から出すのではなく、画面の中央にダイアログとして出す */
	@media (min-width: 900px) {
		.sheet {
			bottom: auto;
			top: 50%;
			transform: translate(-50%, -50%);
			width: min(560px, calc(100vw - 48px));
			max-height: 86vh;
			border-radius: var(--radius-lg);
			padding-bottom: 20px;
			animation: pop 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
		}
		@keyframes pop {
			from {
				transform: translate(-50%, calc(-50% + 16px));
				opacity: 0;
			}
		}
		.grip {
			display: none;
		}
	}
</style>
