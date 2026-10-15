<script lang="ts">
	import type { Match } from '$lib/types';

	let { match, expanded = false }: { match: Match; expanded?: boolean } = $props();

	const s = $derived(match.server);
	const description = $derived(
		!s.description ? '' : expanded || s.description.length <= 100
			? s.description
			: `${s.description.slice(0, 100)}…`
	);
</script>

<div class="card" class:expanded>
	<div class="banner" style:background-image={s.bannerUrl ? `url(${s.bannerUrl})` : null}>
		<div class="shade"></div>
		<div class="score" title="相性スコア">
			<span class="heart">♥</span>
			<span>{match.score}%</span>
		</div>
		<div class="identity">
			{#if s.iconUrl}
				<img class="icon" src={s.iconUrl} alt="" width="56" height="56" loading="lazy" draggable="false" />
			{:else}
				<div class="icon placeholder">{(s.name ?? s.host).slice(0, 1)}</div>
			{/if}
			<div class="names">
				<h3>{s.name ?? s.host}</h3>
				<p class="host">{s.host}</p>
			</div>
		</div>
	</div>

	<div class="content">
		{#if match.tags.length > 0}
			<ul class="tags">
				{#each match.tags as tag (tag)}<li>{tag}</li>{/each}
			</ul>
		{/if}

		{#if match.reasons.length > 0}
			<ul class="reasons">
				{#each match.reasons.slice(0, expanded ? undefined : 3) as reason (reason)}
					<li>{reason}</li>
				{/each}
			</ul>
		{/if}

		{#if description}
			<p class="description">{description}</p>
		{/if}

		<p class="meta">
			{#if s.usersCount !== null}<span>👥 {s.usersCount.toLocaleString()}人</span>{/if}
			{#if s.npd15 !== null}<span>📝 {Math.round(s.npd15).toLocaleString()}投稿/日</span>{/if}
			{#if s.approvalRequired}<span>承認制</span>{/if}
			{#if !s.emailRequired}<span>メアド不要</span>{/if}
			{#if !match.vibe}<span>雰囲気は未判定</span>{/if}
		</p>
	</div>
</div>

<style>
	.card {
		background: var(--card);
		border-radius: 20px;
		overflow: hidden;
		box-shadow: var(--shadow-lg);
		border: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		height: 100%;
	}
	/* 内容が短いときは写真が伸びて Tinder らしく、長いときは 190px まで */
	.banner {
		position: relative;
		flex: 1 0 190px;
		min-height: 190px;
		background: linear-gradient(135deg, #b6dc4a, #86b300);
		background-size: cover;
		background-position: center;
	}
	.shade {
		position: absolute;
		inset: 0;
		background: linear-gradient(to top, rgba(0, 0, 0, 0.75) 0%, rgba(0, 0, 0, 0.05) 60%);
	}
	.score {
		position: absolute;
		top: 14px;
		right: 14px;
		background: var(--accent);
		color: #fff;
		font-weight: 800;
		border-radius: 999px;
		padding: 6px 12px;
		display: flex;
		gap: 6px;
		align-items: center;
		box-shadow: 0 4px 14px rgba(134, 179, 0, 0.45);
	}
	.identity {
		position: absolute;
		left: 16px;
		right: 16px;
		bottom: 12px;
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.icon {
		width: 56px;
		height: 56px;
		border-radius: 14px;
		border: 2px solid #fff;
		background: #fff;
		object-fit: cover;
		flex-shrink: 0;
	}
	.placeholder {
		display: grid;
		place-items: center;
		font-weight: 800;
		font-size: 1.4rem;
		color: var(--accent);
	}
	.names {
		min-width: 0;
	}
	h3 {
		margin: 0;
		font-size: 1.3rem;
		color: #fff;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.host {
		margin: 0;
		color: rgba(255, 255, 255, 0.8);
		font-size: 0.85rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.content {
		flex: 0 1 auto;
		padding: 14px 18px 18px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		overflow: hidden;
	}
	.expanded .banner {
		flex: 0 0 190px;
	}
	.expanded .content {
		flex: 1 1 auto;
		overflow-y: auto;
	}
	.tags,
	.reasons {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.tags li {
		background: var(--accent-soft);
		color: var(--accent-text);
		border-radius: 999px;
		padding: 3px 10px;
		font-size: 0.8rem;
		font-weight: 700;
	}
	.reasons {
		flex-direction: column;
		gap: 2px;
	}
	.reasons li {
		font-size: 0.9rem;
	}
	.reasons li::before {
		content: '✓ ';
		color: var(--accent);
		font-weight: 800;
	}
	.description {
		margin: 0;
		color: var(--muted);
		font-size: 0.9rem;
		line-height: 1.5;
	}
	.meta {
		margin: 0;
		color: var(--muted);
		font-size: 0.8rem;
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}
</style>
