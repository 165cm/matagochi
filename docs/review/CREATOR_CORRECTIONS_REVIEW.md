# レビュー資料（Codex 向け）：投稿者の修正依頼の窓口・動画単位で一覧から外す（PR 3 の残り）

指示書：`docs/PERSONALIZE_PLAN.md` §8（「公開ページに『参加申請』『修正依頼』『掲載停止』を用意」「第三者からの停止申請と、確認済み投稿者の管理権限を分離」）。仕様：`docs/APP_MAP.md` §38（今回追記）。

## 1. 対象
- ブランチ：`claude/creator-corrections`（最新の `main` `7b9918a` から）。#101・#102・#103 とは別のブランチ。#103 と重なる可能性があるのは `api/src/trends.js`（別の行）・`api/src/server.js`（別の行）・`docs/*`

## 2. 問題・変更後・含めない範囲
**問題**：投稿者ページに修正依頼の窓口がなかった（APP_MAP §38「まだないもの：修正依頼、動画単位の停止」）。止める単位がチャンネルしかなく、1本の動画の内容が違うだけでもチャンネルごと止めるしかなかった

**変更後**
- `api/src/creators.js`
  - `correction({ video, kind, message, contact, hide }, owned)`：動画のURL・直してほしいところ（6種類から）・内容（必須・1000字）。動画のチャンネルを調べ、**合い鍵のチャンネルと合う時だけ `verified`**。`hide` は持ち主の時だけ効き、その場で動画を一覧から外す
  - 掲載停止の文書に `videos`（動画単位で外したもの）。`optedOut()` の集まりに動画IDも入れる
  - 持ち主：`mine()` に外している動画、`ownerShow()` で戻す（その動画を外した時のチャンネルが合い鍵にある時だけ）
  - 管理者：`corrections()`（一覧・いま外している動画）・`decideCorrection(id, { decision: hide|show|done|declined })`
- `api/src/server.js`：`POST /api/creators/corrections`（合い鍵があれば確かめる。壊れた合い鍵は 401）・持ち主の操作に `show`・`GET /api/admin/creators/corrections`・`POST /api/admin/creators/corrections/:id/decide`（管理の合言葉）
- `api/src/trends.js`・`popular.js`・`variants.js`：`optedOut` の集まりにある動画IDも外す（新着の集める・見せる、みんなの定番、ほかの作り方）
- `creators.html`：「レシピの内容の修正を依頼する」フォーム。ログインしている時だけ「直るまで一覧から外す」。持ち主のチャンネルの欄に、外している動画と「一覧に戻す」
- `admin/creators.html`：「修正依頼」の欄（ご本人か・種類・状態・外しているか・内容・連絡先。一覧から外す／戻す・対応済み・見送り）。依頼の文は外から来るので `textContent` だけで入れる

**含めない範囲**：承認画面からレシピの中身を直接直す画面（今は共通レシピの修正 `/api/recipes/corrections` の仕組み）、投稿者への返信のメール送信、動画単位の外しを利用者の端末に保存したレシピに反映すること（利用者のものなので対象外）

## 3. 受け入れ条件
- 第三者の依頼で掲載を確定しない：ログインしていない人の依頼は受け付けるだけ（`hide` は無視）
- 持ち主は自分の動画だけ（よその動画は `verified:false`・外せない・戻せない）
- 外部の文を HTML として入れない

## 4. テスト
- `npm test --prefix api`：126件 成功（123件＋3件：依頼の検査・ご本人の印と外す／戻す・よその動画・管理の流れ／HTTP の経路と合言葉・壊れた合い鍵は 401／外した動画が一覧から消える）
- Playwright（API はモック）：390×844・1440×900 で、ログインしていない依頼（「外す」は出ない）→ ご本人として依頼（外す）→ 外している動画と「一覧に戻す」→ 承認画面の修正依頼（`<b>` を含む依頼が文字のまま出る）。ページのエラー・横スクロールなし。画像は `docs/review/creator-corrections/`
- 未実行：本物の Google ログインでの確認（#98 と同じく、Google Cloud の設定が必要）

## 6. 影響
- API と、投稿者ページ・承認画面（アプリ本体は変更なし）。マージで `deploy-api.yml` と GitHub Pages
- 保存：`creators/optout` に `videos` を足した（古い版は読まないだけ。古い版で書き戻すと `videos` が消えるが、API は1つなので、公開後は新しい版だけ）・`creators/corrections`（新規）
- YouTube API：依頼1件につき動画の情報を1回（`videos.list`・1単位）

## 7. コードだけでは完了できないこと
- 修正依頼を受けた後、レシピの中身を直す作業（運営）
- 依頼の連絡先への返信（運営が手で）

## 8. ロールバック
- revert で戻る。外した動画の記録（`videos`）は古い版では無視される（＝一覧に戻る）
