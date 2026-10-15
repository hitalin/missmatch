<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fade, fly } from 'svelte/transition';

	// モバイルのドロワー: 左からスライド、オーバーレイのクリックか Esc で閉じる。開いている間は本文をスクロールさせない
	let { onclose, children }: { onclose: () => void; children: Snippet } = $props();

	$effect(() => {
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		const onkey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onclose();
		};
		window.addEventListener('keydown', onkey);
		return () => {
			document.body.style.overflow = prev;
			window.removeEventListener('keydown', onkey);
		};
	});
</script>

<div class="drawer">
	<button class="overlay" aria-label="閉じる" onclick={onclose} transition:fade={{ duration: 200 }}
	></button>
	<div class="panel" role="dialog" aria-modal="true" transition:fly={{ x: -260, duration: 300 }}>
		{@render children()}
	</div>
</div>

<style>
	.drawer {
		position: fixed;
		inset: 0;
		z-index: 50;
	}
	.overlay {
		position: absolute;
		inset: 0;
		border: none;
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(2px);
		cursor: pointer;
	}
	.panel {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 0;
		width: var(--rail-w);
		max-width: 85vw;
		background: var(--panel);
		box-shadow: var(--shadow-lg);
	}
</style>
