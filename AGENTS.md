# AGENTS.md — MICHI?

CodexとClaude Codeが作業前に読むルール。人が書くときも同じルールで動く。

## 締切と規定(DevFest GDGoC Japan Hackathon 2026)

- コードフリーズは **2026-11-10(火)17:00 JST**。締切後は提出用リポジトリが読み取り専用になり、Regional Day(11/14)が終わるまで直せない。デモモードとピッチで見せる数字は、締切までに入れる。
- アプリはGoogle Cloudの指定実行基盤で動かす。このリポジトリは **Cloud Run**(`server/`)を使う。実行基盤を使っていないチームは審査対象外になる。
- プロダクトの中核はGoogle技術にする。アプリ内で使うLLMは **Gemini(Vertex AI経由)だけ**。他社のLLM APIを組み込まない。デモ画面やピッチに他社製品を出さない。
- Cloud CreditはAI Studioに使えない。GeminiはAI StudioのAPIキーではなく、Vertex AIで呼ぶ。
- APIキー・サービスアカウント鍵・`.env` をコミットしない。秘密値を `EXPO_PUBLIC_*` に入れない(アプリのバンドルに埋まる)。
- 使った素材・ライブラリ・データは [docs/CREDITS.md](docs/CREDITS.md) に追記する。提出する著作物利用シートの元になる。
- 比べて捨てた案は、コミットメッセージかPR本文に1行残す。提出ドキュメントの「選定理由・メリット/デメリット」に使う。

## スタック

| 層 | 使うもの |
| --- | --- |
| アプリ | Expo SDK 58 / React Native 0.88 / TypeScript。主対象はiOS・Android。React Native Webは画面確認と審査員向けデモURLに使う |
| サーバー | Node 24、`node:http` だけの小さなサーバー(`server/*.mjs`)。Cloud Runで動かす |
| AI | Vertex AIのGemini REST API(`server/gemini.mjs`)。Cloud Runのサービスアカウントのトークンで認証し、キーを持たない。SDKを入れずに済むので、サーバーは依存ゼロのまま |
| データ | `src/data/catalog.json` が唯一の元。型は `src/types.ts` |
| パッケージ | pnpm 11(`pnpm-lock.yaml`)。npmやyarnでlockを作らない |

## 古いAPIを書かない

AIエージェントは学習データにある旧APIを書きやすい。新しいGCPプロジェクトでは旧APIが有効化できず、動かない。

| 領域 | 使わない | 使う |
| --- | --- | --- |
| 経路 | Directions API、Distance Matrix API、JSの `DirectionsService` / `DistanceMatrixService` | Routes API `routes.googleapis.com/directions/v2:computeRoutes`。`X-Goog-FieldMask` 必須、`travelMode: 'WALK'` |
| 場所 | Places API(旧)、`PlacesService` | 必要になったらPlaces API (New) |
| Gemini | `@google/generative-ai`(サポート終了)、AI StudioのAPIキー、`generativelanguage.googleapis.com` | `aiplatform.googleapis.com/v1/projects/{project}/locations/global/publishers/google/models/{model}:generateContent`(`server/gemini.mjs` 経由) |
| モデル | `gemini-2.x`、`gemini-3.6-flash`(Vertex AIで11/19停止) | `gemini-3.8-flash`。コードに直書きせず環境変数 `GEMINI_MODEL` から読む。リージョンは `global` |

## Geminiの使い方

- Geminiに渡す事実は `Spot.facts` だけ。出力はJSONスキーマ(`responseSchema`)で受け、サーバー側で検証する。
- 生成文は `checkGeneratedText`(`server/ai.mjs`)を通す。`facts` にないID、使った事実にない数字、次のスポットのネタバレ(`spoilerWords`)、長さ超過のどれかがあれば捨てる。
- Geminiの呼び出しは `server/` だけで行う。アプリから直接呼ばない。
- 解説はデモ前に事前生成し(`pnpm stories:draft`)、人が出典と照合して `reviewStatus: "verified"` にしたものだけアプリに出す。
- ライブで呼ぶのは「興味の言葉 → 視点タグ」と「次の『？』へつなぐ一言」の2か所。失敗したら固定文に戻し、画面を止めない。
- おすすめの順位はコード(タグの一致数)で決める。Geminiに順位を決めさせない。順位の理由を説明できなくなる。

## 画面

アートディレクションはキービジュアル(夜の紺・朱赤・白、斜めの帯、和紙の発見カード)に合わせる。読みやすさの基準はデジタル庁デザインシステムから残す。

- 色・文字は `src/theme.ts` のトークンだけを使う。生のHEXを書かない。地図の配色も `mapGround` などのトークンから取る。
- 見出しは `text.display*`(Dela Gothic One)、本文は `text.std16N170` 以上、注記だけ14px。14px未満は使わない。
- 文字と背景のコントラストは4.5:1以上。紺の上に赤い文字を置くときは `colors.redText` を使う(`colors.red` は塗り用)。
- 斜めの帯は `Slant`、ボタンは `Button`(斜め、高さ52px)、「？」は `QPin`、カードは `DiscoveryCard`。どれも `src/ui.tsx` と `src/components/` にある。
- 選択状態は色だけで示さない。チェックアイコンか太字を足す。
- 地図はWebではGoogleマップ(Maps JavaScript API、`GOOGLE_MAPS_BROWSER_KEY`)、キーがなければ略図。Googleの経路線はGoogleマップの上にだけ描く。
- 外部リンクは `colors.link` +下線+「(外部サイト)」。

## 位置情報とデモ

- Regional Day(大阪)は屋内会場で、GPSでの解放を再現できない。体験デモ(`mode: 'demo'`)を壊さない。
- デモ中は画面に「DEMO」表示を出し続ける。デモの記録を現地の記録に混ぜない。

## 変更の進め方

- Claude Code側とCodex側の2人が同じ `main` にpushする。作業前に `git pull --rebase`、push前に下のチェックを通す。
- `App.tsx` は1ファイルが大きく、2人の変更が衝突しやすい。新しい画面部品は `src/components/` に分ける。
- チェック: `pnpm typecheck && pnpm test && pnpm test:server`
- pnpmが入っていない環境では `npx -y pnpm@11.25.0 <script>` で同じコマンドを実行できる。
