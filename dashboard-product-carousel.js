(() => {
  const mount = document.querySelector("#onchain-carousel");
  if (!mount) return;

  const loaderScript = document.currentScript;
  const assetBase = loaderScript?.src
    ? new URL(".", loaderScript.src).pathname.replace(/\/$/, "")
    : "";
  const assetUrl = (file) => `${assetBase}/${file}`;
  const experienceVersion = "20260917-mvrv-zscore-watermark-v2";

  const adaptCarouselForDashboard = (section) => {
    const brand = section.querySelector(".power-law-brand");
    const subtitle = brand?.querySelector("em");
    const actions = section.querySelector(".power-law-actions");
    const promotionalCopy = section.querySelector(".power-law-copy");

    promotionalCopy?.remove();

    if (!brand || !subtitle || !actions) return;

    const titleLine = document.createElement("div");
    titleLine.className = "dashboard-carousel-title-line";
    actions.classList.add("dashboard-carousel-title-actions");
    titleLine.append(subtitle, actions);
    brand.appendChild(titleLine);
  };

  const loadSharedScript = (file, marker, isReady) => new Promise((resolve, reject) => {
    if (isReady()) {
      resolve();
      return;
    }

    const existing = document.querySelector(`script[data-${marker}]`);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = assetUrl(`${file}?v=${experienceVersion}`);
    script.setAttribute(`data-${marker}`, "true");
    script.addEventListener("load", resolve, { once: true });
    script.addEventListener("error", reject, { once: true });
    document.body.appendChild(script);
  });

  const showError = () => {
    const panel = document.createElement("div");
    panel.className = "dashboard-carousel-loading is-error";
    panel.setAttribute("role", "alert");

    const message = document.createElement("strong");
    message.dataset.i18n = "carousel.error";
    message.textContent = document.documentElement.lang.startsWith("en")
      ? "The 2D/3D indicator loop is temporarily unavailable"
      : "2/3D 指标轮询集暂时无法载入";

    panel.appendChild(message);
    mount.replaceChildren(panel);
  };

  const mountCarousel = async () => {
    try {
      const response = await fetch(assetUrl(`index.html?v=${experienceVersion}`), { cache: "no-cache" });
      if (!response.ok) throw new Error(`Homepage component request failed: ${response.status}`);

      const sourceDocument = new DOMParser().parseFromString(await response.text(), "text/html");
      const sourceSection = sourceDocument.querySelector("#power-law");
      if (!sourceSection) throw new Error("Homepage on-chain snapshot component was not found");

      const section = document.importNode(sourceSection, true);
      section.classList.add("dashboard-onchain-carousel");
      // Enable the shared camera/motion lifecycle without applying homepage layout
      // rules to the surrounding dashboard or its embedded document.
      section.dataset.onchainExperience = "shared-3d";
      adaptCarouselForDashboard(section);
      mount.replaceChildren(section);

      window.updateDashboardLanguage?.();
      await loadSharedScript("trend-indicator-cycle.js", "dashboard-trend-cycle", () => Boolean(window.WelinkTrendIndicatorCycle?.create));
      await loadSharedScript("product-dashboard.js", "dashboard-product-carousel", () => Boolean(window.updateProductDashboardLanguage));
      window.updateProductDashboardLanguage?.();
      window.dispatchEvent(new CustomEvent("dashboard:carousel-ready"));
    } catch (error) {
      console.error("Unable to mount the dashboard 2D/3D indicator loop", error);
      showError();
    }
  };

  mountCarousel();
})();
