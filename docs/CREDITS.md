# 著作物・ライブラリ・データの利用一覧

提出する「著作物利用シート」の元データ。依存やデータを足したら、同じコミットでこの表に1行足す。ライセンスは `node_modules/<name>/package.json` の値を転記した。

## ライブラリ

| 名前 | 版 | ライセンス | 用途 |
| --- | --- | --- | --- |
| expo | 58.0.23 | MIT | アプリの実行基盤・ビルド |
| expo-location | 58.0.20 | MIT | 現在地の取得 |
| expo-constants | 58.0.15 | MIT | 実行環境の判定 |
| expo-status-bar | 58.0.4 | MIT | ステータスバー |
| @expo/metro-runtime | 58.0.17 | MIT | Web版の実行 |
| react | 19.3.0 | MIT | UI |
| react-dom | 19.3.0 | MIT | Web版のUI |
| react-native | 0.88.1 | MIT | UI |
| react-native-web | 0.21.4 | MIT | Web版のUI |
| react-native-maps | 1.29.11 | MIT | ネイティブ地図 |
| react-native-svg | 15.16.0 | MIT | アイコン・略図・挿絵 |
| react-native-safe-area-context | 5.11.1 | MIT | 画面端の余白 |
| @react-native-async-storage/async-storage | 2.2.0 | MIT | 発見図鑑の端末内保存 |
| typescript | 6.0.3 | Apache-2.0 | 型チェック(開発時のみ) |
| @types/react | 19.3.0 | MIT | 型定義(開発時のみ) |

## Googleのサービス

| サービス | 用途 | 表示・利用の条件 |
| --- | --- | --- |
| Maps JavaScript API(Google Maps Platform) | Web版の地図 | 地図上のGoogleロゴと著作権表示を消さない。ブラウザ用キーはURLとAPIで制限する |
| Routes API(Google Maps Platform) | 徒歩経路と所要時間 | 経路を出す画面に「Google Maps」の帰属を表示する。Google由来の座標は保存しない |
| Gemini API(Vertex AI) | 興味の言葉の分類、解説文の下書き、次のスポットへの一言、写真に写った文字の書き起こし | 生成文は人が出典と照合してから公開する。写真は読み取りにだけ使い、保存しない |
| Cloud Run | APIサーバーとWeb版の配信 | — |

## スポットの事実と座標

解説文は下の資料の事実から自分たちで書いた。資料の本文は転載していない。各スポットの出典と照合の記録は [SOURCES.md](SOURCES.md) にある。

| 資料 | 発行元 | 使った情報 | 利用条件(2026-11-09確認) |
| --- | --- | --- | --- |
| [京都市 フィールド・ミュージアム京都 石碑データベース](https://www2.city.kyoto.lg.jp/somu/rekishi/fm/ishibumi/) | 京都市歴史資料館 | 石碑の座標(度分秒を十進に変換)、建立年などの事実(NA124、NA033、NA172、HI105) | 各ページの表示は「(c) 2003-2014 京都市」だけ。京都市サイト共通の規定に従う(下記) |
| [高瀬川再生プロジェクト](https://www.city.kyoto.lg.jp/kensetu/page/0000272260.html) | 京都市建設局 | 高瀬川の着工・完成年 | 京都市サイト共通の規定に従う |
| [京の橋しるべ 第21号(PDF)](https://www.city.kyoto.lg.jp/kensetu/cmsfiles/contents/0000149/149842/hashishirube21.pdf) | 京都市建設局 橋りょう健全推進課(令和4年5月発行) | 1590年の豊臣秀吉による大改修、擬宝珠に銘文が刻まれていること | 京都市サイト共通の規定に従う |
| [京都観光Navi 三条大橋](https://ja.kyoto.travel/tourism/single02.php?category_id=9&tourism_id=173) | 京都市観光協会 | 天正と昭和の擬宝珠が混在しているという事実1件、埋込地図が指す橋の代表点の座標1点 | フッターに「本ホームページの内容・写真・イラスト・地図等の転載を固くお断りします」(© Kyoto City Tourism Association)。文章・写真・地図は転載していない |
| [瑞泉寺 公式サイト](https://zuisenji-temple.net/history/) | 瑞泉寺 | 寺の由緒(1611年の建立、角倉了以、豊臣秀次一族を弔う寺) | 表示は「©zuisenji」だけで、転載・引用の条件は記載なし |

**京都市サイト共通の規定**([著作権・リンク等](https://www.city.kyoto.lg.jp/main/site_policy/0000000005.html)、2026-07-02更新):掲載内容の著作権は原則として京都市にあり、私的使用のための複製や引用など著作権法で認められた場合を除き、無断で複製・転用できない。画面のスクリーンショットを切り取って使うことは認めていない。公共データ利用規約(PDL)やCC BYの適用は書かれていない。

**MICHI?での使い方**:どの資料からも、年・人物・出来事・座標といった事実だけを取り出し、解説文は自分たちで書いた。資料の文章・写真・地図は複製していない。アプリでは各スポットに出典ページへのリンクを出している。事実やデータそのものは著作物にあたらないという考えで使っているが、法律の専門家には確認していない。気になる場合は各発行元に問い合わせる。

**京都観光Naviへの依存を減らす案**:三条大橋の座標は、11/10の現地確認で測った値か、国土地理院の地図の値に置き換えられる。「天正と昭和の擬宝珠が混在」の事実(f3)だけは、京都市の資料では裏付けが見つかっていない。

## 提出物・ピッチで守ること

- 京都市のページは、スライドや動画にスクリーンショットで載せない(京都市サイトの規定で不可)。
- 京都観光Naviや瑞泉寺サイトの写真・地図・文章を、スライドや動画に使わない。
- 石碑や景色の写真は、自分たちで撮ったものだけを使う。Regional Dayのカメラのデモで印刷して見せる石碑の写真も同じ。
- Googleマップの画面を使うときは、地図上のGoogleロゴと著作権表示を消さない。

## デザイン

| 名前 | 提供元 | ライセンス | 用途 |
| --- | --- | --- | --- |
| [デジタル庁デザインシステム(DADS)](https://design.digital.go.jp/dads/) | デジタル庁 | MIT(デザイントークン) | 文字サイズの下限・行間・コントラスト・フォーカス表示の基準 |
| [Noto Sans JP](https://fonts.google.com/noto/specimen/Noto+Sans+JP) | Google Fonts | SIL Open Font License 1.1 | Web版の本文フォント |
| [Dela Gothic One](https://fonts.google.com/specimen/Dela+Gothic+One) | Google Fonts(アプリは `@expo-google-fonts/dela-gothic-one` 0.4.1) | SIL Open Font License 1.1 | 見出し・ロゴ |
| expo-font 58.0.11 | Expo | MIT | アプリでの見出しフォント読み込み |
| expo-camera 58.0.14 | Expo | MIT | 「発見中…」画面のカメラ |
| expo-image-manipulator 58.0.16 | Expo | MIT | 送信前に写真を幅1280pxへ縮小 |

## 画像・アイコン

アプリ内のアイコン、地図の略図、スポットの挿絵(`src/components/Art.tsx`)、発見カードの装飾は、すべて `react-native-svg` で自作した図形。外部の画像素材は使っていない。
