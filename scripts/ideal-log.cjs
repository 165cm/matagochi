#!/usr/bin/env node
/* 理想の12品のうち、まだそろっていない料理の探し方の点検（2026-11-24 のユーザーの依頼「集まらない4品の原因を見る」）。
   GET /api/trends/ideal-log（0円・数と自分たちの検索語だけ）を読んで、実行の要約に表を書く。判定（赤・緑）には使わない。
   使い方：node scripts/ideal-log.cjs ideal.json   （要約の書き先は環境変数 GITHUB_STEP_SUMMARY） */
const fs = require("node:fs");

// 外した理由の言い換え（api/src/trends.js の skip の理由）。
const WHY = {
  filtered: "題名・掲載停止・もう試した",
  same_channel: "同じ投稿者の3本目以降",
  description_not_recipe: "説明欄に作り方がない",
  not_public: "公開されていない",
  parent_full: "作り方がもう上限",
  parent_long: "20分以内はもう上限（30分以上だけ欲しい）",
  long_quota: "30分以上の枠がいっぱい",
  long_quota_free: "30分以上の枠がいっぱい（0円）",
  too_short: "晩ごはんにならない（短すぎ）",
  not_dinner: "晩ごはんではない",
  no_steps_in_description: "説明欄に手順がない",
  channel_cap: "投稿者が新着の3%に到達",
  channel_cap_read: "投稿者が新着の3%に到達（読んだ後）",
  channel_low: "作り方を書かない投稿者",
  title_long: "題名が長そう（後回し）",
  channel_slow: "時短の少ない投稿者（後回し）",
  duplicate: "同じ動画",
  opted_out: "掲載停止",
};
const day = (iso) => (iso ? String(iso).slice(5, 10).replace("-", "/") : "");
const whyText = (why = {}) => Object.entries(why).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${WHY[k] || k} ${n}`).join("・") || "—";

function markdown(log) {
  const dishes = Array.isArray(log?.dishes) ? log.dishes : null;
  if (!dishes) return "\n### 🔎 理想の12品の探し方\n\n記録を読めませんでした（API が古い・つながらない）。\n";
  const open = dishes.filter((d) => !d.full);
  const lines = ["", "### 🔎 理想の12品の探し方（そろっていない料理）", ""];
  if (!open.length) return [...lines, "12品とも、作り方がそろっています。", ""].join("\n");
  lines.push("| 料理 | いま（20分以内／30分以上） | 足りない（20分以内／30分以上） | 次の言葉 | 言葉を使い切って待つ |", "|---|---:|---:|---|---|");
  for (const d of open) {
    const wait = [d.quick?.waitUntil ? `20分以内：${day(d.quick.waitUntil)}まで` : "", d.long?.waitUntil ? `30分以上：${day(d.long.waitUntil)}まで` : ""].filter(Boolean).join("／") || "—";
    const next = [d.quick?.need ? `20分以内「${d.quick.next || "なし"}」（${d.quick.used}/${d.quick.words}）` : "", d.long?.need ? `30分以上「${d.long.next || "なし"}」（${d.long.used}/${d.long.words}）` : ""].filter(Boolean).join("／") || "—";
    lines.push(`| ${d.name} | ${d.stock?.quick || 0}／${d.stock?.long || 0}（上限 ${d.quickMax}／${d.longMax}） | ${d.quick?.need || 0}／${d.long?.need || 0} | ${next} | ${wait} |`);
  }
  lines.push("", "**最近の検索**（新しい順・料理ごとに6回まで）", "", "| 料理 | 日 | 言葉 | 見つかった | AI の前に残った | AI で読んだ | 増えた | 外した理由 |", "|---|---|---|---:|---:|---:|---:|---|");
  let any = false;
  for (const d of open) for (const s of [...(d.searches || [])].reverse()) {
    any = true;
    lines.push(`| ${d.name} | ${day(s.at)} | ${String(s.q || "").replace(/ レシピ 材料$/, "")} | ${s.found ?? "?"} | ${s.picked} | ${s.ai} | ${s.added} | ${whyText(s.why)} |`);
  }
  if (!any) lines.push("| — | | まだ検索していません（記録は 2026-11-24 の公開から） | | | | | |");
  lines.push("", "見つかった本数・外した理由は 2026-11-24 の公開後の検索から（それより前は「?」）。AI は使いません。", "");
  return lines.join("\n");
}

if (require.main === module) {
  let log = null;
  try { log = JSON.parse(fs.readFileSync(process.argv[2] || "ideal.json", "utf8")); } catch { log = null; }
  const text = markdown(log);
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
}
module.exports = { markdown };
