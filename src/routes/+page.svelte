<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/Icon.svelte';
	import { MAX_INTENT_LENGTH } from '$lib/intent';
	import PromptBox from '$lib/components/PromptBox.svelte';
	import Shell, { type Tab } from '$lib/components/Shell.svelte';
	import { isComplete } from '$lib/prefs';
	import {
		currentSearch,
		deleteSearch,
		emptyProfile,
		loadSavedProfile,
		persistProfile,
		renameSearch,
		type SavedProfile,
		selectSearch
	} from '$lib/profile';
	import { newSearch } from '$lib/search';

	// 探す: 検索ボックスだけのランディング。言葉を入れて送ると「さがす」でデッキが並び替わる
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
		text = currentSearch(profile)?.query ?? '';
		hasProfile = isComplete(profile.prefs);
	});

	// 同じ言葉で探したことがあればその検索（いいね・よくないね込み）を開き、無ければ新しく始める
	function go(wish: string) {
		const trimmed = wish.trim().slice(0, MAX_INTENT_LENGTH);
		const existing = profile.searches.find((s) => s.query === trimmed);
		persistProfile(selectSearch(profile, existing ?? newSearch(trimmed)));
		goto(resolve('/pick'));
	}

	// ナビ: タブを押したら「さがす」のそのタブへ。一覧から選んだ検索はそのまま開く
	const search = $derived(currentSearch(profile));
	function goTab(tab: Tab) {
		goto(`${resolve('/pick')}?tab=${tab}`);
	}
	function openSearch(id: string) {
		const s = profile.searches.find((x) => x.id === id);
		if (!s) return;
		persistProfile(selectSearch(profile, s));
		goto(resolve('/pick'));
	}
	function rename(id: string, title: string) {
		profile = renameSearch(profile, id, title);
		persistProfile(profile);
	}
	function removeSearch(id: string) {
		profile = deleteSearch(profile, id);
		persistProfile(profile);
	}
</script>

<svelte:head>
	<title>みすまっち - Misskey サーバーとマッチング</title>
	<meta
		name="description"
		content="探している場所を一言で。日本語 Misskey サーバーの中から、雰囲気と条件が合うものをスワイプで選べます。"
	/>
</svelte:head>

<Shell
	tab={null}
	likes={search?.liked.length ?? 0}
	passed={search?.passed.length ?? 0}
	discoverEnabled={hasProfile}
	searches={profile.searches}
	current={profile.current}
	onchange={goTab}
	onselect={openSearch}
	onrename={rename}
	ondelete={removeSearch}
>
	<main class="landing">
		<div class="center">
			<h1 class="brand"><span class="logo"><Icon name="heart" size={40} filled /></span> みすまっち</h1>
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

			<p class="skip">
				<a href={resolve('/pick')}>{hasProfile ? '前回の続きからさがす' : '言葉を入れずに条件だけでさがす'}</a>
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
</Shell>

<style>
	.landing {
		flex: 1;
		display: flex;
		flex-direction: column;
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
		display: inline-flex;
		vertical-align: -6px;
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
