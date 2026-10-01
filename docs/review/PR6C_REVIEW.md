# PR 6c レビュー資料（Codex 向け）：記録のカレンダー・再調理の計測

指示書：`docs/PERSONALIZE_PLAN.md` §10（「記録内：カレンダー／定番／わかってきた好み」）・§11 計測（「過去の記録からの再調理」）・§13 PR 6（カレンダー）。仕様：`docs/APP_MAP.md` §42（追記）・§28（計測の一覧）。これで PR 6 の残りを終える。

## 1. 対象
- ブランチ：`claude/optimistic-albattani-jg5211`（main `09f1ac0` から）

## 2. 問題・変更後・含めない範囲
**問題**：記録（ふりかえり）にはカレンダーがなく、写真の一覧だけだった（以前の「最近のごはん」カレンダー `renderMealCalendar` はどこからも呼ばれていなかった）。「過去の記録からの再調理」は計測していなかった

**変更後**
- `daily-ui.js`
  - `renderRecordCalendar(list, monthKey, recipeOf, photoOf)`：表示中の月（`reflMonth`）の記録を、日曜はじまりの7列で。作った日は写真（記録の写真があればそれ）、同じ日に2品以上は「+1」、タップでその日のいちばん新しい記録を開く（`life-edit-record`）。今日に枠。月の前の空き・先の日は空
  - 「わたしの食卓」に「📅 カレンダー／🖼 写真」の切り替え（`life-refl-view`。既定はカレンダー。`localStorage` に覚えるが、使えなくても動く）
  - 「もう一度、献立に入れる」で**実際に日が入った時だけ** `trackDaily("meal_replanned")`（「もう入っています」・入れる日がない時は数えない）
  - 使われていなかった `renderMealCalendar` を削除（`calPick` は献立の週の表〔household.js〕が使うので残す）
- `plus.js`・`api/src/usage.js`：`USAGE_EVENTS` に `meal_replanned`。管理の集計の日ごとに `replanned`（その日に使った人の割合）
- `styles.css`：`.record-cal`・`.cal-cell.is-blank`・`.is-later`・`.cal-more`・`.view-switch`
- 版：`APP_VERSION` `20261001-calendar`・`CACHE_NAME` `ripigochi-v135`

**含めない範囲**：献立（これから）の予定をカレンダーに出すこと（献立タブの週の表にある）・記録のない日に記録を足す操作（今までどおり献立から）

## 3. 受け入れ条件
- 記録の中にカレンダー・定番・わかってきた好みがそろう
- 計測：料理名・自由記述を送らない（回数だけ）。古い版の API は知らない名前を捨てる（今までどおり）
- 保存・同期の形は変えない

## 4. テスト
- `node --test test/*.test.cjs`：222件 成功（`test/records.test.cjs` に2件。**2件とも修正前のコードでは失敗することを確認**）
  1. 2026年10月：前の空き4つ・31日・2品の日に「+1」と2品の名前・今日の枠・前の月の記録は出ない／写真の一覧に切り替え／9月（空き2つ）
  2. `meal_replanned` は日が入った時だけ1回（2回目の「もう入っています」は数えない）・その日の集計に入る
- `npm test --prefix api`：142件 成功（`replanned` の割合・知らない名前は捨てる）
- Playwright（API はモック）：390×844・844×390・1440×900 で、今月のカレンダー → 先月 → 写真の一覧 → カレンダーの日をタップで記録を開く。ページのエラー・横スクロールなし。画像は `docs/review/pr6c/`

## 6. 影響
- 保存・同期：変更なし（見せ方は端末の `localStorage` だけ）
- API：集計の名前が1つ増えた。公開すると API もデプロイされる
- AI の費用：変更なし

## 8. ロールバック
- revert で戻る。集計に残った `meal_replanned` は古い版の API では捨てられる
