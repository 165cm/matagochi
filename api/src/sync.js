import { randomUUID } from "node:crypto";
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

export async function getSyncRoom(store, roomId) {
  assertStore(store);
  assertRoomId(roomId);
  const entry = await store.get(roomId);
  if (!entry) return { found: false };
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
  const envelope = {
    revision: randomUUID(),
    updatedAt: new Date().toISOString(),
    data
  };
  const result = await store.put(roomId, envelope, { ifGeneration: current ? current.generation : 0 });
  if (!result) {
    throw new ApiError(409, "sync_conflict", "他の端末が先に保存しました。もう一度同期してください。");
  }
  return { revision: envelope.revision, updatedAt: envelope.updatedAt };
}
