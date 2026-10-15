<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { MAX_INTENT_LENGTH } from '$lib/intent';
	import { isComplete } from '$lib/prefs';
	import { emptyProfile, loadSavedProfile, persistProfile, type SavedProfile } from '$lib/profile';

	// 探す: 検索ボックスだけのランディング。言葉を入れて送ると「選ぶ」でデッキが並び替わる
	const EXAMPLES = [
		'病み垢を置ける、静かで干渉が少ない場所',
		'一次創作のイラストを見せたい',
		'メアドなしで登録できてゲームの話ができる',
		'VRChat の人が多いところ'
	];

	let profile = $state<SavedProfile>(emptyProfile());
	let text = $state('');
	let hasProfile = $state(false);

	onMount(() => {
		profile = loadSavedProfile();
		text = profile.prefs.wish;
		hasProfile = isComplete(profile.prefs);
	});

	function go(wish: string) {
		const trimmed = wish.trim().slice(0, MAX_INTENT_LENGTH);
		const changed = trimmed !== profile.prefs.affinityFor;
		persistProfile({
			...profile,
			prefs: {
				...profile.prefs,
				wish: trimmed,
				// 言葉が変わったら噛み合いは「選ぶ」で読み直す
				affinity: changed ? {} : profile.prefs.affinity,
				affinityFor: changed ? '' : profile.prefs.affinityFor
			}
		});
		goto(resolve('/pick'));
	}
	function submit(e: SubmitEvent) {
		e.preventDefault();
		if (text.trim().length >= 2) go(text);
	}
</script>

<svelte:head>
	<title>みすまっち - Misskey サーバーとマッチング</title>
	<meta
		name="description"
		content="探している場所を一言で。日本語 Misskey サーバーの中から、雰囲気と条件が合うものをスワイプで選べます。"
	/>
</svelte:head>

<main class="landing">
	<div class="center">
		<h1 class="brand"><span class="logo">♥</span> みすまっち</h1>
		<p class="tagline">Misskey のサーバーを、探して、選ぶ。</p>

		<form class="search" onsubmit={submit} role="search">
			<label class="sr-only" for="q">どんな場所を探している？</label>
			<div class="box">
				<span class="icon" aria-hidden="true">✦</span>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					id="q"
					type="search"
					bind:value={text}
					maxlength={MAX_INTENT_LENGTH}
					placeholder="どんな場所を探している？"
					enterkeyhint="search"
					autocomplete="off"
					autofocus
				/>
				<button type="submit" class="go" disabled={text.trim().length < 2} aria-label="探す">→</button>
			</div>
		</form>

		<ul class="examples">
			{#each EXAMPLES as ex (ex)}
				<li><button onclick={() => go(ex)}>{ex}</button></li>
			{/each}
		</ul>

		<p class="skip">
			<a href={resolve('/pick')}>{hasProfile ? '前回の続きから選ぶ' : '言葉を入れずに条件だけで選ぶ'} →</a>
		</p>
	</div>

	<footer>
		<p>
			登録できる日本語 Misskey サーバー約 100 件（招待制・停止中を含めると約 580 件）を、説明文・ルール・最近の投稿から読み取った雰囲気と条件で並べます。
			プロフィールはこのブラウザにだけ保存。
		</p>
		<p>
			データ: <a href="https://join.misskey.page/" target="_blank" rel="noopener">joinmisskey</a>
			· 判定: Cloudflare Workers AI (Clef)
			· <a href="https://github.com/hitalin/missmatch" target="_blank" rel="noopener">GitHub</a>
		</p>
	</footer>
</main>

<style>
	.landing {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		padding: 0 16px;
	}
	.center {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 18px;
		width: 100%;
		max-width: 640px;
		margin: 0 auto;
		padding: 48px 0 24px;
	}
	.brand {
		margin: 0;
		font-size: clamp(2.2rem, 9vw, 3.2rem);
		font-weight: 900;
		letter-spacing: -0.02em;
	}
	.logo {
		color: var(--accent);
	}
	.tagline {
		margin: -8px 0 8px;
		color: var(--fg-muted);
	}
	.search {
		width: 100%;
	}
	.box {
		display: flex;
		align-items: center;
		gap: 10px;
		background: var(--panel);
		border: 1.5px solid var(--border);
		border-radius: 999px;
		padding: 8px 8px 8px 18px;
		box-shadow: var(--shadow-lg);
	}
	.box:focus-within {
		border-color: var(--accent);
	}
	.icon {
		color: var(--accent);
		font-size: 1.1rem;
	}
	input {
		flex: 1;
		min-width: 0;
		font: inherit;
		font-size: 1.1rem;
		background: none;
		border: none;
		color: var(--fg);
		padding: 10px 0;
	}
	input:focus {
		outline: none;
	}
	input::-webkit-search-cancel-button {
		display: none;
	}
	.go {
		width: 46px;
		height: 46px;
		border-radius: 50%;
		border: none;
		background: var(--accent);
		color: #fff;
		font-size: 1.3rem;
		font-weight: 900;
		cursor: pointer;
		flex-shrink: 0;
	}
	.go:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.examples {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 8px;
	}
	.examples button {
		font-size: 0.85rem;
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 8px 14px;
		cursor: pointer;
		color: var(--fg-muted);
	}
	.examples button:hover {
		border-color: var(--accent);
		color: var(--fg);
	}
	.skip {
		margin: 6px 0 0;
		font-size: 0.9rem;
	}
	.skip a {
		font-weight: 700;
	}
	footer {
		padding: 16px 0 24px;
		font-size: 0.72rem;
		color: var(--fg-muted);
		text-align: center;
		max-width: 640px;
		margin: 0 auto;
	}
	footer p {
		margin: 4px 0;
	}
	footer a {
		color: var(--fg-muted);
	}
</style>
