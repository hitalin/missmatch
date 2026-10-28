<script lang="ts">
	import { MAX_INTENT_LENGTH } from '$lib/intent';
	import type { ExampleUser } from '$lib/server/examples';
	import LandingBackdrop from './LandingBackdrop.svelte';
	import ModeToggle from './ModeToggle.svelte';
	import PromptBox from './PromptBox.svelte';

	// 人モードのランディング。サーバー探しと同じ骨組み（切替 → ロゴ → 問いかけ → 入力欄 → 例文）。
	// 背景には実在のユーザー（参加者。少ない間は各サーバーがピン留めしている人）のカード。
	// ログイン = 参加なので、言葉を送るとそのまま探し始める（未ログインならログインへ）
	let {
		mode,
		onmode,
		loggedIn,
		count = null,
		error = '',
		aiNote = false,
		onsubmit,
		onbrowse
	}: {
		mode: 'server' | 'people';
		onmode: (m: 'server' | 'people') => void;
		loggedIn: boolean;
		count?: number | null;
		error?: string;
		aiNote?: boolean;
		onsubmit: (text: string) => void;
		onbrowse?: () => void; // 言葉なしで全員を見る
	} = $props();

	const EXAMPLES = [
		'ジャズと料理の話ができる人',
		'深夜に小説の話をしたい',
		'自作キーボード仲間がほしい',
		'VRChat で一緒に遊べる人',
		'猫の写真を見せ合いたい',
		'ゲームの話で盛り上がれる人',
		'イラストを描く仲間',
		'技術の話を気兼ねなくしたい'
	];
	let examples = $state<ExampleUser[]>([]);
	$effect(() => {
		fetch('/api/people/examples')
			.then((r) => (r.ok ? r.json() : { users: [] }))
			.then((d) => {
				examples = ((d as { users?: ExampleUser[] }).users ?? []).slice(0, 6);
			})
			.catch(() => {});
	});
	const cards = $derived(
		examples.map((u) => ({ host: u.host, name: u.name, bannerUrl: u.avatarUrl, iconUrl: null, themeColor: null }))
	);
	let text = $state('');
	const go = (t: string) => onsubmit(t.trim().slice(0, MAX_INTENT_LENGTH));
</script>

<div class="landing">
	<LandingBackdrop servers={cards} />
	<div class="mode"><ModeToggle {mode} onchange={onmode} /></div>
	<div class="center">
		<h1 class="brand"><img class="logo" src="/logo.svg" alt="" width="48" height="48" /> <span class="text-grad">みすまっち</span></h1>
		<p class="tagline">Misskey のユーザーと、マッチング。</p>
		<p class="ask">どんな人と話したい？</p>
		<div class="search">
			<PromptBox
				bind:value={text}
				label="どんな人と話したい？"
				placeholder="例: ジャズと料理の話ができる人"
				minRows={3}
				onsubmit={go}
			>
				{#snippet left()}
					<span>{loggedIn ? 'Enter で探す · Shift+Enter で改行' : '送ると Misskey でログインして参加します'}</span>
				{/snippet}
			</PromptBox>
		</div>
		<ul class="examples">
			{#each EXAMPLES as ex (ex)}
				<li><button class="chip ghost" onclick={() => go(ex)}>{ex}</button></li>
			{/each}
		</ul>
		{#if loggedIn && onbrowse}<button class="link" onclick={onbrowse}>言葉を入れずに全員を見る</button>{/if}
		{#if error}<p class="err">{error}</p>{/if}
		{#if aiNote}<p class="note">判定に使う AI はノートを学習しません（AI 学習の防止をオンにしている方へ）</p>{/if}
	</div>
	<footer>
		<p>右スワイプでいいね · フォローは Misskey で · 相互フォローでマッチ{#if count !== null} · いま {count} 人{/if}</p>
	</footer>
</div>

<style>
	.landing {
		flex: 1;
		display: flex;
		flex-direction: column;
		position: relative;
		isolation: isolate;
	}
	.mode {
		display: flex;
		justify-content: center;
		padding-top: 8px;
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
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	.logo {
		width: 1.1em;
		height: 1.1em;
		vertical-align: -0.18em;
	}
	.tagline {
		margin: -8px 0 8px;
		color: var(--fg-muted);
	}
	.ask {
		margin: 4px 0 -6px;
		font-size: 1.05rem;
		color: var(--fg-muted);
	}
	.search {
		width: 100%;
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
	@media (max-width: 899px) {
		.examples li:nth-child(n + 6) {
			display: none;
		}
	}
	.link {
		border: none;
		background: none;
		padding: 0;
		color: var(--fg-muted);
		font-size: 0.82rem;
		font-weight: 700;
		cursor: pointer;
		text-decoration: underline;
	}
	.err {
		margin: 0;
		color: var(--nope);
		font-weight: 700;
		font-size: 0.86rem;
		text-align: center;
		word-break: break-all;
	}
	.note {
		margin: 0;
		font-size: 0.76rem;
		color: var(--fg-muted);
		text-align: center;
		max-width: 520px;
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
		margin: 0;
	}
</style>
