/* 作る画面の手助け：
   ・画面を消さない（Wake Lock。対応していない端末では何もしない）
   ・手順の「8分」「30秒」「1分30秒」をタップでタイマー（画面の下に並ぶ・いくつでも・鳴ったら音と振動）
   ・手順ごとに「使う材料と分量」を出す。タレなど「A」「☆」でまとめた材料は、まとめて出す
   ・🍳 料理モード：左（縦持ちは上）に動画（その手順の場面をくり返す）、右に手順と、その手順で使う材料
   タイマーと料理モードは #app の外に描くので、アプリの描き直しで消えない。 */
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
  // thumb：料理モードでは「⏰3分👍」（👍 の合図でも始められる）。
  function stepHtml(step, label = "", { thumb = false } = {}) {
    const text = escapeHtml(String(step || "").normalize("NFKC"));
    return text.replace(TIME, (m, a, _b, unit, half, sec) => {
      const s = seconds(a, unit, half, sec);
      if (!s || s > MAX) return m;
      return `<button type="button" class="cook-timer-chip" data-cook-timer="${s}" data-label="${escapeAttr(label || String(step).slice(0, 16))}" aria-label="${escapeAttr(`${m}のタイマーを始める`)}">⏰${m}${thumb ? '<i class="g" data-g="Thumb_Up" aria-hidden="true">👍</i>' : ""}</button>`;
    });
  }
  const timesIn = (step) => [...String(step || "").normalize("NFKC").matchAll(TIME)].map((m) => seconds(m[1], m[3], m[4], m[5])).filter((s) => s && s <= MAX);

  // ---- 材料のまとまり（タレ・A・☆）と、手順ごとの材料 ----
  // 名前の頭の「A」「(A)」「☆」「◎」などは、まとまりの印。AIが group をくれた時はそれを使う。
  const MARK = /^\s*[（(【\[<＜〈]?\s*([A-D]|[☆★◎●○◆◇■□▲△♪※♡♥])\s*[)）】\]>＞〉]?\s*(?=\S)/;
  function splitMark(raw) {
    const name = String(raw?.name || "").normalize("NFKC");
    const m = name.match(MARK);
    // 「A」だけの頭文字は、あとに日本語が続く時だけ印とみなす（「Aコープの…」などは材料名のまま）。
    if (m && (/[^A-D]/.test(m[1]) || /^[（(【\[<＜〈]/.test(name.trim()) || /^[A-D]\s*[぀-ヿ一-鿿]/.test(name.trim()))) return { group: m[1], name: name.slice(m[0].length).trim() };
    return { group: "", name };
  }
  function groupsOf(ingredients = []) {
    return ingredients.map((item) => {
      const s = splitMark(item);
      const group = String(item?.group || "").normalize("NFKC").trim() || s.group;
      return { ...item, name: s.name || item.name, group };
    });
  }
  const groupLabel = (g) => (/^[A-D]$/.test(g) ? `${g}（合わせ調味料）` : /^[☆★◎●○◆◇■□▲△♪※♡♥]$/.test(g) ? `${g}の調味料` : g);
  // 呼び方のゆれ。どれかを含む材料は、手順の文にどれかがあれば「使う」とみなす。
  const ALIAS = [["しょうゆ", "醤油"], ["みりん", "味醂"], ["砂糖", "さとう"], ["しょうが", "生姜", "ショウガ"], ["にんにく", "ニンニク", "大蒜"],
    ["玉ねぎ", "たまねぎ", "玉葱", "タマネギ"], ["にんじん", "人参", "ニンジン"], ["こしょう", "胡椒", "コショウ"], ["ごま油", "胡麻油"], ["片栗粉", "かたくり粉"],
    ["薄力粉", "小麦粉"], ["豆腐", "とうふ"], ["卵", "たまご", "玉子", "溶き卵"], ["ねぎ", "ネギ", "葱"], ["大根", "だいこん"], ["じゃがいも", "ジャガイモ"],
    ["キャベツ", "きゃべつ"], ["もやし", "モヤシ"], ["ピーマン"], ["なす", "ナス", "茄子"], ["きのこ", "しめじ", "えのき", "舞茸", "まいたけ", "しいたけ", "椎茸", "エリンギ"],
    ["豚", "豚肉"], ["鶏", "鶏肉", "とり肉", "チキン"], ["牛", "牛肉"], ["ひき肉", "挽き肉", "挽肉", "ミンチ"], ["ごはん", "ご飯", "米"], ["酒", "料理酒"], ["めんつゆ", "麺つゆ"]];
  function namesFor(name) {
    const core = String(name || "").normalize("NFKC").replace(/[（(【\[].*?[)）】\]]/g, "").replace(/\s+/g, "").trim();
    const out = new Set(core ? [core] : []);
    for (const set of ALIAS) if (set.some((w) => core.includes(w))) set.forEach((w) => out.add(w));
    return [...out].filter(Boolean);
  }
  // 1文字の材料（塩・酒・水・油・酢）は、ことばの切れ目にある時だけ（「水気」「油揚げ」を拾わない）。
  function mentions(text, word) {
    if (word.length >= 2) return text.includes(word);
    const re = new RegExp(`(^|[、。をとでにも・\\s（(「])${word}(?=$|[をがでとにもや、。・\\s)）」こ少]|こしょう)`);
    return re.test(text);
  }
  const GENERIC_SAUCE = /合わせ調味料|調味料を|調味料で|タレ|たれ|ソース/;
  // 手順 i で使う材料：{ items:[材料], groups:[{ group, items }] }
  function stepUses(step, ingredients = []) {
    const text = String(step || "").normalize("NFKC");
    const list = groupsOf(ingredients);
    const groups = [...new Set(list.map((x) => x.group).filter(Boolean))];
    const hitGroups = groups.filter((g) => (/^[A-D]$/.test(g) ? new RegExp(`(?<![A-Za-z])${g}(?![A-Za-z])`).test(text) : text.includes(g)));
    if (!hitGroups.length && groups.length === 1 && GENERIC_SAUCE.test(text)) hitGroups.push(groups[0]);
    const items = list.filter((x) => !hitGroups.includes(x.group) && namesFor(x.name).some((w) => mentions(text, w)));
    return { items, groups: hitGroups.map((g) => ({ group: g, items: list.filter((x) => x.group === g) })) };
  }
  // 材料の一覧（まとまりごと）。amountOf(item) で人数に合わせた分量。
  function ingredientsHtml(ingredients, amountOf, cls = "") {
    const list = groupsOf(ingredients);
    const row = (x) => `<li><span>${escapeHtml(x.name)}</span><span>${escapeHtml(amountOf(x))}</span></li>`;
    const plain = list.filter((x) => !x.group);
    const groups = [...new Set(list.map((x) => x.group).filter(Boolean))];
    return `<ul class="cooking-ingredients ${cls}">${plain.map(row).join("")}</ul>${groups.map((g) => `<div class="ing-group"><p>🥣 ${escapeHtml(groupLabel(g))}</p><ul class="cooking-ingredients ${cls}">${list.filter((x) => x.group === g).map(row).join("")}</ul></div>`).join("")}`;
  }
  // 手順の下の小さな行：「🥄 豚こま 200g · 🥣 A：しょうゆ 大さじ2・みりん 大さじ2」
  function usesHtml(step, ingredients, amountOf) {
    const u = stepUses(step, ingredients);
    if (!u.items.length && !u.groups.length) return "";
    const one = (x) => `${escapeHtml(x.name)} <b>${escapeHtml(amountOf(x))}</b>`;
    return `<p class="step-uses">${u.items.length ? `<span>🥄 ${u.items.map(one).join(" · ")}</span>` : ""}${u.groups.map((g) => `<span class="su-group">🥣 ${escapeHtml(g.group)}：${g.items.map(one).join("・")}</span>`).join("")}</p>`;
  }

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
    if (wanted) acquire(); else { release(); closeMode(); }
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

  // ---- 🍳 料理モード ----
  // recipe: { title, steps, times[秒], videoId, shorts, ingredients, amountOf }
  let recipe = null, at = -1, loop = true, showAll = false, frame = null, ready = false, lastSeek = 0;
  function setRecipe(r) { recipe = r; }
  // その手順の場面：始まり＝その手順の時刻、終わり＝次に時刻がある手順の始まり。
  function segment(i) {
    const times = recipe?.timesOf?.() || recipe?.times || [];
    const s = Number.isFinite(times[i]) ? times[i] : null;
    if (s == null) return null;
    const next = times.slice(i + 1).find((t) => Number.isFinite(t) && t > s);
    return { start: s, end: next ?? null };
  }
  const hasVideo = () => !!recipe?.videoId;
  function post(func, args = []) { frame?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "*"); }
  function seekTo(i) {
    const seg = segment(i);
    if (!seg || !frame) return;
    lastSeek = Date.now();
    if (ready) { post("seekTo", [seg.start, true]); post("playVideo"); }
  }
  function drawMode() {
    let el = document.getElementById("cook-mode");
    if (at < 0 || !recipe) { el?.remove(); frame = null; document.body.classList.remove("cook-mode-open"); return; }
    const steps = recipe.steps || [];
    const first = !el;
    if (!el) {
      el = document.createElement("div"); el.id = "cook-mode"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "料理モード");
      const seg = segment(at);
      const origin = globalThis.location?.origin ? `&origin=${encodeURIComponent(location.origin)}` : "";
      el.innerHTML = `<div class="cm-video ${recipe.shorts ? "is-shorts" : ""}">${hasVideo() ? `<iframe src="https://www.youtube.com/embed/${recipe.videoId}?playsinline=1&rel=0&enablejsapi=1&autoplay=1${seg ? `&start=${Math.floor(seg.start)}` : ""}${origin}" title="レシピ動画" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>` : '<div class="cm-novideo">🍳</div>'}</div>
        <div class="cm-side"><div class="cm-top"><b class="cm-count"></b><span class="cm-title">${escapeHtml(recipe.title || "")}</span><span class="cm-hand"></span><button type="button" class="cm-close" data-cook-mode="close" aria-label="料理モードを閉じる">✕</button></div>
          <div class="cm-dots" aria-hidden="true"></div><div class="cm-body"></div></div>
        <div class="cm-foot"><div class="cm-nav"><button type="button" class="secondary-button" data-cook-mode="prev">◀ 前へ<i class="g" data-g="Victory" aria-hidden="true">✌️</i></button>${hasVideo() ? '<button type="button" class="cm-loop" data-cook-mode="loop"></button>' : ""}<button type="button" class="primary-button" data-cook-mode="next"></button></div></div>`;
      document.body.append(el);
      document.body.classList.add("cook-mode-open");
      frame = el.querySelector("iframe");
      ready = false;
      frame?.addEventListener("load", () => { frame.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: "ripigochi-cm", channel: "widget" }), "*"); });
      bindSwipe(el.querySelector(".cm-side"));
    }
    const last = at === steps.length - 1;
    el.querySelector(".cm-count").textContent = `${at + 1} / ${steps.length}`;
    el.querySelector(".cm-dots").innerHTML = steps.map((_, i) => `<i class="${i < at ? "is-done" : i === at ? "is-now" : ""}"></i>`).join("");
    const u = stepUses(steps[at], recipe.ingredients);
    const amount = recipe.amountOf || ((x) => x.amount || "");
    const usesList = [...u.items.map((x) => `<li><span>${escapeHtml(x.name)}</span><b>${escapeHtml(amount(x))}</b></li>`),
      ...u.groups.map((g) => `<li class="cm-group"><p>🥣 ${escapeHtml(groupLabel(g.group))}</p><ul>${g.items.map((x) => `<li><span>${escapeHtml(x.name)}</span><b>${escapeHtml(amount(x))}</b></li>`).join("")}</ul></li>`)].join("");
    el.querySelector(".cm-body").innerHTML = `<p class="cm-step">${stepHtml(steps[at], `${at + 1}. ${String(steps[at]).slice(0, 12)}`, { thumb: true })}</p>
      ${showAll ? `<div class="cm-uses is-all"><p class="cm-uses-head">📋 材料ぜんぶ <button type="button" class="link-inline" data-cook-mode="uses">この手順だけ</button></p>${ingredientsHtml(recipe.ingredients, amount, "cm-list")}</div>`
        : `<div class="cm-uses">${usesList ? `<p class="cm-uses-head">🥄 この手順で使う <button type="button" class="link-inline" data-cook-mode="all">ぜんぶ</button></p><ul class="cm-list">${usesList}</ul>` : `<p class="cm-uses-head">🥄 <button type="button" class="link-inline" data-cook-mode="all">材料をぜんぶ見る</button></p>`}</div>`}`;
    el.querySelector('[data-cook-mode="prev"]').disabled = at === 0;
    drawHand();
    el.querySelector('[data-cook-mode="next"]').innerHTML = `${last ? "✓ できた！" : "次へ ▶"}<i class="g" data-g="Open_Palm" aria-hidden="true">✋</i>`;
    const loopBtn = el.querySelector(".cm-loop");
    if (loopBtn) { const seg = segment(at); loopBtn.disabled = !seg; loopBtn.textContent = seg ? (loop ? "🔁 くり返す" : "➡️ 流す") : "▶ 場面なし"; loopBtn.setAttribute("aria-pressed", String(loop && !!seg)); }
    if (!first) seekTo(at);
  }
  function openMode() {
    if (!recipe?.steps?.length) return;
    at = 0; showAll = false;
    try { playerCommand?.("pauseVideo"); } catch {}
    drawMode();
    try { trackDaily("cook_mode_opened"); } catch {}
  }
  function closeMode() { if (at < 0) return; handStop(); at = -1; drawMode(); }
  function modeOp(kind) {
    const n = recipe?.steps?.length || 0;
    if (kind === "open") return openMode();
    if (kind === "close") return closeMode();
    if (kind === "prev") at = Math.max(0, at - 1);
    if (kind === "next") { if (at >= n - 1) { closeMode(); try { showToast("🎉 おつかれさま！「作った！」で記録"); } catch {} return; } at += 1; }
    if (kind === "loop") { loop = !loop; }
    if (kind === "hand") { hand.on ? handStop() : handStart(); return; }
    if (kind === "all") showAll = true;
    if (kind === "uses") showAll = false;
    drawMode();
  }
  // 手が汚れていても、指の関節でスワイプ：左へ＝次、右へ＝前。
  function bindSwipe(el) {
    let x0 = null, y0 = null;
    el?.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    el?.addEventListener("touchend", (e) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) modeOp(dx < 0 ? "next" : "prev");
    }, { passive: true });
  }
  // ---- ✋ 手の形で操作（料理モードの中だけ・カメラの映像はスマホの外に送らない） ----
  // ✋ 手のひら＝次へ、✌️ ピース＝戻る、👍 いいね＝この手順のタイマー（鳴っている時は止める）。
  // 同じ形を約0.5秒見せたら1回だけ動く。次は、いったん手を下ろしてから。
  const MP = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
  const HAND_MODEL = "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";
  const GESTURES = { Open_Palm: { act: "next", icon: "✋", label: "次へ" }, Victory: { act: "prev", icon: "✌️", label: "戻る" }, Thumb_Up: { act: "timer", icon: "👍", label: "タイマー" } };
  const HOLD_FRAMES = 4, REARM_FRAMES = 2, COOLDOWN = 1000, EVERY = 110;
  const hand = { on: false, status: "off", msg: "", recognizer: null, stream: null, video: null, timer: null, name: "", n: 0, armed: true, idle: 0, last: 0 };
  async function handStart() {
    if (hand.on) return;
    hand.on = true; hand.status = "loading"; hand.msg = ""; drawHand();
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("この端末ではカメラが使えません");
      hand.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      if (!hand.recognizer) {
        const vision = await import(`${MP}/vision_bundle.mjs`);
        const files = await vision.FilesetResolver.forVisionTasks(`${MP}/wasm`);
        const make = (delegate) => vision.GestureRecognizer.createFromOptions(files, { baseOptions: { modelAssetPath: HAND_MODEL, delegate }, runningMode: "VIDEO", numHands: 1 });
        hand.recognizer = await make("GPU").catch(() => make("CPU"));
      }
      if (!hand.on) return handStop();
      const v = document.createElement("video");
      v.className = "cm-cam"; v.muted = true; v.playsInline = true; v.setAttribute("playsinline", ""); v.srcObject = hand.stream;
      document.querySelector("#cook-mode .cm-video")?.append(v);
      await v.play().catch(() => {});
      hand.video = v; hand.status = "ready"; hand.name = ""; hand.n = 0; hand.armed = true; hand.idle = 0;
      hand.timer = setInterval(handTick, EVERY);
      try { trackDaily("cook_hand_on"); } catch {}
    } catch (error) {
      handStop();
      hand.status = "error";
      hand.msg = error?.name === "NotAllowedError" ? "カメラが許可されていません（設定で許可すると使えます）" : "カメラか認識の準備ができませんでした";
    }
    drawHand();
  }
  function handStop() {
    clearInterval(hand.timer); hand.timer = null;
    hand.stream?.getTracks?.().forEach((t) => t.stop()); hand.stream = null;
    hand.video?.remove(); hand.video = null;
    hand.on = false; if (hand.status !== "error") hand.status = "off"; hand.name = ""; hand.n = 0;
    drawHand();
  }
  function handTick() {
    const v = hand.video;
    if (!v || !hand.recognizer || document.hidden || v.readyState < 2) return;
    let name = "None";
    try {
      const r = hand.recognizer.recognizeForVideo(v, performance.now());
      const top = r?.gestures?.[0]?.[0];
      if (top && top.score >= 0.6 && GESTURES[top.categoryName]) name = top.categoryName;
    } catch { return; }
    seeGesture(name);
  }
  // 1コマずつ受け取り、同じ形が続いたら動く（テストからも呼べる）。
  function seeGesture(name) {
    if (!GESTURES[name]) { hand.idle += 1; if (hand.idle >= REARM_FRAMES) hand.armed = true; hand.name = ""; hand.n = 0; drawHandLive(); return; }
    hand.idle = 0;
    hand.n = hand.name === name ? hand.n + 1 : 1; hand.name = name;
    if (hand.armed && hand.n >= HOLD_FRAMES && Date.now() - hand.last > COOLDOWN) {
      hand.armed = false; hand.last = Date.now(); hand.n = 0;
      doGesture(name);
    }
    drawHandLive();
  }
  function doGesture(name) {
    const g = GESTURES[name];
    flash(`${g.icon} ${g.label}`);
    if (g.act === "next" || g.act === "prev") return modeOp(g.act);
    // 👍：鳴っているタイマーがあれば止める。なければ、この手順の時間でタイマーを始める。
    const ringing = timers.filter((t) => t.done);
    if (ringing.length) { ringing.forEach((t) => op("stop", t.id)); return; }
    const secs = timesIn(recipe?.steps?.[at]);
    if (secs.length) start(secs[0], `${at + 1}. ${String(recipe.steps[at]).slice(0, 12)}`);
    else flash("⏱ この手順に時間はありません");
  }
  function flash(text) {
    const box = document.querySelector("#cook-mode .cm-video");
    if (!box) return;
    box.querySelector(".hg-flash")?.remove();
    const f = document.createElement("div"); f.className = "hg-flash"; f.textContent = text; box.append(f);
    setTimeout(() => f.remove(), 900);
  }
  // ✋ のオン・オフは見出しの ✕ の左。合図は各ボタンの中の絵文字（◀ 前へ✌️・次へ ▶✋・⏰3分👍）。
  function drawHand() {
    const el = document.getElementById("cook-mode");
    const box = el?.querySelector(".cm-hand");
    if (!box) return;
    el.classList.toggle("hand-on", hand.on && hand.status === "ready");
    const privacy = typeof tip === "function" ? tip("✋ 手の形で操作：✋次へ・✌️戻る・👍タイマー。カメラの映像はスマホの中だけで使い、外には送りません") : "";
    box.innerHTML = `<button type="button" class="cm-hand-btn" data-cook-mode="hand" aria-pressed="${hand.on}" aria-label="${hand.on ? "手で操作をやめる" : "手の形で操作する"}" ${hand.status === "loading" ? "disabled" : ""}>${hand.status === "loading" ? "⏳" : "✋"}</button>${privacy}`;
    el.querySelector(".cm-video .hg-wait")?.remove();
    if (hand.status === "loading") { const w = document.createElement("div"); w.className = "hg-flash hg-wait"; w.textContent = "⏳ 手の認識を準備中…（初回だけ数MB）"; el.querySelector(".cm-video")?.append(w); }
    if (hand.status === "error" && hand.msg) { flash(`📷 ${hand.msg}`); hand.msg = ""; }
    drawHandLive();
  }
  // いま見えている形のボタンを光らせ、見せ続けた長さをバーで出す。
  function drawHandLive() {
    document.querySelectorAll("#cook-mode [data-g]").forEach((g) => {
      const btn = g.closest("button") || g;
      const on = hand.on && g.dataset.g === hand.name;
      btn.classList.toggle("is-seen", on);
      btn.style.setProperty("--hold", on ? String(Math.min(1, hand.n / HOLD_FRAMES)) : "0");
    });
  }

  // 動画の今の位置を受け取り、その手順の終わりまで来たら始まりへ戻す（くり返す）。
  globalThis.addEventListener?.("message", (event) => {
    if (!frame || event.source !== frame.contentWindow) return;
    let data; try { data = typeof event.data === "string" ? JSON.parse(event.data) : event.data; } catch { return; }
    if (["onReady", "initialDelivery", "infoDelivery"].includes(data?.event) && !ready) { ready = true; }
    const t = data?.info?.currentTime;
    if (!loop || !Number.isFinite(t) || Date.now() - lastSeek < 1200) return;
    const seg = segment(at);
    if (seg?.end != null && (t >= seg.end - 0.2 || t < seg.start - 1.5)) seekTo(at);
  });

  // タイマー・料理モードのボタン（ラベルの中にあっても、チェックを切り替えない）。
  globalThis.document?.addEventListener?.("click", (ev) => {
    const chip = ev.target.closest?.("[data-cook-timer]");
    if (chip) { ev.preventDefault(); ev.stopPropagation(); start(Number(chip.dataset.cookTimer), chip.dataset.label || ""); return; }
    const t = ev.target.closest?.("[data-cook-timer-op]");
    if (t) { ev.preventDefault(); op(t.dataset.cookTimerOp, t.dataset.id); return; }
    const m = ev.target.closest?.("[data-cook-mode]");
    if (m) { ev.preventDefault(); modeOp(m.dataset.cookMode); }
  }, true);
  globalThis.document?.addEventListener?.("keydown", (ev) => {
    if (at < 0) return;
    if (ev.key === "ArrowRight") modeOp("next");
    else if (ev.key === "ArrowLeft") modeOp("prev");
    else if (ev.key === "Escape") closeMode();
  });

  return { stepHtml, timesIn, sync, supported, start, groupsOf, stepUses, ingredientsHtml, usesHtml, setRecipe, segment, _timers: () => timers, _mode: () => ({ at, loop, showAll }), _hand: () => hand, _see: seeGesture };
})();
if (typeof module !== "undefined") module.exports = CookMode;
