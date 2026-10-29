import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  decodeEntities,
  formatTime,
  parseTranscriptXml,
  pickCaptionTrack,
  formatTranscriptForPrompt,
  fetchYouTubeTranscript
} from "../src/transcript.js";

describe("transcript", () => {
  it("decodeEntities: decodes common HTML entities", () => {
    assert.equal(decodeEntities("It&#39;s &amp; &quot;delicious&quot; &lt;&gt;"), 'It\'s & "delicious" <>');
    assert.equal(decodeEntities("&#x4E00;&#x4E01;"), "一丁");
    assert.equal(decodeEntities("plain text"), "plain text");
  });

  it("formatTime: formats seconds to MM:SS and HH:MM:SS", () => {
    assert.equal(formatTime(0), "00:00");
    assert.equal(formatTime(45), "00:45");
    assert.equal(formatTime(125), "02:05");
    assert.equal(formatTime(3665), "01:01:05");
  });

  it("parseTranscriptXml: parses srv3 format (<p t=... d=...>)", () => {
    const xml = `<?xml version="1.0" encoding="utf-8" ?>
    <timedtext format="3">
      <body>
        <p t="1000" d="2500"><s>玉ねぎを</s><s>切ります</s></p>
        <p t="4000" d="3000">フライパンを熱して油を引きます</p>
      </body>
    </timedtext>`;
    const result = parseTranscriptXml(xml);
    assert.equal(result.length, 2);
    assert.deepEqual(result[0], { start: 1, duration: 2.5, text: "玉ねぎを切ります" });
    assert.deepEqual(result[1], { start: 4, duration: 3, text: "フライパンを熱して油を引きます" });
  });

  it("parseTranscriptXml: parses classic format (<text start=... dur=...>)", () => {
    const xml = `<transcript>
      <text start="12.34" dur="2.5">調味料を合わせます</text>
      <text start="18.5" dur="4.2">強火で一気に炒めます</text>
    </transcript>`;
    const result = parseTranscriptXml(xml);
    assert.equal(result.length, 2);
    assert.deepEqual(result[0], { start: 12.3, duration: 2.5, text: "調味料を合わせます" });
    assert.deepEqual(result[1], { start: 18.5, duration: 4.2, text: "強火で一気に炒めます" });
  });

  it("pickCaptionTrack: prefers manual ja, then auto ja, then fallback", () => {
    const tracks = [
      { languageCode: "en", name: { simpleText: "English" } },
      { languageCode: "ja", kind: "asr", name: { simpleText: "日本語 (自動生成)" }, baseUrl: "https://auto.youtube.com" },
      { languageCode: "ja", name: { simpleText: "日本語" }, baseUrl: "https://manual.youtube.com" }
    ];
    // manual ja wins
    assert.equal(pickCaptionTrack(tracks, "ja")?.baseUrl, "https://manual.youtube.com");

    // without manual ja, auto ja wins
    const autoOnly = [tracks[0], tracks[1]];
    assert.equal(pickCaptionTrack(autoOnly, "ja")?.baseUrl, "https://auto.youtube.com");

    // without ja, returns first
    const noJa = [tracks[0]];
    assert.equal(pickCaptionTrack(noJa, "ja")?.baseUrl, undefined);
  });

  it("formatTranscriptForPrompt: merges close utterances and limits maxSeconds", () => {
    const items = [
      { start: 5, duration: 2, text: "こんにちは。" },
      { start: 7, duration: 3, text: "料理研究家です。" }, // within 5s of start 5 -> merged
      { start: 20, duration: 4, text: "玉ねぎを切ります。" },
      { start: 50, duration: 5, text: "完成です。" }
    ];
    const text = formatTranscriptForPrompt(items, { maxSeconds: 30, mergeWindowSeconds: 5 });
    assert.equal(text, "[00:05] こんにちは。 料理研究家です。\n[00:20] 玉ねぎを切ります。");
  });

  it("fetchYouTubeTranscript: mock fetch handles errors and returns parsed items", async () => {
    const mockFetch = async (url, opts) => {
      if (typeof url === "string" && url.includes("youtubei/v1/player")) {
        return {
          ok: true,
          json: async () => ({
            captions: {
              playerCaptionsTracklistRenderer: {
                captionTracks: [{ languageCode: "ja", baseUrl: "https://www.youtube.com/api/timedtext?v=test" }]
              }
            }
          })
        };
      }
      if (typeof url === "string" && url.includes("api/timedtext")) {
        return {
          ok: true,
          text: async () => `<transcript><text start="10" dur="2">テスト発話</text></transcript>`
        };
      }
      return { ok: false };
    };

    const result = await fetchYouTubeTranscript("test_video", { fetchImpl: mockFetch });
    assert.ok(result);
    assert.equal(result.length, 1);
    assert.deepEqual(result[0], { start: 10, duration: 2, text: "テスト発話" });
  });

  it("fetchYouTubeTranscript: rejects non-youtube baseUrl for SSRF prevention", async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({
        captions: {
          playerCaptionsTracklistRenderer: {
            captionTracks: [{ languageCode: "ja", baseUrl: "https://evil.attacker.com/timedtext" }]
          }
        }
      })
    });
    const result = await fetchYouTubeTranscript("test_video", { fetchImpl: mockFetch });
    assert.equal(result, null);
  });
});
