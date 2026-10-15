<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Segmented from '$lib/components/Segmented.svelte';
	import { applyFilters, type Taste, tasteSummary } from '$lib/match';
	import {
		DEALBREAKER_LABELS,
		type Dealbreakers,
		PACE_HINTS,
		PACE_LABELS,
		PACES,
		type Preferences,
		REGISTRATION_HINTS,
		REGISTRATIONS,
		SCALE_HINTS,
		SCALE_LABELS,
		SCALES,
		TOPIC_LABELS,
		TOPICS
	} from '$lib/prefs';
	import { REGISTRATION_LABELS, type ServerProfile } from '$lib/types';

	// 「あなた」タブ: ひとこと（プロンプト）、発見の設定、学習した好み。すべて 1 タップで決まる
	let {
		prefs = $bindable(),
		taste,
		swipes,
		profiles,
		onresettaste,
		onforget
	}: {
		prefs: Preferences;
		taste: Taste;
		swipes: number;
		profiles: ServerProfile[] | null;
		onresettaste: () => void;
		onforget: (feature: keyof Taste) => void;
	} = $props();

	const count = $derived(profiles ? applyFilters(profiles, prefs).length : null);
	const chips = $derived(tasteSummary(taste));

	function toggleIn<T extends string>(list: T[], v: T): T[] {
		return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
	}
	function setDealbreaker(key: keyof Dealbreakers, value: boolean) {
		prefs = { ...prefs, dealbreakers: { ...prefs.dealbreakers, [key]: value } };
	}
</script>

