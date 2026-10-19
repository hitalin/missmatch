<script lang="ts">
	import { formatCount } from '$lib/format';
	import { type Match, REGISTRATION_LABELS } from '$lib/types';
	import Icon from './Icon.svelte';

	// Tinder のカード: 全面画像、下部にグラデーションと名前。詳細はシートで見せる
	let { match, eager = false }: { match: Match; eager?: boolean } = $props();

	const s = $derived(match.server);
	const fallback = $derived(
		`linear-gradient(160deg, ${s.themeColor ?? '#86b300'} 0%, color-mix(in srgb, ${s.themeColor ?? '#86b300'} 55%, #000) 100%)`
	);
	const subtitle = $derived(
		[
			s.usersCount !== null ? `${formatCount(s.usersCount)}人` : null,
			s.npd15 !== null ? `${formatCount(s.npd15)}投稿/日` : null
		]
			.filter(Boolean)
			.join(' · ')
	);
	// Tinder の「最近アクティブ」の緑ドット。毎日読んでいる人がいる鯖だけ
	const active = $derived(s.dru15 !== null && s.dru15 >= 1 ? Math.round(s.dru15) : null);
</script>

<article class="card" style:background={fallback}>
	{#if s.bannerUrl}
		<img
			class="photo"
			src={s.bannerUrl}
			alt=""
			loading={eager ? 'eager' : 'lazy'}
			decoding="async"
			draggable="false"
		/>
	{/if}
	<div class="scrim"></div>

	<div class="score" aria-label="相性 {match.score}%">
		<span><Icon name="heart" size={14} filled /></span><small>相性</small>{match.score}<small>%</small>
	</div>
	<div class="badges">
		{#if active !== null}
			<div class="active"><i></i>毎日 {formatCount(active)} 人がいる</div>
		{/if}
		{#if s.registration !== 'open'}
			<div class="reg" class:closed={s.registration === 'closed'}>{REGISTRATION_LABELS[s.registration]}</div>
		{/if}
	</div>

	<div class="bottom">
		<div class="who">
			{#if s.iconUrl}
				<img class="icon" src={s.iconUrl} alt="" width="52" height="52" loading="lazy" draggable="false" />
			{:else}
				<div class="icon placeholder">{(s.name ?? s.host).slice(0, 1)}</div>
			{/if}
			<div class="names">
				<h2>{s.name ?? s.host}</h2>
				<p class="host">{s.host}{subtitle ? ` · ${subtitle}` : ''}</p>
			</div>
		</div>
		{#if match.tags.length > 0 || match.reasons.length > 0}
			<ul class="chips">
				{#each match.reasons.slice(0, 2) as reason (reason)}<li class="reason"><Icon name="check" size={12} />{reason}</li>{/each}
				{#each match.tags.slice(0, 3) as tag (tag)}<li>{tag}</li>{/each}
			</ul>
		{/if}
		{#if s.description}
			<p class="desc">{s.description}</p>
		{/if}
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
	.scrim {
		position: absolute;
		inset: 0;
		background: linear-gradient(to top, rgba(0, 0, 0, 0.82) 0%, rgba(0, 0, 0, 0.35) 40%, rgba(0, 0, 0, 0) 65%);
	}
	.score {
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
	.score span {
		color: #000;
		display: inline-flex;
		align-self: center;
	}
	.score small {
		font-size: 0.75rem;
		opacity: 0.8;
	}
	.score small:first-of-type {
		margin-right: 2px;
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
	.active,
	.reg {
		background: rgba(0, 0, 0, 0.5);
		border: 1px solid rgba(255, 255, 255, 0.3);
		border-radius: 999px;
		padding: 5px 10px;
		font-size: 0.75rem;
		font-weight: 700;
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	/* 緑のドットが呼吸する（Misskey のオンライン表示と同じ黄緑） */
	.active i {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--accent);
		box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 60%, transparent);
		animation: breathe 2s ease-out infinite;
	}
	@keyframes breathe {
		to {
			box-shadow: 0 0 0 7px transparent;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.active i {
			animation: none;
		}
	}
	.reg.closed {
		background: rgba(255, 77, 94, 0.75);
		border-color: transparent;
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
	.placeholder {
		display: grid;
		place-items: center;
		font-weight: 700;
		font-size: 1.4rem;
		color: var(--accent-fg);
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
		background: rgba(255, 255, 255, 0.16);
		border: 1px solid rgba(255, 255, 255, 0.28);
		border-radius: 999px;
		padding: 4px 10px;
		font-size: 0.78rem;
		font-weight: 700;
	}
	.chips li.reason {
		background: color-mix(in srgb, var(--accent) 70%, transparent);
		border-color: transparent;
	}
	.desc {
		margin: 0;
		font-size: 0.86rem;
		line-height: 1.5;
		opacity: 0.9;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
