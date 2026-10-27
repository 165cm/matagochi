/* Waitlist & Interactive LP controls:
   - Posts waitlist form to Google Forms (see lp/WAITLIST.md).
   - Switches 4-step interactive tabs (#how) on tap.
   - Auto-opens folded <details> when navigating to #waitlist or #privacy. */
const WAITLIST = {
  // 例: "https://docs.google.com/forms/d/e/1FAIpQLS.../formResponse"
  action: "https://docs.google.com/forms/d/e/1FAIpQLSeAodcHygYfzG797YuavmocVRxHb4poXc9Mqzj3PBWaKTvXxw/formResponse",
  // 各質問の entry ID（例: "entry.123456789"）
  fields: { email: "entry.1112083016", household: "entry.355337516", source: "entry.1616449628" },
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

  // Interactive 4-Step Tabs (#how)
  const stepTabs = document.querySelectorAll(".step-tab[data-step-target]");
  const stepPanels = document.querySelectorAll(".step[data-step-panel]");
  function activateStep(stepNo, scrollTabs) {
    const target = String(stepNo);
    stepTabs.forEach((tab) => {
      const active = tab.dataset.stepTarget === target;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    stepPanels.forEach((panel) => {
      const active = panel.dataset.stepPanel === target;
      panel.classList.toggle("is-active", active);
      panel.hidden = !active;
    });
    if (scrollTabs) {
      document.querySelector(".step-tabs")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }
  document.querySelectorAll("[data-step-target]").forEach((btn) => {
    btn.addEventListener("click", () => {
      activateStep(btn.dataset.stepTarget, btn.classList.contains("step-next-btn"));
    });
  });

  // Auto-open folded <details> when hash targets #waitlist or #privacy
  function openHashTarget(hash) {
    if (!hash) return;
    if (hash === "#waitlist") {
      const wf = document.querySelector(".waitlist-fold");
      if (wf) wf.open = true;
    } else if (hash === "#privacy") {
      const priv = document.querySelector("#privacy");
      if (priv) {
        priv.open = true;
        const parent = priv.closest(".faq-more");
        if (parent) parent.open = true;
      }
    }
  }
  openHashTarget(window.location.hash);
  window.addEventListener("hashchange", () => openHashTarget(window.location.hash));
  document.querySelectorAll('a[href="#waitlist"], a[href="#privacy"]').forEach((a) => {
    a.addEventListener("click", () => openHashTarget(a.getAttribute("href")));
  });

  // Bottom CTA on phones: only while the hero CTA and final CTA are off screen.
  const hero = document.querySelector('[data-cta="hero"], .waitlist-form[data-source="hero"]');
  const bar = document.querySelector(".sticky-cta");
  const finalCta = document.querySelector(".final-cta") || document.querySelector("#waitlist");
  if (hero && bar && "IntersectionObserver" in window) {
    let heroVisible = true;
    let finalVisible = false;
    const update = () => {
      const show = !heroVisible && !finalVisible;
      bar.classList.toggle("is-visible", show);
      bar.setAttribute("aria-hidden", String(!show));
      bar.querySelector("a").tabIndex = show ? 0 : -1;
    };
    new IntersectionObserver((entries) => { heroVisible = entries[0].isIntersecting; update(); }).observe(hero);
    if (finalCta) new IntersectionObserver((entries) => { finalVisible = entries[0].isIntersecting; update(); }).observe(finalCta);
  }
})();
