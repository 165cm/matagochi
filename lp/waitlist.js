/* Waitlist: posts to a Google Form so the list lives in the owner's Google account
   (Japanese UI, free, exports to Google Sheets). Fill in WAITLIST below; see
   lp/WAITLIST.md for how to get these values. Until then the form stays in
   "準備中" mode and nothing is sent. */
const WAITLIST = {
  // 例: "https://docs.google.com/forms/d/e/1FAIpQLS.../formResponse"
  action: "",
  // 各質問の entry ID（例: "entry.123456789"）
  fields: { email: "", household: "", source: "" },
};

(function () {
  const STORAGE_KEY = "ripigochi-waitlist";
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const configured = /^https:\/\/docs\.google\.com\/forms\/d\/e\/[\w-]+\/formResponse$/.test(WAITLIST.action) && !!WAITLIST.fields.email;

  const remembered = () => { try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; } };
  const remember = () => { try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* private mode */ } };

  function showDone() {
    document.body.classList.add("is-registered");
    document.querySelectorAll(".waitlist-form").forEach((form) => {
      if (form.dataset.source === "waitlist") {
        form.hidden = true;
        document.querySelector(".wl-done").hidden = false;
      } else {
        form.innerHTML = '<p class="wl-registered">✓ お知らせの登録が完了しています。公開まで、もう少しお待ちください。</p>';
      }
    });
  }

  async function submit(form) {
    const status = form.querySelector(".wl-status");
    const input = form.querySelector(".wl-email");
    const button = form.querySelector('button[type="submit"]');
    const email = input.value.trim();
    status.className = "wl-status";
    if (form.querySelector(".wl-hp").value) return; // bots fill hidden fields
    if (!EMAIL.test(email)) {
      status.textContent = "メールアドレスの形式を確認してください。";
      status.classList.add("is-error");
      input.setAttribute("aria-invalid", "true");
      input.focus();
      return;
    }
    input.removeAttribute("aria-invalid");
    if (!configured) {
      status.textContent = "受付の準備中です。もう少しお待ちください。";
      status.classList.add("is-error");
      return;
    }
    const body = new URLSearchParams();
    body.set(WAITLIST.fields.email, email);
    const household = form.querySelector('input[name="household"]:checked');
    if (WAITLIST.fields.household && household) body.set(WAITLIST.fields.household, household.value);
    if (WAITLIST.fields.source) body.set(WAITLIST.fields.source, form.dataset.source || "");
    button.disabled = true;
    status.textContent = "送信しています…";
    try {
      // Google Forms does not send CORS headers; an opaque response means it was delivered.
      await fetch(WAITLIST.action, { method: "POST", mode: "no-cors", body });
      remember();
      showDone();
      const done = document.querySelector(".wl-done");
      if (form.dataset.source !== "waitlist") document.querySelector("#waitlist")?.scrollIntoView({ behavior: "smooth" });
      done?.querySelector(".wl-done-title")?.focus?.();
    } catch {
      status.textContent = "送信できませんでした。通信状況を確認して、もう一度お試しください。";
      status.classList.add("is-error");
      button.disabled = false;
    }
  }

  document.querySelectorAll(".waitlist-form").forEach((form) =>
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submit(form);
    }),
  );
  if (remembered()) showDone();

  // Bottom CTA on phones: only while the hero form is off screen.
  const hero = document.querySelector('.waitlist-form[data-source="hero"]');
  const bar = document.querySelector(".sticky-cta");
  const waitlist = document.querySelector("#waitlist");
  if (hero && bar && "IntersectionObserver" in window) {
    let heroVisible = true;
    let waitlistVisible = false;
    const update = () => {
      const show = !heroVisible && !waitlistVisible;
      bar.classList.toggle("is-visible", show);
      bar.setAttribute("aria-hidden", String(!show));
      bar.querySelector("a").tabIndex = show ? 0 : -1;
    };
    new IntersectionObserver((entries) => { heroVisible = entries[0].isIntersecting; update(); }).observe(hero);
    if (waitlist) new IntersectionObserver((entries) => { waitlistVisible = entries[0].isIntersecting; update(); }).observe(waitlist);
  }
})();
