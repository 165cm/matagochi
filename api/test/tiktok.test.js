import test from "node:test";
import assert from "node:assert/strict";
import { fetchTikTokOEmbed, isTikTokUrl } from "../src/tiktok.js";

test("detects TikTok URL formats", () => {
  assert.equal(isTikTokUrl("https://www.tiktok.com/@user/video/1234567890"), true);
  assert.equal(isTikTokUrl("https://vt.tiktok.com/ZSabcdef/"), true);
  assert.equal(isTikTokUrl("https://vm.tiktok.com/ZSabcdef/"), true);
  assert.equal(isTikTokUrl("https://www.youtube.com/shorts/abcdefghijk"), false);
  assert.equal(isTikTokUrl(""), false);
});

test("returns normalized oEmbed fields", async () => {
  const fakeFetch = async (url) => {
    assert.match(url, /^https:\/\/www\.tiktok\.com\/oembed\?url=/);
    return {
      ok: true,
      json: async () => ({
        title: " ツナきゅうり冷やしうどん ",
        author_name: "cookchannel",
        thumbnail_url: "https://example.com/thumb.jpg"
      })
    };
  };
  const result = await fetchTikTokOEmbed("https://www.tiktok.com/@user/video/1234567890", { fetch: fakeFetch });
  assert.deepEqual(result, {
    title: "ツナきゅうり冷やしうどん",
    author: "cookchannel",
    thumbnailUrl: "https://example.com/thumb.jpg",
    videoUrl: "https://www.tiktok.com/@user/video/1234567890"
  });
});

test("rejects non TikTok URLs", async () => {
  await assert.rejects(
    fetchTikTokOEmbed("https://www.youtube.com/shorts/abcdefghijk"),
    /TikTok/
  );
});

test("maps upstream failure to ApiError", async () => {
  const fakeFetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
  await assert.rejects(
    fetchTikTokOEmbed("https://www.tiktok.com/@user/video/1234567890", { fetch: fakeFetch }),
    (error) => error.status === 502 && error.code === "tiktok_oembed_failed"
  );
});

test("TikTok short links from the share sheet are resolved before oEmbed", async () => {
  const seen = [];
  const fakeFetch = async (u) => { seen.push(u); if (u.startsWith("https://vt.tiktok.com/")) return { ok: true, url: "https://www.tiktok.com/@cook/video/7300000000000000000?_r=1" }; return { ok: true, json: async () => ({ title: "豚こま丼 材料（2人分）", author_name: "cook", thumbnail_url: "" }) }; };
  const result = await fetchTikTokOEmbed("https://vt.tiktok.com/ZSabc123/", { fetch: fakeFetch });
  assert.match(seen[1], /url=https%3A%2F%2Fwww\.tiktok\.com%2F%40cook%2Fvideo%2F7300000000000000000$/);
  assert.equal(result.videoUrl, "https://www.tiktok.com/@cook/video/7300000000000000000");
});
