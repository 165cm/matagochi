# AGENTS.md（Codex などの入口）

リピごち（公開URL: https://165cm.github.io/matagochi/）の開発ガイドの**目次**です（内容は `CLAUDE.md` と同じ。どちらかを直したら、もう片方も直す）。詳しいことは `docs/` が正本（system of record）。ここに仕様を書き足さず、`docs/` を更新してください。

## 最初に読む（この順）

1. `docs/CURRENT_TASK.md` … いまの状態・次のタスク・変えてはいけないもの
2. `docs/DEVELOPMENT.md` … ブランチ／worktree・PR・テスト・バージョン・デプロイの手順
3. `docs/ARCHITECTURE.md` … ファイル構成・データ・API
4. `docs/UI_RULES.md` … 画面の文字・余白・キャラクター「よはく」のルール
5. `docs/PRODUCT.md` … 何を作っているか・やらないこと
6. 機能ごとの詳しい仕様は `docs/APP_MAP.md`（章番号つき）

## 4つのルール

1. `main` を直接触らない（1タスク＝1ブランチ／worktree → PR）
2. 本番公開（PRのマージ）の前に、必ずユーザーに「PR #N を本番公開してよいですか？」と確認する
3. 仕様・決めごとの変更は、チャットだけでなく `docs/` にも残す（`docs/CURRENT_TASK.md` を最新に）
4. Claude と Codex に同じファイルを同時に編集させない（担当は `docs/CURRENT_TASK.md` の「作業中」に書く）

## やりとり

- ユーザーへの返答は**日本語**。コピペが必要なテキストは、1つずつコードブロックに分ける
- ユーザーはプログラミング初心者。専門用語は言い換えて、手順は1つずつ
