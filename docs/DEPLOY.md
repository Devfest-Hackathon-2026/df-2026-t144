# Cloud Runへのデプロイ

ハッカソンの規定で、アプリはGoogle Cloudの指定実行基盤で動かす必要がある。MICHI?はWeb版とAPI(経路・Gemini)を1つのCloud Runサービスに載せる。審査員はスマホでURLを開けば体験デモを触れる。

ローカルにgcloudを入れなくてよい。Google Cloudコンソール右上の「Cloud Shell」を開けば、gcloudとgitが最初から入っている。

## 構成

```
スマホ・PCのブラウザ ──HTTPS──> Cloud Run「michi」(asia-northeast1、最大1インスタンス)
                                   ├─ /            Expo Web版(静的ファイル)
                                   ├─ /v1/interests ─┐
                                   ├─ /v1/teaser   ──┴─> Vertex AI Gemini(gemini-3.8-flash、global)
                                   └─ /v1/routes  ────> Routes API(徒歩経路)
iOS/AndroidのExpoアプリ ──────────> 同じ /v1/* を呼ぶ(EXPO_PUBLIC_API_URL にCloud RunのURL)
```

- Geminiの認証はCloud Runのサービスアカウント `michi-run` で行う。付けるロールは `roles/aiplatform.user` だけ。APIキーはどこにも置かない。
- Routes APIのキーはSecret Managerの `routes-api-key` に入れ、環境変数としてCloud Runに渡す。
- `--source` のビルドはビルド専用のサービスアカウント `michi-build` で行う。付けるロールは `roles/run.builder` だけ。新しいプロジェクトでは既定のビルド用アカウントに権限がなく、ビルドが失敗するため。
- スクリプトは最初にプロジェクトIDの形式と請求先のリンクを確かめ、足りなければ止まる。権限を付与した回は、反映待ちで60秒止まってからデプロイする。

## GCPプロジェクトを作る(チームで1回だけ)

作るのは1人に決める。2人が別々に作ると、クレジットと請求が2つに分かれる。

