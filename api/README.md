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
