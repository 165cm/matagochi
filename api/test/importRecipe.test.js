import test from "node:test";
import assert from "node:assert/strict";
import { importYouTubeRecipe } from "../src/importRecipe.js";
import { fetchYouTubeSnippet } from "../src/youtube.js";

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

test("reports an empty YouTube description as an import error", async () => {
  await assert.rejects(
    fetchYouTubeSnippet("abcdefghijk", { YOUTUBE_API_KEY: "test" }, async () => ({
      ok: true,
      json: async () => ({ items: [{ snippet: { title: "no description", description: "" } }] })
    })),
    /説明文/
  );
});
