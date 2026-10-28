<script lang="ts">
	import type { Card } from '$lib/server/deck';
	import { GENRE_LABELS } from '$lib/types';
	import Icon from './Icon.svelte';

	// 人のカード（サーバーのカードと同じ大きさ・同じ操作）。中身は Misskey のプロフィールそのもの。
	// AI の採点は出さず、事実の帯（あなたをフォローしている / 共通のフォロー先 / 同じサーバー）だけ
	let { card, eager = false }: { card: Card; eager?: boolean } = $props();
	// ホストごとに違う色（画像が無いので地の色で区別する）
	const hue = $derived([...card.host].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0));
</script>

<article class="card" style:background={`linear-gradient(160deg, hsl(${hue} 55% 42%) 0%, hsl(${(hue + 40) % 360} 60% 22%) 100%)`}>
	<div class="badges">
		{#if card.badges.followsYou}<div class="badge you"><Icon name="heart" size={12} filled />あなたをフォローしています</div>{/if}
		{#if card.badges.common >= 2}<div class="badge">共通のフォロー先 {card.badges.common} 人</div>{/if}
		{#if card.badges.sameHost}<div class="badge">同じサーバー</div>{/if}
		{#if card.isLocked}<div class="badge">🔒 フォローは承認制</div>{/if}
	</div>
	<div class="center">
		<img class="avatar" src={card.avatarUrl} alt="" width="120" height="120" loading={eager ? 'eager' : 'lazy'} decoding="async" draggable="false" referrerpolicy="no-referrer" />
	</div>
	<div class="bottom">
		<h2>{card.name}</h2>
		<p class="acct">@{card.username}<span>@{card.host}</span></p>
		{#if card.chips.length > 0}
			<ul class="chips">{#each card.chips as c (c)}<li>{GENRE_LABELS[c]}</li>{/each}</ul>
		{/if}
		{#if card.description}<p class="desc">{card.description}</p>{/if}
	</div>
</article>

<style>
	.card {
		position: relative;
		width: 100%;
		height: 100%;
		border-radius: var(--radius-lg);
		overflow: hidden;
		box-shadow: var(--shadow-lg);
		color: #fff;
		user-select: none;
		contain: content;
		display: flex;
		flex-direction: column;
	}
	.badges {
		position: absolute;
		top: 14px;
		left: 14px;
		right: 14px;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		z-index: 1;
	}
	.badge {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 10px;
		border-radius: 999px;
		background: rgba(0, 0, 0, 0.35);
		backdrop-filter: blur(6px);
		font-size: 0.72rem;
		font-weight: 700;
	}
	.badge.you {
		background: var(--love);
	}
	.center {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding-top: 24px;
	}
	.avatar {
		border-radius: 50%;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
		background: rgba(255, 255, 255, 0.2);
		object-fit: cover;
	}
	.bottom {
		padding: 16px 18px 20px;
		background: linear-gradient(to top, rgba(0, 0, 0, 0.55), transparent);
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	h2 {
		margin: 0;
		font-size: 1.4rem;
		line-height: 1.2;
		text-shadow: 0 1px 6px rgba(0, 0, 0, 0.4);
	}
	.acct {
		margin: 0;
		font-size: 0.86rem;
		opacity: 0.9;
	}
	.acct span {
		opacity: 0.7;
	}
	.chips {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.chips li {
		padding: 3px 10px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.22);
		font-size: 0.74rem;
		font-weight: 700;
	}
	.desc {
		margin: 2px 0 0;
		font-size: 0.86rem;
		line-height: 1.5;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
