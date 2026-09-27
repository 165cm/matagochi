import { ApiError } from "./errors.js";
import { prepareImages } from "./imageImport.js";

// 作った料理の写真から、料理の腕前（★1〜5）をAIに見てもらう。写真は保存しない（判定したら捨てる）。
// 1家庭1日5枚まで。AIの1日の上限（全体）の中で動く。
export const PHOTO_JUDGES_PER_DAY = 5;
const MAX_IMAGE_BYTES = 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function normalizeJudgement(raw) {
  if (!raw || typeof raw !== "object") throw new ApiError(502, "invalid_photo_judgement", "写真を判定できませんでした。");
  if (raw.isFood === false) throw new ApiError(422, "not_food", "料理の写真が見つかりませんでした。作った料理が写っている写真を選んでください。");
  const text = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const level = Math.max(1, Math.min(5, Math.round(Number(raw.level)) || 1));
  return {
    dish: text(raw.dish, 40) || "手料理",
    level,
    techniques: Array.isArray(raw.techniques) ? raw.techniques.map((t) => text(t, 20)).filter(Boolean).slice(0, 4) : [],
    comment: text(raw.comment, 80),
  };
}

export function createSkillJudge(store, { judge, reserveBudget, now = Date.now } = {}) {
  return {
    async judge(body, household = "") {
      if (!store) throw new ApiError(503, "catalog_not_configured", "保存先が未設定です。");
      const image = body?.image;
      if (!TYPES.has(image?.mimeType) || typeof image.data !== "string" || image.data.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 || /[^A-Za-z0-9+/=]/.test(image.data)) {
        throw new ApiError(400, "invalid_image", "JPEG・PNG・WebPの写真を1MB以下で送ってください。");
      }
      const buffer = Buffer.from(image.data, "base64");
      if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw new ApiError(413, "image_too_large", "写真の容量が上限を超えています。");
      const dayKey = `skill-photo-quota/${new Date(now()).toISOString().slice(0, 10)}/${household || "anon"}`;
      const quota = await store.get(dayKey);
      const used = quota?.envelope.used || 0;
      if (used >= PHOTO_JUDGES_PER_DAY) throw new ApiError(429, "photo_quota", "今日の判定はここまでです。明日また試してください。");
      await store.put(dayKey, { used: used + 1 }, { ifGeneration: quota?.generation ?? 0 }).catch(() => {});
      const [prepared] = await prepareImages([{ buffer, mimeType: image.mimeType }]);
      await reserveBudget();
      return normalizeJudgement(await judge(prepared));
    }
  };
}
