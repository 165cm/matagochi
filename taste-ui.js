/* Preference answers remain personal and local; sharing is initiated explicitly. */
function renderTasteQuiz() {
  const votes = FoodTaste.normalize(profileDraft().tasteVotes);
  const card = FoodTaste.deck.find((c) => !votes.some((v) => v.id === c.id));
  if (!card) {
    const result = FoodTaste.result(votes);
    return `<div class="taste-result" aria-live="polite"><span class="taste-result-emoji" aria-hidden="true">${result.emoji}</span><p>あなたの夜ごはんタイプ</p><h3>${result.title}</h3><p>${result.description}</p><p class="muted small">選んだ料理からの傾向です。気分が変わっても大丈夫。</p>${result.likes.length ? `<p class="taste-liked">😋 ${result.likes.map((c) => c.title).join("・")}</p>` : ""}<button type="button" class="primary-button" id="taste-share">診断をシェア ↗</button><button type="button" class="text-button" id="taste-download">画像を保存</button><p id="taste-share-status" role="status"></p><button type="button" class="text-button" id="taste-retry">もう一度選ぶ</button><button type="button" class="text-button" id="taste-undo">ひとつ戻す</button></div>`;
  }
  return `<div class="taste-quiz"><p class="taste-caption"><span>直感で選ぼう 😋</span><span>${votes.length + 1} / ${FoodTaste.deck.length}</span></p><div class="taste-card" id="taste-card" tabindex="0" role="group" aria-label="${card.title}。左右の矢印キーでも選べます"><img src="${card.image}" alt="${card.title}の料理イメージ" draggable="false"><div class="taste-card-title"><small>今夜、食べたい？</small><h3>${card.title}</h3></div></div><div class="taste-actions"><button type="button" data-taste-vote="pass">← 今は違う</button><button type="button" data-taste-vote="like">食べたい 💛 →</button></div><div class="taste-secondary"><button type="button" class="text-button" id="taste-undo" ${votes.length ? "" : "disabled"}>↶ 戻す</button><button type="button" class="text-button" data-taste-vote="skip">わからない</button></div><p class="muted small">左右にスワイプ · 写真は料理のイメージ</p></div>`;
}
function bindTasteQuiz() {
  const p = profileDraft();
  let committed = false;
  const refresh = () => {
    saveState({ scheduleSync: false });
    render();
    document
      .querySelector("#taste-card, #taste-share")
      ?.focus({ preventScroll: true });
  };
  const vote = (value) => {
    if (committed) return;
    const card = FoodTaste.deck.find(
      (c) => !p.tasteVotes.some((v) => v.id === c.id),
    );
    if (!card) return;
    committed = true;
    p.tasteVotes.push({ id: card.id, vote: value });
    refresh();
  };
  document
    .querySelectorAll("[data-taste-vote]")
    .forEach((el) =>
      el.addEventListener("click", () => vote(el.dataset.tasteVote)),
    );
  document.querySelector("#taste-undo")?.addEventListener("click", () => {
    p.tasteVotes.pop();
    refresh();
  });
  document.querySelector("#taste-retry")?.addEventListener("click", () => {
    p.tasteVotes = [];
    refresh();
  });
  document
    .querySelector("#taste-share")
    ?.addEventListener("click", () => shareTasteResult(false));
  document
    .querySelector("#taste-download")
    ?.addEventListener("click", () => shareTasteResult(true));
  const card = document.querySelector("#taste-card");
  if (!card) return;
  card.querySelector("img").addEventListener("error", () => {
    card.classList.add("image-unavailable");
  });
  card.addEventListener("keydown", (e) => {
    if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
      e.preventDefault();
      vote(e.key === "ArrowRight" ? "like" : "pass");
    }
  });
  let start = null;
  card.addEventListener("pointerdown", (e) => {
    if (!e.isPrimary || e.button !== 0) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    card.setPointerCapture(e.pointerId);
  });
  card.addEventListener("pointermove", (e) => {
    if (!start || e.pointerId !== start.id) return;
    const x = e.clientX - start.x,
      y = e.clientY - start.y;
    if (Math.abs(y) > 35 && Math.abs(y) > Math.abs(x)) {
      start = null;
      card.style.transform = "";
      return;
    }
    card.style.transform = `translateX(${Math.max(-65, Math.min(65, x))}px) rotate(${Math.max(-5, Math.min(5, x / 20))}deg)`;
  });
  card.addEventListener("pointerup", (e) => {
    if (!start) return;
    const x = e.clientX - start.x,
      y = e.clientY - start.y;
    start = null;
    card.style.transform = "";
    if (Math.abs(x) > 65 && Math.abs(x) > Math.abs(y) * 1.4)
      vote(x > 0 ? "like" : "pass");
  });
  card.addEventListener("pointercancel", () => {
    start = null;
    card.style.transform = "";
  });
}
async function shareTasteResult(downloadOnly = false) {
  const button = document.querySelector("#taste-share"),
    status = document.querySelector("#taste-share-status");
  if (!button || button.disabled) return;
  button.disabled = true;
  try {
    const r = FoodTaste.result(profileDraft().tasteVotes);
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f8f1e6";
    ctx.fillRect(0, 0, 1080, 1350);
    ctx.textAlign = "center";
    ctx.fillStyle = "#325c47";
    ctx.font = "bold 44px sans-serif";
    ctx.fillText("わたしの夜ごはんタイプ", 540, 200);
    ctx.font = "150px sans-serif";
    ctx.fillText(r.emoji, 540, 430);
    ctx.font = "bold 64px sans-serif";
    ctx.fillText(r.title, 540, 590, 940);
    ctx.font = "32px sans-serif";
    ctx.fillText("あなたは何系？ 8皿で見つける食の好み", 540, 820, 940);
    ctx.fillText("選んだ料理からの傾向です", 540, 890);
    ctx.font = "bold 42px sans-serif";
    ctx.fillText("リピごち", 540, 1090);
    ctx.font = "30px sans-serif";
    ctx.fillText("165cm.github.io/matagochi/?quiz=1", 540, 1160);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) throw new Error("image");
    const file = new File([blob], "my-dinner-type.png", { type: "image/png" });
    const text = `わたしは「${r.title}」でした！あなたは何系？`;
    if (!downloadOnly && navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: "夜ごはんタイプ診断",
        text,
        url: "https://165cm.github.io/matagochi/?quiz=1",
      });
      status.textContent = "共有しました";
    } else {
      const url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      status.textContent = "共有用の画像を保存しました。SNSへ添付できます。";
    }
  } catch (error) {
    status.textContent =
      error.name === "AbortError"
        ? "共有をキャンセルしました"
        : "共有できませんでした。「画像を保存」から保存してお試しください。";
  } finally {
    button.disabled = false;
  }
}
