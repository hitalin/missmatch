<script lang="ts">
	import { MAX_INTENT_LENGTH } from '$lib/intent';
	import type { Preferences } from '$lib/prefs';

	// 30 秒で終わるオンボーディング: 年齢 → R-18 → ひとこと（任意）。すぐデッキへ
	let {
		prefs = $bindable(),
		reading = false,
		onreadwish,
		onfinish
	}: {
		prefs: Preferences;
		reading?: boolean;
		onreadwish: (text: string) => Promise<void>;
		onfinish: () => void;
	} = $props();

	let step = $state<0 | 1 | 2 | 3>(0);
	const total = 3;

	function pickAge(adult: boolean) {
		prefs = { ...prefs, adult };
		step = 2;
	}
	function pickNsfw(nsfw: Preferences['nsfw']) {
		prefs = { ...prefs, nsfw };
		step = 3;
	}
	async function finishWithWish() {
		const text = prefs.wish.trim();
		if (text.length >= 2) await onreadwish(text);
		onfinish();
	}
</script>

<section class="ob">
	{#if step === 0}
		<div class="hero">
			<div class="blob" aria-hidden="true"></div>
			<p class="brand"><span class="logo">♥</span> みすまっち</p>
			<h1>Swipe.<br />Match.<br />with <span class="accent">Misskey</span>.</h1>
			<p class="lead">
				登録できる日本語 Misskey サーバー約 100 件を、マッチングアプリのようにスワイプで選べます。
				♥ と ✕ から好みを学んで、だんだん合う鯖が上に来ます。
			</p>
			<button class="btn primary big" onclick={() => (step = 1)}>はじめる</button>
			<p class="fine">最初の 2 問だけ答えれば使えます。プロフィールはこのブラウザにだけ保存。</p>
		</div>
	{:else}
		<div class="step">
			<div class="dots" aria-label="{step} / {total}">
				{#each [1, 2, 3] as i (i)}<i class:on={i <= step}></i>{/each}
			</div>

			{#if step === 1}
				<h2>あなたは 18 歳以上ですか？</h2>
				<p class="help">登録年齢を制限しているサーバーを出さないために使います。</p>
				<div class="choices">
					<button class="choice" onclick={() => pickAge(true)}>はい、18 歳以上</button>
					<button class="choice" onclick={() => pickAge(false)}>いいえ、18 歳未満</button>
				</div>
			{:else if step === 2}
				<h2>成人向け（R-18）の投稿が流れてくるのは？</h2>
				<div class="choices">
					<button class="choice" onclick={() => pickNsfw('avoid')}>見たくない</button>
					<button class="choice" onclick={() => pickNsfw('neutral')}>気にしない</button>
					<button class="choice" onclick={() => pickNsfw('welcome')}>むしろ歓迎</button>
				</div>
				<button class="btn ghost" onclick={() => (step = 1)}>← 戻る</button>
			{:else}
				<h2>どんな場所を探していますか？</h2>
				<p class="help">
					一言で構いません。「病み垢を置ける静かな場所」「一次創作が中心」のように、サーバーの説明文に書いてありそうなことほど効きます。
				</p>
				<textarea
					bind:value={prefs.wish}
					maxlength={MAX_INTENT_LENGTH}
					rows="3"
					placeholder="例: 創作垢を置ける、落ち着いたサーバーがいい"
					aria-label="どんな場所を探しているか"
				></textarea>
				<button class="btn primary big" disabled={reading} onclick={finishWithWish}>
					{#if reading}<span class="spin"></span> 読み取り中…{:else if prefs.wish.trim().length >= 2}この希望でさがす{:else}スキップしてさがす{/if}
				</button>
				<button class="btn ghost" onclick={() => (step = 2)}>← 戻る</button>
			{/if}
		</div>
	{/if}
</section>

<style>
	.ob {
		min-height: calc(100dvh - 24px);
		display: flex;
		flex-direction: column;
		justify-content: center;
	}
	.hero,
	.step {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 18px;
		padding: 24px 0 32px;
		overflow: hidden;
	}
	.blob {
		position: absolute;
		top: -120px;
		right: -140px;
		width: 360px;
		height: 360px;
		border-radius: 50%;
		background: radial-gradient(circle at 30% 30%, var(--accent-soft), transparent 70%);
		pointer-events: none;
	}
	.brand {
		margin: 0;
		font-weight: 900;
		font-size: 1.1rem;
	}
	.logo,
	.accent {
		color: var(--accent);
	}
	h1 {
		margin: 0;
		font-size: clamp(2.6rem, 11vw, 3.4rem);
		line-height: 1.05;
		font-weight: 900;
		letter-spacing: -0.02em;
	}
	h2 {
		margin: 0;
		font-size: 1.6rem;
		font-weight: 900;
		line-height: 1.25;
	}
	.lead,
	.help {
		margin: 0;
		color: var(--fg-muted);
		line-height: 1.7;
	}
	.fine {
		margin: 0;
		font-size: 0.75rem;
		color: var(--fg-muted);
	}
	.big {
		padding: 16px 32px;
		font-size: 1.05rem;
	}
	.dots {
		display: flex;
		gap: 6px;
	}
	.dots i {
		width: 28px;
		height: 5px;
		border-radius: 3px;
		background: var(--panel-2);
	}
	.dots i.on {
		background: var(--accent);
	}
	.choices {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.choice {
		background: var(--panel);
		border: 2px solid var(--border);
		border-radius: 16px;
		padding: 18px 20px;
		font-size: 1.05rem;
		font-weight: 800;
		text-align: left;
		cursor: pointer;
		box-shadow: var(--shadow);
		transition:
			border-color 0.12s,
			transform 0.08s;
	}
	.choice:hover {
		border-color: var(--accent);
	}
	.choice:active {
		transform: scale(0.98);
	}
	textarea {
		font: inherit;
		width: 100%;
		background: var(--panel);
		color: var(--fg);
		border: 2px solid var(--border);
		border-radius: 14px;
		padding: 14px 16px;
		resize: vertical;
	}
	textarea:focus {
		outline: none;
		border-color: var(--accent);
	}
	.spin {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		border: 2px solid rgba(255, 255, 255, 0.4);
		border-top-color: #fff;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@media (min-width: 900px) {
		.hero,
		.step {
			max-width: 640px;
			margin: 0 auto;
			width: 100%;
		}
		h1 {
			font-size: 4.4rem;
		}
		.choices {
			flex-direction: row;
		}
		.choice {
			flex: 1;
		}
	}
</style>
