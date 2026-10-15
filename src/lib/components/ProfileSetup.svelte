<script lang="ts">
	import { QUIZ } from '$lib/quiz';
	import type { QuizAnswers } from '$lib/types';

	let { onsubmit, oncancel }: { onsubmit: (answers: QuizAnswers) => void; oncancel: () => void } =
		$props();

	let step = $state(0);
	let answers = $state<QuizAnswers>({});

	const question = $derived(QUIZ[step]);
	const progress = $derived(Math.round(((step + 1) / QUIZ.length) * 100));

	function choose(value: string) {
		answers = { ...answers, [question.id]: value };
		if (step < QUIZ.length - 1) {
			step += 1;
		} else {
			onsubmit(answers);
		}
	}

	function back() {
		if (step === 0) oncancel();
		else step -= 1;
	}
</script>

<section class="profile">
	<div class="top">
		<button class="back" onclick={back} aria-label="戻る">‹</button>
		<div class="progress" aria-hidden="true"><div style="width: {progress}%"></div></div>
		<span class="count">{step + 1}/{QUIZ.length}</span>
	</div>

	<p class="eyebrow">あなたのプロフィール</p>
	<h2>{question.title}</h2>

	<div class="options">
		{#each question.options as option (option.value)}
			<button
				class="chip"
				class:selected={answers[question.id] === option.value}
				onclick={() => choose(option.value)}
			>
				<span class="label">{option.label}</span>
				{#if option.hint}<span class="hint">{option.hint}</span>{/if}
			</button>
		{/each}
	</div>
</section>

<style>
	.profile {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.top {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.back {
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: 50%;
		width: 36px;
		height: 36px;
		font-size: 1.4rem;
		line-height: 1;
		cursor: pointer;
	}
	.progress {
		flex: 1;
		height: 8px;
		background: var(--surface-2);
		border-radius: 4px;
		overflow: hidden;
	}
	.progress > div {
		height: 100%;
		background: var(--accent);
		transition: width 0.3s;
	}
	.count {
		color: var(--muted);
		font-size: 0.85rem;
		font-variant-numeric: tabular-nums;
	}
	.eyebrow {
		margin: 16px 0 0;
		color: var(--accent-text);
		font-weight: 800;
		font-size: 0.8rem;
		letter-spacing: 0.08em;
	}
	h2 {
		margin: 0 0 8px;
		font-size: 1.5rem;
	}
	.options {
		display: grid;
		gap: 10px;
	}
	.chip {
		font: inherit;
		text-align: left;
		background: var(--surface);
		color: var(--text);
		border: 2px solid var(--border);
		border-radius: 16px;
		padding: 14px 18px;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: 2px;
		box-shadow: var(--shadow);
		transition:
			transform 0.1s,
			border-color 0.15s;
	}
	.chip:hover {
		border-color: var(--accent);
	}
	.chip:active {
		transform: scale(0.98);
	}
	.chip.selected {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.label {
		font-weight: 700;
	}
	.hint {
		font-size: 0.8rem;
		color: var(--muted);
	}
</style>
