import test from "node:test";
import assert from "node:assert/strict";
import { createMemorySyncStore, createGcsSyncStore } from "../src/syncStore.js";
import { createRecipeCatalog } from "../src/recipeCatalog.js";
import { createHousekeeping } from "../src/housekeeping.js";
import { fetchYouTubeStatuses } from "../src/youtube.js";
import { pruneIcons } from "../src/trends.js";

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-01T03:00:00Z");
const ago = (days) => new Date(NOW - days * DAY).toISOString();
const recipe = (id, days, extra = {}) => ({ status: "ready", result: { title: `料理${id}`, videoId: id, caption: `説明 ${id}`, channelTitle: `ch ${id}`, ingredients: [{ name: "卵", amount: "1個" }], steps: ["焼く"], snippetFetchedAt: ago(days), catalog: { id: `youtube-${id}`, analyzedAt: ago(days), extractorVersion: 3 }, ...extra } });

test("the memory store lists by prefix in pages and removes (only the expected version)", async () => {
  const store = createMemorySyncStore();
  for (const k of ["youtube-a", "youtube-b", "youtube-c", "variant-search/x", "youtube"]) await store.put(k, { k });
  const first = await store.list("youtube-", { max: 2 });
  assert.deepEqual(first, { names: ["youtube-a", "youtube-b"], next: "youtube-b" });
  assert.deepEqual(await store.list("youtube-", { pageToken: first.next, max: 2 }), { names: ["youtube-c"], next: "" });
  const b = await store.get("youtube-b");
  assert.equal(await store.remove("youtube-b", { ifGeneration: b.generation + 1 }), false);
  assert.equal(await store.remove("youtube-b", { ifGeneration: b.generation }), true);
  assert.equal(await store.get("youtube-b"), null);
  assert.equal(await store.remove("nothing"), true);
});

test("the Cloud Storage store lists under its prefix and deletes with a generation check", async () => {
  const calls = [];
  const fetch = async (url, opts = {}) => {
    calls.push([opts.method || "GET", String(url)]);
    if (String(url).startsWith("http://metadata")) return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }));
    if (opts.method === "DELETE") { const status = String(url).includes("gone") ? 404 : String(url).includes("ifGenerationMatch=9") ? 412 : 204; return new Response(status === 204 ? null : "", { status }); }
    return new Response(JSON.stringify({ items: [{ name: "recipe-catalog/youtube-abc.json" }, { name: "recipe-catalog/youtube-def.json" }, { name: "other/x.json" }], nextPageToken: "p2" }));
  };
  const store = createGcsSyncStore("bucket", { fetch, prefix: "recipe-catalog" });
  assert.deepEqual(await store.list("youtube-", { max: 2 }), { names: ["youtube-abc", "youtube-def"], next: "p2" });
  const listUrl = new URL(calls.find(([m, u]) => m === "GET" && u.includes("/o?"))[1]);
  assert.equal(listUrl.searchParams.get("prefix"), "recipe-catalog/youtube-");
  assert.equal(await store.remove("youtube-abc", { ifGeneration: 3 }), true);
  assert.equal(await store.remove("gone"), true, "already gone is fine");
  assert.equal(await store.remove("youtube-def", { ifGeneration: 9 }), false, "changed since read");
  assert.ok(calls.some(([m, u]) => m === "DELETE" && u.includes("recipe-catalog%2Fyoutube-abc.json?ifGenerationMatch=3")));
});

test("video statuses: one call for up to 50, missing = not found, private = not public, network errors throw", async () => {
  let asked = null;
  const out = await fetchYouTubeStatuses(["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc", "bad"], { YOUTUBE_API_KEY: "k" }, async (url) => {
    asked = new URL(url).searchParams.get("id");
    return new Response(JSON.stringify({ items: [{ id: "aaaaaaaaaaa", status: { privacyStatus: "public" }, snippet: { title: "t", description: "d", channelTitle: "c", channelId: "UC1" } }, { id: "bbbbbbbbbbb", status: { privacyStatus: "private" }, snippet: {} }] }));
  });
  assert.equal(asked, "aaaaaaaaaaa,bbbbbbbbbbb,ccccccccccc");
  assert.deepEqual(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.status])), { aaaaaaaaaaa: "public", bbbbbbbbbbb: "non_public", ccccccccccc: "not_found" });
  assert.equal(out.aaaaaaaaaaa.snippet.channelTitle, "c");
  await assert.rejects(fetchYouTubeStatuses(["aaaaaaaaaaa"], { YOUTUBE_API_KEY: "k" }, async () => new Response("", { status: 403 })));
});