1. [Google Cloudコンソール](https://console.cloud.google.com/)を開き、画面上部のプロジェクト選択から「新しいプロジェクト」を選ぶ。名前は `michi-devfest` など。作成画面に出る**プロジェクトID**を控える。IDは全世界で一意で、デプロイのコマンドに使う。
2. 課金を有効にする。Cloud Run・Vertex AI・Routes APIは、請求先アカウントがないと動かない。
   - ハッカソンのクレジット(1チーム20ドル)の受け取り方は、運営がDiscordで告知する。案内どおりにクレジットを適用する。有効化にはクレジットカードの登録が要る。
   - クレジットが入った請求先アカウントを、このプロジェクトにリンクする(「お支払い」→「アカウント管理」→ 対象プロジェクトの「請求先を変更」)。
   - クレジットの配布を待たずに始めるなら、カードを登録した請求先アカウントで先に進め、届いたクレジットを同じ請求先アカウントに適用する。
3. 予算アラートを作る(「お支払い」→「予算とアラート」→「予算を作成」)。対象をこのプロジェクトに絞り、金額20ドル、通知を50%・90%・100%に設定する。「クレジット」のチェックを外すと、クレジットで相殺される前の利用額で通知が届き、クレジットの減り方が分かる。
4. もう1人を追加する(「IAMと管理」→「IAM」→「アクセス権を付与」)。相手のGoogleアカウントに「編集者」ロールを付ける。

## 初回のデプロイ

1. 画面右上の「Cloud Shellをアクティブにする」(`>_` のアイコン)を押し、リポジトリを取得する。

   ```bash
   git clone https://github.com/harumaru870/michi.git && cd michi
   ```

2. (経路比較を使うときだけ)Routes APIのキーを作り、Secret Managerに入れる。
   - 「APIとサービス」→「ライブラリ」で Routes API を有効にする。
   - 「APIとサービス」→「認証情報」→「認証情報を作成」→「APIキー」。作ったキーの「APIの制限」で Routes API だけを選ぶ。
   - Cloud Shellでキーを保存する。キーをチャットやGitHubに貼らない。

   ```bash
   printf '%s' '<作ったキー>' | gcloud secrets create routes-api-key --data-file=-
   ```

3. (Web版でGoogleマップを出すとき)Maps JavaScript API用のキーを作る。このキーはブラウザに渡るので、必ず使える場所を絞る。
   - 「APIとサービス」→「ライブラリ」で Maps JavaScript API を有効にする。
   - 「認証情報」→「APIキー」で作り、「アプリケーションの制限」を「ウェブサイト」にして `http://localhost:8081/*` を登録する。「APIの制限」は Maps JavaScript API だけにする。
   - Cloud Shellで保存する。初回デプロイで出たURL(`https://michi-xxxx.a.run.app/*`)を、あとでキーのウェブサイト制限に追加する。

   ```bash
   printf '%s' '<地図用のキー>' | gcloud secrets create maps-browser-key --data-file=-
   ```

   キーがないとWeb版の地図は略図になる。スマホアプリ(Android)はキーなしでもGoogleマップで表示される。

4. デプロイする。初回は「Artifact Registryのリポジトリを作るか」と聞かれるので `Y` で答える。ビルドに数分かかる。最後に表示される `デプロイ先` のURLが、審査員に渡すURLになる。

   ```bash
   bash scripts/deploy-cloudrun.sh <プロジェクトID>
   ```

   3番目の引数を省くと、有料APIの利用期限は `2026-11-14T23:59:59+09:00` になる。

5. `/health` が `{"ok":true,"routesConfigured":true,"geminiConfigured":true,"paidApiUntil":"2026-11-14T14:59:59.000Z"}`(期限はUTC表示)を返すか確かめる。Geminiが失敗しても画面は固定文で動き続けるので、興味の入力で返ってくる一言が変わるかも画面で確かめる。

## 2回目以降・もう1人がデプロイするとき

`git pull` してから `bash scripts/deploy-cloudrun.sh <PROJECT_ID>` を流し直す。

- **初回はオーナーが流す**。スクリプトは権限の付与(Vertex AIの利用、Secret Managerの読み取り、URLの公開)を行い、これにはオーナー権限が要る。
- **2回目以降は「編集者」でも流せる**。スクリプトは付与済みかを先に確かめ、足りないときだけ付与する。
- 編集者が流して `[止めました] … にはオーナー権限が必要です` と出たら、表示されたコマンドをオーナーに一度だけ実行してもらい、流し直す。
- 2人が手元の別々の状態からデプロイすると、後から出したほうで上書きされる。必ずCloud Shellで `git pull` してから流す。

## 料金事故を防ぐ設定

| 対象 | 設定 |
| --- | --- |
| Cloud Run | 最大1インスタンス。アクセスがなければ0台になり課金されない |
| 有料APIの利用期限 | `PAID_API_UNTIL`(既定 `2026-11-14T23:59:59+09:00`、スクリプトの3番目の引数で変更)。過ぎるとGemini・Routesを呼ばず、地図キーも渡さない。体験デモ・固定文・略図はそのまま動く。未設定・形式違い(時差の `+09:00` がない等)のときも呼ばない |
| Gemini | アプリ側で1日50回まで(`MAX_GEMINI_CALLS_PER_DAY`、50より大きい値は無視)。そのうち「次の「？」への一言」と「興味の分類」はそれぞれ15回まで(`MAX_TEASER_CALLS_PER_DAY`・`MAX_INTEREST_CALLS_PER_DAY`)で、写真の読み取りに最低20回を残す。超えたら固定文に戻り、合計の50回を超えると写真の読み取りも止まる。「1日」は日本時間の0時で区切る。出力は2048トークンまで、写真は1枚・約2MBまで |
| Routes API | アプリ側で1日50回まで(`MAX_GOOGLE_CALLS_PER_DAY`、同上)。1回の経路比較で最大4回呼ぶ。コンソールの「割り当て」でも1日の上限を下げる |
| 下書き生成(`pnpm stories:draft`) | 同じ期限で止まる。1回の実行で最大50回 |
| 請求 | 予算アラート(手順1) |

**この設定は請求額の上限を保証しない。**

- アプリ側の回数と期限はメモリ上の数で、インスタンスが再起動すると0から数え直す。最大1インスタンスなので同時に2つ数えることはないが、1日に何度も再起動すれば1日50回を超えうる。
- Cloud Build(ビルドのたび)、Artifact Registryとソース置き場のストレージ、Secret Manager、ログ、Cloud Run自体の稼働は、アプリの数には入らない。
- Webの地図(Maps JavaScript API)はブラウザが直接読み込むので、サーバーでは数えられない。期限後はキーを渡さないだけ。キーを `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` でバンドルに埋めた版は期限の対象外になるので、Cloud Run版では使わない。
- コンソールの予算アラートと支出上限は反映が遅れ、月ごとにリセットされる。合計の上限ではない。止めたいときは、Cloud Runのサービスを削除するか、プロジェクトの課金を無効にする。

## 提出後(11/10 19:00以降)

デプロイURLはRegional Day(11/14)まで動かし続ける。止めるのは11/14の後。決勝に進んだら11/27まで延ばす。有料APIは11/14 23:59(日本時間)に自動で止まる。延ばすときは予算を確かめてから `bash scripts/deploy-cloudrun.sh <PROJECT_ID> asia-northeast1 2026-11-27T23:59:59+09:00` で出し直す。
