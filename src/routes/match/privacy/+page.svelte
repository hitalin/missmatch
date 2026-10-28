<svelte:head><title>プライバシーポリシー（マッチング） - みすまっち</title><meta name="robots" content="noindex" /></svelte:head>
<main class="doc">
	<a href="/match">← マッチングに戻る</a>
	<h1>プライバシーポリシー（マッチング）</h1>
	<p class="date">2026-10-28 制定</p>
	<h2>保存するもの</h2>
	<ul>
		<li>参加の記録: アカウント名（@user@host）、表示名、参加した日時、18 歳以上の確認をした日時、選んだ話題、表示の設定</li>
		<li>推定した数値: 公開ノートから AI が推定した話題の確率、返信の割合、投稿の頻度、読んだ範囲の識別子</li>
		<li>反応の多い公開ノート 3 件の id（本文は保存しません）</li>
		<li>フォロー一覧（アカウント名の集合。1 日で消え、公開設定のときだけ）</li>
		<li>Misskey のアクセストークン（暗号化して保存。7 日おきの再確認と、連携が解除されたときに参加を解くために使います）</li>
		<li>通報の記録</li>
	</ul>
	<h2>保存しないもの</h2>
	<p>ノートの本文、bio、アバターの画像（表示のたびに Misskey から取ります）、他の人のフォロワー一覧、誰をスワイプしたか（お使いのブラウザにだけ残ります）、IP アドレス。</p>
	<h2>利用目的</h2>
	<ul>
		<li>参加者同士のカードの表示と並べ替え（「共通のフォロー先 n 人」の表示を含みます）</li>
		<li>恋愛・出会いの募集、宣伝、18 歳未満の記述の確認</li>
		<li>言葉で絞り込んだときの判定（言葉は 7 日のキャッシュとして保持しますが、誰が送ったかは持ちません）</li>
	</ul>
	<h2>AI の利用</h2>
	<p>推定と確認には米国 Cloudflare, Inc. の Workers AI を使い、プロフィールと公開ノートの本文を送ります。Cloudflare は Workers AI に送られた内容を AI の学習に使わず、処理後に保持しないとしています（<a href="https://developers.cloudflare.com/workers-ai/platform/privacy/" target="_blank" rel="noopener">Workers AI のプライバシー</a>）。CW 付きと連合なしのノートは送りません。</p>
	<h2>第三者への提供</h2>
	<p>上に書いた表示（参加者全員へのカードの表示）以外に、第三者へ提供しません。</p>
	<h2>やめる・消す</h2>
	<p>「やめる」を押すとその場で保存したものを消します。Misskey の設定からアプリ連携を解除した場合も、次の確認時に参加を解きます。アクセストークンは Misskey の「設定 > API」からいつでも失効できます。</p>
	<h2>問い合わせ</h2>
	<p>開示・削除・その他の問い合わせ: match@hital.in（運営者の氏名・住所は、求めに応じて回答します）</p>
</main>
<style>
	.doc { max-width: 640px; margin: 0 auto; padding: 24px 16px 48px; font-size: 0.92rem; line-height: 1.7; }
	.doc h1 { font-size: 1.3rem; margin: 12px 0 0; }
	.doc h2 { font-size: 1rem; margin: 20px 0 4px; }
	.doc p, .doc ul { margin: 6px 0; }
	.date { color: var(--fg-muted); font-size: 0.8rem; }
</style>
