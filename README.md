# MICHI?（ミチハテナ）

**いつもの道に、まだ知らない物語がある。**

- デプロイした作品: https://michi-176224264627.asia-northeast1.run.app (体験デモは位置情報なしで最後まで動きます)
- DevFest GDGoC Japan Hackathon 2026 チーム「Overcoding!」の提出物です。

目的地へ向かう途中の「？」に近づき、街の物語を発見するモバイルアプリです。React Native / Expo SDK 58で、iOS・Androidを主対象にしています。今日のMVPは京都三条・高瀬川周辺を仮の対象地域として、発見から図鑑保存までを実装しています。

## まず動かす

Node.js 24.3以上の24系（または22.13以上の22系）、pnpm 11系を使用します。リポジトリ直下で実行してください。

```sh
pnpm install
pnpm start
```

同じWi-Fiのスマートフォンで、Expo Goから表示されたQRコードを開きます。初期状態は「体験デモ」です。初回案内の「最初の『？』を体験する」から、「デモでここへ移動」→「立ち止まって、発見する」→「発見図鑑で見る」の順に試せます。目的地と寄り道時間を自分で選ぶこともできます。デモにAPIキーや位置情報の許可は不要です。

このプロジェクトはSDK 58対応のExpo Goで開きます。SDK 57との不一致が実機で発生したため、SDK 58へ更新済みです。バージョン不一致が表示された場合は、Expo Goの対応SDKとプロジェクトのSDKを確認してください。iOS実機では、Expo CLI（`pnpm exec expo login`）とExpo Goに同じExpoアカウントでログインします。アプリ内のユーザーログインは実装していません。[SDK更新手順](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/)、[実機起動とログイン条件](https://docs.expo.dev/get-started/start-developing/)

Webで画面を確認する場合は次を使います。React Native Webの略図でUIを確認するためのプレビューであり、ネイティブ地図や実機GPSの検証は別途必要です。

```sh
pnpm web
```

## この版で実装したこと

- 目的地2件、スポット5件。「追加5分／10分」で通常ルートと発見ルートを比較。
- デモの仮想移動と、現在地を使う「現地で歩く」を明示的に切替。
- 初回の3ステップ案内、空の図鑑からの体験開始、発見後に図鑑へ進むボタン。
- 位置情報の拒否・取得エラー・対象エリア外（最寄りスポットから2km超）からデモへ戻る導線。ネイティブでは拒否後に端末設定を開けます。
- GPSで45m以内に近づいたときの発見解放、出典付きの短い物語、関連スポット。
- AsyncStorageによる端末内の発見図鑑。デモの記録と現地の記録は分離。
- Google Routesに徒歩経路を問い合わせる開発用サーバーとアプリ接続処理。
- 興味の入力欄。Gemini(Vertex AI)が自由な言葉を6つの視点タグに分け、関係する「？」を上に並べる。寄り道ルートの候補選びにも使う。
- 関連する「？」への一文をGeminiが作る。出典を確認した事実だけを渡し、数字・事実ID・ネタバレをコードで検査する。通らなければ固定文を出す。
- 「発見中…」画面でカメラを使える。石碑や案内板を撮ると、Geminiが写っている文字を書き起こし、スポット名が含まれていれば発見になる。Geminiには答えを教えず、一致はコードで判定する。屋内の会場でも、石碑の写真を撮って発見を見せられる。
- 視点別の解説を事前に下書きし(`pnpm stories:draft`)、人が照合したものだけを表示する仕組み。
- Cloud Runの1サービスでWeb版とAPIを配信する構成([デプロイ手順](docs/DEPLOY.md))。
- 画面はデジタル庁デザインシステムの色・文字・余白の値に合わせている。

Geminiはサーバーにだけつなぐ。サーバーが未接続でも、アプリはキーワード照合と固定文で同じ流れを最後まで通せる。提出物の準備は[提出メモ](docs/SUBMISSION.md)、作業ルールは[AGENTS.md](AGENTS.md)にある。

デモの所要時間と経路線は固定の体験用データです。「現地で歩く」は実GPSを使いますが、Google Routesは現在未接続です。iOS・Android実機での地図、位置情報、保存、Googleとの実通信は未検証です。スポットの史実は出典を確認していますが、座標と通行条件は現地未確認です。

## Expo Goから本番のサーバーにつなぐ

[.env.example](.env.example)を`.env`にコピーし、`EXPO_PUBLIC_API_URL=https://michi-176224264627.asia-northeast1.run.app`(Cloud Runの公開URL)を入れて`pnpm start`をやり直します。スマホのExpo Goから、本番のGemini(興味の分類・次の「？」への一言・写真の読み取り)とGoogle Routesを使えます。空欄のままなら、AIを使わない体験デモとして動きます。有料APIの回数は本番と共有なので、試しすぎに注意してください(1日50回まで)。

## Google Routesを接続する

[.env.example](.env.example)を`.env`にコピーし、アプリ側の`EXPO_PUBLIC_API_URL`(旧名`EXPO_PUBLIC_ROUTES_URL`も可)とサーバー側の`GOOGLE_ROUTES_API_KEY`を設定します。サーバーは別ターミナルで`pnpm server`を起動します。スマートフォンから接続する場合、URLには開発PCのLANアドレスを使用します。キーを設定するまでは空欄のままで構いません。

地図SDKの設定と経路APIは別です。iOSの既定地図はApple Mapsで、Googleの実経路線を重ねるにはGoogle Mapsを設定した独自ビルドが必要です。接続手順、環境変数、公開前の残作業は[Google Cloud接続メモ](docs/GOOGLE-CLOUD.md)にまとめています。[Google公式・Routes API](https://developers.google.com/maps/documentation/routes/compute_route_directions)、[Expo公式・地図設定](https://docs.expo.dev/versions/v58.0.0/sdk/map-view/)

## チェック

```sh
pnpm typecheck
pnpm test
pnpm test:server
```

ドメインのテストは距離判定・GPS情報の鮮度と精度・寄り道予算・保存データを確認します。サーバーのテストは入力検証やGoogle応答の処理を確認し、実Google APIは呼びません。

次の作業は、**①実機で一連の発見体験を確認 → ②Google Routesを接続して徒歩経路を確認 → ③対象地域を確定し、実際に歩いて座標と物語を調整**の3つです。

企画の採用範囲は[MVPの決定事項](docs/MVP.md)、スポットの根拠は[出典メモ](docs/SOURCES.md)を参照してください。
