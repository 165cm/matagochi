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

- `GET /api/recipes/:id`: 比較用の現在の共通版。分析は実行しません。
- `POST /api/recipes/corrections`: `{ catalogId, baseRevision, reason, recipe: { title, ingredients, steps, sourceServings } }` を送り、201で `{ proposalId, status: "pending" }` を返します。共通版は変更しません。
- `POST /api/admin/corrections/:id/review`: `Authorization: Bearer <RECIPE_ADMIN_TOKEN>` と `{ decision: "approve" | "reject" }`。管理トークン未設定・不一致は403。審査は運営が出典を照合した後に実行します。

`AI_DAILY_LIMIT=100`、`AI_MONTHLY_LIMIT=1000` が既定値。UTC基準、失敗分を含めて全インスタンス共通で予約します。`AI_IMPORT_ENABLED=false` で新規分析のみ停止します。単なる回数上限であり金額上限ではないため、公開前に予算監視も設定してください。データ・入力本文をアプリのログに出力しません。

API全体にプロセス内IP毎分60回の補助制限を設けています。プロキシのIP転送を無条件に信頼せず、実際のデプロイ経路でIP制限を検証してください。JSON上限は通常64KB・同期24MBで、超過は413 JSON応答です。

復旧・審査・取り消しの手順は `../docs/RECIPE_DB_POLICY.md` を参照してください。pending/reviewingを時間だけで自動解除しません。GCSのusageと履歴は利用期間中にライフサイクル削除しないでください。
