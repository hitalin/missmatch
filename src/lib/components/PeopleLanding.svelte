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
		onsubmit
	}: {
		mode: 'server' | 'people';
		onmode: (m: 'server' | 'people') => void;
		loggedIn: boolean;
		count?: number | null;
		error?: string;
		aiNote?: boolean;
		onsubmit: (text: string) => void;
	} = $props();

	// 例文（サーバー探しと同じく 16 個から 8 個を、表示後にシャッフルして出す）
	const EXAMPLES = [
		'ジャズと料理の話ができる人',
		'深夜に小説の話をしたい',
		'自作キーボード仲間がほしい',
		'VRChat で一緒に遊べる人',
		'猫の写真を見せ合いたい',
		'ゲームの話で盛り上がれる人',
		'イラストを描く仲間',
		'技術の話を気兼ねなくしたい',
		'日記みたいな投稿を読み合いたい',
		'推しの話を聞いてくれる人',
		'音楽を作っている人',
		'アニメの感想を言い合いたい',
		'ものづくりの進捗を見せ合いたい',
		'ゆるく雑談できる人',
		'写真を撮るのが好きな人',
		'同じ趣味で長く話せる人'
	];
	const SHOWN = 8;
	let examples = $state(EXAMPLES.slice(0, SHOWN));
	$effect(() => {
		const pool = [...EXAMPLES];
		for (let i = pool.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[pool[i], pool[j]] = [pool[j], pool[i]];
		}
		examples = pool.slice(0, SHOWN);
	});
	let users = $state<ExampleUser[]>([]);
	$effect(() => {
		fetch('/api/people/examples')
			.then((r) => (r.ok ? r.json() : { users: [] }))
			.then((d) => {
				users = ((d as { users?: ExampleUser[] }).users ?? []).slice(0, 6);
			})
			.catch(() => {});
	});
	const cards = $derived(
		users.map((u) => ({ host: u.host, name: u.name, bannerUrl: u.avatarUrl, iconUrl: null, themeColor: null }))
	);
	let text = $state('');
	const go = (t: string) => onsubmit(t.trim().slice(0, MAX_INTENT_LENGTH));
</script>

<!-- GitHub Corner（misspace と同じ。デスクトップだけ） -->
<a
	href="https://github.com/hitalin/missmatch"
	target="_blank"
	rel="noopener noreferrer"
	class="github-corner"
	aria-label="GitHub でソースを見る"
>
	<svg width="80" height="80" viewBox="0 0 250 250" aria-hidden="true">
		<path d="M0,0 L115,115 L130,115 L142,142 L250,250 L250,0 Z" />
		<path
			d="M128.3,109.0 C113.8,99.7 119.0,89.6 119.0,89.6 C122.0,82.7 120.5,78.6 120.5,78.6 C119.2,72.0 123.4,76.3 123.4,76.3 C127.3,80.9 125.5,87.3 125.5,87.3 C122.9,97.6 130.6,101.9 134.4,103.2"
			fill="currentColor"
			class="octo-arm"
		/>
		<path
			d="M115.0,115.0 C114.9,115.1 118.7,116.5 119.8,115.4 L133.7,101.6 C136.9,99.2 139.9,98.4 142.2,98.6 C133.8,88.0 127.5,74.4 143.8,58.0 C148.5,53.4 154.0,51.2 159.7,51.0 C160.3,49.4 163.2,43.6 171.4,40.1 C171.4,40.1 176.1,42.5 178.8,56.2 C183.1,58.6 187.2,61.8 190.9,65.4 C194.5,69.0 197.7,73.2 200.1,77.6 C213.8,80.2 216.3,84.9 216.3,84.9 C212.7,93.1 206.9,96.0 205.4,96.6 C205.1,102.4 203.0,107.8 198.3,112.5 C181.9,128.9 168.3,122.5 157.7,114.1 C157.9,116.9 156.7,120.9 152.7,124.9 L141.0,136.5 C139.8,137.7 141.6,141.9 141.8,141.8 Z"
			fill="currentColor"
			class="octo-body"
		/>
	</svg>
</a>

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
				autofocus
				onsubmit={go}
			>
				{#snippet left()}
					<span>{loggedIn ? 'Enter で探す · Shift+Enter で改行' : '送ると Misskey でログインして参加します'}</span>
				{/snippet}
			</PromptBox>
		</div>
		<ul class="examples">
			{#each examples as ex (ex)}
				<li><button class="chip ghost" onclick={() => go(ex)}>{ex}</button></li>
			{/each}
		</ul>
		{#if error}<p class="err">{error}</p>{/if}
		{#if aiNote}<p class="note">判定に使う AI はノートを学習しません（AI 学習の防止をオンにしている方へ）</p>{/if}
	</div>
	<footer>
		<p>
			データ: 参加した人の Misskey の公開プロフィール{#if count !== null}（いま {count} 人）{/if}
			· 判定: Cloudflare Workers AI (Clef)
			· <a href="https://github.com/hitalin/missmatch" target="_blank" rel="noopener">GitHub</a>
		</p>
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
	.github-corner {
		display: none;
	}
	@media (min-width: 900px) {
		.github-corner {
			display: block;
			position: fixed;
			top: 0;
			right: 0;
			z-index: 20;
		}
	}
	.github-corner svg {
		fill: var(--accent);
		color: var(--bg);
	}
	.github-corner .octo-arm {
		transform-origin: 130px 106px;
	}
	.github-corner:hover .octo-arm {
		animation: octocat-wave 560ms ease-in-out;
	}
	@keyframes octocat-wave {
		0%,
		100% {
			transform: rotate(0);
		}
		20%,
		60% {
			transform: rotate(-25deg);
		}
		40%,
		80% {
			transform: rotate(10deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.github-corner:hover .octo-arm {
			animation: none;
		}
	}
</style>
