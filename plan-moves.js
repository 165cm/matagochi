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
let skipDate = "";
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
// 外食などの日：その日を休みにして、決まっていた料理を次に作る日へ。押し出された料理も順に後ろへ。
function skipDay(date, kind, shift = true) {
  let carry = shift ? dayEntry(date) : null;
  const moved = carry?.recipe?.title || "";
  state.mealSlots[date] = { date, status: "off", ...(SKIP_OF[kind] ? { kind } : {}), updatedAt: nowIso() };
  delete state.planOverrides[date];
  let d = date, first = "", count = 0;
  for (let n = 0; carry && n < 21; n += 1) {
    d = addDays(d, 1);
    if (!cooksOn(d)) continue;
    const next = dayEntry(d);
    placeEntry(carry, d);
    first = first || d;
    count += 1;
    carry = next;
  }
  return { moved, to: first, count };
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
function renderSkipPanel(date) {
  if (skipDate !== date || isViewer()) return "";
  const entry = dayEntry(date);
  const shops = (state.foodProfile?.chains || []).map((id) => CHAIN_OF[id]?.name).filter(Boolean);
  const when = date === today() ? "今日" : `${formatDate(date)}（${weekdayLabel(date)}）`;
  return `<section class="skip-panel" tabindex="-1" aria-label="${when}の晩ごはんを外食・中食にする">
    <p class="skip-q"><b>${when}</b>の晩ごはんは？</p>
    <div class="skip-kinds">${SKIP_KINDS.map((k) => `<button type="button" class="skip-kind" data-action="life-skip-kind" data-date="${date}" data-kind="${k.id}"><span aria-hidden="true">${k.icon}</span>${k.label}</button>`).join("")}</div>
    ${shops.length ? `<p class="skip-shops">いつものお店：${shops.map(escapeHtml).join("・")}</p>` : ""}
    ${entry ? `<label class="skip-shift"><input type="checkbox" id="skip-shift" checked><span>「${escapeHtml(entry.recipe.title)}」は次に作る日へずらす<small>${entry.slot ? "買った材料をむだにしません。あとの料理も1日ずつ後ろへ。" : "選んだ料理を残します。"}</small></span></label>` : ""}
    <button type="button" class="text-button" data-action="life-skip-close">やめる</button></section>`;
}
function handlePlanMoveAction(action, data) {
  if (!["life-skip", "life-skip-close", "life-skip-kind", "life-move"].includes(action)) return false;
  if (isViewer()) return true;
  if (action === "life-skip") { skipDate = data.date; swapDate = ""; }
  else if (action === "life-skip-close") skipDate = "";
  else if (action === "life-skip-kind") {
    const before = dailyShopping();
    const shift = data.shift !== undefined ? data.shift !== "false" : (globalThis.document?.querySelector?.("#skip-shift")?.checked ?? true);
    const { moved, to, count } = skipDay(data.date, data.kind, shift);
    skipDate = "";
    trackDaily("meal_skipped", { kind: data.kind, shifted: !!to });
    changedShopping(before);
    saveState();
    showToast(moved && to ? `「${moved}」は${formatDate(to)}（${weekdayLabel(to)}）へ。${count > 1 ? "あとの料理も1日ずつずらしました。" : ""}` : `${SKIP_OF[data.kind]?.label || "お休み"}にしました。`);
  } else if (action === "life-move") {
    const before = dailyShopping();
    const message = swapDays(dailyPlan(), data.date, data.dir === "up" ? -1 : 1);
    if (message) { changedShopping(before); saveState(); showToast(message); }
  }
  render();
  return true;
}
