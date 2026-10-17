# missmatch

**Misskey サーバーとマッチング**

探している場所を言葉で伝えると、日本語の Misskey サーバーから合いそうなものをマッチングアプリのように提案します。

## コンセプト

Misskey のサーバー選びは、説明文だけでは雰囲気が分かりにくく、数も多くて迷います。

- 自分のやりたいことができる場所は？
- 空気感や人の多さは合いそう？
- 登録の条件やルールは？

missmatch は、サーバーの説明文・ルール・最近の投稿を **Cloudflare Workers AI の Clef** で読み取り、あなたの言葉と噛み合う順に並べます。登録するかどうかは自分の目で確かめてください。

[misspace](https://github.com/hitalin/misspace)（連合グラフの可視化）の姉妹プロジェクトです。misspace が「見せて選んでもらう」ツールなら、missmatch は「こちらから勧める」ツールです。

## 機能

### さがす

- 「病み垢を置ける、静かで干渉が少ない場所」のように自由に書いて送る
- 合う順にカードが並ぶ。右スワイプでいいね、左でよくないね
- 「もっと絞る」で言葉を足すと読み直す。読み取れなかった点（規模・空気感など）は選択肢で聞き返す
- いいね / よくないねから好みを学び、次の束の並びに反映

### さがした言葉

- 言葉ごとに検索として残り、サイドバーから戻れる
- いいね・よくないね・学んだ好みは検索ごとに別

### あなた

- 年齢、毎日いる人の数、R-18 の投稿、話したいこと、空気感、規模と流速
- 絶対条件: 登録のしかた / メアド不要 / 広告なし / LTL・GTL / ノート検索 / 翻訳 / チャット / 動画 / ドライブ容量 / 本家のみ / 最新版 / 利用規約 / プライバシーポリシー

### 判定の表示

カードの横に、Clef が読み取った空気感・ルール・初心者の入りやすさ・話題の強さと、言葉との噛み合いを表示します。

## 対象

- [joinmisskey](https://join.misskey.page/) に登録されている日本語の Misskey サーバー（既定は新規登録受付中と生きている招待制の約 185 件。停止中を含めると約 580 件）
- ローカル TL を公開していないサーバーには投稿を取りに行かず、説明文とルールだけで判定します

## やらないこと

- **審判にならない**: 「良いサーバー」「悪いサーバー」を決めつけない
- **個人を追わない**: 投稿はサーバーの雰囲気を測るためだけに読み、ユーザー単位では扱わない
- **データを預からない**: プロフィールと検索はブラウザにだけ保存する

## 技術スタック

- **Framework**: SvelteKit 5 (Svelte 5)
- **AI**: Cloudflare Workers AI (Clef)
- **Data Source**: joinmisskey / 各サーバーの公開 API
- **Deploy**: Cloudflare Workers + KV
- **Language**: TypeScript

## 開発

```bash
pnpm install
pnpm dev     # AI はリモート実行（課金対象）、KV はローカル
pnpm test
```

デプロイと事前計算:

```bash
wrangler kv namespace create VIBE_KV   # id を wrangler.toml に書く
wrangler secret put WARM_SECRET
pnpm run deploy   # pnpm deploy は pnpm 本体のコマンドに取られる

# 雰囲気を事前計算
curl -X POST "https://<host>/api/warm?limit=50" -H "Authorization: Bearer $WARM_SECRET"
```

精度の評価（Clef 実機を叩くので課金対象）:

```bash
# 代表的な言葉 21 個で /api/intent を叩き、上位 5 件に期待したサーバーが入る割合を出す
EVAL_BASE_URL=https://<host> EVAL_LABEL=before pnpm eval
# 変更後に、前回と比べる
EVAL_BASE_URL=https://<host> EVAL_LABEL=after EVAL_COMPARE=src/eval/results/before.json pnpm eval
```

評価セットは [src/eval/cases.ts](src/eval/cases.ts)。結果は `src/eval/results/` に残ります（git には入れない）。

設計の根拠は [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) にあります。

## ライセンス

AGPL-3.0
