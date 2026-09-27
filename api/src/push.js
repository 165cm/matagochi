import webpush from "web-push";
import { createHash } from "node:crypto";
import { ApiError } from "./errors.js";

// 通知（Web Push）。献立の予定は端末にあるので、端末が「この先2週間のお知らせ」を送ってきて、ここで時間どおりに届ける。
// 送る合図は GitHub Actions の定期実行（15分ごと）が /api/push/tick をノックする。何回呼ばれても、同じお知らせは1回だけ。
// 通知を送るための鍵（VAPID）は、はじめて使う時にサーバーが自分で作って保存する（人が鍵を扱わない）。
export const PUSH_MAX_ITEMS = 40;
const DAY = 86_400_000;
const LATE = 2 * 3600_000; // 2時間より遅れたお知らせは送らない
// 通知の送り先は、ブラウザの通知サービスだけ（ほかのURLへは送らない）。
const PUSH_HOSTS = /^(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[\w.-]+\.push\.apple\.com|[\w.-]+\.notify\.windows\.com)$/;
const keyOf = (endpoint) => createHash("sha256").update(endpoint).digest("hex").slice(0, 32);
const text = (v, n) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n) : "");

export function validSubscription(sub) {
  let url;
  try { url = new URL(sub?.endpoint); } catch { throw new ApiError(400, "invalid_subscription", "通知の登録情報が正しくありません。"); }
  if (url.protocol !== "https:" || !PUSH_HOSTS.test(url.hostname) || String(sub.endpoint).length > 800) throw new ApiError(400, "invalid_subscription", "この通知サービスには対応していません。");
  const p256dh = text(sub?.keys?.p256dh, 200), auth = text(sub?.keys?.auth, 100);
  if (!/^[\w-]+$/.test(p256dh) || !/^[\w-]+$/.test(auth)) throw new ApiError(400, "invalid_subscription", "通知の登録情報が正しくありません。");
  return { endpoint: String(sub.endpoint), keys: { p256dh, auth } };
}
export function cleanSchedule(raw, now = Date.now()) {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  return list.map((x) => ({ id: text(x?.id, 60), at: Date.parse(x?.at), title: text(x?.title, 60), body: text(x?.body, 160), url: /^[?#][\w\-=&%#.]*$/.test(x?.url || "") ? x.url : "" }))
    .filter((x) => x.id && x.title && Number.isFinite(x.at) && x.at > now - LATE && x.at < now + 21 * DAY && !seen.has(x.id) && seen.add(x.id))
    .sort((a, b) => a.at - b.at).slice(0, PUSH_MAX_ITEMS)
    .map((x) => ({ ...x, at: new Date(x.at).toISOString() }));
}

export function createPushDesk(store, { send = (sub, payload, options) => webpush.sendNotification(sub, payload, options), subject = "https://165cm.github.io/matagochi/", now = Date.now } = {}) {
  const required = () => { if (!store) throw new ApiError(503, "catalog_not_configured", "保存先が未設定です。"); };
  let vapid = null;
  async function keys() {
    if (vapid) return vapid;
    for (let i = 0; i < 4; i += 1) {
      const got = await store.get("push/vapid");
      if (got?.envelope?.publicKey) return (vapid = got.envelope);
      const made = webpush.generateVAPIDKeys();
      if (await store.put("push/vapid", made, { ifGeneration: got?.generation ?? 0 }).catch(() => null)) return (vapid = made);
    }
    throw new ApiError(503, "push_unavailable", "通知の準備ができませんでした。");
  }
  async function updateIndex(change) {
    for (let i = 0; i < 6; i += 1) {
      const got = await store.get("push/index");
      const list = new Set(got?.envelope?.subs || []);
      change(list);
      if (await store.put("push/index", { subs: [...list].slice(-5000) }, { ifGeneration: got?.generation ?? 0 }).catch(() => null)) return;
    }
  }
  async function deliver(doc, item) {
    const k = await keys();
    const payload = JSON.stringify({ title: item.title, body: item.body, url: item.url || "", tag: item.id });
    await send(doc.subscription, payload, { TTL: 7200, urgency: "normal", vapidDetails: { subject, publicKey: k.publicKey, privateKey: k.privateKey } });
  }
  return {
    async publicKey() { required(); return { publicKey: (await keys()).publicKey }; },
    // 登録と、この先のお知らせの更新（同じ端末なら上書き。送ったものは覚えておく）。
    async subscribe(body, household = "") {
      required();
      const subscription = validSubscription(body?.subscription);
      const key = keyOf(subscription.endpoint);
      const schedule = cleanSchedule(body?.schedule, now());
      for (let i = 0; i < 4; i += 1) {
        const got = await store.get(`push/subs/${key}`);
        const sent = (got?.envelope?.sent || []).filter((id) => schedule.some((x) => x.id === id));
        const doc = { subscription, household: text(household, 80), schedule, sent, updatedAt: new Date(now()).toISOString() };
        if (await store.put(`push/subs/${key}`, doc, { ifGeneration: got?.generation ?? 0 }).catch(() => null)) {
          if (!got?.envelope || got.envelope.deleted) await updateIndex((s) => s.add(key));
          return { ok: true, items: schedule.length };
        }
      }
      throw new ApiError(429, "push_busy", "混雑しています。");
    },
    async unsubscribe(body) {
      required();
      const key = keyOf(String(body?.endpoint || ""));
      const got = await store.get(`push/subs/${key}`);
      if (got) await store.put(`push/subs/${key}`, { deleted: true }, { ifGeneration: got.generation }).catch(() => {});
      await updateIndex((s) => s.delete(key));
      return { ok: true };
    },
    // テスト通知（1つの端末で1日3回まで）。
    async test(body) {
      required();
      const key = keyOf(String(body?.endpoint || ""));
      const got = await store.get(`push/subs/${key}`);
      if (!got?.envelope?.subscription) throw new ApiError(404, "not_subscribed", "通知がまだオンになっていません。");
      const day = new Date(now()).toISOString().slice(0, 10);
      const tests = got.envelope.tests?.day === day ? got.envelope.tests.n : 0;
      if (tests >= 3) throw new ApiError(429, "push_test_quota", "テストは今日はここまでです。");
      await store.put(`push/subs/${key}`, { ...got.envelope, tests: { day, n: tests + 1 } }, { ifGeneration: got.generation }).catch(() => {});
      await deliver(got.envelope, { id: `test-${now()}`, title: "🔔 リピごち", body: "通知が届きました。献立を決める日や、今夜の一品をお知らせします。", url: "" })
        .catch((error) => { throw new ApiError(502, "push_failed", `通知を送れませんでした（${error?.statusCode || "?"}）。`); });
      return { ok: true };
    },
    // 定期実行：時間になったお知らせを送る。4分以内に呼ばれたら何もしない。
    async tick() {
      required();
      const t = now();
      const last = await store.get("push/tick");
      if (last && t - Date.parse(last.envelope.at) < 4 * 60_000) return { skipped: true };
      if (!(await store.put("push/tick", { at: new Date(t).toISOString() }, { ifGeneration: last?.generation ?? 0 }).catch(() => null))) return { skipped: true };
      const subs = (await store.get("push/index"))?.envelope?.subs || [];
      let sent = 0, gone = 0;
      for (const key of subs) {
        const got = await store.get(`push/subs/${key}`);
        const doc = got?.envelope;
        if (!doc?.subscription) continue;
        const due = (doc.schedule || []).filter((x) => !doc.sent?.includes(x.id) && Date.parse(x.at) <= t && Date.parse(x.at) > t - LATE);
        if (!due.length) continue;
        // 同じ端末に一度にたくさん届かないよう、いちばん新しい1つだけ送り、ほかは送ったことにする。
        const item = due[due.length - 1];
        let dead = false;
        await deliver(doc, item).then(() => { sent += 1; }).catch((error) => { if ([404, 410].includes(error?.statusCode)) dead = true; });
        if (dead) { gone += 1; await store.put(`push/subs/${key}`, { deleted: true }, { ifGeneration: got.generation }).catch(() => {}); await updateIndex((s) => s.delete(key)); continue; }
        await store.put(`push/subs/${key}`, { ...doc, sent: [...(doc.sent || []), ...due.map((x) => x.id)].slice(-80) }, { ifGeneration: got.generation }).catch(() => {});
      }
      return { sent, gone, subs: subs.length };
    }
  };
}
