/* わが家のごはん方針（docs/PERSONALIZE_PLAN.md §4・§5、APP_MAP §37）
   答え → 解釈（推測／合ってる／違う）→ 本人が確かめて保存（方針の版）→ 献立の加点と理由。
   - 画面はない純粋な関数（talk-ui.js が画面）。state.tasteProfile に版つきで足す。既存の項目は変えない。
   - 食べられないもの・苦手（foodProfile）は、ここでは読むだけ。解釈やAIの出力で外したり足したりしない。
   - 家族の同期（buildSyncPayload）には入れない。端末ごと。バックアップ（書き出し）には入る。
   - この版はAIを使わない（決まったルールで解釈）。AIの出力を受け取る時の検査（fromAi）と、
     失敗した時にルールへ戻る道（interpretWithAi）だけ先に用意する。 */
(function (root) {
  const L = typeof module !== "undefined" && module.exports ? require("./lifestyle.js") : root.Lifestyle;
  const VERSION = 1;
  const MAX_ANSWERS = 120, MAX_SNAPSHOTS = 30, MAX_TEXT = 200;
  // 「わからない」と「あとで」も答えのひとつ（同じ質問をくり返さない）。「あとで」は次に開いた時にまた聞く。
  const IDK = "idk", LATER = "later";

  const WANT_OF = { fish: "魚", fried: "揚げもの", stew: "煮込み", veg: "野菜のおかず" };
  const WHY = {
    fish: [["bones", "🦴", "骨・下ごしらえ"], ["clean", "🧽", "片付け・におい"], ["doneness", "🔥", "焼き加減"], ["price", "💴", "値段"]],
    fried: [["oil", "🛢", "油の後始末"], ["clean", "🧽", "片付け"], ["fear", "😨", "油がはねるのがこわい"]],
    stew: [["time", "⏳", "時間がかかる"], ["amount", "🍲", "量が多くなる"]],
    veg: [["prep", "🔪", "切るのが面倒"], ["bland", "🧂", "味が決まらない"]],
  };
  // 質問。when(a) が真の時だけ聞く（a = { 質問ID: 値 }）。multi は複数選べる。
  const QUESTIONS = [
    { id: "hard", ask: () => "夜ごはんで、いちばん大変なのは？", choices: () => [["think", "🤔", "何を作るか考える"], ["shop", "🛒", "買い物"], ["clean", "🧽", "片付け・洗い物"], ["time", "⏰", "作る時間がない"]] },
    { id: "want", ask: () => "好きなのに、あまり作らないものは？", choices: () => [["fish", "🐟", "魚"], ["fried", "🍤", "揚げもの"], ["stew", "🍲", "煮込み"], ["veg", "🥬", "野菜のおかず"], ["none", "🙆", "特にない"]] },
    { id: "why", ask: (a) => `${WANT_OF[a.want]}を作らないのは、どれが気になるから？`, when: (a) => own(WHY, a.want), choices: (a) => WHY[a.want] },
    { id: "taste", multi: true, ask: () => "よく食べたい味は？（いくつでも）", choices: () => [["sweet", "🍯", "甘辛"], ["light", "🍋", "さっぱり"], ["spicy", "🌶", "ピリ辛"], ["rich", "🧈", "こってり"], ["gentle", "🍵", "やさしい味"]] },
    // 「片付けが大変」と答えた人には、洗い物のことはもう聞かない（同じことを2度聞かない）。
    { id: "weeknight", ask: () => "平日の夜、ゆずれないのは？", when: (a) => a.hard !== "clean", choices: () => [["quick", "⚡", "早くできる"], ["onepan", "🍳", "洗い物が少ない"], ["knife", "🔪", "包丁をあまり使わない"], ["any", "🙆", "こだわらない"]] },
    // 深掘り（PR 2b）：平日と休日の違い・一緒に食べる人との違い。相手の好みは、相手が自分の端末で答える（ここで決めない）。
    { id: "weekend", ask: () => "休日の夜は、平日とちがう？", choices: () => [["same", "🙆", "同じでいい"], ["cook", "🍳", "休日はじっくり作りたい"], ["relax", "🛋", "休日も手早くすませたい"], ["out", "🍽", "休日は外食が多い"]] },
    { id: "together", ask: () => "一緒に食べる人と、好みはちがう？", choices: () => [["alone", "🧑", "ひとりで食べる"], ["same", "🤝", "だいたい同じ"], ["some", "🔀", "ときどきちがう"], ["diff", "↔️", "けっこうちがう"]] },
  ];
  const QUESTION = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));
  // 一覧に自分で書いた項目だけを認める（"constructor" "toString" "__proto__" など、継承した名前を通さない）。
  const own = (obj, key) => typeof key === "string" && Object.prototype.hasOwnProperty.call(obj, key);

  // 解釈の一覧（許可した項目だけ。AIもこの中からしか選べない）。
  // match(recipe) が真の料理に、確かめた解釈ぶん加点する。short は献立カードの理由（約12文字）。
  const has = (r, re) => re.test([r?.title, ...(r?.ingredients || []).map((i) => i.name), ...(r?.steps || [])].join(" "));
  const tagSet = (r) => new Set(L.tags(r));
  const eq = (r) => r?.planning?.equipment || [];
  const fish = (r) => L.traits(r).protein === "fish" || tagSet(r).has("fish");
  const LEANS = {
    "fish-easy": { kind: "taste", label: "🐟 魚は好き。片付けがラクな蒸し・レンジの魚料理を候補に", short: "💬 魚をラクに", ask: "魚を減らすより、蒸し焼きやレンジの魚料理を候補に入れてみます。合っていますか？", match: (r) => fish(r) && (tagSet(r).has("light") || tagSet(r).has("micro") || has(r, /蒸し|ホイル|レンジ/)) },
    "fish-noprep": { kind: "taste", label: "🐟 骨のない切り身や缶詰の魚料理を候補に", short: "💬 骨なしの魚", ask: "骨のない切り身や、さば缶・ツナ缶の料理を候補に入れてみます。合っていますか？", match: (r) => fish(r) && has(r, /切り身|鮭|さけ|ツナ|缶|たら/) },
    "fish-pan": { kind: "taste", label: "🐟 フライパン・レンジで失敗しにくい魚料理を候補に", short: "💬 失敗しにくい魚", ask: "焼き加減を気にしなくていい、ふたをして蒸す・レンジの魚料理を候補に入れてみます。合っていますか？", match: (r) => fish(r) && (tagSet(r).has("micro") || has(r, /蒸し|ふた|缶/)) },
    "fish-cheap": { kind: "taste", label: "🐟 手ごろな缶詰の魚料理を候補に", short: "💬 缶詰の魚", ask: "さば缶・ツナ缶など、手ごろな魚の料理を候補に入れてみます。合っていますか？", match: (r) => fish(r) && has(r, /缶|ツナ/) },
    "fried-pan": { kind: "taste", label: "🍤 揚げずに、少ない油で焼く料理を候補に", short: "💬 揚げずに", ask: "たっぷりの油で揚げずに、フライパンの揚げ焼きを候補に入れてみます。合っていますか？", match: (r) => has(r, /揚げ焼き|衣なし|照り焼き/) },
    "stew-quick": { kind: "taste", label: "🍲 20分以内でできる汁もの・煮もの", short: "💬 短い煮込み", ask: "長く煮込まずに、20分以内でできる汁もの・煮ものを候補に入れてみます。合っていますか？", match: (r) => (tagSet(r).has("soup") || tagSet(r).has("pot")) && (r?.planning?.minutes || 99) <= 20 },
    "veg-easy": { kind: "taste", label: "🥬 切る手間の少ない野菜のおかず", short: "💬 野菜をラクに", ask: "切る手間の少ない（レンジ・キッチンばさみ）野菜の料理を候補に入れてみます。合っていますか？", match: (r) => tagSet(r).has("veg") && (tagSet(r).has("micro") || !eq(r).includes("包丁")) },
    "veg-flavor": { kind: "taste", label: "🥬 味が決まりやすい、しっかり味の野菜料理", short: "💬 野菜をしっかり味", ask: "みそ・バター・甘辛など、味が決まりやすい野菜料理を候補に入れてみます。合っていますか？", match: (r) => tagSet(r).has("veg") && (tagSet(r).has("rich") || tagSet(r).has("spicy") || has(r, /みそ|バター|甘辛/)) },
    "taste-sweet": { kind: "taste", label: "🍯 甘辛い味が好き", short: "💬 甘辛好き", match: (r) => has(r, /甘辛|照り焼き|しょうが焼き|そぼろ|すき焼き|ヤンニョム/) },
    "taste-light": { kind: "taste", label: "🍋 さっぱりした味が好き", short: "💬 さっぱり好き", match: (r) => tagSet(r).has("light") },
    "taste-spicy": { kind: "taste", label: "🌶 ピリ辛が好き", short: "💬 ピリ辛好き", match: (r) => tagSet(r).has("spicy") },
    "taste-rich": { kind: "taste", label: "🧈 こってりした味が好き", short: "💬 こってり好き", match: (r) => tagSet(r).has("rich") },
    "taste-gentle": { kind: "taste", label: "🍵 やさしい味が好き", short: "💬 やさしい味", match: (r) => !tagSet(r).has("spicy") && has(r, /やさしい|豆腐|卵|みそ|塩|だし/) },
    "life-quick": { kind: "life", label: "⚡ 平日は早くできる料理", short: "💬 早くできる", match: (r) => (r?.planning?.minutes || 99) <= 15 },
    "life-onepan": { kind: "life", label: "🍳 洗い物が少ない料理（フライパンかレンジひとつ）", short: "💬 洗い物少なめ", match: (r) => { const e = eq(r); return e.length > 0 && !(e.includes("鍋") && e.includes("フライパン")) && !(e.includes("包丁") && e.includes("フライパン") && e.includes("ふた")); } },
    "life-knife": { kind: "life", label: "🔪 包丁をあまり使わない料理", short: "💬 包丁なし", match: (r) => eq(r).length > 0 && !eq(r).includes("包丁") },
    // days: "weekend" は、土日の献立にだけ加点する。
    "weekend-cook": { kind: "life", days: "weekend", label: "🍳 休日は、少し手間のかかる料理も候補に", short: "💬 休日はじっくり", ask: "休日は、少し手間のかかる料理（煮込み・焼きもの）も候補に入れます。合っていますか？", match: (r) => (r?.planning?.minutes || 0) >= 20 && (tagSet(r).has("rich") || tagSet(r).has("pot") || has(r, /煮|焼/)) },
    "weekend-quick": { kind: "life", days: "weekend", label: "🛋 休日も、手早く作れる料理", short: "💬 休日も手早く", ask: "休日も、15分くらいで作れる料理を先に出します。合っていますか？", match: (r) => (r?.planning?.minutes || 99) <= 15 },
    // 「変えるなら？」（最初の提案への反応）から決まるもの。
    "life-few": { kind: "life", label: "🧺 材料が少ない料理", short: "💬 材料少なめ", match: (r) => (r?.ingredients || []).length > 0 && (r?.ingredients || []).length <= 6 },
    // 献立の加点はしない、生活の理解（買い物のペースなどは PR 5 で使う）。
    "life-weekend-out": { kind: "life", label: "🍽 休日は外食が多い（休日の献立は、設定の「作る曜日」で減らせます）" },
    "together-diff": { kind: "life", label: "👥 一緒に食べる人と好みがちがう → 相手の好みは、相手が自分の端末で答えます" },
    "life-think": { kind: "life", label: "🤔 何を作るか考えるのが大変 → 献立はリピごちが先に出します" },
    "life-shop": { kind: "life", label: "🛒 買い物が大変 → 買う回数と品数を減らしたい" },
  };
  const LEAN_SCORE = 6, LEAN_MAX = 12;
  const isLean = (id) => own(LEANS, id);
  const isQuestion = (id) => own(QUESTION, id);

  const str = (v, n = 40) => (typeof v === "string" ? v.slice(0, n) : "");
  const iso = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(v) ? v : "");
  function empty() {
    return { v: VERSION, answers: [], decisions: {}, drafts: {}, snapshots: [], session: null, share: {}, updatedAt: "" };
  }
  function validValue(q, value) {
    if (value === IDK || value === LATER) return true;
    const all = (q.id === "why" ? Object.values(WHY).flat() : q.choices({})).map((c) => c[0]);
    return q.multi ? Array.isArray(value) && value.length <= 8 && value.every((x) => all.includes(x)) : all.includes(value);
  }
  // 読み込むたびに通す。何度通しても同じ結果（移行を複数回しても重ならない）。
  function normalize(raw) {
    const out = empty();
    if (!raw || typeof raw !== "object") return out;
    const seen = new Set();
    // 新しい順。同じ人・同じ質問は最新だけ。
    (Array.isArray(raw.answers) ? raw.answers : [])
      .filter((a) => a && isQuestion(a.q) && validValue(QUESTION[a.q], a.value))
      .sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")))
      .forEach((a) => {
        const member = str(a.member, 20);
        const k = member + "\u0000" + a.q;
        if (seen.has(k) || out.answers.length >= MAX_ANSWERS) return;
        seen.add(k);
        out.answers.push({ member, q: a.q, value: Array.isArray(a.value) ? [...new Set(a.value)] : a.value, ...(str(a.text, MAX_TEXT).trim() ? { text: str(a.text, MAX_TEXT).trim() } : {}), at: iso(a.at) });
      });
    for (const [k, d] of Object.entries(raw.decisions && typeof raw.decisions === "object" ? raw.decisions : {})) {
      const [member, id] = k.split("\u0000");
      if (!isLean(id) || !d || !["confirmed", "rejected"].includes(d.status)) continue;
      out.decisions[`${str(member, 20)}\u0000${id}`] = { status: d.status, at: iso(d.at), ...(d.via === "react" ? { via: "react" } : {}) };
    }
    out.snapshots = (Array.isArray(raw.snapshots) ? raw.snapshots : [])
      .filter((s) => s && Number.isInteger(s.v) && s.v > 0 && Array.isArray(s.items))
      .slice(-MAX_SNAPSHOTS)
      .map((s) => ({ v: s.v, at: iso(s.at), member: str(s.member, 20), reason: ["first", "edit", "reaction"].includes(s.reason) ? s.reason : "edit", items: s.items.filter((x) => x && isLean(x.id)).slice(0, 30).map((x) => ({ id: x.id, status: x.status === "confirmed" ? "confirmed" : "rejected" })) }));
    const s = raw.session;
    if (s && typeof s === "object") out.session = { member: str(s.member, 20), stage: ["ask", "confirm", "check", "suggest", "view", "type"].includes(s.stage) ? s.stage : "ask", ...(s.stage === "type" && Number.isInteger(s.typeStep) && s.typeStep >= 0 && s.typeStep <= 4 ? { typeStep: s.typeStep } : {}), confirmId: isLean(s.confirmId) ? s.confirmId : "", q: isQuestion(s.q) ? s.q : "", startedAt: iso(s.startedAt), updatedAt: iso(s.updatedAt) };
    // 答える前に書きかけたひとこと（人・質問ごと）。会話（session）の外に置くので、方針を保存して会話が終わっても残る。
    // 以前の形（session.notes）は、その会話の人の書きかけとして移す。
    const addDraft = (member, q, t) => {
      if (!isQuestion(q) || typeof t !== "string" || !t.trim()) return;
      const k = `${str(member, 20)}\u0000${q}`;
      if (!own(out.drafts, k) && Object.keys(out.drafts).length < MAX_ANSWERS) out.drafts[k] = t.trim().slice(0, MAX_TEXT);
    };
    for (const [k, t] of Object.entries(raw.drafts && typeof raw.drafts === "object" ? raw.drafts : {})) { const [member, q] = k.split("\u0000"); addDraft(member, q, t); }
    if (s && typeof s === "object" && s.notes && typeof s.notes === "object") for (const [q, t] of Object.entries(s.notes)) addDraft(s.member, q, t);
    // 最初の提案の「変えるなら？」で外した料理（その会話の間だけ）。
    if (out.session && Array.isArray(s.skip)) { const skip = s.skip.filter((x) => typeof x === "string" && x.length <= 80).slice(-20); if (skip.length) out.session.skip = skip; }
    if (iso(raw.dismissedAt)) out.dismissedAt = iso(raw.dismissedAt);
    // 共有の範囲（人ごと・本人が選ぶ）。family：✓ にした方針だけを家族の端末へ（答え・ひとことは送らない）。
    // ai：サーバーのAIへの送信。家族とは別に持つ（この版は画面で選べない＝送らない）。
    // 以前の形（{ family:false, ai:false }）は、だれも選んでいないので空になる。
    for (const [m, v] of Object.entries(raw.share && typeof raw.share === "object" ? raw.share : {})) {
      if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(out.share).length >= 12) continue;
      out.share[str(m, 20)] = { family: v.family === true, ai: v.ai === true, at: iso(v.at) };
    }
    out.updatedAt = iso(raw.updatedAt);
    return out;
  }
  const answersOf = (p, member) => Object.fromEntries(p.answers.filter((a) => a.member === member).map((a) => [a.q, a.value]));
  function asked(p, member) {
    const a = answersOf(p, member);
    return QUESTIONS.filter((q) => !q.when || q.when(a));
  }
  // その答えが、いまの前の答えに合っているか（「魚」の理由のまま「揚げもの」に変えた時など）。
  const fits = (a, q) => q.id !== "why" || [IDK, LATER].includes(a.why) || (own(WHY, a.want) ? WHY[a.want] : []).some((c) => c[0] === a.why);
  // 次に聞く質問。答えた質問（わからない・あとでを含む）は聞かない。
  function nextQuestion(p, member) {
    const a = answersOf(p, member);
    return asked(p, member).find((q) => !(q.id in a) || !fits(a, q)) || null;
  }
  function answer(p, { member, q, value, text = "", at }) {
    if (!isQuestion(q) || !validValue(QUESTION[q], value)) return p;
    // 「好きなのに作らないもの」を変えたら、その理由は聞き直す。
    const prev = answersOf(p, member)[q];
    const drop = q === "want" && prev !== undefined && prev !== value ? ["why"] : [];
    const rest = p.answers.filter((x) => !(x.member === member && (x.q === q || drop.includes(x.q))));
    const next = { member, q, value: Array.isArray(value) ? [...new Set(value)] : value, ...(String(text || "").trim() ? { text: String(text).trim().slice(0, MAX_TEXT) } : {}), at };
    return { ...p, answers: [next, ...rest].slice(0, MAX_ANSWERS), updatedAt: at };
  }
  // 答えから決まったルールで解釈する。回答を直すと、ここから作り直すので、関係する解釈も変わる。
  function interpret(p, member, foodProfile = null) {
    const a = answersOf(p, member);
    if (!fits(a, QUESTION.why)) delete a.why;
    const ids = [];
    const add = (id, from) => { if (isLean(id) && !ids.some((x) => x.id === id)) ids.push({ id, from }); };
    if (a.want === "fish") add({ bones: "fish-noprep", clean: "fish-easy", doneness: "fish-pan", price: "fish-cheap" }[a.why] || "", ["want", "why"]);
    if (a.want === "fried" && WHY.fried.some((c) => c[0] === a.why)) add("fried-pan", ["want", "why"]);
    if (a.want === "stew" && WHY.stew.some((c) => c[0] === a.why)) add("stew-quick", ["want", "why"]);
    if (a.want === "veg") add({ prep: "veg-easy", bland: "veg-flavor" }[a.why] || "", ["want", "why"]);
    (Array.isArray(a.taste) ? a.taste : []).forEach((t) => add(`taste-${t}`, ["taste"]));
    if (a.hard === "clean") add("life-onepan", ["hard"]);
    if (a.hard === "time") add("life-quick", ["hard"]);
    if (a.hard === "think") add("life-think", ["hard"]);
    if (a.hard === "shop") add("life-shop", ["hard"]);
    add({ quick: "life-quick", onepan: "life-onepan", knife: "life-knife" }[a.weeknight] || "", ["weeknight"]);
    add({ cook: "weekend-cook", relax: "weekend-quick", out: "life-weekend-out" }[a.weekend] || "", ["weekend"]);
    if (["some", "diff"].includes(a.together)) add("together-diff", ["together"]);
    // 「変えるなら？」で本人が決めたもの（答えから生まれたものではないので、答えを直しても消えない）。
    for (const [k, d] of Object.entries(p.decisions)) {
      const [who, id] = k.split("\u0000");
      if (who === member && d.via === "react" && isLean(id)) add(id, []);
    }
    const items = ids.map(({ id, from }) => {
      const d = p.decisions[`${member}\u0000${id}`];
      return { id, kind: LEANS[id].kind, label: LEANS[id].label, short: LEANS[id].short || "", ask: LEANS[id].ask || "", from, status: d?.status || "guess", source: d?.via === "react" ? "reaction" : "rules" };
    });
    // 食べられないもの・苦手は、設定（foodProfile）のまま。ここで変えない。アレルギーと苦手は分けて見せる。
    const fp = foodProfile || {};
    const locked = [
      ...(fp.restrictions || []).map((n) => ({ id: `restriction:${n}`, kind: "restriction", label: `🚫 ${n}（食べられない）`, status: "confirmed", source: "settings", locked: true })),
      ...(fp.dislikes || []).map((n) => ({ id: `dislike:${n}`, kind: "restriction", label: `🙅 ${n}（苦手）`, status: "confirmed", source: "settings", locked: true })),
    ];
    return [...items, ...locked];
  }
  // 書きかけのひとこと。空なら消す。
  const draftOf = (p, member, q) => (p?.drafts && own(p.drafts, `${member}\u0000${q}`) ? p.drafts[`${member}\u0000${q}`] : undefined);
  function setDraft(p, { member, q, text }) {
    if (!isQuestion(q)) return p;
    const k = `${member}\u0000${q}`, t = String(text || "").trim().slice(0, MAX_TEXT);
    if ((draftOf(p, member, q) || "") === t) return p;
    const drafts = { ...(p.drafts || {}) };
    if (t) drafts[k] = t; else delete drafts[k];
    return { ...p, drafts };
  }
  function decide(p, { member, id, status, at, via = "" }) {
    if (!isLean(id)) return p;
    const decisions = { ...p.decisions };
    const prevVia = decisions[`${member}\u0000${id}`]?.via;
    if (status === "guess") delete decisions[`${member}\u0000${id}`];
    else if (["confirmed", "rejected"].includes(status)) decisions[`${member}\u0000${id}`] = { status, at, ...(via === "react" || prevVia === "react" ? { via: "react" } : {}) };
    return { ...p, decisions, updatedAt: at };
  }
  // 本人が「この方針で保存」を押した時の版。当時の内容と理由を残す（変化を見る時に使う：PR 6）。
  function snapshot(p, { member, at, foodProfile, reason = "" }) {
    const items = interpret(p, member, foodProfile).filter((x) => !x.locked && x.status !== "guess").map((x) => ({ id: x.id, status: x.status }));
    const mine = p.snapshots.filter((s) => s.member === member);
    const v = (mine[mine.length - 1]?.v || 0) + 1;
    return { ...p, snapshots: [...p.snapshots, { v, at, member, reason: reason === "reaction" ? "reaction" : mine.length ? "edit" : "first", items }].slice(-MAX_SNAPSHOTS), session: null, updatedAt: at };
  }
  // 最初の提案への「変えるなら？」。time＝時間が長い → 早くできる料理を、many＝材料が多い → 材料が少ない料理を「合ってる」に。
  // 本人が押したことなので確かめ済み。方針の版も1つ残す（理由：reaction）。
  const REACTIONS = { time: "life-quick", many: "life-few" };
  function react(p, { member, kind, at }) {
    const id = own(REACTIONS, kind) ? REACTIONS[kind] : "";
    if (!id) return p;
    const next = decide(p, { member, id, status: "confirmed", at, via: "react" });
    const session = next.session;
    return { ...snapshot(next, { member, at, reason: "reaction" }), session };
  }
  // 方針の履歴：版ごとに、前の版から増えた（✓）・外した（✕ や、なくなった）項目。
  function history(p, member) {
    const mine = p.snapshots.filter((s) => s.member === member);
    return mine.map((s, i) => {
      const prev = new Set((mine[i - 1]?.items || []).filter((x) => x.status === "confirmed").map((x) => x.id));
      const now = new Set(s.items.filter((x) => x.status === "confirmed").map((x) => x.id));
      return { v: s.v, at: s.at, reason: s.reason, added: [...now].filter((id) => !prev.has(id)), removed: [...prev].filter((id) => !now.has(id)), count: now.size };
    }).reverse();
  }
  // 献立の加点。本人が「合ってる」と確かめた解釈だけを使う（推測や「違う」は使わない）。
  // 献立を作るたびに料理の数だけ呼ぶので、確かめた解釈を先に1度だけ数える。
  // others（{ 名前: [解釈ID] }）は、家族が見せている方針。自分のものと同じ重みで足す（合計の上限は同じ）。
  function leaner(p, member, others = {}) {
    const mine = p ? interpret(p, member).filter((x) => x.status === "confirmed" && isLean(x.id)).map((x) => ({ id: x.id, who: "" })) : [];
    const theirs = Object.entries(others && typeof others === "object" ? others : {}).flatMap(([who, ids]) => (who === member || !Array.isArray(ids) ? [] : ids.filter(isLean).map((id) => ({ id, who: str(who, 20) }))));
    const sure = [...mine, ...theirs].filter((x) => LEANS[x.id].match);
    const weekend = (date) => { if (!date) return false; const d = new Date(`${date}T12:00:00`).getDay(); return d === 0 || d === 6; };
    // date が分かる時は、休日だけの項目（days: "weekend"）を土日にだけ使う。分からない時は使わない。
    return (recipe, date = "") => {
      if (!sure.length || !recipe) return null;
      const hits = sure.filter((x) => (LEANS[x.id].days !== "weekend" || weekend(date)) && LEANS[x.id].match(recipe));
      if (!hits.length) return null;
      const ids = [...new Set(hits.map((x) => x.id))];
      const top = hits[0];
      return { score: Math.min(LEAN_MAX, ids.length * LEAN_SCORE), reason: top.who ? `💬 ${top.who}：${LEANS[top.id].short.replace(/^💬\s*/, "")}` : LEANS[top.id].short, ids };
    };
  }
  const leanFor = (p, member, recipe, date = "") => leaner(p, member)(recipe, date);
  // ---- 共有の範囲 ----
  const shareOf = (p, member) => ({ family: false, ai: false, ...(p?.share && own(p.share, member) ? p.share[member] : {}) });
  function setShare(p, { member, family, at }) {
    return { ...p, share: { ...p.share, [member]: { ...shareOf(p, member), family: family === true, at } }, updatedAt: at };
  }
  // 家族に見せるもの：その人が ✓ にした解釈のIDだけ（答え・ひとこと・推測・「違う」は入れない）。
  const familyItems = (p, member) => interpret(p, member).filter((x) => x.status === "confirmed" && isLean(x.id)).map((x) => x.id).slice(0, 30);
  // 家族の端末から届いた方針（同期の sharedPolicies）。{ 名前: { on, items:[解釈ID], updatedAt, by } }。一覧にないIDは捨てる。
  // by は書いた端末の番号（ランダム。同期の組み合わせ mergeShared で、自分の端末が書いた分かを見分ける）。
  function normalizeShared(raw) {
    const out = {};
    for (const [m, v] of Object.entries(raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {})) {
      if (!v || typeof v !== "object" || !str(m, 20) || Object.keys(out).length >= 12) continue;
      const on = v.on === true;
      const by = typeof v.by === "string" && /^[\w-]{1,60}$/.test(v.by) ? v.by : "";
      out[str(m, 20)] = { on, items: on && Array.isArray(v.items) ? [...new Set(v.items.filter(isLean))].slice(0, 30) : [], updatedAt: iso(v.updatedAt), ...(by ? { by } : {}) };
    }
    return out;
  }
  // 同期の組み合わせ（local＝この端末、remote＝サーバー）。人ごとに新しいほう。
  // ただし、この端末が書いていない分がサーバーにない時は、送り返さない。古い版のアプリは書き戻す時に sharedPolicies をまるごと落とすので、
  // ほかの端末に残っていた古い「見せる」を送り返すと、本人が止めた記録（on:false）を上書きしてしまう。本人の端末は自分の分を持ち続け、次の同期で戻す。
  function mergeShared(local, remote, device = "") {
    const l = normalizeShared(local), r = normalizeShared(remote), out = {};
    for (const m of new Set([...Object.keys(l), ...Object.keys(r)])) {
      const a = l[m], b = r[m];
      if (a && !b && !(device && a.by === device)) continue;
      out[m] = !a ? b : !b ? a : b.updatedAt > a.updatedAt || (b.updatedAt === a.updatedAt && JSON.stringify(b) > JSON.stringify(a)) ? b : a;
    }
    return out;
  }
  // 家族が見せている方針（自分の分・止めた人は除く）。{ 名前: [解釈ID] }
  function othersFrom(shared, member, family = null) {
    return Object.fromEntries(Object.entries(normalizeShared(shared)).filter(([m, v]) => m !== member && v.on && v.items.length && (!family || family.includes(m))).map(([m, v]) => [m, v.items]));
  }
  // ---- AIの境界（この版では画面から呼ばない。サーバーのAIをつなぐ時にそのまま使う） ----
  // AIに渡すのは、答えの値と、本人が書いたひとことだけ（名前・食べられないもの・評価は渡さない）。
  function aiPayload(p, member) {
    return { v: VERSION, answers: p.answers.filter((a) => a.member === member && a.value !== LATER).map((a) => ({ q: a.q, value: a.value, ...(a.text ? { text: a.text.slice(0, MAX_TEXT) } : {}) })), allowed: Object.keys(LEANS) };
  }
  // AIの出力を検査する。許可した解釈のIDだけを「推測」として受け取る。文言はこちらの一覧のものを使う。
  // 食べられないもの・苦手の追加や解除、状態の書きかえ（確認済みにする等）は受け付けない。
  function fromAi(raw) {
    let data = raw;
    if (typeof raw === "string") { try { data = JSON.parse(raw); } catch { return { ok: false, error: "json", items: [] }; } }
    if (!data || typeof data !== "object" || !Array.isArray(data.items)) return { ok: false, error: "shape", items: [] };
    const items = [];
    for (const x of data.items.slice(0, 12)) {
      const id = typeof x === "string" ? x : x?.id;
      if (!isLean(id) || items.includes(id)) continue;
      items.push(id);
    }
    return { ok: true, items: items.slice(0, 8), dropped: data.items.length - Math.min(8, items.length) };
  }
  // AIで解釈を試し、時間切れ・通信失敗・不正な出力なら、入力を失わずにルールの解釈へ戻る。
  async function interpretWithAi(p, member, ai, { timeoutMs = 8000, foodProfile = null } = {}) {
    const rules = interpret(p, member, foodProfile);
    if (typeof ai !== "function") return { items: rules, fallback: true, error: "off" };
    // AIへ送るのは、本人が「AIに送る」を選んだ時だけ（家族共有とは別。この版は選べないので送らない）。
    if (!shareOf(p, member).ai) return { items: rules, fallback: true, error: "not_allowed" };
    let timer;
    try {
      const raw = await Promise.race([ai(aiPayload(p, member)), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), timeoutMs); })]);
      const checked = fromAi(raw);
      if (!checked.ok) return { items: rules, fallback: true, error: checked.error };
      const extra = checked.items.filter((id) => !rules.some((x) => x.id === id)).map((id) => {
        const d = p.decisions[`${member}\u0000${id}`];
        return { id, kind: LEANS[id].kind, label: LEANS[id].label, short: LEANS[id].short || "", ask: LEANS[id].ask || "", from: [], status: d?.status || "guess", source: "ai" };
      });
      return { items: [...rules, ...extra], fallback: false };
    } catch (error) {
      return { items: rules, fallback: true, error: error?.message === "timeout" ? "timeout" : "network" };
    } finally { clearTimeout(timer); }
  }
  const api = { VERSION, IDK, LATER, QUESTIONS, QUESTION, LEANS, WHY, isLean, isQuestion, draftOf, setDraft, empty, normalize, answersOf, asked, nextQuestion, answer, interpret, decide, snapshot, react, history, REACTIONS, leaner, leanFor, shareOf, setShare, familyItems, normalizeShared, mergeShared, othersFrom, aiPayload, fromAi, interpretWithAi };
  root.ProfileTalk = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);
