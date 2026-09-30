import { ApiError } from "./errors.js";

const METADATA_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";

export function createSyncStore(env = process.env, deps = {}) {
  if (env.SYNC_BUCKET) return createGcsSyncStore(env.SYNC_BUCKET, deps);
  if (env.SYNC_STORE === "memory") return createMemorySyncStore();
  return null;
}

// 料理写真の置き場（同期データとは別のオブジェクト）。
export function createPhotoStore(env = process.env, deps = {}) {
  if (env.SYNC_BUCKET) return createGcsSyncStore(env.SYNC_BUCKET, { ...deps, prefix: "room-photos" });
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
    },
    // 名前が start で始まるものを、名前の順に max 件ずつ。続きは next（最後なら ""）。
    async list(start, { pageToken = "", max = 1000 } = {}) {
      const names = [...rooms.keys()].filter((k) => k.startsWith(start) && k > pageToken).sort();
      const page = names.slice(0, max);
      return { names: page, next: names.length > max ? page[page.length - 1] : "" };
    },
    // 消す（ないものを消しても失敗にしない）。ifGeneration を渡すと、その版の時だけ消す。
    async remove(roomId, { ifGeneration } = {}) {
      const current = rooms.get(roomId)?.generation;
      if (current === undefined) return true;
      if (ifGeneration !== undefined && ifGeneration !== current) return false;
      rooms.delete(roomId);
      return true;
    }
  };
}

// Cloud Runのデフォルトサービスアカウントでオブジェクト rooms/<roomId>.json を読み書きする。
// ifGenerationMatch で同時書き込みを弾き、アプリ側のrevision照合とあわせて後勝ち消失を防ぐ。
export function createGcsSyncStore(bucket, { fetch = globalThis.fetch, prefix = "rooms" } = {}) {
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
    return encodeURIComponent(`${prefix}/${roomId}.json`);
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
      const params = new URLSearchParams({ uploadType: "media", name: `${prefix}/${roomId}.json` });
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
    },
    // 名前が start で始まるものを max 件ずつ（定期の後片付け用）。続きは next（最後なら ""）。
    async list(start, { pageToken = "", max = 1000 } = {}) {
      const token = await accessToken();
      const params = new URLSearchParams({ prefix: `${prefix}/${start}`, fields: "items(name),nextPageToken", maxResults: String(Math.min(1000, Math.max(1, max))) });
      if (pageToken) params.set("pageToken", pageToken);
      const response = await fetch(`https://storage.googleapis.com/storage/v1/b/${bucket}/o?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new ApiError(502, "sync_storage_failed", "保存データの一覧を取得できませんでした。");
      const body = await response.json();
      const names = (body.items || []).map((x) => String(x.name || "")).filter((n) => n.startsWith(`${prefix}/`) && n.endsWith(".json")).map((n) => n.slice(prefix.length + 1, -5));
      return { names, next: body.nextPageToken || "" };
    },
    // 消す（ないものを消しても失敗にしない）。ifGeneration を渡すと、その版の時だけ消す。
    async remove(roomId, { ifGeneration } = {}) {
      const token = await accessToken();
      const params = new URLSearchParams();
      if (ifGeneration !== undefined) params.set("ifGenerationMatch", String(ifGeneration));
      const response = await fetch(`https://storage.googleapis.com/storage/v1/b/${bucket}/o/${objectName(roomId)}${params.size ? `?${params}` : ""}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (response.status === 404) return true;
      if (response.status === 412) return false;
      if (!response.ok) throw new ApiError(502, "sync_storage_failed", "保存データを消せませんでした。");
      return true;
    }
  };
}
