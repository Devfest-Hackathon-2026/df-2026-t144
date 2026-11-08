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
| Routes API(Google Maps Platform) | 徒歩経路と所要時間 | 経路を出す画面に「Google Maps」の帰属を表示する。Google由来の座標は保存しない |
| Gemini API(Vertex AI) | 興味の言葉の分類、解説文の下書き、次のスポットへの一言 | 生成文は人が出典と照合してから公開する |
| Cloud Run | APIサーバーとWeb版の配信 | — |

## スポットの事実と座標

解説文は下の資料の事実から自分たちで書いた。資料の本文は転載していない。各スポットの出典と照合の記録は [SOURCES.md](SOURCES.md) にある。

| 資料 | 発行元 | 使った情報 | 二次利用条件 |
| --- | --- | --- | --- |
| [京都市 フィールド・ミュージアム京都 石碑データベース](https://www2.city.kyoto.lg.jp/somu/rekishi/fm/ishibumi/) | 京都市歴史資料館 | 石碑の座標・碑文・由来(NA124、NA033、NA172、HI105) | 未確認。事実と座標の参照にとどめ、出典を表示する |
| [高瀬川再生プロジェクト](https://www.city.kyoto.lg.jp/kensetu/page/0000272260.html) | 京都市建設局 | 高瀬川の開削年 | 未確認 |
| [橋しるべ(三条大橋)](https://www.city.kyoto.lg.jp/kensetu/cmsfiles/contents/0000149/149842/hashishirube21.pdf) | 京都市建設局 | 擬宝珠と改修の歴史 | 未確認 |
| [京都観光Navi 三条大橋](https://ja.kyoto.travel/tourism/single02.php?category_id=9&tourism_id=173) | 京都市観光協会 | 三条大橋の代表点の座標、擬宝珠の解説 | 未確認 |
| [瑞泉寺 公式サイト](https://zuisenji-temple.net/history/) | 瑞泉寺 | 寺の由緒 | 未確認 |

「未確認」の行は、提出前に各サイトの利用規約を読んで埋める。

## デザイン

| 名前 | 提供元 | ライセンス | 用途 |
| --- | --- | --- | --- |
| [デジタル庁デザインシステム(DADS)](https://design.digital.go.jp/dads/) のデザイントークン(`@digital-go-jp/design-tokens` 2.1.0) | デジタル庁 | MIT | 色・文字サイズ・行間・角丸の値を `src/theme.ts` に転記。フォーカス表示の仕様 |
| [Noto Sans JP](https://fonts.google.com/noto/specimen/Noto+Sans+JP) | Google Fonts | SIL Open Font License 1.1 | Web版の本文フォント |

## 画像・アイコン

アプリ内のアイコンと地図の略図は、すべて `react-native-svg` で自作した図形。外部の画像素材は使っていない。
