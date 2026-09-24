# LP画像の一覧と生成プロンプト

LP（`lp/index.html`）は「ときめきUI」のデザイン案（アプリ5タブのモックアップ）をもとにしています。
アプリ本体の見た目はまだデザイン案に追いついていないため、LPでは画面の近くと
フッターに「画面はイメージです（一部開発中）」と明記しています。アプリを更新したら、
実際の画面に差し替えて注記を外してください。

## 配置済み

| ファイル | 内容 | 作り方 |
| --- | --- | --- |
| `screen-today.webp` など `screen-*.webp`（5点） | 今日・献立・買い物・レシピ・ふりかえりの画面 | デザイン案のモックアップからステータスバーを除いて幅640pxに縮小 |
| `dish-*.webp`（6点） | 料理写真の帯 | レシピ画面のモックアップから、アイコンを避けて料理部分だけ切り出し |
| `ogp-2026.jpg` | SNS共有用（1200×630） | 料理写真と献立画面の合成。**文字なしの暫定版** |

## 追加で生成してほしい画像

共通指定（各プロンプトの末尾に付ける）:

```
Style: bright, appetizing Japanese home-cooking photography with warm natural light,
matching a cream (#FFF8EE) background, tomato-orange accent (#EE6A4C) and soft yellow
highlight (#F6CF5B). Real-looking food, ceramic bowls, wooden table. No brand logos,
no watermarks. Any text must be large, correct Japanese.
```

1. `ogp-2026.jpg`（1200×630、置き換え）— 文字入りのSNS共有画像
2. `persona-*` は既存の `../assets/persona/*.webp` をそのまま使用（追加不要）
3. `scene-student.webp`（1200×900）— 共感セクション用の生活シーン写真（任意）

プロンプトはリポジトリ外の依頼メモ（チャット）で管理し、生成後はこの表に追記してください。

## 2026-09-24 画像追加

内蔵 imagegen で生成。使用したプロンプト全文は `assets/image-prompts.json`。
指定サイズへの書き出しとJPG圧縮は macOS sips を使用しました。

- `assets/ogp-20260924.jpg`：1200×630 JPG。文字入りOG画像。LPとアプリ両方で参照。旧暫定画像は参照解除。
- `../icons/icon-1024.png`：1024×1024、透過なしの原本。192/512px、maskable 512px、Apple 180px、favicon 32pxへ展開。
- `assets/scene-student.jpg`：1200×900 JPG。共感セクションの生成イメージ写真。

画面モックアップの近傍注記を全画面に追加。公開APIのhealthにplaylistImportがないため、再生リストは準備中表記に変更しました。

## 2026-09-24 コンセプト更新（待機リスト版LP）

- 主な対象を「ふたりの食卓（親子・カップル・夫婦）＋ひとり暮らし」に変更したため、`assets/scene-student.jpg` はLPから外しました（ファイルは残しています）。
- 次に欲しい画像：父と10代の娘が夜ごはんを囲むシーン（はじまりの話）、ふたりが同じ献立画面を見て笑うシーン、「最近食べたもの」を示すアプリ画面のモック。

- 追加（Codex生成）：`assets/scene-parent-child.webp`（よくある夜のおはなし）、`assets/scene-couple.webp`（ちょうどいい「また」）、`assets/screen-recent.webp`（ファーストビューの「最近のごはん」画面。ステータスバーを除去）。
- ファーストビューを `screen-recent.webp` に変更したため、`assets/screen-today.webp` は現在LPで未使用です。
