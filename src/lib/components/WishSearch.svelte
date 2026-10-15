<script lang="ts">
	import { MAX_INTENT_LENGTH } from '$lib/intent';

	// 「どんな場所を探している？」の検索ボックス。入力して検索すると Clef が説明文と突き合わせ、デッキが並び替わる
	let {
		wish,
		applied,
		reading = false,
		onsearch,
		onclear
	}: {
		wish: string; // 現在反映されている一言（空なら未適用）
		applied: boolean;
		reading?: boolean;
		onsearch: (text: string) => void;
		onclear: () => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	let text = $state(wish);
	// 外から一言が変わったら（検索の反映・✕ で外す）入力欄も合わせる
	$effect(() => {
		text = wish;
	});
	const canSearch = $derived(text.trim().length >= 2 && !reading && text.trim() !== wish.trim());

	function submit(e: SubmitEvent) {
		e.preventDefault();
		if (canSearch) onsearch(text.trim());
	}
</script>

<form class="wish" onsubmit={submit} role="search">
	<label class="sr-only" for="wish-input">どんな場所を探している？</label>
	<div class="box" class:applied>
		<span class="icon" aria-hidden="true">✦</span>
		<input
			id="wish-input"
			type="search"
			bind:value={text}
			maxlength={MAX_INTENT_LENGTH}
			placeholder="どんな場所を探している？（例: 病み垢を置ける静かな場所）"
			enterkeyhint="search"
			autocomplete="off"
		/>
		{#if reading}
			<span class="spin" aria-label="読み取り中"></span>
		{:else if applied && text.trim() === wish.trim()}
			<button
				type="button"
				class="clear"
				aria-label="一言を外す"
				onclick={() => {
					text = '';
					onclear();
				}}
			>
				✕
			</button>
		{:else}
			<button type="submit" class="go" disabled={!canSearch}>検索</button>
		{/if}
	</div>
	{#if applied && !reading}
		<p class="status">「{wish}」に合う順に並べています</p>
	{/if}
</form>

<style>
	.wish {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.box {
		display: flex;
		align-items: center;
		gap: 8px;
		background: var(--panel);
		border: 1.5px solid var(--border);
		border-radius: 999px;
		padding: 6px 8px 6px 14px;
		box-shadow: var(--shadow);
	}
	.box:focus-within {
		border-color: var(--accent);
	}
	.box.applied {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.icon {
		color: var(--accent);
		font-size: 0.9rem;
	}
	input {
		flex: 1;
		min-width: 0;
		font: inherit;
		font-size: 0.95rem;
		background: none;
		border: none;
		color: var(--fg);
		padding: 6px 0;
	}
	input:focus {
		outline: none;
	}
	input::-webkit-search-cancel-button {
		display: none;
	}
	.go,
	.clear {
		font: inherit;
		font-weight: 800;
		font-size: 0.85rem;
		border: none;
		border-radius: 999px;
		padding: 8px 14px;
		cursor: pointer;
	}
	.go {
		background: var(--accent);
		color: #fff;
	}
	.go:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.clear {
		background: var(--panel);
		color: var(--fg-muted);
		width: 34px;
		height: 34px;
		padding: 0;
	}
	.spin {
		width: 18px;
		height: 18px;
		margin: 8px;
		border-radius: 50%;
		border: 2px solid var(--border);
		border-top-color: var(--accent);
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.status {
		margin: 0;
		padding-left: 14px;
		font-size: 0.75rem;
		color: var(--accent-fg);
		font-weight: 700;
	}
</style>
