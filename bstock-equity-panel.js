(() => {
  const EQUITY_URL = "https://asksurf.ai/equity";
  const byId = (id) => document.getElementById(id);
  const trigger = byId("open-equity-panel");
  const dialog = byId("equity-panel");
  if (!trigger || !dialog) return;
  const host = byId("equity-panel-frame-host");
  const loading = byId("equity-panel-loading");
  const content = byId("equity-panel-content");
  const status = byId("equity-panel-status");
  let currentFrame;
  let slowTimer;

  function loadEquity() {
    if (!dialog.open) return;
    clearTimeout(slowTimer);
    // This module is independent of wallet sessions, research payments and trades.
    // Each explicit open/reload gets one isolated frame, with no parent credentials.
    const frame = document.createElement("iframe");
    currentFrame = frame;
    frame.title = "Surf 美股US Stock全览";
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox");
    frame.addEventListener("load", () => {
      if (frame !== currentFrame || !dialog.open) return;
      clearTimeout(slowTimer);
      loading.hidden = true;
      content.setAttribute("aria-busy", "false");
      // Cross-origin load is not proof that the provider's app or login succeeded.
      status.textContent = "外部页面 · Surf";
    });
    frame.addEventListener("error", () => {
      if (frame !== currentFrame || !dialog.open) return;
      clearTimeout(slowTimer);
      loading.hidden = false;
      loading.classList.add("is-error");
      content.setAttribute("aria-busy", "false");
      status.textContent = "暂时无法载入";
      byId("equity-panel-loading-title").textContent = "页面暂时无法载入";
      byId("equity-panel-loading-detail").textContent = "请使用右上角刷新，或稍后再试。";
    });
    loading.hidden = false;
    loading.classList.remove("is-error");
    content.setAttribute("aria-busy", "true");
    status.textContent = "正在连接…";
    byId("equity-panel-loading-title").textContent = "正在载入美股全览";
    byId("equity-panel-loading-detail").textContent = "连接 Surf，探索美股市场。";
    frame.src = EQUITY_URL;
    host.replaceChildren(frame);
    slowTimer = setTimeout(() => {
      if (frame !== currentFrame || !dialog.open) return;
      status.textContent = "加载较慢";
      byId("equity-panel-loading-detail").textContent = "正在等待 Surf 响应；请稍候，或使用右上角刷新重试。";
    }, 15_000);
  }

  trigger.addEventListener("click", () => {
    if (dialog.open) return;
    dialog.showModal();
    trigger.setAttribute("aria-expanded", "true");
    document.body.classList.add("equity-panel-open");
    loadEquity();
  });
  byId("close-equity-panel").addEventListener("click", () => dialog.close());
  byId("reload-equity-panel").addEventListener("click", loadEquity);
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener("close", () => {
    clearTimeout(slowTimer);
    currentFrame = undefined;
    host.replaceChildren();
    loading.hidden = true;
    content.setAttribute("aria-busy", "false");
    trigger.setAttribute("aria-expanded", "false");
    document.body.classList.remove("equity-panel-open");
    trigger.focus({ preventScroll: true });
  });
  document.addEventListener("keydown", (event) => {
    if (!dialog.open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      dialog.close();
    }
    // Do not let the terminal's order-review shortcut run behind this dialog.
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
})();
