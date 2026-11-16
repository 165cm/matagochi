const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const L = require("../lifestyle.js");
const A = require("../aisles.js");

function setupApp() {
  const t = new Date("2026-10-01T12:00:00+09:00").getTime();
  const D = class extends Date {
    constructor(...args) {
      if (args.length === 0) super(t);
      else super(...args);
    }
    static now() {
      return t;
    }
  };
  const ctx = vm.createContext({
    console,
    URL,
    Date: D,
    document: { querySelector: () => null, querySelectorAll: () => [] },
    window: {
      prompt: (msg, def) => def || "代用品",
    },
  });
  for (const f of [
    "dinner-persona.js",
    "taste.js",
    "taste-ui.js",
    "starter-recipes.js",
    "skills.js",
    "aisles.js",
    "lifestyle.js",
    "profile-talk.js",
    "talk-ui.js",
    "daily-ui.js",
    "playlist-import.js",
    "household.js",
    "skill-quiz.js",
    "cook-level.js",
    "weekly.js",
    "cook-type.js",
    "plan-moves.js",
    "plus.js",
    "cook-mode.js",
    "folders.js",
    "install.js",
    "push.js",
    "tickets.js",
    "account.js",
    "discover.js",
    "app.js",
  ]) {
    let s = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    if (f === "app.js") s = s.slice(0, s.lastIndexOf('document.querySelectorAll(".tab")'));
    vm.runInContext(s, ctx);
  }
  const run = (s) => vm.runInContext(s, ctx);
  run("state=freshState();state.onboarded=true;state.planLength=7;saveState=()=>{};render=()=>{};showToast=()=>{}");
  return run;
}

// 買い物の名前をまとめる・いつも代用（APP_MAP §79。2026-11-16 のユーザーの依頼）
const same = (canon, names) => names.forEach((n) => assert.equal(L.shoppingName(n), canon, n));
const slot = (date, id, ingredients) => ({ date, status: "confirmed", servings: 1, recipe: { id, title: id, sourceServings: 1, mealType: "dinner", ingredients, steps: ["作る"] } });

test("shopping names: spellings of the same thing in the shop become one name", () => {
  same("卵", ["卵", "たまご", "玉子", "ゆでたまご", "ゆで卵", "茹で卵", "半熟たまご", "温泉卵", "溶き卵", "卵黄", "卵白", "卵（M）", "卵(全卵)"]);
  same("長ねぎ", ["長ネギ", "長ねぎ", "ネギ", "ねぎ", "白ねぎ", "白葱", "白髪ねぎ", "長ねぎ（白い部分）", "ネギ(みじん切り)", "長ねぎみじん", "ねぎ(青い部分)"]);
  same("小ねぎ", ["小ねぎ", "小ネギ", "青ねぎ", "青葱", "万能ねぎ", "細ねぎ", "刻みネギ", "万能ねぎの小口切り", "わけぎ"]);
  same("玉ねぎ", ["玉ねぎ", "たまねぎ", "タマネギ", "玉葱", "玉ねぎ（みじん切り）", "玉ねぎスライス", "おろし玉ねぎ"]);
  same("しょうゆ", ["醤油", "しょうゆ", "しょう油", "濃口醤油", "醬油", "しょうゆ（濃口）"]);
  same("酒", ["酒", "料理酒", "日本酒", "お酒"]);
  same("砂糖", ["砂糖", "さとう", "きび砂糖", "三温糖"]);
  same("黒こしょう", ["黒胡椒", "ブラックペッパー", "粗びき黒こしょう", "黒こしょう（粗びき）"]);
  same("鶏ガラスープの素", ["鶏がらスープの素", "鶏ガラスープの素", "鶏ガラ顆粒", "顆粒鶏がらスープの素"]);
  same("にんじん", ["人参", "ニンジン", "にんじん", "人参千切り"]);
  same("豚バラ肉", ["豚バラ", "豚バラ薄切り肉", "豚ばら肉", "豚バラ スライス"]);
  same("合いびき肉", ["合挽き肉", "合い挽き肉", "あいびき肉"]);
  same("ごはん", ["ご飯", "ごはん（炊飯済み）", "温かいご飯"]);
  same("いんげん", ["インゲン", "いんげん"]);
});

