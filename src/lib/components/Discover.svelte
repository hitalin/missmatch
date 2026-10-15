<script lang="ts">
	import type { Snippet } from 'svelte';
	import { GENRE_LABELS, GENRES, type Match, REGISTRATION_LABELS, type VibeProfile } from '$lib/types';
	import { formatCount } from '$lib/format';
	import Icon from './Icon.svelte';
	import ServerCard from './ServerCard.svelte';

	// Tinder のデッキ: ドラッグでスワイプ、スタンプ、丸ボタン、戻す、詳細シート
	let {
		matches,
		onlike,
		onpass,
		onundo,
		onexhausted,
		onsettings,
		total,
		composer
	}: {
		matches: Match[];
		total: number; // いまの条件で残っているカードの総数（このデッキ以外も含む）
		onlike: (m: Match) => void;
		onpass: (m: Match) => void;
		onundo: (m: Match, action: 'like' | 'pass') => void;
		onexhausted: () => void; // このデッキを見終わった（次の束を頼む）
		onsettings: () => void;
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
		if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
		if (e.key === 'ArrowRight') fly('right');
		else if (e.key === 'ArrowLeft') fly('left');
		else if (e.key === 'ArrowUp' || e.key === ' ') {
			e.preventDefault();
			sheet = !sheet;
		} else if (e.key === 'Escape') sheet = false;
		else if (e.key === 'Backspace') undo();
	}

	// Clef の判定を右パネルで見せる（左のカードには無い情報）。0..1 の確率をバーにする
	const GENRE_TOP = 3;
	function vibeRows(v: VibeProfile): { label: string; value: number; left?: string; right?: string }[] {
		const genres = GENRES.map((g) => ({ g, p: v.genre[g] }))
			.sort((a, b) => b.p - a.p)
			.slice(0, GENRE_TOP)
			.map(({ g, p }) => ({ label: GENRE_LABELS[g], value: p }));
		return [
			{ label: '空気感', value: v.tone, left: 'ドライ', right: 'ほのぼの' },
			{ label: 'ルール', value: v.strictness, left: 'ゆるめ', right: 'しっかり' },
			{ label: '初心者歓迎', value: v.newcomerFriendly },
			{ label: '身内ノリ', value: v.closedCommunity },
			{ label: '成人向け', value: v.nsfw },
			...genres
		];
	}

	const facts = $derived.by(() => {
		const s = current?.server;
		if (!s) return [] as { k: string; v: string }[];
		const list: { k: string; v: string }[] = [];
		if (s.dru15 !== null) list.push({ k: 'アクティブ', v: `${formatCount(s.dru15)}人/日` });
		if (s.driveCapacityMb !== null)
			list.push({
				k: 'ドライブ',
				v: s.driveCapacityMb >= 1024 ? `${Math.round(s.driveCapacityMb / 1024)}GB` : `${s.driveCapacityMb}MB`
			});
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

<!-- misspace の ServerInfoPopup。full=false（デスクトップの右パネル）では、左のカードに出ている
     バナー・アイコン・名前・host・人数・投稿数・雰囲気タグ・説明文を省き、カードに無い情報だけ出す -->
{#snippet details(m: Match, full: boolean)}
	{@const s = m.server}
	{@const color = s.themeColor ?? '#86b300'}
	{#if full}
	<div
		class="banner"
		style:background={`linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 55%, #000))`}
	>
		{#if s.bannerUrl}<img src={s.bannerUrl} alt="" loading="lazy" decoding="async" />{/if}
	</div>
	<div class="identity">
		{#if s.iconUrl}
			<img class="avatar" src={s.iconUrl} alt="" width="64" height="64" loading="lazy" />
		{:else}
			<div class="avatar placeholder">{(s.name ?? s.host).slice(0, 1)}</div>
		{/if}
		<h2>{s.name ?? s.host}</h2>
		<a class="hostlink" href="https://{s.host}/" target="_blank" rel="noopener">
			{s.host}
			<Icon name="external" size={12} />
		</a>
	</div>
	<div class="stats">
		<div><b>{s.usersCount !== null ? formatCount(s.usersCount) : '–'}</b><span>ユーザー</span></div>
		<div><b>{s.npd15 !== null ? formatCount(s.npd15) : '–'}</b><span>投稿 / 日</span></div>
		<div><b>{s.dru15 !== null ? formatCount(s.dru15) : '–'}</b><span>アクティブ / 日</span></div>
	</div>
	{/if}
	<div class="meta">
		{#if full}<span class="tag score"><Icon name="heart" size={12} filled /> {m.score}%</span>{/if}
		<span class="tag"><i class="dot" style:background={color}></i>{s.softwareName}</span>
		<span class="tag reg" class:open={s.registration === 'open'} class:closed={s.registration === 'closed'}>
			{REGISTRATION_LABELS[s.registration]}
		</span>
	</div>
	{#if m.reasons.length > 0}
		<ul class="reasons">
			{#each m.reasons as r (r)}<li><Icon name="check" size={14} />{r}</li>{/each}
		</ul>
	{/if}
	{#if full && m.tags.length > 0}
		<p class="tags">{m.tags.join(' · ')}</p>
	{/if}
	<section class="clef">
		<h3>Clef の判定</h3>
		{#if m.affinity !== undefined}
			<div class="row">
				<span class="k">言葉との噛み合い</span>
				<span class="bar"><i style:width="{Math.round(m.affinity * 100)}%"></i></span>
				<span class="v">{Math.round(m.affinity * 100)}%</span>
			</div>
		{/if}
		{#if m.vibe}
			{#each vibeRows(m.vibe) as r (r.label)}
				<div class="row" class:two={!!r.left}>
					<span class="k">{r.label}</span>
					{#if r.left}<span class="end">{r.left}</span>{/if}
					<span class="bar"><i style:width="{Math.round(r.value * 100)}%"></i></span>
					{#if r.right}<span class="end">{r.right}</span>{:else}<span class="v">{Math.round(r.value * 100)}%</span>{/if}
				</div>
			{/each}
			<p class="small muted">投稿 {m.vibe.sampleCount} 件と説明文・ルールから判定</p>
		{:else}
			<p class="small muted">雰囲気はまだ判定されていません。</p>
		{/if}
	</section>
	{#if full}
	<div class="sheet-actions">
		<a class="btn secondary" href="https://{s.host}/" target="_blank" rel="noopener">サーバーを見る</a>
		<button class="btn primary" onclick={() => fly('right')}><Icon name="heart" size={15} filled /> いいね</button>
	</div>
	{/if}
	{#if s.description}
		{#if full}
			<p class="desc">{s.description}</p>
		{:else}
			<details class="more">
				<summary>説明の全文</summary>
				<p class="desc plain">{s.description}</p>
			</details>
		{/if}
	{/if}

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
{/snippet}

<section class="discover">
	{#if current}
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
			<button class="round small" onclick={undo} disabled={history.length === 0} aria-label="ひとつ戻す"><Icon name="undo" size={18} /></button>
			<button class="round nope" onclick={() => fly('left')} aria-label="パス"><Icon name="x" size={26} /></button>
			<button class="round small info" onclick={() => (sheet = true)} aria-label="詳しく見る">i</button>
			<button class="round like" onclick={() => fly('right')} aria-label="いいね"><Icon name="heart" size={26} filled /></button>
		</div>
		<p class="hint">左右にスワイプ · タップで詳細 · ← → キー</p>
		{#if composer}<div class="composer-slot">{@render composer()}</div>{/if}
	{:else}
		<div class="panel done">
			<p class="big"><Icon name={total === 0 && matches.length === 0 ? 'search' : 'sparkle'} size={40} /></p>
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
			{@render details(current, false)}
		</aside>
	{/if}

	{#if sheet && current}
		<button class="backdrop" aria-label="閉じる" onclick={() => (sheet = false)}></button>
		<div class="sheet" role="dialog" aria-modal="true" aria-label="{current.server.name ?? current.server.host} の詳細">
			<div class="grip"></div>
			{@render details(current, true)}
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
		display: flex;
		justify-content: center;
		color: var(--accent);
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
	.banner {
		position: relative;
		height: 80px;
		margin: -8px -20px 0;
		overflow: hidden;
		flex-shrink: 0;
	}
	.banner img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.identity {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		margin-top: -32px;
		gap: 2px;
	}
	.avatar {
		width: 64px;
		height: 64px;
		border-radius: 14px;
		border: 3px solid var(--panel);
		background: var(--panel);
		object-fit: cover;
		box-shadow: var(--shadow);
	}
	.avatar.placeholder {
		display: grid;
		place-items: center;
		font-weight: 700;
		font-size: 1.6rem;
		color: var(--accent-fg);
		background: var(--accent-soft);
	}
	.identity h2 {
		margin: 6px 0 0;
		font-size: 1.1rem;
		font-weight: 700;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.hostlink {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		font-size: 0.74rem;
		color: var(--fg-muted);
		text-decoration: none;
	}
	.hostlink:hover {
		color: var(--accent-fg);
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 6px;
		padding: 8px 6px;
		border-radius: 10px;
		background: var(--panel-2);
		text-align: center;
	}
	.stats div {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.stats b {
		font-size: 1.05rem;
		font-weight: 700;
	}
	.stats span {
		font-size: 0.62rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--fg-muted);
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 6px;
	}
	.tag {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 3px 9px;
		border-radius: 999px;
		border: 1px solid var(--border);
		background: var(--panel);
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--fg-muted);
	}
	.tag.score {
		background: var(--pill);
		border-color: transparent;
		color: #000;
	}
	.tag.reg.open {
		color: var(--accent-fg);
		border-color: color-mix(in srgb, var(--accent) 40%, transparent);
	}
	.tag.reg.closed {
		color: var(--nope);
		border-color: color-mix(in srgb, var(--nope) 40%, transparent);
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}
	.reasons {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 0.88rem;
	}
	.reasons li {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.reasons li :global(svg) {
		color: var(--accent);
	}
	.tags {
		margin: 0;
		font-size: 0.85rem;
		color: var(--accent-fg);
		font-weight: 700;
	}
	.desc.plain {
		padding-top: 6px;
		border-top: none;
	}
	.desc {
		margin: 0;
		padding-top: 10px;
		border-top: 1px solid var(--border);
		font-size: 0.86rem;
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
	.clef h3 {
		margin: 0 0 6px;
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--fg-muted);
	}
	.clef .row {
		display: grid;
		grid-template-columns: 5.4em 1fr auto;
		align-items: center;
		gap: 6px;
		font-size: 0.74rem;
		padding: 2px 0;
	}
	.clef .row.two {
		grid-template-columns: 5.4em auto 1fr auto;
	}
	.clef .k {
		color: var(--fg-muted);
		font-weight: 700;
		white-space: nowrap;
	}
	.clef .end {
		color: var(--fg-muted);
		font-size: 0.66rem;
		white-space: nowrap;
	}
	.clef .v {
		font-weight: 700;
		min-width: 2.6em;
		text-align: right;
	}
	.clef .bar {
		display: block;
		height: 6px;
		border-radius: 3px;
		background: var(--panel-2);
		overflow: hidden;
	}
	.clef .bar i {
		display: block;
		height: 100%;
		border-radius: 3px;
		background: var(--accent-grad);
	}
	.clef .small {
		margin: 6px 0 0;
	}
	.sheet-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.sheet-actions .btn {
		padding: 9px 14px;
		font-size: 0.82rem;
	}
	.aside {
		display: none;
	}
	.composer-slot {
		width: 100%;
	}

	/* デスクトップ: カードの右に詳細を常時表示（Tinder Web）。シートは使わない */
	@media (min-width: 900px) {
		.discover {
			display: grid;
			grid-template-columns: 420px minmax(320px, 460px);
			grid-template-rows: minmax(0, 1fr) auto auto;
			grid-template-areas:
				'stack aside'
				'stack composer'
				'actions composer';
			justify-content: center;
			column-gap: 32px;
			align-items: start;
			align-content: start;
		}
		.stack {
			grid-area: stack;
			flex: none;
			height: 640px;
		}
		.actions {
			grid-area: actions;
			justify-content: center;
		}
		.hint {
			display: none;
		}
		.composer-slot {
			grid-area: composer;
			align-self: end;
		}
		.round.info {
			display: none;
		}
		.aside {
			grid-area: aside;
			display: flex;
			flex-direction: column;
			gap: 10px;
			padding: 8px 22px 20px;
			/* 高さは束と同じ行に合わせ、中身は内側でスクロール（行の高さには寄与しない） */
			height: 0;
			min-height: 100%;
			align-self: stretch;
			overflow-y: auto;
		}
		.aside .banner {
			margin: -8px -22px 0;
		}
		/* 右パネルは内側スクロールも要らない高さに収める */
		.aside .facts {
			grid-template-columns: repeat(3, 1fr);
			gap: 6px;
		}
		.aside .facts div {
			padding: 6px 8px;
		}
		.aside {
			gap: 8px;
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
