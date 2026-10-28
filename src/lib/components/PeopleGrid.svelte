<script lang="ts">
	import type { LikedPerson } from '$lib/people-store.svelte';
	import type { Relation } from '$lib/people-deck';
	import type { Card } from '$lib/server/deck';
	import Icon from './Icon.svelte';
	import PersonDetails from './PersonDetails.svelte';
	import Sheet from './Sheet.svelte';
	import Spinner from './Spinner.svelte';

	// 人の いいね一覧 と よくないね一覧。サーバーの LikesGrid と同じタイルグリッド。
	// タイルをタップすると、さがすと同じ詳細シートを開く（フォロー状態・フォローする・通報）
	let {
		people,
		mode = 'liked',
		relations = {},
		canFollow = false,
		onremove,
		onfollow,
		onunfollow,
		onreport
	}: {
		people: (LikedPerson & { acct: string })[];
		mode?: 'liked' | 'passed';
		relations?: Record<string, Relation>;
		canFollow?: boolean;
		onremove: (acct: string) => void;
		onfollow: (card: { acct: string }) => Promise<{ ok: boolean; message: string }>;
		onunfollow: (acct: string) => void;
		onreport: (card: Card, kind: string) => Promise<string>;
	} = $props();

	let detail = $state<(LikedPerson & { acct: string }) | null>(null);
	let detailCard = $state<Card | null>(null);
	// タイルを開いたら、その人のカード（bio・プロフィール欄・固定ノート）を閲覧者のサーバーから取る
	async function open(p: LikedPerson & { acct: string }) {
		detail = p;
		detailCard = null;
		try {
			const res = await fetch(`/api/people/profile?acct=${encodeURIComponent(p.acct)}`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const d = (await res.json()) as { card: Card; relation: Relation };
			if (detail?.acct !== p.acct) return;
			detailCard = d.card;
			relations = { ...relations, [p.acct]: d.relation };
		} catch {
			if (detail?.acct === p.acct) detailCard = cardOf(p);
		}
	}
	const removeLabel = $derived(mode === 'liked' ? '外す' : '戻す');
	const avatar = (host: string, username: string) => `https://${host}/avatar/@${encodeURIComponent(username)}`;
	function stateOf(acct: string): string {
		const r = relations[acct];
		if (!r) return '';
		if (r.isFollowing && r.isFollowed) return '相互フォロー';
		if (r.isFollowing) return 'フォロー中';
		if (r.hasPendingFollowRequestFromYou) return 'リクエスト中';
		if (r.isFollowed) return 'フォローされています';
		return '';
	}
	// カードが取れなかったときの最小のカード
	const cardOf = (p: LikedPerson & { acct: string }): Card => ({
		acct: p.acct,
		host: p.host,
		username: p.username,
		name: p.name,
		avatarUrl: avatar(p.host, p.username),
		bannerUrl: null,
		chips: [],
		badges: { followsYou: relations[p.acct]?.isFollowed ?? false, common: 0, sameHost: false },
		description: '',
		fields: [],
		pinned: [],
		noteIds: ['_'],
		profileOnly: false,
		isLocked: false
	});
</script>

<section class="likes">
	<h1>{mode === 'liked' ? 'いいね' : 'よくないね'} <span class="count">{people.length}</span></h1>
	{#if people.length === 0}
		<div class="empty">
			<p class="big"><Icon name={mode === 'liked' ? 'heart' : 'x'} size={40} /></p>
			{#if mode === 'liked'}
				<p>まだありません。いいねした人がここに残ります。相手には何も届きません。</p>
			{:else}
				<p>まだありません。よくないねした人がここに残ります（30 日でまた出ます）。</p>
			{/if}
		</div>
	{:else}
		<p class="muted">
			{#if mode === 'liked'}「フォローする」で Misskey でフォローします。相互フォローになったらマッチ。{:else}「戻す」でまたデッキに出ます。{/if}
		</p>
		<ul class="grid">
			{#each people as p (p.acct)}
				{@const st = stateOf(p.acct)}
				{@const following = relations[p.acct]?.isFollowing || relations[p.acct]?.hasPendingFollowRequestFromYou}
				<li class="tile">
					<img class="photo" src={avatar(p.host, p.username)} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" />
					<div class="scrim"></div>
					{#if st}<span class="score" class:dim={mode === 'passed'}><Icon name="heart" size={12} filled /> {st}</span>{/if}
					<button class="open" onclick={() => open(p)} aria-label="{p.name} の詳細">
						<span class="label">
							<img class="icon" src={avatar(p.host, p.username)} alt="" width="28" height="28" loading="lazy" referrerpolicy="no-referrer" />
							<span class="names">
								<b>{p.name}</b>
								<small>@{p.username}@{p.host}</small>
							</span>
						</span>
					</button>
					<div class="actions">
						{#if mode === 'liked'}
							{#if following}
								<button onclick={() => onunfollow(p.acct)}>取り消す</button>
							{:else}
								<button onclick={async () => alert((await onfollow({ acct: p.acct })).message)}>フォロー</button>
							{/if}
						{/if}
						<a href="https://{p.host}/@{p.username}" target="_blank" rel="noopener">見る</a>
						<button onclick={() => onremove(p.acct)}>{removeLabel}</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>

{#if detail}
	<Sheet label="{detail.name} の詳細" onclose={() => (detail = null)}>
		{#if detailCard}
			<PersonDetails card={detailCard} full {canFollow} {onfollow} {onreport} />
		{:else}
			<div class="loading"><Spinner label="読み込み中" /></div>
		{/if}
	</Sheet>
{/if}

<style>
	.likes {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding-top: 8px;
	}
	h1 {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 700;
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.count {
		background: var(--accent-soft);
		color: var(--accent-fg);
		border-radius: 999px;
		padding: 2px 10px;
		font-size: 0.9rem;
	}
	.muted {
		margin: 0;
		font-size: 0.9rem;
	}
	/* 空状態は枠を付けず、アイコンと一文だけを置く */
	.empty {
		text-align: center;
		padding: 72px 20px;
		color: var(--fg-muted);
		font-size: 0.9rem;
	}
	.empty .big {
		width: 72px;
		height: 72px;
		margin: 0 auto 14px;
		border-radius: 50%;
		background: var(--accent-soft);
		align-items: center;
		display: flex;
		justify-content: center;
		color: var(--accent);
	}
	.empty p {
		margin: 0;
	}
	.grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 12px;
	}
	@media (min-width: 900px) {
		.grid {
			grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
			gap: 16px;
		}
	}
	.tile {
		position: relative;
		aspect-ratio: 3 / 4;
		border-radius: var(--radius);
		overflow: hidden;
		color: #fff;
		box-shadow: var(--shadow);
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
	}
	.photo {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.scrim {
		position: absolute;
		inset: 0;
		background: linear-gradient(to top, rgba(0, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0.2) 55%, transparent 80%);
	}
	.score {
		position: absolute;
		top: 8px;
		right: 8px;
		display: inline-flex;
		align-items: center;
		gap: 3px;
		background: var(--love);
		color: #fff;
		border-radius: 999px;
		padding: 3px 8px;
		font-size: 0.75rem;
		font-weight: 700;
	}
	.score.dim {
		background: rgba(0, 0, 0, 0.55);
	}
	/* タイルの上部はまるごと「詳細を開く」ボタン。名前は下端に寄せる */
	.open {
		position: relative;
		flex: 1;
		display: flex;
		align-items: flex-end;
		width: 100%;
		min-width: 0;
		padding: 0;
		background: none;
		border: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.label {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 10px 6px;
		min-width: 0;
		width: 100%;
	}
	.icon {
		border-radius: 8px;
		background: #fff;
		flex-shrink: 0;
	}
	.names {
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.names b,
	.names small {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.names b {
		font-size: 0.92rem;
	}
	.names small {
		font-size: 0.7rem;
		opacity: 0.8;
	}
	.actions {
		position: relative;
		display: flex;
		border-top: 1px solid rgba(255, 255, 255, 0.2);
	}
	.actions a,
	.actions button {
		flex: 1;
		text-align: center;
		padding: 8px 0;
		font-size: 0.78rem;
		font-weight: 700;
		color: #fff;
		text-decoration: none;
		background: none;
		border: none;
		cursor: pointer;
	}
	.actions > * + * {
		border-left: 1px solid rgba(255, 255, 255, 0.2);
	}
	.loading {
		display: flex;
		justify-content: center;
		padding: 40px 0;
	}
</style>
