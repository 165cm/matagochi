const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const TR = require("../table-review.js");

const recipes = {
  a: { id: "a", title: "肉じゃが", dish: "肉じゃが", minutes: 30, ingredients: [["牛肉", "100g", "肉"], ["じゃがいも", "2個", "野菜"], ["玉ねぎ", "1個", "野菜"]] },
  b: { id: "b", title: "納豆パスタ", dish: "納豆パスタ", minutes: 10, ingredients: [{ name: "スパゲッティ", category: "主食" }, { name: "小ねぎ", category: "野菜" }] },
  c: { id: "c", title: "親子丼", dish: "親子丼", minutes: 15, ingredients: [] },
  a2: { id: "a2", title: "圧力鍋の肉じゃが", dish: "肉じゃが", minutes: 20, ingredients: [] },
};
const recipeOf = (e) => recipes[e.recipeId];
const ev = (id, recipeId, cookedAt, extra = {}) => ({ id, recipeId, cookedAt: `${cookedAt}T19:00:00.000Z`, ...extra });

test("periods: this year, this calendar month, and the receipt week (Fri-Sun = this week, Mon-Thu = last week)", () => {
  const [year, month, week] = TR.periods("2026-11-24"); // 火曜
  assert.deepEqual([year.start, year.end, year.title], ["2026-01-01", "2026-11-24", "2026年のわたしの食卓"]);
  assert.deepEqual([month.start, month.chip, month.title], ["2026-11-01", "11月", "11月のわたしの食卓"]);
  assert.deepEqual([week.start, week.end, week.chip], ["2026-11-16", "2026-11-22", "先週"]);
  const fri = TR.periods("2026-11-27")[2];
  assert.deepEqual([fri.start, fri.end, fri.chip], ["2026-11-23", "2026-11-27", "今週"]);
  const sun = TR.periods("2026-11-29")[2];
  assert.deepEqual([sun.start, sun.chip], ["2026-11-23", "今週"], "Sunday belongs to the week that started on Monday");
});

test("records: in the period only, no demo, no duplicates, no broken dates", () => {
  const period = { start: "2026-11-01", end: "2026-11-24" };
  const list = TR.records([ev("1", "a", "2026-11-02"), ev("1", "a", "2026-11-02"), ev("demo-1", "b", "2026-11-03"), ev("2", "b", "2026-10-31"), { id: "3", recipeId: "c", cookedAt: "" }, ev("4", "c", "2026-11-24")], period);
  assert.deepEqual(list.map((e) => e.id), ["1", "4"]);
});

test("summarize: counts plates and kinds; first-time is by dish (a new way of the same dish is not new); welcome back after 28+ days", () => {
  const evaluations = [
    ev("0", "a", "2026-09-20"), // 前にも作った肉じゃが
    ev("1", "a2", "2026-11-02"), // 同じ料理（肉じゃが）の別の作り方
    ev("2", "b", "2026-11-03", { photo: "data:image/jpeg;base64,xx" }),
    ev("3", "b", "2026-11-10"),
    ev("4", "c", "2026-11-11"),
    ev("5", "a", "2026-11-20"),
  ];
  const s = TR.summarize({ evaluations, period: { start: "2026-11-01", end: "2026-11-24" }, recipeOf, lovers: (r) => (r.id === "b" ? 2 : 0), members: 2 });
  assert.equal(s.count, 5); assert.equal(s.days, 5); assert.equal(s.kinds, 4);
  assert.equal(s.firstTimes, 2, "納豆パスタ・親子丼 (肉じゃが was made before)");
  assert.equal(s.welcome.days, 43, "9/20 → 11/2 (the same dish made another way counts)");
  assert.equal(s.quick, 3, "15 minutes or less: 納豆パスタ ×2, 親子丼");
  assert.equal(s.together, 1); assert.equal(s.loved, 1);
  assert.equal(s.veg, 3, "じゃがいも・玉ねぎ・小ねぎ");
  const pasta = s.items.find((it) => it.key === "b");
  assert.deepEqual([pasta.times, pasta.photo], [2, "2"]);
  assert.equal(TR.recommend("week", s.items).key, "b", "the dish both want again");
  assert.equal(TR.numbers(s), "5皿・4種類");
});