test("shopping names: different things to buy stay apart", () => {
  // 生とチューブ・新玉ねぎ・紅しょうが・かたまり肉・濃縮の倍率は別の物
  assert.equal(L.shoppingName("にんにく（みじん切り）"), "にんにく");
  same("おろしにんにく", ["にんにくチューブ", "おろしニンニク", "にんにく(すりおろし)", "チューブにんにく"]);
  same("おろししょうが", ["生姜チューブ", "おろし生姜", "しょうがのすりおろし"]);
  for (const n of ["新玉ねぎ", "紫玉ねぎ", "紅しょうが", "薄口しょうゆ", "無塩バター", "スライスチーズ", "刻みのり", "ねぎ油", "切り干し大根", "大根おろしソース", "豚しょうが焼き用肉"]) {
    assert.equal(L.shoppingName(n), n, n);
  }
  assert.equal(L.shoppingName("豚バラ肉（ブロック）"), "豚バラ肉(ブロック)");
  assert.equal(L.shoppingName("めんつゆ（3倍濃縮）"), "めんつゆ(3倍濃縮)");
  assert.equal(L.shoppingName("麺つゆ"), "めんつゆ");
  assert.equal(L.shoppingName("まぐろ（刺身用）"), "まぐろ(刺身用)");
  // かっこが種類の時は、その種類の名前に（辞書になければ、かっこごと残す）。Codex review #260
  assert.equal(L.shoppingName("しょうゆ（薄口）"), "薄口しょうゆ");
  assert.equal(L.shoppingName("バター（食塩不使用）"), "無塩バター");
  assert.equal(L.shoppingName("みそ（赤）"), "みそ(赤)");
  assert.equal(L.shopping({ slots: { a: slot("2026-10-01", "a", [{ name: "しょうゆ（薄口）", amount: "大さじ1" }]) }, start: "2026-10-01", end: "2026-10-01", scale: (x) => x, pantry: { しょうゆ: "have" } })[0].status, "buy", "ふつうのしょうゆが家にあっても、薄口は買う");
  same("卵", ["卵（M）", "卵(全卵)"]);
  same("じゃがいも", ["じゃがいも(メークイン)", "じゃがいも（下茹でしたもの）"]);
  // ねぎの種類は名前で決める。切り方では変えない。Codex review #260
  same("長ねぎ", ["長ねぎ（小口切り）", "長ネギ(刻み)", "白ねぎの小口切り", "刻み長ねぎ"]);
  same("小ねぎ", ["ねぎ（小口切り）", "刻みねぎ", "カットネギ", "青ねぎ(みじん切り)"]);
  // どちらを買うか本人が決める書き方は、まとめない
  for (const n of ["牛乳または豆乳", "卵黄 or 全卵", "パクチーまたは万能ねぎ", "好みのねぎ(わけぎ、長ねぎなど)"]) assert.equal(L.shoppingName(n), n, n);
  // 辞書にない名前も、切り方だけなら外す
  assert.equal(L.shoppingName("キャベツの千切り"), "キャベツ");
  assert.equal(L.shoppingName("大根おろし"), "大根");
  assert.equal(L.shoppingName("厚揚げ（絹）"), "厚揚げ(絹)");
  assert.equal(L.isBought("水（卵用）"), false);
});

test("shopping list: merged names become one row with the amounts added, and the pantry name matches", () => {
  const items = L.shopping({
    slots: {
      a: slot("2026-10-01", "a", [{ name: "卵", amount: "2個" }, { name: "長ネギ", amount: "1本" }, { name: "料理酒", amount: "大さじ1" }]),
      b: slot("2026-10-02", "b", [{ name: "ゆでたまご", amount: "1個" }, { name: "卵黄", amount: "1個分" }, { name: "ネギ", amount: "1/2本" }, { name: "酒", amount: "大さじ2" }]),
    },
    start: "2026-10-01", end: "2026-10-02", scale: (a) => a, pantry: { 料理酒: "have" },
  });
  assert.deepEqual(items.map((i) => i.name).sort(), ["卵", "酒", "長ねぎ"].sort());
  assert.match(items.find((i) => i.name === "卵").amount, /4個/);
  assert.equal(items.find((i) => i.name === "長ねぎ").amount, "1.5本");
  assert.equal(items.find((i) => i.name === "酒").status, "have", "常備品の「料理酒」が、買い物の「酒」にも効く");
});

test("always substitute: the item is handled automatically from the next trip, until the person buys it this time", () => {
  const base = { start: "2026-10-01", end: "2026-10-09", scale: (a) => a, pantry: {} };
  const slots = { a: slot("2026-10-01", "a", [{ name: "みりん", amount: "大さじ2" }, { name: "卵", amount: "1個" }]) };
  const prefs = { みりん: { action: "sub", subText: "酒＋砂糖（3:1）", always: true, updatedAt: "2026-10-01T00:00:00Z" } };
  const mirin = (opt) => L.shopping({ ...base, slots, ...opt }).find((i) => i.name === "みりん");
  assert.equal(mirin({}).status, "buy", "no memory → buy");
  assert.equal(mirin({ prefs: { みりん: { action: "sub", subText: "x", updatedAt: "" } } }).status, "buy", "remembered once is only a suggestion");
  const auto = mirin({ prefs });
  assert.deepEqual([auto.status, auto.subText, auto.auto, auto.recheck], ["sub", "酒＋砂糖（3:1）", true, false]);
  // この回で「買う」に戻した時は買う。次の献立（材料の印が変わる）では、また自動で代用
  const buyNow = { みりん: { status: "buy", signature: auto.signature, updatedAt: "2026-10-01T01:00:00Z" } };
  assert.equal(mirin({ prefs, marks: buyNow }).status, "buy");
  const next = L.shopping({ ...base, slots: { b: slot("2026-10-05", "b", [{ name: "本みりん", amount: "大さじ1" }]) }, prefs, marks: buyNow }).find((i) => i.name === "みりん");
  assert.equal(next.status, "sub");
  assert.equal(mirin({ prefs: { みりん: { action: "skip", always: true } } }).status, "skip", "いつもパス");
});

