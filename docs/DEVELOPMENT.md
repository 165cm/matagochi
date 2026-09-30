# 開発の進め方（Claude Code・Codex 共通）

## ブランチと worktree

正本は GitHub の `165cm/matagochi`。`main` が本番（GitHub Pages とAPIに自動デプロイ）。

- **1タスク＝1ブランチ**。Claude は `claude/…`、Codex は `codex/…` から始める
- 手元で並行して作業する時は、エージェントごとに別の worktree を使う（同じフォルダを2つのAIに触らせない）

```
git fetch origin
git worktree add ../matagochi-claude -b claude/<タスク名> origin/main
git worktree add ../matagochi-codex  -b codex/<タスク名>  origin/main
```

- 始める前に `docs/CURRENT_TASK.md` の「作業中」に、担当（Claude／Codex）・ブランチ・触るファイルを1行書く。同じファイルを同時に編集しない
- 終わったら、その1行を消して「最近終わったこと」に移す

## PR と公開

1. ブランチで作業 → テスト → コミット → push → PR を作る（`.github/pull_request_template.md` に沿って書く）
2. **ユーザーに「PR #N を本番公開してよいですか？」と確認**。OK が出てからマージ（squash）
3. マージ後、作業ブランチは `origin/main` から作り直す（同じ名前を使い回す時は `git checkout -B <branch> origin/main` → `git push --force-with-lease`）
4. 相互レビュー：片方のAIが作ったPRを、もう片方がレビューしてから公開するとよい（思考のクセが違うので抜けが見つかりやすい）

- コミットメッセージは Conventional Commits（`feat:` `fix:` `docs:` など）。本文は日本語で「何を・なぜ」
- APIキー・トークン・`.env`・個人情報はコミットしない。秘密の値はチャットに貼らせず、ユーザーに `gcloud` コマンドで設定してもらう
- モデル名（Claude／GPT のバージョン名）をコミット・PR・コードに書かない

## テスト

```
node --test test/*.cjs                 # アプリ（vanilla JS）。今は 169件
cd api && node --test                  # API（Node）。今は 123件
```

- CI（`.github/workflows/test.yml`）は PR ごとに上の2つと `node --check`、`git diff --check` を回す
- 画面の確認は Playwright（Chromium）で、`python3 -m http.server 8124` を立てて `http://127.0.0.1:8124/` を開く。APIは `https://matagochi-api-292190013809.us-central1.run.app/**` をモックする
- 見た目を変えた時は、スマホ縦（390×844）・横（844×390）・パソコン（1440×900）で確認する

## 画面を変えた時に必ずやること（キャッシュ）

アプリはサービスワーカーでキャッシュしているので、**変更のたびに版を上げる**。上げないとスマホに古い画面が残る。

- `app.js` の `APP_VERSION`、`sw.js` の `APP_VERSION`、`index.html` の `?v=` を**同じ文字列**に（例：`20260929-pantry`）。まとめて置き換えるなら：
  `grep -rl "旧版" --include=*.js --include=*.html . | xargs sed -i 's/旧版/新版/g'`
- `sw.js` の `CACHE_NAME`（`ripigochi-vNNN`）の数字を1つ上げる

## 新しい JS ファイルを足す時

次の4か所すべてに足す（読み込み順は `docs/ARCHITECTURE.md`）。

1. `index.html` の `<script src="…?v=…">`
2. `sw.js` の `CORE_ASSETS`
3. テストの読み込み一覧：`test/dinner.test.cjs`・`test/weekly.test.cjs`・`test/plus.test.cjs`（シングルクォート）、`test/lifestyle.test.cjs`・`test/playlist.test.cjs`・`test/profile-talk.test.cjs`（ダブルクォート）
4. テストは `document` の一部しか無い環境で動くので、`document.addEventListener` などは `?.` で守る

## デプロイ

- **アプリ**：`main` にマージすると GitHub Pages に自動で出る（`.github/workflows/pages.yml`）。反映まで数分
- **API**：`api/**` が変わったマージで Cloud Run（`matagochi-api`）に自動デプロイ（`.github/workflows/deploy-api.yml`）
- 環境変数は `docs/ARCHITECTURE.md` の一覧。値の設定・変更はユーザーが `gcloud run services update` で行う

## docs を更新する

- 仕様を変えたら `docs/APP_MAP.md` の該当の章を直す（新しい機能は章を足す）
- 決めごと・次のタスクが変わったら `docs/CURRENT_TASK.md`
- 画面のルールが変わったら `docs/UI_RULES.md`
