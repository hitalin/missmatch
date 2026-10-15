<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { page } from '$app/state';
	
	import AskChips from '$lib/components/AskChips.svelte';
	import Discover from '$lib/components/Discover.svelte';
	import LikesGrid from '$lib/components/LikesGrid.svelte';
	import MatchOverlay from '$lib/components/MatchOverlay.svelte';
	import Onboarding from '$lib/components/Onboarding.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';
		import Settings from '$lib/components/Settings.svelte';
	import Shell, { type Tab, TABS } from '$lib/components/Shell.svelte';
	import { featuresOf } from '$lib/features';
	import { applyIntent, type AskAxis, chooseAxis, isAxisDefault, unsureAxes } from '$lib/intent';
	import { applyFilters, buildDeck, learn, scoreProfile, type Taste } from '$lib/match';
	import { isComplete, needsAllServers } from '$lib/prefs';
	import {
		currentSearch,
		deleteSearch,
		emptyProfile,
		loadSavedProfile,
		patchSearch,
		persistProfile,
		type SavedProfile,
		selectSearch
	} from '$lib/profile';
	import {
		hasAffinity,
		newSearch,
		refineSearch,
		type Search,
		searchText,
		searchTurns,
		seenHosts
	} from '$lib/search';
	import type { Match, ServerProfile } from '$lib/types';
	import type { ClefAnswer } from '$lib/vibe';

	const DECK_SIZE = 10;
	const SAVE_DEBOUNCE_MS = 250;

	// プロフィール（設定・学習した好み・検索ごとのいいね・パス）はブラウザに保持する。
	// onMount で必ず current の検索を用意するので、それ以降 search は null にならない
	let profile = $state<SavedProfile>(emptyProfile());
	const search = $derived(currentSearch(profile) ?? newSearch());
	let tab = $state<Tab>('discover');
	let onboarding = $state(true);
	let hydrated = $state(false);

	// 属性表は大きく不変なので深い reactivity を付けない。
	// 既定は登録受付中の約 100 件。招待制・停止中を含める設定なら全件（約 580 件）を取りに行く
	let profiles = $state.raw<ServerProfile[] | null>(null);
	let loadedScope = $state<'open' | 'all' | null>(null);
	const wantedScope = $derived(needsAllServers(profile.prefs) ? 'all' : 'open');
	let loadError = $state('');
	let reading = $state(false);
	let readError = $state('');

	let deck = $state.raw<Match[]>([]);
	let deckKey = $state(''); // どの条件で作ったデッキか。条件が変わったら作り直す
	let deckGen = $state(0); // 何束目か。同じ条件でも次の束で Discover を作り直すため
	let deckTotal = $state(0);
	let celebrate = $state<Match | null>(null);

	// 条件（フィルター・加点・どの検索か・噛み合い済みか）の文字列キー。変わったらデッキを作り直す
	const prefsKey = $derived(
		JSON.stringify({
			...profile.prefs,
			search: search.id,
			affinity: hasAffinity(search) ? search.affinityFor : ''
		})
	);
	const ready = $derived(isComplete(profile.prefs));
	const wishApplied = $derived(hasAffinity(search));
	function matchesOf(hosts: string[]): Match[] {
		if (!profiles) return [];
		const byHost = new Map(profiles.map((p) => [p.server.host, p]));
		const affinity = wishApplied ? search.affinity : {};
		return hosts
			.map((host) => byHost.get(host))
			.filter((p): p is ServerProfile => p !== undefined)
			.map((p) => scoreProfile(p, profile.prefs, profile.taste, profile.swipes, affinity));
	}
	const liked = $derived(matchesOf(search.liked));
	const passed = $derived(matchesOf(search.passed));

	// 復元は一度だけ（$effect にすると自分の書き込みで再実行ループになる）。
	// 探すページで入れた一言がまだ読み取られていなければ、ここで読み取る
	onMount(() => {
		const saved = loadSavedProfile();
		const cur = currentSearch(saved);
		profile = cur ? saved : selectSearch(saved, newSearch());
		onboarding = !isComplete(saved.prefs);
		hydrated = true;
		// ランディングのナビから来たときは、そのタブを開く（/pick?tab=likes）
		const wanted = page.url.searchParams.get('tab');
		if (TABS.includes(wanted as Tab)) tab = wanted as Tab;
		loadProfiles();
		if (cur && needsRead(cur)) readSearch();
	});
	const needsRead = (s: Search) => searchText(s).length >= 2 && !hasAffinity(s);

	// 保存（入力のたびに書かず、少し待ってまとめる）。
	// ページを離れるときは待たずに確定させる。でないと読み取り直後の移動で検索結果が消える
	let pendingSave: SavedProfile | null = null;
	function flushSave() {
		if (!pendingSave) return;
		persistProfile(pendingSave);
		pendingSave = null;
	}
	$effect(() => {
		if (!hydrated) return;
		pendingSave = $state.snapshot(profile);
		const t = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
		return () => clearTimeout(t);
	});
	onDestroy(flushSave);
	$effect(() => {
		window.addEventListener('pagehide', flushSave);
		return () => window.removeEventListener('pagehide', flushSave);
	});

	// 条件が変わったらデッキを作り直す（学習した好みは次の束から効く）
	$effect(() => {
		if (!profiles || !ready || onboarding) return;
		if (deckKey !== prefsKey) rebuildDeck();
	});

	// 招待制・停止中を含める設定に変わったら全件を取り直す（逆方向は絞るだけなので取り直さない）
	$effect(() => {
		if (hydrated && wantedScope === 'all' && loadedScope === 'open') loadProfiles();
	});

	let loading = false;
	async function loadProfiles() {
		if (loading) return;
		loading = true;
		loadError = '';
		const scope = wantedScope;
		try {
			const res = await fetch(scope === 'all' ? '/api/servers?scope=all' : '/api/servers');
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			profiles = ((await res.json()) as { profiles: ServerProfile[] }).profiles;
			loadedScope = scope;
			deckKey = ''; // 取り直したらデッキも作り直す
		} catch (e) {
			loadError = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	// いまの検索の言葉の並びを Clef に読み取らせ、空いている設定を埋め、各サーバーとの噛み合いを付ける
	async function readSearch() {
		const target = search;
		const text = searchText(target);
		reading = true;
		readError = '';
		try {
			const res = await fetch('/api/intent', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ turns: searchTurns(target), scope: wantedScope })
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = (await res.json()) as {
				answers?: Record<string, ClefAnswer>;
				affinity?: Record<string, number>;
			};
			// 待っている間に別の検索へ移っていたら捨てる
			if (profile.current !== target.id) return;
			const answers = data.answers ?? {};
			profile = patchSearch(
				{ ...profile, prefs: applyIntent(profile.prefs, answers) },
				{ affinity: data.affinity ?? {}, affinityFor: text, unsure: unsureAxes(answers) }
			);
			tab = 'discover';
		} catch (e) {
			readError = e instanceof Error ? e.message : String(e);
		} finally {
			reading = false;
		}
	}

	function rebuildDeck() {
		if (!profiles) return;
		const seen = seenHosts(search);
		deck = buildDeck(profiles, profile.prefs, profile.taste, profile.swipes, search, DECK_SIZE);
		deckTotal = applyFilters(profiles, profile.prefs).filter((p) => !seen.has(p.server.host)).length;
		deckKey = prefsKey;
		deckGen += 1;
	}

	function swipe(m: Match, action: 'like' | 'pass') {
		const p = profiles?.find((x) => x.server.host === m.server.host);
		const taste: Taste = p ? learn(profile.taste, featuresOf(p), action) : profile.taste;
		const host = m.server.host;
		profile = patchSearch(
			{ ...profile, taste, swipes: profile.swipes + 1 },
			{
				liked: action === 'like' && !search.liked.includes(host) ? [...search.liked, host] : search.liked,
				passed: action === 'pass' && !search.passed.includes(host) ? [...search.passed, host] : search.passed
			}
		);
		if (action === 'like' && m.score >= 70) celebrate = m;
	}

	function undo(m: Match, action: 'like' | 'pass') {
		// 直前の学習を同じ量だけ戻し、履歴からも外す（取り消したカードはデッキに戻っている）
		const p = profiles?.find((x) => x.server.host === m.server.host);
		profile = patchSearch(
			{
				...profile,
				taste: p ? unlearn(profile.taste, p, action) : profile.taste,
				swipes: Math.max(0, profile.swipes - 1)
			},
			{
				liked: search.liked.filter((h) => h !== m.server.host),
				passed: search.passed.filter((h) => h !== m.server.host)
			}
		);
	}

	// learn の逆操作（同じ量だけ戻す）
	function unlearn(taste: Taste, p: ServerProfile, action: 'like' | 'pass'): Taste {
		const forward = learn({}, featuresOf(p), action);
		const next: Taste = { ...taste };
		for (const [k, v] of Object.entries(forward) as [keyof Taste, number][]) {
			next[k] = Math.min(1, Math.max(-1, (next[k] ?? 0) - v));
		}
		return next;
	}

	function unlike(host: string) {
		profile = patchSearch(profile, { liked: search.liked.filter((h) => h !== host) });
	}
	// よくないねを取り消す（デッキに戻る）
	function restore(host: string) {
		profile = patchSearch(profile, { passed: search.passed.filter((h) => h !== host) });
	}
	// 検索を外す = 「条件だけ」の検索に移る（言葉付きの検索とそのいいねは残る）
	function clearWish() {
		const plain = profile.searches.find((s) => s.query === '') ?? newSearch();
		profile = selectSearch(profile, plain);
	}
	// 言葉を足す / 外す。並びが変わったので噛み合いを読み直す
	function refine(text: string) {
		profile = selectSearch(profile, refineSearch(search, text));
		readSearch();
	}
	function dropTurn(index: number) {
		profile = patchSearch(profile, { turns: search.turns.filter((_, i) => i !== index) });
		if (needsRead(search)) readSearch();
	}
	// 過去の検索に移る / 消す
	function openSearch(id: string) {
		const s = profile.searches.find((x) => x.id === id);
		if (!s) return;
		profile = selectSearch(profile, s);
		go('discover');
		if (needsRead(s)) readSearch();
	}
	function removeSearch(id: string) {
		const next = deleteSearch(profile, id);
		profile = currentSearch(next) ? next : selectSearch(next, newSearch());
	}
	// 読み取れなかった軸は 2 つずつ選択肢で聞く（設定で既に決めた軸は聞かない）
	const asks = $derived(
		search.unsure.filter((a) => isAxisDefault(profile.prefs, a)).slice(0, 2)
	);
	function answerAsk(axis: AskAxis, choice: string | null) {
		const prefs = choice ? chooseAxis(profile.prefs, axis, choice) : profile.prefs;
		profile = patchSearch({ ...profile, prefs }, { unsure: search.unsure.filter((a) => a !== axis) });
	}

	function go(next: Tab) {
		tab = next;
		window.scrollTo({ top: 0 });
	}
</script>

<svelte:head>
	<title>さがす - みすまっち</title>
	<meta name="description" content="プロフィールを作って、雰囲気まで考慮したおすすめ Misskey サーバーをスワイプで選ぼう。" />
</svelte:head>

{#if onboarding}
	<div class="onboarding">
		<Onboarding
			bind:prefs={profile.prefs}
			startAtQuestions
			onfinish={() => {
				onboarding = false;
				tab = 'discover';
			}}
		/>
	</div>
{:else}
	<Shell
		{tab}
		likes={search.liked.length}
		passed={search.passed.length}
		discoverEnabled={ready && !!profiles}
		searches={profile.searches}
		current={profile.current}
		onchange={go}
		onselect={openSearch}
		ondelete={removeSearch}
	>
		<main>
			{#if loadError}
				<p class="banner">
					サーバー情報を取得できませんでした（{loadError}）。
					<button class="link" onclick={loadProfiles}>再試行</button>
				</p>
			{/if}
			{#if readError}
				<p class="banner">ひとことを読み取れませんでした（{readError}）。設定は手で選べます。</p>
			{/if}

			{#if tab === 'discover'}
				<SearchBar
					{search}
					{reading}
					applied={wishApplied}
					onrefine={refine}
					ondrop={dropTurn}
					onclear={clearWish}
				/>
				{#if !reading && asks.length > 0}
					<AskChips axes={asks} onpick={answerAsk} />
				{/if}
				{#if !profiles}
					<div class="loading"><div class="pulse">♥</div><p class="muted">サーバー情報を取得中…</p></div>
				{:else}
					{#key deckGen}
						<Discover
							matches={deck}
							total={deckTotal}
							onlike={(m) => swipe(m, 'like')}
							onpass={(m) => swipe(m, 'pass')}
							onundo={undo}
							onexhausted={rebuildDeck}
							onsettings={() => go('you')}
						/>
					{/key}
				{/if}
			{:else if tab === 'likes'}
				<LikesGrid matches={liked} onremove={(m) => unlike(m.server.host)} />
			{:else if tab === 'passed'}
				<LikesGrid matches={passed} mode="passed" onremove={(m) => restore(m.server.host)} />
			{:else}
				<Settings
					bind:prefs={profile.prefs}
					taste={profile.taste}
					swipes={profile.swipes}
					{profiles}
					onresettaste={() => (profile = { ...profile, taste: {}, swipes: 0 })}
					onforget={(f) => {
						const { [f]: _drop, ...rest } = profile.taste;
						profile = { ...profile, taste: rest };
					}}
				/>
			{/if}
			<footer>
				<p>
					データ: <a href="https://join.misskey.page/" target="_blank" rel="noopener">joinmisskey</a>
					· 判定: Cloudflare Workers AI (Clef)
					· <a href="https://github.com/hitalin/missmatch" target="_blank" rel="noopener">GitHub</a>
				</p>
			</footer>
		</main>
	</Shell>
{/if}

{#if celebrate}
	<MatchOverlay match={celebrate} onclose={() => (celebrate = null)} />
{/if}

<style>
	.onboarding {
		max-width: var(--maxw);
		margin: 0 auto;
		padding: 0 16px;
		min-height: 100dvh;
	}
	.banner {
		margin: 0 0 12px;
		padding: 10px 14px;
		border-radius: 12px;
		font-size: 0.88rem;
		background: var(--nope-soft);
	}
	.link {
		font-weight: 700;
		background: none;
		border: none;
		color: var(--accent-fg);
		cursor: pointer;
		text-decoration: underline;
		padding: 0;
	}
	.loading {
		text-align: center;
		padding: 80px 0;
	}
	.pulse {
		width: 72px;
		height: 72px;
		margin: 0 auto 12px;
		border-radius: 50%;
		background: var(--accent-soft);
		color: var(--accent);
		display: grid;
		place-items: center;
		font-size: 1.8rem;
		animation: pulse 1.2s ease-in-out infinite;
	}
	@keyframes pulse {
		50% {
			transform: scale(1.1);
		}
	}
	footer {
		margin-top: 28px;
		font-size: 0.72rem;
		color: var(--fg-muted);
		text-align: center;
	}
	footer a {
		color: var(--fg-muted);
	}
</style>
