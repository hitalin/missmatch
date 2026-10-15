<script lang="ts">
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
			条件を変えると「選ぶ」のカードが入れ替わります。
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
								{c.label} <span class="x">✕</span>
							</button>
						</li>
					{/each}
				</ul>
				<p class="help">✕ で個別に忘れられます。カードの並びに反映されます。</p>
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
			<div class="seg2">
				<button class:on={prefs.adult === true} onclick={() => (prefs = { ...prefs, adult: true })}>18 歳以上</button>
				<button class:on={prefs.adult === false} onclick={() => (prefs = { ...prefs, adult: false })}>18 歳未満</button>
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
							{REGISTRATION_LABELS[r]} <small>{REGISTRATION_HINTS[r]}</small>
						</button>
					</li>
				{/each}
			</ul>
		</div>
		<div class="field">
			<span class="label">R-18 の投稿</span>
			<div class="seg3">
				{#each [['avoid', '見たくない'], ['neutral', '気にしない'], ['welcome', '歓迎']] as [v, label] (v)}
					<button class:on={prefs.nsfw === v} onclick={() => (prefs = { ...prefs, nsfw: v as Preferences['nsfw'] })}>{label}</button>
				{/each}
			</div>
		</div>
	</div>

	<div class="panel block">
		<h2>話したいこと <span class="muted small">複数可・加点</span></h2>
		<ul class="chips">
			{#each TOPICS as t (t)}
				<li><button class="chip" class:on={prefs.topics.includes(t)} aria-pressed={prefs.topics.includes(t)} onclick={() => (prefs = { ...prefs, topics: toggleIn(prefs.topics, t) })}>{TOPIC_LABELS[t]}</button></li>
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
					<li><button class="chip" class:on={prefs.scales.includes(s)} aria-pressed={prefs.scales.includes(s)} onclick={() => (prefs = { ...prefs, scales: toggleIn(prefs.scales, s) })}>{SCALE_LABELS[s]} <small>{SCALE_HINTS[s]}</small></button></li>
				{/each}
			</ul>
		</div>
		<div class="field">
			<span class="label">流速</span>
			<ul class="chips">
				{#each PACES as p (p)}
					<li><button class="chip" class:on={prefs.paces.includes(p)} aria-pressed={prefs.paces.includes(p)} onclick={() => (prefs = { ...prefs, paces: toggleIn(prefs.paces, p) })}>{PACE_LABELS[p]} <small>{PACE_HINTS[p]}</small></button></li>
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
		gap: 12px;
	}
	.head h1 {
		margin: 8px 0 4px;
		font-size: 1.6rem;
		font-weight: 900;
	}
	.head p {
		margin: 0;
		font-size: 0.9rem;
	}
	.block {
		padding: 14px 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	h2 {
		margin: 0;
		font-size: 1.02rem;
		display: flex;
		align-items: baseline;
		gap: 8px;
		flex-wrap: wrap;
	}
	.small {
		font-size: 0.75rem;
		font-weight: 600;
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
		padding: 9px 16px;
		font-size: 0.88rem;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.label {
		font-size: 0.78rem;
		font-weight: 700;
		color: var(--fg-muted);
	}
	.seg2,
	.seg3 {
		display: grid;
		gap: 3px;
		background: var(--panel-2);
		border-radius: 12px;
		padding: 3px;
	}
	.seg2 {
		grid-template-columns: 1fr 1fr;
	}
	.seg3 {
		grid-template-columns: 1fr 1fr 1fr;
	}
	.seg2 button,
	.seg3 button {
		border: none;
		background: none;
		border-radius: 10px;
		padding: 9px 10px;
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--fg-muted);
		cursor: pointer;
	}
	.seg2 button.on,
	.seg3 button.on {
		background: var(--panel);
		color: var(--accent-fg);
		box-shadow: var(--shadow);
	}
	.chips {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.chip {
		background: var(--bg);
		border: 1.5px solid var(--border);
		border-radius: 999px;
		padding: 8px 14px;
		font-weight: 700;
		font-size: 0.9rem;
		cursor: pointer;
		display: inline-flex;
		align-items: baseline;
		gap: 6px;
		transition:
			border-color 0.12s,
			background 0.12s;
	}
	.chip small {
		font-weight: 500;
		font-size: 0.72rem;
		color: var(--fg-muted);
	}
	.chip.on {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--accent-fg);
	}
	.chip .x {
		font-size: 0.75rem;
		opacity: 0.7;
	}
	.switch {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 8px 0;
		border-top: 1px solid var(--border);
		cursor: pointer;
		font-size: 0.92rem;
	}
	.switch:first-of-type {
		border-top: none;
	}
	.switch input {
		position: absolute;
		opacity: 0;
		width: 0;
		height: 0;
	}
	.switch i {
		flex-shrink: 0;
		width: 46px;
		height: 28px;
		border-radius: 999px;
		background: var(--panel-2);
		position: relative;
		transition: background 0.15s;
	}
	.switch i::after {
		content: '';
		position: absolute;
		top: 3px;
		left: 3px;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: #fff;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
		transition: transform 0.15s;
	}
	.switch input:checked + i {
		background: var(--accent);
	}
	.switch input:checked + i::after {
		transform: translateX(18px);
	}
	.switch input:focus-visible + i {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	@media (min-width: 900px) {
		.settings {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 16px;
		}
		.head {
			grid-column: 1 / -1;
		}
	}
</style>
