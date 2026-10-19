<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Match } from '$lib/types';
	import Icon from './Icon.svelte';
	import ServerCard from './ServerCard.svelte';
	import ServerDetails from './ServerDetails.svelte';
	import Sheet from './Sheet.svelte';
	import Spinner from './Spinner.svelte';

	// Tinder のデッキ: ドラッグでスワイプ、スタンプ、丸ボタン、戻す、詳細シート
	let {
		matches,
		onlike,
		onpass,
		onundo,
		onexhausted,
		onsettings,
		total,
		busy = '',
		composer
	}: {
		matches: Match[];
		total: number; // いまの条件で残っているカードの総数（このデッキ以外も含む）
		onlike: (m: Match) => void;
		onpass: (m: Match) => void;
		onundo: (m: Match, action: 'like' | 'pass') => void;
		onexhausted: () => void; // このデッキを見終わった（次の束を頼む）
		onsettings: () => void;
		busy?: string; // Clef が読み取り中の言葉（空でなければ、カードと判定の上にスピナーを重ねて古い並びを隠す）
		composer?: Snippet; // 言葉を足す箱。モバイルは束の下、デスクトップは右パネルの下に置く
	} = $props();

	const THRESHOLD = 90;
	const FLY_MS = 300;

	let index = $state(0);
	let dx = $state(0);
	let dy = $state(0);
	let dragging = $state(false);
	let leaving = $state<'left' | 'right' | null>(null);
	let sheet = $state(false);
	let history = $state<{ match: Match; action: 'like' | 'pass' }[]>([]);
	let startX = 0;
	let startY = 0;
	let pointerId: number | null = null;

	const current = $derived(matches[index] as Match | undefined);
	const stack = $derived(matches.slice(index, index + 3));
	const rotation = $derived(dx * 0.05);
	const likeOpacity = $derived(Math.min(1, Math.max(0, dx / THRESHOLD)));
	const passOpacity = $derived(Math.min(1, Math.max(0, -dx / THRESHOLD)));

	function onpointerdown(e: PointerEvent) {
		if (leaving || sheet || e.button !== 0) return;
		dragging = true;
		pointerId = e.pointerId;
		startX = e.clientX;
		startY = e.clientY;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}
	function onpointermove(e: PointerEvent) {
		if (!dragging || e.pointerId !== pointerId) return;
		dx = e.clientX - startX;
		dy = (e.clientY - startY) * 0.4;
	}
	function onpointerup(e: PointerEvent) {
		if (!dragging || e.pointerId !== pointerId) return;
		dragging = false;
		pointerId = null;
		if (dx > THRESHOLD) fly('right');
		else if (dx < -THRESHOLD) fly('left');
		else if (Math.abs(dx) < 4 && Math.abs(dy) < 4) {
			sheet = true; // タップで詳細
			dx = 0;
			dy = 0;
		} else {
			dx = 0;
			dy = 0;
		}
	}

	function fly(dir: 'left' | 'right') {
		if (leaving || !current) return;
		leaving = dir;
		sheet = false;
		dx = dir === 'right' ? 700 : -700;
		dy = dy || 0;
		const target = current;
		setTimeout(() => {
			if (dir === 'right') onlike(target);
			else onpass(target);
			history = [...history, { match: target, action: dir === 'right' ? 'like' : 'pass' }];
			index += 1;
			dx = 0;
			dy = 0;
			leaving = null;
			if (index >= matches.length) onexhausted();
		}, FLY_MS);
	}

	function undo() {
		const last = history.at(-1);
		if (!last || leaving) return;
		history = history.slice(0, -1);
		index = Math.max(0, index - 1);
		onundo(last.match, last.action);
	}

	function onkeydown(e: KeyboardEvent) {
		if (busy) return;
		if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
		if (e.key === 'ArrowRight') fly('right');
		else if (e.key === 'ArrowLeft') fly('left');
		else if (e.key === 'ArrowUp' || e.key === ' ') {
			e.preventDefault();
			sheet = !sheet;
		} else if (e.key === 'Escape') sheet = false;
		else if (e.key === 'Backspace') undo();
	}

</script>

<svelte:window {onkeydown} />


