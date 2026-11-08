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

## 初回の手順

1. 予算アラートを作る(コンソール →「お支払い」→「予算とアラート」)。クレジット20ドルに対し、15ドルで50%・90%・100%の通知を付ける。
2. Cloud Shellでリポジトリを取得する。

   ```bash
   git clone https://github.com/harumaru870/michi.git && cd michi
   ```

3. (経路比較を使うときだけ)Routes API用のキーを作り、Secret Managerに入れる。キーの「APIの制限」はRoutes APIだけにする。

   ```bash
   printf '%s' '<作ったキー>' | gcloud secrets create routes-api-key --data-file=-
   ```

4. デプロイする。最後に表示される `デプロイ先` のURLが審査員に渡すURL。

   ```bash
   bash scripts/deploy-cloudrun.sh <PROJECT_ID>
   ```

5. `/health` が `{"ok":true,"routesConfigured":true,"geminiConfigured":true}` を返すことを確かめる。Geminiが失敗しても画面は固定文で動き続けるので、実際に一言が変わるかを画面でも確かめる。

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