test("app: 代用 → 「いつも代用にする」 → the next plan's みりん is already 代用; it shows in the cooking screen; turning it off keeps this trip", () => {
  const run = setupApp();
  const J = (s) => JSON.parse(run(`JSON.stringify(${s})`));
  run(`state.rhythm = normalizeRhythm({ preset: "3day" }); startRhythm(new Date("2026-10-01T12:00:00+09:00"), { tonight: true });`);
  const d = J("shopBlocks().current.dates");
  const put = (date, id, ings) => run(`state.mealSlots[${JSON.stringify(date)}] = { date: ${JSON.stringify(date)}, status: "confirmed", servings: 1, updatedAt: nowIso(), recipe: { id: ${JSON.stringify(id)}, title: ${JSON.stringify(id)}, mealType: "dinner", sourceServings: 1, ingredients: ${JSON.stringify(ings)}, steps: ["作る"] } };`);
  put(d[0], "r1", [{ name: "みりん", amount: "大さじ2" }, { name: "長ネギ", amount: "1本" }, { name: "ネギ", amount: "1本" }]);
  const item = (n) => J(`shopPageItems().find((i) => i.name === ${JSON.stringify(n)}) || null`);
  assert.equal(item("長ねぎ").amount, "2本", "長ネギ＋ネギ は1行");
  assert.equal(item("みりん").status, "buy");
  run(`handleDailyAction("life-item-sub", { id: "みりん" })`);
  assert.equal(item("みりん").status, "sub");
  let html = run("renderDailyShopping()");
  assert.ok(html.includes('data-action="life-item-always" data-id="みりん"'), "the row and the undo bar offer いつも");
  assert.ok(html.includes("いつもこうする"));
  run(`handleDailyAction("life-item-always", { id: "みりん" })`);
  assert.deepEqual([J("state.itemPrefs['みりん']").action, J("state.itemPrefs['みりん']").always], ["sub", true]);
  assert.ok(run("renderDailyShopping()").includes('aria-pressed="true"'));
  assert.equal(J("normalizeItemPrefs(state.itemPrefs)['みりん']").always, true, "survives saving and sync");
  // 次の料理：何も押さなくても代用。作る画面にも出る
  put(d[1], "r2", [{ name: "本みりん", amount: "大さじ1" }]);
  run("state.shoppingMarks = {}");
  const auto = item("みりん");
  assert.deepEqual([auto.status, auto.auto, auto.subText], ["sub", true, "酒＋砂糖（3:1）"]);
  assert.equal(J(`CookMode.markFor("本みりん", { date: ${JSON.stringify(d[1])}, recipeId: "r2" })`).status, "sub");
  // 今回だけ買う → 作る画面の印も消える
  run(`handleDailyAction("life-shopping-status", { id: "みりん", status: "buy" })`);
  assert.equal(item("みりん").status, "buy");
  assert.equal(J(`CookMode.markFor("みりん", { date: ${JSON.stringify(d[1])}, recipeId: "r2" })`), null);
  // やめる：自動だった分は、今回の印として残る。取り消すと「いつも」に戻る
  run("state.shoppingMarks = {}");
  run(`handleDailyAction("life-item-always", { id: "みりん" })`);
  assert.equal(J("state.itemPrefs['みりん']").always, undefined);
  assert.deepEqual([item("みりん").status, item("みりん").auto], ["sub", false]);
  run(`handleDailyAction("life-shop-undo", {})`);
  assert.equal(J("state.itemPrefs['みりん']").always, true);
  assert.equal(item("みりん").auto, true);
});

test("app: marks and memories saved under an old spelling move to the merged name", () => {
  const run = setupApp();
  const J = (s) => JSON.parse(run(`JSON.stringify(${s})`));
  const marks = J(`normalizeShoppingMarks({ "長ネギ": { status: "purchased", signature: "d:r:1本", updatedAt: "2026-10-01T00:00:00.000Z" }, "ネギ": { status: "purchased", signature: "d:r2:1本", updatedAt: "2026-10-02T00:00:00.000Z" }, "manual-AbC": { status: "buy", signature: "x", updatedAt: "2026-10-01T00:00:00.000Z" } })`);
  assert.deepEqual(Object.keys(marks).sort(), ["manual-AbC", "長ねぎ"].sort());
  assert.deepEqual(marks["長ねぎ"].signature.split("|").sort(), ["d:r2:1本", "d:r:1本"].sort());
  const prefs = J(`normalizeItemPrefs({ "料理酒": { action: "skip", updatedAt: "2026-10-01T00:00:00.000Z" }, "酒": { action: "sub", subText: "水", always: true, updatedAt: "2026-10-03T00:00:00.000Z" } })`);
  assert.deepEqual(prefs, { 酒: { action: "sub", subText: "水", always: true, updatedAt: "2026-10-03T00:00:00.000Z" } });
});
