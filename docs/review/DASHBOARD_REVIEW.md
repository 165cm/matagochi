# レビュー資料（Codex 向け）：品ぞろえのダッシュボード・手順の時刻を直す・AI の答えの読み直し

ユーザーの要望（2026-10-01）：集めている表示をボタンの下に・進み具合の棒／結果を図で／検索語を見たい／増えた料理をレシピとして見たい／手順の時刻を確かめてその場で直したい／採用率・投稿者は別タブに／ダッシュボードとして使いやすく。あわせて、第1段階で5回出た `gemini_invalid_json` への対応。仕様：`docs/APP_MAP.md` §46-2。

## 1. 対象
- ブランチ：`claude/optimistic-albattani-jg5211`（main `26ecc6f` から）

## 2. 変更
- `api/src/analyzer.js`：`parseJsonResponse`（export）が、そのままで読めなければ最初の「{」から最後の「}」までを読み直す。AI はもう一度呼ばない
- `api/src/recipeCatalog.js`：`setStepTimes(url, stepTimes)`：読み取り結果の `stepTimes` を手順の数にそろえて直す（0〜36,000秒の整数か null）。`stepTimesFrom: "admin"`。世代つきで書き、重なったら 409
- `api/src/timecodes.js`：`fix(..., { admin: true })` は1日の回数の上限を使わず、`by: "admin"`
- `api/src/server.js`（すべて管理の合言葉）：
  - `GET /api/admin/recipes/:videoId`：保存済みの結果を読み出すだけ（`catalog.peek`。30日より古い説明文・見られない動画は今までどおり）。題名・投稿者・材料・手順・時刻・埋め込みできるか
  - `PUT /api/admin/recipes/:videoId/step-times`：`setStepTimes` と、手順が2つ以上で時刻があれば `timecodeBook.fix(admin)`（作る画面の ▶）
  - `GET /api/admin/trends/seed`：`queries`（検索語・分野・状態 done/current/todo）と `yenPerAi` を足した
- `admin/catalog.html`（書き直し）：上の数字・タブ（集める／採用率／投稿者）・ボタンの下の状態と目安の進み具合・段階の AI の回数の棒・自動で続ける（時間切れ→続ける、待ち→65秒後、止める）・段階の結果の図（AI で読んだ結果の積み上げ棒＋凡例の数と割合／AI の前に外した理由／分野ごと）・検索語の一覧・段階の記録・レシピのダイアログ（YouTube IFrame API で ▶／⏱、時刻を保存、YouTube／アプリの取り込み画面で開く）。外から来る文字は `textContent` だけ。合言葉は `sessionStorage`、タブだけ `localStorage`

## 3. 受け入れ条件
- 管理の API は合言葉がないと読めない・直せない
- レシピを見る・時刻を直す操作で AI を呼ばない
- 直した時刻は、新着・みんなの定番の一覧と、作る画面の ▶ の両方に使われる
- 画面はスマホでも横にはみ出さない（表は枠の中で横に動く）

## 4. テスト
- `npm test --prefix api`：164件 成功（新しく `api/test/adminRecipes.test.js` 3件）
  1. 前後に文がついた答え・```json の答えを読める／読めないものは今までどおり `gemini_invalid_json`
  2. 合言葉なしは 403、動画IDが正しくない 400、ない 404／レシピを読める／時刻を直すと手順の数にそろえ・負の値と余りを捨てて保存・`stepTimesFrom: "admin"`・timecodes に `fix`・`by: "admin"`
  3. 検索語の状態（済み・候補を読んでいる・これから）と `yenPerAi`
- `node --test test/*.test.cjs`：232件 成功（アプリは変更なし）
- Playwright（API と YouTube はモック・遮断）：390×844・844×390・1440×900 で、集める（図・検索語・段階の記録）→ 増えた料理を押してレシピ → 時刻を直して保存 → 採用率・投稿者のタブ。ページのエラー・横スクロールなし。画像 `docs/review/dash/`

## 6. 影響
- アプリ・版：変更なし。公開すると API がデプロイされる
- 保存：読み取り結果の `stepTimes`・`stepTimesFrom`、timecodes に `by: "admin"` の fix

## 8. ロールバック
- revert で戻る。直した時刻は残る（古い版でもそのまま使われる）
