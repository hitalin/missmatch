<script lang="ts">
	import type { AuthUser } from '$lib/auth';
	import type { Member } from '$lib/people';
	import { peopleStore } from '$lib/people-store.svelte';
	import type { Card } from '$lib/server/deck';
	import type { Relation } from '$lib/people-deck';
	import { MAX_CHIPS } from '$lib/people';
	import { GENRE_LABELS, GENRES, type Genre } from '$lib/types';
	import Discover from './Discover.svelte';
	import ModeToggle from './ModeToggle.svelte';
	import PeopleLanding from './PeopleLanding.svelte';
	import Icon from './Icon.svelte';
	import PersonCard from './PersonCard.svelte';
	import PersonDetails from './PersonDetails.svelte';
	import Spinner from './Spinner.svelte';
	import type { Tab } from './Shell.svelte';

	// 人モード（docs/PEOPLE.md v6.4）。サーバー探しと同じデッキ UI で、参加した人同士のカードをスワイプする。
	// 右 = いいね（ブラウザだけ）、「フォローする」ボタンが Misskey でのフォロー、相互フォローになったらマッチ
	let {
		tab,
		user,
		onlogin,
		mode,
		onmode
	}: {
		tab: Tab;
		user: AuthUser | null;
		onlogin: () => void;
		mode: 'server' | 'people';
		onmode: (m: 'server' | 'people') => void;
	} = $props();

	type Status = {
		count: number;
		cap: number;
		avatars: { host: string; username: string }[];
		me: Member | null;
		self: { preventAiLearning: boolean } | null;
		canFollow: boolean;
	};
	let status = $state<Status | null>(null);
	let statusError = $state('');
	let cards = $state.raw<Card[]>([]);
	let deckGen = $state(0);
	let deckLoading = $state(false);
	let deckError = $state('');
	let matches = $state<{ acct: string; host: string; username: string; name: string }[]>([]);
	let newMatches = $state<typeof matches>([]);
	let relations = $state<Record<string, Relation>>({});

	// 参加はボタン 1 つ（条件はサーバー側で判定し、満たさないときだけ理由を出す）
	let busy = $state(false);
	let error = $state('');
	const REASONS: Record<string, string> = {
		notes: '公開のノート（CW なし・連合あり）が 10 件たまると参加できます。',
		seeking: '恋人・出会いを求める内容が自己紹介やノートにあるため参加できません。',
		ads: '宣伝が中心のアカウントは参加できません。',
		banned: '参加できません。',
		cap: 'いまは参加の上限に達しています。',
		'server-cap': 'あなたのサーバーからの参加がいまは上限です。'
	};
	const avatar = (host: string, username: string) => `https://${host}/avatar/@${encodeURIComponent(username)}`;

	async function loadStatus() {
		statusError = '';
		try {
			const res = await fetch('/api/people/status');
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			status = (await res.json()) as Status;
		} catch (e) {
			statusError = e instanceof Error ? e.message : String(e);
		}
	}
	async function loadDeck() {
		deckLoading = true;
		deckError = '';
		try {
			const res = await fetch('/api/people/deck', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ exclude: peopleStore.excluded })
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const d = (await res.json()) as { cards: Card[]; count: number };
			cards = d.cards;
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
	$effect(() => {
		void user;
		loadStatus();
	});
	$effect(() => {
		if (!status?.me) return;
		if (tab === 'discover' && cards.length === 0 && !deckLoading) loadDeck();
		if (tab === 'likes') loadRelations();
		loadMatches();
	});

	async function join() {
		busy = true;
		error = '';
		try {
			const res = await fetch('/api/people/join', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ adultChecked: true, aiConsent: true, chips: [], profileOnly: false })
			});
			const r = (await res.json()) as { ok?: boolean; reason?: string; noteIds?: string[] };
			if (!res.ok || !r.ok) {
				error = REASONS[r.reason ?? ''] ?? '参加できませんでした。時間をおいて試してください。';
				if (r.noteIds?.length) error += ` 該当ノート: ${r.noteIds.map((id) => `https://${user?.host}/notes/${id}`).join(' ')}`;
				return;
			}
			await loadStatus();
		} catch {
			error = '通信に失敗しました';
		} finally {
			busy = false;
		}
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
	async function leave() {
		if (!confirm('参加をやめて、記録を消します。フォロー関係は Misskey にそのまま残ります。')) return;
		await fetch('/api/people/leave', { method: 'POST' });
		cards = [];
		await loadStatus();
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

{#if statusError}
	<p class="banner">人モードを読み込めません（{statusError}）。<button class="link" onclick={loadStatus}>再試行</button></p>
{:else if !status}
	<div class="loading"><Spinner label="読み込み中" /></div>
{:else if !status.me}
	{#if tab === 'discover'}
		<PeopleLanding {mode} {onmode} loggedIn={!!user} count={status.count} {busy} {error} aiNote={status.self?.preventAiLearning ?? false} onstart={user ? join : onlogin} />
	{:else}
		<section class="panel block"><p class="muted">参加すると、ここに{tab === 'likes' ? 'いいねした人' : tab === 'passed' ? 'よくないねした人' : 'あなたの参加状態'}が出ます。</p></section>
	{/if}
{:else if tab === 'discover'}
	{#if deckLoading && cards.length === 0}
		<div class="loading"><Spinner label="カードを集めています" /><p class="muted">カードを集めています</p></div>
	{:else if deckError}
		<p class="banner">カードを取得できません（{deckError}）。<button class="link" onclick={loadDeck}>再試行</button></p>
	{:else}
		<ModeToggle {mode} onchange={onmode} />
		<p class="count-line muted">参加 {status.count} 人 · いいね {peopleStore.liked.length}</p>
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
				emptyTitle={status.count <= 1 ? 'まだあなただけです' : '今日のカードは見終わりました'}
				emptyHint={status.count <= 1 ? '参加する人が増えると、ここにカードが出ます。' : 'いいねした人は いいね タブから Misskey でフォローできます。'}
				doneTitle="今日のカードは見終わりました"
				doneHint="いいねした人は いいね タブから Misskey でフォローできます。"
				settingsLabel="もう一度集める"
			>
				{#snippet card(c, eager)}<PersonCard card={c} {eager} />{/snippet}
				{#snippet details(c, full, like)}
					<PersonDetails card={c} {full} canFollow={status?.canFollow ?? false} onfollow={follow} onreport={reportCard} onlike={full ? like : undefined} />
				{/snippet}
			</Discover>
		{/key}
	{/if}
{:else if tab === 'likes'}
	<section class="list">
		<h2>いいね <span class="muted small">{peopleStore.liked.length} 人</span></h2>
		{#if peopleStore.liked.length === 0}
			<p class="muted">右にスワイプした人がここに入ります。相手には何も届きません。</p>
		{/if}
		<ul class="people">
			{#each peopleStore.liked as p (p.acct)}
				{@const r = relations[p.acct]}
				<li class="person">
					<img src={avatar(p.host, p.username)} alt="" width="44" height="44" referrerpolicy="no-referrer" loading="lazy" />
					<div class="names"><b>{p.name}</b><small>@{p.username}@{p.host}</small><small class="state">{relationLabel(r, false)}</small></div>
					<div class="ops">
						{#if r?.isFollowing || r?.hasPendingFollowRequestFromYou}
							<button class="chip ghost" onclick={() => unfollow(p.acct)}>取り消す</button>
						{:else}
							<button class="chip on" onclick={async () => alert((await follow({ acct: p.acct })).message)}>フォローする</button>
						{/if}
						<a class="chip ghost" href="https://{p.host}/@{p.username}" target="_blank" rel="noopener">見る</a>
						<button class="chip ghost" onclick={() => peopleStore.unlike(p.acct)}>外す</button>
					</div>
				</li>
			{/each}
		</ul>
		{#if matches.length > 0}
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
		{/if}
	</section>
{:else if tab === 'passed'}
	<section class="list">
		<h2>よくないね <span class="muted small">{peopleStore.passed.length} 人</span></h2>
		{#if peopleStore.passed.length === 0}<p class="muted">左にスワイプした人がここに入ります。30 日たつとまた出ます。</p>{/if}
		<ul class="people">
			{#each peopleStore.passed as p (p.acct)}
				<li class="person">
					<img src={avatar(p.host, p.username)} alt="" width="44" height="44" referrerpolicy="no-referrer" loading="lazy" />
					<div class="names"><b>{p.name}</b><small>@{p.username}@{p.host}</small></div>
					<div class="ops"><button class="chip ghost" onclick={() => peopleStore.restore(p.acct)}>戻す</button></div>
				</li>
			{/each}
		</ul>
	</section>
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
	.count-line {
		text-align: center;
		font-size: 0.8rem;
		margin: 0;
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
