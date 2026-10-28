<script lang="ts">
	import type { Card } from '$lib/server/deck';
	import { GENRE_LABELS } from '$lib/types';
	import Icon from './Icon.svelte';

	// 右パネル（compact）とシート（full）。bio・プロフィール欄・固定ノート・代表ノート（相手本人のトークンで取る）。
	// AI の判定値は出さない。full のときだけフォローと通報のボタン
	let {
		card,
		full = false,
		canFollow,
		onfollow,
		onreport,
		onlike
	}: {
		card: Card;
		full?: boolean;
		canFollow: boolean;
		onfollow: (card: Card) => Promise<{ ok: boolean; message: string }>;
		onreport: (card: Card, kind: string) => Promise<string>;
		onlike?: () => void;
	} = $props();

	let notes = $state<{ id: string; text: string; url: string; reactions: number }[] | null>(null);
	let followMsg = $state('');
	let reporting = $state(false);
	let reportMsg = $state('');

	$effect(() => {
		notes = null;
		if (card.profileOnly || card.noteIds.length === 0) {
			notes = [];
			return;
		}
		const acct = card.acct;
		fetch(`/api/people/card?acct=${encodeURIComponent(acct)}`)
			.then(async (r) => (r.ok ? ((await r.json()) as { notes?: typeof notes }) : { notes: [] }))
			.then((d) => {
				if (card.acct === acct) notes = d.notes ?? [];
			})
			.catch(() => {
				notes = [];
			});
	});
	async function follow() {
		followMsg = '…';
		const r = await onfollow(card);
		followMsg = r.message;
	}
	const KINDS = [
		['seeking', '恋愛・出会いの募集'],
		['ads', '宣伝'],
		['impersonation', 'なりすまし'],
		['others-info', '他人の情報']
	];
</script>

<div class="details" class:compact={!full}>
	<div class="identity">
		<img class="avatar" src={card.avatarUrl} alt="" width="56" height="56" loading="lazy" referrerpolicy="no-referrer" />
		<div>
			<h3>{card.name}</h3>
			<a class="acct" href="https://{card.host}/@{card.username}" target="_blank" rel="noopener">@{card.username}@{card.host} <Icon name="external" size={12} /></a>
		</div>
	</div>
	<ul class="facts">
		{#if card.badges.followsYou}<li class="you">あなたをフォローしています</li>{/if}
		{#if card.badges.common >= 2}<li>共通のフォロー先 {card.badges.common} 人</li>{/if}
		{#if card.badges.sameHost}<li>同じサーバー</li>{/if}
		{#each card.chips as c (c)}<li>{GENRE_LABELS[c]}</li>{/each}
	</ul>
	{#if card.description}<p class="bio">{card.description}</p>{/if}
	{#if card.fields.length > 0}
		<dl class="fields">
			{#each card.fields as f (f.name)}<dt>{f.name}</dt><dd>{f.value}</dd>{/each}
		</dl>
	{/if}
	{#if card.pinned.length > 0}
		<section>
			<h4>固定ノート</h4>
			{#each card.pinned as t, i (i)}<p class="note">{t}</p>{/each}
		</section>
	{/if}
	{#if !card.profileOnly}
		<section>
			<h4>反応の多いノート</h4>
			{#if notes === null}
				<p class="muted small">読み込み中…</p>
			{:else if notes.length === 0}
				<p class="muted small">（出せるノートがありません）</p>
			{:else}
				{#each notes as n (n.id)}
					<p class="note"><a href={n.url} target="_blank" rel="noopener">{n.text}</a> <small class="muted">{n.reactions} 反応</small></p>
				{/each}
			{/if}
		</section>
	{/if}
	{#if full}
		<div class="actions">
			<button class="btn love" onclick={follow} disabled={followMsg === '…'}>
				<Icon name="plus" size={15} />{canFollow ? (card.isLocked ? 'フォローをリクエスト' : 'フォローする') : 'フォローする（権限を追加）'}
			</button>
			{#if onlike}<button class="btn secondary" onclick={onlike}><Icon name="heart" size={15} filled /> いいね</button>{/if}
		</div>
		{#if followMsg && followMsg !== '…'}<p class="msg">{followMsg}</p>{/if}
		<div class="report">
			{#if !reporting}
				<button class="link" onclick={() => (reporting = true)}>通報する</button>
			{:else}
				<span class="muted small">理由:</span>
				{#each KINDS as [kind, label] (kind)}
					<button class="chip ghost" onclick={async () => { reportMsg = await onreport(card, kind); reporting = false; }}>{label}</button>
				{/each}
			{/if}
			{#if reportMsg}<p class="msg">{reportMsg}</p>{/if}
		</div>
	{/if}
</div>

<style>
	.details {
		display: flex;
		flex-direction: column;
		gap: 10px;
		font-size: 0.88rem;
	}
	.identity {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.avatar {
		border-radius: 50%;
		object-fit: cover;
	}
	h3 {
		margin: 0;
		font-size: 1.05rem;
	}
	.acct {
		color: var(--fg-muted);
		font-size: 0.8rem;
		text-decoration: none;
	}
	.facts {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.facts li {
		padding: 3px 10px;
		border-radius: 999px;
		background: var(--panel-2);
		font-size: 0.74rem;
		font-weight: 700;
	}
	.facts li.you {
		background: var(--love-soft);
		color: var(--love);
	}
	.bio {
		margin: 0;
		line-height: 1.55;
		white-space: pre-wrap;
	}
	.fields {
		margin: 0;
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 2px 10px;
		font-size: 0.8rem;
	}
	.fields dt {
		color: var(--fg-muted);
		font-weight: 700;
	}
	.fields dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	h4 {
		margin: 0 0 4px;
		font-size: 0.74rem;
		color: var(--fg-muted);
	}
	.note {
		margin: 0 0 6px;
		padding: 8px 10px;
		border-radius: 10px;
		background: var(--panel-2);
		line-height: 1.5;
		font-size: 0.84rem;
	}
	.note a {
		color: inherit;
		text-decoration: none;
	}
	.actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.msg {
		margin: 0;
		font-size: 0.82rem;
		font-weight: 700;
	}
	.report {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
	}
	.link {
		border: none;
		background: none;
		padding: 0;
		color: var(--fg-muted);
		font-size: 0.78rem;
		cursor: pointer;
		text-decoration: underline;
	}
	.small {
		font-size: 0.78rem;
	}
	.compact .bio {
		display: -webkit-box;
		-webkit-line-clamp: 6;
		line-clamp: 6;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
