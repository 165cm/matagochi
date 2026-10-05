const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// 2026-10-05：管理の画面の表は、見出しを押して並べ替えられる。並べ方の値の読み方を確かめる。
const html = fs.readFileSync(path.join(__dirname, "..", "admin", "catalog.html"), "utf8");
const src = html.slice(html.indexOf("  function sortValue("), html.indexOf("  function table("));
const { sortValue, compareValues } = new Function(`${src}; return { sortValue, compareValues };`)();

test("numbers written with units sort as numbers; dashes and blanks go last", () => {
  assert.equal(sortValue("12分", true), 12);
  assert.equal(sortValue("1.38円", true), 1.38);
  assert.equal(sortValue("58%", true), 58);
  assert.equal(sortValue("7品（3.4%）", true), 7);
  assert.equal(sortValue("3 / 4", true), 3);
  assert.equal(sortValue("1.2万", true), 12000);
  assert.equal(sortValue("530万", true), 5300000);
  assert.equal(sortValue({ text: "第2（続き）", value: 2 }, false), 2);
  assert.equal(sortValue("—", true), null);
  assert.equal(sortValue("", false), null);
  assert.equal(sortValue("非公開", true), null, "a word in a number column goes last");
  assert.equal(sortValue("八宝菜", false), "八宝菜");
});

test("text sorts in Japanese order with numbers inside compared as numbers", () => {
  const list = ["第10", "第2", "第1"].sort(compareValues);
  assert.deepEqual(list, ["第1", "第2", "第10"]);
  assert.ok(compareValues(2, 10) < 0);
});

test("every list table in the admin page can be sorted (has an id)", () => {
  const calls = html.match(/\btable\(\[[^\]]*\]/g) || [];
  // 1行だけの小さな表（外した料理名）以外は、並べ替えの id を持つ
  const lines = html.split("\n");
  const without = lines.map((l, i) => [l, lines.slice(i, i + 3).join(" ")]).filter(([l, near]) => /\btable\(\[/.test(l) && !/function table/.test(l) && !/\bid: "/.test(near) && !/table\(\["料理名"\]/.test(l)).map(([l]) => l);
  assert.ok(calls.length >= 15);
  assert.deepEqual(without, []);
});

test("review fix (#145): a value shown as — (not measured yet) sorts last even when its inner value is 0", () => {
  assert.equal(sortValue({ text: "—", value: 0 }, true), null);
  assert.equal(sortValue({ text: "0.0", value: 0 }, true), 0, "a real zero is still a number");
  const s = html.slice(html.indexOf("function renderSources"), html.indexOf("function renderStages"));
  assert.doesNotMatch(s, /value: a\.s \? a\.add \/ a\.s : 0/);
});
