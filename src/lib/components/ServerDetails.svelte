<script lang="ts">
	import type { Snippet } from 'svelte';
	import { formatCount } from '$lib/format';
	import { GENRE_LABELS, GENRES, type Match, REGISTRATION_LABELS, type VibeProfile } from '$lib/types';
	import Icon from './Icon.svelte';

	// サーバーの詳細（misspace の ServerInfoPopup）。full はシートで全部出す。
	// full=false（デスクトップの右パネル）では、左のカードに出ているバナー・アイコン・名前・host・
	// 人数・投稿数・雰囲気タグ・説明文を省き、カードに無い情報だけ出す
	let {
		match,
		full = false,
		actions
	}: { match: Match; full?: boolean; actions?: Snippet } = $props(); // actions はシート中段のボタン列
	const s = $derived(match.server);
	const m = $derived(match);
	const color = $derived(s.themeColor ?? '#86b300');

	// Clef の判定（左のカードには無い情報）。
	// 両極の軸は位置マーカー、片側の軸と話題は 0..1 の塗りで出す
	const GENRE_TOP = 3;
	type Level = { label: string; value: number };
	function vibeScales(v: VibeProfile): (Level & { left: string; right: string })[] {
		return [
			{ label: '空気感', value: v.tone, left: 'ドライ', right: 'ほのぼの' },
			{ label: 'ルール', value: v.strictness, left: 'ゆるめ', right: 'しっかり' }
		];
	}
	function vibeLevels(v: VibeProfile): Level[] {
		return [
			{ label: '初心者歓迎', value: v.newcomerFriendly },
			{ label: '身内ノリ', value: v.closedCommunity },
			{ label: '成人向け', value: v.nsfw }
		];
	}
	function vibeTopics(v: VibeProfile): Level[] {
		return GENRES.map((g) => ({ label: GENRE_LABELS[g], value: v.genre[g] }))
			.sort((a, b) => b.value - a.value)
			.slice(0, GENRE_TOP);
	}
	const pct = (x: number) => `${Math.round(x * 100)}%`;

	const facts = $derived.by(() => {
		const s = match.server;
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

<div class="details" class:compact={!full}>
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
	{#if full}
	<div class="meta">
		<span class="tag score"><Icon name="heart" size={12} filled /> {m.score}%</span>
		<span class="tag"><i class="dot" style:background={color}></i>{s.softwareName}</span>
		<span class="tag reg" class:open={s.registration === 'open'} class:closed={s.registration === 'closed'}>
			{REGISTRATION_LABELS[s.registration]}
		</span>
	</div>
	{/if}
	{#if full && m.reasons.length > 0}
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
				<span class="bar"><i style:width={pct(m.affinity)}></i></span>
				<span class="v">{pct(m.affinity)}</span>
			</div>
		{/if}
		{#if m.vibe}
			{#each vibeScales(m.vibe) as r (r.label)}
				<div class="row">
					<span class="k">{r.label}</span>
					<span class="scale">
						<span class="track"><b style:left={pct(r.value)}></b></span>
						<span class="ends"><span>{r.left}</span><span>{r.right}</span></span>
					</span>
					<span class="v"></span>
				</div>
			{/each}
			{#each vibeLevels(m.vibe) as r (r.label)}
				<div class="row">
					<span class="k">{r.label}</span>
					<span class="bar"><i style:width={pct(r.value)}></i></span>
					<span class="v">{pct(r.value)}</span>
				</div>
			{/each}
			<h4>話題</h4>
			{#each vibeTopics(m.vibe) as r (r.label)}
				<div class="row">
					<span class="k">{r.label}</span>
					<span class="bar"><i style:width={pct(r.value)}></i></span>
					<span class="v">{pct(r.value)}</span>
				</div>
			{/each}
			<p class="small muted">投稿 {m.vibe.sampleCount} 件と説明文・ルールから判定</p>
		{:else}
			<p class="small muted">雰囲気は未判定</p>
		{/if}
	</section>
	{#if actions}
	<div class="sheet-actions">{@render actions()}</div>
	{/if}
	{#if full && s.description}<p class="desc">{s.description}</p>{/if}

	<dl class="facts">
		{#each facts as f (f.k)}
			<div><dt>{f.k}</dt><dd>{f.v}</dd></div>
		{/each}
	</dl>
	{#if full && s.serverRules.length > 0}
		<details>
			<summary>サーバールール（{s.serverRules.length}）</summary>
			<ol>
				{#each s.serverRules as rule, i (i)}<li>{rule}</li>{/each}
			</ol>
		</details>
	{/if}
</div>

<style>
	/* 親（シートや右パネル）の縦並びと gap をそのまま使う */
	.details {
		display: contents;
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
	/* バナーに重ねる。バナーは position: relative で後に描かれるので、こちらも持ち上げないとアイコンの上が隠れる */
	.identity {
		position: relative;
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
	.clef h3,
	.clef h4 {
		margin: 0 0 6px;
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		color: var(--fg-muted);
	}
	.clef h4 {
		margin: 8px 0 4px;
	}
	/* 全行を同じ 3 列（ラベル | バー | 値）に揃える */
	.clef .row {
		display: grid;
		grid-template-columns: 7.5em minmax(0, 1fr) 3em;
		align-items: center;
		column-gap: 10px;
		min-height: 22px;
		font-size: 0.76rem;
	}
	.clef .k {
		font-weight: 700;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.clef .v {
		font-weight: 700;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.clef .bar,
	.clef .track {
		position: relative;
		display: block;
		height: 6px;
		border-radius: 999px;
		background: var(--panel-2);
		box-shadow: inset 0 0 0 1px var(--border);
	}
	.clef .bar {
		overflow: hidden;
	}
	.clef .bar i {
		display: block;
		height: 100%;
		border-radius: 999px;
		background: var(--accent-grad);
	}
	.clef .row:has(.scale) .k {
		align-self: start;
		padding-top: 1px;
	}
	.clef .scale {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding-top: 4px;
	}
	.clef .track b {
		position: absolute;
		top: 50%;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--accent);
		border: 2px solid var(--panel);
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
		transform: translate(-50%, -50%);
	}
	.clef .ends {
		display: flex;
		justify-content: space-between;
		font-size: 0.62rem;
		color: var(--fg-muted);
	}
	.clef .small {
		margin: 6px 0 0;
	}
	.sheet-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.sheet-actions :global(.btn) {
		padding: 9px 14px;
		font-size: 0.82rem;
	}
	/* 右パネルは内側スクロールも要らない高さに収める */
	.compact .facts {
		margin: 0;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
	}
	.compact .facts div {
		padding: 8px 10px;
	}
	.compact .clef .row {
		min-height: 26px;
	}
	.compact .clef h3 {
		margin-bottom: 10px;
	}
	.compact .clef h4 {
		margin: 12px 0 6px;
	}
	.compact .clef .small {
		margin-top: 10px;
	}
</style>
