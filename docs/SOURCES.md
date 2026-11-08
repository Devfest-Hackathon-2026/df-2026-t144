# MICHI? 京都三条・高瀬川の仮スポット調査

確認日: 2026-11-08 JST。地域はユーザー確定前の仮置き。下記の短文は資料の事実から独自に書いたアプリ用原稿であり、出典本文の転載ではない。

## 実装上の扱い

- `contentStatus: source_checked`、`fieldVerified: false` が適切。現地で位置・通行・撮影可否を確認していないので「現地検証済み」としない。
- 石碑DBの世界測地系・度分秒を十進度に変換。原資料は0.1秒単位または1秒単位なので、表示桁数が現地精度を保証するものではない。資料の調査年は2002〜2020年。
- 三条大橋の座標は京都市公式観光サイトが指定する橋の代表点。特定の擬宝珠の座標ではない。近接解放の基準点として仮利用できるが個体照準には使わない。
- 「駅伝の碑」と橋の代表点は近いため、現地では同じ立ち寄りで二つの視点を発見する構成が自然。5地点の離れたチェックポイントとして歩行時間を水増ししない。
- 各地点の歩行経路・所要時間は未測定。直線距離から実歩行ルートを断定しない。
- 先斗町は今回未採用。今日のMVPでは座標の出典が明確な「駅伝の碑」を代わりに採用する案。

## アプリと経路サーバーの共通データ

`src/data/catalog.json` が単一のデータ元。`src/data/spots.ts` は `Spot[]`、`Destination[]`、`Coordinate` として再exportする。

- `city-hall`: 京都市役所前周辺、35.0116 / 135.7681
- `shijo-kawaramachi`: 四条河原町交差点周辺、35.0037 / 135.7697
- `demoOrigin`: 三条京阪付近の仮想出発点、35.0093 / 135.7734

この3点は計画・デモ用の概略位置であり、駅出口や歩行可能な停止位置として現地検証した座標ではない。スポットの半径45m、見学1分もMVPの操作・経路計算用の設定値であり、資料由来の歴史情報や実測所要時間ではない。

## 1. 高瀬川一之船入

- id: `takase-ichino-funairi`
- category: `waterway`, `history`
- location: `{ "latitude": 35.01225, "longitude": 135.77038889 }`
- originalCoordinate: `北緯35度00分44.1秒／東経135度46分13.4秒(世界測地系)`
- coordinateKind: `stone_marker`（史跡全体の中央ではなく石標の座標）
- hint: 「細い流れの横に、水面が広がる小さな場所。何に使ったのでしょう。」
- shortDescription: 「高瀬川は、角倉了以・素庵の父子が開いた運河。この船入は、荷物を降ろし、舟の向きを変えるための場所でした。街角の小さな水面には、京都の暮らしを支えた物流の記憶が残っています。」
- verifiedFacts: 高瀬川は角倉了以・素庵父子が開削。船入は荷物の積み下ろしと方向転換に利用。一之船入は国指定史跡。
- relatedSpotIds: `zuisenji`（同じ角倉了以、高瀬川開削との関係）
- sourceUrls:
  - https://www2.city.kyoto.lg.jp/html/somu/rekishi/fm/ishibumi/html/na124.html
  - https://www.city.kyoto.lg.jp/kensetu/page/0000272260.html
- sourceNote: 京都市石碑DB NA124が事実と座標を明記。開削年を扱う場合は京都市建設局の整理「1611年着工、1614年完成」を使う。古い観光解説の「1611年頃開いた」と混ぜない。舟入の数も時期で変わるため短文から省略。

## 2. 池田屋騒動址

- id: `ikedaya`
- category: `history`
- location: `{ "latitude": 35.00911111, "longitude": 135.76980556 }`
- originalCoordinate: `北緯35度00分32.8秒／東経135度46分11.3秒(世界測地系)`
- coordinateKind: `stone_marker`
- hint: 「にぎやかな通りの小さな石碑に、幕末の一夜が刻まれています。」
- shortDescription: 「1864年、三条の旅館・池田屋で会合していた志士たちを新選組が襲撃しました。通りに立つ石碑は、その場所を伝える目印。今の街並みを眺めながら、この一角で起きた幕末の出来事を想像してみましょう。」
- verifiedFacts: 元治元年6月5日に三条池田屋で会合中の志士が新選組に襲撃された。石碑はその跡を示す。石碑建立は1927年。
- relatedSpotIds: `sanjo-giboshi`（同時代の出来事をめぐる伝承。ただし刀傷の由来は未確定）
- sourceUrls:
  - https://www2.city.kyoto.lg.jp/somu/rekishi/fm/ishibumi/html/na033.html
- sourceNote: 日付を表示する場合は「元治元年6月5日（旧暦）」とし、西暦6月5日と混同しない。現建物を当時の旅館の建物だとは説明しない。店への入店・購入は発見条件にしない。

## 3. 瑞泉寺

