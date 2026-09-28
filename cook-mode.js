/* 作る画面の手助け：
   ・画面を消さない（Wake Lock。対応していない端末では何もしない）
   ・手順の「8分」「30秒」「1分30秒」をタップでタイマー（画面の下に並ぶ・いくつでも・鳴ったら音と振動）
   ・「▶ 1手順ずつ」：大きな文字で1手順ずつ。次へで、その手順に✓
   タイマーと1手順ずつの画面は #app の外に描くので、アプリの描き直しで消えない。 */
const CookMode = (() => {
  // 「8分目」「3分の1」は時間ではない。「5〜6分」は短いほう（様子を見て足す）。
  const TIME = /(\d{1,3})\s*(?:[〜~\-－ー]\s*(\d{1,3})\s*)?(時間|分|秒)(半)?(?:\s*(\d{1,2})\s*秒)?(?!目|の|間隔)/g;
  const MAX = 3 * 60 * 60;
  function seconds(a, unit, half, sec) {
    const n = Number(a);
    const base = unit === "時間" ? n * 3600 : unit === "分" ? n * 60 : n;
    return base + (half ? (unit === "時間" ? 1800 : unit === "分" ? 30 : 0) : 0) + (sec ? Number(sec) : 0);
  }
  // 手順の文（エスケープ済みにして返す）。時間の所をタイマーのボタンにする。
  function stepHtml(step, label = "") {
    const text = escapeHtml(String(step || "").normalize("NFKC"));
    return text.replace(TIME, (m, a, _b, unit, half, sec) => {
      const s = seconds(a, unit, half, sec);
      if (!s || s > MAX) return m;
      return `<button type="button" class="cook-timer-chip" data-cook-timer="${s}" data-label="${escapeAttr(label || String(step).slice(0, 16))}" aria-label="${escapeAttr(`${m}のタイマーを始める`)}">⏱${m}</button>`;
    });
  }
  const timesIn = (step) => [...String(step || "").normalize("NFKC").matchAll(TIME)].map((m) => seconds(m[1], m[3], m[4], m[5])).filter((s) => s && s <= MAX);

  // ---- 画面を消さない ----
  let lock = null, wanted = false;
  const supported = () => !!globalThis.navigator?.wakeLock;
  async function acquire() {
    if (!supported() || lock || document.visibilityState !== "visible") return;
    try { lock = await navigator.wakeLock.request("screen"); lock.addEventListener?.("release", () => { lock = null; }); } catch { lock = null; }
  }
  function release() { try { lock?.release(); } catch {} lock = null; }
  // 描き直しのたびに呼ぶ：作る画面の間だけ、画面をつけたままにする。
  function sync() {
    wanted = state.view === "cooking";
    if (wanted) acquire(); else { release(); closeFocus(); }
  }
  globalThis.document?.addEventListener?.("visibilitychange", () => { if (wanted && document.visibilityState === "visible") acquire(); });

  // ---- タイマー ----
  let timers = []; // { id, label, total, end, left(一時停止中の残り), done }
  let ticker = null, audio = null;
  const fmt = (s) => { s = Math.max(0, Math.ceil(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`; };
  const leftOf = (t) => (t.left != null ? t.left : (t.end - Date.now()) / 1000);
  function start(total, label) {
    try { audio = audio || new (globalThis.AudioContext || globalThis.webkitAudioContext)(); audio.resume?.(); } catch {}
    timers.push({ id: Math.random().toString(36).slice(2, 8), label, total, end: Date.now() + total * 1000, left: null, done: false });
    timers = timers.slice(-4);
    tick(); ensureTicker();
    try { trackDaily("cook_timer", { sec: total }); } catch {}
  }
  function ensureTicker() { if (!ticker) ticker = setInterval(tick, 500); }
  function beep() {
    try {
      if (!audio) return;
      [0, 0.35, 0.7].forEach((d) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(audio.destination);
        const t0 = audio.currentTime + d; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.3, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
        o.start(t0); o.stop(t0 + 0.3);
      });
    } catch {}
    try { navigator.vibrate?.([300, 150, 300, 150, 300]); } catch {}
  }
  function tick() {
    for (const t of timers) if (!t.done && t.left == null && leftOf(t) <= 0) { t.done = true; beep(); }
    if (!timers.length) { clearInterval(ticker); ticker = null; }
    drawBar();
  }
  function drawBar() {
    let bar = document.getElementById("cook-timer-bar");
    if (!timers.length) { bar?.remove(); return; }
    if (!bar) { bar = document.createElement("div"); bar.id = "cook-timer-bar"; bar.setAttribute("role", "status"); document.body.append(bar); }
    bar.innerHTML = timers.map((t) => `<div class="ctb-item ${t.done ? "is-done" : ""} ${t.left != null ? "is-paused" : ""}">
      <span class="ctb-time">${t.done ? "⏰" : fmt(leftOf(t))}</span><span class="ctb-label">${t.done ? "時間です！" : escapeHtml(t.label)}</span>
      ${t.done ? "" : `<button type="button" data-cook-timer-op="plus" data-id="${t.id}" aria-label="1分のばす">+1分</button><button type="button" data-cook-timer-op="pause" data-id="${t.id}" aria-label="${t.left != null ? "再開" : "一時停止"}">${t.left != null ? "▶" : "Ⅱ"}</button>`}
      <button type="button" data-cook-timer-op="stop" data-id="${t.id}" aria-label="タイマーを止める">${t.done ? "OK" : "✕"}</button></div>`).join("");
  }
  function op(kind, id) {
    const t = timers.find((x) => x.id === id);
    if (!t) return;
    if (kind === "stop") timers = timers.filter((x) => x !== t);
    if (kind === "plus") { if (t.left != null) t.left += 60; else t.end += 60000; }
    if (kind === "pause") { if (t.left != null) { t.end = Date.now() + t.left * 1000; t.left = null; } else t.left = leftOf(t); }
    tick();
  }

  // ---- 1手順ずつ ----
  let steps = [], focus = -1;
  function setSteps(list) { steps = Array.isArray(list) ? list : []; }
  function drawFocus() {
    let el = document.getElementById("cook-focus");
    if (focus < 0 || !steps.length) { el?.remove(); document.body.classList.remove("cook-focus-open"); return; }
    if (!el) { el = document.createElement("div"); el.id = "cook-focus"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "1手順ずつ"); document.body.append(el); }
    document.body.classList.add("cook-focus-open");
    const last = focus === steps.length - 1;
    el.innerHTML = `<div class="cf-head"><span>${focus + 1} / ${steps.length}</span><button type="button" data-cook-focus="close" aria-label="閉じる">✕</button></div>
      <div class="cf-dots" aria-hidden="true">${steps.map((_, i) => `<i class="${i < focus ? "is-done" : i === focus ? "is-now" : ""}"></i>`).join("")}</div>
      <div class="cf-step"><p>${stepHtml(steps[focus], `${focus + 1}. ${String(steps[focus]).slice(0, 12)}`)}</p></div>
      <div class="cf-nav"><button type="button" class="secondary-button" data-cook-focus="prev" ${focus === 0 ? "disabled" : ""}>◀ 前へ</button><button type="button" class="primary-button" data-cook-focus="next">${last ? "✓ できた！" : "次へ ▶"}</button></div>`;
  }
  // 次へ：いまの手順に✓をつける（作る画面のチェックと同じ）。
  function checkStep(i) {
    const box = document.querySelectorAll(".cooking-steps > li input[type=checkbox]")[i];
    if (box && !box.checked) box.click();
  }
  function closeFocus() { focus = -1; drawFocus(); }
  function focusOp(kind) {
    if (kind === "open") { const boxes = [...document.querySelectorAll(".cooking-steps > li input[type=checkbox]")]; const first = boxes.findIndex((b) => !b.checked); focus = first < 0 ? 0 : first; }
    if (kind === "prev") focus = Math.max(0, focus - 1);
    if (kind === "next") { checkStep(focus); if (focus >= steps.length - 1) { closeFocus(); try { showToast("🎉 おつかれさま！下の「作った！」で記録"); } catch {} return; } focus += 1; }
    if (kind === "close") return closeFocus();
    drawFocus();
  }

  // タイマー・1手順ずつのボタン（ラベルの中にあっても、チェックを切り替えない）。
  globalThis.document?.addEventListener?.("click", (ev) => {
    const chip = ev.target.closest?.("[data-cook-timer]");
    if (chip) { ev.preventDefault(); ev.stopPropagation(); start(Number(chip.dataset.cookTimer), chip.dataset.label || ""); return; }
    const t = ev.target.closest?.("[data-cook-timer-op]");
    if (t) { ev.preventDefault(); op(t.dataset.cookTimerOp, t.dataset.id); return; }
    const f = ev.target.closest?.("[data-cook-focus]");
    if (f) { ev.preventDefault(); focusOp(f.dataset.cookFocus); }
  }, true);
  globalThis.document?.addEventListener?.("keydown", (ev) => {
    if (focus < 0) return;
    if (ev.key === "ArrowRight") focusOp("next");
    else if (ev.key === "ArrowLeft") focusOp("prev");
    else if (ev.key === "Escape") closeFocus();
  });

  return { stepHtml, timesIn, sync, supported, setSteps, start, _timers: () => timers };
})();
if (typeof module !== "undefined") module.exports = CookMode;
