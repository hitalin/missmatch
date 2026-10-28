<svelte:head><title>サーバー運営者の方へ - みすまっち</title></svelte:head>
<main class="doc">
	<a href="/">← みすまっち</a>
	<h1>サーバー運営者の方へ</h1>
	<p>みすまっちが、あなたのサーバーに対して何を・いつ・どう取りに行くかを書きます。</p>
	<h2>サーバー探し</h2>
	<ul>
		<li>joinmisskey の一覧と、各サーバーの <code>/api/meta</code>、ローカルタイムライン（未認証、100 件）を 1 日 1 回程度読み、サーバーの雰囲気を判定します。投稿は保存しません</li>
		<li>ローカルタイムラインを公開していないサーバーには取りに行きません</li>
	</ul>
	<h2>マッチング（参加した人だけ）</h2>
	<ul>
		<li>参加した本人のトークンで、本人のサーバーに <code>i</code>・<code>users/notes</code>・<code>users/following</code> を叩きます（参加時と 7 日おき）。参加していない人のデータは読みません</li>
		<li>他のサーバーへ未認証で取りに行くことはありません。カードに出すノートも、本人のトークンで本人のサーバーから取ります</li>
		<li>User-Agent は <code>missmatch/1.0 (+https://github.com/hitalin/missmatch; match@hital.in)</code> です</li>
	</ul>
	<h2>外してほしいとき</h2>
	<p>サーバー単位で対象から外せます。match@hital.in にサーバー名を送ってください。</p>
</main>
<style>
	.doc { max-width: 640px; margin: 0 auto; padding: 24px 16px 48px; font-size: 0.92rem; line-height: 1.7; }
	.doc h1 { font-size: 1.3rem; margin: 12px 0 0; }
	.doc h2 { font-size: 1rem; margin: 20px 0 4px; }
	.doc p, .doc ul { margin: 6px 0; }
	code { font-size: 0.85em; }
</style>
