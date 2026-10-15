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
	.landing {
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
</style>
