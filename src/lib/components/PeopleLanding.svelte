<script lang="ts">
	import type { ExampleUser } from '$lib/server/examples';
	import LandingBackdrop from './LandingBackdrop.svelte';
	import ModeToggle from './ModeToggle.svelte';

	// 人モードのランディング。サーバー探しのランディングと同じ骨組みで、背景には実在のユーザー
	// （参加者。少ない間は各サーバーがピン留めしている人）のカードを浮かべる。参加はボタン 1 つ
	let {
		mode,
		onmode,
		loggedIn,
		count,
		busy = false,
		error = '',
		aiNote = false,
		onstart
	}: {
		mode: 'server' | 'people';
		onmode: (m: 'server' | 'people') => void;
		loggedIn: boolean;
		count: number;
		busy?: boolean;
		error?: string;
		aiNote?: boolean; // Misskey で AI 学習の防止をオンにしている人向けの一文
		onstart: () => void;
	} = $props();

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
</script>

<div class="landing">
	<LandingBackdrop servers={cards} />
	<div class="center">
		<h1 class="brand"><img class="logo" src="/logo.svg" alt="" width="48" height="48" /> <span class="text-grad">みすまっち</span></h1>
		<p class="tagline">Misskey のユーザーと、マッチング。</p>
		<ModeToggle {mode} onchange={onmode} />
		<p class="ask">参加して、話が合いそうな人をスワイプで見つけよう</p>
		<button class="btn love big" onclick={onstart} disabled={busy}>
			{busy ? '確認しています…' : loggedIn ? '参加する' : 'Misskey でログインしてはじめる'}
		</button>
		{#if error}<p class="err">{error}</p>{/if}
		<p class="note">いま {count} 人が参加 · 右スワイプは「いいね」、フォローは Misskey で · 相互フォローでマッチ</p>
		<p class="note small">参加すると、あなたのプロフィールと反応の多い公開ノートがカードに出て、公開ノートを AI が読んで話題を推定します（ノートは保存しません）。出会い・恋愛ではなく、話が合う人を見つけるためのものです。</p>
		{#if aiNote}<p class="note small">Misskey で AI 学習の防止をオンにしている方へ: 話題の推定に Workers AI を使いますが、学習には使われません。</p>{/if}
	</div>
	<footer>
		<p>例として浮かんでいるのは、参加者と、各サーバーが「みつける」に載せている人です</p>
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
		text-align: center;
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
	.big {
		padding: 0.9em 2.2em;
		font-size: 1.05rem;
	}
	.note {
		margin: 0;
		font-size: 0.86rem;
		color: var(--fg-muted);
	}
	.note.small {
		font-size: 0.74rem;
		max-width: 520px;
		line-height: 1.6;
	}
	.err {
		margin: 0;
		color: var(--nope);
		font-weight: 700;
		font-size: 0.86rem;
		word-break: break-all;
	}
	footer {
		padding: 16px 0 24px;
		font-size: 0.72rem;
		color: var(--fg-muted);
		text-align: center;
	}
	footer p {
		margin: 0;
	}
</style>