test("phrase: one line, no percentages or streaks; works with one record; empty when nothing", () => {
  const period = { start: "2026-11-01", end: "2026-11-24" };
  const one = TR.summarize({ evaluations: [ev("1", "c", "2026-11-05")], period, recipeOf });
  assert.equal(TR.phrase("year", one), "この一皿から、わたしの食卓");
  assert.equal(TR.numbers(one), "1皿・1種類");
  const quick = TR.summarize({ evaluations: [ev("1", "b", "2026-11-05"), ev("2", "c", "2026-11-06"), ev("3", "b", "2026-11-07")], period, recipeOf });
  assert.equal(TR.phrase("week", quick), "15分ごはんに助けられた夜が3回");
  const none = TR.summarize({ evaluations: [], period, recipeOf });
  assert.equal(none.empty, true); assert.equal(TR.phrase("week", none), ""); assert.equal(TR.recommend("week", none.items), null);
  for (const s of [one, quick]) for (const k of ["week", "month", "year"]) assert.doesNotMatch(TR.phrase(k, s, { solo: false }), /[%％]|連続|減/);
});

test("shared pencil illustrations exist for the 48 starter dishes", () => {
  assert.equal(TR.sharedIllust({ id: "starter-51" }), "assets/illust/starter-51.webp");
  assert.equal(TR.sharedIllust({ id: "r-9", starterId: "starter-98" }), "assets/illust/starter-98.webp");
  assert.equal(TR.sharedIllust({ id: "starter-03" }), "", "old starters have no pencil illustration");
  for (let n = 51; n <= 98; n++) assert.ok(fs.existsSync(path.join(__dirname, "..", "assets", "illust", `starter-${n}.webp`)), `starter-${n}.webp`);
});

test("the review is wired in: loaded after weekly.js, cached by the service worker, opened from 「わたしの食卓」", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.ok(html.indexOf("table-review.js") > html.indexOf("weekly.js"));
  assert.match(fs.readFileSync(path.join(__dirname, "..", "sw.js"), "utf8"), /table-review\.js/);
  const ui = fs.readFileSync(path.join(__dirname, "..", "daily-ui.js"), "utf8");
  assert.match(ui, /data-action="review-open">📮 レビュー/);
  const src = fs.readFileSync(path.join(__dirname, "..", "table-review.js"), "utf8");
  assert.doesNotMatch(src, /ytimg|youtube\.com/, "no outside images on the canvas");
});

test("an image made for the old choices cannot be shared or saved after choosing again (Codex review #275)", () => {
  const out = { key: "A", url: "blob:x", file: {} };
  assert.equal(TR.outReady(out, "A"), true);
  assert.equal(TR.outReady(out, "B"), false, "the name was hidden (or the period / cover / art changed): wait for the new image");
  assert.equal(TR.outReady(out, "A", "drawing"), false, "not while drawing");
  assert.equal(TR.outReady({ key: "A", url: "", file: null }, "A"), false);
  const src = fs.readFileSync(path.join(__dirname, "..", "table-review.js"), "utf8");
  assert.match(src, /function shareReview\(\) \{\n  if \(!reviewReady\(\)\) return;/);
  assert.match(src, /function saveReview\(\) \{\n  if \(!reviewReady\(\)\) return;/);
});

test("a drawn illustration is kept in memory even when the phone's storage is full (Codex review #275)", () => {
  const vm = require("node:vm");
  const store = {};
  const localStorage = { getItem: (k) => store[k] ?? null, setItem: () => { throw new Error("QuotaExceededError"); } };
  const ctx = vm.createContext({ localStorage, console, Date, JSON, Object, globalThis: {} });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "table-review.js"), "utf8") + "\n;globalThis.out = { saveIllust, illustCache };", ctx);
  assert.equal(ctx.globalThis.out.saveIllust("e1", "data:image/webp;base64,AAA"), false, "could not be saved");
  assert.equal(ctx.globalThis.out.illustCache().e1.url, "data:image/webp;base64,AAA", "but still usable right now");
});
