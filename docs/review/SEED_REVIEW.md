# レビュー資料（Codex 向け）：新着の手動の一括収集（初期投資）・実測の費用・管理の画面

ユーザーの判断（2026-10-01）：新着集めを初期投資として手動で動かす。100円（目安）ずつの段階で、結果を見てから次を押す。月1,000円の上限の中に含める。金額は請求に出るのに時間がかかるので、トークン数から先に分かるようにする。仕様：`docs/APP_MAP.md` §46（新規）。

## 1. 対象
- ブランチ：`claude/optimistic-albattani-jg5211`（main `de7b785` から）

## 2. 変更
- `api/src/trends.js`
  - `SEED_QUERIES`：棚卸し（`docs/CATALOG_COVERAGE.md`）で足りなかった分野の検索語16個
  - `seed({ yen })`：同じロック（`trends/lock`）を使う。段階（`trends/seed` の `stages`）は yen 円 ÷ `TREND_YEN_PER_AI` 回まで。AI を呼ぶ前に月の回数を予約（`writeMonthCost`：§39 の予約・返却の処理を共通にした。競合だけやり直し、例外ではやり直さない）
  - むだを省く：保存済みの結果があれば `peek` で0円／新着の全部の週・前に試した動画（`tried`）は重ねない／掲載停止・晩ごはんでない題名・日本語でない題名は読まない／1回の検索で同じ投稿者は2本まで／`catalog.import` は `forceVideo` なし（動画は読まない）。作り方がなければ外す
  - 集めた料理は `trends/index` に `seed: true` の週（段階ごと、その日から28日）。毎日の `step()` は `!w.seed` の週を「今週」にする（毎日の分の枠を使わない）。`has()`・`list()` は seed の週も含む（献立に入れられたら §45 で残る）
  - 記録には題名を残さず、見せる時に `peek` で読む（`withTitles`）
  - 止まった理由：`stage_budget`・`month_budget`・`exhausted`（ここまでで段階は終わり）、`time`・`search_failed`・`cost_not_saved`（次に押すと続きから）
- `api/src/aiUsage.js`（新規）：`AsyncLocalStorage` で、`usage.run(collector, fn)` の中で呼ばれた AI の `usageMetadata` だけを集める。`usageYen`（単価は環境変数、既定 gemini-2.5-flash の公開料金・1ドル150円）
- `api/src/analyzer.js`：説明欄の読み取り・動画の読み取り（`generateFromVideo`）・チャプターの対応付け・ひとことキャッチで `recordUsage`（`usage.run` の外では何もしない）
- `api/src/server.js`：`POST /api/admin/trends/seed`・`GET /api/admin/trends/seed`（管理の合言葉）
- `admin/catalog.html`（新規・検索に出さない）：段階のボタン・段階ごとの結果・月の費用・同意をお願いしたい投稿者・料理ごとの採用率。外から来る文章は `textContent` だけで入れる。合言葉はタブの中だけ（`sessionStorage`）

## 3. 受け入れ条件
- 同じ動画に二度お金を使わない。前の段階で試した動画も重ねない
- 段階の金額（目安）と月の上限を超えない。AI を呼ぶ前に予約する
- 動画そのものは読まない（費用が大きい）
- 押すのは運営（ユーザー）。自動では動かない
- 実際の費用の目安がすぐ分かる

## 4. テスト
- `npm test --prefix api`：153件 成功（新しく `api/test/seed.test.js` 4件。新しい機能なので修正前のコードにはない）
  1. 1段階20円（AI 4回）：重複・もう読んだ（0円で追加）・説明欄に作り方がない・晩ごはんでない・掲載停止・同じ投稿者の3本目を正しく扱い、動画は読まない／実測の費用／新着に出る・`has`／月の回数に入る／第2段階は続きから・試した動画を重ねない・検索語を使い切ると `exhausted`／毎日の新着集めは seed の週を「今週」にしない／記録に題名を残さない
  2. 月の上限の残り2回で止まり、残りの候補は残る
  3. `usage.run` の中だけ集める・単価は環境変数
  4. 管理の API は合言葉が必要
- `node --test test/*.test.cjs`：232件 成功（アプリは変更なし）
- Playwright（API はモック）：`admin/catalog.html` を 390×844・1440×900 で。ページのエラー・横スクロールなし（表は枠の中で横に動く）。画像 `docs/review/seed/`

## 6. 影響
- アプリ・版：変更なし（管理の画面と API だけ）。公開すると API がデプロイされる
- 費用：ボタンを押した時だけ。1段階100円（目安）・月1,000円の中
- YouTube API の枠：1段階で検索は数回（1回100単位）

## 7. コードだけでは完了できないこと
- ボタンを押す・結果を見て次を決める（ユーザー）
- 実測の費用と Google Cloud の請求を見比べる（単価・為替は環境変数で直せる）

## 8. ロールバック
- revert で戻る。`trends/seed` と seed の週は、古い版では普通の週として28日で消える
