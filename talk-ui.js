/* 💬 わが家のごはん方針（APP_MAP §37）：答える → 解釈を確かめる → 最初の提案。
   データと規則は profile-talk.js（ProfileTalk）。ここは画面と操作だけ。
   - 途中で閉じても続きから（state.tasteProfile.session）。今までの人に、強制ではやり直させない。
   - この版はAIを使わない（画面にもそう書く）。答えは端末の中だけ。
   - 家族に見せるのは、本人が「見せる」を選んだ時の ✓ の方針だけ（state.sharedPolicies。答え・ひとことは送らない）。 */
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
// 初回設定（FUNNEL の "talk"）の中で話している時。閉じる・保存は、初回設定の次の画面へ進む。
function talkInFunnel() {
  return typeof FUNNEL !== "undefined" && !!state.onboardingDraft && FUNNEL[state.onboardingDraft.quickSetupIndex] === "talk" && (!state.onboarded || (typeof profileEditing !== "undefined" && profileEditing));
}
// 食べられないもの・苦手（🔒 設定のまま）：初回設定の途中は、まだ保存していない下書きのほうを見る。
const talkFood = () => (talkInFunnel() ? Lifestyle.profile(profileDraft()) : dailyProfile());
// 初回設定の画面から会話を始める（画面の切り替えはしない）。
function startTalkInFunnel() {
  if (!talkProfile().session) openTalk("", { setView: false });
}
function funnelStep(delta) {
  const p = profileDraft();
  p.quickSetupIndex = Math.max(0, Math.min(FUNNEL.length - 1, p.quickSetupIndex + delta));
}
function openTalk(stage = "", { setView = true } = {}) {
  const p = talkProfile();
  const fresh = !p.session;
  const s = talkSession();
  if (fresh) trackDaily("talk_started");
  // 前に「あとで」にした質問は、開き直すたびにまた聞く（続きからの時も）。書いたひとことは、書きかけとして戻す。
  const later = p.answers.filter((x) => x.member === s.member && x.value === ProfileTalk.LATER);
  let next = p;
  later.filter((x) => x.text).forEach((x) => { next = ProfileTalk.setDraft(next, { member: s.member, q: x.q, text: x.text }); });
  if (later.length) talkSet({ ...next, answers: next.answers.filter((x) => !later.includes(x)) });
  // ここから先は、「あとで」を外した後のプロフィールで判断する（外す前の p を見ると、聞くことが残っていないように見える）。
  const now = talkProfile();
  if (stage) s.stage = stage;
  // 前に保存した方針があり、聞くことが残っていなければ、確認の画面から。
  else if (fresh) s.stage = now.snapshots.some((x) => x.member === s.member) && !ProfileTalk.nextQuestion(now, s.member) ? "check" : "ask";
  // 続きから：聞くことが戻ってきたら、質問の画面へ（聞き返しの途中なら、そのまま）。
  else if (later.length && s.stage !== "confirm") { s.stage = "ask"; s.q = ""; }
  if (setView) state.view = "talk";
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
  if (stage === "view") return renderTalkView();
  if (stage === "type") return renderTalkType();
  const q = talkQuestion();
  if (!q) { s.stage = "check"; return renderTalkCheck(); }
  const a = ProfileTalk.answersOf(p, s.member);
  const list = ProfileTalk.asked(p, s.member);
  const n = list.findIndex((x) => x.id === q.id) + 1;
  const current = a[q.id];
  const picked = (v) => (Array.isArray(current) ? current.includes(v) : current === v);
  const picks = q.choices(a).map(([v, icon, label]) => `<button type="button" class="funnel-pick" data-action="${q.multi ? "life-talk-toggle" : "life-talk-pick"}" data-q="${q.id}" data-value="${v}" aria-pressed="${picked(v)}"><span class="fp-icon" aria-hidden="true">${icon}</span>${escapeHtml(label)}</button>`).join("");
  const note = ProfileTalk.draftOf(p, s.member, q.id) ?? (p.answers.find((x) => x.member === s.member && x.q === q.id)?.text || "");
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
    <div class="wizard-footer"><button type="button" class="text-button" data-action="life-talk-back" ${n <= 1 && !talkInFunnel() ? "disabled" : ""}>戻る</button>${answered ? `<button type="button" class="secondary-button" data-action="life-talk-check">ここまでで確かめる ›</button>` : ""}</div>
    <div class="wizard-secondary"><button type="button" class="text-button" data-action="life-talk-close">${talkInFunnel() ? "方針はあとで（次へ）" : "保存して閉じる"}</button></div>
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
  const items = ProfileTalk.interpret(p, s.member, talkFood());
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
    <div class="wizard-secondary"><button type="button" class="text-button" data-action="life-talk-close">${talkInFunnel() ? "方針はあとで（次へ）" : "保存して閉じる"}</button>${talkHasData(p, s.member) ? `<button type="button" class="text-button danger-text" data-action="life-talk-reset">答えを消す</button>` : ""}</div>
  </section>`;
}
// 「答えを消す」で消せるものがあるか：答え・書きかけ・決めたこと（✓／✕。記録から決めたものも）・方針の版・記録からの提案の見送り。
function talkHasData(p, member) {
  const mine = (obj) => Object.keys(obj || {}).some((k) => k.startsWith(`${member}\u0000`));
  return p.answers.some((x) => x.member === member) || p.snapshots.some((x) => x.member === member) || mine(p.drafts) || mine(p.decisions) || mine(p.evidence);
}
// 最初の提案：いまの献立の決め方（条件はゆるめない）に、確かめた好みの加点を足した1品と、その理由。
function talkPick() {
  const skip = talkProfile().session?.skip || [];
  return dailyPlan({ exclude: skip }).find((d) => d.candidate && !d.slot && !d.off) || null;
}
function renderTalkSuggest() {
  const p = talkProfile(), s = talkSession();
  const day = talkPick();
  const locked = [...dailyProfile().restrictions, ...dailyProfile().dislikes];
  const lockLine = locked.length ? `<li>🔒 ${escapeHtml(locked.slice(0, 4).join("・"))}${locked.length > 4 ? " ほか" : ""}は入れていません</li>` : "";
  const sure = ProfileTalk.interpret(p, s.member).filter((x) => x.status === "confirmed");
  if (!day) return `<section class="hero-card talk-card" data-stage="suggest"><h2 tabindex="-1">🍽 いま出せる候補がありません</h2><p class="muted">食べられないもの・時間・器具の条件は、ゆるめずにそのままです。レシピを足すか、条件を見直してください。</p><div class="wizard-footer">${dailyButton("go-view", "レシピへ", 'data-view="collection"')}${dailyButton("life-talk-close", "閉じる", "", true)}</div></section>`;
  const r = day.candidate.recipe;
  const hit = ProfileTalk.leanFor(p, s.member, r, day.date);
  const used = (hit?.ids || []).map((id) => `<li>${escapeHtml(ProfileTalk.LEANS[id].label)}</li>`).join("");
  const other = (day.candidate.reasons || []).filter((x) => !String(x).startsWith("💬")).slice(0, 3).map((x) => `<li>${escapeHtml(x)}</li>`).join("");
  const when = day.date === today() ? "今夜" : formatDate(day.date);
  return `<section class="hero-card talk-card" data-stage="suggest" aria-labelledby="talk-h">
    <p class="talk-meta"><span>✓ 方針を保存しました</span></p>
    ${talkEcho ? `<p class="funnel-echo" role="status">💬 ${escapeHtml(talkEcho)}</p>` : ""}
    <h2 id="talk-h" tabindex="-1">${escapeHtml(when)}は、これはどう？</h2>
    <article class="talk-dish">${dishTile(r, "talk-dish-photo")}<div><strong>${escapeHtml(r.title)}</strong><small>${r.planning?.minutes ? `⏱ ${r.planning.minutes}分` : ""}</small></div></article>
    <h3 class="quick-sub">この料理にした理由</h3>
    <ul class="talk-why">${used}${other}${lockLine}</ul>
    ${!used && sure.length ? `<p class="muted small">確かめた好みに合う料理は、いまの候補にありませんでした（条件はゆるめていません）</p>` : ""}
    <div class="talk-yesno">${dailyButton("life-talk-place", `${escapeHtml(when)}に入れる`, `data-date="${day.date}" data-recipe="${escapeAttr(r.id)}"`, true)}${dailyButton("life-talk-open-check", "方針を見直す")}</div>
    <div class="talk-react" role="group" aria-label="変えるなら？"><span>変えるなら？</span>${TALK_REACT.map(([kind, label]) => `<button type="button" class="chip-button" data-action="life-talk-react" data-kind="${kind}" data-recipe="${escapeAttr(r.id)}">${label}</button>`).join("")}</div>
    <div class="wizard-secondary"><button type="button" class="text-button" data-action="life-talk-close">閉じる</button></div>
  </section>`;
}
// 最初の提案への反応。time・many は方針を直す（本人が押したので確かめ済み）。どれも、その料理を外して次の料理を出す。
const TALK_REACT = [["time", "⏱ 時間が長い"], ["many", "🧺 材料が多い"], ["other", "🤔 気分じゃない"]];
const TALK_REACT_ECHO = { time: "早くできる料理を、先に出します", many: "材料が少ない料理を、先に出します", other: "ほかの料理にします" };
// 方針の見える化（docs/PERSONALIZE_PLAN.md §5）：「あなたが言ったこと」「献立に使っていること」「記録から見えてきたこと」「履歴」を分けて見せる。
function renderTalkView() {
  const p = talkProfile(), s = talkSession();
  const a = ProfileTalk.answersOf(p, s.member);
  const answers = ProfileTalk.asked(p, s.member).filter((q) => q.id in a && a[q.id] !== ProfileTalk.LATER);
  const items = ProfileTalk.interpret(p, s.member, dailyProfile());
  const sure = items.filter((x) => !x.locked && x.status === "confirmed");
  const off = items.filter((x) => !x.locked && x.status === "rejected");
  const guess = items.filter((x) => !x.locked && x.status === "guess");
  const hist = ProfileTalk.history(p, s.member);
  const labelOf = (id) => ProfileTalk.LEANS[id]?.short?.replace(/^💬\s*/, "") || id;
  const REASON = { first: "はじめて保存", edit: "見直して保存", reaction: "「変えるなら？」から", evidence: "記録から" };
  const ev = talkEvidence();
  const rec = talkRecords();
  return `<section class="hero-card talk-card" data-stage="view" aria-labelledby="talk-h">
    ${talkHeader()}
    <h2 id="talk-h" tabindex="-1">わが家のごはん方針</h2>
    ${talkEcho ? `<p class="funnel-echo" role="status">💬 ${escapeHtml(talkEcho)}</p>` : ""}
    <h3 class="quick-sub">💬 あなたが言ったこと</h3>
    ${answers.length ? `<ul class="talk-said">${answers.map((q) => `<li><span>${escapeHtml(q.ask(a))}</span><b>${escapeHtml(talkAnswerLabel(q, a[q.id], a))}</b>${p.answers.find((x) => x.member === s.member && x.q === q.id)?.text ? `<small>「${escapeHtml(p.answers.find((x) => x.member === s.member && x.q === q.id).text)}」</small>` : ""}</li>`).join("")}</ul>` : `<p class="muted small">まだありません</p>`}
    <h3 class="quick-sub">✓ 献立に使っていること</h3>
    ${sure.length ? `<ul class="talk-locked">${sure.map((x) => `<li>${escapeHtml(x.label)}${x.source === "reaction" ? " <small>（変えるなら？）</small>" : x.source === "records" ? " <small>（記録から）</small>" : ""}</li>`).join("")}</ul>` : `<p class="muted small">まだありません</p>`}
    ${guess.length ? `<p class="small">🧪 まだ確かめていない案が ${guess.length}件 ${dailyButton("life-talk-open-check", "確かめる")}</p>` : ""}
    ${off.length ? `<details class="talk-answers"><summary>✕ 使わないこと（${off.length}）</summary><ul class="talk-locked">${off.map((x) => `<li>${escapeHtml(x.label)}</li>`).join("")}</ul></details>` : ""}
    ${renderTalkShare(p, s.member, sure.length)}
    ${renderTalkFamily(s.member)}
    <h3 class="quick-sub">📈 記録から見えてきたこと ${tip("「また食べたい」の評価から。あなたが言ったことと分けて出します")}</h3>
    ${rec.html}
    ${renderTalkEvidence(ev)}
    ${hist.length ? `<h3 class="quick-sub">🕘 方針の履歴</h3><ol class="talk-history">${hist.slice(0, 6).map((h) => `<li><b>版${h.v}</b> <span>${escapeHtml(formatDate(String(h.at).slice(0, 10)))}・${REASON[h.reason] || ""}</span>${h.note ? `<small>${escapeHtml(h.note)}</small>` : ""}${h.added.length || h.removed.length ? `<small>${h.added.map((id) => `＋${escapeHtml(labelOf(id))}`).join(" ")} ${h.removed.map((id) => `−${escapeHtml(labelOf(id))}`).join(" ")}</small>` : `<small>✓ ${h.count}件</small>`}</li>`).join("")}</ol>` : ""}
    ${renderTalkTypeRow()}
    <div class="wizard-footer">${ProfileTalk.nextQuestion(p, s.member) ? dailyButton("life-talk-ask", "💬 質問に答える") : "<span></span>"}${dailyButton("life-talk-open-check", "✎ 直す", "", true)}</div>
    <div class="wizard-secondary"><button type="button" class="text-button" data-action="life-talk-close">閉じる</button></div>
  </section>`;
}
// 共有の範囲：家族に見せる（本人が選ぶ）と、AIに送る（この版は送らない）を別々に出す。
// いま家族に見せているか：同期で届いた記録（同じ名前のほかの端末で押した「見せる」「見せない」も含む）があれば、それが正。
// 記録がない時だけ、この端末の選択を見る。
function talkSharedOn(p, member) {
  const cur = (state.sharedPolicies || {})[member];
  return cur ? cur.on === true : ProfileTalk.shareOf(p, member).family;
}
function renderTalkShare(p, member, count) {
  const on = talkSharedOn(p, member);
  const cur = (state.sharedPolicies || {})[member], by = typeof deviceKey === "function" ? deviceKey() : "";
  const elsewhere = cur?.on && (cur.by || "") !== by;
  const linked = typeof syncEnabled === "function" && syncEnabled();
  return `<h3 class="quick-sub">👥 共有の範囲</h3>
    <div class="talk-share">
      <p><b>家族に見せる</b><small>見せるのは「✓ 献立に使っていること」（いま${count}件）だけ。答え・書いたひとことは送りません。家族の端末で見られて、家族の献立にも使われます</small></p>
      <div class="talk-yesno" role="group" aria-label="家族に見せる"><button type="button" class="chip-button" data-action="life-talk-share" data-family="0" aria-pressed="${!on}">見せない</button><button type="button" class="chip-button" data-action="life-talk-share" data-family="1" aria-pressed="${on}">見せる</button></div>
      ${elsewhere ? `<p class="muted small">同じ名前の別の端末で「見せる」にしています。ここで「見せない」を押すと止まります</p>` : ""}
      ${on && !linked ? `<p class="muted small">いまは「ふたりで使う」でつながっていないので、まだ届きません</p>` : ""}
      <p><b>AIに送る</b><span class="talk-share-state">送らない</span><small>この版はAIを使っていません。使う時は、家族に見せるとは別に、ここでたずねます</small></p>
    </div>`;
}
// 家族が見せている方針（読むだけ。変えられるのは本人の端末だけ）。
function renderTalkFamily(member) {
  const others = Object.entries(ProfileTalk.othersFrom(state.sharedPolicies, member, state.family));
  if (!others.length) return "";
  return `<h3 class="quick-sub">👨‍👩‍👧 家族が見せている方針</h3>${others.map(([who, ids]) => `<p class="small"><b>${escapeHtml(who)}</b></p><ul class="talk-locked">${ids.map((id) => `<li>${escapeHtml(ProfileTalk.LEANS[id].label)}</li>`).join("")}</ul>`).join("")}<p class="muted small">献立にも使います（${escapeHtml(others.map(([who]) => who).join("・"))}さんが「見せる」にしたもの）。変えられるのは本人だけです</p>`;
}
// sharedPolicies に書く。変わった時だけ true（同期する）。by にこの端末の番号を残す（ProfileTalk.mergeShared が自分の分を見分ける）。
// explicit（本人が「見せる」「見せない」「答えを消す」を押した）：その選択を、だれが前に書いたかにかかわらず新しい日時で書く
//   （同じ名前の別の端末・入れ直して番号が変わった端末から押した「見せない」も効く）。
// 自動（画面を開いた・方針が変わった）：この端末が書いた「見せる」の中身を最新にするだけ。
//   届いた「見せない」・別の端末の記録・記録がない時は書かない（もう一度見せるには「見せる」を押す）。
function publishTalkPolicy({ explicit = false } = {}) {
  const p = talkProfile(), who = talkWho(), by = typeof deviceKey === "function" ? deviceKey() : "";
  const on = ProfileTalk.shareOf(p, who).family;
  const cur = (state.sharedPolicies || {})[who];
  if (explicit ? !on && !cur?.on : !on || !cur?.on || (cur.by || "") !== by) return false;
  const items = on ? ProfileTalk.familyItems(p, who) : [];
  if (cur && (cur.by || "") === by && cur.on === on && JSON.stringify(cur.items) === JSON.stringify(items)) return false;
  // 日時は、前の記録より必ず後にする（同じミリ秒に「見せる」→「見せない」と押しても、あとの操作が同期で勝つ）。
  let updatedAt = nowIso();
  if (cur?.updatedAt && updatedAt <= cur.updatedAt) updatedAt = new Date(Date.parse(cur.updatedAt) + 1).toISOString();
  state.sharedPolicies = { ...(state.sharedPolicies || {}), [who]: { on, items, updatedAt, ...(by ? { by } : {}) } };
  return true;
}
// ---- 晩ごはんタイプ（任意・おまけ）：方針の画面から4問。献立の決め方には使わない ----
const TALK_TYPE_STEPS = [["ratio", "🗓 いまの1週間、晩ごはんはどうしてる？"], ["staple", "🍚 晩ごはんで、よく食べる主食は？"], ["chains", "🏪 晩ごはんを外で食べるなら、どこ？"], ["priority", "🎯 晩ごはんで、いちばん大事なのは？"], ["type", "🎴 あなたの晩ごはんタイプ"]];
const TALK_TYPE_KEYS = ["ratio", "ratioSet", "staples", "chains", "priority"];
let talkTypeDraft = null;
// 下書きは、保存してある答え（foodProfile）から始める。「この結果を残す」まで foodProfile は変えない。
function talkTypeFor() {
  if (!talkTypeDraft) talkTypeDraft = JSON.parse(JSON.stringify(Object.fromEntries(TALK_TYPE_KEYS.filter((k) => state.foodProfile && k in state.foodProfile).map((k) => [k, state.foodProfile[k]]))));
  return talkTypeDraft;
}
function renderTalkTypeRow() {
  if (!state.foodProfile) return "";
  const r = cookTypeOf(state.foodProfile);
  return `<h3 class="quick-sub">🎴 晩ごはんタイプ（おまけ）</h3><p class="small">${r ? `${r.el} <b>${escapeHtml(r.name)}</b>` : "4問の遊びの診断です"}<small class="muted">（献立の決め方には使いません）</small></p><div class="talk-type-open">${r ? dailyButton("life-talk-type", "タイプを見る", `data-step="4"`) : ""}${dailyButton("life-talk-type", r ? "答え直す" : "診断する（任意）", `data-step="0"`)}</div>`;
}
function renderTalkType() {
  const s = talkSession(), p = talkTypeFor();
  const step = Number.isInteger(s.typeStep) ? s.typeStep : 0;
  const [key, title] = TALK_TYPE_STEPS[step];
  const r = key === "type" ? cookTypeOf(p) : null;
  const body = key === "ratio" ? renderRatioStep(p) : key === "staple" ? renderStapleStep(p) : key === "chains" ? renderChainStep(p) : key === "priority" ? renderPriorityStep(p) : r ? renderCookTypeCard(r) : `<p>答えが足りないので、タイプを出せません。「戻る」で答えてください。</p>`;
  const next = key === "type" ? (r ? dailyButton("life-talk-type-save", "この結果を残す", "", true) : "<span></span>") : dailyButton("life-talk-type", key === "priority" && !p.priority ? "スキップ" : "次へ", `data-step="${step + 1}"`, true);
  return `<section class="hero-card talk-card" data-stage="type" aria-labelledby="talk-h">
    <p class="talk-meta"><span>🎴 晩ごはんタイプ（おまけ）</span><span>${step < 4 ? `${step + 1} / 4` : ""}</span></p>
    <h2 id="talk-h" tabindex="-1">${escapeHtml(title)}</h2>
    ${body}
    <div class="wizard-footer">${dailyButton("life-talk-type", "戻る", `data-step="${step - 1}"`)}${next}</div>
    <div class="wizard-secondary"><button type="button" class="text-button" data-action="life-talk-view">残さずに方針へ戻る</button></div>
  </section>`;
}
// 記録から見えてきたこと：評価（また食べたい）から。対象の期間と件数を添える。精密な点数や伸び率は出さない。
function talkRecords() {
  const rated = (state.evaluations || []).filter((e) => Object.values(e.familyRepeatCycles || {}).some(Boolean));
  const recipeOf = (id) => recipeById(id) || Lifestyle.curated.find((c) => c.id === id) || null;
  const { left, items } = Lifestyle.insights({ evaluations: state.evaluations || [], recipeOf, family: state.family || [] });
  if (left) return { html: `<p class="muted small">あと${left}品「また食べたい」をつけると見えてきます</p>` };
  const days = rated.map((e) => String(e.cookedAt || "").slice(0, 10)).filter(Boolean).sort();
  const span = days.length ? `${formatDate(days[0])}〜${formatDate(days[days.length - 1])}・評価${rated.length}件` : "";
  return { html: items.length ? `<ul class="talk-locked">${items.map((x) => `<li>${escapeHtml(x.text)}</li>`).join("")}</ul><p class="muted small">${escapeHtml(span)}</p>` : `<p class="muted small">まだはっきりした傾向はありません（${escapeHtml(span)}）</p>` };
}
// ---- 記録からの提案（PR 6b・docs/PERSONALIZE_PLAN.md §10）：方針と最近の評価の差を、根拠（品数と料理名）つきで聞く ----
// 家族の画面を見ているだけの人には出さない。決めるのは本人（「増やす」「見直す」／「いまはいい」「このまま」）。
function talkEvidence(limit = 2) {
  if (typeof isViewer === "function" && isViewer()) return [];
  const recipeOf = (id) => recipeById(id) || Lifestyle.curated.find((c) => c.id === id) || null;
  return ProfileTalk.evidence(talkProfile(), talkWho(), { evaluations: state.evaluations || [], recipeOf, today: today(), limit });
}
function renderTalkEvidence(list) {
  return list.map((x) => `<div class="evidence-card" role="group" aria-label="記録からの提案"><p class="small">${x.icon} ${escapeHtml(x.note)}${x.names.length ? ` <small>（${x.names.map((n) => escapeHtml(n)).join("・")}）</small>` : ""}</p><p class="evidence-ask"><b>${escapeHtml(x.ask)}</b></p><div class="evidence-actions">${dailyButton("life-talk-evidence", x.kind === "add" ? "増やす" : "見直す（使わない）", `data-id="${escapeAttr(x.id)}" data-kind="${x.kind}" data-answer="yes"`, true)}<button type="button" class="text-button" data-action="life-talk-evidence" data-id="${escapeAttr(x.id)}" data-kind="${x.kind}" data-answer="no">${x.kind === "add" ? "いまはいい" : "このまま"}</button></div></div>`).join("");
}
// ふりかえり（今月）に1件だけ。
function renderReflectEvidence() {
  const ev = talkEvidence(1);
  return ev.length ? `<section class="insight-card evidence-reflect"><h3>💬 方針に入れる？ ${tip("「また食べたい」の記録と、わが家のごはん方針を比べました。決めるのはあなたです")}</h3>${renderTalkEvidence(ev)}</section>` : "";
}
function talkEvidenceAnswer(data) {
  // 画面の値は信じず、いまの記録から作り直した提案の中から選ぶ（古い画面・書きかえられたボタンで方針を変えない）。
  const item = talkEvidence(10).find((x) => x.id === data.id && x.kind === data.kind);
  if (!item) { render(); return true; }
  const who = talkWho(), at = nowIso();
  if (data.answer === "yes") {
    talkSet(ProfileTalk.adoptEvidence(talkProfile(), { member: who, item, at, foodProfile: dailyProfile() }));
    trackDaily("talk_fixed");
    const v = talkProfile().snapshots.filter((x) => x.member === who).pop()?.v;
    showToast(item.kind === "add" ? `方針に入れました（版${v}）。次の献立の候補から使います` : `方針から外しました（版${v}）`);
  } else talkSet(ProfileTalk.skipEvidence(talkProfile(), { member: who, item, at }));
  const shared = publishTalkPolicy();
  saveState({ scheduleSync: shared });
  render();
  return true;
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
  // 方針の画面から開いた晩ごはんタイプの答えは、その画面の下書きへ（初回設定の下書きは作らない）。
  if (["life-ratio", "life-staple", "life-chain", "life-priority", "life-type-share"].includes(action) && state.view === "talk" && state.tasteProfile?.session?.stage === "type") {
    if (handleCookTypeAction(action, data, talkTypeFor())) return true;
    if (action === "life-priority") talkSession().typeStep = 4;
    saveState({ scheduleSync: false });
    render();
    return true;
  }
  if (!action.startsWith("life-talk")) return false;
  if (action === "life-talk-evidence") return talkEvidenceAnswer(data);
  if (action === "life-talk-open") { talkEcho = ""; openTalk(); }
  else if (action === "life-talk-view") { talkEcho = ""; talkTypeDraft = null; openTalk("view"); }
  // 案内を閉じるだけ。会話（session）は作らない（作ると「続きから」に変わって残ってしまう）。
  else if (action === "life-talk-dismiss") talkProfile().dismissedAt = nowIso();
  else {
    const s = talkSession(), at = nowIso();
    const text = (document.querySelector?.("#talk-text")?.value || "").trim();
    talkEcho = "";
    // 答えを送る操作（選ぶ・決定）以外でも、書きかけのひとことを失わない（閉じる・戻る・このままでいい など）。
    if (!["life-talk-pick", "life-talk-toggle", "life-talk-multi-done"].includes(action)) keepTalkNote(document.querySelector?.("#talk-text"));
    else talkSet(ProfileTalk.setDraft(talkProfile(), { member: s.member, q: data.q, text: "" }));
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
      // 初回設定の中で、最初の質問から戻る：初回設定の前の画面へ（会話は続きから開ける）。
      else if (talkInFunnel()) funnelStep(-1);
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
      const inFunnel = talkInFunnel();
      talkSet(ProfileTalk.snapshot(talkProfile(), { member: s.member, at, foodProfile: talkFood() }));
      trackDaily("talk_saved");
      // 初回設定の中では、次の画面へ（最初の提案は、初回設定を終えた時に出す）。
      if (inFunnel) funnelStep(1);
      // 保存で会話は閉じる。提案の画面を出すため、提案の段だけの会話を開き直す。
      else talkProfile().session = { member: s.member, stage: "suggest", confirmId: "", q: "", startedAt: at, updatedAt: at };
    }
    if (action === "life-talk-share") talkSet(ProfileTalk.setShare(talkProfile(), { member: s.member, family: data.family === "1", at }));
    if (action === "life-talk-type") {
      const step = Number(data.step);
      if (step < 0) { talkTypeDraft = null; s.stage = "view"; delete s.typeStep; }
      else { if (s.stage !== "type") talkTypeDraft = null; s.stage = "type"; s.typeStep = Math.min(4, Math.max(0, step || 0)); }
    }
    if (action === "life-talk-type-save" && state.foodProfile) {
      const d = talkTypeFor();
      // 晩ごはんタイプの答えだけを書きかえる（好みの味・献立の条件は変えない）。
      state.foodProfile = Lifestyle.profile({ ...Object.fromEntries(Object.entries(state.foodProfile).filter(([k]) => !TALK_TYPE_KEYS.includes(k))), ...d });
      talkTypeDraft = null; s.stage = "view"; delete s.typeStep;
      talkEcho = "晩ごはんタイプを残しました";
    }
    if (action === "life-talk-react") {
      if (TALK_REACT.some(([k]) => k === data.kind) && data.recipe) {
        s.skip = [...(s.skip || []), data.recipe].slice(-20);
        if (ProfileTalk.REACTIONS[data.kind]) {
          const before = talkProfile().decisions[`${s.member}\u0000${ProfileTalk.REACTIONS[data.kind]}`]?.status;
          talkSet(ProfileTalk.react(talkProfile(), { member: s.member, kind: data.kind, at }));
          if (before !== "confirmed") trackDaily("talk_fixed");
        }
        talkEcho = TALK_REACT_ECHO[data.kind];
      }
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
      // 初回設定の中：会話は途中のまま残し（今日の「やること」から続きを開ける）、初回設定の次の画面へ。
      if (talkInFunnel()) funnelStep(1);
      else {
        // 提案の画面から閉じた時は、会話は終わり。途中なら続きから開けるように残す。
        if (s.stage === "suggest") talkProfile().session = null;
        state.view = "today";
      }
    }
    if (action === "life-talk-reset") {
      if (globalThis.confirm && !globalThis.confirm("この端末の答えと方針を消します。献立・記録・設定はそのままです。")) return true;
      const p = talkProfile();
      state.tasteProfile = { ...p, answers: p.answers.filter((x) => x.member !== s.member), decisions: Object.fromEntries(Object.entries(p.decisions).filter(([k]) => !k.startsWith(`${s.member}\u0000`))), drafts: Object.fromEntries(Object.entries(p.drafts || {}).filter(([k]) => !k.startsWith(`${s.member}\u0000`))), snapshots: p.snapshots.filter((x) => x.member !== s.member), share: Object.fromEntries(Object.entries(p.share || {}).filter(([m]) => m !== s.member)), evidence: Object.fromEntries(Object.entries(p.evidence || {}).filter(([k]) => !k.startsWith(`${s.member}\u0000`))), session: null, updatedAt: at };
      if (!talkInFunnel()) state.view = "today";
    }
  }
  // 家族に見せている方針が変わった時だけ、同期する。
  const shared = publishTalkPolicy({ explicit: action === "life-talk-share" || action === "life-talk-reset" });
  saveState({ scheduleSync: shared });
  render();
  if (state.view === "talk" || talkInFunnel()) document.querySelector("#app h2")?.focus?.();
  globalThis.scrollTo?.({ top: 0, behavior: "instant" });
  return true;
}
// 書きかけのひとことを残す。答えた質問なら答えのひとことを直し、まだなら書きかけ（tasteProfile.drafts。会話が終わっても残る）に。
function keepTalkNote(el) {
  const q = el?.dataset?.q;
  if (!ProfileTalk.isQuestion(q) || !talkProfile().session) return;
  const s = talkSession(), text = String(el.value || "").trim().slice(0, 200);
  const answered = talkProfile().answers.find((x) => x.member === s.member && x.q === q);
  if (answered) {
    if ((answered.text || "") !== text) talkSet(ProfileTalk.answer(talkProfile(), { member: s.member, q, value: answered.value, text, at: nowIso() }));
    talkSet(ProfileTalk.setDraft(talkProfile(), { member: s.member, q, text: "" }));
  } else talkSet(ProfileTalk.setDraft(talkProfile(), { member: s.member, q, text }));
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
  return `<div class="todo-row${p.session ? "" : " has-x"}"><span>💬</span><p><b>わが家のごはん方針</b>をいっしょに（6問ほど）</p>${dailyButton("life-talk-open", p.session ? "続きから" : "話す")}${p.session ? "" : `<button type="button" class="todo-x" data-action="life-talk-dismiss" aria-label="わが家のごはん方針の案内を閉じる">×</button>`}</div>`;
}
// 設定の1行。
function renderTalkSetting() {
  const p = talkProfile(), who = talkWho();
  const last = p.snapshots.filter((x) => x.member === who).pop();
  const sure = ProfileTalk.interpret(p, who).filter((x) => x.status === "confirmed");
  const summary = last ? `✓ ${sure.length}件・版${last.v}` : p.session ? "途中まで" : "まだ";
  const body = `${sure.length ? `<ul class="talk-locked">${sure.map((x) => `<li>${escapeHtml(x.label)}</li>`).join("")}</ul>` : ""}${dailyButton(last ? "life-talk-view" : "life-talk-open", last ? "見直す" : p.session ? "続きから" : "話す", "", true)}<p class="muted small">${talkSharedOn(p, who) ? "✓ の方針だけ家族に見せています（答え・ひとことは送りません）" : "答えはこの端末だけ（家族に見せていません）"}。AIは使っていません ${tip("見せる・見せないは「見直す」で選べます。バックアップの書き出しには入ります。消す時は、見直す →「答えを消す」")}</p>`;
  return { summary, body };
}
