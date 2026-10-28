<script lang="ts">
	import { untrack } from 'svelte';
	import type { AuthUser } from '$lib/auth';
	import { MAX_INTENT_LENGTH } from '$lib/intent';
	import { MAX_CHIPS, type Member } from '$lib/people';
	import type { Relation } from '$lib/people-deck';
	import { peopleStore } from '$lib/people-store.svelte';
	import type { Card } from '$lib/server/deck';
	import { GENRE_LABELS, GENRES, type Genre } from '$lib/types';
	import Discover from './Discover.svelte';
	import Spinner from './Spinner.svelte';
	import Icon from './Icon.svelte';
	import PeopleLanding from './PeopleLanding.svelte';
	import PersonCard from './PersonCard.svelte';
	import PeopleGrid from './PeopleGrid.svelte';
	import PersonDetails from './PersonDetails.svelte';
	import SearchBar from './SearchBar.svelte';
	import PromptBox from './PromptBox.svelte';
	import type { Tab } from './Shell.svelte';

	// 人モード（docs/PEOPLE.md v6.6）。サーバー探しと同じデッキ UI で、参加した人同士のカードをスワイプする。
	// ログイン = 参加。言葉で絞れる。右 = いいね（ブラウザだけ）、「フォローする」が Misskey でのフォロー、相互フォローでマッチ
	let {
		tab,
		user,
		onlogin,
		mode,
		onmode,
		query = '',
		turns = [],
		onsearch,
		onrefine,
		ondrop,
		onclear
	}: {
		tab: Tab;
		user: AuthUser | null;
		onlogin: () => void;
		mode: 'server' | 'people';
		onmode: (m: 'server' | 'people') => void;
		// 言葉はサーバー探しと同じ検索セッション（+page.svelte）が持つ。query が最初の言葉、turns が絞り込み
		query?: string;
		turns?: string[];
		onsearch: (text: string) => void;
		onrefine: (text: string) => void;
		ondrop: (index: number) => void;
		onclear: () => void; // 言葉を消してランディングへ
	} = $props();

	type Status = {
		count: number;
		cap: number;
		avatars: { host: string; username: string }[];
		me: Member | null;
		self: { preventAiLearning: boolean } | null;
		canFollow: boolean;
	};
	const PENDING_KEY = 'missmatch:people:pending'; // ログインをまたいで持ち越す言葉
	let status = $state<Status | null>(null);
	let joinError = $state('');
	let joining = false;
	const allTurns = $derived([query, ...turns].filter((t) => t.length > 0));
	const browsing = $derived(query.length > 0); // 言葉があればデッキ、無ければランディング
	let cards = $state.raw<Card[]>([]);
	let refused = $state(false);
	let deckGen = $state(0);
	let deckLoading = $state(false);
	let deckError = $state('');
	let draft = $state('');
	let matches = $state<{ acct: string; host: string; username: string; name: string }[]>([]);
	let newMatches = $state<typeof matches>([]);
	let relations = $state<Record<string, Relation>>({});

	const REASONS: Record<string, string> = {
		seeking: '恋人・出会いを求める内容が自己紹介やノートにあるため参加できません。',
		ads: '宣伝が中心のアカウントは参加できません。',
		banned: '参加できません。',
		cap: 'いまは参加の上限に達しています。',
		'server-cap': 'あなたのサーバーからの参加がいまは上限です。'
	};
	const avatar = (host: string, username: string) => `https://${host}/avatar/@${encodeURIComponent(username)}`;

	async function loadStatus() {
		try {
			const res = await fetch('/api/people/status');
			if (res.ok) status = (await res.json()) as Status;
		} catch {
			// 人数などが取れなくてもランディングは出す
		}
	}
	// ログイン = 参加。条件を満たさないときだけ理由を出す
	async function autoJoin(): Promise<boolean> {
		if (joining) return false;
		joining = true;
		joinError = '';
		try {
			const res = await fetch('/api/people/join', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ chips: [], profileOnly: false })
			});
			const r = (await res.json()) as { ok?: boolean; reason?: string; noteIds?: string[] };
			if (!res.ok || !r.ok) {
				joinError = REASONS[r.reason ?? ''] ?? '参加できませんでした。時間をおいて試してください。';
				if (r.noteIds?.length) joinError += ` 該当ノート: ${r.noteIds.map((id) => `https://${user?.host}/notes/${id}`).join(' ')}`;
				return false;
			}
			await loadStatus();
			return true;
		} catch {
			joinError = '通信に失敗しました';
			return false;
		} finally {
			joining = false;
		}
	}
	async function loadDeck() {
		deckLoading = true;
		deckError = '';
		try {
			const res = await fetch('/api/people/deck', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					exclude: peopleStore.excluded,
					turns: allTurns,
					liked: peopleStore.liked.slice(0, 50).map((p) => p.acct),
					passed: peopleStore.passed.slice(0, 50).map((p) => p.acct)
				})
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const d = (await res.json()) as { cards: Card[]; count: number; refused: boolean };
			cards = d.cards;
			refused = d.refused;
			deckGen += 1;
		} catch (e) {
			deckError = e instanceof Error ? e.message : String(e);
		} finally {
			deckLoading = false;
		}
	}
	async function loadMatches() {
		try {
			const res = await fetch('/api/people/matches');
			if (!res.ok) return;
			matches = ((await res.json()) as { matches: typeof matches }).matches;
			const seen = new Set(peopleStore.seenMatches);
			newMatches = matches.filter((m) => !seen.has(m.acct));
		} catch {
			// マッチの確認は失敗しても画面を壊さない
		}
	}
	async function loadRelations() {
		const accts = peopleStore.liked.map((p) => p.acct).slice(0, 100);
		if (accts.length === 0) return;
		try {
			const res = await fetch('/api/people/relations', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ accts })
			});
			if (res.ok) relations = (await res.json()) as Record<string, Relation>;
		} catch {
			// 状態が取れなくても一覧は出す
		}
	}

	// 言葉を送る: 未ログインなら言葉を持ち越してログインへ。参加していなければ参加してから探す
	async function search(text: string) {
		if (!user) {
			sessionStorage.setItem(PENDING_KEY, text);
			onlogin();
			return;
		}
		if (!status?.me && !(await autoJoin())) return;
		onsearch(text);
	}
	function refine(text: string) {
		const t = text.trim().slice(0, MAX_INTENT_LENGTH);
		if (!t) return;
		draft = '';
		onrefine(t);
	}
	// 言葉の並びが変わったら（送る・足す・外す・過去の検索を開く）、参加済みならデッキを集め直す
	$effect(() => {
		const key = allTurns.join('\n');
		if (!browsing || !status?.me) return;
		untrack(() => {
			void key;
			cards = [];
			refused = false;
			loadDeck();
		});
	});

	$effect(() => {
		void user;
		loadStatus();
	});
	// ログイン直後: 持ち越した言葉があれば参加して探す。無くても参加だけはしておく（ログイン = 参加）
	$effect(() => {
		if (!user || !status || status.me) return;
		const pending = sessionStorage.getItem(PENDING_KEY);
		sessionStorage.removeItem(PENDING_KEY);
		if (pending) search(pending);
		else autoJoin();
	});
	// 参加が確認できたら・タブを変えたらマッチを確認する。デッキは言葉を送ったときなど明示の操作でだけ集める
	// （cards や deckLoading をここで読むと、カードが 0 枚のとき集め直しが止まらない）
	$effect(() => {
		if (!status?.me) return;
		const t = tab;
		untrack(() => {
			if (t === 'likes') loadRelations();
			loadMatches();
		});
	});

	async function leave() {
		if (!confirm('参加をやめて、記録を消します。フォロー関係は Misskey にそのまま残ります。')) return;
		await fetch('/api/people/leave', { method: 'POST' });
		cards = [];
		await loadStatus();
	}
	async function patchMe(patch: { chips?: Genre[]; profileOnly?: boolean }) {
		const res = await fetch('/api/people/me', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(patch)
		});
		if (res.ok && status) status = { ...status, me: ((await res.json()) as { member: Member }).member };
	}
	function toggleChip(g: Genre) {
		const chips = status?.me?.chips ?? [];
		const next = chips.includes(g) ? chips.filter((c) => c !== g) : chips.length < MAX_CHIPS ? [...chips, g] : chips;
		if (next !== chips) patchMe({ chips: next });
	}

	// 「フォローする」。権限が無ければ MiAuth で write:following を足して取り直す（step-up）
	async function follow(card: { acct: string; isLocked?: boolean }): Promise<{ ok: boolean; message: string }> {
		if (!status?.canFollow) {
			const res = await fetch('/api/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ host: user?.host, scope: 'follow', next: '/?mode=people' })
			});
			const d = (await res.json()) as { url?: string; error?: string };
			if (d.url) {
				window.location.href = d.url;
				return { ok: true, message: 'Misskey でフォローの権限を許可してください' };
			}
			return { ok: false, message: d.error ?? '権限を取得できませんでした' };
		}
		const res = await fetch('/api/people/follow', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ acct: card.acct })
		});
		const r = (await res.json()) as { ok: boolean; pending?: boolean; reason?: string };
		if (r.ok) {
			loadRelations();
			return { ok: true, message: r.pending ? 'フォローをリクエストしました' : 'フォローしました（1 分以内なら いいね一覧から取り消せます）' };
		}
		const msg: Record<string, string> = {
			cooldown: '同じ人へのフォローは 1 日 1 回までです',
			rate: '1 時間にフォローできる数を超えました',
			blocked: 'この人にはフォローできません',
			unknown: 'この人はもう参加していません',
			failed: 'フォローできませんでした'
		};
		return { ok: false, message: msg[r.reason ?? ''] ?? 'フォローできませんでした' };
	}
	async function unfollow(acct: string) {
		const res = await fetch('/api/people/unfollow', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ acct })
		});
		const r = (await res.json()) as { ok: boolean; reason?: string };
		if (r.ok) loadRelations();
		else alert(r.reason === 'too-late' ? '1 分を過ぎたので、Misskey 側で解除してください' : '取り消せませんでした');
	}
	async function reportCard(card: Card, kind: string): Promise<string> {
		const res = await fetch('/api/people/report', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ acct: card.acct, kind })
		});
		const r = (await res.json()) as { ok: boolean; hidden?: boolean; reason?: string };
		if (r.ok) return r.hidden ? '通報を受け付け、カードから外しました' : '通報を受け付けました';
		return r.reason === 'duplicate' ? 'この人はすでに通報しています' : r.reason === 'rate' ? '今日の通報の上限です' : '通報できませんでした';
	}
	const who = (c: Card) => ({ name: c.name, username: c.username, host: c.host });
	function relationLabel(r: Relation | undefined, locked: boolean): string {
		if (!r) return '';
		if (r.isFollowing && r.isFollowed) return '相互フォロー';
		if (r.isFollowing) return 'フォロー中';
		if (r.hasPendingFollowRequestFromYou) return 'リクエスト送信済み';
		if (r.isFollowed) return 'あなたをフォローしています';
		return locked ? '未フォロー（承認制）' : '未フォロー';
	}
