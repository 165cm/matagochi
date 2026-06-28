import test from "node:test";
import assert from "node:assert/strict";
import { extractYouTubeVideoId } from "../src/youtube.js";

test("extracts ids from YouTube URL formats", () => {
  assert.equal(extractYouTubeVideoId("https://www.youtube.com/shorts/abcdefghijk"), "abcdefghijk");
  assert.equal(extractYouTubeVideoId("https://youtu.be/abcdefghijk?si=test"), "abcdefghijk");
  assert.equal(extractYouTubeVideoId("https://www.youtube.com/watch?v=abcdefghijk"), "abcdefghijk");
  assert.equal(extractYouTubeVideoId("https://www.youtube.com/embed/abcdefghijk"), "abcdefghijk");
});

test("rejects non YouTube and empty URLs", () => {
  assert.throws(() => extractYouTubeVideoId(""), /YouTube URL/);
  assert.throws(() => extractYouTubeVideoId("https://www.instagram.com/reel/abcdefghijk/"), /YouTube/);
  assert.throws(() => extractYouTubeVideoId("https://www.youtube.com/shorts/too-short"), /YouTube/);
});
