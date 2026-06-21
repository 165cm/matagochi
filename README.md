# またごち

家族の「また食べたい」を残す、ごはんメモ。

SNSで見つけたレシピ動画を保存して、作ったら家族の星評価を記録。
「また作る？」がひと目でわかる、忙しい家庭のごはんメモです。

## MVPでできること

- Instagram / Facebook / TikTok / YouTube Shorts のURL判定
- ショート動画レシピの保存
- キャプションから材料と調理方法を抽出
- 保存済みレシピの検索
- 家族の星評価と「次はいつ頃食べたいか」の記録
- ブラウザのlocalStorageへの保存

## 公開URL

GitHub Pagesで公開後、以下のURLで確認できます。

https://165cm.github.io/matagochi/

## GitHub Pagesへの公開

このリポジトリは静的サイトなので、`main` ブランチへのpushで `.github/workflows/pages.yml` がGitHub Pagesへデプロイします。

初回だけ、GitHubのリポジトリ設定で Pages の Source を `GitHub Actions` に設定してください。

## GitHub Pagesでの注意

このMVPは静的サイトとして動きます。

GitHub Pagesで動くこと:

- URL入力
- 対応サービス判定
- キャプション貼り付け
- 材料・調理方法の抽出
- レシピ保存
- 評価保存

GitHub Pagesだけでは動かないこと:

- SNS URLからキャプション本文を自動取得すること
- 複数端末間のデータ同期

SNSキャプションの自動取得には、将来的にバックエンド/API連携が必要です。
