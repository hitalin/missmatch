# missmatch

**Misskey おすすめサーバー診断**

マッチングアプリの UI で、あなたに合う日本語 Misskey サーバーと出会えます。

1. **プロフィール作成**: 8 つの質問に答える
2. **スワイプ**: 各サーバーの説明文・ルール・最近の投稿から読み取った **雰囲気** をもとに、相性の良い順にカードで提示。右で ♥、左で ✕
3. **マッチ**: 相性 70% 以上のサーバーに ♥ を送ると「マッチしました！」。いいねしたサーバーは一覧に残り、本体や misspace の連合グラフへ飛べます

[misspace](https://github.com/hitalin/misspace)（連合グラフの可視化）の姉妹プロジェクトです。
misspace が「情報を見せて自分で選ぶ」ツールなのに対し、missmatch は「こちらから候補を勧める」ツールです。

## 仕組み

```
joinmisskey instances.json ──→ 正規化 (ServerInfo)
                                   │
診断回答 ──→ Preference ──→ hardFilter ──→ 判定済み全件 + 未判定は活発な順に 40 件
                                   │
                        各サーバーのローカル TL を 30 件サンプリング
                                   │
                        Cloudflare Workers AI (Clef) に質問 ──→ VibeProfile（KV に 7 日キャッシュ）
                                   │
                        Preference × (静的属性 + VibeProfile) を軸ごとに採点 ──→ 上位 10 件をスワイプで提示
```

### Clef に聞いていること

Clef は文章を生成せず、型付きの質問に確率で答える決定モデルです。1 リクエストで以下をまとめて判定します。

| 軸 | 型 | 内容 |
|---|---|---|
| genre | choice | 雑談 / 創作 / 技術 / ゲーム / アニメ・推し活 / 成人向け / 特定テーマ |
| tone | score | 殺伐 → ドライ → 穏やか → ほのぼの の 4 段階 |
| strictness | score | ルールの厳しさ 3 段階 |
| newcomerFriendly | noul | 初心者が会話に入りやすいか |
| nsfw | noul | 成人向け投稿が目立つか |
| closedCommunity | noul | 身内ノリが強いか |

state にはサーバー名・説明文・ルール・ユーザー数・投稿数/日・最近の投稿 30 件を渡します。

### 採点

- **ハードフィルター**: 日本語サーバー、登録可能（承認制を許容するかは回答次第）、18 歳未満には 18+ サーバーを出さない
- **軸ごとの一致度 (0..1) × 重み** の加重平均を 100 点満点にしたものが相性スコア
- 「こだわらない」と答えた軸は採点に含めない
- 雰囲気が未判定のサーバーは、雰囲気系の軸を中立値 0.5 で扱う

## 開発

```sh
pnpm install
pnpm dev        # vite dev（adapter-cloudflare が wrangler.toml のバインディングを再現。AI はリモート実行で課金対象、KV はローカル）
pnpm test       # vitest
pnpm check      # svelte-check
pnpm lint       # biome
pnpm preview    # 本番ビルドを wrangler dev で起動
```

### デプロイ

```sh
wrangler kv namespace create VIBE_KV   # 出力された id を wrangler.toml に書く
wrangler secret put WARM_SECRET        # /api/warm 用
pnpm deploy
```

### 事前計算

初回アクセス時のレイテンシを抑えるため、活発なサーバーから順に雰囲気を事前計算できます。
外部の cron（GitHub Actions など）から叩く想定です。

```sh
curl -X POST "https://missmatch.<your>.workers.dev/api/warm?limit=50&offset=0" \
  -H "Authorization: Bearer $WARM_SECRET"
```

## 対象

- [joinmisskey](https://join.misskey.page/) に登録されている、`langs` に `ja` を含むサーバー
- ローカル TL を未認証で公開していないサーバーは、説明文とルールだけで判定します

## ライセンス

AGPL-3.0
