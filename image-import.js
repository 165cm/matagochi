/* Images stay in this page's memory, never in the recipe state or backup. */
class RecipeImageSession {
  constructor() {
    this.images = [];
    this.busy = false;
    this.preparing = false;
    this.controller = null;
    this.version = 0;
  }
  async add(files) {
    if (this.busy || this.preparing) throw new Error("処理が終わってから画像を追加してください。");
    if (!files.length || files.length + this.images.length > 5) throw new Error("画像は合計5枚まで選べます。");
    this.preparing = true;
    const version = this.version;
    try {
      const next = [];
      for (const file of files) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error("JPEG・PNG・WebPを1枚10MB以下で選んでください。HEICはJPEGへ変換してください。");
        const bitmap = await createImageBitmap(file);
        try {
          if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 25_000_000) throw new Error("画像の解像度が大きすぎます。縮小してから選んでください。");
          const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
          canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
          if (dataUrl.length > 1_300_000) throw new Error("縮小後も画像が大きすぎます。必要な部分を切り取ってください。");
          next.push({ data: dataUrl.split(",")[1], mimeType: "image/jpeg", preview: dataUrl });
        } finally { bitmap.close(); }
      }
      if (version === this.version) this.images.push(...next);
    } catch (error) {
      throw new Error(error.message || "画像を読み込めませんでした。");
    } finally { this.preparing = false; }
  }
  remove(index) {
    if (!this.busy && !this.preparing) { this.images.splice(index, 1); this.version++; }
  }
  move(index, delta) {
    if (this.busy || this.preparing) return;
    const next = index + delta;
    if (next < 0 || next >= this.images.length) return;
    [this.images[index], this.images[next]] = [this.images[next], this.images[index]];
    this.version++;
  }
  cancel() {
    this.version++;
    this.controller?.abort();
    this.controller = null;
    this.busy = false;
  }
  clear() { this.cancel(); this.images = []; }
  key() {
    // Session key is not sent to the model, logged, synchronized or backed up.
    if (this.clientKey) return this.clientKey;
    try { this.clientKey = sessionStorage.getItem("matagochi-image-session-v1"); } catch {}
    if (!/^[a-f0-9]{64}$/.test(this.clientKey || "")) {
      this.clientKey = [...crypto.getRandomValues(new Uint8Array(32))].map(byte => byte.toString(16).padStart(2, "0")).join("");
      try { sessionStorage.setItem("matagochi-image-session-v1", this.clientKey); } catch {}
    }
    return this.clientKey;
  }
  async analyze(apiBase) {
    if (this.busy || this.preparing || !this.images.length) throw new Error("画像を選び、準備が終わってから解析してください。");
    if (!apiBase) throw new Error("画像解析APIが未設定です。手動入力をご利用ください。");
    this.busy = true;
    const version = this.version;
    const controller = new AbortController();
    this.controller = controller;
    const timeout = setTimeout(() => controller.abort(), 75_000);
    try {
      const response = await fetch(`${apiBase}/api/import/images`, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ clientKey: this.key(), images: this.images.map(({mimeType, data}) => ({mimeType, data})) })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(result.error?.message || "画像解析に失敗しました。手動入力も利用できます。"), {code:result.error?.code || `http_${response.status}`});
      if (!Array.isArray(result.ingredients) || !Array.isArray(result.steps)) throw Object.assign(new Error("解析結果を読み込めませんでした。画像を残したまま、もう一度お試しください。"), {code:"invalid_response"});
      if (version !== this.version) return null;
      return result;
    } catch (error) {
      if (error instanceof TypeError) throw Object.assign(new Error("通信が途切れました。接続を確認して、同じ画像でもう一度お試しください。"), {code:"network_error"});
      throw error;
    } finally {
      clearTimeout(timeout);
      if (this.controller === controller) { this.controller = null; this.busy = false; }
    }
  }
}
globalThis.RecipeImageSession = RecipeImageSession;