test("the catalog sweep re-checks entries older than 25 days: public is refreshed, gone is hidden then removed after 30 days, failures only strip old text", async () => {
  const store = createMemorySyncStore();
  await store.put("youtube-pub0000000a", recipe("pub0000000a", 26));
  await store.put("youtube-del0000000b", recipe("del0000000b", 26));
  await store.put("youtube-old0000000c", recipe("old0000000c", 26, { caption: "", channelTitle: "", unavailable: { reason: "non_public", since: ago(31) } }));
  await store.put("youtube-new0000000d", recipe("new0000000d", 1));
  await store.put("youtube-pnd0000000e", { status: "pending", startedAt: ago(0) });
  const asked = [];
  let analyzed = 0;
  const catalog = createRecipeCatalog(store, async () => { analyzed++; return {}; }, { now: () => NOW, checkVideos: async (ids) => { asked.push(...ids); return { pub0000000a: { status: "public", caption: "新しい説明", channelTitle: "新しい名前" }, del0000000b: { status: "not_found" }, old0000000c: { status: "non_public" } }; } });
  const out = await catalog.sweep({ max: 10 });
  assert.deepEqual(asked.sort(), ["del0000000b", "old0000000c", "pub0000000a"], "fresh entries are not asked about");
  assert.deepEqual([out.refreshed, out.unavailable, out.removed, out.next], [1, 1, 1, ""]);
  const pub = (await store.get("youtube-pub0000000a")).envelope.result;
  assert.deepEqual([pub.caption, pub.channelTitle, pub.snippetFetchedAt], ["新しい説明", "新しい名前", new Date(NOW).toISOString()]);
  const del = (await store.get("youtube-del0000000b")).envelope.result;
  assert.deepEqual([del.caption, del.channelTitle, del.unavailable.reason], ["", "", "not_found"]);
  assert.equal(await catalog.peek("https://www.youtube.com/watch?v=del0000000b"), null, "hidden from public lists");
  await assert.rejects(catalog.get("youtube-del0000000b"), { code: "recipe_not_found" });
  await assert.rejects(catalog.import("https://www.youtube.com/watch?v=del0000000b"), { code: "video_not_found" });
  assert.equal(analyzed, 0, "no AI for a gone video");
  assert.equal(await store.get("youtube-old0000000c"), null, "still unavailable after 30 days: removed with its derived recipe");
  assert.ok(await catalog.peek("https://www.youtube.com/watch?v=pub0000000a"));
  // 公開に戻ったら、また出る
  const back = createRecipeCatalog(store, async () => ({}), { now: () => NOW + 26 * DAY, checkVideos: async () => ({ del0000000b: { status: "public", caption: "戻った", channelTitle: "ch" }, pub0000000a: { status: "public", caption: "x", channelTitle: "y" } }) });
  await back.sweep({ max: 10 });
  assert.equal((await back.peek("https://www.youtube.com/watch?v=del0000000b")).caption, "戻った");
});

test("the catalog sweep: when YouTube cannot be asked, text older than 30 days is stripped without moving the date; pages continue with the cursor", async () => {
  const store = createMemorySyncStore();
  await store.put("youtube-aaaaaaaaaa1", recipe("aaaaaaaaaa1", 31));
  await store.put("youtube-aaaaaaaaaa2", recipe("aaaaaaaaaa2", 27));
  await store.put("youtube-aaaaaaaaaa3", recipe("aaaaaaaaaa3", 40));
  const catalog = createRecipeCatalog(store, async () => ({}), { now: () => NOW, checkVideos: async () => { throw new Error("quota"); } });
  const first = await catalog.sweep({ max: 2 });
  assert.deepEqual([first.errors, first.stripped, first.next], [1, 1, "youtube-aaaaaaaaaa2"]);
  const a1 = (await store.get("youtube-aaaaaaaaaa1")).envelope.result;
  assert.deepEqual([a1.caption, a1.snippetFetchedAt], ["", ago(31)], "the date is not moved, so it is asked again next time");
  assert.equal((await store.get("youtube-aaaaaaaaaa2")).envelope.result.caption, "説明 aaaaaaaaaa2", "under 30 days: kept");
  const second = await catalog.sweep({ cursor: first.next, max: 2 });
  assert.deepEqual([second.stripped, second.next], [1, ""]);
  // 一覧を持たない保存先（以前の形）では何もしない
  assert.deepEqual(await createRecipeCatalog({ get: async () => null, put: async () => ({}) }, async () => ({}), { checkVideos: async () => ({}) }).sweep(), { skipped: true, next: "" });
});

test("reading a saved result marks a deleted video as unavailable instead of pushing its date forward", async () => {
  const store = createMemorySyncStore();
  await store.put("youtube-aaaaaaaaaa1", recipe("aaaaaaaaaa1", 31));
  await store.put("youtube-aaaaaaaaaa2", recipe("aaaaaaaaaa2", 31));
  const catalog = createRecipeCatalog(store, async () => ({}), { now: () => NOW, refreshSnippet: async (id) => { if (id === "aaaaaaaaaa1") throw Object.assign(new Error("gone"), { code: "video_not_found" }); throw new Error("network"); } });
  await assert.rejects(catalog.import("https://www.youtube.com/watch?v=aaaaaaaaaa1"), { code: "video_not_found" });
  assert.equal((await store.get("youtube-aaaaaaaaaa1")).envelope.result.unavailable.reason, "not_found");
  const r = await catalog.import("https://www.youtube.com/watch?v=aaaaaaaaaa2");
  assert.equal(r.caption, "", "old text is not served");
  assert.equal((await store.get("youtube-aaaaaaaaaa2")).envelope.result.snippetFetchedAt, ago(31), "a network failure does not count as refreshed");
});

