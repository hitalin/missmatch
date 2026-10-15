<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Segmented from '$lib/components/Segmented.svelte';
	import { applyFilters, type Taste, tasteSummary } from '$lib/match';
	import {
		ACTIVITIES,
		ACTIVITY_LABELS,
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
		onforget,
		onresetprefs
	}: {
		prefs: Preferences;
		taste: Taste;
		swipes: number;
		profiles: ServerProfile[] | null;
		onresettaste: () => void;
		onforget: (feature: keyof Taste) => void;
		onresetprefs: () => void; // 年齢以外を初期値に戻す
	} = $props();

	const count = $derived(profiles ? applyFilters(profiles, prefs).length : null);
	const chips = $derived(tasteSummary(taste));

	function toggleIn<T extends string>(list: T[], v: T): T[] {
		return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
	}
	// 絶対条件はチップで並べるので短い名前にし、種類ごとに分ける
	const DEALBREAKER_GROUPS: { label: string; items: [keyof Dealbreakers, string][] }[] = [
		{
			label: '登録・タイムライン',
			items: [
				['emailFree', 'メアドなしで登録'],
				['adsFree', '広告なし'],
				['ltl', 'ローカル TL あり'],
				['gtl', 'グローバル TL あり']
			]
		},
		{
			label: '機能',
			items: [
				['noteSearch', 'ノート検索'],
				['translator', '翻訳'],
				['chat', 'チャット'],
				['videoUpload', '動画アップロード'],
				['bigDrive', 'ドライブ 10GB 以上']
			]
		},
		{
			label: '運営',
			items: [
				['official', '本家 Misskey のみ'],
				['fresh', '最新版に追従'],
				['tos', '利用規約あり'],
				['privacyPolicy', 'プライバシーポリシーあり']
			]
		}
	];
	function setDealbreaker(key: keyof Dealbreakers, value: boolean) {
		prefs = { ...prefs, dealbreakers: { ...prefs.dealbreakers, [key]: value } };
	}
</script>

<section class="settings">
	<header class="head">
		<h1>あなた</h1>
		<p class="muted">{#if count !== null}いまの条件に合うサーバーは <b>{count} 件</b>{:else}サーバー情報を取得中…{/if}</p>
		<button class="btn secondary reset-all" onclick={onresetprefs}>初期値に戻す</button>
	</header>

	<div class="col">
		<div class="panel block">
			<h2>基本</h2>
			<div class="field">
				<span class="label">年齢</span>
				<div class="seg seg3" role="radiogroup">
					<button role="radio" aria-checked={prefs.age === 'adult'} class:on={prefs.age === 'adult'} onclick={() => (prefs = { ...prefs, age: 'adult' })}>18 歳以上</button>
					<button role="radio" aria-checked={prefs.age === 'minor'} class:on={prefs.age === 'minor'} onclick={() => (prefs = { ...prefs, age: 'minor' })}>12〜17 歳</button>
					<button role="radio" aria-checked={prefs.age === 'child'} class:on={prefs.age === 'child'} onclick={() => (prefs = { ...prefs, age: 'child' })}>12 歳未満</button>
				</div>
			</div>
			<div class="field">
				<span class="label">毎日いる人 <small class="muted">1 日に読んでいる人の数（15 日平均）</small></span>
				<div class="seg seg3" role="radiogroup">
					{#each ACTIVITIES as a (a)}
						<button role="radio" aria-checked={prefs.activity === a} class:on={prefs.activity === a} onclick={() => (prefs = { ...prefs, activity: a })}>{ACTIVITY_LABELS[a]}</button>
					{/each}
				</div>
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
	</div>
	<div class="col">
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
	</div>
	<div class="col">
		{#if swipes > 0}
			<div class="panel block">
				<h2>
					この検索で学んだ好み <span class="muted small">{swipes} スワイプ</span>
					<button class="reset" onclick={onresettaste}>リセット</button>
				</h2>
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
				{/if}
			</div>
		{/if}
		<div class="panel block">
			<h2>絶対条件 <span class="muted small">当てはまらない鯖は出さない</span></h2>
			<div class="field">
				<span class="label">登録のしかた</span>
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
								{REGISTRATION_LABELS[r]}
							</button>
						</li>
					{/each}
				</ul>
			</div>
			{#each DEALBREAKER_GROUPS as g (g.label)}
				<div class="field">
					<span class="label">{g.label}</span>
					<ul class="chips">
						{#each g.items as [k, label] (k)}
							<li>
								<button
									class="chip"
									class:on={prefs.dealbreakers[k]}
									aria-pressed={prefs.dealbreakers[k]}
									title={DEALBREAKER_LABELS[k]}
									onclick={() => setDealbreaker(k, !prefs.dealbreakers[k])}
								>
									{#if prefs.dealbreakers[k]}<Icon name="check" size={13} />{/if}{label}
								</button>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
			{#if count !== null && count < 5}
				<p class="warn">条件が厳しく、該当が {count} 件です。絶対条件を減らすと増えます。</p>
			{/if}
		</div>
	</div>

</section>

<style>
	.settings {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.head {
		display: flex;
		align-items: baseline;
		gap: 12px;
	}
	.head h1 {
		margin: 4px 0;
		font-size: 1.5rem;
		font-weight: 700;
	}
	.head p {
		margin: 0;
		font-size: 0.86rem;
	}
	.reset-all {
		margin-left: auto;
		padding: 6px 14px;
		font-size: 0.8rem;
	}
	.block {
		padding: 18px 20px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		break-inside: avoid;
	}
	h2 {
		margin: 0;
		font-size: 1rem;
		display: flex;
		align-items: baseline;
		gap: 4px 8px;
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
	.reset {
		margin-left: auto;
		white-space: nowrap;
		border: none;
		background: none;
		padding: 0;
		font-size: 0.74rem;
		font-weight: 700;
		color: var(--fg-muted);
		cursor: pointer;
	}
	.reset:hover {
		color: var(--nope);
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
	.seg3 {
		grid-template-columns: 1fr 1fr 1fr;
	}
	.seg button {
		white-space: nowrap;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		border: none;
		background: none;
		border-radius: 999px;
		padding: 8px 8px;
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
	.chips .chip {
		padding: 6px 13px;
		font-size: 0.8rem;
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
	/* デスクトップは段組み（高さの違うパネルを隙間なく詰める） */
	/* モバイルは 1 列にそのまま並べる */
	.col {
		display: contents;
	}
	/* デスクトップは高さが揃うよう 3 列に振り分け、1 画面に収める */
	@media (min-width: 900px) {
		.settings {
			display: grid;
			grid-template-columns: repeat(3, minmax(0, 1fr));
			align-items: start;
			gap: 14px 18px;
		}
		.head {
			grid-column: 1 / -1;
		}
		.col {
			display: flex;
			flex-direction: column;
			gap: 16px;
		}
	}
</style>
