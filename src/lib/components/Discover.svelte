<script lang="ts">
	import { type Match, REGISTRATION_LABELS } from '$lib/types';
	import ServerCard from './ServerCard.svelte';

	// Tinder のデッキ: ドラッグでスワイプ、スタンプ、丸ボタン、戻す、詳細シート
	let {
		matches,
		onlike,
		onpass,
		onundo,
		onexhausted,
		onsettings,
		total
	}: {
		matches: Match[];
		total: number; // いまの条件で残っているカードの総数（このデッキ以外も含む）
		onlike: (m: Match) => void;
		onpass: (m: Match) => void;
		onundo: (m: Match, action: 'like' | 'pass') => void;
		onexhausted: () => void; // このデッキを見終わった（次の束を頼む）
		onsettings: () => void;
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
	const remaining = $derived(Math.max(0, total - index));
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
		if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
		if (e.key === 'ArrowRight') fly('right');
		else if (e.key === 'ArrowLeft') fly('left');
		else if (e.key === 'ArrowUp' || e.key === ' ') {
			e.preventDefault();
			sheet = !sheet;
		} else if (e.key === 'Escape') sheet = false;
		else if (e.key === 'Backspace') undo();
	}

	const facts = $derived.by(() => {
		const s = current?.server;
		if (!s) return [] as { k: string; v: string }[];
		const list: { k: string; v: string }[] = [];
		if (s.usersCount !== null) list.push({ k: 'ユーザー', v: `${s.usersCount.toLocaleString()}人` });
		if (s.npd15 !== null) list.push({ k: '投稿', v: `${Math.round(s.npd15).toLocaleString()}/日` });
		if (s.driveCapacityMb !== null)
			list.push({
				k: 'ドライブ',
				v: s.driveCapacityMb >= 1024 ? `${Math.round(s.driveCapacityMb / 1024)}GB` : `${s.driveCapacityMb}MB`
			});
		list.push({ k: '登録', v: REGISTRATION_LABELS[s.registration] });
		list.push({ k: 'メアド', v: s.emailRequired ? '必須' : '不要' });
		list.push({ k: '広告', v: s.adsEnabled ? 'あり' : 'なし' });
		list.push({ k: 'GTL', v: s.gtlAvailable ? 'あり' : 'なし' });
		list.push({
			k: '本体',
			v: `${s.officialMisskey ? '本家' : 'カスタム版'}${s.versionMonthsBehind ? ` · ${s.versionMonthsBehind}ヶ月遅れ` : s.versionMonthsBehind === 0 ? ' · 最新' : ''}`
		});
		return list;
	});
</script>

<svelte:window {onkeydown} />

