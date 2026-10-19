<script lang="ts">
	import type { Snippet } from 'svelte';
	import { MAX_INTENT_LENGTH } from '$lib/intent';
	import Icon from './Icon.svelte';
	import Spinner from './Spinner.svelte';

	// 言葉を入れる箱（yamix の ChatInput）: 角丸の箱に textarea、上に補助行、下端の左に道具・右に丸い送信。
	// Enter で送信、Shift+Enter で改行。高さは中身に合わせて伸びる
	let {
		value = $bindable(''),
		placeholder,
		label,
		disabled = false,
		minRows = 1,
		autofocus = false,
		fill = false,
		onsubmit,
		onsettle,
		top,
		left
	}: {
		value?: string;
		placeholder: string;
		label: string; // スクリーンリーダー向けの名前
		disabled?: boolean;
		minRows?: number;
		autofocus?: boolean;
		fill?: boolean; // デスクトップで親の高さいっぱいに広げる（textarea が残りを埋める）
		onsubmit: (text: string) => void;
		onsettle?: (text: string) => void; // 打つ手が止まった（変換中でない）ときに、いまの言葉を知らせる
		top?: Snippet; // 箱の上の行（選択肢など）
		left?: Snippet; // 下端の左（補助ボタン）
	} = $props();

	const MAX_HEIGHT = 160;
	const SETTLE_MS = 600; // この間入力が無ければ「打ち終わった」とみなす
	const id = $props.id();
	let el = $state<HTMLTextAreaElement | null>(null);
	const ready = $derived(value.trim().length >= 2 && !disabled);

	const wide = () => fill && window.matchMedia('(min-width: 900px)').matches;
	function autosize() {
		if (!el) return;
		if (wide()) {
			el.style.height = '';
			return;
		}
		el.style.height = 'auto';
		el.style.height = `${Math.min(MAX_HEIGHT, el.scrollHeight)}px`;
	}
	$effect(() => {
		value; // 値が変わったら高さを合わせる（例文を入れたときなど）
		autosize();
	});

	// 手が止まったら知らせる。IME の変換中は確定してから数え直す
	let settleTimer: ReturnType<typeof setTimeout> | undefined;
	let composing = false;
	function scheduleSettle() {
		clearTimeout(settleTimer);
		if (!onsettle) return;
		settleTimer = setTimeout(() => {
			if (!composing) onsettle?.(value.trim().slice(0, MAX_INTENT_LENGTH));
		}, SETTLE_MS);
	}
	$effect(() => () => clearTimeout(settleTimer));

	function submit() {
		clearTimeout(settleTimer);
		const t = value.trim().slice(0, MAX_INTENT_LENGTH);
		if (t.length < 2 || disabled) return;
		onsubmit(t);
	}
	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
			e.preventDefault();
			submit();
		}
	}
</script>

<div class="box" class:disabled class:fill>
	{#if top}
		<div class="top">{@render top()}</div>
	{/if}
	<label class="sr-only" for={id}>{label}</label>
	<!-- svelte-ignore a11y_autofocus -->
	<textarea
		{id}
		bind:this={el}
		bind:value
		rows={minRows}
		maxlength={MAX_INTENT_LENGTH}
		{placeholder}
		{disabled}
		{autofocus}
		enterkeyhint="send"
		onkeydown={onkeydown}
		oninput={() => {
			autosize();
			scheduleSettle();
		}}
		oncompositionstart={() => (composing = true)}
		oncompositionend={() => {
			composing = false;
			scheduleSettle();
		}}
	></textarea>
	<div class="tools">
		<div class="left">{#if left}{@render left()}{/if}</div>
		<button class="send" type="button" disabled={!ready} aria-label="送る" onclick={submit}>
			{#if disabled}<Spinner size={16} label="読み取っています" />{:else}<Icon name="send" size={16} />{/if}
		</button>
	</div>
</div>

<style>
	.box {
		display: flex;
		flex-direction: column;
		background: var(--panel);
		border: 1.5px solid var(--border);
		border-radius: 18px;
		box-shadow: var(--shadow);
		transition: border-color 0.15s;
	}
	.box:focus-within {
		border-color: var(--accent);
	}
	@media (min-width: 900px) {
		.box.fill {
			flex: 1;
		}
		.box.fill textarea {
			flex: 1;
			min-height: 3em;
		}
	}
	.box.disabled {
		opacity: 0.7;
	}
	.top {
		padding: 10px 12px 0;
	}
	textarea {
		display: block;
		width: 100%;
		resize: none;
		font: inherit;
		font-size: 0.98rem;
		line-height: 1.5;
		background: none;
		border: none;
		color: var(--fg);
		padding: 10px 14px 2px;
	}
	textarea:focus {
		outline: none;
	}
	.tools {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 0 6px 6px 14px;
	}
	.left {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
		font-size: 0.74rem;
		color: var(--fg-muted);
	}
	.send {
		--spinner-color: #fff;
		width: 30px;
		height: 30px;
		border-radius: 50%;
		border: none;
		background: var(--accent-grad);
		box-shadow: var(--shadow-accent);
		color: #fff;
		cursor: pointer;
		display: grid;
		place-items: center;
		flex-shrink: 0;
		transition:
			transform 0.15s,
			background 0.15s;
	}
	.send:hover:not(:disabled) {
		transform: translateY(-1px);
	}
	.send:disabled:not(:has(.spinner)) {
		opacity: 0.35;
	}
	.send:disabled {
		box-shadow: none;
		cursor: not-allowed;
	}
</style>
