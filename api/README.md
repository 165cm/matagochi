# matagochi-api

YouTube説明文から材料メモを作成し、合言葉同期のデータを保存するCloud Run用APIです。

## Setup

```bash
cp .env.example .env
npm install
npm test
npm start
```

必要な環境変数:

- `YOUTUBE_API_KEY`
- `GOOGLE_CLOUD_PROJECT`
- `GOOGLE_CLOUD_LOCATION`
- `GEMINI_MODEL`
- `ALLOWED_ORIGINS`
- `SYNC_BUCKET`（合言葉同期の保存先Cloud Storageバケット名。未設定時は同期APIが503を返す）
- `SYNC_STORE=memory`（ローカル開発用。バケットの代わりにメモリへ保存し、再起動で消える）

## Endpoint

`POST /api/import/youtube`

```json
{
  "url": "https://www.youtube.com/shorts/abcdefghijk"
}
```

YouTube Data APIでタイトル・説明文・チャンネル名を取得し、Vertex AIのGemini Flashで材料、手順、タグ、メモ候補に整形します。字幕トラックは取得しません。

`GET /api/sync/rooms/:roomId`

合言葉同期のデータ取得。`roomId` はフロントが合言葉から導出するSHA-256ハッシュ（64桁hex）で、合言葉そのものはサーバーへ届きません。未作成のルームは `{ "found": false }` を返します。

```json
{
  "found": true,
  "revision": "uuid",
  "updatedAt": "2026-07-06T00:00:00.000Z",
  "data": { "recipes": [], "evaluations": [] }
}
```

`PUT /api/sync/rooms/:roomId`

合言葉同期のデータ保存。`{ "baseRevision": "...", "data": { ... } }` を受け取り、`baseRevision` がサーバーの現在のrevisionと一致しない場合は409を返します（クライアントは取り直してマージ後に再送）。書き込みはCloud Storageの `ifGenerationMatch` でも保護します。ボディ上限は24MB（料理写真のdata URLを含むため）。

## 合言葉同期の保存先バケット

```bash
gcloud storage buckets create gs://<bucket-name> --location=us-central1 --uniform-bucket-level-access
gcloud storage buckets add-iam-policy-binding gs://<bucket-name> \
  --member="serviceAccount:<cloud-run-service-account>" \
  --role="roles/storage.objectUser"
```

作成後、Cloud Runサービスに `SYNC_BUCKET=<bucket-name>` を設定します。データは `rooms/<roomId>.json` に1ルーム1オブジェクトで保存されます。長期間使われないルームを掃除したい場合は、バケットのライフサイクルルールで対応できます。

## 共通レシピDB

`RECIPE_BUCKET`（省略時は`SYNC_BUCKET`）を設定すると、既存GCSアダプターを使用して `recipe-catalog/` に共通レシピ・分析予約・修正提案・版履歴・使用枠を保存します。非公開バケットにCloud Runサービスアカウントの読み書き権限が必要です。ローカルのみ `RECIPE_STORE=memory` を利用できます。保存先未設定時は分析を503で停止します。

`POST /api/import/youtube` は動画IDで再利用し、応答に `catalog`（ID・版等）、`cacheHit`、`sourceServings`（不明はnull）を追加します。同一インスタンスの同時要求は結果を共有、別インスタンスが分析中なら409です。失敗は1分後に再試行可能です。

`POST /api/import/youtube/playlist` は `{ "url": "https://www.youtube.com/playlist?list=..." }` を受け取り、公開・限定公開の再生リストの動画（ID・URL・タイトル・チャンネル名・説明文先頭3000字・サムネイル）を先頭200件から重複を除き最大200本返します。AI解析とAI使用枠の消費はありません（YouTube Data APIのクォータはメタ情報を含め1回最大9ユニット）。非公開・削除済み動画は `skipped` に件数だけ入ります。「後で見る」（WL）・「高評価」（LL）・自動ミックス（RD…）は422、見つからない・非公開の再生リストは404です。

