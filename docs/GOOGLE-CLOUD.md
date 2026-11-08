# Google Cloud 接続メモ

この版は、APIキーなしでデモ体験を動かせます。Google Routes の実通信はキーを設定したときだけ行います。Google Cloudへのデプロイ、APIの有効化、課金設定、キー作成はまだ実施していません。

## 地図と経路計算は別の設定

| 用途 | 設定 | 保持する場所 |
| --- | --- | --- |
| Android独自ビルドの地図 | Maps SDK for Android。パッケージ名と署名SHA-1でキー制限 | Expoのビルド環境変数 |
| iOS独自ビルドのGoogle地図 | Maps SDK for iOS。Bundle IDでキー制限 | Expoのビルド環境変数 |
| Google徒歩経路 | Routes API。API制限をRoutes APIに限定したサーバー用キー | サーバーの `GOOGLE_ROUTES_API_KEY` |

Expo Goでの地図確認は追加設定不要です。iOSの既定地図はApple Mapsです。Google MapsをiOSで使う場合は、設定を含むdevelopment buildが必要になります。[Expo地図の公式設定](https://docs.expo.dev/versions/v58.0.0/sdk/map-view/)

サーバー用キーを `EXPO_PUBLIC_*`、JavaScriptバンドル、GitHubに入れないでください。ネイティブSDK用キーはバイナリに含まれるため、上記のアプリ制限が前提です。Google CloudのクレジットがMaps Platformの利用に適用されるかは、提供プログラムと請求画面で確認してください。

## ローカルで経路APIを起動

プロジェクト直下の無視対象 `.env` にサーバー用キーを設定します。

```dotenv
GOOGLE_ROUTES_API_KEY=your-server-side-key
# 同じWi-Fiのスマホから接続するときだけ指定
HOST=0.0.0.0
PORT=8787
# 必須。この時刻まで有料APIを使う。未設定・形式違いなら呼ばない
PAID_API_UNTIL=2026-11-14T23:59:59+09:00
# 任意。プロセス内の簡易上限(50が最大)
MAX_GOOGLE_CALLS_PER_DAY=50
MAX_REQUESTS_PER_MINUTE=10
# Webプレビューを使う場合のみ。実際の開発URLに合わせる
ALLOWED_ORIGINS=http://localhost:8081,http://127.0.0.1:8081
```

```sh
pnpm server
```

既定では `127.0.0.1:8787` にのみ接続を待ち受けます。`GET /health` は外部APIを呼ばず、設定の有無だけを返します。

スマホから `localhost` を指定するとスマホ自身を参照します。同じWi-Fiの開発PCのLANアドレスを使い、アプリ側の `EXPO_PUBLIC_ROUTES_URL` を `http://<開発PCのLANアドレス>:8787` に設定してExpoを再起動してください。開発端末のネットワーク設定によってはHTTP接続が許可されないため、実機ビルドではHTTPSの検証環境を使用してください。アプリはGPSモードで明示操作したときだけ現在地をこのサーバーとGoogleへ送信します。

## API契約

`POST /v1/routes`、`Content-Type: application/json`

```json
{
  "origin": { "latitude": 35.0093, "longitude": 135.7734 },
  "destinationId": "city-hall",
  "budgetMinutes": 5
}
```

- `destinationId`: `city-hall` または `shijo-kawaramachi`
- `budgetMinutes`: 数値の `5` または `10`
- 出発地点: 北緯35.000〜35.025、東経135.755〜135.785の試験地域内
- 成功: `{ routes: RouteOption[], attribution: "Google Maps", warnings: string[] }`
- 失敗: `{ error: { code: string, message: string } }` と対応するHTTPステータス

通常ルートを1回計算し、5分では2候補、10分では3候補を比較します。1操作あたりのGoogle呼び出しは最大4回です。登録スポット以外は経由地点にしません。通常ルートの所要時間に対する追加時間には、各スポットの見学1分を含めます。上限内の候補がなければ通常ルートだけを返します。候補の最適性や全スポットの組合せを保証する探索ではありません。

API応答の失敗・タイムアウトはエラーとして返します。仮の時間や経路へ自動で置き換えません。Googleの所要時間・経路線・ユーザーの現在地をサーバーに保存せず、応答は `Cache-Control: no-store` とします。[Routes APIの計算手順](https://developers.google.com/maps/documentation/routes/compute_route_directions)

## 表示条件

Google Routesの結果を地図に重ねる場合はGoogle Mapを使用します。Apple MapsやWebプレビューの略図にはGoogle経路線を重ねません。地図なしの数値表示では、同じ領域に「Google Maps」の帰属を表示します。WALKの経路にはAPI応答の `warnings` と徒歩経路がベータ版で歩道等が欠ける可能性を表示します。[表示ポリシー](https://developers.google.com/maps/documentation/routes/policies)、[徒歩経路の制約](https://developers.google.com/maps/documentation/routes/vehicles)

## 公開前に残る作業

現在のサーバーは開発用です。ユーザー認証やApp Checkによるアプリ検証は未導入で、公開インターネット向けの無認証APIとして運用する状態ではありません。プロセス内の呼出回数上限は再起動でリセットされ、複数インスタンス間で共有されません。Google Cloud側でもAPI割当を設定し、公開する際は認証・永続的な制限・監視を追加してください。

Cloud Run用の `Dockerfile` はリポジトリ直下にあり、Web版とAPIを1つのサービスにまとめる。手順は [DEPLOY.md](DEPLOY.md)。公開や課金を伴うコマンドは自動実行していない。外部公開前には、利用規約・プライバシーポリシー、位置情報送信の説明、Google帰属、実際の通行可否を確認する必要がある。

## Gemini(Vertex AI)

Cloud Runではサービスアカウントのトークンで `gemini-3.8-flash`(リージョン `global`)を呼ぶ。キーは持たない。ローカルで試すときは `.env` に `GOOGLE_CLOUD_PROJECT` と `GEMINI_ACCESS_TOKEN`(`gcloud auth print-access-token` の出力)を入れる。どちらもないとGeminiは無効になり、アプリは固定文で動く。

| API | 入力 | 出力 | Geminiが使えないとき |
| --- | --- | --- | --- |
| `POST /v1/interests` | `{ text }`(80字以内) | `{ topicIds, reply, source }` | キーワード照合の結果(`source: "keywords"`) |
| `POST /v1/teaser` | `{ fromSpotId, toSpotId, topicIds }` | `{ text, usedFactIds, source }` | カタログの固定文(`source: "fixed"`) |
| `POST /v1/recognize` | `{ spotId, image(base64、約2MBまで), mimeType }` | `{ matched, matchedWord, readText, scene }` | 503 `NOT_CONFIGURED`(アプリは案内を出す) |
| `GET /v1/config` | — | `{ mapsApiKey }` | `null`(Web版は略図) |
| `POST /v1/routes` | 従来の項目 + 任意の `topicIds` | 従来どおり | — |

Geminiの出力は `server/ai.mjs` の `checkGeneratedText` で検査し、通らなければ捨てる。スポットの解説本文は事前生成と人の照合を経たものだけを出す(`pnpm stories:draft` → `src/data/stories.json` を照合 → `pnpm stories:check`)。
