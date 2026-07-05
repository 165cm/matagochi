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
