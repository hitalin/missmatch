<script lang="ts">
	import MatchList from '$lib/components/MatchList.svelte';
	import ProfileSetup from '$lib/components/ProfileSetup.svelte';
	import SwipeDeck from '$lib/components/SwipeDeck.svelte';
	import type { Match, QuizAnswers } from '$lib/types';

	type Phase = 'intro' | 'profile' | 'loading' | 'swipe' | 'matches' | 'error';

	let phase = $state<Phase>('intro');
	let answers = $state<QuizAnswers>({});
	let results = $state<Match[]>([]);
	let liked = $state<Match[]>([]);
	let deckDone = $state(false);
	let celebrate = $state<Match | null>(null);
	let errorMessage = $state('');

	async function submit(a: QuizAnswers) {
		answers = a;
		phase = 'loading';
		try {
			const res = await fetch('/api/recommend', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ answers })
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = (await res.json()) as { matches: Match[] };
			results = data.matches;
			liked = [];
			deckDone = results.length === 0;
			phase = deckDone ? 'matches' : 'swipe';
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : String(e);
			phase = 'error';
		}
	}

	function like(m: Match) {
		if (!liked.some((x) => x.server.host === m.server.host)) liked = [...liked, m];
		// 相性が高いカードを好きになったら「マッチ」演出
		if (m.score >= 70) celebrate = m;
	}

	function remove(m: Match) {
		liked = liked.filter((x) => x.server.host !== m.server.host);
	}

	function finishDeck() {
		deckDone = true;
		if (!celebrate) phase = 'matches';
	}

	function closeCelebrate() {
		celebrate = null;
		if (deckDone) phase = 'matches';
	}

	function restart() {
		results = [];
		liked = [];
		deckDone = false;
		phase = 'profile';
	}
</script>

<svelte:head>
	<title>missmatch - Misskey サーバーとマッチング</title>
	<meta
		name="description"
		content="プロフィールを作って、雰囲気まで考慮したおすすめ Misskey サーバーをスワイプで選ぼう。"
	/>
</svelte:head>

