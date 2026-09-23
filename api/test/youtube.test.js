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

import { extractYouTubePlaylistId, fetchYouTubePlaylist } from "../src/youtube.js";

test("extracts playlist ids and rejects account-only lists", () => {
  const id = "PLabcdefghijklmnopqrstuv12";
  assert.equal(extractYouTubePlaylistId(`https://www.youtube.com/playlist?list=${id}`), id);
  assert.equal(extractYouTubePlaylistId(`https://m.youtube.com/watch?v=abcdefghijk&list=${id}&index=3`), id);
  assert.equal(extractYouTubePlaylistId(`https://music.youtube.com/playlist?list=${id}`), id);
  assert.throws(() => extractYouTubePlaylistId("https://www.youtube.com/playlist?list=WL"), /後で見る/);
  assert.throws(() => extractYouTubePlaylistId("https://www.youtube.com/playlist?list=LL"), /高評価/);
  assert.throws(() => extractYouTubePlaylistId("https://www.youtube.com/watch?v=abcdefghijk&list=RDabcdefghijk"), /ミックス/);
  assert.throws(() => extractYouTubePlaylistId("https://www.youtube.com/watch?v=abcdefghijk"), /再生リスト/);
  assert.throws(() => extractYouTubePlaylistId(`https://example.com/playlist?list=${id}`), /YouTube/);
  assert.throws(() => extractYouTubePlaylistId(""), /YouTube/);
});

function fakeYouTube({ total = 3, privateIds = [], missingPlaylist = false } = {}) {
  const calls = [];
  const ids = Array.from({ length: total }, (_, i) => `vid${String(i).padStart(8, "0")}`);
  const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
  const fetchImpl = async (url) => {
    const u = new URL(url);
    calls.push(u.pathname.split("/").pop());
    assert.equal(u.searchParams.get("key"), "test-key");
    if (u.pathname.endsWith("/playlists")) return json({ items: missingPlaylist ? [] : [{ snippet: { title: "作りたい", channelTitle: "me" } }] });
    if (u.pathname.endsWith("/playlistItems")) {
      const start = Number(u.searchParams.get("pageToken") || 0);
      const page = ids.slice(start, start + 50).map((videoId) => ({ contentDetails: { videoId } }));
      return json({ items: page, nextPageToken: start + 50 < ids.length ? String(start + 50) : undefined });
    }
    if (u.pathname.endsWith("/videos")) {
      return json({ items: u.searchParams.get("id").split(",").map((id) => ({ id, status: { privacyStatus: privateIds.includes(id) ? "private" : "public" }, snippet: { title: `料理${id}`, channelTitle: "ch", description: "材料 豚こま 100g", thumbnails: { high: { url: `https://i.ytimg.com/vi/${id}/hq.jpg` } } } })) });
    }
    throw new Error("unexpected " + url);
  };
  return { fetchImpl, calls, ids };
}

test("lists public playlist videos with paging, skips private ones and caps the size", async () => {
  const yt = fakeYouTube({ total: 120, privateIds: ["vid00000001"] });
  const result = await fetchYouTubePlaylist("PLabcdefghijklmnop", { YOUTUBE_API_KEY: "test-key" }, yt.fetchImpl, 100);
  assert.equal(result.playlist.title, "作りたい");
  assert.equal(result.truncated, true);
  assert.equal(result.skipped, 1);
  assert.equal(result.items.length, 99);
  assert.equal(result.items[0].url, "https://www.youtube.com/watch?v=vid00000000");
  assert.match(result.items[0].description, /豚こま/);
  assert.deepEqual(yt.calls, ["playlists", "playlistItems", "playlistItems", "playlistItems", "videos", "videos"]);
});

test("reports missing or private playlists clearly", async () => {
  const yt = fakeYouTube({ missingPlaylist: true });
  await assert.rejects(fetchYouTubePlaylist("PLabcdefghijklmnop", { YOUTUBE_API_KEY: "test-key" }, yt.fetchImpl), /非公開/);
  await assert.rejects(fetchYouTubePlaylist("PLabcdefghijklmnop", {}, yt.fetchImpl), /APIキー/);
});
