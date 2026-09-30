# しくみ（ファイル構成・データ・API）

## 全体

```
スマホ・PCのブラウザ（PWA）
  index.html + *.js（ビルドなしの vanilla JS、グローバル関数）
  データは端末の localStorage / IndexedDB（キー：matagochi-mvp-v1）
        │  家族で共有する時だけ同期
        ▼
API（Cloud Run: matagochi-api / Node + Express）  api/src/
  YouTube 取り込み・AI（Gemini）・同期・通知・チケット・集計
  保存は Google Cloud Storage（RECIPE_BUCKET / SYNC_BUCKET）
```

- 公開URL：アプリ https://165cm.github.io/matagochi/ ・LP `/lp/` ・規約 `/legal/`
- API：https://matagochi-api-292190013809.us-central1.run.app（`index.html` で上書きしている）

## アプリのファイル（読み込み順）

`index.html` の順に読み込む。後のファイルは前のファイルの関数を使える。

| ファイル | 役割 |
|---|---|
| `dinner-persona.js` `taste.js` `taste-ui.js` | 夜ごはんタイプ診断・好み |
| `starter-recipes.js` | 最初から入っている定番レシピ |
| `skills.js` | 料理のスキル（難しさ） |
| `aisles.js` | 買い物の売り場の分類 |
| `lifestyle.js` | **献立の決め方の中心**（`Lifestyle.propose`・理由・周期・旬・買い物リスト・常備品 `keeps`・わかってきたこと `insights`）。純粋な関数でテストしやすい |
| `profile-talk.js` `talk-ui.js` | わが家のごはん方針（質問・解釈・確認・版・献立の加点 `ProfileTalk`／その画面。APP_MAP §37） |
| `daily-ui.js` | **画面の大部分**（今日・献立・買い物・作る・ふりかえり・レシピの詳細・まとめて評価・よはく `yohaku()`） |
| `image-import.js` `playlist-import.js` | 画像・再生リストからの取り込み |
| `household.js` | 家族で使う（招待・リクエスト・今週のカレンダー） |
| `skill-quiz.js` `cook-level.js` | スキル診断・XP・バッジ |
| `weekly.js` | 1週間コンプのスタンプ（献立表の生成は止めている） |
| `cook-type.js` `plan-moves.js` | 料理タイプ・献立の入れ替え |
| `plus.js` | 無料／プラスの出し分け（`GATING_LIVE=false`）・β版のお礼と意見・使われ方の集計 |
| `folders.js` `install.js` `push.js` | 定番フォルダ・ホーム画面に追加・通知 |
| `tickets.js` | AIチケット |
| `cook-mode.js` | 作る画面の手助け（⏰タイマー・画面つけっぱなし・手順ごとの材料・🍳料理モード・✋手の形で操作） |
| `account.js` `discover.js` | ログイン・おすすめ／動画プレーヤー／▶の時刻 |
| `app.js` | 起動・状態の保存と同期・登録画面・設定・`APP_VERSION` |
| `styles.css` | すべての見た目（後ろに書いたものが優先） |
| `sw.js` | サービスワーカー（キャッシュ。版の上げ方は `DEVELOPMENT.md`） |
| `assets/` | 料理の写真・キャラクター `assets/yohaku/*.webp` など |
| `lp/` `legal/` | LP・規約とポリシー |

## データ（端末の中）

- `state` 1つにまとめて `localStorage`（`matagochi-mvp-v1`）へ。写真は IndexedDB
- 主な項目：`recipes`（保存したレシピ）・`mealSlots`（日付ごとの確定した献立）・`planOverrides`（入れ替え・自分で決めた一皿）・`evaluations`（作った記録と「また食べたい」周期 `familyRepeatCycles`）・`shoppingMarks`（買い物のチェック）・`foodProfile` / `householdProfile`（好み・器具・常備品 `pantry`）・`tasteProfile`（わが家のごはん方針。端末ごと・同期しない）・`family`・`requests`・`plus`・`trialFrom`
- レシピの材料：`{ name, amount, category, group? }`（`group` はタレ・合わせ調味料の印 "A" "☆" "タレ" など）
- 同期は `mergeMap`（`updatedAt` の新しい方が勝つ）。消す時は削除フラグで残す

## API（api/src/server.js）

| まとまり | 主なルート |
|---|---|
| 取り込み | `POST /api/import/youtube`（説明欄→AI、`mode:"video"` で動画をAIが読む・チケット1枚）・`/api/import/youtube/playlist`・`/api/import/images`・`/api/oembed/tiktok`・`/api/import/youtube/timecodes`（手順の時刻。AI の1日の予算の中で動き、動画の接続先を切り替える時も切り替えの直前ごとに予算を確かめる） |
| 同期 | `GET/PUT /api/sync/rooms/:roomId`（写真は `/photos/:hash`） |
| ログイン | `/api/auth/google`・`/api/auth/email/start`・`/api/auth/email/verify`・`/api/auth/me` |
| 通知 | `/api/push/*` |
| チケット | `GET /api/tickets`・`POST /api/tickets/claim` |
| 投稿者 | `POST /api/creators/request`（掲載停止の申し込み）・`/api/creators/verify`（YouTubeでログイン）・`/api/creators/me`（持ち主の操作）・管理 `/api/admin/creators*`（承認画面 `admin/creators.html`） |
| おすすめ | `/api/trends`・`/api/popular` |
| 意見・集計 | `POST /api/feedback`・`POST /api/usage`（管理：`/api/admin/*` は `RECIPE_ADMIN_TOKEN`） |
| その他 | `/api/skill/photo`・`/api/search/variants`・`/api/weekly/menu`（`WEEKLY_MENU=on` の時だけ）・`/api/recipes/*`・`/health` |

- AIへの指示は `api/src/analyzer.js`。取り込みの組み立ては `importRecipe.js`（AIが人数を取りこぼした時は `servings.js` のルールで読む）
- 環境変数：`GEMINI_API_KEY` `GEMINI_MODEL` `GEMINI_VIDEO_MODEL` `YOUTUBE_API_KEY` `RECIPE_BUCKET` `SYNC_BUCKET` `ALLOWED_ORIGINS` `RECIPE_ADMIN_TOKEN` `DEV_UNLOCK_CODE` `GOOGLE_CLIENT_ID` `RESEND_API_KEY` `MAIL_FROM` `PUSH_SUBJECT` `START_TICKETS` `AI_DAILY_LIMIT` `AI_MONTHLY_LIMIT` `VIDEO_ANALYSIS_ENABLED` `VIDEO_MAX_SECONDS` `WEEKLY_MENU` `TREND_PER_DAY` `TREND_WEEK_MAX`（新着の採用数：1日2・1週14が既定）`TREND_AI_PER_DAY` `TREND_AI_PER_WEEK`（新着集めが AI を呼ぶ回数：1日6・1週30が既定。APP_MAP §39）ほか

## 外部サービス

Google Cloud（Cloud Run・Storage・Gemini）／YouTube Data API／TikTok oEmbed／Resend（メール）／GitHub Pages／jsDelivr と Google（✋手の形の認識の部品 MediaPipe を初回に読み込む。映像は外に送らない）
