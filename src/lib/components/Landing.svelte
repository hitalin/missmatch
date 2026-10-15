<script lang="ts">
	import { MAX_INTENT_LENGTH } from '$lib/intent';
	import LandingBackdrop from './LandingBackdrop.svelte';
	import PromptBox from './PromptBox.svelte';

	// 言葉がまだ無い「さがす」: 検索ボックスだけのランディング。送るとこの検索の言葉になる
	let { onsubmit }: { onsubmit: (text: string) => void } = $props();

	const EXAMPLES = [
		'病み垢を置ける、静かで干渉が少ない場所',
		'一次創作のイラストを見せたい',
		'メアドなしで登録できてゲームの話ができる',
		'VRChat の人が多いところ'
	];
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
	<LandingBackdrop />
	<div class="center">
		<h1 class="brand"><img class="logo" src="/logo.svg" alt="" width="48" height="48" /> <span class="text-grad">みすまっち</span></h1>
		<p class="tagline">Misskey のサーバーと、マッチング。</p>
		<p class="ask">どんな場所を探している？</p>

		<div class="search">
			<PromptBox
				bind:value={text}
				label="どんな場所を探している？"
				placeholder="例: 病み垢を置ける、静かで干渉が少ない場所"
				minRows={3}
				autofocus
				onsubmit={go}
			>
				{#snippet left()}
					<span>Enter で探す · Shift+Enter で改行</span>
				{/snippet}
			</PromptBox>
		</div>

		<ul class="examples">
			{#each EXAMPLES as ex (ex)}
				<li><button class="chip ghost" onclick={() => go(ex)}>{ex}</button></li>
			{/each}
		</ul>
	</div>

	<footer>
		<p>
			データ: <a href="https://join.misskey.page/" target="_blank" rel="noopener">joinmisskey</a>
			· 判定: Cloudflare Workers AI (Clef)
			· <a href="https://github.com/hitalin/missmatch" target="_blank" rel="noopener">GitHub</a>
		</p>
	</footer>
</div>

<style>
	/* 宇宙の上ではカーソルを 🚀 に（misspace と同じ）。本文の余白も含めるため、本文の枠ごと指定する。
	   入力欄やボタンは自分のカーソル（文字・指）のまま */
	:global(.content:has(.landing)) {
		cursor:
			url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><text y='24' font-size='24'>🚀</text></svg>")
				4 4,
			auto;
	}
	/* 宇宙の背景の上に載るので、ライト / ダークに関わらず暗い配色にする */
	.landing {
		--fg: #f0f2f5;
		--fg-muted: rgba(240, 242, 245, 0.62);
		--panel: rgba(30, 32, 40, 0.78);
		--panel-2: rgba(255, 255, 255, 0.06);
		--border: rgba(255, 255, 255, 0.14);
		--bg: #130e26;
		--accent-soft: rgba(134, 179, 0, 0.2);
		--accent-fg: #c9ec5a;
		--shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
		color: var(--fg);
		flex: 1;
		display: flex;
		flex-direction: column;
		position: relative;
		isolation: isolate;
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
		color: #130e26;
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
