# MICHI?（ミチハテナ）

**いつもの道に、まだ知らない物語がある。**

目的地へ向かう途中の「？」に近づき、街の物語を発見するモバイルアプリです。React Native / Expo SDK 57で、iOS・Androidを主対象にしています。今日のMVPは京都三条・高瀬川周辺を仮の対象地域として、発見から図鑑保存までを実装しています。

## まず動かす

Node.js 22.13以上、pnpm 11系を使用します。リポジトリ直下で実行してください。

```sh
pnpm install
pnpm start
```

同じWi-Fiのスマートフォンで、Expo Goから表示されたQRコードを開きます。初期状態は「体験デモ」です。目的地と寄り道時間を選び、「？」→「デモでここへ移動」→「立ち止まって、発見する」の順に操作できます。デモにAPIキーは不要です。

2026年11月8日時点のExpo公式案内は、実機のExpo GoにはSDK 57を案内しています。インストール済みExpo Goの対応SDKを合わせてください。iOS実機では、Expo CLI（`pnpm exec expo login`）とExpo Goに同じExpoアカウントでログインする必要があります。アプリ内のユーザーログインは実装していません。[対応SDK](https://docs.expo.dev/get-started/create-a-project/)、[実機起動とログイン条件](https://docs.expo.dev/get-started/start-developing/)

Webで画面を確認する場合は次を使います。React Native Webの略図でUIを確認するためのプレビューであり、ネイティブ地図や実機GPSの検証は別途必要です。

```sh
pnpm web
```

## この版で実装したこと

- 目的地2件、スポット5件。「追加5分／10分」で通常ルートと発見ルートを比較。
- デモの仮想移動と、現在地を使う「現地で歩く」を明示的に切替。
- GPSで45m以内に近づいたときの発見解放、出典付きの短い物語、関連スポット。
- AsyncStorageによる端末内の発見図鑑。デモの記録と現地の記録は分離。
- Google Routesに徒歩経路を問い合わせる開発用サーバーとアプリ接続処理。

デモの所要時間と経路線は固定の体験用データです。「現地で歩く」は実GPSを使いますが、Google Routesは現在未接続です。iOS・Android実機での地図、位置情報、保存、Googleとの実通信は未検証です。スポットの史実は出典を確認していますが、座標と通行条件は現地未確認です。

## Google Routesを接続する

[.env.example](.env.example)を`.env`にコピーし、アプリ側の`EXPO_PUBLIC_ROUTES_URL`とサーバー側の`GOOGLE_ROUTES_API_KEY`を設定します。サーバーは別ターミナルで`pnpm server`を起動します。スマートフォンから接続する場合、URLには開発PCのLANアドレスを使用します。キーを設定するまでは空欄のままで構いません。

地図SDKの設定と経路APIは別です。iOSの既定地図はApple Mapsで、Googleの実経路線を重ねるにはGoogle Mapsを設定した独自ビルドが必要です。接続手順、環境変数、公開前の残作業は[Google Cloud接続メモ](docs/GOOGLE-CLOUD.md)にまとめています。[Google公式・Routes API](https://developers.google.com/maps/documentation/routes/compute_route_directions)、[Expo公式・地図設定](https://docs.expo.dev/versions/v57.0.0/sdk/map-view/)

## チェック

```sh
pnpm typecheck
pnpm test
pnpm test:server
```

ドメインのテストは距離判定・GPS情報の鮮度と精度・寄り道予算・保存データを確認します。サーバーのテストは入力検証やGoogle応答の処理を確認し、実Google APIは呼びません。

次の作業は、**①実機で一連の発見体験を確認 → ②Google Routesを接続して徒歩経路を確認 → ③対象地域を確定し、実際に歩いて座標と物語を調整**の3つです。

企画の採用範囲は[MVPの決定事項](docs/MVP.md)、スポットの根拠は[出典メモ](docs/SOURCES.md)を参照してください。
