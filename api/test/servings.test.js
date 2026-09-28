import test from "node:test";
import assert from "node:assert/strict";
import { detectServings } from "../src/servings.js";

test("servings: common ways descriptions write the number of people", () => {
  const cases = [
    ["【材料】2人分\n豚バラ 200g", 2],
    ["材料（2人前）", 2],
    ["■材料(２人分)", 2],
    ["材料 二人分", 2],
    ["ふたり分の材料です", 2],
    ["材料（3〜4人分）", 3],
    ["材料（2人）\n鶏もも 1枚", 2],
    ["〈4名分〉", 4],
    ["Serves 2", 2],
    ["1人前 / 調理時間10分", 1],
  ];
  for (const [text, n] of cases) assert.equal(detectServings(text), n, text);
});

test("servings: nutrition lines are not the number of people, and the one near 材料 wins", () => {
  assert.equal(detectServings("カロリー（1人分）450kcal"), null);
  assert.equal(detectServings("1人分あたり 320kcal"), null);
  assert.equal(detectServings("1人分 320kcal\n\n材料（2人分）"), 2);
  assert.equal(detectServings("家族4人で食べました！\n材料（2人分）\n豚肉"), 2);
  assert.equal(detectServings("チャンネル登録よろしく"), null);
  assert.equal(detectServings("ハンバーグ4個分"), null);
});
