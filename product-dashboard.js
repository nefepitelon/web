(() => {
  window.productDashboardOwnsInteractions = true;
  const canvas = document.querySelector("#power-law-canvas");
  const section = document.querySelector("#power-law");
  if (!canvas || !section) return;

  const modelMenu = section.querySelector(".power-model-menu");
  const modelToggle = section.querySelector("#power-model-toggle");
  const modelLabel = section.querySelector("#power-model-label");
  const modelDot = modelToggle?.querySelector(".model-dot");
  const modelOptions = section.querySelectorAll("[data-model-option]");
  const viewButtons = section.querySelectorAll("[data-view]");
  const rangeButtons = section.querySelectorAll("[data-range]");
  const glowInput = section.querySelector("#power-glow");
  const metricsPanel = section.querySelector("#power-metrics-panel");
  const metricsToggle = section.querySelector("#power-metrics-toggle");
  const metricsTitle = section.querySelector("#power-metrics-title");
  const metricsList = section.querySelector("#power-metrics-list");
  const legend = section.querySelector("#power-chart-legend");
  const status = section.querySelector("#power-chart-status");
  const orbitControls = section.querySelector("#power-orbit-controls");
  const orbitHint = section.querySelector("#power-orbit-hint");
  const orbitReset = section.querySelector("#power-orbit-reset");
  const orbitAuto = section.querySelector("#power-orbit-auto");
  const isHomePage = document.body.classList.contains("home-page");

  function createHomeOrbitAnimator({ camera, draw, canAnimate, enabled = true, minZoom = 0.55, onState = () => {}, now = () => performance.now(), schedule = setTimeout, cancel = clearTimeout }) {
    const FRAME_MS = 1000 / 30;
    const IDLE_MS = 12_000;
    let timer;
    let running = false;
    let origin = null;
    let startedAt = 0;
    let lastFrameAt = 0;
    let pausedAt = null;
    let resumeAt = 0;

    function setRunning(next) {
      if (running === next) return;
      running = next;
      onState();
    }

    function stop(rebase = false) {
      if (timer != null) cancel(timer);
      timer = undefined;
      if (rebase) {
        origin = null;
        pausedAt = null;
      } else if (origin && pausedAt == null) {
        // Freeze the last rendered phase. Returning to the viewport must not
        // repeatedly accumulate a new orbit center or magnification.
        pausedAt = lastFrameAt;
      }
      setRunning(false);
    }

    function frame() {
      timer = undefined;
      if (!enabled || !canAnimate() || now() < resumeAt) { sync(); return; }
      const time = now();
      if (!origin) {
        origin = { ...camera };
        startedAt = time;
      } else if (pausedAt != null) {
        startedAt += time - pausedAt;
        pausedAt = null;
      }
      lastFrameAt = time;
      const elapsed = time - startedAt;
      const ramp = Math.min(elapsed / 4_000, 1);
      const ease = ramp * ramp * (3 - 2 * ramp);
      // A small orbit around the current view, with a zero-velocity entrance.
      // Manual yaw, pitch, zoom and pan become the next origin; no reset jump.
      const facingCenter = Math.round(origin.yaw / Math.PI) * Math.PI;
      const yawMargin = Math.max(0, Math.PI / 2 - 0.05 - Math.abs(origin.yaw - facingCenter));
      const yawAmplitude = Math.min(0.20, yawMargin);
      const pitchAmplitude = Math.max(0, Math.min(0.055, origin.pitch + 0.82, 0.92 - origin.pitch));
      const zoomAmplitude = Math.max(0, Math.min(0.045, 1 - minZoom / origin.zoom, 2.25 / origin.zoom - 1));
      camera.yaw = origin.yaw + yawAmplitude * Math.sin(elapsed * Math.PI * 2 / 48_000) * ease;
      camera.pitch = origin.pitch + pitchAmplitude * Math.sin(elapsed * Math.PI * 2 / 60_000) * ease;
      camera.zoom = origin.zoom * (1 + zoomAmplitude * Math.sin(elapsed * Math.PI * 2 / 24_000) * ease);
      setRunning(true);
      draw();
      timer = schedule(frame, FRAME_MS);
    }

    function sync() {
      if (!enabled || !canAnimate()) { stop(); return; }
      if (timer != null) return;
      const wait = Math.max(0, resumeAt - now());
      if (wait > 0) {
        setRunning(false);
        timer = schedule(() => { timer = undefined; sync(); }, wait);
      } else {
        frame();
      }
    }

    return {
      sync,
      isRunning: () => running,
      isEnabled: () => enabled,
      setEnabled(next) {
        enabled = Boolean(next);
        stop();
        if (enabled) resumeAt = 0;
        onState();
        sync();
      },
      interaction() {
        stop(true);
        resumeAt = now() + IDLE_MS;
        sync();
      },
      reframe() {
        stop(true);
        sync();
      }
    };
  }

  function projectOrbitPoint(point, width, height, view) {
    const cosY = Math.cos(view.yaw);
    const sinY = Math.sin(view.yaw);
    const cosX = Math.cos(view.pitch);
    const sinX = Math.sin(view.pitch);
    const rotatedX = point.x * cosY - point.z * sinY;
    const yawDepth = point.x * sinY + point.z * cosY;
    const rotatedY = point.y * cosX - yawDepth * sinX;
    const rotatedZ = point.y * sinX + yawDepth * cosX;
    const perspective = 13 / Math.max(5.5, 13 - rotatedZ);
    const scale = Math.min(width / 11.2, height / 7.4) * view.zoom;
    return {
      x: width * 0.48 + view.panX + rotatedX * scale * perspective,
      y: height * 0.67 + view.panY - rotatedY * scale * perspective,
      depth: rotatedZ,
      perspective
    };
  }

  function fitHomeCamera(width, height) {
    const view = { yaw: -0.12, pitch: 0.28, zoom: 0.70, panX: 0, panY: 18 };
    if (!(width > 0 && height > 0)) return view;
    const compact = width < 720;
    // Leave room for the orbit controls, axis labels, and the mobile metrics.
    const left = Math.min(80, width * 0.18);
    const right = width - 24;
    const top = compact ? 104 : 88;
    const bottom = height - (compact ? 250 : 78);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    // Bound the entire world box (including the highest axis/grid) throughout
    // every allowed default orbit, not just the initial data points.
    for (let yawStep = 0; yawStep <= 20; yawStep += 1) {
      for (let pitchStep = 0; pitchStep <= 10; pitchStep += 1) {
        for (const zoom of [0.955, 1.045]) {
          const sample = { ...view, yaw: -0.32 + yawStep * 0.02, pitch: 0.225 + pitchStep * 0.011, zoom, panX: 0, panY: 0 };
          for (const x of [-5, 5]) for (const y of [0, 5.75]) for (const z of [-1.7, 1.7]) {
            const point = projectOrbitPoint({ x, y, z }, width, height, sample);
            minX = Math.min(minX, point.x - width * 0.48);
            maxX = Math.max(maxX, point.x - width * 0.48);
            minY = Math.min(minY, point.y - height * 0.67);
            maxY = Math.max(maxY, point.y - height * 0.67);
          }
        }
      }
    }
    // The extra 3% absorbs between-sample extrema and endpoint stroke widths.
    view.zoom = Math.min(0.74, (right - left) / (maxX - minX), Math.max(40, bottom - top) / (maxY - minY)) * 0.97;
    view.panX = (left + right) / 2 - width * 0.48 - (minX + maxX) / 2 * view.zoom;
    view.panY = (top + bottom) / 2 - height * 0.67 - (minY + maxY) / 2 * view.zoom;
    return view;
  }

  const DAY_MS = 86_400_000;
  const state = {
    indicator: "cost-basis",
    view: isHomePage ? "3d" : "2d",
    range: "all",
    glow: false,
    loading: false,
    error: null,
    data: null
  };
  const defaultCamera = Object.freeze({ yaw: -0.12, pitch: 0.28, zoom: 0.96, panX: 0, panY: 18 });
  const minCameraZoom = isHomePage ? 0.20 : 0.55;
  const initialCanvasSize = canvas.getBoundingClientRect();
  const camera = isHomePage ? fitHomeCamera(initialCanvasSize.width, initialCanvasSize.height) : { ...defaultCamera };
  let cameraFitManaged = isHomePage;
  let fittedSize = `${initialCanvasSize.width}:${initialCanvasSize.height}`;
  const activePointers = new Map();
  let pointerGesture = null;
  const payloadPromises = new Map();
  let orbitAnimator = null;
  let chartInViewport = false;
  let pageActive = true;

  const palette = {
    price: "#9aa39f",
    green: "#75f39a",
    cyan: "#69d9f2",
    orange: "#f0a84d",
    red: "#ff6d67",
    purple: "#9b7cf7",
    yellow: "#e8cf62"
  };

  const isEnglish = () => document.documentElement.lang.toLowerCase().startsWith("en");
  const copy = (zh, en) => isEnglish() ? en : zh;
  const parseDate = (value) => {
    const date = value instanceof Date ? value : new Date(String(value).includes("T") ? value : `${value}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const number = (value) => value === null || value === undefined || value === ""
    ? null
    : Number.isFinite(Number(value)) ? Number(value) : null;
  const usd = (value) => Number.isFinite(Number(value))
    ? new Intl.NumberFormat(isEnglish() ? "en-US" : "zh-CN", { style: "currency", currency: "USD", maximumFractionDigits: Math.abs(Number(value)) >= 100 ? 0 : 2 }).format(Number(value))
    : "--";
  const ratio = (value, digits = 4) => Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "--";
  const percent = (value, digits = 1) => Number.isFinite(Number(value)) ? `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(digits)}%` : "--";
  const unsignedPercent = (value, digits = 1) => Number.isFinite(Number(value)) ? `${Number(value).toFixed(digits)}%` : "--";
  const fractionPercent = (value, digits = 1) => Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(digits)}%` : "--";
  const dateLabel = (value) => {
    const date = parseDate(value);
    if (!date) return "--";
    return new Intl.DateTimeFormat(isEnglish() ? "en-US" : "zh-CN", { year: "numeric", month: "short", day: "2-digit" }).format(date);
  };

  const avg = (rows, key, count) => {
    const values = rows.slice(-count).map((row) => number(row[key])).filter(Number.isFinite);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  };
  const thresholdsFor = (config) => config.thresholds || (config.threshold ? [config.threshold] : []);

  const indicatorConfig = {
    "cost-basis": {
      name: ["关键成本基础定价模型", "Key Cost-Basis Pricing Models"],
      short: "COST BASIS",
      dot: "model-log-growth",
      endpoint: "/api/cost-basis",
      scale: "log",
      lines: [
        { key: "price", label: "BTC Price", color: palette.price },
        { key: "sth", label: "STH Cost Basis", color: palette.red },
        { key: "tmmp", label: "True Market Mean", color: palette.purple }
      ],
      normalize(payload) {
        return {
          rows: payload.series.map((row) => ({ date: parseDate(row.date), price: number(row.price), sth: number(row.sth), tmmp: number(row.tmmp) })),
          snapshot: payload.snapshot,
          source: payload.sources?.mode || "BGeometrics · CoinGlass · DAILY"
        };
      },
      metrics(data) {
        const value = data.snapshot || {};
        return [
          [copy("BTC 实时价格", "BTC Live Price"), usd(value.price)],
          ["STH Cost Basis", usd(value.sth)],
          ["True Market Mean", usd(value.tmmp)],
          [copy("STH − TMMP", "STH − TMMP"), usd(value.gap), number(value.gap) < 0 ? "danger" : "success"]
        ];
      }
    },
    "sth-ratio": {
      name: ["STH-RP / TMMP 比例", "STH-RP / TMMP Ratio"],
      short: "STH / TMMP",
      dot: "model-power-law",
      endpoint: "/api/cost-basis",
      scale: "linear",
      threshold: { value: 0.75, label: "0.75 SIGNAL", color: palette.red },
      lines: [
        { key: "price", label: "BTC Price", color: palette.price, axis: "price" },
        { key: "value", label: "STH-RP / TMMP", color: palette.cyan }
      ],
      normalize(payload) {
        return {
          rows: payload.series.map((row) => ({ date: parseDate(row.date), price: number(row.price), value: number(row.sth) / number(row.tmmp) })),
          snapshot: payload.ratioSnapshot,
          source: "BGeometrics · CoinGlass · DAILY"
        };
      },
      metrics(data) {
        const value = data.snapshot || {};
        return [
          [copy("当前比例", "Current Ratio"), ratio(value.current)],
          [copy("7 日均值", "7D Average"), ratio(value.average7)],
          [copy("30 日均值", "30D Average"), ratio(value.average30)],
          [copy("距 0.75 信号线", "Distance to 0.75"), ratio(value.distanceToThreshold), number(value.distanceToThreshold) < 0 ? "danger" : "success"]
        ];
      }
    },
    "lth-loss": {
      name: ["LTH 亏损市值占比", "LTH Market Cap in Loss"],
      short: "LTH LOSS",
      dot: "model-pl-drawdown",
      endpoint: "/api/lth-market-cap-loss?schema=6",
      scale: "linear",
      threshold: { value: 27, label: "27% BEAR THRESHOLD", color: palette.red },
      lines: [
        { key: "price", label: "BTC Price", color: palette.price, axis: "price" },
        { key: "value", label: "LTH Market Cap in Loss", color: palette.orange }
      ],
      normalize(payload) {
        return {
          rows: payload.series.map((row) => ({ date: parseDate(row.date), price: number(row.price), value: number(row.ratio) })),
          snapshot: payload.snapshot,
          source: payload.sources?.history || "BGeometrics · PUBLIC DAILY"
        };
      },
      metrics(data) {
        const value = data.snapshot || {};
        return [
          [copy("当前比率", "Current Ratio"), percent(value.ratio).replace(/^\+/, "")],
          [copy("熊市阈值", "Bear Threshold"), "27.0%"],
          [copy("7D / 30D 均值", "7D / 30D Avg"), `${ratio(value.average7, 1)}% / ${ratio(value.average30, 1)}%`],
          [copy("BTC 参考价格", "BTC Reference"), usd(value.price)]
        ];
      }
    },
    rpl: {
      name: ["实现利润 / 实现损失比", "Realized Profit / Loss Ratio"],
      short: "REALIZED P/L",
      dot: "model-log-risk",
      endpoint: "/api/realized-profit-loss",
      scale: "linear",
      threshold: { value: 1, label: "1.0 BOTTOM ZONE", color: palette.red },
      lines: [
        { key: "price", label: "BTC Price", color: palette.price, axis: "price" },
        { key: "value", label: "Profit / Loss Ratio", color: palette.green }
      ],
      normalize(payload) {
        return {
          rows: payload.series.map((row) => ({ date: parseDate(row.date), price: number(row.price), value: number(row.ratio) })),
          snapshot: payload.snapshot,
          source: payload.sources?.ratio || "BGeometrics · DAILY"
        };
      },
      metrics(data) {
        const value = data.snapshot || {};
        return [
          [copy("当前比率", "Current Ratio"), ratio(value.current)],
          [copy("7D / 30D 均值", "7D / 30D Avg"), `${ratio(value.average7)} / ${ratio(value.average30)}`],
          [copy("距离 1.0", "Distance to 1.0"), ratio(value.distanceToOne), number(value.distanceToOne) < 0 ? "danger" : "success"],
          [copy("BTC 参考价格", "BTC Reference"), usd(value.price)]
        ];
      }
    },
    "median-rp": {
      name: ["中位实现价格", "Median Realized Price"],
      short: "MEDIAN RP",
      dot: "model-median-rp",
      endpoint: "/api/median-realized-price",
      scale: "log",
      lines: [
        { key: "price", label: "BTC Price", color: palette.price },
        { key: "median", label: "Median Realized Price", color: palette.orange }
      ],
      normalize(payload) {
        return {
          rows: payload.series.map((row) => ({ date: parseDate(row.date), price: number(row.price), median: number(row.median) })),
          snapshot: payload.snapshot,
          source: payload.sources?.median || "Public Median RP Snapshots"
        };
      },
      metrics(data) {
        const value = data.snapshot || {};
        return [
          [copy("BTC 实时价格", "BTC Live Price"), usd(value.price)],
          [copy("中位实现价格", "Median Realized Price"), usd(value.median)],
          [copy("价格 / 中位数", "Price / Median"), ratio(value.ratio)],
          [copy("相对中位成本", "Vs. Median Cost"), percent(value.distancePercent), number(value.distancePercent) < 0 ? "danger" : "success"]
        ];
      }
    },
    "lth-sth": {
      name: ["LTH / STH 成本基础比", "LTH / STH Cost-Basis Ratio"],
      short: "LTH / STH",
      dot: "model-lth-sth",
      endpoint: "/api/lth-sth-ratio?schema=2",
      scale: "linear",
      threshold: { value: 0.48, label: "0.48 RECOVERY", color: palette.green },
      lines: [
        { key: "price", label: "BTC Price", color: palette.price, axis: "price" },
        { key: "value", label: "LTH / STH Ratio", color: palette.cyan }
      ],
      normalize(payload) {
        return {
          rows: payload.series.map((row) => ({ date: parseDate(row.date), price: number(row.price), value: number(row.ratio) })),
          snapshot: payload.snapshot,
          source: payload.sources?.history || "BGeometrics · PUBLIC DAILY"
        };
      },
      metrics(data) {
        const value = data.snapshot || {};
        return [
          [copy("当前比率", "Current Ratio"), ratio(value.ratio)],
          ["LTH Realized Price", usd(value.lth)],
          ["STH Realized Price", usd(value.sth)],
          [copy("距 0.48 恢复线", "Distance to 0.48"), ratio(value.distanceToThreshold), number(value.distanceToThreshold) < 0 ? "danger" : "success"]
        ];
      }
    },
    "lth-rp": {
      name: ["长期持有者实现价格", "LTH Realized Price"],
      short: "LTH RP",
      dot: "model-lth-rp",
      endpoint: "/api/lth-sth-ratio?schema=2",
      scale: "log",
      lines: [
        { key: "price", label: "BTC Price", color: palette.price },
        { key: "lth", label: "LTH Realized Price", color: palette.green },
        { key: "sth", label: "STH Realized Price", color: palette.red }
      ],
      normalize(payload) {
        return {
          rows: payload.series.map((row) => ({ date: parseDate(row.date), price: number(row.price), lth: number(row.lth), sth: number(row.sth) })),
          snapshot: payload.snapshot,
          source: payload.sources?.history || "BGeometrics · PUBLIC DAILY"
        };
      },
      metrics(data) {
        const value = data.snapshot || {};
        const premium = number(value.price) && number(value.lth) ? (number(value.price) / number(value.lth) - 1) * 100 : null;
        return [
          [copy("BTC 参考价格", "BTC Reference"), usd(value.price)],
          ["LTH Realized Price", usd(value.lth)],
          ["STH Realized Price", usd(value.sth)],
          [copy("价格高于 LTH 成本", "Price vs. LTH Cost"), percent(premium), number(premium) < 0 ? "danger" : "success"]
        ];
      }
    },
    "supply-pl": {
      name: ["活跃盈亏供应比", "Active Supply Profit / Loss"],
      short: "SUPPLY P/L",
      dot: "model-supply-pl",
      endpoint: "/api/supply-profit-loss-ratio?schema=1",
      scale: "linear",
      threshold: { value: 1, label: "1.0 BEAR THRESHOLD", color: palette.red },
      lines: [
        { key: "price", label: "BTC Price", color: palette.price, axis: "price" },
        { key: "value", label: "Profit / Loss Ratio · 7D MA", color: palette.yellow }
      ],
      normalize(payload) {
        return {
          rows: payload.series.map((row) => ({ date: parseDate(row.date), price: number(row.price), value: number(row.ratio) })),
          snapshot: payload.snapshot,
          source: payload.sources?.history || "BGeometrics · PUBLIC DAILY"
        };
      },
      metrics(data) {
        const value = data.snapshot || {};
        return [
          [copy("当前比率（7D MA）", "Current Ratio (7D MA)"), ratio(value.ratio)],
          [copy("盈利 / 亏损供应", "Profit / Loss Supply"), `${ratio(value.profitShare, 1)}% / ${ratio(value.lossShare, 1)}%`],
          [copy("7D / 30D 均值", "7D / 30D Avg"), `${ratio(value.average7)} / ${ratio(value.average30)}`],
          [copy("BTC 参考价格", "BTC Reference"), usd(value.price)]
        ];
      }
    },
    "median-mvrv": {
      name: ["中位数 MVRV", "Median MVRV"],
      short: "MEDIAN MVRV",
      dot: "model-median-mvrv",
      endpoint: "/api/median-realized-price",
      scale: "linear",
      threshold: { value: 1, label: "1.0 BREAK-EVEN", color: palette.red },
      lines: [
        { key: "price", label: "BTC Price", color: palette.price, axis: "price" },
        { key: "value", label: "Median MVRV", color: palette.orange }
      ],
      normalize(payload) {
        const rows = payload.series
          .filter((row) => Number.isFinite(number(row.median)) && number(row.median) > 0)
          .map((row) => ({ date: parseDate(row.date), price: number(row.price), value: number(row.price) / number(row.median) }));
        const snapshot = payload.snapshot ? {
          ...payload.snapshot,
          current: number(payload.snapshot.ratio),
          average7: avg(rows, "value", 7),
          average30: avg(rows, "value", 30),
          distanceToOne: number(payload.snapshot.ratio) - 1
        } : null;
        return { rows, snapshot, source: payload.sources?.median || "Public Median RP Snapshots" };
      },
      metrics(data) {
        const value = data.snapshot || {};
        return [
          [copy("当前中位数 MVRV", "Current Median MVRV"), ratio(value.current)],
          [copy("中位实现价格", "Median Realized Price"), usd(value.median)],
          [copy("距离 1.0", "Distance to 1.0"), ratio(value.distanceToOne), number(value.distanceToOne) < 0 ? "danger" : "success"],
          [copy("BTC 参考价格", "BTC Reference"), usd(value.price)]
        ];
      }
    },
    "mvrv-bands": {
      name: ["标准调整 MVRV 频段", "Std-Adjusted MVRV Bands"],
      short: "MVRV BANDS",
      dot: "model-mvrv-bands",
      endpoint: "/api/mvrv-bands",
      scale: "linear",
      thresholds: [
        { value: -1, label: "-1 SIGMA", color: palette.green },
        { value: 0, label: "4Y MEAN", color: palette.cyan },
        { value: 1, label: "+1 SIGMA", color: palette.red }
      ],
      lines: [
        { key: "price", label: "BTC Price", color: palette.price, axis: "price" },
        { key: "mvrv", label: "MVRV", color: palette.orange },
        { key: "minusOne", label: "-1 Sigma", color: palette.green },
        { key: "mean", label: "4Y Mean", color: palette.cyan },
        { key: "plusOne", label: "+1 Sigma", color: palette.red }
      ],
      normalize(payload) {
        return {
          rows: payload.series.map((row) => ({ date: parseDate(row.date), price: number(row.price), mvrv: number(row.mvrv), minusOne: number(row.minusOne), mean: number(row.mean), plusOne: number(row.plusOne) })),
          snapshot: payload.snapshot,
          source: payload.sources?.history || "Coin Metrics · 4Y ROLLING"
        };
      },
      metrics(data) {
        const value = data.snapshot || {};
        return [
          [copy("当前 MVRV", "Current MVRV"), ratio(value.currentMvrv ?? value.mvrv, 3)],
          ["Z-Score", ratio(value.zscore, 2)],
          [copy("4 年均值 / 标准差", "4Y Mean / Std"), `${ratio(value.mean, 3)} / ${ratio(value.std, 3)}`],
          [copy("估值阶段", "Valuation Phase"), String(value.phase || "--")]
        ];
      }
    },
    vdd: {
      name: ["价值日销毁倍数", "Value Days Destroyed Multiple"],
      short: "VDD MULTIPLE",
      dot: "model-vdd",
      endpoint: "/api/vdd-multiple?schema=1",
      scale: "linear",
      thresholds: [
        { value: 0.75, label: "0.75 ACCUMULATION", color: palette.green },
        { value: 2.9, label: "2.9 DISTRIBUTION", color: palette.red }
      ],
      lines: [
        { key: "price", label: "BTC Price", color: palette.price, axis: "price" },
        { key: "value", label: "VDD Multiple", color: palette.yellow }
      ],
      normalize(payload) {
        return {
          rows: payload.series.map((row) => ({ date: parseDate(row.date), price: number(row.price), value: number(row.vdd) })),
          snapshot: payload.snapshot,
          source: payload.sources?.history || "BGeometrics · PUBLIC DAILY"
        };
      },
      metrics(data) {
        const value = data.snapshot || {};
        return [
          [copy("当前 VDD", "Current VDD"), ratio(value.vdd, 2)],
          [copy("7D / 30D 均值", "7D / 30D Avg"), `${ratio(value.average7, 2)} / ${ratio(value.average30, 2)}`],
          [copy("当前区域", "Current Zone"), String(value.zone || "--")],
          [copy("近期低点", "Recent Low"), `${ratio(value.recentLow, 2)} · ${dateLabel(value.recentLowDate)}`]
        ];
      }
    },
    "lth-nupl": {
      name: ["实体调整 LTH-NUPL", "Entity-Adjusted LTH-NUPL"],
      short: "LTH-NUPL",
      dot: "model-lth-nupl",
      endpoint: "/api/lth-nupl?schema=1",
      scale: "linear",
      thresholds: [
        { value: 0, label: "CAPITULATION", color: palette.red },
        { value: 0.25, label: "HOPE / FEAR", color: palette.purple }
      ],
      lines: [
        { key: "price", label: "BTC Price", color: palette.price, axis: "price" },
        { key: "value", label: "LTH-NUPL", color: palette.cyan }
      ],
      normalize(payload) {
        return {
          rows: payload.series.map((row) => ({ date: parseDate(row.date), price: number(row.price), value: number(row.nupl) })),
          snapshot: payload.snapshot,
          source: payload.sources?.history || "BGeometrics · ENTITY ADJUSTED"
        };
      },
      metrics(data) {
        const value = data.snapshot || {};
        return [
          [copy("当前 LTH-NUPL", "Current LTH-NUPL"), ratio(value.nupl, 4)],
          [copy("7D / 30D 均值", "7D / 30D Avg"), `${ratio(value.average7, 3)} / ${ratio(value.average30, 3)}`],
          [copy("情绪区域", "Sentiment Zone"), String(value.zone || "--")],
          [copy("距希望阈值", "Distance to Hope"), ratio(value.distanceToHope, 3)]
        ];
      }
    },
    "mvrv-price-bands": {
      name: ["标准调整后的 MVRV 价格区间", "Std-Adjusted MVRV Price Bands"],
      short: "MVRV PRICE BANDS",
      dot: "model-mvrv-price-bands",
      endpoint: "/api/mvrv-bands",
      scale: "log",
      lines: [
        { key: "price", label: "BTC Price", color: "#f2f4ef" },
        { key: "minusOne", label: "-1 Sigma Price", color: palette.green },
        { key: "minusHalf", label: "-0.5 Sigma Price", color: "#9adf78" },
        { key: "mean", label: "Fair Value", color: palette.yellow },
        { key: "plusOne", label: "+1 Sigma Price", color: palette.orange },
        { key: "plusTwo", label: "+2 Sigma Price", color: palette.red }
      ],
      normalize(payload) {
        return {
          rows: payload.series.map((row) => ({ date: parseDate(row.date), price: number(row.price), minusOne: number(row.priceMinusOne), minusHalf: number(row.priceMinusHalf), mean: number(row.priceMean), plusOne: number(row.pricePlusOne), plusTwo: number(row.pricePlusTwo) })),
          snapshot: payload.snapshot,
          source: payload.sources?.history || "Coin Metrics · MVRV PRICE BANDS"
        };
      },
      metrics(data) {
        const value = data.snapshot || {};
        const bands = value.priceBands || {};
        return [
          [copy("BTC 实时价格", "BTC Live Price"), usd(value.price)],
          [copy("-0.5σ / 公允价值", "-0.5σ / Fair Value"), `${usd(bands.minusHalf)} / ${usd(bands.mean)}`],
          [copy("-1σ / +2σ", "-1σ / +2σ"), `${usd(bands.minusOne)} / ${usd(bands.plusTwo)}`],
          [copy("当前区间", "Current Zone"), String(value.priceZone || value.phase || "--")]
        ];
      }
    },
    "stock-to-flow": {
      name: ["库存与流量价格模型", "Stock-to-Flow Price Model"],
      short: "STOCK TO FLOW",
      dot: "model-stock-to-flow",
      endpoint: "/api/stock-to-flow",
      scale: "log",
      lines: [
        { key: "price", label: "BTC Price", color: palette.orange },
        { key: "minusTwo", label: "-2 Sigma", color: "#344c79" },
        { key: "minusOne", label: "-1 Sigma", color: "#5876c8" },
        { key: "model", label: "S2F Model", color: palette.cyan },
        { key: "plusOne", label: "+1 Sigma", color: "#5876c8" },
        { key: "plusTwo", label: "+2 Sigma", color: "#344c79" }
      ],
      normalize(payload) {
        return {
          rows: payload.series.map((row) => ({ date: parseDate(row.date), price: number(row.price), model: number(row.modelPrice), minusTwo: number(row.minusTwo), minusOne: number(row.minusOne), plusOne: number(row.plusOne), plusTwo: number(row.plusTwo) })),
          snapshot: payload.snapshot,
          source: payload.sources?.history || "Coin Metrics · PROTOCOL SUPPLY"
        };
      },
      metrics(data) {
        const value = data.snapshot || {};
        return [
          [copy("当前 S2F", "Current S2F"), ratio(value.stockToFlow, 1)],
          [copy("模型价格", "Model Price"), usd(value.modelPrice)],
          [copy("现价偏离", "Spot Deviation"), percent(value.spotDiscountPct ?? value.deviationPct, 1), "danger"],
          [copy("估值区域", "Valuation Zone"), String(value.zone || "--")]
        ];
      }
    },
    "cycle-timing": {
      name: ["比特币周期时间模型", "Bitcoin Cycle Timing"],
      short: "CYCLE TIMING",
      dot: "model-cycle-timing",
      endpoint: "/api/cycle-timing",
      scale: "log",
      lines: [{ key: "price", label: "BTC Price", color: palette.cyan }],
      normalize(payload) {
        const mode = payload.modes?.[payload.snapshot?.defaultMode || "halving-top"];
        return {
          rows: payload.series.map((row) => ({ date: parseDate(row.date), price: number(row.price) })),
          snapshot: { ...payload.snapshot, mode, futureCycle: payload.futureCycle, asOf: payload.generatedAt },
          source: payload.sources?.history || "Coin Metrics · CYCLE ANCHORS"
        };
      },
      metrics(data) {
        const value = data.snapshot || {};
        const projection = value.mode?.projection || {};
        const future = value.futureCycle?.nodes || [];
        return [
          [copy("本轮推演顶部", "Projected Cycle Top"), dateLabel(projection.projectedDate)],
          [copy("历史均值天数", "Historical Mean Days"), Number.isFinite(number(projection.days)) ? `${number(projection.days)}D` : "--"],
          [copy("下一次减半", "Next Halving"), dateLabel(future.find((node) => node.id === "next-halving")?.date)],
          [copy("下一轮牛顶窗口", "Next Bull-Top Window"), dateLabel(future.find((node) => node.id === "next-bull-top")?.date)]
        ];
      }
    },
    rhodl: {
      name: ["实现 HODL 比率", "Realized HODL Ratio"],
      short: "RHODL",
      dot: "model-rhodl",
      endpoint: "/api/rhodl-ratio?schema=1",
      scale: "log",
      lines: [
        { key: "price", label: "BTC Price", color: palette.price, axis: "price" },
        { key: "value", label: "RHODL", color: palette.orange },
        { key: "monthly", label: "RHODL · 1M", color: palette.yellow }
      ],
      normalize(payload) {
        return {
          rows: payload.series.map((row) => ({ date: parseDate(row.date), price: number(row.price), value: number(row.rhodl), monthly: number(row.rhodl1m) })),
          snapshot: payload.snapshot,
          source: payload.sources?.history || "BGeometrics · RHODL"
        };
      },
      metrics(data) {
        const value = data.snapshot || {};
        return [
          [copy("当前 RHODL", "Current RHODL"), ratio(value.rhodl, 0)],
          [copy("7D / 30D 均值", "7D / 30D Avg"), `${ratio(value.average7, 0)} / ${ratio(value.average30, 0)}`],
          [copy("短期趋势", "Short Trend"), String(value.trend || "--")],
          [copy("周期区域", "Cycle Zone"), String(value.zone || "--")]
        ];
      }
    },
    "lth-rpl": {
      name: ["实体调整长期持有者已实现盈亏比", "Entity-Adjusted LTH Realized Profit / Loss"],
      short: "LTH REALIZED P/L",
      dot: "model-lth-rpl",
      endpoint: "/api/lth-realized-profit-loss?schema=1",
      scale: "log",
      threshold: { value: 1, label: "1.0 PIVOT", color: palette.red },
      lines: [
        { key: "price", label: "BTC Price", color: palette.price, axis: "price" },
        { key: "value", label: "LTH Realized P/L", color: palette.orange },
        { key: "average30", label: "30D Average", color: palette.yellow }
      ],
      normalize(payload) {
        return {
          rows: payload.series.map((row) => ({ date: parseDate(row.date), price: number(row.price), value: number(row.ratio), average30: number(row.average30) })),
          snapshot: payload.snapshot,
          source: payload.sources?.history || "BGeometrics · ENTITY ADJUSTED"
        };
      },
      metrics(data) {
        const value = data.snapshot || {};
        return [
          [copy("当前盈亏比", "Current P/L Ratio"), ratio(value.current, 3)],
          [copy("7D / 30D 均值", "7D / 30D Avg"), `${ratio(value.average7, 3)} / ${ratio(value.average30, 3)}`],
          [copy("水下天数", "Underwater Days"), Number.isFinite(number(value.underwaterDays)) ? `${number(value.underwaterDays)}D` : "--"],
          [copy("当前状态", "Current State"), String(value.zone || "--")]
        ];
      }
    },
    slrv: {
      name: ["短线至长线已实现价值比", "Short to Long-Term Realized Value Ratio"],
      short: "SLRV · 7D MA",
      dot: "model-slrv",
      endpoint: "/api/slrv-ratio?schema=1",
      scale: "log",
      threshold: { value: 0.04, label: "BOTTOM ZONE", color: palette.red },
      lines: [
        { key: "price", label: "BTC Price", color: palette.price, axis: "price" },
        { key: "value", label: "SLRV · 7D MA", color: palette.orange },
        { key: "average30", label: "SLRV · 30D MA", color: palette.yellow }
      ],
      normalize(payload) {
        return {
          rows: payload.series.map((row) => ({ date: parseDate(row.date), price: number(row.price), value: number(row.slrv), average30: number(row.average30) })),
          snapshot: payload.snapshot,
          source: payload.sources?.history || "BGeometrics · HODL WAVES"
        };
      },
      metrics(data) {
        const value = data.snapshot || {};
        return [
          [copy("当前 SLRV", "Current SLRV"), ratio(value.current, 4)],
          [copy("7D / 30D 均值", "7D / 30D Avg"), `${ratio(value.average7, 4)} / ${ratio(value.average30, 4)}`],
          [copy("距底部区", "Distance to Bottom"), ratio(value.distanceToBottom, 4)],
          [copy("当前区域", "Current Zone"), String(value.zone || "--")]
        ];
      }
    },
    "realized-cap-hodl": {
      name: ["已实现市值 HODL 波", "Realized Cap HODL Waves"],
      short: "REALIZED CAP HODL",
      dot: "model-realized-cap-hodl",
      endpoint: "/api/realized-cap-hodl-waves?schema=1",
      scale: "linear",
      threshold: { value: 84, label: "84% DEEP LOCK", color: palette.green },
      lines: [
        { key: "price", label: "BTC Price", color: palette.price, axis: "price" },
        { key: "value", label: ">3M Supply", color: palette.green },
        { key: "average30", label: ">3M · 30D MA", color: palette.cyan }
      ],
      normalize(payload) {
        return {
          rows: payload.series.map((row) => ({ date: parseDate(row.date), price: number(row.price), value: number(row.overThreeMonths) * 100, average30: number(row.average30) * 100 })),
          snapshot: payload.snapshot,
          source: payload.sources?.history || "Bitcoin Data · HODL WAVES"
        };
      },
      metrics(data) {
        const value = data.snapshot || {};
        return [
          [copy(">3 个月筹码占比", ">3M Supply Share"), fractionPercent(value.current, 2)],
          [copy("7D / 30D 均值", "7D / 30D Avg"), `${fractionPercent(value.average7, 1)} / ${fractionPercent(value.average30, 1)}`],
          [copy("历史峰值", "All-Time Peak"), `${fractionPercent(value.allTimePeak, 2)} · ${dateLabel(value.allTimePeakDate)}`],
          [copy("筹码状态", "Supply State"), String(value.zone || "--")]
        ];
      }
    },
    "lth-spent": {
      name: ["LTH 花费价格低于水位", "LTH Spent Price Under-water"],
      short: "LTH SPENT PRICE",
      dot: "model-lth-spent",
      endpoint: "/api/lth-spent-price?schema=1",
      scale: "log",
      lines: [
        { key: "price", label: "BTC Price", color: palette.price },
        { key: "spent", label: "LTH Spent Price", color: palette.green },
        { key: "average7", label: "LTH Spent · 7D MA", color: palette.cyan }
      ],
      normalize(payload) {
        return {
          rows: payload.series.map((row) => ({ date: parseDate(row.date), price: number(row.price), spent: number(row.spentPrice), average7: number(row.spentAverage7) })),
          snapshot: payload.snapshot,
          source: payload.sources?.history || "BGeometrics · LTH SPENT PRICE"
        };
      },
      metrics(data) {
        const value = data.snapshot || {};
        return [
          [copy("BTC 实时价格", "BTC Live Price"), usd(value.price)],
          [copy("LTH 花费价格", "LTH Spent Price"), usd(value.current)],
          [copy("价格 / 花费成本", "Price / Spent Cost"), ratio(value.priceToSpentRatio, 3)],
          [copy("水下状态 / 天数", "Underwater / Days"), `${value.underwater ? copy("是", "Yes") : copy("否", "No")} · ${number(value.underwaterDays) ?? 0}D`]
        ];
      }
    },
    "percent-profit": {
      name: ["盈利供应百分比", "Percent Supply in Profit"],
      short: "SUPPLY IN PROFIT",
      dot: "model-percent-profit",
      endpoint: "/api/percent-supply-profit?schema=1",
      scale: "linear",
      thresholds: [
        { value: 50, label: "50% BOTTOM", color: palette.green },
        { value: 95, label: "95% OVERHEAT", color: palette.red }
      ],
      lines: [
        { key: "price", label: "BTC Price", color: palette.price, axis: "price" },
        { key: "value", label: "Supply in Profit", color: palette.orange }
      ],
      normalize(payload) {
        return {
          rows: payload.series.map((row) => ({ date: parseDate(row.date), price: number(row.price), value: number(row.percent) })),
          snapshot: payload.snapshot,
          source: payload.sources?.history || "BGeometrics · PUBLIC DAILY"
        };
      },
      metrics(data) {
        const value = data.snapshot || {};
        return [
          [copy("当前盈利供应", "Current Supply in Profit"), unsignedPercent(value.percent, 1)],
          [copy("7D / 30D 均值", "7D / 30D Avg"), `${unsignedPercent(value.average7, 1)} / ${unsignedPercent(value.average30, 1)}`],
          [copy("距 50% 底部线", "Distance to 50%"), percent(value.distanceToBottom, 1)],
          [copy("市场区域", "Market Zone"), String(value.zone || "--")]
        ];
      }
    },
    "lth-exchange-loss": {
      name: ["LTH 转入交易所已实现亏损", "LTH Realized Loss to Exchanges"],
      short: "LTH EXCHANGE LOSS",
      dot: "model-lth-exchange-loss",
      endpoint: "/api/lth-exchange-loss?schema=1",
      scale: "linear",
      threshold: { value: 50, label: "50% CAPITULATION", color: palette.red },
      lines: [
        { key: "price", label: "BTC Price", color: palette.price, axis: "price" },
        { key: "value", label: "LTH Exchange Loss · 30D", color: palette.purple }
      ],
      normalize(payload) {
        return {
          rows: payload.series.map((row) => ({ date: parseDate(row.date || row.timestamp), price: number(row.price), value: number(row.percent) })),
          snapshot: payload.snapshot,
          source: payload.sources?.history || "Coin Metrics · ALL EXCHANGES"
        };
      },
      metrics(data) {
        const value = data.snapshot || {};
        return [
          [copy("当前亏损占比", "Current Loss Share"), unsignedPercent(value.percent, 1)],
          [copy("7D / 30D 均值", "7D / 30D Avg"), `${unsignedPercent(value.average7, 1)} / ${unsignedPercent(value.average30, 1)}`],
          [copy("365 日峰值", "365D Peak"), `${unsignedPercent(value.peak365, 1)} · ${dateLabel(value.peak365Date)}`],
          [copy("强手状态", "LTH State"), String(value.zone || "--")]
        ];
      }
    },
    "two-week-rsi": {
      name: ["两周级别 RSI", "BTC 2-Week RSI"],
      short: "2-WEEK RSI",
      dot: "model-two-week-rsi",
      endpoint: "/api/two-week-rsi?schema=1",
      scale: "linear",
      thresholds: [
        { value: 30, label: "OVERSOLD", color: palette.green },
        { value: 70, label: "OVERBOUGHT", color: palette.red }
      ],
      lines: [
        { key: "price", label: "BTC Price", color: palette.price, axis: "price" },
        { key: "value", label: "2-Week RSI", color: palette.purple },
        { key: "lower", label: "Macro Lower Rail", color: palette.green },
        { key: "upper", label: "Macro Upper Rail", color: palette.cyan }
      ],
      normalize(payload) {
        return {
          rows: payload.series.map((row) => ({ date: parseDate(row.date || row.observedAt), price: number(row.price), value: number(row.rsi), lower: number(row.lower), upper: number(row.upper) })),
          snapshot: payload.snapshot,
          source: payload.sources?.history || "Coin Metrics · 2W RSI"
        };
      },
      metrics(data) {
        const value = data.snapshot || {};
        return [
          [copy("当前 RSI", "Current RSI"), ratio(value.rsi, 1)],
          [copy("宏观下轨 / 上轨", "Macro Lower / Upper"), `${ratio(value.lower, 1)} / ${ratio(value.upper, 1)}`],
          [copy("6W / 12W 均值", "6W / 12W Avg"), `${ratio(value.average6w, 1)} / ${ratio(value.average12w, 1)}`],
          [copy("动能区域", "Momentum Zone"), String(value.zone || "--")]
        ];
      }
    },
    "under-3m-hodl": {
      name: ["小于 3 个月已实现市值年龄波", "Under-3M Realized Cap HODL Waves"],
      short: "UNDER 3M HODL",
      dot: "model-under-3m-hodl",
      endpoint: "/api/under-3m-realized-cap-hodl-waves?schema=1",
      scale: "linear",
      threshold: { value: 18, label: "18% BOTTOM ZONE", color: palette.red },
      lines: [
        { key: "price", label: "BTC Price", color: palette.price, axis: "price" },
        { key: "value", label: "<3M Realized Cap", color: palette.orange },
        { key: "average30", label: "<3M · 30D MA", color: palette.yellow }
      ],
      normalize(payload) {
        return {
          rows: payload.series.map((row) => ({ date: parseDate(row.date), price: number(row.price), value: number(row.underThreeMonths) * 100, average30: number(row.average30) * 100 })),
          snapshot: payload.snapshot,
          source: payload.sources?.history || "Bitcoin Data · HODL WAVES"
        };
      },
      metrics(data) {
        const value = data.snapshot || {};
        return [
          [copy("当前短线筹码", "Current Short-Term Share"), fractionPercent(value.current, 1)],
          [copy("7D / 30D 均值", "7D / 30D Avg"), `${fractionPercent(value.average7, 1)} / ${fractionPercent(value.average30, 1)}`],
          [copy("近期低点", "Recent Low"), `${fractionPercent(value.recentLow, 1)} · ${dateLabel(value.recentLowDate)}`],
          [copy("底部反转", "Bottom Reversal"), value.vTurn ? copy("已确认", "Confirmed") : copy("观察中", "Watching")]
        ];
      }
    },
    "sth-200dma": {
      name: ["STH 成本线 / 200DMA 金叉", "STH Realized Price / 200DMA Golden Cross"],
      short: "STH / 200DMA",
      dot: "model-sth-200dma",
      endpoint: "/api/sth-200dma?schema=1",
      scale: "log",
      lines: [
        { key: "price", label: "BTC Price", color: palette.price, axis: "price" },
        { key: "sth", label: "STH Realized Price", color: palette.red },
        { key: "dma200", label: "BTC 200DMA", color: palette.cyan }
      ],
      normalize(payload) {
        return {
          rows: payload.series.map((row) => ({ date: parseDate(row.date), price: number(row.price), sth: number(row.sth), dma200: number(row.dma200) })),
          snapshot: payload.snapshot,
          source: payload.sources?.history || "BGeometrics · 200D SMA"
        };
      },
      metrics(data) {
        const value = data.snapshot || {};
        return [
          [copy("STH 短期成本", "STH Cost Basis"), usd(value.sth)],
          [copy("BTC 200DMA", "BTC 200DMA"), usd(value.dma200)],
          [copy("最近宏观金叉", "Latest Macro Cross"), dateLabel(value.latestCrossDate)],
          [copy("历史均值窗口", "Historical Avg Window"), `${ratio(value.averageMonthsToPeak, 1)}M`]
        ];
      }
    },
    "vdd-median": {
      name: ["VDD 与中位数价格逃顶抄底模型", "VDD / Median Price Top-and-Bottom Model"],
      short: "VDD / MEDIAN",
      dot: "model-vdd-median",
      endpoint: "/api/vdd-median-cycle?schema=1",
      scale: "log",
      lines: [
        { key: "price", label: "BTC Price", color: palette.orange, axis: "price" },
        { key: "median", label: "Median Price", color: palette.cyan }
      ],
      normalize(payload) {
        return {
          rows: payload.series.map((row) => ({ date: parseDate(row.date), price: number(row.price), median: number(row.median) })),
          snapshot: payload.snapshot,
          source: payload.sources?.vdd || "BGeometrics · VDD / Median"
        };
      },
      metrics(data) {
        const value = data.snapshot || {};
        return [
          [copy("BTC 实时价格", "Live BTC Price"), usd(value.price)],
          [copy("中位数价格", "Median Price"), usd(value.median)],
          [copy("VDD / 价格倍数", "VDD / Price Multiple"), `${ratio(value.vdd, 3)}x / ${ratio(value.medianRatio, 2)}x`],
          [copy("推演顶部中点", "Projected Top Midpoint"), dateLabel(value.projectedTopDate)]
        ];
      }
    },
    ssr: {
      name: ["SSR 稳定币供应比例上下条形带", "Stablecoin Supply Ratio · Bollinger Bands"],
      short: "SSR · BB(200, 2)",
      dot: "model-ssr",
      endpoint: "/api/stablecoin-supply-ratio?schema=1",
      scale: "log",
      lines: [
        { key: "price", label: "BTC Price", color: palette.price, axis: "price" },
        { key: "ssr", label: "SSR", color: palette.orange },
        { key: "upper", label: "Upper BB", color: palette.purple },
        { key: "lower", label: "Lower BB", color: palette.cyan }
      ],
      normalize(payload) {
        return {
          rows: payload.series.map((row) => ({ date: parseDate(row.date), price: number(row.price), ssr: number(row.ssr), upper: number(row.upper), lower: number(row.lower) })),
          snapshot: payload.snapshot,
          source: payload.sources?.stablecoinAggregate || "DefiLlama · Coin Metrics"
        };
      },
      metrics(data) {
        const value = data.snapshot || {};
        return [
          [copy("当前 SSR", "Current SSR"), ratio(value.ssr, 3)],
          [copy("布林上 / 下轨", "Upper / Lower BB"), `${ratio(value.upper, 3)} / ${ratio(value.lower, 3)}`],
          [copy("距离上轨", "Distance to Upper"), percent(value.distanceToUpperPct, 2)],
          [copy("最近宏观突破", "Latest Macro Breakout"), dateLabel(value.latestBreakoutDate)]
        ];
      }
    },
    "sth-bands": {
      name: ["STH 短期持有成本九彩条形带", "STH Cost Basis Model · 4Y Nine Bands"],
      short: "STH 4Y · NINE BANDS",
      dot: "model-sth-bands",
      endpoint: "/api/sth-cost-basis-bands?schema=1",
      scale: "log",
      lines: [
        { key: "price", label: "BTC Price", color: palette.price },
        { key: "line9", label: "Line9 +2σ", color: palette.red },
        { key: "line7", label: "Line7 +1σ", color: palette.orange },
        { key: "line5", label: "Line5 Mean", color: palette.yellow },
        { key: "line3", label: "Line3 -1σ", color: palette.green },
        { key: "line1", label: "Line1 -2σ", color: palette.cyan }
      ],
      normalize(payload) {
        return {
          rows: payload.series.map((row) => ({
            date: parseDate(row.date),
            price: number(row.price),
            line1: number(row.line1),
            line3: number(row.line3),
            line5: number(row.line5),
            line7: number(row.line7),
            line9: number(row.line9)
          })),
          snapshot: payload.snapshot,
          source: payload.sources?.history || "BGeometrics · STH <155D · 4Y DISPERSION"
        };
      },
      metrics(data) {
        const value = data.snapshot || {};
        return [
          [copy("BTC 实时价格", "Live BTC Price"), usd(value.price)],
          [copy("Line5 / Line7", "Line5 / Line7"), `${usd(value.line5)} / ${usd(value.line7)}`],
          [copy("距离 Line7", "Distance to Line7"), percent(value.distanceToLine7Pct, 2)],
          [copy("最近宏观突破", "Latest Macro Breakout"), dateLabel(value.latestBreakoutDate)]
        ];
      }
    },
    "percent-profit-ex-10y": {
      name: ["有效筹码浮盈比例", "Active Percent Supply in Profit"],
      short: "PROFIT SUPPLY · EX >10Y · 7DMA",
      dot: "model-percent-profit-ex-10y",
      endpoint: "/api/percent-supply-profit-ex-10y?schema=1",
      scale: "linear",
      thresholds: [
        { value: 55, label: "55% MODERN WASHOUT", color: palette.red },
        { value: 60, label: "60% LEGACY WASHOUT", color: palette.orange }
      ],
      lines: [
        { key: "price", label: "BTC Price", color: palette.price, axis: "price" },
        { key: "value", label: "Active Profit Supply · 7DMA", color: palette.orange }
      ],
      normalize(payload) {
        return {
          rows: payload.series.map((row) => ({ date: parseDate(row.date), price: number(row.price), value: number(row.percent7) })),
          snapshot: payload.snapshot,
          source: payload.sources?.profitLoss || "BGeometrics · PROFIT / LOSS + >10Y SUPPLY"
        };
      },
      metrics(data) {
        const value = data.snapshot || {};
        return [
          [copy("有效浮盈比例 · 7DMA", "Active Profit Share · 7DMA"), unsignedPercent(value.percent7, 2)],
          [copy("剔除十年筹码", "Excluded >10Y Supply"), `${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(number(value.dormantOver10y) || 0)} BTC`],
          [copy("距离 55% 阈值", "Distance to 55%"), percent(value.distanceTo55, 2)],
          [copy("365 日低点", "365-Day Low"), `${unsignedPercent(value.recentLowPercent, 2)} · ${dateLabel(value.recentLowDate)}`]
        ];
      }
    },
    "sth-mvrv": {
      name: ["短期持有者 MVRV", "Short Term Holder MVRV"],
      short: "STH-MVRV · DOUBLE BOTTOM",
      dot: "model-sth-mvrv",
      endpoint: "/api/sth-mvrv?schema=1",
      scale: "linear",
      thresholds: [
        { value: 1, label: "1.0 STH BREAKEVEN", color: palette.green }
      ],
      lines: [
        { key: "price", label: "BTC Price", color: palette.price, axis: "price" },
        { key: "value", label: "STH-MVRV", color: palette.orange }
      ],
      normalize(payload) {
        return {
          rows: payload.series.map((row) => ({ date: parseDate(row.date), price: number(row.price), value: number(row.mvrv) })),
          snapshot: payload.snapshot,
          source: payload.sources?.history || "BGeometrics + Bitbo · PRICE / STH REALIZED PRICE"
        };
      },
      metrics(data) {
        const value = data.snapshot || {};
        return [
          [copy("当前 STH-MVRV", "Current STH-MVRV"), ratio(value.mvrv, 4)],
          [copy("距离 1.0", "Distance to 1.0"), percent(value.distanceToOnePct, 2)],
          [copy("首探 / 二探", "First / Second Dip"), `${ratio(value.firstDipMvrv, 3)} / ${ratio(value.secondDipMvrv, 3)}`],
          [copy("成本线收复", "Cost-Line Reclaim"), dateLabel(value.reclaimDate)]
        ];
      }
    }
  };

  const fetchPayload = async (endpoint) => {
    const request = async (url) => {
      if (typeof window.fetch === "function") {
        const response = await window.fetch(url, {
          cache: "no-store",
          headers: { Accept: "application/json" }
        });
        if (!response.ok) throw new Error(`On-chain API ${response.status}`);
        return response.json();
      }

      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", url, true);
        xhr.setRequestHeader("Accept", "application/json");
        xhr.onload = () => {
          if (xhr.status < 200 || xhr.status >= 300) {
            reject(new Error(`On-chain API ${xhr.status}`));
            return;
          }
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch (error) {
            reject(error);
          }
        };
        xhr.onerror = () => reject(new Error("On-chain API network error"));
        xhr.send();
      });
    };

    try {
      return await request(endpoint);
    } catch (error) {
      if (!/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) throw error;
      return request(`https://www.welinkbtc-onchainmain.xyz${endpoint}`);
    }
  };

  const loadPayload = (endpoint) => {
    if (!payloadPromises.has(endpoint)) {
      payloadPromises.set(endpoint, fetchPayload(endpoint).then((payload) => {
        if (!payload?.ok || !Array.isArray(payload.series)) throw new Error(payload?.reason || "On-chain series unavailable");
        return payload;
      }).catch((error) => {
        payloadPromises.delete(endpoint);
        throw error;
      }));
    }
    return payloadPromises.get(endpoint);
  };

  const getVisibleRows = (rows) => {
    const valid = rows.filter((row) => row.date instanceof Date && !Number.isNaN(row.date.getTime())).sort((left, right) => left.date - right.date);
    if (state.range === "all" || !valid.length) return valid;
    const days = Number(state.range);
    const latest = valid.at(-1).date.getTime();
    const start = latest - Math.max(days - 1, 1) * DAY_MS;
    return valid.filter((row) => row.date.getTime() >= start);
  };

  const axisBounds = (values, useLog) => {
    const finite = values.filter((value) => Number.isFinite(value) && (!useLog || value > 0));
    if (!finite.length) return { min: useLog ? 0 : -1, max: 1, useLog };
    let min = Math.min(...finite);
    let max = Math.max(...finite);
    if (useLog) {
      min = Math.log10(min);
      max = Math.log10(max);
    }
    if (min === max) {
      const pad = Math.abs(min || 1) * 0.08;
      min -= pad;
      max += pad;
    } else {
      const pad = (max - min) * 0.08;
      min -= pad;
      max += pad;
    }
    return { min, max, useLog };
  };

  const formatAxis = (value, useLog) => {
    const numeric = useLog ? 10 ** value : value;
    if (useLog || Math.abs(numeric) >= 1000) {
      return `$${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(numeric)}`;
    }
    if (Math.abs(numeric) >= 10) return numeric.toFixed(1);
    return numeric.toFixed(2);
  };

  const drawLine = (context, rows, line, xFor, yFor) => {
    let started = false;
    context.save();
    context.strokeStyle = line.color;
    context.lineWidth = line.axis === "price" ? 1.8 : 2.8;
    context.globalAlpha = line.axis === "price" ? 0.74 : 0.98;
    context.lineJoin = "round";
    context.lineCap = "round";
    if (state.glow) {
      context.shadowColor = line.color;
      context.shadowBlur = line.axis === "price" ? 10 : 22;
    }
    context.beginPath();
    rows.forEach((row) => {
      const value = number(row[line.key]);
      if (!Number.isFinite(value) || (yFor.useLog && value <= 0)) {
        started = false;
        return;
      }
      const x = xFor(row.date);
      const y = yFor(value);
      if (!started) context.moveTo(x, y);
      else context.lineTo(x, y);
      started = true;
    });
    context.stroke();
    context.restore();

    const latest = [...rows].reverse().find((row) => Number.isFinite(number(row[line.key])));
    if (!latest) return;
    context.save();
    context.fillStyle = line.color;
    if (state.glow) {
      context.shadowColor = line.color;
      context.shadowBlur = 18;
    }
    context.beginPath();
    context.arc(xFor(latest.date), yFor(number(latest[line.key])), line.axis === "price" ? 3.5 : 5, 0, Math.PI * 2);
    context.fill();
    context.restore();
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const project3d = (point, width, height) => projectOrbitPoint(point, width, height, camera);

  const drawWorldLine = (context, width, height, start, end, color, lineWidth = 1) => {
    const a = project3d(start, width, height);
    const b = project3d(end, width, height);
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.stroke();
  };

  const draw3d = (context, width, height, rows, config, primaryBounds, priceBounds) => {
    const dark = document.body.dataset.theme !== "light";
    const xMin = -5;
    const xMax = 5;
    const yMin = 0.35;
    const yMax = 5.5;
    const zMin = -1.7;
    const zMax = 1.7;
    const startTime = rows[0].date.getTime();
    const endTime = rows.at(-1).date.getTime();
    const maxRenderPoints = Math.max(520, Math.floor(width * 1.2));
    const renderStep = Math.max(1, Math.ceil(rows.length / maxRenderPoints));
    const renderRows = renderStep === 1
      ? rows
      : rows.filter((_, index) => index % renderStep === 0 || index === rows.length - 1);
    const xWorld = (date) => xMin + ((date.getTime() - startTime) / Math.max(endTime - startTime, 1)) * (xMax - xMin);
    const yWorld = (value, bounds) => {
      const normalized = bounds.useLog ? Math.log10(Math.max(value, 0.000001)) : value;
      return yMin + ((normalized - bounds.min) / Math.max(bounds.max - bounds.min, 0.000001)) * (yMax - yMin);
    };
    const gridColor = dark ? "rgba(125, 143, 134, 0.18)" : "rgba(35, 70, 50, 0.17)";
    const axisColor = dark ? "rgba(199, 215, 205, 0.38)" : "rgba(33, 61, 45, 0.42)";
    const textColor = dark ? "rgba(220, 231, 224, 0.58)" : "rgba(28, 49, 37, 0.65)";

    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";

    for (let index = 0; index <= 10; index += 1) {
      const x = xMin + (index / 10) * (xMax - xMin);
      drawWorldLine(context, width, height, { x, y: 0, z: zMin }, { x, y: 0, z: zMax }, gridColor);
    }
    for (let index = 0; index <= 8; index += 1) {
      const z = zMin + (index / 8) * (zMax - zMin);
      drawWorldLine(context, width, height, { x: xMin, y: 0, z }, { x: xMax, y: 0, z }, gridColor);
    }
    for (let index = 0; index < 6; index += 1) {
      const progress = index / 5;
      const y = yMin + (1 - progress) * (yMax - yMin);
      drawWorldLine(context, width, height, { x: xMin, y, z: 0 }, { x: xMax, y, z: 0 }, gridColor);
    }
    drawWorldLine(context, width, height, { x: xMin, y: 0, z: 0 }, { x: xMax, y: 0, z: 0 }, axisColor, 1.25);
    drawWorldLine(context, width, height, { x: xMin, y: 0, z: 0 }, { x: xMin, y: yMax + 0.25, z: 0 }, axisColor, 1.25);

    context.font = `700 ${width < 720 ? 9 : 11}px JetBrains Mono, monospace`;
    context.fillStyle = textColor;
    context.textBaseline = "middle";
    for (let index = 0; index < 6; index += 1) {
      const progress = index / 5;
      const y = yMin + (1 - progress) * (yMax - yMin);
      const point = project3d({ x: xMin, y, z: 0 }, width, height);
      context.textAlign = "right";
      context.fillText(formatAxis(primaryBounds.max - progress * (primaryBounds.max - primaryBounds.min), primaryBounds.useLog), point.x - 12, point.y);
    }

    const xTicks = width < 720 ? 4 : 7;
    const shortRange = state.range !== "all";
    const formatter = new Intl.DateTimeFormat(isEnglish() ? "en-US" : "zh-CN", { year: shortRange ? undefined : "numeric", month: "short", day: shortRange ? "2-digit" : undefined });
    for (let index = 0; index < xTicks; index += 1) {
      const progress = index / Math.max(xTicks - 1, 1);
      const date = new Date(startTime + progress * (endTime - startTime));
      const x = xMin + progress * (xMax - xMin);
      const point = project3d({ x, y: 0, z: zMax }, width, height);
      context.textAlign = index === 0 ? "left" : index === xTicks - 1 ? "right" : "center";
      context.fillText(formatter.format(date), point.x, point.y + 16);
    }

    thresholdsFor(config).forEach((threshold) => {
      if (threshold.value < primaryBounds.min || threshold.value > primaryBounds.max) return;
      const thresholdY = yWorld(threshold.value, primaryBounds);
      context.save();
      context.setLineDash([8, 7]);
      drawWorldLine(context, width, height, { x: xMin, y: thresholdY, z: 0.08 }, { x: xMax, y: thresholdY, z: 0.08 }, threshold.color, 1.25);
      context.setLineDash([]);
      const labelPoint = project3d({ x: xMax, y: thresholdY, z: 0.08 }, width, height);
      context.fillStyle = threshold.color;
      context.textAlign = "right";
      context.fillText(threshold.label, labelPoint.x, labelPoint.y - 13);
      context.restore();
    });

    const lineCount = Math.max(config.lines.length, 1);
    config.lines.forEach((line, lineIndex) => {
      const bounds = line.axis === "price" ? priceBounds : primaryBounds;
      const depth = (lineIndex - (lineCount - 1) / 2) * 0.18;
      let started = false;
      context.save();
      context.strokeStyle = line.color;
      context.lineWidth = line.axis === "price" ? 2.2 : 3.4;
      context.globalAlpha = line.axis === "price" ? 0.76 : 1;
      if (state.glow) {
        context.shadowColor = line.color;
        context.shadowBlur = line.axis === "price" ? 13 : 24;
      }
      context.beginPath();
      renderRows.forEach((row) => {
        const value = number(row[line.key]);
        if (!Number.isFinite(value) || (bounds.useLog && value <= 0)) {
          started = false;
          return;
        }
        const point = project3d({ x: xWorld(row.date), y: yWorld(value, bounds), z: depth }, width, height);
        if (!started) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
        started = true;
      });
      context.stroke();

      const latest = [...renderRows].reverse().find((row) => Number.isFinite(number(row[line.key])));
      if (latest) {
        const latestPoint = project3d({ x: xWorld(latest.date), y: yWorld(number(latest[line.key]), bounds), z: depth }, width, height);
        context.fillStyle = line.color;
        context.shadowColor = line.color;
        context.shadowBlur = state.glow ? 26 : 10;
        context.beginPath();
        context.arc(latestPoint.x, latestPoint.y, line.axis === "price" ? 4 : 6, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
    });

    context.save();
    context.fillStyle = dark ? "rgba(230, 238, 233, 0.055)" : "rgba(30, 48, 38, 0.055)";
    context.font = `900 ${Math.max(28, Math.min(width * 0.064, 70))}px Inter, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    const watermarkPoint = project3d({ x: 0, y: 2.4, z: -0.2 }, width, height);
    context.fillText("welinkBTC", watermarkPoint.x, watermarkPoint.y);
    context.restore();
    context.restore();
  };

  const draw = () => {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(rect.width * dpr);
    const pixelHeight = Math.round(rect.height * dpr);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    const context = canvas.getContext("2d");
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const width = rect.width;
    const height = rect.height;
    const dark = document.body.dataset.theme !== "light";
    const config = indicatorConfig[state.indicator];

    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, dark ? "#111a15" : "#f7faf6");
    gradient.addColorStop(1, dark ? "#0f1116" : "#edf3ef");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    if (!state.data) return;
    const rows = getVisibleRows(state.data.rows);
    if (!rows.length) return;
    const compact = width < 720;
    const plot = { left: compact ? 54 : 78, right: width - (compact ? 28 : 76), top: compact ? 46 : 72, bottom: height - (compact ? 70 : 86) };
    const startTime = rows[0].date.getTime();
    const endTime = rows.at(-1).date.getTime();
    const xFor = (date) => plot.left + ((date.getTime() - startTime) / Math.max(endTime - startTime, 1)) * (plot.right - plot.left);

    const primaryLines = config.lines.filter((line) => line.axis !== "price");
    const priceLines = config.lines.filter((line) => line.axis === "price");
    const primaryValues = primaryLines.flatMap((line) => rows.map((row) => number(row[line.key])));
    primaryValues.push(...thresholdsFor(config).map((threshold) => threshold.value));
    const primaryBounds = axisBounds(primaryValues, config.scale === "log");
    const priceBounds = axisBounds(priceLines.flatMap((line) => rows.map((row) => number(row[line.key]))), true);
    if (state.view === "3d") {
      draw3d(context, width, height, rows, config, primaryBounds, priceBounds);
      return;
    }
    const createY = (bounds) => {
      const fn = (value) => {
        const normalized = bounds.useLog ? Math.log10(Math.max(value, 0.000001)) : value;
        return plot.bottom - ((normalized - bounds.min) / Math.max(bounds.max - bounds.min, 0.000001)) * (plot.bottom - plot.top);
      };
      fn.useLog = bounds.useLog;
      return fn;
    };
    const primaryY = createY(primaryBounds);
    const priceY = createY(priceBounds);

    context.font = `700 ${compact ? 9 : 11}px JetBrains Mono, monospace`;
    context.lineWidth = 1;
    for (let index = 0; index < 6; index += 1) {
      const progress = index / 5;
      const y = plot.top + progress * (plot.bottom - plot.top);
      context.strokeStyle = dark ? "rgba(129, 145, 137, 0.16)" : "rgba(25, 54, 39, 0.13)";
      context.beginPath();
      context.moveTo(plot.left, y);
      context.lineTo(plot.right, y);
      context.stroke();
      context.fillStyle = dark ? "rgba(218, 229, 221, 0.52)" : "rgba(31, 48, 39, 0.62)";
      context.textAlign = "right";
      context.fillText(formatAxis(primaryBounds.max - progress * (primaryBounds.max - primaryBounds.min), primaryBounds.useLog), plot.left - 10, y + 4);
    }

    const xTicks = compact ? 4 : 7;
    const shortRange = state.range !== "all";
    const formatter = new Intl.DateTimeFormat(isEnglish() ? "en-US" : "zh-CN", { year: shortRange ? undefined : "numeric", month: "short", day: shortRange ? "2-digit" : undefined });
    for (let index = 0; index < xTicks; index += 1) {
      const progress = index / Math.max(xTicks - 1, 1);
      const date = new Date(startTime + progress * (endTime - startTime));
      const x = plot.left + progress * (plot.right - plot.left);
      context.fillStyle = dark ? "rgba(218, 229, 221, 0.48)" : "rgba(31, 48, 39, 0.58)";
      context.textAlign = index === 0 ? "left" : index === xTicks - 1 ? "right" : "center";
      context.fillText(formatter.format(date), x, plot.bottom + 36);
    }

    thresholdsFor(config).forEach((threshold) => {
      if (threshold.value < primaryBounds.min || threshold.value > primaryBounds.max) return;
      const y = primaryY(threshold.value);
      context.save();
      context.strokeStyle = threshold.color;
      context.globalAlpha = 0.78;
      context.setLineDash([8, 7]);
      context.beginPath();
      context.moveTo(plot.left, y);
      context.lineTo(plot.right, y);
      context.stroke();
      context.setLineDash([]);
      context.fillStyle = threshold.color;
      context.textAlign = "right";
      context.fillText(threshold.label, plot.right, y - 10);
      context.restore();
    });

    priceLines.forEach((line) => drawLine(context, rows, line, xFor, priceY));
    primaryLines.forEach((line) => drawLine(context, rows, line, xFor, primaryY));

    if (rows.length === 1) {
      context.fillStyle = dark ? "rgba(231, 236, 232, 0.7)" : "rgba(30, 44, 36, 0.7)";
      context.textAlign = "center";
      context.fillText(copy("公开历史快照累积中 · 当前点已验证", "PUBLIC HISTORY ACCUMULATING · CURRENT POINT VERIFIED"), width / 2, plot.bottom - 18);
    }

    context.save();
    context.fillStyle = dark ? "rgba(230, 238, 233, 0.045)" : "rgba(30, 48, 38, 0.045)";
    context.font = `900 ${Math.max(30, Math.min(width * 0.075, 82))}px Inter, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("welinkBTC", plot.left + (plot.right - plot.left) / 2, plot.top + (plot.bottom - plot.top) / 2);
    context.restore();
  };

  const updateOrbitAutoUi = () => {
    if (!isHomePage || !orbitAnimator) return;
    const enabled = orbitAnimator.isEnabled();
    section.dataset.autoOrbit = orbitAnimator.isRunning() ? "running" : enabled ? "waiting" : "paused";
    if (!orbitAuto) return;
    orbitAuto.hidden = state.view !== "3d";
    orbitAuto.textContent = enabled ? copy("暂停动画", "Pause motion") : copy("播放动画", "Play motion");
    orbitAuto.setAttribute("aria-pressed", String(enabled));
    orbitAuto.setAttribute("aria-label", enabled ? copy("暂停三维视角自动演示", "Pause automatic 3D camera motion") : copy("播放三维视角自动演示", "Play automatic 3D camera motion"));
    orbitAuto.title = copy("缓慢旋转与缩放；手动操作结束 12 秒后恢复", "Slow orbit and zoom; resumes 12 seconds after interaction");
  };

  if (isHomePage) {
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    orbitAnimator = createHomeOrbitAnimator({
      camera,
      draw,
      minZoom: minCameraZoom,
      enabled: !motionPreference.matches,
      canAnimate: () => state.view === "3d" && Boolean(state.data) && !state.loading && chartInViewport
        && pageActive && !document.hidden && activePointers.size === 0,
      onState: updateOrbitAutoUi
    });
    orbitAuto?.addEventListener("click", () => orbitAnimator.setEnabled(!orbitAnimator.isEnabled()));
    motionPreference.addEventListener("change", () => {
      if (motionPreference.matches) orbitAnimator.setEnabled(false);
    });
    document.addEventListener("visibilitychange", () => orbitAnimator.sync());
    window.addEventListener("pagehide", () => { pageActive = false; orbitAnimator.sync(); });
    window.addEventListener("pageshow", () => { pageActive = true; orbitAnimator.sync(); });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        chartInViewport = entries.some((entry) => entry.isIntersecting);
        orbitAnimator.sync();
      }).observe(canvas);
    } else {
      const updateViewport = () => {
        const bounds = canvas.getBoundingClientRect();
        chartInViewport = bounds.bottom > 0 && bounds.top < window.innerHeight;
        orbitAnimator.sync();
      };
      window.addEventListener("scroll", updateViewport, { passive: true });
      window.addEventListener("resize", updateViewport, { passive: true });
      updateViewport();
    }
  }

  const renderLegend = () => {
    const config = indicatorConfig[state.indicator];
    legend.innerHTML = config.lines.map((line) => `<span><i style="--legend-color:${line.color}"></i>${line.label}</span>`).join("")
      + `<em>${state.data?.source || "PUBLIC DAILY API"}</em>`;
  };

  const renderMetrics = () => {
    const config = indicatorConfig[state.indicator];
    const title = config.name[isEnglish() ? 1 : 0];
    if (metricsTitle) metricsTitle.textContent = title;
    if (!metricsList) return;
    if (!state.data?.snapshot) {
      metricsList.innerHTML = `<div><dt>${copy("数据状态", "Data Status")}</dt><dd class="danger">${copy("等待同步", "Awaiting Sync")}</dd></div>`;
      return;
    }
    metricsList.innerHTML = config.metrics(state.data).map(([label, value, tone]) => `<div><dt>${label}</dt><dd${tone ? ` class="${tone}"` : ""}>${value}</dd></div>`).join("")
      + `<div><dt>${copy("快照日期", "Snapshot Date")}</dt><dd>${dateLabel(state.data.snapshot.onchainAsOf || state.data.snapshot.asOf || state.data.snapshot.medianAsOf || state.data.snapshot.priceAsOf)}</dd></div>`;
  };

  const updateViewUi = () => {
    const is3d = state.view === "3d";
    viewButtons.forEach((button) => {
      const active = button.dataset.view === state.view;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    section.classList.toggle("is-3d", is3d);
    if (orbitControls) orbitControls.hidden = !is3d;
    if (orbitAuto) orbitAuto.hidden = !isHomePage || !is3d;
    if (orbitHint) orbitHint.textContent = copy(
      "拖拽旋转 · 滚轮缩放 · Shift / 右键拖拽平移",
      "Drag to orbit · Wheel to zoom · Shift / right-drag to pan"
    );
    if (orbitReset) orbitReset.textContent = copy("复位视角", "Reset view");
    canvas.tabIndex = is3d ? 0 : -1;
    canvas.setAttribute("aria-label", is3d
      ? copy("可旋转、缩放和平移的比特币链上趋势三维图", "Interactive 3D Bitcoin on-chain trend chart with orbit, zoom and pan")
      : copy("比特币链上趋势二维快照", "Bitcoin on-chain trend 2D snapshot"));
    orbitAnimator?.sync();
    updateOrbitAutoUi();
  };

  const updateUi = () => {
    const config = indicatorConfig[state.indicator];
    const title = config.name[isEnglish() ? 1 : 0];
    if (modelLabel) modelLabel.textContent = title;
    if (modelDot) modelDot.className = `model-dot ${config.dot}`;
    modelOptions.forEach((button) => button.classList.toggle("active", button.dataset.modelOption === state.indicator));
    rangeButtons.forEach((button) => button.classList.toggle("active", button.dataset.range === state.range));
    updateViewUi();
    renderMetrics();
    renderLegend();
    draw();
  };

  const loadIndicator = async () => {
    const requestedIndicator = state.indicator;
    const config = indicatorConfig[requestedIndicator];
    state.loading = true;
    state.error = null;
    status.hidden = false;
    status.classList.remove("is-error");
    status.textContent = copy("正在同步链上趋势快照...", "Syncing on-chain trend snapshot...");
    try {
      const payload = await loadPayload(config.endpoint);
      if (state.indicator !== requestedIndicator) return;
      const normalized = config.normalize(payload);
      normalized.rows = normalized.rows.filter((row) => row.date && Object.entries(row).some(([key, value]) => key !== "date" && Number.isFinite(value)));
      if (!normalized.rows.length) throw new Error("Indicator series is empty");
      state.data = normalized;
      state.loading = false;
      status.hidden = true;
      updateUi();
    } catch (error) {
      if (state.indicator !== requestedIndicator) return;
      state.loading = false;
      state.data = null;
      state.error = error;
      status.hidden = false;
      status.classList.add("is-error");
      status.textContent = copy("链上快照同步失败，点击重试", "Snapshot sync failed. Click to retry.");
      renderMetrics();
      renderLegend();
      draw();
    }
  };

  // A fixed popup escapes the homepage toolbar's horizontal scroll container.
  const modelPopup = section.querySelector("#power-model-options");
  const compactToolbar = document.body.classList.contains("home-page")
    ? section.querySelector(".power-law-toolbar") : null;
  const closeModelMenu = () => {
    modelMenu?.classList.remove("is-open");
    modelToggle?.setAttribute("aria-expanded", "false");
  };
  const positionModelPopup = () => {
    if (!compactToolbar || !modelPopup || !modelToggle) return;
    const rect = modelToggle.getBoundingClientRect();
    const width = Math.min(350, window.innerWidth - 24);
    modelPopup.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`;
    modelPopup.style.top = `${rect.bottom + 8}px`;
    modelPopup.style.maxHeight = `${Math.max(80, window.innerHeight - rect.bottom - 20)}px`;
  };
  compactToolbar?.addEventListener("scroll", closeModelMenu, { passive: true });
  if (compactToolbar) {
    window.addEventListener("resize", closeModelMenu, { passive: true });
    window.addEventListener("scroll", closeModelMenu, { passive: true });
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modelMenu?.classList.contains("is-open")) {
      closeModelMenu();
      modelToggle?.focus({ preventScroll: true });
    }
  });
  modelToggle?.addEventListener("click", (event) => {
    event.stopPropagation();
    positionModelPopup();
    const open = modelMenu?.classList.toggle("is-open") ?? false;
    modelToggle.setAttribute("aria-expanded", String(open));
  });

  modelOptions.forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.modelOption;
      if (!indicatorConfig[next]) return;
      state.indicator = next;
      state.data = null;
      modelMenu?.classList.remove("is-open");
      modelToggle?.setAttribute("aria-expanded", "false");
      updateUi();
      loadIndicator();
    });
  });

  viewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.view;
      if (next !== "2d" && next !== "3d") return;
      state.view = next;
      updateViewUi();
      draw();
    });
  });

  rangeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.range = button.dataset.range || "all";
      updateUi();
    });
  });

  const resetCamera = () => {
    const rect = canvas.getBoundingClientRect();
    cameraFitManaged = isHomePage;
    fittedSize = `${rect.width}:${rect.height}`;
    Object.assign(camera, isHomePage ? fitHomeCamera(rect.width, rect.height) : defaultCamera);
    orbitAnimator?.interaction();
    draw();
  };

  const beginPointerGesture = () => {
    const pointers = [...activePointers.values()];
    if (pointers.length >= 2) {
      const [first, second] = pointers;
      pointerGesture = {
        type: "pinch",
        distance: Math.hypot(second.x - first.x, second.y - first.y) || 1,
        centerX: (first.x + second.x) / 2,
        centerY: (first.y + second.y) / 2,
        zoom: camera.zoom,
        panX: camera.panX,
        panY: camera.panY
      };
      return;
    }
    const pointer = pointers[0];
    if (!pointer) {
      pointerGesture = null;
      return;
    }
    pointerGesture = {
      type: pointer.pan ? "pan" : "orbit",
      pointerId: pointer.id,
      x: pointer.x,
      y: pointer.y,
      yaw: camera.yaw,
      pitch: camera.pitch,
      panX: camera.panX,
      panY: camera.panY
    };
  };

  canvas.addEventListener("pointerdown", (event) => {
    if (state.view !== "3d") return;
    event.preventDefault();
    cameraFitManaged = false;
    activePointers.set(event.pointerId, {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      pan: event.shiftKey || event.button === 1 || event.button === 2
    });
    orbitAnimator?.interaction();
    canvas.setPointerCapture?.(event.pointerId);
    section.classList.add("is-orbiting");
    beginPointerGesture();
  });

  canvas.addEventListener("pointermove", (event) => {
    if (state.view !== "3d" || !activePointers.has(event.pointerId)) return;
    event.preventDefault();
    const previous = activePointers.get(event.pointerId);
    activePointers.set(event.pointerId, { ...previous, x: event.clientX, y: event.clientY });
    const pointers = [...activePointers.values()];
    if (pointers.length >= 2 && pointerGesture?.type === "pinch") {
      const [first, second] = pointers;
      const distance = Math.hypot(second.x - first.x, second.y - first.y) || 1;
      const centerX = (first.x + second.x) / 2;
      const centerY = (first.y + second.y) / 2;
      camera.zoom = clamp(pointerGesture.zoom * (distance / pointerGesture.distance), minCameraZoom, 2.25);
      camera.panX = pointerGesture.panX + centerX - pointerGesture.centerX;
      camera.panY = pointerGesture.panY + centerY - pointerGesture.centerY;
      orbitAnimator?.interaction();
      draw();
      return;
    }
    if (!pointerGesture || pointerGesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - pointerGesture.x;
    const dy = event.clientY - pointerGesture.y;
    if (pointerGesture.type === "pan") {
      camera.panX = pointerGesture.panX + dx;
      camera.panY = pointerGesture.panY + dy;
    } else {
      camera.yaw = pointerGesture.yaw + dx * 0.006;
      camera.pitch = clamp(pointerGesture.pitch + dy * 0.005, -0.82, 0.92);
    }
    orbitAnimator?.interaction();
    draw();
  });

  const endPointer = (event) => {
    if (!activePointers.has(event.pointerId)) return;
    activePointers.delete(event.pointerId);
    if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (!activePointers.size) section.classList.remove("is-orbiting");
    beginPointerGesture();
    orbitAnimator?.interaction();
  };

  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("contextmenu", (event) => {
    if (state.view === "3d") event.preventDefault();
  });
  canvas.addEventListener("wheel", (event) => {
    if (state.view !== "3d") return;
    event.preventDefault();
    cameraFitManaged = false;
    camera.zoom = clamp(camera.zoom * Math.exp(-event.deltaY * 0.0012), minCameraZoom, 2.25);
    orbitAnimator?.interaction();
    draw();
  }, { passive: false });
  canvas.addEventListener("dblclick", () => {
    if (state.view === "3d") resetCamera();
  });
  canvas.addEventListener("keydown", (event) => {
    if (state.view !== "3d") return;
    const pan = event.shiftKey;
    const amount = 18;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-", "0"].includes(event.key)) return;
    event.preventDefault();
    if (event.key !== "0") cameraFitManaged = false;
    if (event.key === "0") resetCamera();
    else if (event.key === "+" || event.key === "=") camera.zoom = clamp(camera.zoom * 1.08, minCameraZoom, 2.25);
    else if (event.key === "-") camera.zoom = clamp(camera.zoom / 1.08, minCameraZoom, 2.25);
    else if (pan && event.key === "ArrowLeft") camera.panX -= amount;
    else if (pan && event.key === "ArrowRight") camera.panX += amount;
    else if (pan && event.key === "ArrowUp") camera.panY -= amount;
    else if (pan && event.key === "ArrowDown") camera.panY += amount;
    else if (event.key === "ArrowLeft") camera.yaw -= 0.08;
    else if (event.key === "ArrowRight") camera.yaw += 0.08;
    else if (event.key === "ArrowUp") camera.pitch = clamp(camera.pitch - 0.06, -0.82, 0.92);
    else if (event.key === "ArrowDown") camera.pitch = clamp(camera.pitch + 0.06, -0.82, 0.92);
    orbitAnimator?.interaction();
    draw();
  });
  orbitReset?.addEventListener("click", resetCamera);

  glowInput?.addEventListener("change", () => {
    state.glow = Boolean(glowInput.checked);
    section.classList.toggle("is-glowing", state.glow);
    draw();
  });

  metricsToggle?.addEventListener("click", () => {
    const collapsed = metricsPanel?.classList.toggle("is-collapsed") ?? false;
    metricsToggle.setAttribute("aria-expanded", String(!collapsed));
    metricsToggle.setAttribute("aria-label", collapsed ? copy("展开指标窗口", "Expand metric panel") : copy("收起指标窗口", "Collapse metric panel"));
  });

  status?.addEventListener("click", () => {
    if (state.error) loadIndicator();
  });

  document.addEventListener("click", (event) => {
    if (!modelMenu?.contains(event.target)) {
      modelMenu?.classList.remove("is-open");
      modelToggle?.setAttribute("aria-expanded", "false");
    }
  });

  const resizeObserver = new ResizeObserver(() => {
    const rect = canvas.getBoundingClientRect();
    const size = `${rect.width}:${rect.height}`;
    if (cameraFitManaged && rect.width > 0 && rect.height > 0 && fittedSize !== size) {
      fittedSize = size;
      Object.assign(camera, fitHomeCamera(rect.width, rect.height));
      orbitAnimator?.reframe();
    }
    draw();
  });
  resizeObserver.observe(canvas);
  window.drawProductDashboard = draw;
  window.updateProductDashboardLanguage = updateUi;
  updateUi();
  loadIndicator();
})();
