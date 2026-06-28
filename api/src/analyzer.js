import { GoogleGenAI } from "@google/genai";
import { ApiError } from "./errors.js";

export async function analyzeRecipeDescription(snippet, env = process.env) {
  const project = env.GOOGLE_CLOUD_PROJECT;
  if (!project) {
    throw new ApiError(500, "missing_google_cloud_project", "Google Cloudプロジェクトが設定されていません。");
  }

  const ai = new GoogleGenAI({
    vertexai: true,
    project,
    location: env.GOOGLE_CLOUD_LOCATION || "us-central1"
  });

  const model = env.GEMINI_MODEL || "gemini-2.5-flash";
  const response = await ai.models.generateContent({
    model,
    contents: buildPrompt(snippet),
    config: {
      temperature: 0.2,
      responseMimeType: "application/json"
    }
  });

  return parseJsonResponse(response.text || "");
}

function buildPrompt(snippet) {
  return `
あなたは家庭向けレシピメモ作成アシスタントです。
YouTube動画のタイトルと説明文から、材料メモと調理手順を日本語で抽出してください。

制約:
- 説明文にない材料や分量は推測しすぎないでください。
- 分量が不明な材料は amount を "適量" にしてください。
- category は "野菜", "肉", "魚", "卵・乳製品", "大豆・加工品", "主食", "缶詰", "調味料", "その他" のどれかにしてください。
- JSONのみを返してください。

返却JSON:
{
  "title": "家庭で保存する短いレシピ名",
  "ingredients": [{ "name": "材料名", "amount": "分量", "category": "分類" }],
  "steps": ["手順"],
  "tags": ["タグ"],
  "note": "自分用メモ候補"
}

タイトル:
${snippet.title || ""}

チャンネル:
${snippet.channelTitle || ""}

説明文:
${snippet.description || ""}
`.trim();
}

function parseJsonResponse(text) {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new ApiError(502, "gemini_invalid_json", "Geminiの解析結果をJSONとして読み取れませんでした。");
  }
}