<section class="discover" class:busy={!!busy}>
	{#if current}
		<div class="stack">
			{#if busy}
				<div class="busy-layer">
					<Spinner label="読み取り中" />
					<p>Clef で読み取り中</p>
				</div>
			{/if}
			{#each stack.toReversed() as m, rev (m.server.host)}
				{@const depth = stack.length - 1 - rev}
				{#if depth === 0}
					<div
						class="slot top"
						class:dragging
						class:leaving={leaving !== null}
						style:transform={`translate3d(${dx}px, ${dy}px, 0) rotate(${rotation}deg)`}
						{onpointerdown}
						{onpointermove}
						{onpointerup}
						onpointercancel={onpointerup}
						role="group"
						aria-label="{m.server.name ?? m.server.host} のカード。タップで詳細"
					>
						<div class="stamp like" style:opacity={likeOpacity}>LIKE</div>
						<div class="stamp nope" style:opacity={passOpacity}>NOPE</div>
						<ServerCard match={m} eager />
					</div>
				{:else}
					<div class="slot" style:transform={`translate3d(0, ${depth * 10}px, 0) scale(${1 - depth * 0.04})`}>
						<ServerCard match={m} />
					</div>
				{/if}
			{/each}
		</div>

		<div class="actions">
			<button class="round small" onclick={undo} disabled={history.length === 0} aria-label="ひとつ戻す"><Icon name="undo" size={18} /></button>
			<button class="round nope" onclick={() => fly('left')} aria-label="パス"><Icon name="x" size={26} /></button>
			<button class="round small info" onclick={() => (sheet = true)} aria-label="詳しく見る">i</button>
			<button class="round like" onclick={() => fly('right')} aria-label="いいね"><Icon name="heart" size={26} filled /></button>
		</div>
		<p class="hint">左右にスワイプ · タップで詳細 · ← → キー</p>
	{:else}
		<div class="done">
			<p class="big"><Icon name={total === 0 && matches.length === 0 ? 'search' : 'sparkle'} size={40} /></p>
			{#if matches.length === 0}
				<h2>条件に合うカードがありません</h2>
				<p class="muted">絶対条件や規模・流速を緩めると出ます。</p>
			{:else}
				<h2>いまの条件のカードは見終わりました</h2>
				<p class="muted">条件を変えるか、よくないねから戻すと続きが出ます。</p>
			{/if}
			<button class="btn primary" onclick={onsettings}>条件を見直す</button>
		</div>
	{/if}

	<!-- 右列: 判定パネル（縮む・内側スクロール）+ 言葉を足す箱（中身の高さを保って残りを埋める）。
	     モバイルでは display: contents で束の下に並ぶ -->
	{#if current}
		<div class="right">
			<aside class="aside panel">
				<ServerDetails match={current} />
			</aside>
			{#if composer}<div class="composer-slot">{@render composer()}</div>{/if}
		</div>
	{/if}

	{#if sheet && current}
		{@const host = current.server.host}
		<div class="mobile-only">
			<Sheet label="{current.server.name ?? host} の詳細" onclose={() => (sheet = false)}>
				<ServerDetails match={current} full>
					{#snippet actions()}
						<a class="btn secondary" href="https://{host}/" target="_blank" rel="noopener">サーバーを見る</a>
						<button class="btn primary" onclick={() => fly('right')}><Icon name="heart" size={15} filled /> いいね</button>
					{/snippet}
				</ServerDetails>
			</Sheet>
		</div>
	{/if}
</section>

<style>
	/* 親（さがすタブ）の残りの高さに収まるよう、カードの束が伸び縮みする */
	.discover {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding-top: 6px;
	}
	.stack {
		position: relative;
		width: 100%;
		flex: 1;
		min-height: 380px;
		max-height: 640px;
	}
	/* 読み取り中: 古いカードと判定をぼかして隠し、操作させない */
	.busy-layer {
		position: absolute;
		inset: 0;
		z-index: 20;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 14px;
		padding: 24px;
		border-radius: var(--radius-lg);
		background: var(--glass);
		-webkit-backdrop-filter: blur(14px);
		backdrop-filter: blur(14px);
		text-align: center;
		font-size: 0.86rem;
		font-weight: 700;
		color: var(--fg-muted);
		animation: fade-in 0.2s ease;
	}
	.busy-layer p {
		margin: 0;
	}
	.busy .actions,
	.busy .aside {
		opacity: 0.35;
		pointer-events: none;
		filter: blur(2px);
		transition:
			opacity 0.2s,
			filter 0.2s;
	}
	@keyframes fade-in {
		from {
			opacity: 0;
		}
	}
	.slot {
		position: absolute;
		inset: 0;
		transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
		touch-action: none;
		will-change: transform;
	}
	.slot.top {
		cursor: grab;
		z-index: 3;
	}
	.slot.top.dragging {
		cursor: grabbing;
		transition: none;
	}
	.slot.top.leaving {
		transition: transform 0.3s ease-in;
	}
	.stamp {
		position: absolute;
		top: 26px;
		z-index: 2;
		padding: 4px 12px;
		border: 4px solid;
		border-radius: 8px;
		font-size: 1.9rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		pointer-events: none;
	}
	.stamp.like {
		left: 22px;
		color: #9be000;
		border-color: #9be000;
		transform: rotate(-16deg);
	}
	.stamp.nope {
		right: 22px;
		color: var(--nope);
		border-color: var(--nope);
		transform: rotate(16deg);
	}
	.actions {
		display: flex;
		gap: 14px;
		align-items: center;
		margin-top: 4px;
	}
	.round {
		width: 64px;
		height: 64px;
		border-radius: 50%;
		border: none;
		background: var(--panel);
		box-shadow: var(--shadow);
		font-size: 1.7rem;
		font-weight: 700;
		cursor: pointer;
		display: grid;
		place-items: center;
		transition: transform 0.1s;
	}
	.round:active {
		transform: scale(0.9);
	}
	.round:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.round.small {
		width: 46px;
		height: 46px;
		font-size: 1.1rem;
		color: var(--fg-muted);
	}
	.round.info {
		font-family: Georgia, serif;
		font-style: italic;
		color: var(--info);
	}
	.round.nope {
		color: var(--nope);
	}
	.round.like {
		color: #fff;
		background: var(--accent-grad);
		box-shadow: var(--shadow-accent);
	}
	.hint {
		margin: 0;
		font-size: 0.72rem;
		color: var(--fg-muted);
	}
	/* 空状態は枠を付けず、丸いアイコンと文だけを置く（いいね / よくないねと同じ） */
	.done {
		width: 100%;
		text-align: center;
		padding: 72px 20px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		margin-top: 20px;
	}
	.done .big {
		width: 72px;
		height: 72px;
		margin: 0 auto 4px;
		border-radius: 50%;
		background: var(--accent-soft);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--accent);
	}
	.done h2 {
		margin: 0;
		font-size: 1.2rem;
	}
	.done p {
		margin: 0;
		font-size: 0.9rem;
		color: var(--fg-muted);
	}

	.aside {
		display: none;
	}
	.right {
		display: contents;
	}
	.composer-slot {
		width: 100%;
	}

	/* デスクトップ: カードの右に詳細を常時表示（Tinder Web）。シートは使わない */
	@media (min-width: 900px) {
		.discover {
			display: grid;
			grid-template-columns: 420px minmax(320px, 460px);
			grid-template-rows: minmax(0, 1fr) auto;
			grid-template-areas:
				'stack right'
				'actions right';
			justify-content: center;
			column-gap: 32px;
			align-items: start;
			flex: 1;
			min-height: 0;
			max-height: calc(640px + 82px);
		}
		/* 画面が低いときだけ束が縮む（640px 取れる画面では縮めない） */
		.stack {
			grid-area: stack;
			flex: none;
			height: auto;
			min-height: 0;
			max-height: 640px;
			align-self: stretch;
		}
		.round {
			width: 56px;
			height: 56px;
		}
		.actions {
			margin-top: 10px;
		}
		.actions {
			grid-area: actions;
			justify-content: center;
		}
		.hint {
			display: none;
		}
		.right {
			grid-area: right;
			display: flex;
			flex-direction: column;
			gap: 16px;
			min-height: 0;
			height: 100%;
		}
		/* 右パネルの下の残りを入力欄が埋める */
		.composer-slot {
			flex: 1 0 auto;
			display: flex;
			flex-direction: column;
		}
		.round.info {
			display: none;
		}
		/* 低い画面では判定パネルが先に縮み、内側でスクロールする */
		.aside {
			display: flex;
			flex-direction: column;
			gap: 18px;
			padding: 22px 24px 24px;
			flex: 0 1 auto;
			min-height: 0;
			overflow-y: auto;
		}
		.done {
			grid-column: 1 / -1;
		}
		.mobile-only {
			display: none;
		}
	}
</style>
