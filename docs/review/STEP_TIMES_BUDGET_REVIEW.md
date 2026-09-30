# レビュー資料（Codex 向け）：手順の時刻探しの接続先切り替えも AI の予算に数える

## 1. 対象
- ブランチ：`claude/step-times-budget`（最新の `main` `7b9918a` から）。PR 2c（#101）とは別のブランチで、触るファイルは重ならない

## 2. 問題・変更後・含めない範囲
**問題**（#97 の Codex レビューで残った宿題・`docs/CURRENT_TASK.md` の「次のタスク」7）：手順の時刻を探す `analyzeStepTimes`（「▶ 2:15」用）は、動画の読み取りの接続先（Gemini API → Vertex の地域 → Vertex global）を切り替えても、最初の1回しか AI の1日の予算（`catalog.reserveAnalysisBudget`）を数えていなかった。1回の依頼で最大3回 AI を呼べた

**変更後**
- `api/src/analyzer.js`：`analyzeStepTimes` が `beforeRetry`・`clients` を受け取り、`generateFromVideo` に渡す（`analyzeRecipeVideo` と同じ）。予算で断られた時（`fromBudget`）は「場面を見つけられませんでした」に包み直さず、予算の理由のまま伝える
- `api/src/timecodes.js`：動画から探す時に `beforeRetry: reserveBudget` を渡す。最初の1回は今までどおり呼ぶ前に予約、切り替えの直前ごとにも予約。断られたら次の接続先へ進まない

**含めない範囲**：説明欄の章との照らし合わせ（`matchStepsToChapters`）は文字だけで接続先の切り替えがないので変更なし。1家庭1日の本数の上限（20本・試し40回）も変更なし

## 3. 受け入れ条件
- 失敗を成功扱いしない・予算の断りを別の失敗に見せない
- AI を呼ぶ回数が予算の数と一致する

## 4. テスト
- `npm test --prefix api`：124件 成功（123件＋1件：「step times: switching the AI endpoint is counted against the AI budget…」。1本目が落ちて2本目で成功 → 予算は2回。切り替えの直前で予算が尽きる → 2本目を呼ばずに `ai_budget` で止まる）
- 追加したテストは、修正前のコードでは失敗することを確認
- `node --test test/*.test.cjs`（アプリ）：変更なし

## 6. 影響
- API のみ（マージで `deploy-api.yml` が動く）。画面・保存形式・同期は変更なし
- AI の費用：1回の依頼で予算の外に出る呼び出しがなくなる。予算が尽きかけている日は、切り替え先を試さずに止まる分、時刻が見つからないことが増え得る（その時は「今日はここまで」の扱いと同じ）

## 8. ロールバック
- revert で戻る
