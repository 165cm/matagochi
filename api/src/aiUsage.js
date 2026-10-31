import { AsyncLocalStorage } from "node:async_hooks";

// AI の実際の使用量（トークン数）を、呼び出し元ごとに集める（新着の手動収集の費用の実測。PR 4b+）。
// usage.run(collector, fn) の中で呼ばれた AI だけが collector に入る。ほかの呼び出しには影響しない。
const store = new AsyncLocalStorage();
export const usage = {
  run: (collector, fn) => store.run(collector, fn),
};
// 集めている呼び出しが「軽く」（考える部分を使わずに）読む指定か。新着集め・一括収集の説明欄の読み取りで使う。
export const liteMode = () => store.getStore()?.lite === true;
// response.usageMetadata：promptTokenCount（読んだ）・candidatesTokenCount（書いた）・thoughtsTokenCount（考えた。書いた扱いの料金）。
export function recordUsage(model, response) {
  const c = store.getStore();
  const m = response?.usageMetadata;
  if (!c) return;
  // 使用量のない返事は、費用を0円とみなさない印を残す（管理の候補づくりで「費用不明」と出す）。
  if (!m) { c.unmetered = (c.unmetered || 0) + 1; return; }
  c.calls = (c.calls || 0) + 1;
  c.input = (c.input || 0) + (Number(m.promptTokenCount) || 0);
  // 動画の音声は、文字・映像より入力の単価が高い（種類ごとの数があれば、音声の分を分けて数える）。
  const audio = (Array.isArray(m.promptTokensDetails) ? m.promptTokensDetails : []).filter((d) => String(d?.modality || "").toUpperCase() === "AUDIO").reduce((n, d) => n + (Number(d.tokenCount) || 0), 0);
  if (audio) c.audioInput = (c.audioInput || 0) + audio;
  c.output = (c.output || 0) + (Number(m.candidatesTokenCount) || 0) + (Number(m.thoughtsTokenCount) || 0);
  c.model = String(model || c.model || "");
}
// 料金の目安（円）。単価は環境変数で直せる（既定：gemini-2.5-flash の公開料金 入力 $0.30・出力 $2.50 ／100万トークン、1ドル160円。2026-10-02 のユーザーの判断：請求の換算に合わせる）。
export function usageYen(c, env = process.env) {
  const inPrice = Number(env.GEMINI_PRICE_IN_USD_PER_M) > 0 ? Number(env.GEMINI_PRICE_IN_USD_PER_M) : 0.3;
  const outPrice = Number(env.GEMINI_PRICE_OUT_USD_PER_M) > 0 ? Number(env.GEMINI_PRICE_OUT_USD_PER_M) : 2.5;
  // 音声の入力の単価（既定：gemini-2.5-flash の公開料金 $1.00／100万トークン）。
  const audioPrice = Number(env.GEMINI_PRICE_AUDIO_IN_USD_PER_M) > 0 ? Number(env.GEMINI_PRICE_AUDIO_IN_USD_PER_M) : 1.0;
  const rate = Number(env.USD_JPY) > 0 ? Number(env.USD_JPY) : 160;
  const audio = Math.min(c?.audioInput || 0, c?.input || 0);
  return ((((c?.input || 0) - audio) * inPrice + audio * audioPrice + (c?.output || 0) * outPrice) / 1_000_000) * rate;
}