- id: `zuisenji`
- category: `history`, `waterway`
- location: `{ "latitude": 35.00861111, "longitude": 135.77055556 }`
- originalCoordinate: `北緯35度0分31秒／東経135度46分14秒(世界測地系)`
- coordinateKind: `nearby_entrance_marker`（瑞泉寺前の「岩瀬忠震宿所跡」石碑を入口の代理点として採用。寺院敷地の中心ではない）
- hint: 「川沿いの小さなお寺。運河をつくった人と、どんなつながりがあるのでしょう。」
- shortDescription: 「瑞泉寺は1611年、角倉了以が豊臣秀次と一族を弔うために建てた寺です。寺の由緒は、高瀬川の工事中に荒れた墓域を見つけたことが建立のきっかけと伝えます。水運の歴史が、街の祈りにもつながっています。」
- verifiedFacts: 1611年の建立、角倉了以、豊臣秀次一族の菩提寺。高瀬川工事と建立の経緯は寺の由緒として紹介する。
- relatedSpotIds: `takase-ichino-funairi`
- sourceUrls:
  - https://zuisenji-temple.net/history/
  - https://zuisenji-temple.net/access/
  - https://www2.city.kyoto.lg.jp/somu/rekishi/fm/ishibumi/html/na172.html
- sourceNote: 歴史は寺公式の由緒、座標は京都市石碑DB NA172。参拝時間は寺公式が7:00〜17:00、京都観光Naviは8:00〜17:00と相違するので、アプリでは「開門時間は公式サイトで確認」とし、入口側で発見を完結させる。堂内参拝を案内しない。

## 4. 三条大橋の擬宝珠

- id: `sanjo-giboshi`
- category: `architecture`, `history`
- location: `{ "latitude": 35.00913889, "longitude": 135.77188889 }`
- coordinateKind: `official_tourism_map_representative_point`
- hint: 「橋の手すりの飾りを、よく見てみると。古い文字が何を伝えているでしょう。」
- shortDescription: 「三条大橋の手すりを飾る擬宝珠には、橋の工事を伝える銘文があります。1590年、豊臣秀吉の命で行われた大改修の記憶です。京都市の解説では天正時代と昭和時代の擬宝珠が混在するとされ、橋の歴史を身近に見比べられます。」
- verifiedFacts: 1590年に秀吉の命による大改修。擬宝珠には工事を伝える銘文。天正と昭和のものが混在すると京都市公式観光解説に記載。
- relatedSpotIds: `ekiden-monument`, `ikedaya`
- sourceUrls:
  - https://ja.kyoto.travel/tourism/single02.php?category_id=9&tourism_id=173
  - https://www.city.kyoto.lg.jp/kensetu/cmsfiles/contents/0000149/149842/hashishirube21.pdf
- sourceNote: 座標は京都観光NaviページのGoogle Maps iframeのq指定値（35.0091388888889,135.771888888889）から取得。埋込先の地図自体は403で未表示。橋の代表点としてのみ扱い、特定擬宝珠を狙う座標としない。刀傷は市資料も「池田屋騒動の時の刀傷が残っていると言われて」としているので、事実扱いせず今回は本文から省略。

## 5. 駅伝の碑

- id: `ekiden-monument`
- category: `culture`, `history`
- location: `{ "latitude": 35.00919444, "longitude": 135.77205556 }`
- originalCoordinate: `北緯35度00分33.1秒／東経135度46分19.4秒(世界測地系)`
- coordinateKind: `stone_marker`
- hint: 「この橋のたもとから、東京まで続くある挑戦が始まりました。」
- shortDescription: 「1917年、日本初の駅伝は三条大橋から東京・上野へ向かって始まりました。約508キロを23区間に分けた、3日間の大会です。橋のたもとの石碑は、いつもの道が長いリレーの出発点だったことを教えてくれます。」
- verifiedFacts: 1917年4月27〜29日の東海道駅伝徒歩競争。三条大橋から上野不忍池の博覧会正面玄関まで508km、23区間。石碑建立は2002年。
- relatedSpotIds: `sanjo-giboshi`
- sourceUrls:
  - https://www2.city.kyoto.lg.jp/somu/rekishi/fm/ishibumi/html/hi105.html
- sourceNote: 京都市石碑DB HI105が事実と座標を明記。石碑は三条大橋東詰北側。横断や撮影の際は立ち止まれる歩道上で操作する。

## 関連付け表示の文案

- `takase-ichino-funairi` → `zuisenji`: 「この運河を開いた角倉了以は、川沿いの寺の建立にも関わっています。」
- `zuisenji` → `takase-ichino-funairi`: 「寺の由緒につながる運河。その舟が荷物を降ろした場所へ。」
- `sanjo-giboshi` → `ekiden-monument`: 「旅人が渡ったこの橋は、のちに長いリレーの出発点にもなりました。」
- `ekiden-monument` → `sanjo-giboshi`: 「駅伝よりもずっと前の記憶は、橋の手すりにも残っています。」
- `ikedaya` → `sanjo-giboshi`: 「近くの橋にも、この事件と結び付けられた伝承があります。」（刀傷の由来を説明する時は伝承表記を必須にする）
