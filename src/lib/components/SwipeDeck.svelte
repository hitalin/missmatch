<script lang="ts">
	import type { Match } from '$lib/types';
	import ServerCard from './ServerCard.svelte';

	let {
		matches,
		onlike,
		onpass,
		ondone
	}: {
		matches: Match[];
		onlike: (m: Match) => void;
		onpass: (m: Match) => void;
		ondone: () => void;
	} = $props();

	const THRESHOLD = 90;
	const FLY_MS = 320;

	let index = $state(0);
	let dx = $state(0);
	let dy = $state(0);
	let dragging = $state(false);
	let leaving = $state<'left' | 'right' | null>(null);
	let expanded = $state(false);
	let startX = 0;
	let startY = 0;

	const current = $derived(matches[index]);
	const remaining = $derived(matches.length - index);
	const rotation = $derived(dx * 0.06);
	const likeOpacity = $derived(Math.min(1, Math.max(0, dx / THRESHOLD)));
	const passOpacity = $derived(Math.min(1, Math.max(0, -dx / THRESHOLD)));

	function onpointerdown(e: PointerEvent) {
		if (leaving || expanded) return;
		dragging = true;
		startX = e.clientX;
		startY = e.clientY;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onpointermove(e: PointerEvent) {
		if (!dragging) return;
		dx = e.clientX - startX;
		dy = e.clientY - startY;
	}

	function onpointerup() {
		if (!dragging) return;
		dragging = false;
		if (dx > THRESHOLD) fly('right');
		else if (dx < -THRESHOLD) fly('left');
		else {
			dx = 0;
			dy = 0;
		}
	}

	function fly(dir: 'left' | 'right') {
		if (leaving || !current) return;
		leaving = dir;
		expanded = false;
		dx = dir === 'right' ? 800 : -800;
		const target = current;
		setTimeout(() => {
			if (dir === 'right') onlike(target);
			else onpass(target);
			index += 1;
			dx = 0;
			dy = 0;
			leaving = null;
			if (index >= matches.length) ondone();
		}, FLY_MS);
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowRight') fly('right');
		else if (e.key === 'ArrowLeft') fly('left');
		else if (e.key === 'ArrowUp' || e.key === ' ') {
			e.preventDefault();
			expanded = !expanded;
		}
	}
</script>

<svelte:window {onkeydown} />

<section class="deck">
	<p class="counter">あと {remaining} 件</p>

	<div class="stack">
		{#each matches.slice(index, index + 3).reverse() as m, rev (m.server.host)}
			{@const depth = Math.min(2, remaining - 1) - rev}
			{#if depth === 0}
				<div
					class="slot top"
					class:dragging
					class:expanded
					style:transform={`translate(${dx}px, ${dy}px) rotate(${rotation}deg)`}
					{onpointerdown}
					{onpointermove}
					{onpointerup}
					onpointercancel={onpointerup}
					role="group"
					aria-label="{m.server.name ?? m.server.host} のカード"
				>
					<div class="stamp like" style:opacity={likeOpacity}>いいね</div>
					<div class="stamp pass" style:opacity={passOpacity}>パス</div>
					<ServerCard match={m} {expanded} />
				</div>
			{:else}
				<div class="slot" style:transform={`translateY(${depth * 12}px) scale(${1 - depth * 0.04})`}>
					<ServerCard match={m} />
				</div>
			{/if}
		{/each}
	</div>

	<div class="actions">
		<button class="round pass" onclick={() => fly('left')} aria-label="パス">✕</button>
		<button
			class="round info"
			class:active={expanded}
			onclick={() => (expanded = !expanded)}
			aria-label="詳しく見る"
		>
			i
		</button>
		<button class="round like" onclick={() => fly('right')} aria-label="いいね">♥</button>
	</div>
	<p class="hint">左右にスワイプ、または ← → キー</p>
</section>

<style>
	.deck {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		user-select: none;
	}
	.counter {
		margin: 0;
		color: var(--muted);
		font-size: 0.85rem;
	}
	.stack {
		position: relative;
		width: 100%;
		max-width: 420px;
		height: min(560px, 72vh);
	}
	.slot {
		position: absolute;
		inset: 0;
		transition: transform 0.3s ease;
		touch-action: none;
	}
	.slot.top {
		cursor: grab;
		z-index: 3;
	}
	.slot.top.dragging {
		cursor: grabbing;
		transition: none;
	}
	.slot.top.expanded {
		z-index: 4;
	}
	.stamp {
		position: absolute;
		top: 28px;
		z-index: 2;
		padding: 6px 14px;
		border: 4px solid;
		border-radius: 10px;
		font-size: 1.6rem;
		font-weight: 900;
		letter-spacing: 0.1em;
		background: rgba(255, 255, 255, 0.85);
		pointer-events: none;
	}
	.stamp.like {
		left: 20px;
		color: var(--accent);
		border-color: var(--accent);
		transform: rotate(-14deg);
	}
	.stamp.pass {
		right: 20px;
		color: var(--pass);
		border-color: var(--pass);
		transform: rotate(14deg);
	}
	.actions {
		display: flex;
		gap: 20px;
		align-items: center;
		margin-top: 8px;
	}
	.round {
		width: 60px;
		height: 60px;
		border-radius: 50%;
		border: 1px solid var(--border);
		font-size: 1.6rem;
		font-weight: 800;
		cursor: pointer;
		display: grid;
		place-items: center;
		background: var(--surface);
		color: var(--text);
		box-shadow: var(--shadow);
		transition: transform 0.1s;
	}
	.round:active {
		transform: scale(0.92);
	}
	.round.pass {
		color: var(--pass);
	}
	.round.like {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
		width: 72px;
		height: 72px;
		font-size: 2rem;
		box-shadow: 0 8px 22px rgba(134, 179, 0, 0.45);
	}
	.round.info {
		width: 48px;
		height: 48px;
		font-size: 1.1rem;
		font-family: Georgia, serif;
		font-style: italic;
		color: var(--accent-text);
	}
	.round.info.active {
		background: var(--accent-soft);
		border-color: var(--accent);
	}
	.hint {
		margin: 0;
		color: var(--muted);
		font-size: 0.75rem;
	}
</style>
