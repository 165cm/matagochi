/* 毎朝の新着集め（.github/workflows/trends.yml）の健康診断（2026-10-28 のユーザーの要望「止まったら気づける仕組み」）。
   集めた結果（POST /api/trends/refresh・/refill の最後の返事）と、いま見えている新着（GET /api/trends。読み出すだけで AI は使わない）から、
   「今日は集められたか」「見えている品数は足りているか」を判定し、GitHub の実行の要約（Job Summary）に日本語で書く。
   問題があれば終了コード1で実行を「失敗（赤）」にする＝GitHub からメールが届く（以前は止まっていても毎回「成功（緑）」だった）。
   使い方：node scripts/trends-health.cjs refresh.json refill.jsonl trends.json
           （refill.jsonl は補充の返事を1行ずつ。最後の行で状態を見て、各回の ran.ai を月の費用に足す）
           （どれも無い・読めない時は「返事なし」として扱う。要約の書き先は環境変数 GITHUB_STEP_SUMMARY） */
const fs = require("node:fs");

const MIN_VISIBLE = 200; // 見えている新着がこれより少なければ赤（目標は400品＝親料理80×子5品。docs/APP_MAP.md §46-7）
const SOON_DAYS = 7; // この日数のうちに見えなくなる（28日を過ぎる）品数も出す
const DAY = 86_400_000;
const YEN_PER_AI = 1; // api/src/trends.js の TREND_YEN_PER_AI（月の費用の目安の単価）と同じ。返事に yenPerAi（実測から合わせた単価）があればそちらを使う

// 止まった理由（refresh の paused・limited）を、初めての人にも分かる言葉に。
const STOPPED = {
  ai_budget: "AI の利用枠（アプリ全体の1日・1か月の回数）が足りず、今日は1品も読めませんでした。利用者の YouTube の読み取りも止まっている可能性があります",
  not_configured: "サーバーの設定（AI・YouTube の API キー）が足りません",
  cost_not_saved: "費用の記録を保存できず、今日は集めませんでした",
  trend_month_budget: "今月の新着集めの予算（月1,000円）を使い切りました。来月まで集められません",
};

// 決まりどおりの止まり方（月末まで均等に・利用者の分を残す。docs/APP_MAP.md §46-8 ②）は赤にしない。
const PACED = {
  trend_pace: "今日までに使ってよい予算（月末まで均等）を使ったので、続きは明日",
  pace_budget: "今日までに使ってよい予算（月末まで均等）を使ったので、続きは明日",
  trend_user_reserve: "アプリ全体の AI の月の回数のうち、利用者の分を残すために止めました",
  user_reserve: "アプリ全体の AI の月の回数のうち、利用者の分を残すために止めました",
};

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

// 補充の返事（1行に1回）。最後の行と、この実行で補充が使った AI の回数の合計を返す。
function readRefill(file) {
  let lines = [];
  try { lines = fs.readFileSync(file, "utf8").split("\n").filter((l) => l.trim()); } catch {}
  const all = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } });
  return { refill: all.length ? all[all.length - 1] : null, refillAi: all.reduce((n, r) => n + (Number(r?.ran?.ai) || 0), 0) };
}

