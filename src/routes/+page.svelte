<script lang="ts">
	import { onMount } from 'svelte';
	import AppNav, { type Tab } from '$lib/components/AppNav.svelte';
	import Discover from '$lib/components/Discover.svelte';
	import LikesGrid from '$lib/components/LikesGrid.svelte';
	import MatchOverlay from '$lib/components/MatchOverlay.svelte';
	import Onboarding from '$lib/components/Onboarding.svelte';
	import Settings from '$lib/components/Settings.svelte';
	import WishSearch from '$lib/components/WishSearch.svelte';
	import { featuresOf } from '$lib/features';
	import { applyIntent } from '$lib/intent';
	import { applyFilters, buildDeck, learn, scoreProfile, type Taste } from '$lib/match';
	import { hasFreshAffinity, isComplete, needsAllServers } from '$lib/prefs';
	import { emptyProfile, PROFILE_KEY, parseSavedProfile, type SavedProfile } from '$lib/profile';
	import type { Match, ServerProfile } from '$lib/types';
	import type { ClefAnswer } from '$lib/vibe';

	const DECK_SIZE = 10;
	const SAVE_DEBOUNCE_MS = 250;

	// プロフィール（設定・学習した好み・いいね・パス）はブラウザに保持する
	let profile = $state<SavedProfile>(emptyProfile());
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

	// 条件（フィルター・加点・ひとこと）の文字列キー。一言の入力中は変わらない
	const prefsKey = $derived.by(() => {
		const { wish: _wish, affinity, affinityFor, ...rest } = profile.prefs;
		return JSON.stringify({ ...rest, affinity: hasFreshAffinity(profile.prefs) ? affinityFor : '' });
	});
	const ready = $derived(isComplete(profile.prefs));
	function matchesOf(hosts: string[]): Match[] {
		if (!profiles) return [];
		const byHost = new Map(profiles.map((p) => [p.server.host, p]));
		return hosts
			.map((host) => byHost.get(host))
			.filter((p): p is ServerProfile => p !== undefined)
			.map((p) => scoreProfile(p, profile.prefs, profile.taste, profile.swipes));
	}
	const liked = $derived(matchesOf(profile.liked));
	const passed = $derived(matchesOf(profile.passed));

	// 復元は一度だけ（$effect にすると自分の書き込みで再実行ループになる）
	onMount(() => {
		let saved = emptyProfile();
		try {
			saved = parseSavedProfile(localStorage.getItem(PROFILE_KEY));
		} catch {
			// 読めなくても動く
		}
		profile = saved;
		onboarding = !isComplete(saved.prefs);
		hydrated = true;
		loadProfiles();
	});

	// 保存（入力のたびに書かず、少し待ってまとめる）
	$effect(() => {
		if (!hydrated) return;
		const snapshot = JSON.stringify(profile);
		const t = setTimeout(() => {
			try {
				localStorage.setItem(PROFILE_KEY, snapshot);
			} catch {
				// 保存できなくても続ける
			}
		}, SAVE_DEBOUNCE_MS);
		return () => clearTimeout(t);
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

	// ひとことを Clef に読み取らせ、空いている設定を埋め、各サーバーとの噛み合いを付ける
	async function readWish(text: string) {
		reading = true;
		readError = '';
		try {
			const res = await fetch('/api/intent', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text, scope: wantedScope })
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = (await res.json()) as {
				answers?: Record<string, ClefAnswer>;
				affinity?: Record<string, number>;
			};
			const prefs = applyIntent(profile.prefs, data.answers ?? {});
			profile = {
				...profile,
				prefs: { ...prefs, wish: text, affinity: data.affinity ?? {}, affinityFor: text }
			};
			tab = 'discover';
		} catch (e) {
			readError = e instanceof Error ? e.message : String(e);
		} finally {
			reading = false;
		}
	}

	function seenHosts(): Set<string> {
		return new Set([...profile.liked, ...profile.passed]);
	}

	function rebuildDeck() {
		if (!profiles) return;
		const seen = seenHosts();
		deck = buildDeck(profiles, profile.prefs, profile.taste, profile.swipes, seen, DECK_SIZE);
		deckTotal = applyFilters(profiles, profile.prefs).filter((p) => !seen.has(p.server.host)).length;
		deckKey = prefsKey;
		deckGen += 1;
	}

	function swipe(m: Match, action: 'like' | 'pass') {
		const p = profiles?.find((x) => x.server.host === m.server.host);
		const taste: Taste = p ? learn(profile.taste, featuresOf(p), action) : profile.taste;
		profile = {
			...profile,
			taste,
			swipes: profile.swipes + 1,
			liked: action === 'like' && !profile.liked.includes(m.server.host) ? [...profile.liked, m.server.host] : profile.liked,
			passed: action === 'pass' && !profile.passed.includes(m.server.host) ? [...profile.passed, m.server.host] : profile.passed
		};
		if (action === 'like' && m.score >= 70) celebrate = m;
	}

	function undo(m: Match, action: 'like' | 'pass') {
		// 直前の学習を同じ量だけ戻し、履歴からも外す（取り消したカードはデッキに戻っている）
		const p = profiles?.find((x) => x.server.host === m.server.host);
		profile = {
			...profile,
			taste: p ? unlearn(profile.taste, p, action) : profile.taste,
			swipes: Math.max(0, profile.swipes - 1),
			liked: profile.liked.filter((h) => h !== m.server.host),
			passed: profile.passed.filter((h) => h !== m.server.host)
		};
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
		profile = { ...profile, liked: profile.liked.filter((h) => h !== host) };
	}
	// よくないねを取り消す（デッキに戻る）
	function restore(host: string) {
		profile = { ...profile, passed: profile.passed.filter((h) => h !== host) };
	}
	function clearWish() {
		profile = { ...profile, prefs: { ...profile.prefs, wish: '', affinity: {}, affinityFor: '' } };
	}

	function go(next: Tab) {
		tab = next;
		window.scrollTo({ top: 0 });
	}
</script>

<svelte:head>
	<title>みすまっち - Misskey サーバーとマッチング</title>
	<meta name="description" content="プロフィールを作って、雰囲気まで考慮したおすすめ Misskey サーバーをスワイプで選ぼう。" />
</svelte:head>

<div class="app" class:onboarding>
	{#if onboarding}
		<Onboarding
			bind:prefs={profile.prefs}
			onfinish={() => {
				onboarding = false;
				tab = 'discover';
			}}
		/>
	{:else}
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
				<WishSearch
					wish={hasFreshAffinity(profile.prefs) ? profile.prefs.wish : ''}
					applied={hasFreshAffinity(profile.prefs)}
					{reading}
					onsearch={readWish}
					onclear={clearWish}
				/>
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
		<AppNav
			{tab}
			likes={profile.liked.length}
			passed={profile.passed.length}
			discoverEnabled={ready && !!profiles}
			onchange={go}
		/>
	{/if}

	{#if celebrate}
		<MatchOverlay match={celebrate} onclose={() => (celebrate = null)} />
	{/if}
</div>

<style>
	.app {
		max-width: var(--maxw);
		margin: 0 auto;
		padding: 0 16px;
		min-height: 100dvh;
	}
	main {
		padding: 10px 0 calc(var(--nav-h) + env(safe-area-inset-bottom) + 16px);
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
	main :global(.wish) {
		margin-bottom: 10px;
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
	@media (min-width: 900px) {
		.app {
			max-width: none;
			margin: 0;
			padding: 0 0 0 var(--rail-w);
		}
		.app.onboarding {
			padding-left: 0;
		}
		main {
			max-width: var(--desktop-maxw);
			margin: 0 auto;
			padding: 28px 40px 48px;
		}
	}
</style>