- `GET /api/recipes/:id`: 比較用の現在の共通版。分析は実行しません。
- `POST /api/recipes/corrections`: `{ catalogId, baseRevision, reason, recipe: { title, ingredients, steps, sourceServings } }` を送り、201で `{ proposalId, status: "pending" }` を返します。共通版は変更しません。
- `POST /api/admin/corrections/:id/review`: `Authorization: Bearer <RECIPE_ADMIN_TOKEN>` と `{ decision: "approve" | "reject" }`。管理トークン未設定・不一致は403。審査は運営が出典を照合した後に実行します。

`AI_DAILY_LIMIT=100`、`AI_MONTHLY_LIMIT=1000` が既定値。UTC基準、失敗分を含めて全インスタンス共通で予約します。`AI_IMPORT_ENABLED=false` で新規分析のみ停止します。単なる回数上限であり金額上限ではないため、公開前に予算監視も設定してください。データ・入力本文をアプリのログに出力しません。

API全体にプロセス内IP毎分60回の補助制限を設けています。プロキシのIP転送を無条件に信頼せず、実際のデプロイ経路でIP制限を検証してください。JSON上限は通常64KB・同期24MBで、超過は413 JSON応答です。

復旧・審査・取り消しの手順は `../docs/RECIPE_DB_POLICY.md` を参照してください。pending/reviewingを時間だけで自動解除しません。GCSのusageと履歴は利用期間中にライフサイクル削除しないでください。


## 画像AI取り込み

`POST /api/import/images` は `{ clientKey, images: [{ mimeType, data }] }` を受け取ります。clientKeyはブラウザセッションごとの暗号学的乱数32バイト（64桁hex）、dataはBase64です。URL・個人メモ・ファイル名は送信しません。AIへ渡すのは再エンコード済み画像と抽出指示のみです。

- 1〜5枚、JPEG/PNG/WebP、送信画像は各1MiB以下、JSON全体7MiB以下。サーバーで実データとMIMEの一致・破損・アニメーション・最大1200万画素を検証。
- sharpで向き補正・長辺1600px以内へ縮小・JPEG再エンコードし、EXIF等のメタデータを除去。フロントでも縮小し、元ファイルは各10MiB・2500万画素以下。HEICは対象外。
- 材料・分量・手順・人数・warningsを返す。分量不明は「不明」、人数不明はnull。複数料理を検出した場合は422で1料理への絞り込みを案内する。
- 画像もYouTubeと同じ日次/月次利用枠・緊急停止を利用。プロセス内の同時画像解析は4件まで。
- HMAC（セッションキー＋順序付き画像内容）で同一要求を識別し、GCS `recipe-catalog/image-jobs/` に内容を含まない処理マーカーだけを条件付き保存。元画像・セッションキー・抽出本文をGCSには保存しない。
- 抽出結果の再利用は同じセッション・同じ画像・同じプロセスで最大10分、最大32件のメモリ内のみ。TTLタイマーで破棄する。再起動・別インスタンス・期限切れ後は再取得できないことがあり、409を返して自動再課金を防ぐ。これはアカウントによる認証・端末を跨ぐキャッシュではない。
- クライアントのキャンセルは受け取り停止。サーバーの課金済み処理を取り消す保証はない。AI開始後の失敗・不明応答も再分析を自動許可しない。
- 同じ画像の再取得が必要でマーカーしか残っていない場合は、運営が停止済みであること・再課金を確認してから対象マーカーを世代一致条件でリセットする。無条件削除や稼働中の解除はしない。

クライアントは画像をページのメモリだけに保持し、レシピ状態・JSONバックアップ・合言葉同期へ含めません。利用者が確認して保存した抽出テキストは通常のマイレシピになり、同期を使う場合はそのレシピテキストが同期されます。Google側の取り扱い・ログ基盤でのリクエスト本文非記録は本番構成で確認してください。

再生リスト取得は全体45秒、1リクエスト15秒、最大4ページ。同一インスタンス内の同時取得をまとめ、最大100件・5分の短期キャッシュを使います。IPあたり毎分6回（既存の全API制限とは別）です。分散インスタンス全体のYouTubeクォータ上限ではありません。health応答の `capabilities.playlistImport` がtrueになるとフロントの入口が表示されます。
