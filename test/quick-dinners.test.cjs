const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../lifestyle.js");
const Starter = require("../starter-recipes.js");

// 10分以内の夜ごはん（2026-10-29 のユーザーの依頼）：1人・平日10分以内でも、2週間は同じ料理をくり返さずに回せる品数と、
// 主役（肉・魚・卵豆腐・野菜）のかたよりの少なさを保つ。条件はゆるめず、実際にある料理だけで数える。
const WEEKDAY = "2026-10-07";
const quick = () => L.curated.filter((r) => L.fit(r, L.profile({ completed: true, servings: 1, weekdayMinutes: 10 }), WEEKDAY).ok);

test("quick dinners: 1 person, weekday 10 minutes still has two weeks of different dishes", () => {
  assert.ok(quick().length >= 14, `${quick().length} dishes`);
});

test("quick dinners: not mostly canned fish — meat, egg/tofu and vegetable dishes are there too", () => {
  const by = {};
  for (const r of quick()) by[L.traits(r).protein] = (by[L.traits(r).protein] || 0) + 1;
  assert.ok(by.meat >= 3 && by.eggtofu >= 3 && by.veg >= 2, JSON.stringify(by));
  assert.ok(by.fish <= quick().length / 3, JSON.stringify(by));
  const staples = new Set(quick().map((r) => L.traits(r).staple));
  assert.ok(staples.has("rice") && staples.has("noodle") && staples.has("bread"), [...staples].join(","));
});

test("quick dinners: no toaster or oven needed, so they also fit people who did not answer about tools", () => {
  for (const r of quick()) assert.ok(!r.planning.equipment.some((x) => ["トースター", "オーブン"].includes(x)), r.title);
});

test("starter dishes with raw meat say how long to heat it (center 75℃ for 1 minute)", () => {
  for (const r of Starter.recipes) {
    const raw = r.ingredients.filter((i) => i[2] === "肉" && !/ハム/.test(i[0]));
    if (raw.length) assert.ok(r.steps.some((s) => /75℃/.test(s)), r.title);
  }
});

test("every quick starter dish has its illustration, listed the same in app.js and sw.js (offline)", () => {
  const fs = require("node:fs"), path = require("node:path");
  const root = path.join(__dirname, "..");
  const list = (src, re) => JSON.parse(`[${src.match(re)[1]}]`);
  const app = list(fs.readFileSync(path.join(root, "app.js"), "utf8"), /const STARTER_SHEET_PHOTOS = \[([^\]]*)\]/);
  const sw = list(fs.readFileSync(path.join(root, "sw.js"), "utf8"), /\.\.\.\[([^\]]*)\]\.map\(n => `\.\/assets\/dishes\/starter-/);
  assert.deepEqual(app, sw);
  // 一覧にある絵は、ファイルがそろっている（オフラインでも出る）
  for (const n of app) assert.ok(fs.existsSync(path.join(root, "assets/dishes", `starter-${n}.webp`)), `starter-${n}.webp`);
  // 以前の10分以内の料理（引退した starter-39〜48 など）は、記録から開いた時のために絵を残す
  for (const r of Starter.recipes.filter((x) => x.minutes <= 10 && Number(x.id.replace("starter-", "")) <= 48)) {
    assert.ok(app.includes(r.id.replace("starter-", "")), `${r.title}: no illustration`);
  }
  // 2026-11-14 に作り直した48品（starter-51〜98）の絵は、画像を作ってから足す（docs/STARTER_RECIPES.md）。
  // それまでは主食ごとのイメージ写真（「イメージ」と表示）で出る。
});

// 2026-11-15 のユーザーの判断：図鑑は最初から入っている48品（No.001〜048・6章）。表はひとこと、裏は読みごたえのある5つの見出し。
test("the 48 dishes are the card book: numbers 1-48, six chapters, a short front line and five back sections each", () => {
  const cards = Starter.cards;
  const now = L.starters;
  assert.equal(now.length, 48);
  assert.deepEqual(now.map((r) => r.card?.no).sort((a, b) => a - b), Array.from({ length: 48 }, (_, i) => i + 1), "No.001-048, each once");
  const chapters = { meat: 0, fish: 0, eggtofu: 0, veg: 0, bowl: 0, noodle: 0 };
  for (const r of now) {
    const c = r.card;
    assert.ok(c, `${r.title}: no card`);
    assert.ok(c.chapter in chapters, `${r.title}: chapter ${c.chapter}`);
    chapters[c.chapter] += 1;
    assert.ok([...c.catch].length <= 22, `${r.title}: the front line is short (${c.catch})`);
    for (const k of ["make", "eat", "nutrition", "easy", "trivia"]) assert.ok(c[k] && c[k].length >= 15, `${r.title}: ${k}`);
    // 体への効果をうたわない（栄養は目安の言い方）
    assert.doesNotMatch(Object.values(c).join(""), /効く|治る|予防|改善|ダイエット/, r.title);
  }
  assert.deepEqual(chapters, { meat: 11, fish: 9, eggtofu: 5, veg: 3, bowl: 12, noodle: 8 });
  // 番号は章の順（肉 → 魚 → 卵と豆腐 → 野菜 → 丼 → 麺とパン）
  const order = ["meat", "fish", "eggtofu", "veg", "bowl", "noodle"];
  const byNo = [...now].sort((a, b) => a.card.no - b.card.no).map((r) => order.indexOf(r.card.chapter));
  assert.deepEqual(byNo, [...byNo].sort((a, b) => a - b));
  // 引退した以前の48品にはカードがない（図鑑は新しい48品だけ）
  assert.ok(L.curated.filter((r) => r.retired).every((r) => !r.card));
  assert.equal(Object.keys(cards).length, 48);
});
