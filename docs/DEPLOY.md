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

3. デプロイする。初回は「Artifact Registryのリポジトリを作るか」と聞かれるので `Y` で答える。ビルドに数分かかる。最後に表示される `デプロイ先` のURLが、審査員に渡すURLになる。

   ```bash
   bash scripts/deploy-cloudrun.sh <プロジェクトID>
   ```

4. `/health` が `{"ok":true,"routesConfigured":true,"geminiConfigured":true}` を返すか確かめる。Geminiが失敗しても画面は固定文で動き続けるので、興味の入力で返ってくる一言が変わるかも画面で確かめる。

## 2回目以降

`git pull` してから `bash scripts/deploy-cloudrun.sh <PROJECT_ID>` を流し直す。

## 料金事故を防ぐ設定

| 対象 | 設定 |
| --- | --- |
| Cloud Run | 最大1インスタンス。アクセスがなければ0台になり課金されない |
| Gemini | アプリ側で1日500回まで(`MAX_GEMINI_CALLS_PER_DAY`)。超えたら固定文に戻る |
| Routes API | アプリ側で1日200回まで(`MAX_GOOGLE_CALLS_PER_DAY`)。コンソールの「割り当て」でも1日の上限を下げる |
| 請求 | 予算アラート(手順1) |

アプリ側の上限は、インスタンスが再起動すると数え直しになる。上限の本命はコンソール側の割り当てと予算アラート。

## 提出後(11/10 17:00以降)

デプロイURLはRegional Day(11/14)まで動かし続ける。止めるのは11/14の後。決勝に進んだら11/27まで延ばす。
