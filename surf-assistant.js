(function () {
  function createAssistant() {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = `<aside class="surf-assistant" id="surf-assistant" aria-label="小微双引擎深度研究助手">
      <button class="surf-bot-toggle" id="surf-bot-toggle" type="button" aria-expanded="false" aria-controls="surf-bot-panel" aria-label="打开小微双引擎深度研究助手">
        <span class="surf-bot-robot" aria-hidden="true"><i class="surf-bot-antenna"></i><i class="surf-bot-face"><b></b><b></b></i><i class="surf-bot-body">B</i></span>
        <span class="surf-bot-toggle-copy"><strong>小微</strong><small>双擎深研</small></span>
        <i class="surf-bot-live" aria-hidden="true"></i>
      </button>
      <section class="surf-bot-panel" id="surf-bot-panel" aria-hidden="true" aria-labelledby="surf-bot-title">
        <header class="surf-bot-head surf-bot-drag-handle">
          <div class="surf-bot-mini" aria-hidden="true"><i></i><b>B</b></div>
          <div><span>WELINKBTC × SURF × OPENAI</span><h2 id="surf-bot-title">小微深度研究</h2></div>
          <button id="surf-bot-close" type="button" aria-label="关闭小微助手">×</button>
        </header>
        <div class="surf-bot-context"><i id="surf-bot-status-dot"></i><span id="surf-bot-status">正在检测研究双引擎</span><strong id="surf-bot-platform">当前场景：全平台</strong></div>
        <div class="surf-bot-messages" id="surf-bot-messages" role="log" aria-live="polite">
          <article class="surf-message assistant"><span>微</span><div><strong>小微</strong><p>告诉我你要研究的币种、项目、链上指标、市场信号或候选稿。我会优先调用 SURF 实时研究；若未返回有效结果，OpenAI 将自动接力，并按当前场景整理证据、来源和核验清单。</p></div></article>
        </div>
        <div class="surf-quick-prompts" aria-label="常用研究问题">
          <button type="button" data-surf-slot="primary">今日 BTC 信号</button>
          <button type="button" data-surf-slot="secondary">实时热点</button>
          <button type="button" data-surf-slot="verify">核验候选稿</button>
        </div>
        <form class="surf-bot-form" id="surf-bot-form">
          <label class="surf-bot-input"><span class="sr-only">输入深度研究问题</span><textarea id="surf-bot-query" rows="3" maxlength="4000" placeholder="输入研究问题，或粘贴内容进行事实核验…" required></textarea></label>
          <div class="surf-bot-actions">
            <label><span>研究强度</span><select id="surf-bot-effort"><option value="low">快速</option><option value="medium" selected>标准</option><option value="high">深度</option></select></label>
            <button id="surf-bot-new" type="button">新研究</button>
            <button class="surf-bot-submit" id="surf-bot-submit" type="submit">开始研究</button>
          </div>
        </form>
        <footer><span>SERVER-SIDE · HUMAN REVIEW</span><button id="surf-bot-copy" type="button" disabled>复制最新结论</button></footer>
      </section>
    </aside>`;
    const assistant = wrapper.firstElementChild;
    document.body.append(assistant);
    return assistant;
  }

  const root = document.getElementById("surf-assistant") || createAssistant();
  const tuckToggle = document.createElement("button");
  tuckToggle.className = "surf-edge-toggle";
  tuckToggle.type = "button";
  tuckToggle.innerHTML = '<span aria-hidden="true">›</span>';
  root.insertBefore(tuckToggle, root.firstChild);

  const panel = document.getElementById("surf-bot-panel");
  const toggle = document.getElementById("surf-bot-toggle");
  const close = document.getElementById("surf-bot-close");
  const form = document.getElementById("surf-bot-form");
  const query = document.getElementById("surf-bot-query");
  const effort = document.getElementById("surf-bot-effort");
  const submit = document.getElementById("surf-bot-submit");
  const messages = document.getElementById("surf-bot-messages");
  const status = document.getElementById("surf-bot-status");
  const statusDot = document.getElementById("surf-bot-status-dot");
  const platformLabel = document.getElementById("surf-bot-platform");
  const copy = document.getElementById("surf-bot-copy");
  const initialMessage = messages.firstElementChild;
  const POSITION_KEY = "welinkbtc-surf-bot-top";
  const TUCKED_KEY = "welinkbtc-surf-bot-tucked";
  let configured = false;
  let surfPreviousResponseId = "";
  let openaiPreviousResponseId = "";
  let surfConfigured = false;
  let openaiConfigured = false;
  let sessionPlatform = "";
  let latestAnswer = "";
  let suppressToggle = false;
  const englishQuickLabels = {
    "今日市场简报": "Today's market brief", "BTC 核心变化": "BTC key changes", "核验公开信息": "Verify public claims",
    "研究早期项目": "Research early projects", "融资与解锁": "Funding & unlocks", "核验项目叙事": "Verify project narrative",
    "异动归因": "Explain anomalies", "信号交叉核验": "Cross-check signals", "核验交易逻辑": "Verify trade thesis",
    "链上周期解读": "On-chain cycle", "指标 Why It Matters": "Why it matters", "核验指标结论": "Verify metric conclusions",
    "今日 BTC 信号": "Today's BTC signals", "实时热点": "Live trends", "核验候选稿": "Verify draft",
    "核验 bStock 研报": "Verify bStock report", "研究标的风险": "Research asset risk", "复盘交易逻辑": "Review trade thesis",
    "研究工具": "Research tool", "对比同类工具": "Compare alternatives", "核验工具资料": "Verify tool profile",
    "研究当前页面": "Research this page", "生成核验清单": "Build verification checklist", "核验输入内容": "Verify input"
  };

  function isEnglish() {
    return localStorage.getItem("welinkbtc-language") === "en" || document.documentElement.lang.toLowerCase().startsWith("en");
  }

  const PAGE_CONTEXTS = {
    "index.html": { id: "all-platforms", name: "welinkBTC 首页", label: "当前场景", prompts: [
      ["今日市场简报", "研究今天加密市场最重要的三条信号，按事实、影响与待确认事项输出。"],
      ["BTC 核心变化", "研究今天 BTC 的价格、资金、链上与宏观驱动，指出最重要的变化。"],
      ["核验公开信息", "请核验下面这段公开信息中的事实、数字、时间和来源，并列出需要修正的地方：\n\n"]
    ] },
    "alphaops.html": { id: "alphaops", name: "AlphaOps", label: "当前工作台", prompts: [
      ["研究早期项目", "研究当前最值得关注的早期加密项目，重点检查产品进展、融资、用户增长、代币与风险。"],
      ["融资与解锁", "研究近期重要融资、TGE 和代币解锁事件，并分析可能影响。"],
      ["核验项目叙事", "请核验下面这段项目叙事中的团队、融资、产品、用户和代币事实：\n\n"]
    ] },
    "alpha-radar.html": { id: "alpha-radar", name: "Alpha Radar", label: "当前工作台", prompts: [
      ["异动归因", "研究当前加密市场最显著的价格、成交量、持仓量和资金费率异动，并解释可能驱动。"],
      ["信号交叉核验", "交叉核验当前多空信号，区分趋势、短期噪音和需要等待确认的指标。"],
      ["核验交易逻辑", "请核验下面这段交易逻辑的数据依据、因果关系和风险遗漏：\n\n"]
    ] },
    "dashboard.html": { id: "onchain-dashboard", name: "链上看板", label: "当前看板", prompts: [
      ["链上周期解读", "研究 BTC 当前链上周期位置，结合成本基础、长期持有者、已实现盈亏与交易所资金流。"],
      ["指标 Why It Matters", "研究今天最重要的 BTC 链上指标变化，并解释 Why It Matters 与下一确认节点。"],
      ["核验指标结论", "请核验下面这段链上指标结论的数据口径、周期比较和风险提示：\n\n"]
    ] },
    "ai-ops.html": { id: "ai-ops", name: "AI 运营台", label: "当前平台", prompts: [
      ["今日 BTC 信号", "研究今天 BTC 最重要的三条链上与市场信号，并说明哪些信息适合做成内容。"],
      ["实时热点", "研究当前加密市场最值得关注的热点，区分已确认事实、市场解读和仍待核验的信息。"],
      ["核验候选稿", "请核验下面这段候选稿中的事实、数字、时间和因果关系，并列出需要修改的地方：\n\n"]
    ] },
    "bstock-alpha.html": { id: "bstock-alpha", name: "bStockAlpha", label: "当前终端", prompts: [
      ["核验 bStock 研报", "核验当前 bStock 研报中的价格、基本面、估值、风险与来源时效。"],
      ["研究标的风险", "研究当前 bStock 标的的公司事件、代币化资产风险、流动性与价格偏离。"],
      ["复盘交易逻辑", "请复盘下面这段 bStock 交易逻辑，检查数据依据、仓位、风险与退出条件：\n\n"]
    ] },
    "toolbox.html": { id: "toolbox", name: "百宝箱", label: "当前知识库", prompts: [
      ["研究工具", "研究当前工具的产品定位、官方网站、官方 X、用户口碑与主要风险。"],
      ["对比同类工具", "对比当前类别里最常用的工具，按能力、成本、数据质量与适用场景总结。"],
      ["核验工具资料", "请核验下面这段工具资料中的官网、账号、融资、发币状态和描述：\n\n"]
    ] }
  };

  function pageContext() {
    const segment = location.pathname.split("/").filter(Boolean).pop() || "index";
    const path = segment.includes(".") ? segment : `${segment}.html`;
    if (PAGE_CONTEXTS[path]) return PAGE_CONTEXTS[path];
    const heading = document.querySelector("main h1, main h2, [role='main'] h1, h1")?.textContent?.trim();
    const title = heading || document.title.split(/[|·]/)[0].trim() || "welinkBTC";
    return {
      id: segment || "all-platforms",
      name: title,
      label: "当前页面",
      prompts: [
        ["研究当前页面", `结合 ${title} 当前页面内容，整理核心数据、关键变化、风险和需要进一步核验的事项。`],
        ["生成核验清单", `为 ${title} 当前页面生成一份事实、数据、来源、时间和风险核验清单。`],
        ["核验输入内容", "请核验下面内容中的事实、数字、时间、来源与因果关系，并列出需要修改的地方：\n\n"]
      ]
    };
  }

  function activePlatform() {
    const chip = document.querySelector(".platform-chip.active");
    if (!chip) return pageContext();
    const id = chip.dataset.platform || "weibo";
    const adapter = window.WelinkPlatformRegistry?.get(id);
    return { id, name: adapter?.name || chip.querySelector(".platform-chip-name")?.textContent?.trim() || id, label: "当前平台" };
  }

  function updatePlatform() {
    const platform = activePlatform();
    platformLabel.textContent = isEnglish()
      ? `Current context: ${platform.name}`
      : `${platform.label || "当前场景"}：${platform.name}`;
    if (sessionPlatform && sessionPlatform !== platform.id) {
      surfPreviousResponseId = "";
      openaiPreviousResponseId = "";
    }
  }

  function updateQuickPrompts() {
    const prompts = pageContext().prompts;
    document.querySelectorAll("[data-surf-slot]").forEach((button, index) => {
      const item = prompts[index] || prompts[0];
      button.textContent = isEnglish() ? (englishQuickLabels[item[0]] || item[0]) : item[0];
      button.dataset.surfPrompt = item[1];
    });
  }

  function applyAssistantLanguage() {
    const english = isEnglish();
    root.setAttribute("aria-label", english ? "Xiaowei dual-engine research assistant" : "小微双引擎深度研究助手");
    toggle.setAttribute("aria-label", english ? "Open Xiaowei research assistant" : "打开小微双引擎深度研究助手");
    toggle.querySelector("strong").textContent = english ? "Xiaowei" : "小微";
    toggle.querySelector("small").textContent = english ? "AI Research" : "双擎深研";
    document.getElementById("surf-bot-title").textContent = english ? "Xiaowei Research" : "小微深度研究";
    close.setAttribute("aria-label", english ? "Close Xiaowei" : "关闭小微助手");
    const tucked = root.classList.contains("is-tucked");
    tuckToggle.setAttribute("aria-label", tucked
      ? (english ? "Show Xiaowei icon" : "显示小微图标")
      : (english ? "Hide Xiaowei at the right edge" : "将小微隐藏到右侧"));
    tuckToggle.title = tucked ? (english ? "Show icon" : "显示图标") : (english ? "Hide at right edge" : "隐藏到右侧");
    initialMessage.querySelector("strong").textContent = english ? "Xiaowei" : "小微";
    initialMessage.querySelector("p").textContent = english
      ? "Tell me what asset, project, on-chain metric, market signal, or draft you want to research. I will organize evidence, sources, and a verification checklist for the current context."
      : "告诉我你要研究的币种、项目、链上指标、市场信号或候选稿。我会优先调用 SURF 实时研究；若未返回有效结果，OpenAI 将自动接力，并按当前场景整理证据、来源和核验清单。";
    form.querySelector(".surf-bot-input .sr-only").textContent = english ? "Enter a deep research question" : "输入深度研究问题";
    form.querySelector(".surf-bot-actions > label > span").textContent = english ? "Research depth" : "研究强度";
    const optionCopy = english ? ["Quick", "Standard", "Deep"] : ["快速", "标准", "深度"];
    effort.querySelectorAll("option").forEach((option, index) => { option.textContent = optionCopy[index]; });
    document.getElementById("surf-bot-new").textContent = english ? "New research" : "新研究";
    if (!submit.disabled) submit.textContent = english ? "Start research" : "开始研究";
    query.placeholder = english ? "Enter a research question or paste content to fact-check…" : "输入研究问题，或粘贴内容进行事实核验…";
    if (!latestAnswer) copy.textContent = english ? "Copy latest answer" : "复制最新结论";
    updateQuickPrompts();
    updatePlatform();
  }

  function setOpen(open) {
    root.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    panel.setAttribute("aria-hidden", String(!open));
    updatePlatform();
    if (open) setTimeout(() => query.focus(), 180);
  }

  function setTucked(tucked, persist = true) {
    if (tucked) setOpen(false);
    root.classList.toggle("is-tucked", tucked);
    tuckToggle.setAttribute("aria-pressed", String(tucked));
    tuckToggle.querySelector("span").textContent = tucked ? "‹" : "›";
    if (persist) localStorage.setItem(TUCKED_KEY, String(tucked));
    applyAssistantLanguage();
  }

  function setConnection(isReady, label) {
    configured = Boolean(isReady);
    root.classList.toggle("is-connected", configured);
    statusDot.classList.toggle("online", configured);
    status.textContent = label || (configured ? "研究引擎已连接" : "研究引擎未连接");
  }

  async function checkConfig() {
    try {
      const response = await fetch("/api/ai-ops-config", { headers: { Accept: "application/json" } });
      const data = await response.json();
      surfConfigured = Boolean(data?.surf?.configured);
      openaiConfigured = Boolean(data?.openai?.research || data?.openai?.configured);
      const ready = surfConfigured || openaiConfigured;
      const label = isEnglish()
        ? (surfConfigured && openaiConfigured
            ? `SURF primary · OpenAI ${data?.openai?.researchModel || "research"} fallback`
            : surfConfigured
              ? `SURF connected · ${data.surf.model || "surf-2.0"}`
              : openaiConfigured
                ? `OpenAI connected · ${data?.openai?.researchModel || "research"}`
                : "SURF and OpenAI research are not configured")
        : (surfConfigured && openaiConfigured
            ? `SURF 主引擎 · OpenAI ${data?.openai?.researchModel || "研究"} 接力`
            : surfConfigured
              ? `SURF 已连接 · ${data.surf.model || "surf-2.0"}`
              : openaiConfigured
                ? `OpenAI 已连接 · ${data?.openai?.researchModel || "研究"}`
                : "SURF 与 OpenAI 研究能力均未配置");
      setConnection(ready, label);
    } catch {
      setConnection(false, isEnglish() ? "Research engine status check failed" : "研究引擎状态检测失败");
    }
  }

  function appendLinkedText(container, text) {
    const pattern = /\[([^\]]{1,160})\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<）】》，。；！？]+)/g;
    let cursor = 0;
    for (const match of String(text).matchAll(pattern)) {
      container.append(document.createTextNode(text.slice(cursor, match.index)));
      const url = match[2] || match[3];
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = match[1] || url;
      container.append(link);
      cursor = match.index + match[0].length;
    }
    container.append(document.createTextNode(text.slice(cursor)));
  }

  function normalizeResearchDisplayText(value) {
    return String(value || "")
      .normalize("NFC")
      .replace(/\r\n?/g, "\n")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200D\u2060\uFEFF\uFFFD]/g, "")
      .replace(/[\p{Extended_Pictographic}\uFE0F]/gu, "")
      .replace(/^\s{0,3}#{1,6}\s*(.*?)\s*#*\s*$/gm, (_match, heading) => `【${String(heading).replace(/\*\*|__|`/g, "").trim()}】`)
      .replace(/^\s*(?:-{3,}|_{3,}|\*{3,})\s*$/gm, "")
      .replace(/\*\*([^*\n]+)\*\*/g, "$1")
      .replace(/__([^_\n]+)__/g, "$1")
      .replace(/`([^`\n]+)`/g, "$1")
      .replace(/"([^"\n]{1,240})"/g, "“$1”")
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function appendResearchText(container, value) {
    const text = normalizeResearchDisplayText(value);
    for (const line of text.split("\n")) {
      const clean = line.trim();
      if (!clean) continue;
      if (/^【[^】]{1,80}】$/.test(clean)) {
        const heading = document.createElement("h3");
        heading.textContent = clean;
        container.append(heading);
        continue;
      }
      const paragraph = document.createElement("p");
      if (/^(?:\d+[．、]|[·•])\s*/.test(clean)) paragraph.className = "surf-research-list-item";
      appendLinkedText(paragraph, clean);
      container.append(paragraph);
    }
  }

  function addMessage(role, text, options = {}) {
    const item = document.createElement("article");
    item.className = `surf-message ${role}${options.loading ? " loading" : ""}`;
    const avatar = document.createElement("span");
    avatar.textContent = role === "user" ? "我" : "微";
    const content = document.createElement("div");
    const author = document.createElement("strong");
    author.textContent = role === "user" ? "你" : "小微";
    const messageBody = document.createElement(options.research ? "div" : "p");
    if (options.research) {
      messageBody.className = "surf-research-copy";
      appendResearchText(messageBody, text);
    } else {
      appendLinkedText(messageBody, text);
    }
    content.append(author, messageBody);
    item.append(avatar, content);
    messages.append(item);
    messages.scrollTop = messages.scrollHeight;
    return item;
  }

  async function runResearch() {
    const prompt = query.value.trim();
    if (!prompt) return;
    if (!configured) {
      addMessage("assistant", "SURF 与 OpenAI 研究能力尚未在当前生产部署中生效。请确认 SURF_API_KEY 或 OPENAI_API_KEY 已添加到 Vercel Production 环境后重新部署。 ");
      return;
    }
    const platform = activePlatform();
    if (sessionPlatform && sessionPlatform !== platform.id) {
      surfPreviousResponseId = "";
      openaiPreviousResponseId = "";
    }
    sessionPlatform = platform.id;
    addMessage("user", prompt);
    query.value = "";
    submit.disabled = true;
    submit.textContent = isEnglish() ? "Researching…" : "研究中…";
    setConnection(true, `${platform.name} · 深度研究中`);
    const loading = addMessage("assistant", "SURF 正在优先检索实时市场、链上、新闻与社交信号；如未返回结果，OpenAI 会自动接力", { loading: true });
    try {
      const response = await fetch("/api/surf-research", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          query: prompt,
          effort: effort.value,
          platformId: platform.id,
          platformName: platform.name,
          surfPreviousResponseId,
          openaiPreviousResponseId,
          language: localStorage.getItem("welinkbtc-language") || "zh"
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.answer) throw new Error(data.error || "研究双引擎没有返回有效结论");
      loading.remove();
      if (data.provider === "openai" && data.fallback) {
        addMessage("assistant", `SURF 本次未返回有效结果（${data.fallbackReason || "未获得可显示结论"}），已由 OpenAI 自动接力完成。`);
      }
      const displayAnswer = normalizeResearchDisplayText(data.answer);
      addMessage("assistant", displayAnswer, { research: true });
      latestAnswer = displayAnswer;
      if (data.surfResponseId) surfPreviousResponseId = data.surfResponseId;
      if (data.openaiResponseId) openaiPreviousResponseId = data.openaiResponseId;
      copy.disabled = false;
      const usage = data.creditsUsed != null ? ` · ${data.creditsUsed} credits` : "";
      const engine = data.provider === "openai" ? "OpenAI 接力" : "SURF";
      setConnection(true, `${engine} · ${data.model || "研究模型"} 已完成${usage}`);
    } catch (error) {
      loading.remove();
      addMessage("assistant", `研究未完成：${error.message || "SURF 与 OpenAI 暂时不可用"}\n\n双引擎均未获得有效结果。系统不会生成或发布未经核验的替代结论，请稍后重试。`);
      setConnection(surfConfigured || openaiConfigured, "双引擎接力未完成 · 可稍后重试");
    } finally {
      submit.disabled = false;
      submit.textContent = isEnglish() ? "Start research" : "开始研究";
      query.focus();
    }
  }

  function resetConversation() {
    [...messages.children].forEach((item) => { if (item !== initialMessage) item.remove(); });
    surfPreviousResponseId = "";
    openaiPreviousResponseId = "";
    sessionPlatform = "";
    latestAnswer = "";
    copy.disabled = true;
    query.value = "";
    query.focus();
  }

  function bindDrag() {
    let pointerId = null;
    let startY = 0;
    let startTop = 0;
    let moved = false;
    const begin = (event) => {
      const onToggle = event.target.closest(".surf-bot-toggle");
      const onHandle = event.target.closest(".surf-bot-drag-handle");
      if (!onToggle && !onHandle) return;
      if (onHandle && event.target.closest("button,input,select,textarea")) return;
      if (window.matchMedia("(max-width: 620px)").matches && onHandle) return;
      pointerId = event.pointerId;
      startY = event.clientY;
      startTop = root.getBoundingClientRect().top + root.offsetHeight / 2;
      moved = false;
      document.addEventListener("pointermove", move, { passive: false });
      document.addEventListener("pointerup", end, { once: true });
      document.addEventListener("pointercancel", end, { once: true });
    };
    const move = (event) => {
      if (event.pointerId !== pointerId) return;
      const delta = event.clientY - startY;
      if (Math.abs(delta) > 4) moved = true;
      if (!moved) return;
      event.preventDefault();
      const margin = root.classList.contains("is-open") && window.innerWidth > 620 ? Math.min(330, panel.offsetHeight / 2 + 8) : 48;
      const next = Math.max(margin, Math.min(window.innerHeight - margin, startTop + delta));
      root.style.setProperty("--surf-bot-top", `${next}px`);
    };
    const end = (event) => {
      if (event.pointerId !== pointerId) return;
      document.removeEventListener("pointermove", move);
      if (moved) {
        suppressToggle = true;
        const top = parseFloat(getComputedStyle(root).getPropertyValue("--surf-bot-top"));
        if (Number.isFinite(top)) localStorage.setItem(POSITION_KEY, String(top));
        setTimeout(() => { suppressToggle = false; }, 80);
      }
      pointerId = null;
    };
    root.addEventListener("pointerdown", begin);
  }

  const savedTop = Number(localStorage.getItem(POSITION_KEY));
  if (Number.isFinite(savedTop) && savedTop > 40) root.style.setProperty("--surf-bot-top", `${Math.min(savedTop, window.innerHeight - 40)}px`);
  setTucked(localStorage.getItem(TUCKED_KEY) === "true", false);
  updateQuickPrompts();
  tuckToggle.addEventListener("click", () => setTucked(!root.classList.contains("is-tucked")));
  toggle.addEventListener("click", () => { if (!suppressToggle) setOpen(!root.classList.contains("is-open")); });
  close.addEventListener("click", () => setOpen(false));
  form.addEventListener("submit", (event) => { event.preventDefault(); runResearch(); });
  query.addEventListener("keydown", (event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); form.requestSubmit(); } });
  document.getElementById("surf-bot-new").addEventListener("click", resetConversation);
  document.querySelectorAll("[data-surf-prompt]").forEach((button) => button.addEventListener("click", () => { query.value = button.dataset.surfPrompt; query.focus(); }));
  copy.addEventListener("click", async () => {
    if (!latestAnswer) return;
    try { await navigator.clipboard.writeText(latestAnswer); copy.textContent = isEnglish() ? "Copied" : "已复制"; setTimeout(() => { copy.textContent = isEnglish() ? "Copy latest answer" : "复制最新结论"; }, 1600); }
    catch { addMessage("assistant", "浏览器未允许自动复制。请直接选中上方研究结论复制。 "); }
  });
  document.getElementById("platform-catalog")?.addEventListener("click", () => setTimeout(updatePlatform));
  window.addEventListener("welinkbtc:navigation", () => {
    const nextPlatform = pageContext();
    if (sessionPlatform && sessionPlatform !== nextPlatform.id) {
      surfPreviousResponseId = "";
      openaiPreviousResponseId = "";
      sessionPlatform = "";
    }
    updateQuickPrompts();
    updatePlatform();
  });
  window.addEventListener("welinkbtc:preferences", () => {
    applyAssistantLanguage();
    checkConfig();
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && root.classList.contains("is-open")) setOpen(false); });
  window.addEventListener("resize", () => {
    const current = root.getBoundingClientRect().top + root.offsetHeight / 2;
    const clamped = Math.max(45, Math.min(window.innerHeight - 45, current));
    root.style.setProperty("--surf-bot-top", `${clamped}px`);
  });

  bindDrag();
  applyAssistantLanguage();
  checkConfig();
})();
