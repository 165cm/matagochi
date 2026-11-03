const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("admin/catalog.html recipe modal redesign: 2-column, tabs, integrated step/time editor, player controls", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "admin", "catalog.html"), "utf8");

  // 1. 2カラム・レスポンシブ用のクラス定義
  assert.ok(html.includes(".dlg-body"), "has .dlg-body 2-column container");
  assert.ok(html.includes(".dlg-col-media"), "has .dlg-col-media left column");
  assert.ok(html.includes(".dlg-col-editor"), "has .dlg-col-editor right column");
  assert.ok(html.includes(".player-ctrl"), "has .player-ctrl playback controls bar");
  assert.ok(html.includes(".subtabs"), "has .subtabs container");
  assert.ok(html.includes(".step-editor-item"), "has .step-editor-item class");
  assert.ok(html.includes(".is-active-step"), "has .is-active-step highlight class");

  // 2. サブタブ定義（手順と時刻 / 材料・人数 / AIで作り直す・その他）
  assert.ok(html.includes('.subtab = "steps"'), "has steps subtab button");
  assert.ok(html.includes('.subtab = "ingredients"'), "has ingredients subtab button");
  assert.ok(html.includes('.subtab = "rebuild"'), "has rebuild subtab button");

  // 3. 動画操作バー（ちょい戻し・ちょい送り・再生切り替え）
  assert.ok(html.includes("-5秒"), "has rewind 5s button");
  assert.ok(html.includes("+5秒"), "has forward 5s button");
  assert.ok(html.includes("再生/一時停止"), "has play/pause toggle button");

  // 4. 手順・時刻の統合編集（別モードに切り替えず文と時刻を同じ行で編集可能）
  assert.ok(html.includes('step-text'), "has step text input");
  assert.ok(html.includes('step-time'), "has step time input");
  assert.ok(html.includes("いまの時刻"), "has current time grab button");
  assert.ok(html.includes("手順タブに写して手直しする"), "has adopt candidate to editor button");

  // 5. 一括保存バーおよび未保存変更の確認ロジック
  assert.ok(html.includes("dlg-footer-bar"), "has save bar");
  assert.ok(html.includes("変更があります。破棄して"), "has dirty check message before closing");

  // 6. 前へ・次への連続点検ナビゲーション
  assert.ok(html.includes("dlg-nav-btn"), "has previous/next nav button");
  assert.ok(html.includes("currentNavList"), "has currentNavList navigation");

  // 7. 動画位置の保持（再読み込み時に巻き戻らない）
  assert.ok(html.includes("player.getCurrentTime()"), "preserves playback position on update");

  // 8. レスポンシブ対応（スマホ・狭い画面用CSSメディアクエリ）
  assert.ok(html.includes("@media (max-width: 899px)"), "has responsive breakpoint");
  assert.ok(html.includes(".dlg-col-media { position: sticky;"), "sticky media column on narrow screen");

  // 9. 点検・一覧からの navList 連携
  assert.ok(html.includes("navList:"), "passes navList for continuous review");
});
