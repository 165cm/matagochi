import { createHash, randomUUID } from "node:crypto";
import { ApiError } from "./errors.js";

// クライアントが合言葉から導出するSHA-256ハッシュ(hex)。合言葉そのものはサーバーへ送らない。
const ROOM_ID_PATTERN = /^[a-f0-9]{64}$/;

function assertStore(store) {
  if (!store) {
    throw new ApiError(503, "sync_not_configured", "この環境では同期機能が設定されていません。");
  }
}

function assertRoomId(roomId) {
  if (!ROOM_ID_PATTERN.test(String(roomId || ""))) {
    throw new ApiError(400, "invalid_room_id", "同期ルームIDの形式が正しくありません。");
  }
}

export async function getSyncRoom(store, roomId, { since = "" } = {}) {
  assertStore(store);
  assertRoomId(roomId);
  const entry = await store.get(roomId);
  if (!entry) return { found: false };
  // 手元と同じ版なら、中身は送らない（変わっていない時の通信をほぼゼロに）。
  if (since && since === entry.envelope.revision) return { found: true, unchanged: true, revision: entry.envelope.revision, updatedAt: entry.envelope.updatedAt };
  return {
    found: true,
    revision: entry.envelope.revision,
    updatedAt: entry.envelope.updatedAt,
    data: entry.envelope.data
  };
}

export async function putSyncRoom(store, roomId, body) {
  assertStore(store);
  assertRoomId(roomId);
  const data = body?.data;
  if (!data || typeof data !== "object" || Array.isArray(data) ||
    !Array.isArray(data.recipes) || !Array.isArray(data.evaluations)) {
    throw new ApiError(400, "invalid_sync_data", "同期データの形式が正しくありません。");
  }
  const baseRevision = typeof body.baseRevision === "string" ? body.baseRevision : "";
  const current = await store.get(roomId);
  const currentRevision = current?.envelope?.revision || "";
  if (baseRevision !== currentRevision) {
    throw new ApiError(409, "sync_conflict", "他の端末が先に保存しました。もう一度同期してください。");
  }
  // 古い版のアプリは、知らない項目（家族に見せる方針 sharedPolicies）を書き戻す時に落とす。
  // 項目ごとない時だけ、いまの値を引き継ぐ（新しい版は空でも必ず送るので、新しい版の変更はそのまま入る）。
  const previous = current?.envelope?.data;
  const kept = !Object.hasOwn(data, "sharedPolicies") && previous && typeof previous === "object" && Object.hasOwn(previous, "sharedPolicies")
    ? { ...data, sharedPolicies: previous.sharedPolicies }
    : data;
  const envelope = {
    revision: randomUUID(),
    updatedAt: new Date().toISOString(),
    data: kept
  };
  const result = await store.put(roomId, envelope, { ifGeneration: current ? current.generation : 0 });
  if (!result) {
    throw new ApiError(409, "sync_conflict", "他の端末が先に保存しました。もう一度同期してください。");
  }
  return { revision: envelope.revision, updatedAt: envelope.updatedAt };
}

// 料理写真は同期データから外し、ルームごとに1枚ずつ保存する（中身のSHA-256が名前）。
// 一度送った写真は、同期のたびに送り直さない。
const PHOTO_HASH = /^[a-f0-9]{64}$/;
const PHOTO_DATA = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
export const MAX_PHOTO_CHARS = 2_000_000;

export async function putSyncPhoto(store, roomId, hash, body) {
  assertStore(store);
  assertRoomId(roomId);
  const data = String(body?.data || "");
  if (!PHOTO_HASH.test(String(hash || "")) || data.length > MAX_PHOTO_CHARS || !PHOTO_DATA.test(data)) {
    throw new ApiError(400, "invalid_photo", "写真の形式が正しくありません。");
  }
  const actual = createHash("sha256").update(data).digest("hex");
  if (actual !== hash) throw new ApiError(400, "invalid_photo", "写真の内容が名前と一致しません。");
  const key = `${roomId}/${hash}`;
  if (!(await store.get(key))) await store.put(key, { data }, { ifGeneration: 0 });
  return { hash };
}

export async function getSyncPhoto(store, roomId, hash) {
  assertStore(store);
  assertRoomId(roomId);
  if (!PHOTO_HASH.test(String(hash || ""))) throw new ApiError(400, "invalid_photo", "写真の名前が正しくありません。");
  const entry = await store.get(`${roomId}/${hash}`);
  if (!entry) throw new ApiError(404, "photo_not_found", "写真が見つかりません。");
  return { data: entry.envelope.data };
}
