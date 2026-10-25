/* 作る画面の手助け：
   ・画面を消さない（Wake Lock。対応していない端末では何もしない）
   ・手順の「8分」「30秒」「1分30秒」をタップでタイマー（画面の下に並ぶ・いくつでも・鳴ったら音と振動）
   ・手順ごとに「使う材料と分量」を出す。タレなど「A」「☆」でまとめた材料は、まとめて出す
   ・🍳 料理モード：左（縦持ちは上）に動画（その手順の場面をくり返す）、右に手順と、その手順で使う材料
   タイマーと料理モードは #app の外に描くので、アプリの描き直しで消えない。 */
const CookMode = (() => {
  const _esc = (s) => (s == null ? "" : String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"));
  const escHtml = typeof escapeHtml === "function" ? escapeHtml : _esc;
  const escAttr = typeof escapeAttr === "function" ? escapeAttr : _esc;
  if (typeof escapeHtml === "undefined") globalThis.escapeHtml = escHtml;
  if (typeof escapeAttr === "undefined") globalThis.escapeAttr = escAttr;
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
    const num = (String(label).match(/^(\d+)/) || [])[1] || "";
    return text.replace(TIME, (m, a, _b, unit, half, sec, offset) => {
      const s = seconds(a, unit, half, sec);
      if (!s || s > MAX) return m;
      return `<button type="button" class="cook-timer-chip" data-cook-timer="${s}" data-label="${escapeAttr(`${num ? `${num} ` : ""}${timerName(text, offset, m.length)}`)}" aria-label="${escapeAttr(`${m}のタイマーを始める`)}">⏰${m}${thumb ? '<i class="g" data-g="Thumb_Up" aria-hidden="true">👍</i>' : ""}</button>`;
    });
  }
  // タイマーの短い名前：時間のすぐあとの動き（「3分炒める」→「炒める」）。なければ前の言葉。
  function timerName(text, offset, len) {
    const after = text.slice(offset + len).replace(/^[\s、]*(ほど|くらい|ぐらい|程度|以上|前後|ずつ|ほどで)?[\s、]*/, "").replace(/^(で|に|を|は)/, "");
    let name = (after.match(/^[^、。,.\s（(]{1,8}/) || [""])[0];
    if (!name) name = text.slice(0, offset).split(/[、。]/).pop().replace(/(中火|弱火|強火|で|に|を|は)+$/, "").slice(-6);
    return (name || "タイマー").slice(0, 6);
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
  // 描き直しのたびに呼ぶ：作る画面の間と、料理モードを開いている間は、画面をつけたまま。
  // 料理モードはレシピの詳細からも開ける（ほかの画面へ移ったら閉じる）。
  function sync() {
    if (!["cooking", "recipe"].includes(state.view)) closeMode();
    wanted = state.view === "cooking" || at >= 0;
    if (wanted) acquire(); else release();
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
  function ensureTicker() {
    if (!ticker) {
      ticker = setInterval(tick, 500);
      ticker?.unref?.();
    }
  }
  let lastAlarmBeep = 0;
  function beep() {
    try {
      if (!audio) audio = new (globalThis.AudioContext || globalThis.webkitAudioContext)();
      audio.resume?.();
      [0, 0.25, 0.5].forEach((d) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.frequency.value = d === 0.5 ? 1174.66 : 880;
        o.connect(g); g.connect(audio.destination);
        const t0 = audio.currentTime + d;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
        o.start(t0); o.stop(t0 + 0.23);
      });
    } catch {}
    try { navigator.vibrate?.([350, 150, 350, 150, 500]); } catch {}
  }
  function notifyTimer(t) {
    if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
      try {
        new Notification("⏰ タイマーの時間です！", {
          body: `${t?.label || "タイマー"}（${fmt(t?.total || 0)}）が完了しました`,
          icon: "icons/icon-192.png",
          tag: `cook-timer-${t?.id || "alarm"}`,
        });
      } catch {}
    }
  }
  function tick() {
    let newlyDone = false;
    for (const t of timers) {
      if (!t.done && t.left == null && leftOf(t) <= 0) {
        t.done = true;
        newlyDone = true;
      }
    }
    const ringing = timers.filter((t) => t.done);
    if (ringing.length) {
      const now = Date.now();
      if (newlyDone || now - lastAlarmBeep >= 2500) {
        lastAlarmBeep = now;
        beep();
        notifyTimer(ringing[0]);
      }
    }
    if (!timers.length) { clearInterval(ticker); ticker = null; }
    drawBar();
  }
  function drawBar() {
    let bar = document.getElementById("cook-timer-bar");
    if (!timers.length) { bar?.remove(); return; }
    if (!bar) { bar = document.createElement("div"); bar.id = "cook-timer-bar"; bar.setAttribute("role", "status"); document.body.append(bar); }
    // 小さな札を左上から順に：「⏰ 2:59 3 炒める ✕」。札を押すと一時停止・再開。鳴ったら「+1分」「OK」。
    bar.innerHTML = timers.map((t) => `<div class="ctb-item ${t.done ? "is-done" : ""} ${t.left != null ? "is-paused" : ""}">
      <button type="button" class="ctb-main" data-cook-timer-op="${t.done ? "stop" : "pause"}" data-id="${t.id}" aria-label="${escapeAttr(`${t.label} ${t.done ? "止める" : t.left != null ? "再開" : "一時停止"}`)}"><b class="ctb-time">${t.done ? "⏰" : t.left != null ? `Ⅱ ${fmt(leftOf(t))}` : fmt(leftOf(t))}</b><span class="ctb-label">${escapeHtml(t.label)}${t.done ? " 時間！" : ""}</span></button>
      ${t.done ? `<button type="button" class="ctb-sub" data-cook-timer-op="plus" data-id="${t.id}" aria-label="1分のばす">+1分</button>` : ""}<button type="button" class="ctb-sub" data-cook-timer-op="stop" data-id="${t.id}" aria-label="タイマーを止める">${t.done ? "OK" : "✕"}</button></div>`).join("");
  }
  function op(kind, id) {
    const t = timers.find((x) => x.id === id);
    if (!t) return;
    if (kind === "stop") timers = timers.filter((x) => x !== t);
    if (kind === "plus") { if (t.done) { t.done = false; t.left = null; t.end = Date.now() + 60000; } else if (t.left != null) t.left += 60; else t.end += 60000; }
    if (kind === "pause") { if (t.left != null) { t.end = Date.now() + t.left * 1000; t.left = null; } else t.left = leftOf(t); }
    tick();
  }

  // ---- 🍳 料理モード ----
  // recipe: { title, steps, times[秒], videoId, shorts, ingredients, amountOf, onTimeFix }
  let recipe = null, at = -1, loop = true, showAll = false, frame = null, ready = false, lastSeek = 0, videoTime = null, localTimes = {};
  function parseTime(raw) {
    const val = raw && typeof raw === "object" ? (raw.time ?? raw.seconds ?? raw.start ?? null) : raw;
    if (val === null || val === undefined || val === "" || typeof val === "boolean") return null;
    if (typeof val === "number") return Number.isFinite(val) && val >= 0 && val < 36_000 ? Math.floor(val) : null;
    if (typeof val !== "string") return null;
    const s = val.normalize("NFKC").trim();
    if (!s) return null;
    const colon = s.match(/^(?:(\d{1,2}):)?(\d{1,3}):(\d{2})(?:\.\d+)?$/);
    if (colon) {
      const [, h, m, sec] = colon;
      if (Number(sec) >= 60) return null;
      const total = (h ? Number(h) * 3600 : 0) + Number(m) * 60 + Number(sec);
      return total >= 0 && total < 36_000 ? Math.floor(total) : null;
    }
    const num = s.match(/^(\d+(?:\.\d+)?)\s*s?$/i);
    if (num) {
      const n = Number(num[1]);
      return Number.isFinite(n) && n >= 0 && n < 36_000 ? Math.floor(n) : null;
    }
    return null;
  }
  function stepWeight(step) {
    const s = String(step || "").trim();
    if (!s) return 0;
    const action = /(切る|炒める|焼く|煮る|揚げる|茹でる|ゆでる|蒸す|混ぜる|こねる|包む|盛る|漬ける|冷やす|温める)/.test(s) ? 15 : 0;
    return 10 + Math.min(60, s.length) + action;
  }
  // 保存済みレシピや大まかな章時刻の自動補正：逆転（order）・重複（same/coarse）・密集（cluster）を按分補間する。
  function refineTimes(steps = [], rawTimes = []) {
    const n = Math.max(Array.isArray(steps) ? steps.length : 0, Array.isArray(rawTimes) ? rawTimes.length : 0);
    if (!n) return [];
    const list = Array.from({ length: n }, (_, i) => String(steps?.[i] ?? `手順${i + 1}`).trim());
    const t = list.map((s, i) => (!s ? null : parseTime(Array.isArray(rawTimes) ? rawTimes[i] : null)));
    if (!t.some((x) => x !== null)) return t;
    const needsFill = new Set();
    const validIdx = t.map((x, i) => (x !== null ? i : -1)).filter((i) => i >= 0);
    if (validIdx.length >= 2) {
      let inv = false;
      for (let k = 1; k < validIdx.length; k++) if (t[validIdx[k]] < t[validIdx[k - 1]]) { inv = true; break; }
      if (inv) {
        const m = validIdx.length, dp = new Array(m).fill(1), prev = new Array(m).fill(-1);
        let best = 0;
        for (let i = 1; i < m; i++) {
          for (let j = 0; j < i; j++) if (t[validIdx[j]] <= t[validIdx[i]] && dp[j] + 1 >= dp[i]) { dp[i] = dp[j] + 1; prev[i] = j; }
          if (dp[i] >= dp[best]) best = i;
        }
        const keep = new Set();
        for (let c = best; c >= 0; c = prev[c]) keep.add(validIdx[c]);
        for (const idx of validIdx) if (!keep.has(idx)) { t[idx] = null; needsFill.add(idx); }
      }
    }
    const afterOrder = t.map((x, i) => (x !== null ? i : -1)).filter((i) => i >= 0);
    for (let k = 0; k + 3 < afterOrder.length; k++) {
      const i0 = afterOrder[k], i3 = afterOrder[k + 3];
      if (t[i0] !== null && t[i3] !== null && t[i3] - t[i0] < 30) {
        let endIdx = k + 3;
        while (endIdx + 1 < afterOrder.length && t[afterOrder[endIdx + 1]] - t[i0] < 30) endIdx += 1;
        for (let c = k + 1; c <= endIdx; c++) { t[afterOrder[c]] = null; needsFill.add(afterOrder[c]); }
        k = endIdx;
      }
    }
    let lastSeen = null;
    for (let i = 0; i < n; i++) {
      if (t[i] === null) continue;
      if (lastSeen !== null && t[i] === lastSeen) { t[i] = null; needsFill.add(i); }
      else lastSeen = t[i];
    }
    if (!needsFill.size) return t;
    const anchors = t.map((x, i) => (x !== null ? i : -1)).filter((i) => i >= 0);
    if (!anchors.length) return t;
    const firstA = anchors[0];
    const leading = [];
    for (let i = 0; i < firstA; i++) if (needsFill.has(i) && list[i]) leading.push(i);
    if (leading.length) {
      const endT = t[firstA], startT = Math.max(0, endT - leading.length * 25);
      const group = [...leading, firstA], weights = group.map((idx) => stepWeight(list[idx]) || 10), totalW = weights.reduce((a, b) => a + b, 0) || 1;
      let wAcc = 0;
      for (let k = 0; k < leading.length; k++) {
        const rawT = startT + ((endT - startT) * wAcc) / totalW;
        const prevT = k === 0 ? startT : t[leading[k - 1]] + 1;
        t[leading[k]] = Math.max(0, Math.min(Math.max(0, endT - (leading.length - k)), Math.max(prevT, Math.round(rawT))));
        wAcc += weights[k];
      }
    }
    for (let aIdx = 0; aIdx + 1 < anchors.length; aIdx++) {
      const left = anchors[aIdx], right = anchors[aIdx + 1], mid = [];
      for (let i = left + 1; i < right; i++) if (needsFill.has(i) && list[i]) mid.push(i);
      if (!mid.length) continue;
      const startT = t[left], endT = t[right], span = Math.max(mid.length + 1, endT - startT);
      const group = [left, ...mid], weights = group.map((idx) => stepWeight(list[idx]) || 10), totalW = weights.reduce((a, b) => a + b, 0) || 1;
      let wAcc = weights[0];
      for (let k = 0; k < mid.length; k++) {
        const rawT = startT + (span * wAcc) / totalW;
        const prevT = k === 0 ? startT + 1 : t[mid[k - 1]] + 1;
        t[mid[k]] = Math.min(Math.max(prevT, endT - (mid.length - k)), Math.max(prevT, Math.round(rawT)));
        wAcc += weights[k + 1];
      }
    }
    const lastA = anchors[anchors.length - 1], trailing = [];
    for (let i = lastA + 1; i < n; i++) if (needsFill.has(i) && list[i]) trailing.push(i);
    if (trailing.length) {
      const startT = t[lastA], span = (trailing.length + 1) * 35;
      const group = [lastA, ...trailing], weights = group.map((idx) => stepWeight(list[idx]) || 10), totalW = weights.reduce((a, b) => a + b, 0) || 1;
      let wAcc = weights[0];
      for (let k = 0; k < trailing.length; k++) {
        const rawT = startT + (span * wAcc) / totalW;
        const prevT = k === 0 ? startT + 1 : t[trailing[k - 1]] + 1;
        t[trailing[k]] = Math.min(35_999, Math.max(prevT, Math.round(rawT)));
        wAcc += weights[k + 1];
      }
    }
    return t;
  }
  function setRecipe(r) {
    if (recipe?.videoId !== r?.videoId || JSON.stringify(recipe?.steps) !== JSON.stringify(r?.steps)) {
      localTimes = {};
      videoTime = null;
    }
    recipe = r;
  }
  function currentTimes() {
    const raw = recipe?.timesOf?.() || recipe?.times || [];
    const refined = refineTimes(recipe?.steps || [], raw);
    return refined.map((v, idx) => (localTimes[idx] !== undefined ? localTimes[idx] : v));
  }
  // その手順の場面：始まり＝その手順の時刻、終わり＝次に時刻がある手順の始まり。
  function segment(i) {
    const times = currentTimes();
    const s = Number.isFinite(times[i]) ? times[i] : null;
    if (s == null) return null;
    const next = times.slice(i + 1).find((t) => Number.isFinite(t) && t > s);
    return { start: s, end: next ?? null };
  }
  function nudgeTime(kind) {
    if (at < 0 || !recipe) return;
    const seg = segment(at);
    const cur = seg ? seg.start : (Number.isFinite(videoTime) ? Math.floor(videoTime) : 0);
    let nextSec = cur;
    if (kind === "time-minus") nextSec = Math.max(0, cur - 5);
    else if (kind === "time-plus") nextSec = Math.min(35_999, cur + 5);
    else if (kind === "time-here") {
      if (Number.isFinite(videoTime)) nextSec = Math.max(0, Math.floor(videoTime) - 1);
      else if (seg) nextSec = seg.start;
    }
    localTimes[at] = nextSec;
    try { recipe.onTimeFix?.(at, nextSec); } catch {}
    drawMode();
    seekTo(at);
    flash(`🔁 始まりを ${fmt(nextSec)} に調整`);
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
    if (typeof document === "undefined" || !document.getElementById) return;
    let el = document.getElementById("cook-mode");
    if (at < 0 || !recipe) { el?.remove(); frame = null; document.body.classList.remove("cook-mode-open"); return; }
    const steps = recipe.steps || [];
    const first = !el;
    if (!el) {
      el = document.createElement("div"); el.id = "cook-mode"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "料理モード");
      const seg = segment(at);
      const origin = globalThis.location?.origin ? `&origin=${encodeURIComponent(location.origin)}` : "";
      el.innerHTML = `<div class="cm-video ${recipe.shorts ? "is-shorts" : ""}">${hasVideo() ? `<iframe src="https://www.youtube.com/embed/${recipe.videoId}?playsinline=1&rel=0&enablejsapi=1&autoplay=1${seg ? `&start=${Math.floor(seg.start)}` : ""}${origin}" title="レシピ動画" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>` : `<div class="cm-novideo">${recipe.photoHtml || "🍳"}</div>`}</div>
        <div class="cm-side"><div class="cm-top"><b class="cm-count"></b><span class="cm-title">${escapeHtml(recipe.title || "")}</span><span class="cm-voice"></span><span class="cm-hand"></span></div>
          <div class="cm-dots" aria-hidden="true"></div><div class="cm-body"></div></div>
        <div class="cm-foot"><div class="cm-nav"><button type="button" class="secondary-button cm-nav-btn cm-prev-btn" data-cook-mode="prev">◀ 前へ<i class="g" data-g="Victory" aria-hidden="true">✌️</i></button><button type="button" class="primary-button cm-nav-btn cm-next-btn" data-cook-mode="next"></button></div></div>
        <button type="button" class="cm-exit" data-cook-mode="close" aria-label="料理モードを終わる">✕ 終わる</button>`;
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
    const riceAlert = recipe.staple === "other" && at === 0 ? `<div class="cm-rice-alert"><span class="cm-rice-icon" aria-hidden="true">🍚</span><span>ごはん（主食）は準備できていますか？</span>${recipe.side ? `<b class="cm-side-tag">🥢 添え物：${escapeHtml(recipe.side)}</b>` : ""}</div>` : "";
    const curSeg = segment(at);
    const timeBar = hasVideo() ? `<div class="cm-time-bar" role="group" aria-label="動画のループ位置の微調整"><span class="cm-time-range">🔁 ${curSeg ? `${fmt(curSeg.start)} 〜 ${curSeg.end != null ? fmt(curSeg.end) : "最後"}` : "位置未設定"}</span><div class="cm-time-btns"><button type="button" class="cm-time-btn" data-cook-mode="time-minus" aria-label="この手順の始まりを5秒前にする">⏪ -5秒</button><button type="button" class="cm-time-btn cm-time-here" data-cook-mode="time-here" aria-label="いま再生している位置をこの手順の始まりにする">📍ここ</button><button type="button" class="cm-time-btn" data-cook-mode="time-plus" aria-label="この手順の始まりを5秒後にする">+5秒 ⏩</button></div></div>` : "";
    el.querySelector(".cm-body").innerHTML = `${riceAlert}${timeBar}<p class="cm-step">${stepHtml(steps[at], `${at + 1}. ${String(steps[at]).slice(0, 12)}`, { thumb: true })}</p>
      ${showAll ? `<div class="cm-uses is-all"><p class="cm-uses-head">📋 材料ぜんぶ <button type="button" class="link-inline" data-cook-mode="uses">この手順だけ</button></p>${ingredientsHtml(recipe.ingredients, amount, "cm-list")}</div>`
        : `<div class="cm-uses">${usesList ? `<p class="cm-uses-head">🥄 この手順で使う <button type="button" class="link-inline" data-cook-mode="all">ぜんぶ</button></p><ul class="cm-list">${usesList}</ul>` : `<p class="cm-uses-head">🥄 <button type="button" class="link-inline" data-cook-mode="all">材料をぜんぶ見る</button></p>`}</div>`}`;
    el.querySelector('[data-cook-mode="prev"]').disabled = at === 0;
    drawVoice();
    drawHand();
    el.querySelector('[data-cook-mode="next"]').innerHTML = `${last ? "✓ できた！" : "次へ ▶"}<i class="g" data-g="Open_Palm" aria-hidden="true">✋</i>`;
    if (!first) seekTo(at);
  }
  function openMode() {
    if (!recipe?.steps?.length) return;
    at = 0; showAll = false;
    try { playerCommand?.("pauseVideo"); } catch {}
    drawMode();
    wanted = true; acquire();
    if (!seenCoach()) drawCoach();
    try { trackDaily("cook_mode_opened"); } catch {}
  }
  function closeMode() { if (at < 0) return; handStop(); voiceStop(); at = -1; drawMode(); }
  function modeOp(kind) {
    const n = recipe?.steps?.length || 0;
    if (kind === "open") return openMode();
    if (kind === "close") return closeMode();
    if (kind === "prev") at = Math.max(0, at - 1);
    if (kind === "next") { if (at >= n - 1) { closeMode(); try { showToast("🎉 おつかれさま！「作った！」で記録"); } catch {} return; } at += 1; }
    if (kind === "time-minus" || kind === "time-plus" || kind === "time-here") return nudgeTime(kind);
    if (kind === "hand") { hand.on ? handStop() : handStart(); return; }
    if (kind === "voice") { voice.on ? voiceStop() : voiceStart(); return; }
    if (kind === "coach-start" || kind === "coach-later" || kind === "coach-voice") {
      markCoach();
      document.querySelector("#cook-mode .cm-coach")?.remove();
      if (kind === "coach-start") handStart();
      if (kind === "coach-voice") voiceStart();
      return;
    }
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
  // ---- 🎙️ 声で操作（Web Speech API・ブラウザ標準の音声認識） ----
  // 「次へ」「戻る」「タイマー」「ストップ」「材料」「もう一回」「終了」
  const SpeechRec = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
  const voice = {
    supported: !!SpeechRec,
    on: false,
    listening: false,
    rec: null,
    status: "off",
    msg: "",
    lastHeard: "",
  };

  function parseVoice(text) {
    if (!text) return null;
    const s = String(text).normalize("NFKC").toLowerCase().replace(/[\s、。！？!?,.]/g, "");
    if (!s) return null;

    if (/^(料理モード)?(終了|閉じる|終わり|おわり|おしまい|やめる)$/.test(s) || /(料理モード(を|の)?(終了|終わ))/.test(s)) {
      return { act: "close", label: "終了" };
    }
    if (/(ストップ|止めて|止まれ|止める|消して|静かに)/.test(s)) {
      return { act: "stop", label: "ストップ" };
    }
    if (/(もう一回|もう一度|リピート|最初から|頭から)/.test(s)) {
      return { act: "repeat", label: "もう一回" };
    }
    if (/(タイマー|たいまー|スタート|計って|測って|はかって)/.test(s)) {
      return { act: "timer", label: "タイマー" };
    }
    if (/(材料|ざいりょう|分量|調味料)/.test(s)) {
      return { act: "toggle-uses", label: "材料" };
    }
    if (/(5秒前|五秒前|少し前|ちょっと前|もっと前|早めて)/.test(s)) {
      return { act: "time-minus", label: "5秒前へ" };
    }
    if (/(5秒後|五秒後|少し後|ちょっと後|もっと後|遅らせて)/.test(s)) {
      return { act: "time-plus", label: "5秒後へ" };
    }
    if (/(ここを始まり|ここから開始|今の場面|いまの場面)/.test(s)) {
      return { act: "time-here", label: "ここを始まりに" };
    }
    if (/^(前|前へ|まえ|まえへ|戻る|もどる|戻して|ひとつ前|1つ前)$/.test(s) || /(前へ|戻る|もどして)/.test(s)) {
      return { act: "prev", label: "前へ" };
    }
    if (/^(次|次へ|つぎ|つぎへ|進む|すすむ|進めて|できた|完了|お次|はい|オッケー|ok)$/.test(s) || /(次へ|すすむ|すすめて)/.test(s)) {
      return { act: "next", label: "次へ" };
    }
    return null;
  }

  function chime() {
    try {
      if (!audio) audio = new (globalThis.AudioContext || globalThis.webkitAudioContext)();
      audio.resume?.();
      const t0 = audio.currentTime;
      const o1 = audio.createOscillator(), g1 = audio.createGain();
      o1.frequency.value = 587.33;
      o1.connect(g1); g1.connect(audio.destination);
      g1.gain.setValueAtTime(0.0001, t0);
      g1.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
      g1.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
      o1.start(t0); o1.stop(t0 + 0.1);

      const o2 = audio.createOscillator(), g2 = audio.createGain();
      o2.frequency.value = 880;
      o2.connect(g2); g2.connect(audio.destination);
      g2.gain.setValueAtTime(0.0001, t0 + 0.07);
      g2.gain.exponentialRampToValueAtTime(0.15, t0 + 0.09);
      g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
      o2.start(t0 + 0.07); o2.stop(t0 + 0.2);
    } catch {}
    try { navigator.vibrate?.(25); } catch {}
  }

  function doVoiceAction(cmd) {
    if (!cmd) return;
    chime();
    flash(`🎙️ ${cmd.label}`);
    if (cmd.act === "next") return modeOp("next");
    if (cmd.act === "prev") return modeOp("prev");
    if (cmd.act === "close") return modeOp("close");
    if (cmd.act === "repeat") return seekTo(at);
    if (cmd.act === "time-minus" || cmd.act === "time-plus" || cmd.act === "time-here") return nudgeTime(cmd.act);
    if (cmd.act === "toggle-uses") return modeOp(showAll ? "uses" : "all");
    if (cmd.act === "timer") {
      const ringing = timers.filter((t) => t.done);
      if (ringing.length) { ringing.forEach((t) => op("stop", t.id)); return; }
      const secs = timesIn(recipe?.steps?.[at]);
      const label = (stepHtml(recipe.steps[at], String(at + 1)).match(/data-label="([^"]*)"/) || [])[1] || `${at + 1}`;
      if (secs.length) start(secs[0], label.replace(/&amp;/g, "&"));
      else flash("⏱ この手順に時間はありません");
      return;
    }
    if (cmd.act === "stop") {
      const ringing = timers.filter((t) => t.done);
      if (ringing.length) {
        ringing.forEach((t) => op("stop", t.id));
        flash("⏰ タイマーを止めました");
        return;
      }
      if (timers.length) {
        const active = timers.find((t) => t.left == null && !t.done);
        if (active) {
          op("pause", active.id);
          flash("⏸ タイマーを一時停止");
          return;
        }
      }
      flash("⏸ 止めるタイマーはありません");
    }
  }

  function hearVoice(transcript) {
    voice.lastHeard = transcript;
    const cmd = parseVoice(transcript);
    if (cmd) {
      doVoiceAction(cmd);
      return cmd;
    }
    return null;
  }

  function drawVoice() {
    if (typeof document === "undefined" || !document.getElementById) return;
    const el = document.getElementById("cook-mode");
    const box = el?.querySelector(".cm-voice");
    if (!box) return;
    el.classList.toggle("voice-on", voice.on && voice.status === "ready");
    const privacy = typeof tip === "function" ? tip("🎙️ 声で操作：声を聞き取りやすくするため動画は消音になります。「次へ」「戻る」「タイマー」「ストップ」などと話しかけて操作できます。音声はスマホの外に送りません") : "";
    box.innerHTML = `<button type="button" class="cm-voice-btn ${voice.on ? "is-active" : ""}" data-cook-mode="voice" aria-pressed="${voice.on}" aria-label="${voice.on ? "声で操作をやめる" : "声で操作する"}" ${voice.status === "loading" ? "disabled" : ""}>${voice.status === "loading" ? "⏳ 準備中" : voice.on ? "🎙️ 操作中" : "🎙️ 声で操作"}</button>${privacy}`;
  }

  function voiceStart() {
    if (!SpeechRec) {
      voice.status = "error";
      voice.msg = "このブラウザは音声操作に対応していません";
      flash("🎙️ 音声操作に未対応です");
      drawVoice();
      return;
    }
    if (voice.on) return;
    voice.on = true;
    voice.status = "loading";
    drawVoice();
    try { post("mute"); } catch {}

    try {
      const rec = new SpeechRec();
      rec.lang = "ja-JP";
      rec.continuous = true;
      rec.interimResults = false;
      rec.maxAlternatives = 3;

      rec.onstart = () => {
        voice.listening = true;
        voice.status = "ready";
        voice.msg = "";
        drawVoice();
        flash("🎙️ 声で操作できます（「次へ」「戻る」等）");
      };

      rec.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          if (!res.isFinal && event.results.length > 1) continue;
          for (let j = 0; j < res.length; j++) {
            const transcript = res[j]?.transcript?.trim();
            if (!transcript) continue;
            const cmd = hearVoice(transcript);
            if (cmd) break;
          }
        }
      };

      rec.onerror = (event) => {
        if (event.error === "no-speech") return;
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          voice.status = "error";
          voice.msg = "マイクへのアクセスが許可されていません";
          flash("🎙️ マイクが許可されていません");
          voiceStop();
          return;
        }
      };

      rec.onend = () => {
        voice.listening = false;
        if (voice.on && at >= 0) {
          setTimeout(() => {
            if (voice.on && at >= 0) {
              try { rec.start(); } catch {}
            }
          }, 300);
        } else {
          voice.status = "off";
          drawVoice();
        }
      };

      rec.start();
      voice.rec = rec;
      try { trackDaily("cook_voice_on"); } catch {}
    } catch (e) {
      voiceStop();
      voice.status = "error";
      voice.msg = "マイクの起動に失敗しました";
      drawVoice();
    }
  }

  function voiceStop() {
    voice.on = false;
    voice.listening = false;
    try { post("unMute"); } catch {}
    if (voice.rec) {
      try { voice.rec.stop(); } catch {}
      voice.rec = null;
    }
    if (voice.status !== "error") voice.status = "off";
    drawVoice();
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
    const label = (stepHtml(recipe.steps[at], String(at + 1)).match(/data-label="([^"]*)"/) || [])[1] || `${at + 1}`;
    if (secs.length) start(secs[0], label.replace(/&amp;/g, "&"));
    else flash("⏱ この手順に時間はありません");
  }
  function flash(text) {
    if (typeof document === "undefined" || !document.querySelector) return;
    const box = document.querySelector("#cook-mode .cm-video");
    if (!box) return;
    box.querySelector(".hg-flash")?.remove();
    const f = document.createElement("div"); f.className = "hg-flash"; f.textContent = text; box.append(f);
    setTimeout(() => f.remove(), 900);
  }
  // ✋ のオン・オフは見出しの ✕ の左。合図は各ボタンの中の絵文字（◀ 前へ✌️・次へ ▶✋・⏰3分👍）。
  function drawHand() {
    if (typeof document === "undefined" || !document.getElementById) return;
    const el = document.getElementById("cook-mode");
    const box = el?.querySelector(".cm-hand");
    if (!box) return;
    el.classList.toggle("hand-on", hand.on && hand.status === "ready");
    const privacy = typeof tip === "function" ? tip("✋ 手の形で操作：✋次へ・✌️戻る・👍タイマー。カメラの映像はスマホの中だけで使い、外には送りません") : "";
    box.innerHTML = `<button type="button" class="cm-hand-btn" data-cook-mode="hand" aria-pressed="${hand.on}" aria-label="${hand.on ? "手で操作をやめる" : "手の形で操作する"}" ${hand.status === "loading" ? "disabled" : ""}>${hand.status === "loading" ? "⏳ 準備中" : hand.on ? "✋ 操作中" : "✋ 手で操作"}</button>${privacy}`;
    el.querySelector(".cm-video .hg-wait")?.remove();
    if (hand.status === "loading") { const w = document.createElement("div"); w.className = "hg-flash hg-wait"; w.textContent = "⏳ 手の認識を準備中…（初回だけ数MB）"; el.querySelector(".cm-video")?.append(w); }
    if (hand.status === "error" && hand.msg) { flash(`📷 ${hand.msg}`); hand.msg = ""; }
    drawHandLive();
  }
  // はじめて料理モードを開いた時だけ：手の形で操作できることを、合図の絵つきで1枚で。
  const COACH_KEY = "ripigochi-hand-coach";
  function seenCoach() { try { return localStorage.getItem(COACH_KEY) === "1"; } catch { return true; } }
  function markCoach() { try { localStorage.setItem(COACH_KEY, "1"); } catch {} }
  function drawCoach() {
    if (typeof document === "undefined" || !document.getElementById) return;
    const el = document.getElementById("cook-mode");
    if (!el || el.querySelector(".cm-coach")) return;
    const c = document.createElement("div");
    c.className = "cm-coach"; c.setAttribute("role", "dialog"); c.setAttribute("aria-label", "声や手で操作");
    c.innerHTML = `<div class="cc-card">${typeof yohaku === "function" ? yohaku("wave", "cc-yohaku") : ""}<p class="cc-kicker">手がふさがっていても、濡れていても</p><h3>🎙️ 声や ✋ 手で操作できます</h3>
      <ul class="cc-signs"><li><b>🎙️</b><span>声で</span><small>「次へ」「戻る」</small></li><li><b>✋</b><span>手で</span><small>かざして進める</small></li><li><b>👆</b><span>特大ボタン</span><small>手首でもポン</small></li></ul>
      <p class="cc-note">マイクやカメラのデータはスマホの中だけで安全に使い、外には送りません。<br>下の特大ボタンなら、濡れた手でも手首や関節で直接ポンと叩けます。</p>
      <button type="button" class="primary-button" data-cook-mode="coach-voice">🎙️ 声で操作をはじめる</button>
      <button type="button" class="secondary-button" data-cook-mode="coach-start">✋ 手で操作をはじめる</button>
      <button type="button" class="text-button" data-cook-mode="coach-later">あとで（右上のボタンからいつでも）</button></div>`;
    el.append(c);
  }
  // いま見えている形のボタンを光らせ、見せ続けた長さをバーで出す。
  function drawHandLive() {
    if (typeof document === "undefined" || !document.querySelectorAll) return;
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
    if (Number.isFinite(t)) videoTime = t;
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

  return { stepHtml, timesIn, sync, supported, start, groupsOf, stepUses, ingredientsHtml, usesHtml, setRecipe, segment, refineTimes, nudgeTime, parseVoice, _timers: () => timers, _clearTimers: () => { timers = []; clearInterval(ticker); ticker = null; }, _mode: () => ({ at, loop, showAll }), _hand: () => hand, _voice: () => voice, _see: seeGesture, _hear: hearVoice, _beep: beep, openMode, closeMode };
})();
if (typeof module !== "undefined") module.exports = CookMode;
