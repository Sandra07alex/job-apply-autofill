// The step-by-step bar. After Fill, it fills each new step of a multi-step application
// and moves to the next step when you say so. It never clicks Submit.
// Injected together with fill.js (before it); fill.js reports each run's counts here.
(() => {
  if (window.__autofillGuide) return;

  const hasChrome = typeof chrome !== "undefined" && !!(chrome.runtime && chrome.runtime.id);
  const NEXT_RE = /^(save (and|&) continue|continue|next|next step|proceed|save (and|&) next)$/i;
  const SUBMIT_RE = /^(submit|submit application|submit your application|send application|apply|apply now|finish|complete application)$/i;
  const textOf = (el) => (el ? (el.innerText || el.textContent || "") : "").replace(/\s+/g, " ").trim();
  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) && getComputedStyle(el).visibility !== "hidden";
  const label = (b) => (textOf(b) || b.value || b.getAttribute("aria-label") || "").trim();

  let on = false, lastSig = null, last = null, debounce = null, stuckTimer = null, warnedEmpty = false;
  let host = null, ui = null;

  // ---------- Where are we? ----------
  function stepName() {
    const wd = document.querySelector("[data-automation-id='progressBarActiveStep']");
    if (wd && textOf(wd)) return textOf(wd).replace(/^current step \d+ of \d+\s*/i, "");
    const cur = document.querySelector("[aria-current='step']");
    if (cur && textOf(cur)) return textOf(cur);
    const h = [...document.querySelectorAll("h1, h2, h3")].find((x) => visible(x) && textOf(x) && textOf(x).length < 80 && !(ui && ui.host.contains(x)));
    return h ? textOf(h) : "";
  }
  const signature = () => location.pathname + location.search + "|" + stepName();

  const buttons = (re) => [...document.querySelectorAll("button, [role='button'], input[type=submit], input[type=button], a")]
    .filter((b) => visible(b) && re.test(label(b)));
  function nextButton() {
    // Workday's bottom button is "Save and Continue" on every step and "Submit" on Review.
    const wd = document.querySelector("[data-automation-id='bottom-navigation-next-button']");
    if (wd && visible(wd) && !SUBMIT_RE.test(label(wd))) return wd;
    return buttons(NEXT_RE).pop() || null;
  }
  const isReview = () => /\breview\b/i.test(stepName()) || (!nextButton() && buttons(SUBMIT_RE).length > 0);

  // Fields still outlined orange by fill.js and still empty.
  function stillEmpty() {
    return [...document.querySelectorAll("input, select, textarea, button")].filter((el) => {
      if (!el.style.outline.includes("dashed") || !visible(el)) return false;
      if (el.tagName === "BUTTON") return /^(select( one)?|choose.*)?$/i.test(textOf(el));
      if (el.tagName === "SELECT") return el.selectedIndex <= 0;
      return !el.value;
    }).length;
  }

  // ---------- The bar ----------
  function buildBar() {
    const hostEl = document.createElement("div");
    hostEl.style.cssText = "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483646";
    const root = hostEl.attachShadow({ mode: "open" });
    root.innerHTML = `<style>
      .bar{font:13px/1.4 system-ui,sans-serif;background:#1f2937;color:#fff;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.3);
        padding:10px 12px;display:flex;flex-direction:column;gap:6px;min-width:320px;max-width:min(560px,calc(100vw - 32px))}
      .row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .step{font-weight:600}.counts{color:#d1d5db}.need{color:#fbbf24}
      .grow{flex:1}
      button{font:inherit;border-radius:8px;padding:5px 10px;cursor:pointer;border:1px solid #4b5563;background:#374151;color:#fff}
      button.primary{background:#2563eb;border-color:#2563eb;font-weight:600}
      button:disabled{opacity:.45;cursor:default}
      button.x{border:0;background:none;color:#9ca3af;padding:2px 6px;font-size:16px}
      .msg{color:#e5e7eb;font-size:12px}.msg:empty{display:none}
      .msg.warn{color:#fbbf24}.msg.done{color:#86efac}
    </style>
    <div class="bar" role="region" aria-label="Job Apply Autofill steps">
      <div class="row"><span class="step"></span><span class="counts"></span><span class="grow"></span>
        <button class="again" title="Fill this step again">Fill again</button>
        <button class="next primary" title="Alt+Shift+N">Next step ›</button>
        <button class="x" title="Stop guiding" aria-label="Stop">×</button></div>
      <div class="msg" aria-live="polite"></div>
    </div>`;
    const $ = (s) => root.querySelector(s);
    $(".again").onclick = () => fillNow("Filling this step again…");
    $(".next").onclick = next;
    $(".x").onclick = stop;
    document.documentElement.appendChild(hostEl);
    return { host: hostEl, step: $(".step"), counts: $(".counts"), next: $(".next"), again: $(".again"), msg: $(".msg") };
  }

  function say(text, kind = "") {
    if (!ui) return;
    ui.msg.textContent = text;
    ui.msg.className = "msg " + kind;
  }

  function render() {
    if (!ui) ui = buildBar();
    if (!ui.host.isConnected) document.documentElement.appendChild(ui.host); // some sites rebuild <body>
    ui.step.textContent = stepName() ? "Step: " + stepName() : "This page";
    const need = stillEmpty();
    ui.counts.innerHTML = "";
    ui.counts.append(`· Filled ${last ? last.filled : 0}`);
    if (need) { const s = document.createElement("span"); s.className = "need"; s.textContent = ` · ${need} need you`; ui.counts.append(s); }
    const review = isReview();
    ui.next.disabled = review || !nextButton();
    if (review) say("Review page: check everything, then click Submit yourself. It's logged as Applied when you do.", "done");
  }

  // ---------- Actions ----------
  function fillNow(message) {
    if (window.__autofillRunning) return;
    say(message || "New step: filling…");
    if (hasChrome) chrome.runtime.sendMessage({ type: "guide-fill" }).catch(() => say("Couldn't fill: reload the page and click Fill.", "warn"));
    else if (window.__AUTOFILL_REFILL__) window.__AUTOFILL_REFILL__();
  }

  function press(el) {
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
      const Ctor = type.startsWith("pointer") && typeof PointerEvent !== "undefined" ? PointerEvent : MouseEvent;
      el.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, view: window }));
    }
    el.click();
  }

  function next() {
    if (!on) return;
    if (isReview()) { render(); return; }
    const btn = nextButton();
    if (!btn) { say("Couldn't find this site's Next / Continue button. Click it yourself; the next step still fills.", "warn"); return; }
    const need = stillEmpty();
    if (need && !warnedEmpty) {
      warnedEmpty = true;
      say(`${need} field${need > 1 ? "s" : ""} still need${need > 1 ? "" : "s"} you (orange). Press Next again to continue anyway.`, "warn");
      return;
    }
    warnedEmpty = false;
    const before = signature();
    say(`Going to the next step (“${label(btn)}”)…`);
    press(btn);
    clearTimeout(stuckTimer);
    stuckTimer = setTimeout(() => {
      if (on && signature() === before && !isReview()) {
        say("Still on this step. The site may be showing errors (usually in red): fix them, then press Next again.", "warn");
      }
    }, 6000);
  }

  function stop() {
    on = false;
    observer.disconnect();
    if (ui) ui.host.remove();
    ui = null;
    if (hasChrome) chrome.runtime.sendMessage({ type: "guide-stop" }).catch(() => {});
  }

  // A new step: the address or the step heading changed and the page has settled.
  const observer = new MutationObserver(() => {
    if (!on) return;
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      if (!on || window.__autofillRunning) return;
      if (location.host !== host) { stop(); return; }
      const sig = signature();
      if (sig === lastSig) { render(); return; }
      lastSig = sig;
      warnedEmpty = false;
      clearTimeout(stuckTimer);
      fillNow();
    }, 900);
  });

  if (hasChrome) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === "guide-next") next();
    });
  }

  window.__autofillGuide = {
    // Called by fill.js after every run with its counts.
    report(result) {
      if (!result || result.busy) return;
      if (!on && !(result.filled || result.unmatched)) return; // nothing to guide on this page
      if (!on) {
        on = true;
        host = location.host;
        observer.observe(document.documentElement, { childList: true, subtree: true });
        if (hasChrome) chrome.runtime.sendMessage({ type: "guide-start" }).catch(() => {});
      }
      last = result;
      lastSig = signature();
      render();
      if (!isReview()) {
        const need = stillEmpty();
        say(need ? "Fix the orange fields, then press Next step." : "Looks complete. Check it, then press Next step.");
      }
    },
  };
})();