{#snippet details(m: Match)}
	{@const s = m.server}
	<header class="sheet-head">
		<h2>{s.name ?? s.host}</h2>
		<span class="pill">♥ {m.score}%</span>
	</header>
	<p class="host muted">{s.host}</p>

	{#if m.reasons.length > 0}
		<ul class="reasons">
			{#each m.reasons as r (r)}<li>{r}</li>{/each}
		</ul>
	{/if}
	{#if m.tags.length > 0}
		<p class="tags">{m.tags.join(' · ')}</p>
	{/if}
	{#if s.description}<p class="desc">{s.description}</p>{/if}

	<dl class="facts">
		{#each facts as f (f.k)}
			<div><dt>{f.k}</dt><dd>{f.v}</dd></div>
		{/each}
	</dl>
	{#if s.serverRules.length > 0}
		<details>
			<summary>サーバールール（{s.serverRules.length}）</summary>
			<ol>
				{#each s.serverRules as rule, i (i)}<li>{rule}</li>{/each}
			</ol>
		</details>
	{/if}
	{#if !m.vibe}<p class="muted small">雰囲気はまだ判定されていません。</p>{/if}

	<div class="sheet-actions">
		<a class="btn secondary" href="https://{s.host}/" target="_blank" rel="noopener">サーバーを見る</a>
		<button class="btn primary" onclick={() => fly('right')}>♥ いいね</button>
	</div>
{/snippet}

<section class="discover">
	{#if current}
		<p class="counter">
		<span>あと {remaining} 件</span>
		<button class="filter" onclick={onsettings} aria-label="条件を変える">⚙ 条件</button>
	</p>
		<div class="stack">
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
			<button class="round small" onclick={undo} disabled={history.length === 0} aria-label="ひとつ戻す">↶</button>
			<button class="round nope" onclick={() => fly('left')} aria-label="パス">✕</button>
			<button class="round small info" onclick={() => (sheet = true)} aria-label="詳しく見る">i</button>
			<button class="round like" onclick={() => fly('right')} aria-label="いいね">♥</button>
		</div>
		<p class="hint">左右にスワイプ · タップで詳細 · ← → キー</p>
	{:else}
		<div class="panel done">
			<p class="big">{total === 0 && matches.length === 0 ? '🔍' : '🎉'}</p>
			{#if matches.length === 0}
				<h2>条件に合うカードがありません</h2>
				<p class="muted">絶対条件や規模・流速を緩めるか、パスした鯖をもう一度見るとカードが出ます。</p>
			{:else}
				<h2>いまの条件のカードは見終わりました</h2>
				<p class="muted">いいねは「いいね」タブに残っています。条件を変えるか、パスした鯖をもう一度見ると続きが出ます。</p>
			{/if}
			<button class="btn primary" onclick={onsettings}>条件を見直す</button>
		</div>
	{/if}

	{#if current}
		<aside class="aside panel">
			{@render details(current)}
		</aside>
	{/if}

	{#if sheet && current}
		<button class="backdrop" aria-label="閉じる" onclick={() => (sheet = false)}></button>
		<div class="sheet" role="dialog" aria-modal="true" aria-label="{current.server.name ?? current.server.host} の詳細">
			<div class="grip"></div>
			{@render details(current)}
		</div>
	{/if}
</section>

<style>
	.discover {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding-top: 6px;
	}
	.counter {
		margin: 0;
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.8rem;
		color: var(--fg-muted);
	}
	.filter {
		font-size: 0.78rem;
		font-weight: 700;
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 5px 10px;
		cursor: pointer;
		color: var(--fg-muted);
	}
	.stack {
		position: relative;
		width: 100%;
		height: min(640px, calc(100dvh - var(--nav-h) - 190px));
		min-height: 420px;
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
		font-weight: 900;
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
		font-weight: 900;
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
		color: var(--accent);
	}
	.hint {
		margin: 0;
		font-size: 0.72rem;
		color: var(--fg-muted);
	}
	.done {
		width: 100%;
		text-align: center;
		padding: 36px 20px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		margin-top: 20px;
	}
	.done .big {
		margin: 0;
		font-size: 2.4rem;
	}
	.done h2 {
		margin: 0;
		font-size: 1.2rem;
	}
	.done p {
		margin: 0;
	}

	/* 詳細シート */
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
	.sheet-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}
	.sheet-head h2 {
		margin: 0;
		font-size: 1.3rem;
		font-weight: 900;
	}
	.pill {
		background: var(--accent-soft);
		color: var(--accent-fg);
		border-radius: 999px;
		padding: 4px 10px;
		font-weight: 800;
		font-size: 0.85rem;
		white-space: nowrap;
	}
	.host {
		margin: -6px 0 0;
		font-size: 0.85rem;
	}
	.reasons {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.reasons li::before {
		content: '✓ ';
		color: var(--accent);
		font-weight: 900;
	}
	.tags {
		margin: 0;
		font-size: 0.85rem;
		color: var(--accent-fg);
		font-weight: 700;
	}
	.desc {
		margin: 0;
		font-size: 0.92rem;
		line-height: 1.6;
	}
	.facts {
		margin: 4px 0 0;
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 8px;
	}
	.facts div {
		background: var(--panel-2);
		border-radius: 10px;
		padding: 8px 10px;
	}
	dt {
		font-size: 0.7rem;
		color: var(--fg-muted);
	}
	dd {
		margin: 0;
		font-weight: 700;
		font-size: 0.92rem;
	}
	details {
		font-size: 0.88rem;
	}
	summary {
		cursor: pointer;
		font-weight: 700;
	}
	ol {
		margin: 6px 0 0;
		padding-left: 20px;
		color: var(--fg-muted);
	}
	.small {
		font-size: 0.8rem;
		margin: 0;
	}
	.sheet-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
		margin-top: 6px;
	}
	.aside {
		display: none;
	}

	/* デスクトップ: カードの右に詳細を常時表示（Tinder Web）。シートは使わない */
	@media (min-width: 900px) {
		.discover {
			display: grid;
			grid-template-columns: 420px minmax(320px, 460px);
			grid-template-areas:
				'counter counter'
				'stack aside'
				'actions aside'
				'hint aside';
			justify-content: center;
			column-gap: 32px;
			align-items: start;
		}
		.counter {
			grid-area: counter;
		}
		.stack {
			grid-area: stack;
			height: 640px;
		}
		.actions {
			grid-area: actions;
			justify-content: center;
		}
		.hint {
			grid-area: hint;
			text-align: center;
		}
		.round.info {
			display: none;
		}
		.aside {
			grid-area: aside;
			display: flex;
			flex-direction: column;
			gap: 10px;
			padding: 20px 22px;
			position: sticky;
			top: 28px;
			max-height: calc(100dvh - 56px);
			overflow-y: auto;
		}
		.done {
			grid-column: 1 / -1;
		}
		.backdrop,
		.sheet {
			display: none;
		}
	}
</style>
