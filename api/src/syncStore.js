import { ApiError } from "./errors.js";

const METADATA_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";

export function createSyncStore(env = process.env, deps = {}) {
  if (env.SYNC_BUCKET) return createGcsSyncStore(env.SYNC_BUCKET, deps);
  if (env.SYNC_STORE === "memory") return createMemorySyncStore();
  return null;
}

// テストとローカル開発用。プロセスが終わるとデータは消える。
export function createMemorySyncStore() {
  const rooms = new Map();
  return {
    async get(roomId) {
      const entry = rooms.get(roomId);
      if (!entry) return null;
      return { envelope: entry.envelope, generation: entry.generation };
    },
    async put(roomId, envelope, { ifGeneration } = {}) {
      const current = rooms.get(roomId)?.generation ?? 0;
      if (ifGeneration !== undefined && ifGeneration !== current) return null;
      const generation = current + 1;
      rooms.set(roomId, { envelope, generation });
      return { generation };
    }
  };
}

// Cloud Runのデフォルトサービスアカウントでオブジェクト rooms/<roomId>.json を読み書きする。
// ifGenerationMatch で同時書き込みを弾き、アプリ側のrevision照合とあわせて後勝ち消失を防ぐ。
export function createGcsSyncStore(bucket, { fetch = globalThis.fetch } = {}) {
  let cachedToken = null;

  async function accessToken() {
    if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;
    const response = await fetch(METADATA_TOKEN_URL, { headers: { "Metadata-Flavor": "Google" } }).catch(() => null);
    if (!response?.ok) {
      throw new ApiError(502, "sync_auth_failed", "同期用ストレージの認証に失敗しました。");
    }
    const body = await response.json();
    cachedToken = {
      token: body.access_token,
      expiresAt: Date.now() + Math.max(0, (body.expires_in || 0) - 60) * 1000
    };
    return cachedToken.token;
  }

  function objectName(roomId) {
    return encodeURIComponent(`rooms/${roomId}.json`);
  }

  return {
    async get(roomId) {
      const token = await accessToken();
      const headers = { Authorization: `Bearer ${token}` };
      const base = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${objectName(roomId)}`;
      const metaResponse = await fetch(`${base}?fields=generation`, { headers });
      if (metaResponse.status === 404) return null;
      if (!metaResponse.ok) {
        throw new ApiError(502, "sync_storage_failed", "同期データの取得に失敗しました。");
      }
      const meta = await metaResponse.json();
      const mediaResponse = await fetch(`${base}?alt=media&generation=${meta.generation}`, { headers });
      if (!mediaResponse.ok) {
        throw new ApiError(502, "sync_storage_failed", "同期データの取得に失敗しました。");
      }
      return { envelope: await mediaResponse.json(), generation: Number(meta.generation) };
    },
    async put(roomId, envelope, { ifGeneration } = {}) {
      const token = await accessToken();
      const params = new URLSearchParams({ uploadType: "media", name: `rooms/${roomId}.json` });
      if (ifGeneration !== undefined) params.set("ifGenerationMatch", String(ifGeneration));
      const response = await fetch(
        `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?${params}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(envelope)
        }
      );
      if (response.status === 412) return null;
      if (!response.ok) {
        throw new ApiError(502, "sync_storage_failed", "同期データの保存に失敗しました。");
      }
      const meta = await response.json();
      return { generation: Number(meta.generation) };
    }
  };
}
