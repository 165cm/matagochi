import test from "node:test";
import assert from "node:assert/strict";
import { importYouTubeRecipe } from "../src/importRecipe.js";
import { fetchYouTubeSnippet, parseIsoDuration } from "../src/youtube.js";

const sampleSnippet = {
  title: "ツナときゅうりの冷やしうどん",
  description: "材料: うどん3玉、ツナ缶2缶、きゅうり2本、めんつゆ適量。冷やしてのせるだけ。",
  channelTitle: "ごはんチャンネル"
};

test("builds an import result from mocked YouTube and Gemini responses", async () => {
  const result = await importYouTubeRecipe("https://www.youtube.com/shorts/abcdefghijk", {
    fetchYouTubeSnippet: async () => sampleSnippet,
    analyzeRecipeDescription: async () => ({
      title: "ツナきゅうり冷やしうどん",
      ingredients: [
        { name: "うどん", amount: "3玉", category: "主食" },
        { name: "ツナ缶", amount: "2缶", category: "缶詰" }
      ],
      steps: ["うどんを冷やす", "ツナときゅうりをのせる"],
      tags: ["昼ごはん", "冷たい"],
      note: "暑い日の昼に良さそう。"
    })
  });

  assert.equal(result.title, "ツナきゅうり冷やしうどん");
  assert.equal(result.source, "YouTube Shorts");
  assert.equal(result.videoId, "abcdefghijk");
  assert.equal(result.videoUrl, "https://www.youtube.com/shorts/abcdefghijk");
  assert.equal(result.ingredients.length, 2);
  assert.match(result.caption, /説明文:/);
});

test("an empty description is an error only when the video cannot be read either", async () => {
  const snippet = { title: "no description", description: "", channelTitle: "c", durationSeconds: 900 };
  await assert.rejects(importYouTubeRecipe("https://youtu.be/abcdefghijk", { fetchYouTubeSnippet: async () => snippet, analyzeRecipeDescription: async () => ({}), analyzeRecipeVideo: async () => ({ steps: ["焼く"], stepsComplete: false }) }), { code: "empty_description" });
  const shortDeps = { fetchYouTubeSnippet: async () => ({ ...snippet, durationSeconds: 45 }), analyzeRecipeDescription: async () => { throw new Error("must not run"); }, analyzeRecipeVideo: async () => ({ title: "丼", ingredients: [{ name: "豚こま", amount: "200g" }], steps: ["焼く"] }) };
  await assert.rejects(importYouTubeRecipe("https://youtu.be/abcdefghijk", shortDeps), { code: "empty_description" }, "importing never reads the video on its own");
  const short = await importYouTubeRecipe("https://youtu.be/abcdefghijk", shortDeps, { forceVideo: true });
  assert.equal(short.analyzedFrom, "video"); assert.deepEqual(short.steps, ["焼く"]);
});

test("the video is read only on request (a ticket); importing flags that it could help; long videos are read for their first 10 minutes", async () => {
  let videoCalls = 0, reserved = 0;
  const video = async () => { videoCalls++; return { steps: ["キャベツを切る", "調味料で和える"], ingredients: [{ name: "キャベツ", amount: "1/2玉" }] }; };
  const snippet = (d) => ({ title: "コールスロー", description: "キャベツ 1/2玉", channelTitle: "c", durationSeconds: d });
  const noSteps = async () => ({ title: "コールスロー", ingredients: [{ name: "キャベツ", amount: "1/2玉" }, { name: "1人前あたり約102kcal", amount: "11.6g" }], steps: [] });
  const skipped = await importYouTubeRecipe("https://youtube.com/shorts/abcdefghijk", { fetchYouTubeSnippet: async () => snippet(50), analyzeRecipeDescription: noSteps, analyzeRecipeVideo: video });
  assert.equal(skipped.videoSkipped, true); assert.equal(skipped.analyzedFrom, "description"); assert.equal(videoCalls, 0, "no ticket is spent without a tap");
  const r = await importYouTubeRecipe("https://youtube.com/shorts/abcdefghijk", { fetchYouTubeSnippet: async () => snippet(50), analyzeRecipeDescription: noSteps, analyzeRecipeVideo: video }, { forceVideo: true, reserveBudget: async () => { reserved++; } });
  assert.equal(r.analyzedFrom, "video"); assert.deepEqual(r.steps, ["キャベツを切る", "調味料で和える"]); assert.equal(reserved, 1);
  assert.deepEqual(r.ingredients.map((i) => i.name), ["キャベツ"], "nutrition lines are not ingredients");
  let clip = "unset";
  const long = await importYouTubeRecipe("https://youtu.be/abcdefghijk", { fetchYouTubeSnippet: async () => snippet(631), analyzeRecipeDescription: noSteps, analyzeRecipeVideo: async (u, s, o) => { clip = o.clipSeconds; return video(); } }, { forceVideo: true });
  assert.equal(long.analyzedFrom, "video-clip"); assert.equal(clip, 600, "long videos: only the first 10 minutes");
  const cut = await importYouTubeRecipe("https://youtu.be/abcdefghijk", { fetchYouTubeSnippet: async () => snippet(631), analyzeRecipeDescription: noSteps, analyzeRecipeVideo: async () => ({ steps: ["切る"], stepsComplete: false }) }, { forceVideo: true });
  assert.equal(cut.analyzedFrom, "description"); assert.deepEqual(cut.steps, [], "steps cut off by the clip are not used");
  assert.equal(videoCalls, 2);
  const full = await importYouTubeRecipe("https://youtu.be/abcdefghijk", { fetchYouTubeSnippet: async () => snippet(50), analyzeRecipeDescription: async () => ({ ingredients: [{ name: "キャベツ", amount: "1/2玉" }], steps: ["切る", "和える"], stepsInDescription: true }), analyzeRecipeVideo: video });
  assert.equal(full.analyzedFrom, "description"); assert.equal(full.videoSkipped, false); assert.equal(videoCalls, 2);
  const chatter = await importYouTubeRecipe("https://youtu.be/abcdefghijk", { fetchYouTubeSnippet: async () => snippet(631), analyzeRecipeDescription: async () => ({ ingredients: [{ name: "キャベツ", amount: "1/2玉" }], steps: ["キャベツ使い切り", "味付けはケンタッキー風で"], stepsInDescription: false }), analyzeRecipeVideo: video }, { forceVideo: true });
  assert.equal(chatter.analyzedFrom, "video-clip", "descriptions without a real procedure go to the video"); assert.deepEqual(chatter.steps, ["キャベツを切る", "調味料で和える"]);
});

test("YouTube durations are read from ISO 8601", () => {
  assert.equal(parseIsoDuration("PT1M5S"), 65); assert.equal(parseIsoDuration("PT45S"), 45); assert.equal(parseIsoDuration("PT1H"), 3600); assert.equal(parseIsoDuration(""), null);
});

test("rejects unlisted videos before their contents can enter shared catalog", async () => {
  await assert.rejects(fetchYouTubeSnippet("abcdefghijk", {YOUTUBE_API_KEY:"test"}, async () => ({
    ok:true, json:async () => ({items:[{status:{privacyStatus:"unlisted"},snippet:{title:"private",description:"private recipe"}}]})
  })), {code:"non_public_video"});
});
