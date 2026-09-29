/* 💬 わが家のごはん方針（APP_MAP §37）：答える → 解釈を確かめる → 最初の提案。
   データと規則は profile-talk.js（ProfileTalk）。ここは画面と操作だけ。
   - 途中で閉じても続きから（state.tasteProfile.session）。今までの人に、強制ではやり直させない。
   - この版はAIを使わない（画面にもそう書く）。答えは端末の中だけ。家族の同期にも入れない。 */
function talkProfile() {
  if (!state.tasteProfile || state.tasteProfile.v !== ProfileTalk.VERSION) state.tasteProfile = ProfileTalk.normalize(state.tasteProfile);
  return state.tasteProfile;
}
const talkWho = () => (typeof me === "function" && me()) || "わたし";
function talkSession() {
  const p = talkProfile();
  if (!p.session) p.session = { member: talkWho(), stage: "ask", confirmId: "", q: "", startedAt: nowIso(), updatedAt: nowIso() };
  return p.session;
}
// ProfileTalk の関数は新しい入れ物を返す。会話の状態（session）は同じものを持ち回す。
function talkSet(next) {
  if (next.session) next.session.updatedAt = nowIso();
  state.tasteProfile = next;
}
let talkEcho = "";
function openTalk(stage = "") {
  const p = talkProfile();
  const fresh = !p.session;
  const s = talkSession();
  if (fresh) trackDaily("talk_started");
  // 前に「あとで」にした質問は、開き直すたびにまた聞く（続きからの時も）。書いたひとことは、書きかけとして戻す。
  const later = p.answers.filter((x) => x.member === s.member && x.value === ProfileTalk.LATER);
  later.filter((x) => x.text).forEach((x) => { s.notes = { ...(s.notes || {}), [x.q]: x.text }; });
  if (later.length) p.answers = p.answers.filter((x) => !later.includes(x));
  if (stage) s.stage = stage;
  // 前に保存した方針があり、聞くことが残っていなければ、確認の画面から。
  else if (fresh) s.stage = p.snapshots.some((x) => x.member === s.member) && !ProfileTalk.nextQuestion(p, s.member) ? "check" : "ask";
  // 続きから：聞くことが戻ってきたら、質問の画面へ（聞き返しの途中なら、そのまま）。
  else if (later.length && s.stage !== "confirm") { s.stage = "ask"; s.q = ""; }
  state.view = "talk";
}
// 今のメンバーで、次に聞く質問。「戻る」や「直す」で選んだ質問があれば、それを先に。
function talkQuestion() {
  const p = talkProfile(), s = talkSession();
  if (ProfileTalk.isQuestion(s.q) && ProfileTalk.asked(p, s.member).some((q) => q.id === s.q)) return ProfileTalk.QUESTION[s.q];
  return ProfileTalk.nextQuestion(p, s.member);
}
const talkTip = () => tip("この版はAIを使っていません。答えから決まったルールで読み取ります。答えと書いたことは、この端末の中だけに保存（家族にも共有しません。バックアップの書き出しには入ります）");
function talkHeader(extra = "") {
  const s = talkSession();
  return `<p class="talk-meta"><span>👤 ${escapeHtml(s.member)}の答え</span>${extra}${talkTip()}</p>`;
}
function renderTalk() {
  const p = talkProfile(), s = talkSession();
  const stage = s.stage;
  if (stage === "confirm" && ProfileTalk.isLean(s.confirmId)) return renderTalkConfirm();
  if (stage === "check") return renderTalkCheck();
  if (stage === "suggest") return renderTalkSuggest();
  const q = talkQuestion();
  if (!q) { s.stage = "check"; return renderTalkCheck(); }
  const a = ProfileTalk.answersOf(p, s.member);
  const list = ProfileTalk.asked(p, s.member);
  const n = list.findIndex((x) => x.id === q.id) + 1;
  const current = a[q.id];
  const picked = (v) => (Array.isArray(current) ? current.includes(v) : current === v);
  const picks = q.choices(a).map(([v, icon, label]) => `<button type="button" class="funnel-pick" data-action="${q.multi ? "life-talk-toggle" : "life-talk-pick"}" data-q="${q.id}" data-value="${v}" aria-pressed="${picked(v)}"><span class="fp-icon" aria-hidden="true">${icon}</span>${escapeHtml(label)}</button>`).join("");
  const note = s.notes?.[q.id] ?? (p.answers.find((x) => x.member === s.member && x.q === q.id)?.text || "");
  const answered = Object.keys(a).length;
  const keep = s.q && current !== undefined && current !== ProfileTalk.LATER;
  return `<section class="hero-card talk-card" data-stage="ask" aria-labelledby="talk-q">
    ${talkHeader(`<span>質問 ${n} / ${list.length}</span>`)}
    ${talkEcho ? `<p class="funnel-echo" role="status">💬 ${escapeHtml(talkEcho)}</p>` : ""}
    <h2 id="talk-q" tabindex="-1">${escapeHtml(q.ask(a))}</h2>
    <div class="funnel-picks talk-picks" role="group" aria-label="${escapeAttr(q.ask(a))}">${picks}</div>
    ${q.multi ? `<button type="button" class="primary-button full-button" data-action="life-talk-multi-done" data-q="${q.id}" ${Array.isArray(current) && current.length ? "" : "disabled"}>これで決定</button>` : ""}
    <details class="talk-note" ${note ? "open" : ""}><summary>✍️ ひとこと書く（任意）</summary><label class="sr-only" for="talk-text">ひとこと</label><textarea id="talk-text" class="input" data-q="${q.id}" maxlength="200" rows="2" placeholder="例：骨がこわくて、子どもに出しにくい">${escapeHtml(note)}</textarea><p class="muted small">端末の中だけに保存します</p></details>
    <div class="talk-skip">${keep ? `<button type="button" class="text-button" data-action="life-talk-keep">このままでいい</button>` : ""}<button type="button" class="text-button" data-action="life-talk-pick" data-q="${q.id}" data-value="${ProfileTalk.IDK}">わからない</button><button type="button" class="text-button" data-action="life-talk-pick" data-q="${q.id}" data-value="${ProfileTalk.LATER}">あとで</button></div>
    <div class="wizard-footer"><button type="button" class="text-button" data-action="life-talk-back" ${n <= 1 ? "disabled" : ""}>戻る</button>${answered ? `<button type="button" class="secondary-button" data-action="life-talk-check">ここまでで確かめる ›</button>` : ""}</div>
    <div class="wizard-secondary"><button type="button" class="text-button" data-action="life-talk-close">保存して閉じる</button></div>
  </section>`;
}
// 答えから生まれた推測を、その場で聞き返す（例：魚は好きだけど片付けが大変 → 蒸し料理を入れてみる？）。
function renderTalkConfirm() {
  const s = talkSession();
  const lean = ProfileTalk.LEANS[s.confirmId];
  return `<section class="hero-card talk-card" data-stage="confirm" aria-labelledby="talk-ask">
    ${talkHeader()}
    <p class="talk-bubble" id="talk-ask">💬 ${escapeHtml(lean.ask || lean.label)}</p>
    <div class="talk-yesno"><button type="button" class="primary-button" data-action="life-talk-decide" data-id="${s.confirmId}" data-status="confirmed">👍 合ってる</button><button type="button" class="secondary-button" data-action="life-talk-decide" data-id="${s.confirmId}" data-status="rejected">✎ 少し違う</button></div>
    <div class="wizard-secondary"><button type="button" class="text-button" data-action="life-talk-decide" data-id="${s.confirmId}" data-status="guess">あとで決める</button></div>
  </section>`;
}
// 状態は押したボタン（aria-pressed）で見せる。文字で出すのは、まだ決めていない「推測」だけ。
const TALK_STATUS = { guess: "推測" };
function talkAnswerLabel(q, value, a) {
  if (value === ProfileTalk.IDK) return "わからない";
  if (value === ProfileTalk.LATER) return "あとで";
  const all = q.id === "why" ? Object.values(ProfileTalk.WHY).flat() : q.choices(a);
  return (Array.isArray(value) ? value : [value]).map((v) => all.find((c) => c[0] === v)?.[2] || v).join("・");
}
// 解釈の確認：「本人が言ったこと（答え）」「推測」「確かめたこと」「設定のまま変わらないこと」を分けて見せる。
function renderTalkCheck() {
  const p = talkProfile(), s = talkSession();
  const items = ProfileTalk.interpret(p, s.member, dailyProfile());
  const open = items.filter((x) => !x.locked);
  const locked = items.filter((x) => x.locked);
  const a = ProfileTalk.answersOf(p, s.member);
  const answers = ProfileTalk.asked(p, s.member).filter((q) => q.id in a);
  const row = (x) => `<li class="talk-item is-${x.status}"><div><p>${escapeHtml(x.label)}</p>${x.status === "guess" ? `<small>${TALK_STATUS.guess}</small>` : ""}</div><div class="talk-item-actions" role="group" aria-label="${escapeAttr(x.label)}"><button type="button" class="chip-button" data-action="life-talk-decide" data-id="${x.id}" data-status="confirmed" aria-pressed="${x.status === "confirmed"}">✓ 合ってる</button><button type="button" class="chip-button" data-action="life-talk-decide" data-id="${x.id}" data-status="rejected" aria-pressed="${x.status === "rejected"}">✕ 違う</button></div></li>`;
  const more = ProfileTalk.nextQuestion(p, s.member);
  const last = p.snapshots.filter((x) => x.member === s.member).pop();
  return `<section class="hero-card talk-card" data-stage="check" aria-labelledby="talk-h">
    ${talkHeader(last ? `<span>前回の保存：版${last.v}</span>` : "")}
    <h2 id="talk-h" tabindex="-1">わが家のごはん方針（案）</h2>
    ${open.length ? `<ul class="talk-items">${open.map(row).join("")}</ul><p class="muted small">✓ にしたものだけを献立に使います</p>` : `<p class="muted">まだ読み取れたことがありません。質問に答えると、ここに出ます。</p>`}
    <h3 class="quick-sub">🔒 設定のまま ${tip("食べられないもの・苦手は、ここでは変わりません。献立からは必ず外します")}</h3>
    ${locked.length ? `<ul class="talk-locked">${locked.map((x) => `<li>${escapeHtml(x.label)}</li>`).join("")}</ul>` : `<p class="muted small">食べられないもの・苦手：なし</p>`}
    ${answers.length ? `<details class="talk-answers"><summary>💬 答えたこと（${answers.length}）</summary><ul>${answers.map((q) => `<li><span>${escapeHtml(q.ask(a))}</span><b>${escapeHtml(talkAnswerLabel(q, a[q.id], a))}</b><button type="button" class="link-inline" data-action="life-talk-edit" data-q="${q.id}">直す</button></li>`).join("")}</ul></details>` : ""}
    <div class="wizard-footer">${more ? `<button type="button" class="text-button" data-action="life-talk-ask">質問にもどる</button>` : `<span></span>`}<button type="button" class="primary-button" data-action="life-talk-save">この方針で保存</button></div>
    <div class="wizard-secondary"><button type="button" class="text-button" data-action="life-talk-close">保存して閉じる</button>${p.answers.some((x) => x.member === s.member) ? `<button type="button" class="text-button danger-text" data-action="life-talk-reset">答えを消す</button>` : ""}</div>
  </section>`;
}
// 最初の提案：いまの献立の決め方（条件はゆるめない）に、確かめた好みの加点を足した1品と、その理由。
function talkPick() {
  return dailyPlan().find((d) => d.candidate && !d.slot && !d.off) || null;
}
function renderTalkSuggest() {
  const p = talkProfile(), s = talkSession();
  const day = talkPick();
  const locked = [...dailyProfile().restrictions, ...dailyProfile().dislikes];
  const lockLine = locked.length ? `<li>🔒 ${escapeHtml(locked.slice(0, 4).join("・"))}${locked.length > 4 ? " ほか" : ""}は入れていません</li>` : "";
  const sure = ProfileTalk.interpret(p, s.member).filter((x) => x.status === "confirmed");
  if (!day) return `<section class="hero-card talk-card" data-stage="suggest"><h2 tabindex="-1">🍽 いま出せる候補がありません</h2><p class="muted">食べられないもの・時間・器具の条件は、ゆるめずにそのままです。レシピを足すか、条件を見直してください。</p><div class="wizard-footer">${dailyButton("go-view", "レシピへ", 'data-view="collection"')}${dailyButton("life-talk-close", "閉じる", "", true)}</div></section>`;
  const r = day.candidate.recipe;
  const hit = ProfileTalk.leanFor(p, s.member, r);
  const used = (hit?.ids || []).map((id) => `<li>${escapeHtml(ProfileTalk.LEANS[id].label)}</li>`).join("");
  const other = (day.candidate.reasons || []).filter((x) => !String(x).startsWith("💬")).slice(0, 3).map((x) => `<li>${escapeHtml(x)}</li>`).join("");
  const when = day.date === today() ? "今夜" : formatDate(day.date);
  return `<section class="hero-card talk-card" data-stage="suggest" aria-labelledby="talk-h">
    <p class="talk-meta"><span>✓ 方針を保存しました</span></p>
    <h2 id="talk-h" tabindex="-1">${escapeHtml(when)}は、これはどう？</h2>
    <article class="talk-dish">${dishTile(r, "talk-dish-photo")}<div><strong>${escapeHtml(r.title)}</strong><small>${r.planning?.minutes ? `⏱ ${r.planning.minutes}分` : ""}</small></div></article>
    <h3 class="quick-sub">この料理にした理由</h3>
    <ul class="talk-why">${used}${other}${lockLine}</ul>
    ${!used && sure.length ? `<p class="muted small">確かめた好みに合う料理は、いまの候補にありませんでした（条件はゆるめていません）</p>` : ""}
    <div class="talk-yesno">${dailyButton("life-talk-place", `${escapeHtml(when)}に入れる`, `data-date="${day.date}" data-recipe="${escapeAttr(r.id)}"`, true)}${dailyButton("life-talk-open-check", "方針を見直す")}</div>
    <div class="wizard-secondary"><button type="button" class="text-button" data-action="life-talk-close">閉じる</button></div>
  </section>`;
}
// 答えたあと：その答えから生まれた、まだ決めていない推測があれば聞き返す。なければ次の質問。
function talkAfterAnswer(qid) {
  const p = talkProfile(), s = talkSession();
  s.q = "";
  const fresh = ProfileTalk.interpret(p, s.member).find((x) => x.status === "guess" && x.ask && x.from.includes(qid));
  if (fresh) { s.stage = "confirm"; s.confirmId = fresh.id; trackDaily("talk_followup"); return; }
  s.stage = ProfileTalk.nextQuestion(p, s.member) ? "ask" : "check";
}
function handleTalkAction(action, data) {
  if (!action.startsWith("life-talk")) return false;
  if (action === "life-talk-open") { talkEcho = ""; openTalk(); }
  // 案内を閉じるだけ。会話（session）は作らない（作ると「続きから」に変わって残ってしまう）。
  else if (action === "life-talk-dismiss") talkProfile().dismissedAt = nowIso();
  else {
    const s = talkSession(), at = nowIso();
    const text = (document.querySelector?.("#talk-text")?.value || "").trim();
    talkEcho = "";
    // 答えを送る操作（選ぶ・決定）以外でも、書きかけのひとことを失わない（閉じる・戻る・このままでいい など）。
    if (!["life-talk-pick", "life-talk-toggle", "life-talk-multi-done"].includes(action)) keepTalkNote(document.querySelector?.("#talk-text"));
    else if (s.notes?.[data.q] !== undefined) { const { [data.q]: _, ...rest } = s.notes; s.notes = rest; }
    if (action === "life-talk-pick") {
      const before = ProfileTalk.answersOf(talkProfile(), s.member)[data.q];
      talkSet(ProfileTalk.answer(talkProfile(), { member: s.member, q: data.q, value: data.value, text, at }));
      if (before !== undefined && before !== data.value && ![ProfileTalk.LATER].includes(before)) trackDaily("talk_fixed");
      if (data.value === ProfileTalk.LATER) { s.q = ""; s.stage = ProfileTalk.nextQuestion(talkProfile(), s.member) ? "ask" : "check"; }
      else talkAfterAnswer(data.q);
    }
    if (action === "life-talk-toggle") {
      const cur = ProfileTalk.answersOf(talkProfile(), s.member)[data.q];
      const list = Array.isArray(cur) ? cur : [];
      const next = list.includes(data.value) ? list.filter((x) => x !== data.value) : [...list, data.value];
      // 何も選んでいない時は、答えを消して「まだ」に戻す。
      talkSet(next.length ? ProfileTalk.answer(talkProfile(), { member: s.member, q: data.q, value: next, text, at }) : { ...talkProfile(), answers: talkProfile().answers.filter((x) => !(x.member === s.member && x.q === data.q)) });
      s.q = data.q;
    }
    if (action === "life-talk-multi-done") {
      const value = ProfileTalk.answersOf(talkProfile(), s.member)[data.q];
      if (value !== undefined) talkSet(ProfileTalk.answer(talkProfile(), { member: s.member, q: data.q, value, text, at }));
      talkAfterAnswer(data.q);
    }
    if (action === "life-talk-keep") { s.q = ""; s.stage = ProfileTalk.nextQuestion(talkProfile(), s.member) ? "ask" : "check"; }
    if (action === "life-talk-back") {
      const list = ProfileTalk.asked(talkProfile(), s.member);
      const cur = talkQuestion();
      const i = cur ? list.findIndex((x) => x.id === cur.id) : list.length;
      if (i > 0) { s.q = list[i - 1].id; s.stage = "ask"; }
    }
    if (action === "life-talk-edit") { s.q = data.q; s.stage = "ask"; }
    if (action === "life-talk-ask") { s.q = ""; s.stage = "ask"; }
    if (action === "life-talk-check" || action === "life-talk-open-check") { s.q = ""; s.stage = "check"; }
    if (action === "life-talk-decide") {
      const before = talkProfile().decisions[`${s.member}\u0000${data.id}`]?.status;
      talkSet(ProfileTalk.decide(talkProfile(), { member: s.member, id: data.id, status: data.status, at }));
      if (data.status === "rejected" && before !== "rejected") trackDaily("talk_fixed");
      if (s.stage === "confirm" && ProfileTalk.isLean(data.id)) {
        const lean = ProfileTalk.LEANS[data.id];
        s.confirmId = "";
        if (data.status === "rejected") {
          // 「少し違う」：その答えを選び直せるように、元の質問へ（そのままでもいい）。
          const from = ProfileTalk.interpret(talkProfile(), s.member).find((x) => x.id === data.id)?.from || [];
          s.q = from[from.length - 1] || "";
          s.stage = s.q ? "ask" : "check";
          talkEcho = "わかりました。この案は使いません。選び直すか「このままでいい」を";
        } else {
          if (data.status === "confirmed") talkEcho = `${lean.short.replace(/^💬\s*/, "")}、覚えました`;
          s.stage = ProfileTalk.nextQuestion(talkProfile(), s.member) ? "ask" : "check";
        }
      }
    }
    if (action === "life-talk-save") {
      talkSet(ProfileTalk.snapshot(talkProfile(), { member: s.member, at, foodProfile: dailyProfile() }));
      trackDaily("talk_saved");
      // 保存で会話は閉じる。提案の画面を出すため、提案の段だけの会話を開き直す。
      talkProfile().session = { member: s.member, stage: "suggest", confirmId: "", q: "", startedAt: at, updatedAt: at };
    }
    if (action === "life-talk-place") {
      const r = allDinnerRecipes().find((x) => x.id === data.recipe);
      if (r && data.date && !state.mealSlots[data.date]) {
        const before = dailyShopping();
        state.planOverrides[data.date] = r.id;
        changedShopping(before);
        showToast(`「${r.title}」を${data.date === today() ? "今夜" : formatDate(data.date)}の献立に入れました`);
      }
      talkProfile().session = null;
      state.view = data.date === today() ? "today" : "plan";
    }
    if (action === "life-talk-close") {
      // 提案の画面から閉じた時は、会話は終わり。途中なら続きから開けるように残す。
      if (s.stage === "suggest") talkProfile().session = null;
      state.view = "today";
    }
    if (action === "life-talk-reset") {
      if (globalThis.confirm && !globalThis.confirm("この端末の答えと方針を消します。献立・記録・設定はそのままです。")) return true;
      const p = talkProfile();
      state.tasteProfile = { ...p, answers: p.answers.filter((x) => x.member !== s.member), decisions: Object.fromEntries(Object.entries(p.decisions).filter(([k]) => !k.startsWith(`${s.member}\u0000`))), snapshots: p.snapshots.filter((x) => x.member !== s.member), session: null, updatedAt: at };
      state.view = "today";
    }
  }
  saveState({ scheduleSync: false });
  render();
  if (state.view === "talk") document.querySelector("#app h2")?.focus?.();
  globalThis.scrollTo?.({ top: 0, behavior: "instant" });
  return true;
}
// 書きかけのひとことを残す。答えた質問なら答えのひとことを直し、まだなら書きかけ（session.notes）に。
function keepTalkNote(el) {
  const q = el?.dataset?.q;
  if (!ProfileTalk.isQuestion(q) || !talkProfile().session) return;
  const s = talkSession(), text = String(el.value || "").trim().slice(0, 200);
  const answered = talkProfile().answers.find((x) => x.member === s.member && x.q === q);
  if (answered) {
    if ((answered.text || "") !== text) talkSet(ProfileTalk.answer(talkProfile(), { member: s.member, q, value: answered.value, text, at: nowIso() }));
    if (s.notes?.[q] !== undefined) { const { [q]: _, ...rest } = s.notes; s.notes = rest; }
  } else if (text) s.notes = { ...(s.notes || {}), [q]: text };
  else if (s.notes?.[q] !== undefined) { const { [q]: _, ...rest } = s.notes; s.notes = rest; }
}
// 書いている途中も、少し止まったら保存する（ボタンを押さずにアプリを閉じても残す）。
let talkNoteTimer = null;
globalThis.document?.addEventListener?.("input", (ev) => {
  if (ev.target?.id !== "talk-text") return;
  clearTimeout(talkNoteTimer);
  talkNoteTimer = setTimeout(() => { keepTalkNote(ev.target); saveState({ scheduleSync: false }); }, 500);
});
// 今日の「やること」の1行。保存した方針がなく、閉じていない時だけ。途中なら「続きから」。
function renderTalkTodo() {
  if (typeof isViewer === "function" && isViewer()) return "";
  const p = talkProfile();
  const who = talkWho();
  if (p.snapshots.some((x) => x.member === who) || (p.dismissedAt && !p.session)) return "";
  return `<div class="todo-row${p.session ? "" : " has-x"}"><span>💬</span><p><b>わが家のごはん方針</b>をいっしょに（5問ほど）</p>${dailyButton("life-talk-open", p.session ? "続きから" : "話す")}${p.session ? "" : `<button type="button" class="todo-x" data-action="life-talk-dismiss" aria-label="わが家のごはん方針の案内を閉じる">×</button>`}</div>`;
}
// 設定の1行。
function renderTalkSetting() {
  const p = talkProfile(), who = talkWho();
  const last = p.snapshots.filter((x) => x.member === who).pop();
  const sure = ProfileTalk.interpret(p, who).filter((x) => x.status === "confirmed");
  const summary = last ? `✓ ${sure.length}件・版${last.v}` : p.session ? "途中まで" : "まだ";
  const body = `${sure.length ? `<ul class="talk-locked">${sure.map((x) => `<li>${escapeHtml(x.label)}</li>`).join("")}</ul>` : ""}${dailyButton("life-talk-open", last ? "見直す" : p.session ? "続きから" : "話す", "", true)}<p class="muted small">答えはこの端末だけ（家族と共有しません）。AIは使っていません ${tip("バックアップの書き出しには入ります。消す時は、見直す →「答えを消す」")}</p>`;
  return { summary, body };
}
