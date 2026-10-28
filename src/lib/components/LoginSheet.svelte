<script lang="ts">
	import Sheet from './Sheet.svelte';
	import Spinner from './Spinner.svelte';

	// Misskey のサーバーを入れて MiAuth に送る。許可後は /auth/callback に戻ってきてログイン状態になる
	let { onclose, next = '/' }: { onclose: () => void; next?: string } = $props();

	let host = $state('');
	let busy = $state(false);
	let error = $state('');

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!host.trim() || busy) return;
		busy = true;
		error = '';
		try {
			const res = await fetch('/api/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ host, next })
			});
			const data = (await res.json()) as { url?: string; error?: string };
			if (!res.ok || !data.url) {
				error = data.error ?? 'ログインを始められませんでした';
				busy = false;
				return;
			}
			window.location.href = data.url;
		} catch {
			error = '通信に失敗しました';
			busy = false;
		}
	}
</script>

<Sheet label="Misskey でログイン" {onclose}>
	<form class="login" onsubmit={submit}>
		<h2>Misskey でログイン</h2>
		<p class="muted">使っているサーバーのドメインを入れると、そのサーバーの許可画面に移ります。</p>
		<label class="field" class:error={!!error}>
			<span class="prefix">https://</span>
			<!-- svelte-ignore a11y_autofocus -->
			<input
				type="text"
				bind:value={host}
				placeholder="misskey.io"
				autocomplete="url"
				autocapitalize="none"
				spellcheck="false"
				disabled={busy}
				autofocus
			/>
		</label>
		{#if error}<p class="err">{error}</p>{/if}
		<button class="btn primary block" type="submit" disabled={busy || !host.trim()}>
			{#if busy}<Spinner label="接続中" size={16} />接続中{:else}ログイン{/if}
		</button>
		<p class="note muted">求める権限はアカウント情報の読み取りだけです。投稿は行いません。</p>
	</form>
</Sheet>

<style>
	.login {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding-top: 8px;
	}
	h2 {
		margin: 0;
		font-size: 1.15rem;
	}
	p {
		margin: 0;
		font-size: 0.86rem;
		line-height: 1.55;
	}
	.field {
		display: flex;
		align-items: center;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--panel-2);
		overflow: hidden;
		transition: border-color 0.15s;
	}
	.field:focus-within {
		border-color: var(--accent);
	}
	.field.error {
		border-color: var(--nope);
	}
	.prefix {
		padding: 0 4px 0 16px;
		font-family: ui-monospace, monospace;
		font-size: 0.86rem;
		color: var(--fg-muted);
		user-select: none;
	}
	input {
		flex: 1;
		min-width: 0;
		padding: 12px 16px 12px 0;
		border: none;
		background: none;
		color: var(--fg);
		font: inherit;
		font-size: 0.95rem;
		outline: none;
	}
	.err {
		color: var(--nope);
		font-weight: 700;
	}
	.note {
		font-size: 0.76rem;
	}
</style>