</script>

{#if tab === 'discover' && !browsing}
	<PeopleLanding {mode} {onmode} loggedIn={!!user} count={status?.count ?? null} error={joinError} aiNote={status?.self?.preventAiLearning ?? false} onsubmit={search} />
{:else if !status?.me}
	<section class="panel block"><p class="muted">{joinError || '参加すると、ここに' + (tab === 'likes' ? 'いいねした人' : tab === 'passed' ? 'よくないねした人' : 'あなたの参加状態') + 'が出ます。'}</p></section>
{:else if tab === 'discover'}
	<SearchBar {turns} reading={deckLoading} {ondrop} />
	{#if deckLoading && cards.length === 0}
		<div class="loading"><Spinner label="カードを集めています" /><p class="muted">Clef で読み取り中</p></div>
	{:else if deckError}
		<p class="banner">カードを取得できません（{deckError}）。<button class="link" onclick={loadDeck}>再試行</button></p>
	{:else if refused}
		<div class="panel block"><p>この言葉では探せません。話題や趣味、話し方を手がかりにしてください。</p><button class="btn secondary" onclick={onclear}>言葉を消す</button></div>
	{:else}
		{#key deckGen}
			<Discover
				items={cards}
				keyOf={(c) => c.acct}
				labelOf={(c) => c.name}
				total={cards.length}
				onlike={(c) => peopleStore.like(c.acct, who(c))}
				onpass={(c) => peopleStore.pass(c.acct, who(c))}
				onundo={(c, action) => (action === 'like' ? peopleStore.unlike(c.acct) : peopleStore.restore(c.acct))}
				onexhausted={loadDeck}
				onsettings={loadDeck}
				emptyTitle={status.count <= 1 ? 'まだあなただけです' : 'この言葉に合う人はいまはいません'}
				emptyHint={status.count <= 1 ? '参加する人が増えると、ここにカードが出ます。' : 'いいねした人は いいね タブから Misskey でフォローできます。'}
				doneTitle="今日のカードは見終わりました"
				doneHint="いいねした人は いいね タブから Misskey でフォローできます。"
				settingsLabel="もう一度集める"
				busy={deckLoading ? (allTurns.at(-1) ?? '') : ''}
			>
				{#snippet card(c, eager)}<PersonCard card={c} {eager} />{/snippet}
				{#snippet details(c, full, like)}
					<PersonDetails card={c} {full} canFollow={status?.canFollow ?? false} onfollow={follow} onreport={reportCard} onlike={full ? like : undefined} />
				{/snippet}
				{#snippet composer()}
					<PromptBox bind:value={draft} label="言葉を足して絞る" placeholder="言葉を足して絞る（例: 深夜によく起きている人）" onsubmit={refine}>
						{#snippet left()}<span>参加 {status?.count ?? 0} 人 · いいね {peopleStore.liked.length}</span>{/snippet}
					</PromptBox>
				{/snippet}
			</Discover>
		{/key}
	{/if}
{:else if tab === 'likes'}
	<PeopleGrid people={peopleStore.liked} {relations} canFollow={status.canFollow} onremove={(a) => peopleStore.unlike(a)} onfollow={follow} onunfollow={unfollow} onreport={reportCard} />
	{#if matches.length > 0}
		<section class="list">
			<h2>マッチ <span class="muted small">{matches.length} 人</span></h2>
			<ul class="people">
				{#each matches as m (m.acct)}
					<li class="person">
						<img src={avatar(m.host, m.username)} alt="" width="44" height="44" referrerpolicy="no-referrer" loading="lazy" />
						<div class="names"><b>{m.name}</b><small>@{m.username}@{m.host}</small><small class="state">相互フォロー</small></div>
						<div class="ops">
							<a class="chip on" href="https://{m.host}/@{m.username}" target="_blank" rel="noopener">プロフィールを見る</a>
							{#if user}<a class="chip ghost" href="https://{user.host}/@{m.username}@{m.host}" target="_blank" rel="noopener">自分のサーバーで開く</a>{/if}
						</div>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
{:else if tab === 'passed'}
	<PeopleGrid people={peopleStore.passed} mode="passed" onremove={(a) => peopleStore.restore(a)} onfollow={follow} onunfollow={unfollow} onreport={reportCard} />
{:else}
	<section class="panel block">
		<h2>参加しています</h2>
		<p><img class="me" src={avatar(status.me.host, status.me.username)} alt="" width="40" height="40" referrerpolicy="no-referrer" /> <b>{status.me.name}</b> <span class="muted">@{status.me.username}@{status.me.host}</span></p>
		{#if status.me.hidden}
			<p class="warn">いまはカードに出ていません（{status.me.hidden.kind === 'report' ? '通報を確認中' : '内容の確認が必要'}）。{#each status.me.hidden.noteIds as id (id)}<a href="https://{status.me.host}/notes/{id}" target="_blank" rel="noopener">{id}</a> {/each}</p>
		{/if}
		{#if status.me.warning}
			<p class="warn">恋人・出会いを求めているように読めるノートが 1 件あります。消すと次の確認で警告が消えます: {#each status.me.warning.noteIds as id (id)}<a href="https://{status.me.host}/notes/{id}" target="_blank" rel="noopener">{id}</a> {/each}</p>
		{/if}
		<div class="field">
			<span class="label">話したいこと（{MAX_CHIPS} つまで。選ばなければノートから推定します）</span>
			<ul class="chips">{#each GENRES as g (g)}<li><button class="chip" class:on={status.me.chips.includes(g)} aria-pressed={status.me.chips.includes(g)} onclick={() => toggleChip(g)}>{GENRE_LABELS[g]}</button></li>{/each}</ul>
		</div>
		<label class="check"><input type="checkbox" checked={status.me.profileOnly} onchange={(e) => patchMe({ profileOnly: (e.currentTarget as HTMLInputElement).checked })} /> カードにはプロフィールだけ出す（ノートは出さない）</label>
		<dl class="facts">
			<dt>読んだノート</dt><dd>{status.me.estimate?.sampleCount ?? 0} 件（{status.me.estimate ? new Date(status.me.estimate.at).toLocaleDateString('ja-JP') : '未'}）。7 日おきに読み直します</dd>
			<dt>カードに出すノート</dt><dd>{status.me.profileOnly ? 'プロフィールだけ' : `反応の多い ${status.me.noteIds.length} 件`}</dd>
			<dt>共通のフォロー先</dt><dd>{status.me.followingPublic ? '計算します' : 'フォロー一覧が公開でないため計算しません'}</dd>
			<dt>フォローの権限</dt><dd>{status.canFollow ? 'あり（Misskey の設定 > API からいつでも失効できます）' : '無し（最初の「フォローする」で確認します）'}</dd>
		</dl>
		<button class="btn secondary" onclick={leave}>やめる（記録を消す）</button>
	</section>
{/if}

{#if newMatches.length > 0}
	<div class="overlay" role="dialog" aria-modal="true" aria-label="マッチしました">
		<div class="box">
			<p class="big"><Icon name="heart" size={44} filled /></p>
			<h2>マッチしました</h2>
			<ul class="people">
				{#each newMatches as m (m.acct)}
					<li class="person">
						<img src={avatar(m.host, m.username)} alt="" width="44" height="44" referrerpolicy="no-referrer" />
						<div class="names"><b>{m.name}</b><small>@{m.username}@{m.host}</small></div>
						<div class="ops"><a class="chip on" href="https://{m.host}/@{m.username}" target="_blank" rel="noopener">プロフィールを見る</a></div>
					</li>
				{/each}
			</ul>
			<button class="btn primary" onclick={() => { peopleStore.markMatchesSeen(newMatches.map((m) => m.acct)); newMatches = []; }}>閉じる</button>
		</div>
	</div>
{/if}

<style>
	.loading {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
	}
	.banner {
		margin: 0 0 10px;
		padding: 10px 14px;
		border-radius: var(--radius);
		background: var(--nope-soft);
		font-size: 0.86rem;
	}
	.link {
		border: none;
		background: none;
		padding: 0;
		color: var(--accent-fg);
		font-weight: 700;
		cursor: pointer;
		text-decoration: underline;
	}
	.block {
		padding: 18px 20px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		max-width: 560px;
		margin: 0 auto;
		width: 100%;
	}
	h2 {
		margin: 0;
		font-size: 1.05rem;
	}
	p {
		margin: 0;
		font-size: 0.9rem;
		line-height: 1.6;
	}
	.me {
		border-radius: 50%;
		vertical-align: middle;
		object-fit: cover;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.9rem;
		font-weight: 700;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.label {
		font-size: 0.74rem;
		font-weight: 700;
		color: var(--fg-muted);
	}
	.chips {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.facts {
		margin: 0;
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 4px 12px;
		font-size: 0.86rem;
	}
	.facts dt {
		color: var(--fg-muted);
		font-weight: 700;
	}
	.facts dd {
		margin: 0;
	}
	.warn {
		color: var(--nope);
		font-weight: 700;
		word-break: break-all;
	}
	.small {
		font-size: 0.78rem;
		font-weight: 400;
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.people {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.person {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border-radius: var(--radius);
		background: var(--panel);
		border: 1px solid var(--border);
	}
	.person img {
		border-radius: 50%;
		object-fit: cover;
	}
	.names {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		line-height: 1.25;
	}
	.names small {
		color: var(--fg-muted);
		font-size: 0.74rem;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.names .state {
		color: var(--accent-fg);
		font-weight: 700;
	}
	.ops {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		justify-content: flex-end;
	}
	.ops .chip {
		text-decoration: none;
	}
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 80;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 16px;
		background: var(--love-grad);
	}
	.box {
		width: min(100%, 420px);
		padding: 24px;
		border-radius: var(--radius-lg);
		background: var(--panel);
		display: flex;
		flex-direction: column;
		gap: 14px;
		text-align: center;
		box-shadow: var(--shadow-lg);
	}
	.box .big {
		color: var(--love);
	}
	.box .people {
		text-align: left;
	}
</style>
