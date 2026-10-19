<script lang="ts">
	import type { Match } from '$lib/types';
	import Icon from './Icon.svelte';
	import ServerDetails from './ServerDetails.svelte';
	import Sheet from './Sheet.svelte';

	const MISSPACE_URL = 'https://misspace.hital.in';

	// いいね一覧と、よくないね（パス）一覧を同じグリッドで出す
	let {
		matches,
		mode = 'liked',
		onremove
	}: { matches: Match[]; mode?: 'liked' | 'passed'; onremove: (m: Match) => void } = $props();

	// タイルをタップすると、さがすと同じ詳細シートを開く
	let detail = $state<Match | null>(null);
	const removeLabel = $derived(mode === 'liked' ? '外す' : '戻す');

	function misspaceLink(host: string): string {
		const url = new URL(MISSPACE_URL);
		url.searchParams.set('from', host);
		return url.toString();
	}
	const bg = (color: string | null) =>
		`linear-gradient(160deg, ${color ?? '#86b300'}, color-mix(in srgb, ${color ?? '#86b300'} 55%, #000))`;
</script>

<section class="likes">
	<h1>{mode === 'liked' ? 'いいね' : 'よくないね'} <span class="count">{matches.length}</span></h1>
	{#if matches.length === 0}
		<div class="empty">
			<p class="big"><Icon name={mode === 'liked' ? 'heart' : 'x'} size={40} /></p>
			{#if mode === 'liked'}
				<p>まだありません。いいねしたサーバーがここに残ります。</p>
			{:else}
				<p>まだありません。よくないねしたサーバーがここに残ります。</p>
			{/if}
		</div>
	{:else}
		<p class="muted">
			{#if mode === 'liked'}登録するかは自分の目で確かめて。{:else}「戻す」でまたデッキに出ます。{/if}
		</p>
		<ul class="grid">
			{#each matches as m (m.server.host)}
				<li class="tile" style:background={bg(m.server.themeColor)}>
					{#if m.server.bannerUrl}
						<img class="photo" src={m.server.bannerUrl} alt="" loading="lazy" decoding="async" />
					{/if}
					<div class="scrim"></div>
					<span class="score" class:dim={mode === 'passed'}><Icon name="heart" size={12} filled /> {m.score}%</span>
					<button class="open" onclick={() => (detail = m)} aria-label="{m.server.name ?? m.server.host} の詳細">
						<span class="label">
							{#if m.server.iconUrl}
								<img class="icon" src={m.server.iconUrl} alt="" width="28" height="28" loading="lazy" />
							{/if}
							<span class="names">
								<b>{m.server.name ?? m.server.host}</b>
								<small>{m.server.host}</small>
							</span>
						</span>
					</button>
					<div class="actions">
						<a href="https://{m.server.host}/" target="_blank" rel="noopener">見る</a>
						<a href={misspaceLink(m.server.host)} target="_blank" rel="noopener">連合</a>
						<button onclick={() => onremove(m)}>{removeLabel}</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>

{#if detail}
	{@const host = detail.server.host}
	<Sheet label="{detail.server.name ?? host} の詳細" onclose={() => (detail = null)}>
		<ServerDetails match={detail} full>
			{#snippet actions()}
				<a class="btn secondary" href="https://{host}/" target="_blank" rel="noopener">サーバーを見る</a>
				<button
					class="btn secondary"
					onclick={() => {
						if (detail) onremove(detail);
						detail = null;
					}}
				>
					{removeLabel}
				</button>
			{/snippet}
		</ServerDetails>
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
	.actions a + a,
	.actions button {
		border-left: 1px solid rgba(255, 255, 255, 0.2);
	}
</style>
