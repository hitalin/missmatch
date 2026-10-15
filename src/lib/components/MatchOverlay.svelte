<script lang="ts">
	import type { Match } from '$lib/types';
	let { match, onclose }: { match: Match; onclose: () => void } = $props();
	const s = $derived(match.server);
</script>

<div class="overlay" role="dialog" aria-modal="true" aria-label="マッチしました">
	<div class="inner">
		<p class="title">マッチしました！</p>
		<p class="sub">相性 {match.score}%。{s.name ?? s.host} と気が合いそうです。</p>
		<div class="faces">
			<div class="face you">あなた</div>
			<span class="heart">♥</span>
			{#if s.iconUrl}
				<img src={s.iconUrl} alt="" width="84" height="84" />
			{:else}
				<div class="face">{(s.name ?? s.host).slice(0, 1)}</div>
			{/if}
		</div>
		<a class="btn primary block" href="https://{s.host}/" target="_blank" rel="noopener">サーバーを見に行く</a>
		<button class="btn ghost block light" onclick={onclose}>スワイプを続ける</button>
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 60;
		display: grid;
		place-items: center;
		padding: 24px;
		background:
			radial-gradient(circle at 20% 10%, rgba(134, 179, 0, 0.55), transparent 50%),
			radial-gradient(circle at 80% 90%, rgba(255, 77, 94, 0.45), transparent 50%),
			rgba(10, 12, 10, 0.92);
		color: #fff;
		animation: fade 0.25s ease-out;
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
	}
	.inner {
		width: min(100%, 360px);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 14px;
		text-align: center;
		animation: pop 0.4s cubic-bezier(0.2, 1.4, 0.4, 1);
	}
	@keyframes pop {
		from {
			transform: scale(0.7) translateY(30px);
			opacity: 0;
		}
	}
	.title {
		margin: 0;
		font-size: 2.4rem;
		font-weight: 900;
		font-style: italic;
		letter-spacing: -0.02em;
		background: linear-gradient(90deg, #c9ec5a, #86b300);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}
	.sub {
		margin: 0;
		opacity: 0.85;
	}
	.faces {
		display: flex;
		align-items: center;
		gap: 14px;
		margin: 10px 0 18px;
	}
	.faces img,
	.face {
		width: 84px;
		height: 84px;
		border-radius: 50%;
		object-fit: cover;
		border: 3px solid #fff;
		display: grid;
		place-items: center;
		font-weight: 900;
		font-size: 1.6rem;
		background: var(--accent);
	}
	.face.you {
		font-size: 0.85rem;
		background: #333;
	}
	.heart {
		color: var(--accent);
		font-size: 2rem;
		animation: beat 0.9s ease-in-out infinite;
	}
	@keyframes beat {
		50% {
			transform: scale(1.25);
		}
	}
	.light {
		color: rgba(255, 255, 255, 0.8);
	}
</style>
