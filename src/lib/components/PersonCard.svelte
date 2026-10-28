<script lang="ts">
	import type { Card } from '$lib/server/deck';
	import { GENRE_LABELS } from '$lib/types';
	import Icon from './Icon.svelte';

	// 人のカード。サーバーのカード（ServerCard）と同じ形: 全面にバナー（無ければアバターをぼかした地）、
	// 右上のピル、左上の帯、下部にアイコン・名前・host・チップ・説明。中身は Misskey のプロフィールそのもので、
	// AI の採点は出さず、事実（あなたをフォロー / 共通のフォロー先 / 同じサーバー）だけを出す
	let { card, eager = false }: { card: Card; eager?: boolean } = $props();
	const hue = $derived([...card.host].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0));
	const fallback = $derived(`linear-gradient(160deg, hsl(${hue} 55% 42%) 0%, hsl(${(hue + 40) % 360} 60% 22%) 100%)`);
	const reasons = $derived(
		[
			card.badges.followsYou ? 'あなたをフォローしています' : null,
			card.badges.common >= 2 ? `共通のフォロー先 ${card.badges.common} 人` : null,
			card.badges.sameHost ? '同じサーバー' : null
		].filter((r): r is string => r !== null)
	);
</script>

<article class="card" style:background={fallback}>
	{#if card.bannerUrl}
		<img class="photo" src={card.bannerUrl} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" draggable="false" referrerpolicy="no-referrer" />
	{:else}
		<img class="photo blur" src={card.avatarUrl} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" draggable="false" referrerpolicy="no-referrer" />
	{/if}
	<div class="scrim"></div>

	{#if card.badges.followsYou}
		<div class="pill love" aria-label="あなたをフォローしています"><Icon name="heart" size={14} filled /><small>フォロー中</small></div>
	{:else if card.badges.common >= 2}
		<div class="pill" aria-label="共通のフォロー先 {card.badges.common} 人"><Icon name="user" size={14} /><small>共通</small>{card.badges.common}<small>人</small></div>
	{/if}
	<div class="badges">
		{#if card.isLocked}<div class="badge">🔒 フォローは承認制</div>{/if}
	</div>

	<div class="bottom">
		<div class="who">
			<img class="icon" src={card.avatarUrl} alt="" width="52" height="52" loading="lazy" draggable="false" referrerpolicy="no-referrer" />
			<div class="names">
				<h2>{card.name}</h2>
				<p class="host">@{card.username}@{card.host}</p>
			</div>
		</div>
		{#if reasons.length > 0 || card.chips.length > 0}
			<ul class="chips">
				{#each reasons.slice(0, 2) as r (r)}<li class="reason"><Icon name="check" size={12} />{r}</li>{/each}
				{#each card.chips.slice(0, 3) as c (c)}<li>{GENRE_LABELS[c]}</li>{/each}
			</ul>
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
	}
	.photo {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.photo.blur {
		filter: blur(24px) saturate(1.2);
		transform: scale(1.2);
		opacity: 0.8;
	}
	.scrim {
		position: absolute;
		inset: 0;
		background: linear-gradient(to top, rgba(0, 0, 0, 0.82) 0%, rgba(0, 0, 0, 0.35) 40%, rgba(0, 0, 0, 0) 65%);
	}
	.pill {
		position: absolute;
		top: 14px;
		right: 14px;
		background: var(--pill);
		color: #000;
		border-radius: 999px;
		padding: 5px 12px;
		box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
		font-weight: 700;
		font-size: 1.05rem;
		display: flex;
		align-items: baseline;
		gap: 4px;
	}
	.pill.love {
		background: var(--love);
		color: #fff;
		font-size: 0.9rem;
	}
	.pill small {
		font-size: 0.75rem;
		opacity: 0.8;
	}
	.badges {
		position: absolute;
		top: 14px;
		left: 14px;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 6px;
	}
	.badge {
		background: rgba(0, 0, 0, 0.5);
		border: 1px solid rgba(255, 255, 255, 0.3);
		border-radius: 999px;
		padding: 5px 10px;
		font-size: 0.75rem;
		font-weight: 700;
	}
	.bottom {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		padding: 16px 18px 20px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.who {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.icon {
		width: 52px;
		height: 52px;
		border-radius: 14px;
		border: 2px solid rgba(255, 255, 255, 0.9);
		background: #fff;
		object-fit: cover;
		flex-shrink: 0;
	}
	.names {
		min-width: 0;
	}
	h2 {
		margin: 0;
		font-size: 1.55rem;
		line-height: 1.15;
		font-weight: 700;
		text-shadow: 0 1px 8px rgba(0, 0, 0, 0.5);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.host {
		margin: 2px 0 0;
		font-size: 0.82rem;
		opacity: 0.85;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 10px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.18);
		border: 1px solid rgba(255, 255, 255, 0.25);
		font-size: 0.74rem;
		font-weight: 700;
	}
	.chips li.reason {
		background: var(--accent-soft);
		border-color: transparent;
		color: var(--accent-fg);
	}
	.desc {
		margin: 0;
		font-size: 0.86rem;
		line-height: 1.5;
		opacity: 0.92;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
