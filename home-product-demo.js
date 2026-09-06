(() => {
  const INTERVAL = 6_000;
  const isEnglish = () => document.documentElement.lang.toLowerCase().startsWith("en");
  const localized = (zh, en) => isEnglish() ? en : zh;

  document.querySelectorAll("[data-product-demo]").forEach((root) => {
    const tabs = Array.from(root.querySelectorAll("button[data-demo-tab]"));
    const panels = tabs.map((tab) => document.getElementById(tab.getAttribute("aria-controls")));
    const toggle = root.querySelector("[data-demo-toggle]");
    const count = root.querySelector("[data-demo-count]");
    const status = root.querySelector("[data-demo-status]");
    if (!tabs.length || panels.some((panel) => !panel || !root.contains(panel))) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let current = Math.max(0, tabs.findIndex((tab) => tab.getAttribute("aria-selected") === "true"));
    let userPaused = reducedMotion.matches;
    let hovered = root.matches(":hover");
    let inViewport = false;
    let pageActive = true;
    let allowToggleFocus = false;
    let timer;
    let deadline = 0;
    let remaining = INTERVAL;
    let initialized = false;

    function tabTitle(tab) {
      const label = tab.matches("[data-demo-zh][data-demo-en]") ? tab : tab.querySelector("[data-demo-zh][data-demo-en]");
      return label ? (isEnglish() ? label.dataset.demoEn : label.dataset.demoZh) : tab.textContent.trim();
    }

    function stopTimer(reset = false) {
      if (timer != null) {
        clearTimeout(timer);
        remaining = Math.max(0, deadline - performance.now());
        timer = undefined;
      }
      if (reset) remaining = INTERVAL;
      root.dataset.running = "false";
    }

    function prewarmNext() {
      if (!inViewport || tabs.length < 2) return;
      const image = panels[(current + 1) % panels.length].querySelector("img");
      if (image) image.loading = "eager";
    }

    function syncPlayback() {
      const focused = document.activeElement;
      const focusBlocked = root.contains(focused) && !(allowToggleFocus && toggle?.contains(focused));
      const shouldRun = !userPaused && pageActive && inViewport && !document.hidden && !hovered && !focusBlocked;
      if (toggle) {
        const label = userPaused ? localized("播放演示", "Play demo") : localized("暂停演示", "Pause demo");
        toggle.textContent = label;
        toggle.setAttribute("aria-label", label);
        toggle.setAttribute("aria-pressed", String(!userPaused));
      }
      if (!shouldRun) {
        stopTimer();
        return;
      }
      root.dataset.running = "true";
      if (timer == null) {
        deadline = performance.now() + remaining;
        timer = setTimeout(() => {
          timer = undefined;
          select((current + 1) % tabs.length);
        }, remaining);
      }
    }

    function select(index, manual = false) {
      if (manual) {
        userPaused = true;
        allowToggleFocus = false;
      }
      // Re-selecting the active tab pauses at the existing progress position;
      // its CSS animation does not restart, so the timer must not restart either.
      if (initialized && index === current) {
        if (manual && status) status.textContent = tabTitle(tabs[current]);
        syncPlayback();
        return;
      }
      stopTimer(true);
      current = index;
      tabs.forEach((tab, tabIndex) => {
        const active = tabIndex === current;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;
        panels[tabIndex].hidden = !active;
        panels[tabIndex].classList.toggle("is-active", active);
      });
      if (count) count.textContent = `${String(current + 1).padStart(2, "0")} / ${String(tabs.length).padStart(2, "0")}`;
      if (manual && status) status.textContent = tabTitle(tabs[current]);
      initialized = true;
      prewarmNext();
      syncPlayback();
    }

    function translate() {
      root.querySelectorAll("[data-demo-zh][data-demo-en]").forEach((node) => {
        node.textContent = isEnglish() ? node.dataset.demoEn : node.dataset.demoZh;
      });
      panels.forEach((panel, index) => panel.setAttribute("aria-label", tabTitle(tabs[index])));
      syncPlayback();
    }

    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => select(index, true));
      tab.addEventListener("keydown", (event) => {
        let target;
        if (["ArrowRight", "ArrowDown"].includes(event.key)) target = (index + 1) % tabs.length;
        else if (["ArrowLeft", "ArrowUp"].includes(event.key)) target = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === "Home") target = 0;
        else if (event.key === "End") target = tabs.length - 1;
        else return;
        event.preventDefault();
        select(target, true);
        tabs[target].focus({ preventScroll: true });
      });
    });

    toggle?.addEventListener("click", () => {
      userPaused = !userPaused;
      // A deliberate Play action may retain focus on its own control. Focusing
      // another tab or panel still pauses rotation, so content cannot move away.
      allowToggleFocus = !userPaused;
      syncPlayback();
    });
    root.addEventListener("pointerenter", (event) => {
      if (event.pointerType === "touch") return;
      hovered = true;
      syncPlayback();
    });
    root.addEventListener("pointerleave", () => { hovered = false; syncPlayback(); });
    root.addEventListener("focusin", (event) => {
      if (!toggle?.contains(event.target)) allowToggleFocus = false;
      syncPlayback();
    });
    root.addEventListener("focusout", () => queueMicrotask(syncPlayback));
    document.addEventListener("visibilitychange", syncPlayback);
    window.addEventListener("pagehide", () => { pageActive = false; syncPlayback(); });
    window.addEventListener("pageshow", () => { pageActive = true; syncPlayback(); });
    reducedMotion.addEventListener("change", () => {
      if (reducedMotion.matches) { userPaused = true; allowToggleFocus = false; }
      syncPlayback();
    });
    new MutationObserver(translate).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });

    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        inViewport = entries.some((entry) => entry.isIntersecting);
        prewarmNext();
        syncPlayback();
      }).observe(root);
    } else {
      const updateViewport = () => {
        const bounds = root.getBoundingClientRect();
        inViewport = bounds.bottom > 0 && bounds.top < window.innerHeight;
        prewarmNext();
        syncPlayback();
      };
      window.addEventListener("scroll", updateViewport, { passive: true });
      window.addEventListener("resize", updateViewport, { passive: true });
      updateViewport();
    }
    translate();
    select(current);
  });
})();
