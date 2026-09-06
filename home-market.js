(() => {
  const terminal = document.getElementById("home-live-market");
  if (!terminal) return;
  const ids = {
    price: ["home-btc-price", "home-btc-change"],
    hashrate: ["home-hashrate", "home-hashrate-status"],
    spread: ["home-spot-spread", "home-spread-status"]
  };
  let snapshot;
  let timer;
  let activeRequest;
  let disposed = false;
  let lastRefreshFailed = false;
  const english = () => document.documentElement.lang.toLowerCase().startsWith("en");
  const text = (zh, en) => english() ? en : zh;
  const format = (value, digits = 2) => Number(value).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

  function render(failed = lastRefreshFailed) {
    lastRefreshFailed = failed;
    const now = Date.now();
    let degraded = failed;
    for (const [key, [valueId, statusId]] of Object.entries(ids)) {
      const valueNode = document.getElementById(valueId);
      const statusNode = document.getElementById(statusId);
      if (!valueNode || !statusNode) continue;
      const metric = snapshot?.metrics?.[key];
      let state = metric?.status || "unavailable";
      if (!Number.isFinite(metric?.value) || !(Date.parse(metric?.expiresAt) > now)) state = "unavailable";
      else if (failed || Date.parse(metric.staleAt) < now) state = "stale";
      valueNode.dataset.state = statusNode.dataset.state = state;
      statusNode.classList.remove("positive", "negative");
      if (state === "unavailable") {
        valueNode.textContent = "—";
        statusNode.textContent = text("暂不可用", "Unavailable");
        valueNode.title = statusNode.title = text("数据暂不可用，稍后自动重试", "Data unavailable; retrying automatically");
        degraded = true;
        continue;
      }
      valueNode.textContent = key === "price" ? `${format(metric.value)} USDT`
        : key === "hashrate" ? `${format(metric.value)} EH/s`
          : `${metric.value > 0 && metric.value < 0.001 ? "< 0.001" : format(metric.value, 3)} bps`;
      if (key === "price") {
        statusNode.textContent = `${metric.change24h >= 0 ? "+" : ""}${format(metric.change24h)}%`;
        if (state === "live") statusNode.classList.add(metric.change24h >= 0 ? "positive" : "negative");
        if (state === "stale") statusNode.textContent += ` · ${text("延迟", "Delayed")}`;
      } else {
        statusNode.textContent = state === "stale" ? text("延迟", "Delayed")
          : key === "hashrate" ? text("7日估算", "7d estimate") : text("现货", "Spot");
      }
      const date = new Date(metric.asOf).toLocaleString(english() ? "en-US" : "zh-CN", { hour12: false });
      const detail = key === "price" ? text("24小时涨跌幅", "24h change")
        : key === "hashrate" ? text("比特币全网算力，7日估算；查询时间", "Bitcoin network hashrate, 7-day estimate; retrieved")
          : `${text("现货最优买/卖价", "Spot best bid/ask")}: ${format(metric.bid)} / ${format(metric.ask)} USDT`;
      valueNode.title = statusNode.title = `${metric.source} · ${detail} · ${date}`;
      if (state !== "live") degraded = true;
    }
    terminal.dataset.marketState = degraded ? "degraded" : "live";
    const updated = document.getElementById("home-market-updated");
    if (updated) {
      const times = Object.values(snapshot?.metrics || {}).filter((metric) => metric?.value != null).map((metric) => Date.parse(metric.fetchedAt)).filter(Number.isFinite);
      updated.textContent = times.length
        ? `Binance / mempool.space · ${text("行情30秒 / 算力5分钟刷新", "Market 30s / hashrate 5m")} · ${text("更新", "Updated")} ${new Date(Math.max(...times)).toLocaleTimeString(english() ? "en-US" : "zh-CN", { hour12: false })}${degraded ? ` · ${text("部分数据延迟", "Some data delayed")}` : ""}`
        : text("数据连接暂不可用，稍后自动重试", "Data connection unavailable; retrying automatically");
    }
  }

  async function refresh() {
    if (disposed || document.hidden || activeRequest) return;
    clearTimeout(timer);
    const controller = new AbortController();
    activeRequest = controller;
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch("/api/home-market", { signal: controller.signal, cache: "no-store", credentials: "omit" });
      const data = await response.json();
      if (controller.signal.aborted || document.hidden || disposed) return;
      if (!data?.metrics || typeof data.metrics !== "object") throw new Error("Invalid market response");
      snapshot = data;
      render(!response.ok);
    } catch {
      if (!document.hidden && !disposed) render(true);
    } finally {
      clearTimeout(timeout);
      if (activeRequest === controller) {
        activeRequest = undefined;
        if (!disposed && !document.hidden) timer = setTimeout(refresh, 30_000);
      }
    }
  }

  function pause() {
    clearTimeout(timer);
    activeRequest?.abort();
    activeRequest = undefined;
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
    else { render(); refresh(); }
  });
  window.addEventListener("pagehide", () => { disposed = true; pause(); });
  window.addEventListener("pageshow", () => { disposed = false; refresh(); });
  new MutationObserver(() => { if (snapshot) render(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  refresh();
})();