<section class="settings">
	<header class="head">
		<h1>あなた</h1>
		<p class="muted">
			{#if count !== null}いまの条件に合うサーバーは <b>{count} 件</b>。{:else}サーバー情報を取得中…{/if}
			条件を変えると「さがす」のカードが入れ替わります。
		</p>
	</header>

	{#if swipes > 0}
		<div class="panel block">
			<h2>いいねから学んだ好み <span class="muted small">{swipes} スワイプ</span></h2>
			{#if chips.length === 0}
				<p class="help">まだはっきりした傾向はありません。スワイプを続けると出てきます。</p>
			{:else}
				<ul class="chips">
					{#each chips as c (c.feature)}
						<li>
							<button class="chip on" onclick={() => onforget(c.feature)} title="この傾向を忘れる">
								{c.label} <span class="x"><Icon name="x" size={12} /></span>
							</button>
						</li>
					{/each}
				</ul>
				<p class="help">× で個別に忘れられます。カードの並びに反映されます。</p>
			{/if}
			<div class="row">
				<button class="btn ghost sm" onclick={onresettaste}>好みをリセット</button>
			</div>
		</div>
	{/if}

	<div class="panel block">
		<h2>基本</h2>
		<div class="field">
			<span class="label">年齢</span>
			<div class="seg seg2" role="radiogroup">
				<button role="radio" aria-checked={prefs.adult === true} class:on={prefs.adult === true} onclick={() => (prefs = { ...prefs, adult: true })}>18 歳以上</button>
				<button role="radio" aria-checked={prefs.adult === false} class:on={prefs.adult === false} onclick={() => (prefs = { ...prefs, adult: false })}>18 歳未満</button>
			</div>
		</div>
		<div class="field">
			<span class="label">登録のしかた <small class="muted">招待制・停止中を含めると候補が大きく増えます</small></span>
			<ul class="chips">
				{#each REGISTRATIONS as r (r)}
					<li>
						<button
							class="chip"
							class:on={prefs.registrations.includes(r)}
							aria-pressed={prefs.registrations.includes(r)}
							onclick={() => {
								const next = toggleIn(prefs.registrations, r);
								if (next.length > 0) prefs = { ...prefs, registrations: next };
							}}
						>
							{#if prefs.registrations.includes(r)}<Icon name="check" size={13} />{/if}
							{REGISTRATION_LABELS[r]} <small>{REGISTRATION_HINTS[r]}</small>
						</button>
					</li>
				{/each}
			</ul>
		</div>
		<div class="field">
			<span class="label">R-18 の投稿</span>
			<div class="seg seg3" role="radiogroup">
				{#each [['avoid', '見たくない'], ['neutral', '気にしない'], ['welcome', '歓迎']] as [v, label] (v)}
					<button role="radio" aria-checked={prefs.nsfw === v} class:on={prefs.nsfw === v} onclick={() => (prefs = { ...prefs, nsfw: v as Preferences['nsfw'] })}>{label}</button>
				{/each}
			</div>
		</div>
	</div>

	<div class="panel block">
		<h2>話したいこと <span class="muted small">複数可・加点</span></h2>
		<ul class="chips">
			{#each TOPICS as t (t)}
				<li><button class="chip" class:on={prefs.topics.includes(t)} aria-pressed={prefs.topics.includes(t)} onclick={() => (prefs = { ...prefs, topics: toggleIn(prefs.topics, t) })}>{#if prefs.topics.includes(t)}<Icon name="check" size={13} />{/if}{TOPIC_LABELS[t]}</button></li>
			{/each}
		</ul>
	</div>

	<div class="panel block">
		<h2>空気感</h2>
		<div class="field"><span class="label">空気</span><Segmented value={prefs.tone} left="ドライ・自由" right="ほのぼの" onchange={(v) => (prefs = { ...prefs, tone: v })} /></div>
		<div class="field"><span class="label">関わり方</span><Segmented value={prefs.community} left="濃い身内" right="初心者歓迎" onchange={(v) => (prefs = { ...prefs, community: v })} /></div>
		<div class="field"><span class="label">ルール</span><Segmented value={prefs.rules} left="ゆるめ" right="しっかり" onchange={(v) => (prefs = { ...prefs, rules: v })} /></div>
	</div>

	<div class="panel block">
		<h2>規模と流速 <span class="muted small">選んだ区分だけ出す</span></h2>
		<div class="field">
			<span class="label">規模</span>
			<ul class="chips">
				{#each SCALES as s (s)}
					<li><button class="chip" class:on={prefs.scales.includes(s)} aria-pressed={prefs.scales.includes(s)} onclick={() => (prefs = { ...prefs, scales: toggleIn(prefs.scales, s) })}>{#if prefs.scales.includes(s)}<Icon name="check" size={13} />{/if}{SCALE_LABELS[s]} <small>{SCALE_HINTS[s]}</small></button></li>
				{/each}
			</ul>
		</div>
		<div class="field">
			<span class="label">流速</span>
			<ul class="chips">
				{#each PACES as p (p)}
					<li><button class="chip" class:on={prefs.paces.includes(p)} aria-pressed={prefs.paces.includes(p)} onclick={() => (prefs = { ...prefs, paces: toggleIn(prefs.paces, p) })}>{#if prefs.paces.includes(p)}<Icon name="check" size={13} />{/if}{PACE_LABELS[p]} <small>{PACE_HINTS[p]}</small></button></li>
				{/each}
			</ul>
		</div>
	</div>

	<div class="panel block">
		<h2>絶対条件 <span class="muted small">当てはまらない鯖は出さない</span></h2>
		{#each Object.keys(DEALBREAKER_LABELS) as key (key)}
			{@const k = key as keyof Dealbreakers}
			<label class="switch">
				<span>{DEALBREAKER_LABELS[k]}</span>
				<input type="checkbox" checked={prefs.dealbreakers[k]} onchange={(e) => setDealbreaker(k, e.currentTarget.checked)} />
				<i></i>
			</label>
		{/each}
		{#if count !== null && count < 5}
			<p class="warn">条件が厳しく、該当が {count} 件です。絶対条件を減らすと増えます。</p>
		{/if}
	</div>

</section>

<style>
	.settings {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.head h1 {
		margin: 8px 0 4px;
		font-size: 1.6rem;
		font-weight: 700;
	}
	.head p {
		margin: 0;
		font-size: 0.9rem;
	}
	.block {
		padding: 18px 20px;
		display: flex;
		flex-direction: column;
		gap: 14px;
		break-inside: avoid;
	}
	h2 {
		margin: 0;
		font-size: 1rem;
		display: flex;
		align-items: baseline;
		gap: 8px;
		flex-wrap: wrap;
	}
	.small {
		font-size: 0.74rem;
		font-weight: 400;
	}
	.help {
		margin: -4px 0 0;
		font-size: 0.85rem;
		color: var(--fg-muted);
		line-height: 1.55;
	}
	.warn {
		margin: 0;
		font-size: 0.85rem;
		color: var(--nope);
		font-weight: 700;
	}
	.row {
		display: flex;
		gap: 10px;
		align-items: center;
	}
	.sm {
		padding: 8px 16px;
		font-size: 0.85rem;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.label {
		font-size: 0.74rem;
		font-weight: 700;
		color: var(--fg-muted);
	}
	.label small {
		font-weight: 400;
	}
	/* 単一選択: ピル型のトラックに、選んだものだけ黄緑のピル（misskey-hub の btn-check） */
	.seg {
		display: grid;
		gap: 4px;
		padding: 4px;
		border-radius: 999px;
		background: var(--panel-2);
		box-shadow: inset 0 0 0 1px var(--border);
	}
	.seg2 {
		grid-template-columns: 1fr 1fr;
	}
	.seg3 {
		grid-template-columns: 1fr 1fr 1fr;
	}
	.seg button {
		border: none;
		background: none;
		border-radius: 999px;
		padding: 8px 10px;
		font-size: 0.84rem;
		font-weight: 700;
		color: var(--fg-muted);
		cursor: pointer;
		transition: color 0.15s;
	}
	.seg button:hover:not(.on) {
		color: var(--fg);
	}
	.seg button.on {
		background: var(--accent-grad);
		color: #fff;
		box-shadow: var(--shadow-accent);
	}
	/* 複数選択: app.css の .chip。ヒントは小さく添える */
	.chips {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.chip small {
		font-weight: 400;
		font-size: 0.7rem;
		color: var(--fg-muted);
	}
	.chip.on small {
		color: inherit;
		opacity: 0.75;
	}
	.chip .x {
		display: inline-flex;
		opacity: 0.7;
	}
	.switch {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 0;
		border-top: 1px solid var(--border);
		cursor: pointer;
		font-size: 0.9rem;
	}
	.switch:first-of-type {
		border-top: none;
		padding-top: 0;
	}
	.switch input {
		position: absolute;
		opacity: 0;
		width: 0;
		height: 0;
	}
	.switch i {
		flex-shrink: 0;
		width: 44px;
		height: 26px;
		border-radius: 999px;
		background: var(--panel-2);
		box-shadow: inset 0 0 0 1px var(--border);
		position: relative;
		transition: background 0.15s;
	}
	.switch i::after {
		content: '';
		position: absolute;
		top: 3px;
		left: 3px;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: #fff;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
		transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
	}
	.switch input:checked + i {
		background: var(--accent-grad);
		box-shadow: var(--shadow-accent);
	}
	.switch input:checked + i::after {
		transform: translateX(18px);
	}
	.switch input:focus-visible + i {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	/* デスクトップは段組み（高さの違うパネルを隙間なく詰める） */
	@media (min-width: 900px) {
		.settings {
			display: block;
			columns: 2;
			column-gap: 16px;
		}
		.head {
			column-span: all;
			margin-bottom: 16px;
		}
		.block {
			margin-bottom: 16px;
		}
	}
</style>