test("housekeeping runs once a day: catalog sweep with a saved cursor, old search results removed, old icons pruned", async () => {
  const store = createMemorySyncStore();
  let now = NOW;
  const sweeps = [];
  const catalog = { sweep: async (o) => { sweeps.push(o); return { next: o.cursor ? "" : "youtube-m" }; } };
  await store.put("variant-search/old", { items: [{ title: "古い" }], at: ago(5) });
  await store.put("variant-search/new", { items: [{ title: "新しい" }], at: ago(1) });
  await store.put("variant-search-quota/2026-09-01/home", { used: 3 });
  await store.put("trends/icons", { at: ago(40), map: { UCold: "https://yt3.ggpht.com/old", UCnew: { url: "https://yt3.ggpht.com/new", at: ago(2) }, UCstale: { url: "https://yt3.ggpht.com/s", at: ago(31) } } });
  const hk = createHousekeeping(store, { catalog, now: () => now });
  const out = await hk.run();
  assert.deepEqual(out.variants, { seen: 2, removed: 1, next: "" });
  assert.equal(await store.get("variant-search/old"), null);
  assert.ok(await store.get("variant-search/new"));
  assert.ok(await store.get("variant-search-quota/2026-09-01/home"), "other keys are untouched");
  assert.deepEqual(Object.keys((await store.get("trends/icons")).envelope.map), ["UCnew"]);
  assert.deepEqual(await hk.run(), { skipped: "done_today" });
  now += DAY;
  await hk.run();
  assert.deepEqual(sweeps.map((s) => s.cursor), ["", "youtube-m"], "continues from where it stopped");
  // 一部が失敗しても、ほかは進む
  now += DAY;
  const broken = createHousekeeping(store, { catalog: { sweep: async () => { throw Object.assign(new Error("x"), { code: "sync_storage_failed" }); } }, now: () => now });
  const r = await broken.run();
  assert.deepEqual(r.catalog, { error: "sync_storage_failed" });
  assert.ok(r.icons);
});

test("icons: the old string-only shape uses the document date; entries carry their own date", () => {
  assert.deepEqual(pruneIcons({ at: ago(3), map: { UC1: "https://a", UC2: { url: "https://b", at: ago(40) }, UC3: { url: "", at: ago(1) } } }, NOW), { UC1: { url: "https://a", at: ago(3) } });
  assert.deepEqual(pruneIcons(null, NOW), {});
});

test("review fix (#103): a video still gone 30 days after it was found gone is removed on day 30, not only at the next 25-day check", async () => {
  const store = createMemorySyncStore();
  await store.put("youtube-del0000000b", recipe("del0000000b", 26));
  let now = NOW;
  const catalog = createRecipeCatalog(store, async () => ({}), { now: () => now, checkVideos: async (ids) => Object.fromEntries(ids.map((id) => [id, { status: "not_found" }])) });
  await catalog.sweep({ max: 10 });
  assert.equal((await store.get("youtube-del0000000b")).envelope.result.unavailable.since, new Date(NOW).toISOString());
  for (let day = 1; day <= 29; day++) { now = NOW + day * DAY; await catalog.sweep({ max: 10 }); }
  assert.ok(await store.get("youtube-del0000000b"), "kept until 30 days");
  now = NOW + 30 * DAY;
  const out = await catalog.sweep({ max: 10 });
  assert.equal(out.removed, 1);
  assert.equal(await store.get("youtube-del0000000b"), null, "removed on day 30");
});

test("review fix (#103): old search results after the first page are reached, because the search cleanup continues from where it stopped", async () => {
  const store = createMemorySyncStore();
  let now = NOW;
  for (let i = 0; i < 5; i++) await store.put(`variant-search/a${i}`, { items: [], at: ago(0) }); // 先頭：いつも新しい
  await store.put("variant-search/z-old", { items: [{ title: "古い" }], at: ago(10) });
  const hk = createHousekeeping(store, { catalog: { sweep: async () => ({ next: "" }) }, now: () => now, variantsPerDay: 3 });
  const seen = [];
  for (let d = 0; d < 3; d++) { const out = await hk.run(); seen.push(out.variants.next); now += DAY; for (let i = 0; i < 5; i++) await store.put(`variant-search/a${i}`, { items: [], at: new Date(now).toISOString() }); }
  assert.equal(await store.get("variant-search/z-old"), null, "the old one at the end is reached");
  assert.deepEqual(seen, ["variant-search/a2", "", "variant-search/a2"], "continues, then starts over");
});
