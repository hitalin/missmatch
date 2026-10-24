<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { invalidateAll, replaceState } from '$app/navigation';
	import { page } from '$app/state';

	import Composer from '$lib/components/Composer.svelte';
	import Discover from '$lib/components/Discover.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import LikesGrid from '$lib/components/LikesGrid.svelte';
	import Onboarding from '$lib/components/Onboarding.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';
		import Settings from '$lib/components/Settings.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import Landing from '$lib/components/Landing.svelte';
	import LoginSheet from '$lib/components/LoginSheet.svelte';
	import Shell, { type Tab } from '$lib/components/Shell.svelte';
	import { featuresOf } from '$lib/features';
	import { type AskAxis, isAxisDefault, MAX_INTENT_LENGTH, unsureAxes } from '$lib/intent';
	import {
		applyFilters,
		buildDeck,
		learn,
		scoreProfile,
		type Taste,
		withRelativeVibes
	} from '$lib/match';
	import { defaultPreferences, isComplete, SCOPE_ORDER, type Scope, scopeFor } from '$lib/prefs';
	import {
		cacheProfiles,
		currentSearch,
		deleteSearch,
		emptyProfile,
		loadCachedProfiles,
		loadSavedProfile,
		patchSearch,
		persistProfile,
		renameSearch,
		type SavedProfile,
		selectSearch
	} from '$lib/profile';
	import {
		effectivePrefs,
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

	// Misskey でログイン中のユーザー（+layout.server.ts）。ログインはサーバーをまたぐので画面遷移で行う
	let { data } = $props();
	let loginOpen = $state(false);
	// /auth/callback で失敗したときの理由（URL に載って戻ってくる）
	let loginError = $state(page.url.searchParams.get('login_error') ?? '');
	async function logout() {
		await fetch('/api/auth/logout', { method: 'POST' });
		await invalidateAll();
	}

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
	let loadedScope = $state<Scope | null>(null);
	const wantedScope = $derived(scopeFor(profile.prefs));
	let loadError = $state('');
	let reading = $state(false);
	let readError = $state('');

	let deck = $state.raw<Match[]>([]);
	let deckKey = $state(''); // どの条件で作ったデッキか。条件が変わったら作り直す
	let deckGen = $state(0); // 何束目か。同じ条件でも次の束で Discover を作り直すため
	let deckTotal = $state(0);
	let draft = $state(''); // 言葉を足す箱の入力中テキスト

	// 条件（フィルター・加点・どの検索か・噛み合い済みか）の文字列キー。変わったらデッキを作り直す
	// この検索で並べるときの設定（全体の設定 + この検索の読み取りと聞き返しの答え）
	const prefs = $derived(effectivePrefs(profile.prefs, search));
	const prefsKey = $derived(
		JSON.stringify({
			...prefs,
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
			.map((p) => scoreProfile(p, prefs, search.taste, search.swipes, affinity));
	}
	const liked = $derived(matchesOf(search.liked));
	const passed = $derived(matchesOf(search.passed));

	// 復元は一度だけ（$effect にすると自分の書き込みで再実行ループになる）。
	// 探すページで入れた一言がまだ読み取られていなければ、ここで読み取る
	onMount(() => {
		// 戻り先のエラーは読んだら URL から消す（再読み込みで出し続けない）
		if (loginError) replaceState('/', {});
		const saved = loadSavedProfile();
		const cur = currentSearch(saved);
		profile = cur ? saved : selectSearch(saved, newSearch());
		onboarding = !isComplete(saved.prefs);
		hydrated = true;
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

	// 広い範囲（招待制 → 停止中）を含める設定に変わったら取り直す（狭める方向は絞るだけなので取り直さない）
	$effect(() => {
		if (
			hydrated &&
			loadedScope !== null &&
			SCOPE_ORDER.indexOf(wantedScope) > SCOPE_ORDER.indexOf(loadedScope)
		)
			loadProfiles();
	});

	let loading = false;
	async function loadProfiles() {
		if (loading) return;
		loading = true;
		loadError = '';
		const scope = wantedScope;
		// 前回のローカルコピーがあれば、取り直しを待たずにそれで始める
		if (loadedScope !== scope) {
			const local = loadCachedProfiles(scope);
			if (local) {
				profiles = withRelativeVibes(local);
				loadedScope = scope;
				deckKey = '';
			}
		}
		try {
			const res = await fetch(`/api/servers?scope=${scope}`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const fresh = ((await res.json()) as { profiles: ServerProfile[] }).profiles;
			cacheProfiles(scope, fresh);
			// 範囲が変わったらデッキも作り直す（同じ範囲の取り直しでは、見ているデッキを入れ替えない）
			if (loadedScope !== scope) deckKey = '';
			profiles = withRelativeVibes(fresh);
			loadedScope = scope;
		} catch (e) {
			loadError = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	// 言葉の並びの読み取り。同じ並びは 1 回しか取りに行かず、打ち終わった時点で先に始めておける
	type IntentResponse = {
		answers?: Record<string, ClefAnswer>;
		affinity?: Record<string, number>;
	};
	const intentRequests = new Map<string, Promise<IntentResponse>>();
	// prefetch は入力が止まったときの先読み。サーバーは今日の枠が減っていると 503 で断り、送ったときに読み直す
	function fetchIntent(turns: string[], scope: Scope, prefetch = false): Promise<IntentResponse> {
		const key = `${scope}\n${turns.join('\n')}`;
		let request = intentRequests.get(key);
		if (!request) {
			request = fetch('/api/intent', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ turns, scope, prefetch })
			}).then(async (res) => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				return (await res.json()) as IntentResponse;
			});
			request.catch(() => intentRequests.delete(key)); // 失敗は持ち越さない（送ったときに読み直す）
			intentRequests.set(key, request);
		}
		return request;
	}
	// 打つ手が止まったら、送られる前に読み取りを始めておく（送った瞬間に結果が出る）。
	// 止まるたびに Clef を 1 回ぶん（判定 13 本）使うので、短い言葉は見送る
	const PREFETCH_MIN_CHARS = 4;
	function prefetch(turns: string[]) {
		const last = turns.at(-1) ?? '';
		if (last.length < PREFETCH_MIN_CHARS || last.length > MAX_INTENT_LENGTH) return;
		fetchIntent(turns, wantedScope, true).catch(() => {});
	}

	// いまの検索の言葉の並びを Clef に読み取らせ、空いている設定を埋め、各サーバーとの噛み合いを付ける
	async function readSearch() {
		const target = search;
		const text = searchText(target);
		reading = true;
		readError = '';
		try {
			const data = await fetchIntent(searchTurns(target), wantedScope);
			// 待っている間に別の検索へ移っていたら捨てる
			if (profile.current !== target.id) return;
			const answers = data.answers ?? {};
			// 読み取り結果はこの検索にだけ持たせる（全体の設定に書き込むと、次の検索にも効いてしまう）
			profile = patchSearch(profile, {
				intent: answers,
				affinity: data.affinity ?? {},
				affinityFor: text,
				unsure: unsureAxes(answers)
			});
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
		deck = buildDeck(profiles, prefs, search.taste, search.swipes, search, DECK_SIZE);
		deckTotal = applyFilters(profiles, prefs).filter((p) => !seen.has(p.server.host)).length;
		deckKey = prefsKey;
		deckGen += 1;
	}

	function swipe(m: Match, action: 'like' | 'pass') {
		const p = profiles?.find((x) => x.server.host === m.server.host);
		const taste: Taste = p ? learn(search.taste, featuresOf(p), action) : search.taste;
		const host = m.server.host;
		profile = patchSearch(profile, {
				taste,
				swipes: search.swipes + 1,
				liked: action === 'like' && !search.liked.includes(host) ? [...search.liked, host] : search.liked,
				passed: action === 'pass' && !search.passed.includes(host) ? [...search.passed, host] : search.passed
			});
	}

	function undo(m: Match, action: 'like' | 'pass') {
		// 直前の学習を同じ量だけ戻し、履歴からも外す（取り消したカードはデッキに戻っている）
		const p = profiles?.find((x) => x.server.host === m.server.host);
		profile = patchSearch(profile, {
			taste: p ? unlearn(search.taste, p, action) : search.taste,
			swipes: Math.max(0, search.swipes - 1),
			liked: search.liked.filter((h) => h !== m.server.host),
			passed: search.passed.filter((h) => h !== m.server.host)
		});
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
	// ランディングで言葉を送った: 同じ言葉の検索があればそれを開き、無ければ今の（言葉の無い）検索の言葉にする
	function start(text: string) {
		if (text.length < 2) return;
		const existing = profile.searches.find((s) => s.query === text);
		profile = selectSearch(profile, existing ?? refineSearch(search, text));
		if (needsRead(search)) readSearch();
	}
	// 新しくさがす: 言葉の無い検索（＝ランディング）に戻る
	function startNew() {
		const rest = { ...profile, searches: profile.searches.filter((s) => s.query) };
		profile = selectSearch(rest, newSearch());
		draft = '';
		go('discover');
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
	function rename(id: string, title: string) {
		profile = renameSearch(profile, id, title);
	}
	function removeSearch(id: string) {
		const next = deleteSearch(profile, id);
		profile = currentSearch(next) ? next : selectSearch(next, newSearch());
	}
	// 読み取れなかった軸は 1 つずつ選択肢で聞く（設定で既に決めた軸は聞かない）
	const asks = $derived(
		search.unsure.filter((a) => isAxisDefault(prefs, a)).slice(0, 1)
	);
	function answerAsk(axis: AskAxis, choice: string | null) {
		profile = patchSearch(profile, {
			choices: choice ? { ...search.choices, [axis]: choice } : search.choices,
			unsure: search.unsure.filter((a) => a !== axis)
		});
	}

	function go(next: Tab) {
		tab = next;
		window.scrollTo({ top: 0 });
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
		{tab}
		likes={search.liked.length}
		passed={search.passed.length}
		discoverEnabled={ready && !!profiles}
		searches={profile.searches}
		current={profile.current}
		onchange={go}
		onselect={openSearch}
		onnew={startNew}
		onrename={rename}
		ondelete={removeSearch}
		user={data.user}
		onlogin={() => (loginOpen = true)}
		onlogout={logout}
	>
		<main>
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
			{#if loadError}
				<p class="banner">
					サーバー情報を取得できません（{loadError}）。
					<button class="link" onclick={loadProfiles}>再試行</button>
				</p>
			{/if}
			{#if readError}
				<p class="banner">言葉を読み取れませんでした（{readError}）。設定は手で選べます。</p>
			{/if}
			{#if loginError}
				<p class="banner">
					ログインできませんでした（{loginError}）。
					<button class="link" onclick={() => { loginError = ''; loginOpen = true; }}>やり直す</button>
				</p>
			{/if}

			{#if tab === 'discover'}
				<div class="discover-tab">
					{#if !search.query}
						<Landing onsubmit={start} onsettle={(t) => prefetch([t])} {profiles} />
					{:else}
					<SearchBar {search} {reading} ondrop={dropTurn} />
					{#if !profiles}
						<div class="loading"><Spinner label="サーバー情報を取得中" /><p class="muted">サーバー情報を取得中</p></div>
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
								busy={reading ? searchTurns(search).at(-1) ?? '' : ''}
							>
								{#snippet composer()}
									<Composer
										bind:value={draft}
										{search}
										{reading}
										{asks}
										onrefine={refine}
										onask={answerAsk}
										onsettle={(t) => prefetch([...searchTurns(search), t])}
									/>
								{/snippet}
							</Discover>
						{/key}
					{/if}
					{/if}
				</div>
			{:else if tab === 'likes'}
				<LikesGrid matches={liked} onremove={(m) => unlike(m.server.host)} />
			{:else if tab === 'passed'}
				<LikesGrid matches={passed} mode="passed" onremove={(m) => restore(m.server.host)} />
			{:else}
				<Settings
					bind:prefs={profile.prefs}
					taste={search.taste}
					swipes={search.swipes}
					{profiles}
					onresettaste={() => (profile = patchSearch(profile, { taste: {}, swipes: 0 }))}
					onresetprefs={() =>
						(profile = { ...profile, prefs: { ...defaultPreferences(), age: profile.prefs.age } })}
					onforget={(f) => {
						const { [f]: _drop, ...rest } = search.taste;
						profile = patchSearch(profile, { taste: rest });
					}}
				/>
			{/if}
			{/if}
		</main>
	</Shell>
{#if loginOpen}
	<LoginSheet onclose={() => (loginOpen = false)} />
{/if}

<style>
	.onboarding {
		flex: 1;
		display: flex;
		flex-direction: column;
		width: 100%;
		max-width: var(--maxw);
		margin: 0 auto;
	}
	/* さがす: 見出し → デッキ → 下に貼り付く入力欄 の縦並びで、画面に収める */
	main {
		flex: 1;
		display: flex;
		flex-direction: column;
	}
	.discover-tab {
		flex: none; /* flex:1 だと中身に合わせて伸びるので、高さを決め打つ */
		display: flex;
		flex-direction: column;
		/* 骨組みの上下の余白を引いた高さに収める（縦スクロールなしで判定ボタンまで見える） */
		height: calc(100dvh - 10px - var(--nav-h) - env(safe-area-inset-bottom) - 16px);
	}
	@media (min-width: 900px) {
		.discover-tab {
			height: calc(100dvh - 12px - 12px);
		}
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
</style>
