import { randomUUID } from "node:crypto";
import { ApiError } from "./errors.js";
import { extractYouTubeVideoId } from "./youtube.js";

// 投稿者の方への窓口（掲載停止の申し込み）。
// 申し込みをした人がチャンネルの持ち主かは、ここでは確かめられない。だから申し込みだけでは停止を「確定」しない：
//   pending   … 申し込みがあったチャンネル。確認が済むまで、念のため「新着」「みんなの定番」から一時的に外す（一時対応）
//   confirmed … 運営が確かめて停止を確定したチャンネル（以前の版で外したチャンネル `channels` もここ。外したまま）
//   restored  … 運営が確かめて、掲載に戻したチャンネル。そのあとの確認前の申し込みは記録するが、自動では外さない
// 状態を変えられるのは管理者だけ（/api/admin/creators）。利用者が自分で取り込んだレシピには影響しない。
// 持ち主（YouTubeでログインして確かめた人：creatorAuth.js）は、自分のチャンネルだけ、その場で停止・再開・参加申請ができる。
// 参加申請は、申請しただけでは提携済みにしない（管理者が承認画面 admin/creators.html で決める）。
// 同意は、AIでの読み取り・保存・要約・人数の換算・一般公開を別々に持つ（YouTube の利用規約とは別の、投稿者の許可）。
// 修正依頼（APP_MAP §38）：だれでも送れる。持ち主としてログインしている人の依頼には「ご本人」の印（verified）。
// 動画単位で一覧から外せる（videos）：運営が承認画面で外す／戻す。持ち主は、自分の動画をその場で外せる。
const KEY = "creators/optout";
const CORRECTIONS = "creators/corrections";
export const CORRECTION_KINDS = ["amount", "ingredient", "steps", "servings", "credit", "other"];
const MAX_CORRECTIONS = 300;
const APPS = "creators/applications";
export const CONSENTS = ["aiExtract", "store", "summary", "scale", "publicCatalog"];
const CHANNEL_RE = /^UC[\w-]{22}$/;
const consentsOf = (raw) => Object.fromEntries(CONSENTS.map((k) => [k, raw?.[k] === true]));
const both = (a, b) => Object.fromEntries(CONSENTS.map((k) => [k, !!a?.[k] && !!b?.[k]]));
const clean = (s, n) => String(s || "").slice(0, n);
const stopKeys = (doc) => [...Object.keys(doc.channels || {}), ...Object.keys(doc.pending || {}), ...Object.keys(doc.videos || {})].sort().join(",");
function readDoc(entry) {
  const doc = entry?.envelope || {};
  return { channels: { ...(doc.channels || {}) }, pending: { ...(doc.pending || {}) }, restored: { ...(doc.restored || {}) }, videos: { ...(doc.videos || {}) } };
}
// onChange：掲載停止の一覧が変わった時（停止・一時対応・再開・動画単位）に呼ぶ。新着・みんなの定番の表示キャッシュをすぐ捨てるのに使う。
export function createCreatorDesk(store, { resolveChannel, now = Date.now, onChange = () => {} } = {}) {
  const required = () => { if (!store) throw new ApiError(503, "catalog_not_configured", "保存先が未設定です。"); };
  let cache = null;
  const iso = () => new Date(now()).toISOString();
  // 1つの文書を読み直しながら書く（同時の申し込み・審査でも、片方を消さない）。
  async function update(change, key = KEY, reader = readDoc) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const entry = await store.get(key);
      const doc = reader(entry);
      const out = change(doc);
      if (out === undefined) return doc;
      if (await store.put(key, doc, { ifGeneration: entry?.generation ?? 0 })) {
        cache = null;
        // 掲載から外す集まり（channels・pending・videos）が実際に変わった時だけ知らせる（同じ申し込みの再送などでは捨てない）。
        if (key === KEY && stopKeys(readDoc(entry)) !== stopKeys(doc)) { try { onChange(); } catch {} }
        return out;
      }
    }
    throw new ApiError(409, "creators_busy", "混み合っています。少し待ってからお試しください。");
  }
  async function optedOut() {
    if (!store) return new Set();
    if (cache && cache.until > now()) return cache.value;
    const doc = readDoc(await store.get(KEY));
    // 確定した停止と、確認待ちの一時対応の両方を外す。動画単位で外したもの（動画ID・11文字）も同じ集まりに入れる（チャンネルIDは UC で始まる24文字なので混ざらない）。
    cache = { value: new Set([...Object.keys(doc.channels), ...Object.keys(doc.pending), ...Object.keys(doc.videos)]), until: now() + 5 * 60_000 };
    return cache.value;
  }
  const readApps = (entry) => ({ ...(entry?.envelope || {}) });
  // 持ち主と確かめたチャンネルか（合い鍵に入っているチャンネルだけ）。他人のチャンネルは断る。
  const mine = (channelId, owned) => {
    if (!CHANNEL_RE.test(String(channelId || "")) || !(owned || []).includes(channelId)) throw new ApiError(403, "not_your_channel", "ログインしたアカウントのチャンネルではありません。");
  };
  // 同意のうち、いま使ってよいもの：承認した同意と、いまの申請の同意の両方がある項目だけ（取り消しはすぐ効く）。
  const effective = (app) => (app?.approvedConsents ? (app.status === "approved" ? consentsOf(app.approvedConsents) : both(app.approvedConsents, app.consents)) : consentsOf({}));
  const readCorrections = (entry) => ({ items: { ...(entry?.envelope?.items || {}) } });
  // 動画を一覧から外す／戻す（掲載停止の文書の videos）。
  const setHidden = (videoId, value) => update((doc) => { if (value) doc.videos[videoId] = value; else delete doc.videos[videoId]; return true; });
  return {
    optedOut,
    // 修正依頼（だれでも）。owned は、持ち主としてログインしている人のチャンネル（ログインしていなければ空）。
    // hide：持ち主が自分の動画を、その場で一覧から外す（持ち主でなければ無視して、運営の確認を待つ）。
    async correction({ video, kind, message = "", contact = "", hide = false } = {}, owned = []) {
      required();
      let videoId;
      try { videoId = extractYouTubeVideoId(String(video || "").trim().slice(0, 300)); } catch { throw new ApiError(400, "video_required", "動画のURLを入れてください。"); }
      if (!CORRECTION_KINDS.includes(kind)) throw new ApiError(400, "kind_required", "直してほしいところを選んでください。");
      const text = clean(message, 1000).trim();
      if (!text) throw new ApiError(400, "message_required", "直してほしい内容を書いてください。");
      const found = await resolveChannel(`https://www.youtube.com/watch?v=${videoId}`).catch(() => null);
      const channelId = CHANNEL_RE.test(String(found?.channelId || "")) ? found.channelId : "";
      const verified = !!channelId && (owned || []).includes(channelId);
      const at = iso(), id = `${at.slice(0, 10)}-${randomUUID().slice(0, 8)}`;
      const hidden = verified && hide === true;
      if (hidden) await setHidden(videoId, { at, by: "owner", channelId, correctionId: id });
      await update((doc) => {
        doc.items[id] = { videoId, channelId, channelTitle: clean(found?.title, 200), kind, message: text, contact: clean(contact, 200), verified, status: "open", at, ...(hidden ? { hiddenAt: at } : {}) };
        // 古い順に、対応が済んだものから消して上限に収める。
        const ids = Object.keys(doc.items).sort();
        for (const old of ids) { if (Object.keys(doc.items).length <= MAX_CORRECTIONS) break; if (doc.items[old].status !== "open") delete doc.items[old]; }
        return true;
      }, CORRECTIONS, readCorrections);
      return { id, videoId, channelId, verified, hidden, status: "open" };
    },
    // 持ち主：自分のチャンネルの動画を、一覧に戻す（運営が外したものも、持ち主なら戻せる）。
    async ownerShow(channelId, owned, { videoId = "" } = {}) {
      required();
      mine(channelId, owned);
      const doc = readDoc(await store.get(KEY));
      const v = Object.prototype.hasOwnProperty.call(doc.videos, String(videoId)) ? doc.videos[String(videoId)] : null;
      if (!v || v.channelId !== channelId) throw new ApiError(404, "video_not_hidden", "外している動画ではありません。");
      await setHidden(String(videoId), null);
      return { videoId, hidden: false };
    },
    // 管理者：修正依頼の一覧（新しい順）と、いま外している動画。
    async corrections() {
      required();
      const { items } = readCorrections(await store.get(CORRECTIONS));
      const doc = readDoc(await store.get(KEY));
      return { items: Object.entries(items).map(([id, v]) => ({ id, ...v, hidden: !!doc.videos[v.videoId] })).sort((a, b) => b.at.localeCompare(a.at)), hiddenVideos: Object.entries(doc.videos).map(([videoId, v]) => ({ videoId, ...v })) };
    },
    // 管理者：hide＝その動画を一覧から外す、show＝戻す、done＝対応済み、declined＝見送り（外した動画は show するまで外したまま）。
    async decideCorrection(id, { decision, note = "" } = {}) {
      required();
      if (!["hide", "show", "done", "declined"].includes(decision)) throw new ApiError(400, "invalid_decision", "判断（hide・show・done・declined）を送ってください。");
      const { items } = readCorrections(await store.get(CORRECTIONS));
      if (!Object.prototype.hasOwnProperty.call(items, String(id))) throw new ApiError(404, "correction_not_found", "この修正依頼はありません。");
      const at = iso(), videoId = items[id].videoId;
      if (decision === "hide") await setHidden(videoId, { at, by: "admin", channelId: items[id].channelId || "", correctionId: id });
      if (decision === "show") await setHidden(videoId, null);
      return update((doc) => {
        const prev = doc.items[id];
        if (!prev) throw new ApiError(404, "correction_not_found", "この修正依頼はありません。");
        doc.items[id] = { ...prev, ...(decision === "done" || decision === "declined" ? { status: decision, decidedAt: at } : {}), ...(decision === "hide" ? { hiddenAt: at } : {}), ...(decision === "show" ? { shownAt: at } : {}), ...(note ? { note: clean(note, 500) } : {}) };
        return { id, status: doc.items[id].status, hidden: decision === "hide" ? true : decision === "show" ? false : undefined };
      }, CORRECTIONS, readCorrections);
    },
    // 持ち主：自分のチャンネルの掲載・申請の状態。
    async mine(owned) {
      required();
      const doc = readDoc(await store.get(KEY));
      const apps = readApps(await store.get(APPS));
      return { channels: owned.map((channelId) => {
        const listing = doc.channels[channelId] ? "stopped" : doc.pending[channelId] ? "pending" : "listed";
        const app = apps[channelId];
        const hidden = Object.entries(doc.videos).filter(([, v]) => v.channelId === channelId).map(([videoId, v]) => ({ videoId, at: v.at, by: v.by }));
        return { channelId, listing, hidden, application: app ? { status: app.status, consents: consentsOf(app.consents), effective: effective(app), at: app.at, ...(app.decidedAt ? { decidedAt: app.decidedAt } : {}) } : null };
      }) };
    },
    // 持ち主：掲載を止める（持ち主なので確認待ちにせず、その場で確定）。
    async ownerStop(channelId, owned, { title = "" } = {}) {
      required(); mine(channelId, owned);
      const at = iso();
      return update((doc) => {
        const before = doc.channels[channelId] || doc.pending[channelId] || doc.restored[channelId] || {};
        delete doc.pending[channelId]; delete doc.restored[channelId];
        doc.channels[channelId] = { title: clean(title || before.title, 200), at: before.at || at, confirmedAt: at, by: "owner" };
        return { channelId, listing: "stopped" };
      });
    },
    // 持ち主：掲載を再開する（第三者の申し込みで一時的に外れていても戻せる）。
    async ownerResume(channelId, owned) {
      required(); mine(channelId, owned);
      const at = iso();
      return update((doc) => {
        const before = doc.channels[channelId] || doc.pending[channelId] || doc.restored[channelId] || {};
        delete doc.channels[channelId]; delete doc.pending[channelId];
        doc.restored[channelId] = { title: before.title || "", at: before.at || at, restoredAt: at, requests: 0, by: "owner" };
        return { channelId, listing: "listed" };
      });
    },
    // 持ち主：参加申請（同意は項目ごと）。申請しただけでは承認しない。承認ずみの人が同意を減らした時は、その場で減る。
    async apply(channelId, owned, { title = "", consents = {}, message = "", contact = "" } = {}) {
      required(); mine(channelId, owned);
      const at = iso();
      const wanted = consentsOf(consents);
      if (!Object.values(wanted).some(Boolean)) throw new ApiError(400, "no_consent", "同意する項目を1つ以上選んでください。");
      return update((apps) => {
        const prev = apps[channelId];
        apps[channelId] = { title: clean(title || prev?.title, 200), status: "pending", consents: wanted, ...(prev?.approvedConsents ? { approvedConsents: prev.approvedConsents } : {}), message: clean(message, 1000), contact: clean(contact, 200), at, history: [...(prev?.history || []), { at, status: prev?.status || "new" }].slice(-20) };
        return { channelId, status: "pending", effective: effective(apps[channelId]) };
      }, APPS, readApps);
    },
    // 持ち主：参加をやめる（同意はすべて、その場で取り消し）。
    async withdraw(channelId, owned) {
      required(); mine(channelId, owned);
      const at = iso();
      return update((apps) => {
        const prev = apps[channelId];
        if (!prev) throw new ApiError(404, "no_application", "参加申請はありません。");
        apps[channelId] = { ...prev, status: "withdrawn", consents: consentsOf({}), approvedConsents: null, decidedAt: at, history: [...(prev.history || []), { at, status: prev.status }].slice(-20) };
        return { channelId, status: "withdrawn" };
      }, APPS, readApps);
    },
    // 今の同意（カタログの公開などで使う：PR 4）。
    async consentsFor(channelId) {
      if (!store) return consentsOf({});
      return effective(readApps(await store.get(APPS))[channelId]);
    },
    // 管理者：参加申請の一覧（連絡先は管理者にだけ見せる）。
    async applications() {
      required();
      const apps = readApps(await store.get(APPS));
      return { items: Object.entries(apps).map(([channelId, a]) => ({ channelId, ...a, effective: effective(a) })).sort((a, b) => (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1) || String(b.at || "").localeCompare(String(a.at || ""))) };
    },
    // 管理者：参加申請の承認・却下。承認すると、その時の同意が使える同意になる。
    // 却下しても、前に承認した同意のうち、いまも同意している項目は使える（外した同意は戻らない）。
    async decideApplication(channelId, { decision, note = "" } = {}) {
      required();
      if (!CHANNEL_RE.test(String(channelId || "")) || !["approve", "reject"].includes(decision)) throw new ApiError(400, "invalid_decision", "チャンネルIDと判断（approve か reject）を送ってください。");
      const at = iso();
      return update((apps) => {
        const prev = apps[channelId];
        if (!prev || prev.status !== "pending") throw new ApiError(409, "not_pending", "確認待ちの参加申請ではありません。");
        // 見送り：前に承認した同意のうち、いまも同意している項目だけを残す（投稿者が外した同意を、見送りで戻さない）。
        const kept = prev.approvedConsents ? both(prev.approvedConsents, prev.consents) : null;
        const next = decision === "approve"
          ? { ...prev, status: "approved", approvedConsents: consentsOf(prev.consents) }
          : kept && Object.values(kept).some(Boolean)
            ? { ...prev, status: "approved", approvedConsents: kept, consents: kept }
            : { ...prev, status: "rejected", approvedConsents: null };
        apps[channelId] = { ...next, decidedAt: at, ...(note ? { note: clean(note, 500) } : {}), history: [...(prev.history || []), { at, status: decision === "approve" ? "approved" : "rejected" }].slice(-20) };
        return { channelId, status: apps[channelId].status, effective: effective(apps[channelId]) };
      }, APPS, readApps);
    },
    async request({ channel, message = "", contact = "" } = {}) {
      required();
      const target = String(channel || "").trim().slice(0, 300);
      if (!target) throw new ApiError(400, "channel_required", "チャンネルか動画のURLを入れてください。");
      const found = await resolveChannel(target).catch(() => null);
      if (!found?.channelId) throw new ApiError(404, "channel_not_found", "チャンネルが見つかりませんでした。チャンネルのURLか、動画のURLを入れてください。");
      const id = found.channelId, title = clean(found.title, 200), at = iso();
      const status = await update((doc) => {
        if (doc.channels[id]) return "confirmed";
        if (doc.restored[id]) { doc.restored[id] = { ...doc.restored[id], requests: (doc.restored[id].requests || 0) + 1, lastAt: at }; return "review"; }
        doc.pending[id] = { title, at: doc.pending[id]?.at || at, lastAt: at, requests: (doc.pending[id]?.requests || 0) + 1 };
        return "pending";
      });
      await store.put(`creators/requests/${at.slice(0, 10)}-${randomUUID()}`, { channelId: id, title, input: target, message: clean(message, 1000), contact: clean(contact, 200), status, at }, { ifGeneration: 0 });
      // removed：いま「新着」「みんなの定番」から外れているか（以前の版の画面もこの項目を見る）。
      return { channelId: id, title, status, removed: status !== "review" };
    },
    // 管理者：確認待ち・確定・戻したチャンネルの一覧。
    async list() {
      required();
      const doc = readDoc(await store.get(KEY));
      const rows = (group) => Object.entries(doc[group]).map(([channelId, v]) => ({ channelId, ...v })).sort((a, b) => String(b.lastAt || b.at || "").localeCompare(String(a.lastAt || a.at || "")));
      return { pending: rows("pending"), confirmed: rows("channels"), restored: rows("restored") };
    },
    // 管理者：確かめた結果。confirm＝停止を確定、restore＝掲載に戻す（確定したものを戻すこともできる）。
    async decide(channelId, { decision, note = "" } = {}) {
      required();
      if (!/^UC[\w-]{22}$/.test(String(channelId || "")) || !["confirm", "restore"].includes(decision)) throw new ApiError(400, "invalid_decision", "チャンネルIDと判断（confirm か restore）を送ってください。");
      const at = iso();
      return update((doc) => {
        const before = doc.pending[channelId] || doc.channels[channelId] || doc.restored[channelId];
        if (!before) throw new ApiError(404, "channel_not_requested", "このチャンネルへの申し込みはありません。");
        const title = before.title || "";
        delete doc.pending[channelId];
        if (decision === "confirm") { delete doc.restored[channelId]; doc.channels[channelId] = { title, at: before.at || at, confirmedAt: at, ...(note ? { note: clean(note, 500) } : {}) }; }
        else { delete doc.channels[channelId]; doc.restored[channelId] = { title, at: before.at || at, restoredAt: at, requests: 0, ...(note ? { note: clean(note, 500) } : {}) }; }
        return { channelId, status: decision === "confirm" ? "confirmed" : "restored" };
      });
    }
  };
}
