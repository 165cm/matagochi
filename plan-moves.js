/* 作れない日の逃げ道と、献立の入れ替え。
   外食・テイクアウト・デリバリー・あるもので、を申告すると、その日の料理（買った材料・選んだ料理）を次に作る日へずらす。
   次の日にも決まった料理があれば、それも1日ずつ後ろへ（買った材料をむだにしない）。
   入れ替え：となりの日と料理を入れかえる。 */
const SKIP_KINDS = [
  { id: "out", icon: "🍽", label: "外食" },
  { id: "take", icon: "🥡", label: "テイクアウト・惣菜" },
  { id: "deli", icon: "🛵", label: "デリバリー" },
  { id: "home", icon: "🍙", label: "あるもので" },
];
const SKIP_OF = Object.fromEntries(SKIP_KINDS.map((k) => [k.id, k]));
let skipDate = "", moreDate = "";
function skipLabel(slot) {
  const k = SKIP_OF[slot?.kind];
  return k ? `${k.icon} ${k.label}` : "自炊はお休み";
}
// 料理する日か（曜日の設定・お休み・作った日は、ずらす先にしない）。
function cooksOn(date) {
  const p = dailyProfile();
  const slot = state.mealSlots?.[date];
  if (slot && ["off", "cooked"].includes(slot.status)) return false;
  if (prestartUntil() && date < prestartUntil()) return false;
  return !(p.days.length && !p.days.includes(String(new Date(date + "T12:00:00").getDay())));
}
// 買い物のあとに動かした料理は「買ったもの」の印を持ち続ける（買い物リストに戻らない）。
function moveSlot(slot, to, from = slot.date) {
  const since = lastShoppedAt();
  const bought = slot.bought || (since && (slot.updatedAt || "") <= since ? since : "");
  return { ...slot, date: to, movedFrom: from, updatedAt: nowIso(), ...(bought ? { bought } : {}) };
}
// その日に決まっているもの：確定した料理（slot）か、日付を指定した候補（override）。
function dayEntry(date) {
  const slot = state.mealSlots?.[date];
  if (slot?.status === "confirmed" && slot.recipe) return { slot, recipe: slot.recipe };
  const id = state.planOverrides?.[date];
  const recipe = id && allDinnerRecipes().find((r) => r.id === id);
  return recipe ? { recipe } : null;
}
function placeEntry(entry, to) {
  if (entry.slot) {
    state.mealSlots[to] = moveSlot(entry.slot, to);
    delete state.planOverrides[to];
  } else {
    if (state.mealSlots[to]?.status === "confirmed") state.mealSlots[to] = { date: to, status: "removed", updatedAt: nowIso() };
    state.planOverrides[to] = entry.recipe.id;
  }
}
// 外食などの日に、決まっていた料理がどこへ動くか（書きかえずに調べる）。後ろの料理も1日ずつ押し出す。
// early：はみ出す料理は、次の自炊日を待たずに、いちばん近いお休みの曜日（例：土曜）に作る。
function restDay(date) {
  const slot = state.mealSlots?.[date];
  return !slot && !(prestartUntil() && date < prestartUntil()) && !cooksOn(date);
}
function shiftMoves(date, { early = false } = {}) {
  const moves = [];
  let carry = dayEntry(date), from = date, d = date;
  for (let n = 0; carry && n < 21; n += 1) {
    d = addDays(d, 1);
    if (!cooksOn(d)) {
      // お休みの曜日に作るのは、買った料理（確定）だけ。そこで押し出しはおしまい。
      if (early && carry.slot && restDay(d)) { moves.push({ entry: carry, from, to: d, rest: true }); break; }
      continue;
    }
    const next = dayEntry(d);
    moves.push({ entry: carry, from, to: d });
    from = d;
    carry = next;
  }
  return moves;
}
// 買い物のまとまり（リズム）の外へはみ出す料理（例：金曜の分が来週の月曜へ）。
function spillOf(date, moves) {
  const end = rhythmOn() ? currentBlocks().find((b) => b.dates.includes(date))?.end : "";
  const last = moves[moves.length - 1];
  return end && last && last.to > end ? last : null;
}
// 外食などの日：その日を休みにして、決まっていた料理を次に作る日へ。押し出された料理も順に後ろへ。
// mode：early（はみ出す分はお休みの曜日に作る・おすすめ）／carry（次の自炊日まで持ち越す）／none（ずらさない）
function skipDay(date, kind, mode = "early") {
  const moves = mode === "none" ? [] : shiftMoves(date, { early: mode === "early" });
  const spill = spillOf(date, moves);
  state.mealSlots[date] = { date, status: "off", ...(SKIP_OF[kind] ? { kind } : {}), updatedAt: nowIso() };
  delete state.planOverrides[date];
  moves.forEach((m) => placeEntry(m.entry, m.to));
  const rest = moves.find((m) => m.rest);
  return { moved: moves[0]?.entry.recipe.title || "", to: moves[0]?.to || "", count: moves.length, spill, rest };
}
// 持ち越した料理の注意：傷みやすい食材を、買ってから日がたって使う時。
function carryNote(slot) {
  if (!slot?.movedFrom) return "";
  const f = Lifestyle.freshness(slot.recipe);
  const age = slot.bought ? daysBetween(slot.bought.slice(0, 10), slot.date) : 0;
  const block = rhythmOn() ? currentBlocks().find((b) => b.dates.includes(slot.date)) : null;
  const carried = block && slot.movedFrom < block.start;
  const base = carried ? `↪ ${formatDate(slot.movedFrom)}の分を持ち越し` : `${formatDate(slot.movedFrom)}からずらしました`;
  return f.urgency >= 3 && age >= 4 ? `${base}・🧊${f.label}は買ってから${age}日。冷凍しておくと安心` : base;
}
// となりの料理する日（お休み・作った日はとばす）。
function neighborDay(plan, date, dir) {
  const movable = plan.filter((d) => !d.off && !d.prestart && d.slot?.status !== "off" && d.slot?.status !== "cooked" && (d.slot?.recipe || d.candidate?.recipe));
  const i = movable.findIndex((d) => d.date === date);
  return i < 0 ? null : movable[i + dir] || null;
}
function swapDays(plan, date, dir) {
  const a = plan.find((d) => d.date === date), b = neighborDay(plan, date, dir);
  if (!a || !b) return "";
  const entry = (d) => (d.slot?.status === "confirmed" ? { slot: d.slot, recipe: d.slot.recipe } : { recipe: d.candidate.recipe });
  const ea = entry(a), eb = entry(b);
  placeEntry(ea, b.date);
  placeEntry(eb, a.date);
  const p = dailyProfile();
  const bad = [[ea.recipe, b.date], [eb.recipe, a.date]].find(([r, d]) => !Lifestyle.fit(r, p, d).ok);
  return bad ? `入れ替えました。「${bad[0].title}」は${formatDate(bad[1])}の条件（時間など）に合わないかもしれません。` : `${formatDate(a.date)}と${formatDate(b.date)}を入れ替えました。`;
}
// 献立の「⋯」：入れ替え・外食・中食・今のレシピを反映。
function renderPlanMenu(plan, day) {
  if (moreDate !== day.date || isViewer()) return "";
  const up = neighborDay(plan, day.date, -1), down = neighborDay(plan, day.date, 1);
  return `<section class="plan-menu" aria-label="${formatDate(day.date)}のその他の操作">
    ${day.slot?.status === "confirmed" && slotHasUpdates(day.slot) ? dailyButton("life-refresh", "今のレシピ・人数を反映", `data-date="${day.date}"`) : ""}
    ${up ? `<button type="button" class="plan-menu-item" data-action="life-move" data-date="${day.date}" data-dir="up">↑ 前の日（${formatDate(up.date)}）と入れ替え</button>` : ""}
    ${down ? `<button type="button" class="plan-menu-item" data-action="life-move" data-date="${day.date}" data-dir="down">↓ 次の日（${formatDate(down.date)}）と入れ替え</button>` : ""}
    <button type="button" class="plan-menu-item" data-action="life-skip" data-date="${day.date}">🍽 外食・中食にする</button>
    ${(() => { const r = day.slot?.recipe || day.candidate?.recipe; const f = r && folderOfRecipe(r); return r ? `<button type="button" class="plan-menu-item" data-action="${f ? "life-folder-open" : "life-recipe-open"}" ${f ? `data-folder="${f.key}"` : `data-recipe="${escapeAttr(recipeById(r.id) ? r.id : r.starterId || r.id)}"`}>📁 ${f ? `「${escapeHtml(f.name)}」フォルダを見る` : "定番フォルダに入れる"}</button>` : ""; })()}</section>`;
}
function renderSkipPanel(date) {
  if (skipDate !== date || isViewer()) return "";
  const entry = dayEntry(date);
  const shops = (state.foodProfile?.chains || []).map((id) => CHAIN_OF[id]?.name).filter(Boolean);
  const when = date === today() ? "今日" : `${formatDate(date)}（${weekdayLabel(date)}）`;
  return `<section class="skip-panel" tabindex="-1" aria-label="${when}の晩ごはんを外食・中食にする">
    <p class="skip-q"><b>${when}</b>の晩ごはんは？</p>
    <div class="skip-kinds">${SKIP_KINDS.map((k) => `<button type="button" class="skip-kind" data-action="life-skip-kind" data-date="${date}" data-kind="${k.id}"><span aria-hidden="true">${k.icon}</span>${k.label}</button>`).join("")}</div>
    ${shops.length ? `<p class="skip-shops">いつものお店：${shops.map(escapeHtml).join("・")}</p>` : ""}
    ${entry ? (() => {
      const spill = spillOf(date, shiftMoves(date));
      const early = spill && shiftMoves(date, { early: true }).find((m) => m.rest);
      const f = spill && Lifestyle.freshness(spill.entry.recipe);
      const day = (d) => `${formatDate(d)}（${weekdayLabel(d)}）`;
      if (!spill) return `<label class="skip-shift"><input type="checkbox" id="skip-shift" checked><span>「${escapeHtml(entry.recipe.title)}」は次に作る日へずらす<small>${entry.slot ? "買った材料をむだにしません。あとの料理も1日ずつ後ろへ。" : "選んだ料理を残します。"}</small></span></label>`;
      const opt = (value, checked, title, note) => `<label class="skip-mode"><input type="radio" name="skip-mode" value="${value}" ${checked ? "checked" : ""}><span><b>${title}</b>${note ? `<small>${note}</small>` : ""}</span></label>`;
      return `<fieldset class="skip-modes"><legend>決まっていた料理は？</legend>
        ${early ? opt("early", true, `1日ずつ後ろにずらして、<u>${weekdayLabel(early.to)}曜日</u>も料理する（おすすめ）`, `「${escapeHtml(early.entry.recipe.title)}」を${day(early.to)}に。買った材料を早めに使いきれます。`) : ""}
        ${opt("carry", !early, `次の自炊日まで持ち越す`, `「${escapeHtml(spill.entry.recipe.title)}」は${day(spill.to)}に。次の献立はその日から始まり、この分は買い物リストに入りません。${f.urgency >= 3 ? `<br>🧊 ${f.label}は日持ちしないので、冷凍しておくと安心です。` : ""}`)}
        ${opt("none", false, "ずらさない", "この日の料理はなしにします。")}</fieldset>`;
    })() : ""}
    <button type="button" class="text-button" data-action="life-skip-close">やめる</button></section>`;
}
function handlePlanMoveAction(action, data) {
  if (!["life-more", "life-skip", "life-skip-close", "life-skip-kind", "life-move"].includes(action)) return false;
  if (isViewer()) return true;
  if (action === "life-more") { moreDate = moreDate === data.date ? "" : data.date; skipDate = ""; swapDate = ""; }
  else if (action === "life-skip") { skipDate = data.date; swapDate = ""; moreDate = ""; }
  else if (action === "life-skip-close") skipDate = "";
  else if (action === "life-skip-kind") {
    const before = dailyShopping();
    const doc = globalThis.document;
    const picked = doc?.querySelector?.('input[name="skip-mode"]:checked')?.value;
    const box = doc?.querySelector?.("#skip-shift");
    const mode = data.mode || (data.shift !== undefined ? (data.shift === "false" ? "none" : "early") : picked || (box && !box.checked ? "none" : "early"));
    const { moved, to, count, spill, rest } = skipDay(data.date, data.kind, mode);
    skipDate = "";
    trackDaily("meal_skipped", { kind: data.kind, shifted: !!to });
    changedShopping(before);
    saveState();
    showToast(moved && to ? `「${moved}」は${formatDate(to)}（${weekdayLabel(to)}）へ。${rest ? `「${rest.entry.recipe.title}」は${formatDate(rest.to)}（${weekdayLabel(rest.to)}）に作ります。` : spill ? `「${spill.entry.recipe.title}」は${formatDate(spill.to)}（${weekdayLabel(spill.to)}）に持ち越しました。` : count > 1 ? "あとの料理も1日ずつずらしました。" : ""}` : `${SKIP_OF[data.kind]?.label || "お休み"}にしました。`);
  } else if (action === "life-move") {
    const before = dailyShopping();
    const message = swapDays(dailyPlan(), data.date, data.dir === "up" ? -1 : 1);
    moreDate = "";
    if (message) { changedShopping(before); saveState(); showToast(message); }
  }
  render();
  return true;
}
