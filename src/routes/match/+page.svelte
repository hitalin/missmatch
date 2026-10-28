<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import LoginSheet from '$lib/components/LoginSheet.svelte';
	import { GENRE_LABELS, GENRES, type Genre } from '$lib/types';
	import { MAX_CHIPS } from '$lib/people';

	// 人を見つける（docs/PEOPLE.md v6.4）の入口。P1-a: 参加と人数表示。デッキは参加者が opensAt 人になるまで開かない
	let { data } = $props();

	let loginOpen = $state(false);
	let adult = $state(false);
	let aiConsent = $state(false);
	let chips = $state<Genre[]>([]);
	let profileOnly = $state(false);
	let busy = $state(false);
	let error = $state('');
	let warning = $state<string[]>([]);

	const REASONS: Record<string, string> = {
		notes: '公開のノートが 10 件に足りません。公開（CW なし・連合あり）のノートが 10 件たまったら参加できます。',
		'account-age': 'アカウントを作ってから 30 日たつと参加できます。',
		adult: '18 歳以上であることを確認してください。',
		minor: '参加条件を満たしていません。',
		seeking: '恋人・出会いを求める内容が自己紹介やノートにあるため参加できません。恋愛を扱わないサービスです。',
		ads: '宣伝が中心のアカウントは参加できません。',
		banned: '参加できません。',
		cap: 'いまは参加の上限に達しています。',
		'server-cap': 'あなたのサーバーからの参加がいまは上限に達しています。'
	};

	function toggleChip(g: Genre) {
		if (chips.includes(g)) chips = chips.filter((c) => c !== g);
		else if (chips.length < MAX_CHIPS) chips = [...chips, g];
	}

	async function join() {
		busy = true;
		error = '';
		try {
			const res = await fetch('/api/people/join', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ adultChecked: adult, aiConsent, chips, profileOnly })
			});
			const r = (await res.json()) as { ok?: boolean; reason?: string; noteIds?: string[]; warning?: string[]; error?: string };
			if (!res.ok || !r.ok) {
				error = REASONS[r.reason ?? ''] ?? '参加できませんでした。時間をおいて試してください。';
				if (r.noteIds?.length) error += ` 該当ノート: ${r.noteIds.map((id) => `https://${data.user?.host}/notes/${id}`).join(' ')}`;
				return;
			}
			warning = r.warning ?? [];
			await invalidateAll();
		} catch {
			error = '通信に失敗しました';
		} finally {
			busy = false;
		}
	}
	async function leave() {
		if (!confirm('名簿から外れます。フォロー関係は Misskey にそのまま残ります。')) return;
		busy = true;
		await fetch('/api/people/leave', { method: 'POST' });
		await invalidateAll();
		busy = false;
	}
	const avatar = (host: string, username: string) => `https://${host}/avatar/@${encodeURIComponent(username)}`;
</script>

