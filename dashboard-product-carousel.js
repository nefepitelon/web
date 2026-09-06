(() => {
  const mount = document.querySelector("#onchain-carousel");
  if (!mount) return;

  const loaderScript = document.currentScript;
  const assetBase = loaderScript?.src
    ? new URL(".", loaderScript.src).pathname.replace(/\/$/, "")
    : "";
  const assetUrl = (file) => `${assetBase}/${file}`;

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

  const loadDashboardController = () => new Promise((resolve, reject) => {
    if (window.updateProductDashboardLanguage) {
      resolve();
      return;
    }

    const existing = document.querySelector("script[data-dashboard-product-carousel]");
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = assetUrl("product-dashboard.js?v=20260831-sthbands-v1");
    script.dataset.dashboardProductCarousel = "true";
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
      const response = await fetch(assetUrl("index.html?v=20260831-sthbands-v1"), { cache: "no-cache" });
      if (!response.ok) throw new Error(`Homepage component request failed: ${response.status}`);

      const sourceDocument = new DOMParser().parseFromString(await response.text(), "text/html");
      const sourceSection = sourceDocument.querySelector("#power-law");
      if (!sourceSection) throw new Error("Homepage on-chain snapshot component was not found");

      const section = document.importNode(sourceSection, true);
      section.classList.add("dashboard-onchain-carousel");
      adaptCarouselForDashboard(section);
      mount.replaceChildren(section);

      window.updateDashboardLanguage?.();
      await loadDashboardController();
      window.updateProductDashboardLanguage?.();
      window.dispatchEvent(new CustomEvent("dashboard:carousel-ready"));
    } catch (error) {
      console.error("Unable to mount the dashboard 2D/3D indicator loop", error);
      showError();
    }
  };

  mountCarousel();
})();
