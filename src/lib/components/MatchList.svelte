<script lang="ts">
	import type { Match } from '$lib/types';

	const MISSPACE_URL = 'https://misspace.pages.dev';

	let { matches, onremove }: { matches: Match[]; onremove: (m: Match) => void } = $props();

	function misspaceLink(host: string): string {
		const url = new URL(MISSPACE_URL);
		url.searchParams.set('from', host);
		return url.toString();
	}
</script>

<section class="list">
	<h2>マッチしたサーバー</h2>
	{#if matches.length === 0}
		<p class="empty">まだマッチがありません。気になるサーバーに ♥ を送ってみましょう。</p>
	{:else}
		<p class="lead">いいねした {matches.length} 件。気になったら覗いてみてください。</p>
		{#each matches as m (m.server.host)}
			<article class="item">
				{#if m.server.iconUrl}
					<img src={m.server.iconUrl} alt="" width="48" height="48" loading="lazy" />
				{:else}
					<div class="placeholder">{(m.server.name ?? m.server.host).slice(0, 1)}</div>
				{/if}
				<div class="body">
					<div class="head">
						<h3>{m.server.name ?? m.server.host}</h3>
						<span class="score">♥ {m.score}%</span>
					</div>
					<p class="host">{m.server.host}</p>
					{#if m.tags.length > 0}
						<p class="tags">{m.tags.join(' · ')}</p>
					{/if}
					<div class="actions">
						<a class="primary" href="https://{m.server.host}/" target="_blank" rel="noopener">
							サーバーを見る
						</a>
						<a class="ghost" href={misspaceLink(m.server.host)} target="_blank" rel="noopener">
							連合を見る
						</a>
						<button class="ghost" onclick={() => onremove(m)}>外す</button>
					</div>
				</div>
			</article>
		{/each}
	{/if}
</section>

<style>
	.list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	h2 {
		margin: 0;
	}
	.lead,
	.empty {
		margin: 0;
		color: var(--muted);
	}
	.item {
		display: flex;
		gap: 12px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 16px;
		padding: 14px;
		box-shadow: var(--shadow);
	}
	img,
	.placeholder {
		width: 48px;
		height: 48px;
		border-radius: 12px;
		flex-shrink: 0;
		object-fit: cover;
	}
	.placeholder {
		display: grid;
		place-items: center;
		background: var(--accent-soft);
		color: var(--accent-text);
		font-weight: 800;
	}
	.body {
		flex: 1;
		min-width: 0;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	h3 {
		margin: 0;
		font-size: 1.05rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.score {
		margin-left: auto;
		color: var(--accent-text);
		font-weight: 800;
		white-space: nowrap;
	}
	.host,
	.tags {
		margin: 2px 0 0;
		color: var(--muted);
		font-size: 0.8rem;
		word-break: break-all;
	}
	.actions {
		margin-top: 10px;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.actions a,
	.actions button {
		font: inherit;
		font-weight: 700;
		font-size: 0.85rem;
		border-radius: 999px;
		padding: 7px 14px;
		text-decoration: none;
		cursor: pointer;
		border: 1px solid transparent;
	}
	.primary {
		background: var(--accent);
		color: #fff;
	}
	.ghost {
		background: var(--surface);
		color: var(--text);
		border-color: var(--border);
	}
	.ghost:hover {
		border-color: var(--accent);
	}
</style>