function judge({ refresh, refill, refillAi = 0, list, now = Date.now(), minVisible = MIN_VISIBLE }) {
  const problems = [];
  const notes = [];
  const empty = (x) => !x || typeof x !== "object" || !Object.keys(x).length;
  // サーバーのエラーの返事は { error: { code, message } }（api/src/server.js の send）。正常な返事として扱わない（review fix #171）。
  const failed = (x) => (x?.error ? `サーバーがエラーを返しました（${x.error.code || x.error.message || "不明"}）` : "");
  if (empty(refresh)) problems.push("新着集めのサーバーから返事がありませんでした（通信の失敗・時間切れ）");
  else if (failed(refresh)) problems.push(`新着集め：${failed(refresh)}`);
  else {
    const reason = refresh.paused || refresh.limited || "";
    if (STOPPED[reason]) problems.push(STOPPED[reason]);
    else if (reason === "trend_ai_budget") notes.push("新着集めの1日・1週の AI の回数に届いたので、今日はここまで（決まりどおり）");
    else if (PACED[reason]) notes.push(`新着集め：${PACED[reason]}`);
    else if (refresh.done !== true) notes.push(`今日の分はまだ集め終わっていません${reason ? `（${reason}）` : ""}。次の実行で続けます`);
  }
  // 補充（refill）の reason：month_budget＝今月の予算・ai_budget＝AI の利用枠。どちらも止まっているので問題に。
  const refillStop = { month_budget: STOPPED.trend_month_budget, ai_budget: STOPPED.ai_budget, not_configured: STOPPED.not_configured, cost_not_saved: STOPPED.cost_not_saved }[refill?.reason];
  // 補充は、新着集めがその日の分を終えた（done: true）時だけ動く。その時に返事がない・エラーなら止まっている（review fix #171）。
  if (refresh?.done === true && !failed(refresh) && (empty(refill) || failed(refill))) problems.push(`親料理の補充：${failed(refill) || "サーバーから返事がありませんでした（通信の失敗・時間切れ）"}`);
  else if (refillStop && !problems.includes(refillStop)) problems.push(`親料理の補充：${refillStop}`);
  else if (PACED[refill?.reason]) notes.push(`親料理の補充：${PACED[refill.reason]}`);
  else if (refill && !refillStop && refill.done !== true && refill.reason !== "stocked") notes.push(`親料理の補充は途中です${refill.reason ? `（${refill.reason}）` : ""}`);
  const items = Array.isArray(list?.items) ? list.items : null;
  if (!items) problems.push("いま見えている新着の一覧を読めませんでした");
  else if (items.length < minVisible) problems.push(`見えている新着が ${items.length}品で、目安の ${minVisible}品より少ないです`);
  const soon = items ? items.filter((i) => Date.parse(i.expiresAt) - now < SOON_DAYS * DAY).length : null;
  const added = (Number(refresh?.today) || 0) + (Number(refill?.added ?? refill?.ran?.added) || 0);
  const ai = refresh?.ai || {};
  if (refresh?.revived?.failed) notes.push("休んでいる料理を新着に戻す処理が、途中で失敗しました（次の実行でやり直します）");
  return {
    ok: problems.length === 0,
    problems,
    notes,
    numbers: {
      visible: items ? items.length : null,
      soon,
      added,
      revived: Number.isFinite(refresh?.revived?.today) ? refresh.revived.today : null,
      resting: Number.isFinite(refresh?.revived?.resting) ? refresh.revived.resting : null,
      usable: Number.isFinite(refresh?.revived?.usable) ? refresh.revived.usable : null,
      // 新着集めの返事は補充の前の月の費用なので、この実行で補充が使った分を足す（review fix #171）
      monthYen: Number.isFinite(ai.yen) ? ai.yen + Math.round(refillAi * (Number(ai.yenPerAi) > 0 ? Number(ai.yenPerAi) : YEN_PER_AI)) : null,
      monthYenCap: Number.isFinite(ai.yenCap) ? ai.yenCap : null,
    },
  };
}

function markdown(result, { minVisible = MIN_VISIBLE } = {}) {
  const n = result.numbers;
  const show = (v, unit = "") => (v === null || v === undefined ? "不明" : `${v}${unit}`);
  const lines = [
    `## 新着集めの健康診断：${result.ok ? "✅ 問題なし" : "❌ 問題あり"}`,
    "",
    "| 項目 | 数 |",
    "|---|---:|",
    `| 今日増えた料理（新着＋親料理の補充） | ${show(n.added, "品")} |`,
    `| 今日もう一度並べた料理（0円・28日を過ぎて休んでいた料理） | ${show(n.revived, "品")} |`,
    `| 休んでいる料理（もう一度並べられるのを待っている） | ${show(n.resting, "品")} |`,
    `| 　うち、確かめ済みで使える料理（残りは毎日0円で確かめる） | ${show(n.usable, "品")} |`,
    `| いま見えている新着（目安 ${minVisible}品・目標 400品） | ${show(n.visible, "品")} |`,
    `| ${SOON_DAYS}日以内に見えなくなる料理 | ${show(n.soon, "品")} |`,
    `| 今月の新着集めの費用（目安） | ${n.monthYen === null ? "不明" : `${n.monthYen}円 / ${show(n.monthYenCap, "円")}`} |`,
  ];
  if (result.problems.length) lines.push("", "### 問題", ...result.problems.map((p) => `- ❌ ${p}`));
  if (result.notes.length) lines.push("", "### メモ", ...result.notes.map((p) => `- ${p}`));
  lines.push("", "くわしくは管理の画面（admin/catalog.html の「集める」タブ）で確かめられます。");
  return lines.join("\n") + "\n";
}

if (require.main === module) {
  const [refreshFile, refillFile, listFile] = process.argv.slice(2);
  const result = judge({ refresh: readJson(refreshFile), ...readRefill(refillFile), list: readJson(listFile) });
  const text = markdown(result);
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  // 実行の画面のいちばん上にも出す（::error:: は赤い注記になる）。
  for (const p of result.problems) console.log(`::error title=新着集めの問題::${p}`);
  process.exit(result.ok ? 0 : 1);
}

module.exports = { judge, markdown, readRefill, MIN_VISIBLE };
