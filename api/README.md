# matagochi-api

YouTube説明文から材料メモを作成するCloud Run用APIです。

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

## Endpoint

`POST /api/import/youtube`

```json
{
  "url": "https://www.youtube.com/shorts/abcdefghijk"
}
```

YouTube Data APIでタイトル・説明文・チャンネル名を取得し、Vertex AIのGemini Flashで材料、手順、タグ、メモ候補に整形します。字幕トラックは取得しません。