<svelte:head>
	<title>マッチング - みすまっち</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="wrap">
	<header class="top">
		<a class="logo" href="/"><img src="/logo.svg" alt="" width="26" height="26" /><span>みすまっち</span></a>
		<span class="muted">マッチング（β）</span>
	</header>

	<section class="panel hero">
		<h1>話が合いそうな人を、Misskey のプロフィールで</h1>
		<p>参加した人同士が、お互いのプロフィールと公開ノートをカードで見て「いいね」を付け、Misskey でフォローします。相互フォローになったらマッチ。<b>出会い・恋愛を目的としたサービスではありません。</b></p>
		<p class="count"><b>いま {data.count} 人</b>{#if data.count < data.opensAt}（{data.opensAt} 人になったらカードが開きます）{:else}（カードは次の段階で開きます）{/if}</p>
		{#if data.avatars.length > 0}
			<ul class="avatars" aria-label="参加している人">
				{#each data.avatars as a (a.host + a.username)}
					<li><img src={avatar(a.host, a.username)} alt="" width="36" height="36" referrerpolicy="no-referrer" loading="lazy" /></li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if !data.user}
		<section class="panel block">
			<h2>はじめる</h2>
			<p class="muted">参加できるのは joinmisskey に掲載されている日本語の Misskey サーバーのアカウントです。</p>
			<button class="btn primary block" onclick={() => (loginOpen = true)}>Misskey でログインして参加する</button>
		</section>
	{:else if data.me}
		<section class="panel block">
			<h2>参加しています</h2>
			<p>
				<img class="me" src={avatar(data.me.host, data.me.username)} alt="" width="40" height="40" referrerpolicy="no-referrer" />
				<b>{data.me.name}</b> <span class="muted">@{data.me.username}@{data.me.host}</span>
			</p>
			{#if data.me.hidden}
				<p class="warn">いまはカードに出ていません（{data.me.hidden.kind === 'report' ? '通報を確認中' : '内容の確認が必要'}）。{#if data.me.hidden.noteIds.length}該当ノート: {#each data.me.hidden.noteIds as id (id)}<a href="https://{data.me.host}/notes/{id}" target="_blank" rel="noopener">{id}</a> {/each}{/if}</p>
			{/if}
			{#if data.me.warning || warning.length}
				<p class="warn">恋人・出会いを求めているように読めるノートが 1 件あります。消すと次の確認で警告が消えます: {#each data.me.warning?.noteIds ?? warning as id (id)}<a href="https://{data.me.host}/notes/{id}" target="_blank" rel="noopener">{id}</a> {/each}</p>
			{/if}
			<dl class="facts">
				<dt>話題</dt><dd>{data.me.chips.length ? data.me.chips.map((c) => GENRE_LABELS[c]).join('、') : '（ノートから推定）'}</dd>
				<dt>読んだノート</dt><dd>{data.me.estimate?.sampleCount ?? 0} 件（{data.me.estimate ? new Date(data.me.estimate.at).toLocaleDateString('ja-JP') : '未'}）。7 日おきに読み直します</dd>
				<dt>カードに出すノート</dt><dd>{data.me.profileOnly ? 'プロフィールだけ' : `反応の多い ${data.me.noteIds.length} 件`}</dd>
				<dt>共通のフォロー先</dt><dd>{data.me.followingPublic ? '計算します' : 'フォロー一覧が公開でないため計算しません'}</dd>
			</dl>
			<button class="btn secondary" onclick={leave} disabled={busy}>やめる（記録を消す）</button>
		</section>
	{:else}
		<section class="panel block">
			<h2>参加する</h2>
			<p class="muted">参加すると、次のことが起きます。</p>
			<ul class="consent">
				<li>あなたの Misskey の<b>プロフィール</b>（bio・プロフィール欄・固定ノート・アバター）と、反応の多い<b>公開ノート 3 件</b>を、参加者全員のカードに出します</li>
				<li>参加している間、<b>直近 50 件の公開ノート</b>を 7 日おきに AI（米国 Cloudflare の Workers AI）が読んで話題を推定し、並べ替えに使います。推定した内容は表示せず、ノートは保存しません。<b>CW 付きと連合なしのノートは読みません</b></li>
				<li>あなたの<b>フォロー一覧</b>を 1 日保存し、「共通のフォロー先 n 人」として他の参加者に見せます（フォロー一覧が公開のときだけ）</li>
				<li>保存するのは参加の記録・推定した数値・フォロー一覧・暗号化したトークンだけです。<a href="/match/privacy">プライバシーポリシー</a>・<a href="/match/terms">利用規約</a></li>
				<li>「やめる」でその場で消えます。Misskey でアプリ連携を解除しても外れます</li>
			</ul>
			{#if data.self?.preventAiLearning}
				<p class="warn">あなたは Misskey で「AI による学習を防止」をオンにしています。参加すると missmatch はあなたの公開ノートを AI に読ませます（学習には使われません）。嫌なら参加しないでください。</p>
			{/if}
			<label class="check"><input type="checkbox" bind:checked={aiConsent} /> 上の内容に同意します</label>
			<label class="check"><input type="checkbox" bind:checked={adult} /> 私は 18 歳以上です{#if data.self && !data.self.hasBirthday}<small class="muted">（Misskey の誕生日は未設定なので自己申告です）</small>{/if}</label>
			<div class="field">
				<span class="label">話したいこと（任意、{MAX_CHIPS} つまで。選ばなければノートから推定します）</span>
				<ul class="chips">
					{#each GENRES as g (g)}
						<li><button class="chip" class:on={chips.includes(g)} aria-pressed={chips.includes(g)} onclick={() => toggleChip(g)}>{GENRE_LABELS[g]}</button></li>
					{/each}
				</ul>
			</div>
			<label class="check"><input type="checkbox" bind:checked={profileOnly} /> カードにはプロフィールだけ出す（ノートは出さない）</label>
			{#if error}<p class="err">{error}</p>{/if}
			<button class="btn primary block" onclick={join} disabled={busy || !aiConsent || !adult}>{busy ? '確認しています…' : '参加する'}</button>
			<p class="muted small">条件: 公開ノート 10 件以上、アカウント作成から 30 日以上。恋人・出会いを求める内容がある場合は参加できません。</p>
		</section>
	{/if}

	<footer class="foot muted">
		<a href="/match/terms">利用規約</a> · <a href="/match/privacy">プライバシーポリシー</a> · <a href="/for-admins">サーバー運営者の方へ</a>
	</footer>
</main>

{#if loginOpen}
	<LoginSheet onclose={() => (loginOpen = false)} next="/match" />
{/if}

<style>
	.wrap {
		max-width: 560px;
		margin: 0 auto;
		padding: 16px 16px calc(32px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 4px 2px;
	}
	.logo {
		display: flex;
		align-items: center;
		gap: 10px;
		color: var(--accent);
		font-size: 1.15rem;
		font-weight: 700;
		text-decoration: none;
	}
	.panel {
		padding: 18px 20px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	h1 {
		margin: 0;
		font-size: 1.3rem;
	}
	h2 {
		margin: 0;
		font-size: 1.05rem;
	}
	p {
		margin: 0;
		font-size: 0.9rem;
		line-height: 1.6;
	}
	.count {
		font-size: 1rem;
	}
	.avatars {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.avatars img,
	.me {
		border-radius: 50%;
		vertical-align: middle;
		margin-right: 6px;
		object-fit: cover;
	}
	.consent {
		margin: 0;
		padding-left: 1.2em;
		font-size: 0.86rem;
		line-height: 1.6;
	}
	.consent li + li {
		margin-top: 6px;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.9rem;
		font-weight: 700;
	}
	.check small {
		font-weight: 400;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.label {
		font-size: 0.74rem;
		font-weight: 700;
		color: var(--fg-muted);
	}
	.chips {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.facts {
		margin: 0;
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 4px 12px;
		font-size: 0.86rem;
	}
	.facts dt {
		color: var(--fg-muted);
		font-weight: 700;
	}
	.facts dd {
		margin: 0;
	}
	.warn {
		color: var(--nope);
		font-weight: 700;
	}
	.err {
		color: var(--nope);
		font-weight: 700;
		word-break: break-all;
	}
	.small {
		font-size: 0.78rem;
	}
	.foot {
		font-size: 0.78rem;
		text-align: center;
	}
	.foot a {
		color: inherit;
	}
</style>
