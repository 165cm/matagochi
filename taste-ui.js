/* Preference answers remain personal and local; sharing is initiated explicitly. */
/* 好きな味：料理名の写真12枚（taste.js の IDEAL・2026-10-28 から）。ごはん方針と、詳しい設定の「好み」で同じ画面・同じ答え。 */
// 写真は、新着のうちその料理名の作り方の写真（読み出すだけ）。まだなければ絵文字。
function dishPickPhoto(d) {
  const list = typeof discoverRecipes === "function" ? discoverRecipes() : [];
  return list.find((r) => r.thumbnailUrl && FoodTaste.dishOf(r) === d)?.thumbnailUrl || "";
}
// attrs(d)：ボタンにつける data-*（押した時の操作）。picked：いま選んでいる料理の id。
function renderDishPickGrid(picked, attrs) {
  const on = new Set(picked || []);
  return `<div class="dp-grid" role="group" aria-label="食べたい料理">${FoodTaste.IDEAL.map((d) => {
    const photo = dishPickPhoto(d);
    return `<button type="button" class="dp-tile" ${attrs(d)} aria-pressed="${on.has(d.id)}"><span class="dp-photo">${photo ? `<img src="${escapeAttr(photo)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="dp-emoji" aria-hidden="true">${d.emoji}</span>`}<i class="pick-check" aria-hidden="true"></i></span><span class="dp-name">${escapeHtml(d.label)}</span></button>`;
  }).join("")}</div>`;
}
// まだ選んでいない人に、以前の答え（8枚の写真・「よく食べたい味」・お店の系統）から先に選んでおく料理。
// もう選んでいる人は、その料理（ごはん方針の答えがまだない時に使う）。
function dishPickSuggest(p = profileDraft()) {
  if (p.dishPicksAt) return FoodTaste.normalizePicks(p.dishPicks);
  const talk = typeof talkProfile === "function" ? ProfileTalk.answersOf(talkProfile(), talkWho()) : {};
  return FoodTaste.fromOld({ tasteVotes: p.tasteVotes, talkTastes: talk.taste, tastes: p.tastes });
}
// 選んだ料理を、設定の好み（献立の加点に使う）とごはん方針の答えの両方に入れる。空にしたら、以前の答えに戻る。
function saveDishPicks(ids, { talk = true } = {}) {
  const picks = FoodTaste.normalizePicks(ids), at = nowIso();
  for (const p of [state.foodProfile, state.onboardingDraft].filter(Boolean)) {
    p.dishPicks = picks;
    if (picks.length) p.dishPicksAt = at; else delete p.dishPicksAt;
  }
  if (talk && typeof talkProfile === "function") {
    const who = talkWho(), tp = talkProfile();
    talkSet(picks.length ? ProfileTalk.answer(tp, { member: who, q: "dishes", value: picks, at }) : { ...tp, answers: tp.answers.filter((x) => !(x.member === who && x.q === "dishes")) });
  }
  trackDaily("dish_picks", { n: picks.length });
}
// 詳しい設定の「好み」：まず写真12枚 → 決めたら「迷ったら、どっち？」（ごはんタイプ）。
let dishPickDraft = null;
function renderTasteQuiz() {
  const p = profileDraft();
  if (!p.dishPicksAt || dishPickDraft) {
    if (!dishPickDraft) dishPickDraft = p.dishPicks?.length ? [...p.dishPicks] : dishPickSuggest(p);
    const hint = !p.dishPicksAt && dishPickDraft.length ? `<p class="muted small">以前の答えから選んでおきました。変えられます</p>` : "";
    return `<div class="taste-quiz dp-picks"><p class="small">食べたい料理を、いくつでも</p>${hint}${renderDishPickGrid(dishPickDraft, (d) => `data-dish-pick="${d.id}"`)}<p class="muted small">選んだ料理と、似た味の料理を献立に多めに出します</p><button type="button" class="secondary-button full-button" id="dish-picks-done" ${dishPickDraft.length ? "" : "disabled"}>${dishPickDraft.length}品で決定して、ごはんタイプの質問へ</button></div>`;
  }
  const answers = DinnerPersona.normalize(p.dinnerPriorities);
  const question = DinnerPersona.questions.find((q) => !answers.some((a) => a.id === q.id));
  if (question) return renderPriorityQuestion(question, answers.length);
  const result = DinnerPersona.result(answers);
  return renderPersonaResult(result, FoodTaste.normalizePicks(p.dishPicks).map((id) => FoodTaste.IDEAL_OF[id]).map((d) => ({ title: d.label, image: dishPickPhoto(d), emoji: d.emoji })));
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
  document.querySelectorAll("[data-dish-pick]").forEach((el) =>
    el.addEventListener("click", () => {
      const id = el.dataset.dishPick;
      dishPickDraft = dishPickDraft.includes(id) ? dishPickDraft.filter((x) => x !== id) : [...dishPickDraft, id];
      refresh();
    }),
  );
  document.querySelector("#dish-picks-done")?.addEventListener("click", () => {
    if (!dishPickDraft?.length) return;
    saveDishPicks(dishPickDraft);
    dishPickDraft = null;
    refresh();
  });
  const vote = (value) => {
    if (committed) return;
    const question = DinnerPersona.questions.find(
      (q) => !p.dinnerPriorities.some((a) => a.id === q.id),
    );
    if (!question) return;
    p.dinnerPriorities.push({
      id: question.id,
      choice: { pass: "left", like: "right", skip: "skip", equal: "equal" }[
        value
      ],
    });
    committed = true;
    refresh();
  };
  document
    .querySelectorAll("[data-taste-vote]")
    .forEach((el) =>
      el.addEventListener("click", () => vote(el.dataset.tasteVote)),
    );
  document.querySelector("#taste-undo")?.addEventListener("click", () => {
    // 最初の「どっち？」から戻ると、写真12枚（選んだまま直せる）。
    if (p.dinnerPriorities.length) p.dinnerPriorities.pop();
    else dishPickDraft = [...(p.dishPicks || [])];
    refresh();
  });
  document.querySelector("#taste-retry")?.addEventListener("click", () => {
    dishPickDraft = [...(p.dishPicks || [])];
    p.dinnerPriorities = [];
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
  card.querySelector("img")?.addEventListener("error", () => {
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
    const r = DinnerPersona.result(profileDraft().dinnerPriorities);
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext("2d");
    if (!ctx.roundRect) ctx.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); };
    const font = (w, px) => `${w} ${px}px "Zen Maru Gothic", "Hiragino Maru Gothic ProN", sans-serif`;
    ctx.fillStyle = "#fff8ee";
    ctx.fillRect(0, 0, 1080, 1350);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(60, 60, 960, 1230, 48);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.fillStyle = "#8a7968";
    ctx.font = font(700, 40);
    ctx.fillText("わたしの ごはんタイプは…", 540, 150);
    const character = document.querySelector(".persona-portrait");
    try {
      if (!character) throw new Error("none");
      await character.decode();
      ctx.drawImage(character, 360, 180, 360, 360);
    } catch {
      ctx.font = "200px sans-serif";
      ctx.fillText(r.emoji, 540, 440);
    }
    ctx.fillStyle = "#e0573a";
    ctx.font = font(900, 84);
    ctx.fillText(r.title, 540, 640, 900);
    ctx.fillStyle = "#2b2420";
    ctx.font = font(700, 38);
    ctx.fillText(`「${r.description}」`, 540, 715, 900);
    ctx.textAlign = "left";
    ctx.font = font(700, 40);
    r.features.forEach(([icon, text], i) => {
      const y = 810 + i * 92;
      ctx.fillStyle = "#fff1dc";
      ctx.beginPath();
      ctx.roundRect(130, y - 56, 820, 76, 38);
      ctx.fill();
      ctx.fillStyle = "#2b2420";
      ctx.fillText(`${icon}  ${text}`, 165, y, 760);
    });
    ctx.textAlign = "center";
    ctx.fillStyle = "#e0573a";
    ctx.font = font(900, 44);
    ctx.fillText("あなたは何タイプ？ 1分でわかる", 540, 1140, 900);
    ctx.fillStyle = "#8a7968";
    ctx.font = font(700, 32);
    ctx.fillText("リピごち ｜ 165cm.github.io/matagochi/?quiz=1", 540, 1210, 900);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) throw new Error("image");
    const file = new File([blob], "my-gohan-type.png", { type: "image/png" });
    const text = `わたしのごはんタイプは「${r.title}」でした！${r.features.map((f) => f[0]).join("")} あなたは何タイプ？`;
    if (!downloadOnly && navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: "ごはんの好み診断",
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

function renderPriorityQuestion(q, count) {
  return `<div class="taste-quiz"><p class="taste-caption"><span>後半：迷ったら、どっち？</span><span>${count + 1} / 9</span></p><div class="taste-card priority-card" id="taste-card" tabindex="0" role="group" aria-label="${q.title}。左は${q.left}。右は${q.right}"><span aria-hidden="true">${{ joy: "😋", budget: "🛒", effort: "⏱️" }[q.axis]}</span><h3>${q.title}</h3><div class="priority-options"><p>← ${q.left}</p><p>${q.right} →</p></div></div><div class="taste-actions"><button type="button" data-taste-vote="pass">← ${q.left}</button><button type="button" data-taste-vote="like">${q.right} →</button></div><div class="taste-secondary"><button type="button" class="text-button" id="taste-undo">↶ 戻す</button><button type="button" class="text-button" data-taste-vote="equal">同じくらい大事</button><button type="button" class="text-button" data-taste-vote="skip">保留</button></div><p class="muted small">優劣はありません · 左右スワイプでも回答</p></div>`;
}
function renderPersonaResult(r, likes) {
  const known = Boolean(DinnerPersona.characters[r.code]);
  const liked = likes.slice(0, 3);
  return `<div class="taste-result persona-card" aria-live="polite">
    <p class="persona-kicker">わたしの ごはんタイプは…</p>
    ${known ? `<img class="persona-portrait" src="assets/persona/${r.code}.webp" alt="${r.title}のキャラクター">` : `<span class="taste-result-emoji" aria-hidden="true">${r.emoji}</span>`}
    <h3 class="persona-name">${r.title}</h3>
    <p class="persona-catch">「${r.description}」</p>
    ${r.features.length ? `<ul class="persona-features">${r.features.map(([icon, text]) => `<li><span aria-hidden="true">${icon}</span>${text}</li>`).join("")}</ul>` : ""}
    <p class="persona-operation"><b>好きそうな料理</b>${r.operation}</p>
    ${liked.length ? `<div class="persona-likes">${liked.map((c) => `<figure>${c.image ? `<img src="${escapeAttr(c.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="dp-emoji" aria-hidden="true">${c.emoji || "🍽️"}</span>`}<figcaption>${escapeHtml(c.title)}</figcaption></figure>`).join("")}</div>` : ""}
    <p class="persona-conversation">💬 ${r.conversation}</p>
    <button type="button" class="primary-button" id="taste-share">画像でシェアする ↗</button><button type="button" class="text-button" id="taste-download">画像を保存</button><p id="taste-share-status" role="status"></p>
    ${renderPersonaMatrix(r.code)}
    <details class="persona-details"><summary>くわしい判定と献立への反映</summary>${r.dimensions.map((d) => `<p>${d.name}：${d.pole === "?" ? "回答不足" : d.pole === "=" ? "どちらも" : d.pole === "L" ? d.left : d.right}（${d.count}問）</p>`).join("")}<p>各軸3問、合計がマイナスなら左、プラスなら右、0なら「どちらも」。写真の好み・時短・常備品の活用を献立の加点に使います。食材制限と調理時間を優先します。</p></details>
    <p class="muted small">ふだんの好みの傾向です。性格や健康状態の判定ではありません。</p>
    <button type="button" class="text-button" id="taste-retry">もう一度選ぶ</button><button type="button" class="text-button" id="taste-undo">ひとつ戻す</button></div>`;
}
function renderPersonaMatrix(current) {
  return `<details class="persona-details"><summary>全8タイプのマトリックス</summary>${[
    "L",
    "R",
  ]
    .map(
      (effort) =>
        `<table class="persona-matrix"><caption>${effort === "L" ? "⏱️ 時短派" : "🍳 ひと手間派"}</caption><thead><tr><th scope="col">買い物 ＼ 満足</th><th scope="col">味</th><th scope="col">彩り</th></tr></thead><tbody>${[
          "L",
          "R",
        ]
          .map(
            (budget) =>
              `<tr><th scope="row">${budget === "L" ? "節約" : "栄養バランス"}</th>${[
                "L",
                "R",
              ]
                .map((joy) => {
                  const code = joy + budget + effort,
                    c = DinnerPersona.characters[code];
                  return `<td ${code === current ? 'aria-current="true"' : ""}><img src="assets/persona/${code}.webp" alt="" loading="lazy"><span>${c[0]}</span>${code === current ? "<strong>あなた</strong>" : ""}</td>`;
                })
                .join("")}</tr>`,
          )
          .join("")}</tbody></table>`,
    )
    .join("")}</details>`;
}
