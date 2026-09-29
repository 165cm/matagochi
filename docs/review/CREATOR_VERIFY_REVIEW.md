# レビュー資料（Codex 向け）：投稿者の本人確認（YouTubeでログイン）・参加申請・承認画面

## 再レビュー（Codex の指摘への対応）

| 指摘 | 直したこと | 再現テスト（`api/test/creatorVerify.test.js`） |
|---|---|---|
| [P1] 変更の申請を見送ると、取り消した同意が戻る | 見送りの時は、前に承認した同意と、いまの申請の同意の共通部分だけを残す（なければ「見送り」＝同意なし）。今の同意を過去の承認内容で上書きしない | 「review fix: rejecting a changed application…」。Codex の手順（保存・一般公開を承認 → 一般公開を外して再申請 → 見送り）で一般公開が戻らないこと。申請・承認・見送り・取り消しをどの順番で行っても、使える同意がいまの同意を超えないこと。`58587e9` では失敗することを確認 |

- 最新の main（#95 PR 1 の公開後 `b6ddc35`）を取り込み済み。コードの重なりはなし（説明文書のみ）

---

指示書：`docs/PERSONALIZE_PLAN.md` §8・§13 PR 3・§14・§16（この文書は PR 1 のブランチにあり、まだ main にはない）。仕様：`docs/APP_MAP.md` §40。PR 3 の本体①。
ユーザーの決定（2026-09-30）：本人確認は YouTube へのログイン／参加申請は承認画面を作り、運営が手で確認する。

## 1. 対象
- ブランチ：`claude/creator-verify`（`main` `73f04a0`＝#96 の入った main から。#95・#97 には積んでいない）
- 対象コミット：PR のコミット一覧を参照

## 2. 問題・変更後・含めない範囲
- **問題**：投稿者本人を確かめる手段がなく、掲載停止は第三者でも申し込めて運営の手作業でしか確定できなかった。参加（許諾）を受け付ける窓口もなかった
- **変更後**
  - `creatorAuth.js`：Google の `tokeninfo` で「リピごち向け（`aud`/`azp`）・期限内・`youtube.readonly` あり」を確かめ、`channels.list mine=true` で持ち主のチャンネルを得る。持ち主のチャンネルIDだけを入れた2時間の HMAC 署名の合い鍵を返す。Google のトークンは保存しない
  - `creators.js`：持ち主だけの停止（その場で確定）・再開・参加申請・参加をやめる。合い鍵にないチャンネルは 403。同意は5項目を別々に持ち、承認した同意だけが有効。減らした同意はすぐ無効、増やした同意は承認まで無効
  - `creators.html`：「YouTubeでログイン」と、チャンネルごとの操作・参加申請フォーム
  - `admin/creators.html`：承認画面（参加申請の承認／見送り、停止の確定／掲載に戻す）。外からの文章は `textContent` だけで表示
- **含めない**：同意を実際のカタログ公開に使うこと（PR 4）、修正依頼、投稿者向けレポート、動画単位の停止、Google の OAuth 審査の申請（ユーザーの作業）

## 3. 満たした受け入れ条件（§14）
- 未確認の許諾・投稿者を、公開可・本人確認済みにできない：申請は `pending` のまま。承認は管理の合言葉が必要。承認前の `consentsFor` はすべて `false`（`api/test/creatorVerify.test.js`）
- 他人のチャンネルを修正・再掲載できない：停止・再開・申請・取り消しとも 403（同）。合い鍵の改ざん・期限切れ・別アプリ向けのトークン・許可の不足・チャンネルなしを拒否（同）
- 第三者の停止申請と、確認済み投稿者の管理権限を分離：第三者は確認待ち（§38）、持ち主はその場で確定・再開（同）
- AI抽出・保存・要約・人数換算・一般公開の範囲を、同意情報として別々に管理（同）
- 投稿者の許可と YouTube の利用規約を別物として扱う（画面の説明・`consentsFor` は許可だけを返す）

## 4. テスト
- `npm test --prefix api`：109件 成功（PR 1 公開後の main の105件＋`creatorVerify.test.js` 4件）。`node --test test/*.test.cjs`：164件 成功
- `node --test test/*.test.cjs`：144件 成功（アプリは変更なし）
- `git diff --check`・`node --check`
- Playwright：ページをローカルの API（メモリ保存・Google は偽物）につなぎ、390×844／844×390／1440×900 で「YouTubeでログイン → 自分のチャンネル → 同意を選んで申請 → 承認画面で承認 → 投稿者の画面で承認ずみ → 掲載を止める」を通した。申請文とチャンネル名に入れた `<script>`・`<img onerror>` は実行されない。ページのエラー・横スクロールなし。画像 `docs/review/creator-verify/`
- 未実行：本物の Google・YouTube との通信（OAuth の設定が必要。下の 7）

## 6. 影響
- 保存：`creators/applications`（申請と同意）・`creators/secret`（合い鍵の署名の鍵。サーバーが初回に作る）を新設。`creators/optout` に `by: "owner"` を足した
- API：ルートを足しただけ（`/api/creators/verify`・`/api/creators/me`・`/api/creators/me/:channelId/:action`・`/api/admin/creators/applications*`）。既存の答えの形は同じ
- 外部への通信：本人確認の時だけ `oauth2.googleapis.com/tokeninfo` と `youtube/v3/channels`（YouTube API の枠を1回使う）。AI は使わない
- 個人情報：申請の連絡先・メッセージは管理 API と承認画面だけで見える。投稿者に利用者の情報は渡さない

## 7. コードだけでは完了できないこと（ユーザーの作業）
1. Google Cloud の「OAuth 同意画面」に、スコープ `https://www.googleapis.com/auth/youtube.readonly` を追加
2. この許可は Google の審査の対象（機密性の高いスコープ）。審査が通るまでは「テスト」状態で、テストユーザーに登録した Google アカウント（100人まで）しかログインできない。協力投稿者のアカウントをテストユーザーに足すか、審査を申請する
3. OAuth クライアント（`GOOGLE_CLIENT_ID` と同じもの）の「承認済みの JavaScript 生成元」に `https://165cm.github.io` があること（アプリのGoogleログインで設定済みなら不要）
4. Cloud Run に `GOOGLE_CLIENT_ID` が設定されていること（同上）

## 8. ロールバック・既知の制約
- revert で戻る。持ち主が止めたチャンネルは `creators/optout` の `channels` に残る（以前の版でも止まったまま）
- 合い鍵は2時間で切れる（持ち主が変わる場合に備えて短く）
- 同意の変更の履歴は申請ごとに20件まで
