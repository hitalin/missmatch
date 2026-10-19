<script lang="ts">
	import type { AskAxis } from '$lib/intent';
	import type { Search } from '$lib/search';
	import AskChips from './AskChips.svelte';
	import PromptBox from './PromptBox.svelte';

	// 画面の下に貼り付く入力欄（ChatGPT の composer）。デッキの下にあって、スクロールしても隠れない。
	// 読み取れなかった軸の選択肢は箱の上の行に出す
	let {
		value = $bindable(''),
		search,
		reading,
		asks,
		onrefine,
		onask,
		onsettle
	}: {
		value?: string; // 入力中の言葉（デッキが作り直されても消えないよう親が持つ）
		search: Search;
		reading: boolean;
		asks: AskAxis[];
		onrefine: (text: string) => void;
		onask: (axis: AskAxis, choice: string | null) => void;
		onsettle?: (text: string) => void; // 打つ手が止まったときの言葉（送られる前に読み取りを始めるため）
	} = $props();

	function submit(t: string) {
		onrefine(t);
		value = '';
	}
</script>

<div class="composer">
	<PromptBox
		bind:value
		label={search.query ? 'もっと絞る' : '言葉を入れて絞る'}
		placeholder={search.query ? 'もっと絞る（例: 小さめ、イラストの話が多い）' : '言葉を入れて絞る'}
		disabled={reading}
		fill
		onsubmit={submit}
		{onsettle}
	>
		{#snippet top()}
			{#if !reading && asks.length > 0}
				<AskChips axes={asks} onpick={onask} />
			{/if}
		{/snippet}
		{#snippet left()}
			<span>Enter で送る · Shift+Enter で改行</span>
		{/snippet}
	</PromptBox>
</div>

<style>
	.composer {
		position: sticky;
		bottom: calc(var(--nav-h) + env(safe-area-inset-bottom));
		z-index: 5;
		margin-top: auto;
		padding: 10px 0 6px;
		background: linear-gradient(to bottom, transparent, var(--bg) 14px);
	}
	/* デスクトップは貼り付けず、デッキの下に置く（判定ボタンに被らない） */
	@media (min-width: 900px) {
		.composer {
			position: static;
			flex: 1;
			display: flex;
			flex-direction: column;
			padding: 0;
			background: none;
		}
	}
</style>