<main>
	<header>
		<button class="brand" onclick={() => (phase = 'intro')}>
			<span class="logo">♥</span>
			<span>missmatch</span>
		</button>
		{#if results.length > 0}
			<button class="likes" onclick={() => (phase = phase === 'matches' ? 'swipe' : 'matches')}>
				{#if phase === 'matches' && !deckDone}← スワイプに戻る{:else}♥ {liked.length}{/if}
			</button>
		{/if}
	</header>

	{#if phase === 'intro'}
		<section class="intro">
			<h1>Swipe.<br />Match.<br />with <span class="accent">Misskey</span>.</h1>
			<p class="lead">
				プロフィールを作ると、各サーバーの説明文・ルール・最近の投稿から読み取った雰囲気をもとに、
				相性の良い Misskey サーバーをカードでお届けします。
			</p>
			<div class="cta-row">
				<button class="btn primary" onclick={() => (phase = 'profile')}>はじめる</button>
				<a class="btn secondary" href="#how">詳しく知る</a>
			</div>
			<div class="features" id="how">
				<div class="feature">
					<span class="emoji">📝</span>
					<h3>プロフィール</h3>
					<p>話したいこと、好きな流速や空気感など 7 つの質問に答えます。</p>
				</div>
				<div class="feature">
					<span class="emoji">🔭</span>
					<h3>スワイプ</h3>
					<p>AI（Cloudflare Clef）が読み取った雰囲気をもとに、相性の良い順にカードで提示。右で ♥、左で ✕。</p>
				</div>
				<div class="feature">
					<span class="emoji">🤝</span>
					<h3>マッチ</h3>
					<p>いいねしたサーバーは一覧に残ります。登録するかどうかは、自分の目で確かめて決めてください。</p>
				</div>
			</div>
		</section>
	{:else if phase === 'profile'}
		<ProfileSetup onsubmit={submit} oncancel={() => (phase = 'intro')} />
	{:else if phase === 'loading'}
		<section class="loading">
			<div class="pulse"><span>♥</span></div>
			<h2>相手を探しています…</h2>
			<p>初めて診断されるサーバーが多いと、十数秒かかることがあります。</p>
		</section>
	{:else if phase === 'error'}
		<section class="error">
			<h2>うまくいきませんでした</h2>
			<p class="msg">{errorMessage}</p>
			<button class="btn primary" onclick={() => submit(answers)}>もう一度試す</button>
			<button class="btn secondary" onclick={restart}>プロフィールを作り直す</button>
		</section>
	{:else if phase === 'swipe'}
		<SwipeDeck matches={results} onlike={like} onpass={() => {}} ondone={finishDeck} />
	{:else}
		<MatchList matches={liked} onremove={remove} />
		<div class="after">
			{#if !deckDone}
				<button class="btn primary" onclick={() => (phase = 'swipe')}>スワイプに戻る</button>
			{/if}
			<button class="btn secondary" onclick={restart}>プロフィールを作り直す</button>
		</div>
	{/if}

	{#if celebrate}
		<div class="overlay" role="dialog" aria-modal="true" aria-label="マッチしました">
			<div class="match">
				<p class="title">マッチしました！</p>
				<div class="faces">
					<div class="face you">あなた</div>
					<span class="heart">♥</span>
					{#if celebrate.server.iconUrl}
						<img src={celebrate.server.iconUrl} alt="" width="72" height="72" />
					{:else}
						<div class="face">{(celebrate.server.name ?? celebrate.server.host).slice(0, 1)}</div>
					{/if}
				</div>
				<p class="name">{celebrate.server.name ?? celebrate.server.host}</p>
				<p class="sub">相性 {celebrate.score}%。きっと居心地が良いはず。</p>
				<a class="btn primary" href="https://{celebrate.server.host}/" target="_blank" rel="noopener">
					サーバーを見に行く
				</a>
				<button class="btn secondary" onclick={closeCelebrate}>スワイプを続ける</button>
			</div>
		</div>
	{/if}

	<footer>
		<p>
			データ: <a href="https://join.misskey.page/" target="_blank" rel="noopener">joinmisskey</a>
			・ 判定: Cloudflare Workers AI (Clef)
			・ <a href="https://github.com/hitalin/missmatch" target="_blank" rel="noopener">GitHub</a>
		</p>
	</footer>
</main>

<style>
	:global(:root) {
		--bg: #f6f6f6;
		--surface: #ffffff;
		--surface-2: #efefef;
		--card: #ffffff;
		--border: #e4e4e4;
		--text: #222222;
		--muted: #6c757d;
		--accent: #86b300;
		--accent-strong: #6f9600;
		--accent-soft: #f6ffc7;
		--accent-text: #4a6b00;
		--like: #86b300;
		--like-soft: #f6ffc7;
		--pass: #dc3545;
		--shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
		--shadow-lg: 0 18px 40px rgba(0, 0, 0, 0.14);
	}
	@media (prefers-color-scheme: dark) {
		:global(:root) {
			--bg: #1f1f1f;
			--surface: #2e2e2e;
			--surface-2: #383838;
			--card: #2e2e2e;
			--border: #3d3d3d;
			--text: #eeeeee;
			--muted: #a7a7a7;
			--accent-soft: rgba(134, 179, 0, 0.18);
			--accent-text: #c9ec5a;
			--like-soft: rgba(134, 179, 0, 0.18);
			--shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
			--shadow-lg: 0 18px 40px rgba(0, 0, 0, 0.5);
		}
	}
	:global(body) {
		margin: 0;
		background: var(--bg);
		color: var(--text);
		font-family:
			'Nunito', 'Hiragino Maru Gothic Pro', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
		min-height: 100vh;
	}
	main {
		max-width: 480px;
		margin: 0 auto;
		padding: 0 16px 40px;
	}
	header {
		position: sticky;
		top: 0;
		z-index: 10;
		margin: 0 -16px 20px;
		padding: 12px 16px;
		background: color-mix(in srgb, var(--surface) 85%, transparent);
		backdrop-filter: blur(8px);
		border-bottom: 1px solid var(--border);
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.brand {
		font: inherit;
		font-size: 1.25rem;
		font-weight: 800;
		color: var(--text);
		background: none;
		border: none;
		display: flex;
		align-items: center;
		gap: 6px;
		cursor: pointer;
		padding: 0;
	}
	.logo {
		color: var(--accent);
	}
	.likes {
		font: inherit;
		font-weight: 800;
		background: var(--accent-soft);
		color: var(--accent-text);
		border: none;
		border-radius: 999px;
		padding: 8px 14px;
		cursor: pointer;
	}

	/* ボタン: Misskey Hub のピル */
	.btn {
		font: inherit;
		font-weight: 700;
		border-radius: 999px;
		padding: 12px 28px;
		cursor: pointer;
		border: 1px solid transparent;
		text-decoration: none;
		display: inline-block;
		text-align: center;
		transition:
			transform 0.1s,
			box-shadow 0.15s;
	}
	.btn:active {
		transform: scale(0.97);
	}
	.btn.primary {
		background: var(--accent);
		color: #fff;
		box-shadow: 0 6px 18px rgba(134, 179, 0, 0.35);
	}
	.btn.primary:hover {
		background: var(--accent-strong);
	}
	.btn.secondary {
		background: var(--surface);
		color: var(--text);
		border-color: var(--border);
	}

	/* イントロ: Hub のトップページ構成 */
	.intro {
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 18px;
		padding-top: 24px;
	}
	h1 {
		font-size: 2.4rem;
		font-weight: 800;
		line-height: 1.2;
		margin: 0;
		letter-spacing: -0.01em;
	}
	h1 .accent {
		color: var(--accent);
	}
	.lead {
		margin: 0;
		color: var(--muted);
		line-height: 1.7;
	}
	.cta-row {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		justify-content: center;
	}
	.features {
		display: grid;
		gap: 12px;
		width: 100%;
		margin-top: 16px;
	}
	.feature {
		background: var(--surface);
		border-radius: 16px;
		padding: 24px 20px;
		box-shadow: var(--shadow);
	}
	.feature .emoji {
		font-size: 2.2rem;
		display: block;
	}
	.feature h3 {
		margin: 10px 0 6px;
		font-size: 1.1rem;
	}
	.feature p {
		margin: 0;
		color: var(--muted);
		font-size: 0.9rem;
		line-height: 1.6;
	}

	.loading,
	.error {
		text-align: center;
		padding: 40px 0;
	}
	.loading h2,
	.error h2 {
		margin: 16px 0 8px;
	}
	.loading p,
	.error p {
		color: var(--muted);
	}
	.error .btn {
		margin: 4px;
	}
	.msg {
		color: var(--pass);
	}
	.pulse {
		width: 80px;
		height: 80px;
		margin: 0 auto;
		border-radius: 50%;
		background: var(--accent-soft);
		display: grid;
		place-items: center;
		font-size: 2rem;
		color: var(--accent);
		animation: pulse 1.2s ease-in-out infinite;
	}
	@keyframes pulse {
		50% {
			transform: scale(1.12);
			box-shadow: 0 0 0 16px rgba(134, 179, 0, 0.1);
		}
	}
	.after {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-top: 20px;
	}

	/* マッチ演出: Tinder の瞬間を Hub のカードで */
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.55);
		backdrop-filter: blur(4px);
		display: grid;
		place-items: center;
		z-index: 50;
		padding: 16px;
	}
	.match {
		background: var(--surface);
		border-radius: 24px;
		padding: 32px 24px;
		width: min(100%, 360px);
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		box-shadow: var(--shadow-lg);
		animation: pop 0.35s cubic-bezier(0.2, 1.4, 0.4, 1);
	}
	@keyframes pop {
		from {
			transform: scale(0.7);
			opacity: 0;
		}
	}
	.match .title {
		margin: 0;
		font-size: 1.8rem;
		font-weight: 900;
		color: var(--accent);
	}
	.faces {
		display: flex;
		align-items: center;
		gap: 12px;
		margin: 8px 0;
	}
	.faces img,
	.face {
		width: 72px;
		height: 72px;
		border-radius: 50%;
		object-fit: cover;
		border: 3px solid var(--accent);
		display: grid;
		place-items: center;
		font-weight: 800;
		background: var(--surface-2);
	}
	.face.you {
		font-size: 0.8rem;
	}
	.heart {
		color: var(--accent);
		font-size: 1.8rem;
	}
	.name {
		margin: 0;
		font-size: 1.2rem;
		font-weight: 800;
	}
	.sub {
		margin: 0 0 8px;
		color: var(--muted);
	}
	.match .btn {
		width: 100%;
		box-sizing: border-box;
	}
	footer {
		margin-top: 40px;
		color: var(--muted);
		font-size: 0.75rem;
		text-align: center;
	}
	footer a {
		color: var(--muted);
	}
</style>
