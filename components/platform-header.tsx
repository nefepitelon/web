"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AtSign,
  ArrowLeftRight,
  ChartCandlestick,
  ChevronDown,
  Crosshair,
  ExternalLink,
  Grid3X3,
  Handshake,
  LifeBuoy,
  Languages,
  Mail,
  MessageCircleMore,
  Moon,
  Newspaper,
  Package2,
  Radar,
  Send,
  Store,
  Sun,
  Trophy,
  Waves,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import type { Viewer } from "@/lib/membership";
import { readDisplayPreferences, persistDisplayPreference } from "@/lib/display-preferences";

type Language = "zh" | "en";
type Theme = "light" | "dark";

const primaryNav = [
  { href: "/", zh: "首页", en: "Home", path: "/" },
  { href: "/research", zh: "研究", en: "Research", path: "/research" },
  { href: "/dashboard", zh: "链上看板", en: "On-chain", path: "/dashboard" },
  { href: "/alphaops", zh: "AlphaOps", en: "AlphaOps", path: "/alphaops" },
  { href: "/alpha-radar", zh: "α-RadarTP", en: "α-RadarTP", path: "/alpha-radar" },
  { href: "/bstock-alpha", zh: "bStockAlpha", en: "bStockAlpha", path: "/bstock-alpha" },
  { href: "/grid-ops", zh: "AI网格", en: "AI Grid", path: "/grid-ops" },
  { href: "/tidesight-quant", zh: "观潮量化", en: "TideSight", path: "/tidesight-quant" },
] as const;

type MoreLink = {
  href: string;
  zh: string;
  en: string;
  zhDescription: string;
  enDescription: string;
  icon: LucideIcon;
  external?: boolean;
};

const productLinks: readonly MoreLink[] = [
  {
    href: "/ai-ops",
    zh: "AI运营台",
    en: "AI Ops",
    zhDescription: "自动化内容运营与发布工作台",
    enDescription: "Automated content operations and publishing",
    icon: Waves,
  },
  {
    href: "/toolbox",
    zh: "百宝箱",
    en: "Toolbox",
    zhDescription: "常用工具、账号与教程资源库",
    enDescription: "Tools, accounts, and tutorial library",
    icon: Package2,
  },
  {
    href: "/classic-grid",
    zh: "经典网格",
    en: "Classic Grid",
    zhDescription: "多交易所经典网格总控台",
    enDescription: "Multi-venue classic grid console",
    icon: Grid3X3,
  },
  {
    href: "/rankings",
    zh: "奇录排行榜",
    en: "Qilu Rankings",
    zhDescription: "人物、项目与长期主题榜单档案",
    enDescription: "People, projects, and long-term ranking archives",
    icon: Trophy,
  },
  {
    href: "https://welinkbtc.me/",
    zh: "AI潮汐Alpha",
    en: "AI Tide Alpha",
    zhDescription: "AI 工具与订阅商品店铺",
    enDescription: "AI tools and subscription store",
    icon: Store,
    external: true,
  },
];

const collaborationLinks: readonly MoreLink[] = [
  {
    href: "/contract-trading-assistant",
    zh: "合约交易助手",
    en: "Contract Trading Assistant",
    zhDescription: "合约分析、数据监控与指标共振",
    enDescription: "Contract analytics, monitoring, and signal resonance",
    icon: ChartCandlestick,
  },
  {
    href: "/multi-exchange-arbitrage",
    zh: "多交易所套利助手",
    en: "Multi-Exchange Arbitrage",
    zhDescription: "资金费率、价差与多交易所套利",
    enDescription: "Funding, spreads, and cross-venue arbitrage",
    icon: ArrowLeftRight,
  },
  {
    href: "/top-trader-radar",
    zh: "TopTrader策略雷达",
    en: "TopTrader Strategy Radar",
    zhDescription: "跟踪顶级交易员策略与市场信号",
    enDescription: "Track top-trader strategies and market signals",
    icon: Radar,
  },
  {
    href: "/trading-beats",
    zh: "TradingBeats交易阻击台",
    en: "TradingBeats Strike Desk",
    zhDescription: "链上永续合约、地址追踪与钱包分析",
    enDescription: "On-chain perpetuals, address tracking, and wallet analytics",
    icon: Crosshair,
  },
  {
    href: "/crypto-baixiaosheng",
    zh: "币圈百晓生",
    en: "Crypto Baixiaosheng",
    zhDescription: "实时币圈资讯、每日早报与市场日历",
    enDescription: "Live crypto news, daily briefs, and market calendar",
    icon: Newspaper,
  },
];

const resourceLinks: readonly MoreLink[] = [
  {
    href: "https://x.com/fly_welinkBTC",
    zh: "X 社区",
    en: "X Community",
    zhDescription: "关注官方动态与研究更新",
    enDescription: "Official updates and research",
    icon: AtSign,
    external: true,
  },
  {
    href: "https://t.me/+lr6ZZscid4o0ZDhl",
    zh: "Telegram",
    en: "Telegram",
    zhDescription: "加入 welinkBTC 社区频道",
    enDescription: "Join the welinkBTC community",
    icon: Send,
    external: true,
  },
  {
    href: "https://www.binance.com/groupList?chatId=v1.00.QzJDSWRDcnlwdEZpeGRJVoyW1RmbQWciia4jSYxam7s&source=squareProfile",
    zh: "币安聊天室",
    en: "Binance Chat",
    zhDescription: "进入 Binance Square 社区",
    enDescription: "Open the Binance Square community",
    icon: MessageCircleMore,
    external: true,
  },
  {
    href: "https://linktr.ee/welinkBTC",
    zh: "支持",
    en: "Support",
    zhDescription: "帮助、社群与官方入口",
    enDescription: "Help, community, and official links",
    icon: LifeBuoy,
    external: true,
  },
  {
    href: "/#contact",
    zh: "联系",
    en: "Contact",
    zhDescription: "联系 welinkBTC 团队",
    enDescription: "Contact the welinkBTC team",
    icon: Mail,
  },
];

function MoreMenuLink({ item, language }: { item: MoreLink; language: Language }) {
  const Icon = item.icon;
  const content = (
    <>
      <span className="platform-more-item-icon" aria-hidden="true"><Icon /></span>
      <span className="platform-more-item-copy">
        <strong>{item[language]}</strong>
        <small>{language === "zh" ? item.zhDescription : item.enDescription}</small>
      </span>
      {item.external ? <ExternalLink className="platform-more-item-external" aria-hidden="true" /> : null}
    </>
  );

  return item.external ? (
    <a href={item.href} target="_blank" rel="noopener noreferrer">{content}</a>
  ) : (
    <Link href={item.href} prefetch={false}>{content}</Link>
  );
}

function broadcastPreferences(preferences: { theme?: Theme; language?: Language }) {
  document.querySelectorAll<HTMLIFrameElement>("iframe.legacy-frame").forEach((frame) => {
    frame.contentWindow?.postMessage(
      { type: "welinkbtc:preferences", ...preferences },
      window.location.origin
    );
  });
}

function notifyPreferences(preferences: { theme?: Theme; language?: Language }) {
  window.dispatchEvent(new CustomEvent("welinkbtc:preferences", { detail: preferences }));
  broadcastPreferences(preferences);
}

export function PlatformHeader({ viewer }: { viewer: Viewer | null }) {
  const pathname = usePathname();
  const bstockContext = pathname.startsWith("/bstock-alpha");
  const [theme, setTheme] = useState<Theme>("dark");
  const [language, setLanguage] = useState<Language>("zh");
  const productRef = useRef<HTMLDetailsElement>(null);
  const moreRef = useRef<HTMLDetailsElement>(null);
  const label = viewer?.handle ?? viewer?.displayName ?? viewer?.email.split("@")[0] ?? "Account";
  const initial = label.slice(0, 1);

  useEffect(() => {
    const { theme: savedTheme, language: savedLanguage } = readDisplayPreferences();
    setTheme(savedTheme);
    setLanguage(savedLanguage);
    document.documentElement.dataset.theme = savedTheme;
    document.documentElement.dataset.language = savedLanguage;
    document.documentElement.lang = savedLanguage === "zh" ? "zh-CN" : "en";
    document.documentElement.style.colorScheme = savedTheme;
    const frame = window.requestAnimationFrame(() => notifyPreferences({ theme: savedTheme, language: savedLanguage }));
    const sync = () => {
      setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
      setLanguage(document.documentElement.dataset.language === "en" ? "en" : "zh");
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-language"] });
    return () => { window.cancelAnimationFrame(frame); observer.disconnect(); };
  }, []);

  useEffect(() => {
    productRef.current?.removeAttribute("open");
    moreRef.current?.removeAttribute("open");
  }, [pathname]);

  useEffect(() => {
    function closeMenusOnOutsidePointer(event: PointerEvent) {
      for (const menu of [productRef.current, moreRef.current]) {
        if (!menu?.contains(event.target as Node)) menu?.removeAttribute("open");
      }
    }

    function closeMenusOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        const openMenu = [productRef.current, moreRef.current].find((menu) => menu?.open);
        openMenu?.removeAttribute("open");
        openMenu?.querySelector<HTMLElement>("summary")?.focus();
      }
    }

    document.addEventListener("pointerdown", closeMenusOnOutsidePointer);
    document.addEventListener("keydown", closeMenusOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenusOnOutsidePointer);
      document.removeEventListener("keydown", closeMenusOnEscape);
    };
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    persistDisplayPreference("theme", nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    notifyPreferences({ theme: nextTheme });
  }

  function toggleLanguage() {
    const nextLanguage = language === "zh" ? "en" : "zh";
    setLanguage(nextLanguage);
    persistDisplayPreference("language", nextLanguage);
    document.documentElement.dataset.language = nextLanguage;
    document.documentElement.lang = nextLanguage === "zh" ? "zh-CN" : "en";
    notifyPreferences({ language: nextLanguage });
  }

  const themeLabel = theme === "dark"
    ? (language === "zh" ? "浅色" : "Light")
    : (language === "zh" ? "深色" : "Dark");
  const currentThemeLabel = theme === "dark"
    ? (language === "zh" ? "深色" : "Dark")
    : (language === "zh" ? "浅色" : "Light");
  const currentLanguageLabel = language === "zh" ? "中文" : "EN";
  const themeActionLabel = language === "zh" ? `当前${currentThemeLabel}，切换为${themeLabel}模式` : `Currently ${currentThemeLabel}; switch to ${themeLabel} mode`;
  const languageActionLabel = language === "zh" ? "当前中文，切换为 English" : "Currently English; switch to 中文";

  return (
    <header className={`platform-shell-header${bstockContext ? " platform-shell-header--bstock" : ""}`}>
      <Link className="platform-brand" href="/" aria-label={language === "zh" ? "WELINKBTC 首页" : "WELINKBTC Home"} prefetch={false}>
        <span className="platform-brand-mark platform-brand-mark--orbit" aria-hidden="true">
          <span className="platform-brand-orbit-disc">
            <img src="/welinkbtc-orbit-brand.webp" alt="" width="40" height="40" />
          </span>
          <i className="platform-brand-orbit-ring platform-brand-orbit-ring--outer" />
          <i className="platform-brand-orbit-ring platform-brand-orbit-ring--inner" />
        </span>
        <span>WELINKBTC</span>
      </Link>

      <nav className="platform-main-nav" aria-label={language === "zh" ? "主导航" : "Primary navigation"}>
        {primaryNav.map((item) => (
          <Link
            href={item.href}
            key={item.href}
            prefetch={false}
            aria-current={!item.href.includes("#") && pathname === item.path ? "page" : undefined}
          >
            {item[language]}
          </Link>
        ))}
        <details
          className="platform-more platform-product-menu"
          ref={productRef}
          onToggle={(event) => {
            if (event.currentTarget.open) moreRef.current?.removeAttribute("open");
          }}
        >
          <summary className="platform-more-trigger">
            <span>{language === "zh" ? "产品" : "Products"}</span>
            <ChevronDown aria-hidden="true" />
          </summary>
          <div className="platform-more-menu platform-product-menu-panel">
            <section className="platform-more-group" aria-labelledby="platform-products-title">
              <div className="platform-more-group-title" id="platform-products-title">
                <Package2 aria-hidden="true" />
                <span>{language === "zh" ? "产品" : "Products"}</span>
              </div>
              <div className="platform-more-links">
                {productLinks.map((item) => <MoreMenuLink item={item} language={language} key={item.href} />)}
              </div>
            </section>
          </div>
        </details>
        <details
          className="platform-more"
          ref={moreRef}
          onToggle={(event) => {
            if (event.currentTarget.open) productRef.current?.removeAttribute("open");
          }}
        >
          <summary className="platform-more-trigger">
            <span>{language === "zh" ? "更多" : "More"}</span>
            <ChevronDown aria-hidden="true" />
          </summary>
          <div className="platform-more-menu">
            <section className="platform-more-group" aria-labelledby="platform-more-collaboration">
              <div className="platform-more-group-title" id="platform-more-collaboration">
                <Handshake aria-hidden="true" />
                <span>{language === "zh" ? "协同" : "Collaboration"}</span>
              </div>
              <div className="platform-more-links">
                {collaborationLinks.map((item) => <MoreMenuLink item={item} language={language} key={item.href} />)}
              </div>
            </section>
            <section className="platform-more-group platform-more-group--resources" aria-labelledby="platform-more-resources">
              <div className="platform-more-group-title" id="platform-more-resources">
                <LifeBuoy aria-hidden="true" />
                <span>{language === "zh" ? "资源" : "Resources"}</span>
              </div>
              <div className="platform-more-links">
                {resourceLinks.map((item) => <MoreMenuLink item={item} language={language} key={item.href} />)}
              </div>
            </section>
          </div>
        </details>
      </nav>

      <div className="platform-header-right">
        <div className="platform-tools platform-tools--desktop" aria-label={language === "zh" ? "站点工具" : "Site tools"}>
          <button className="platform-tool platform-tool--preference" type="button" onClick={toggleTheme} aria-label={bstockContext ? themeActionLabel : themeLabel} title={bstockContext ? themeActionLabel : undefined} data-preference={bstockContext ? "theme" : undefined} data-current={bstockContext ? theme : undefined}>
            {bstockContext ? <><span className="platform-preference-icon" aria-hidden="true">{theme === "dark" ? <Moon /> : <Sun />}</span><span className="platform-preference-copy"><small>{language === "zh" ? "外观" : "Theme"}</small><strong>{currentThemeLabel}</strong></span></> : themeLabel}
          </button>
          <button className="platform-tool platform-tool--preference" type="button" onClick={toggleLanguage} aria-label={bstockContext ? languageActionLabel : (language === "zh" ? "Switch to English" : "切换到中文")} title={bstockContext ? languageActionLabel : undefined} data-preference={bstockContext ? "language" : undefined} data-current={bstockContext ? language : undefined}>
            {bstockContext ? <><span className="platform-preference-icon" aria-hidden="true"><Languages /></span><span className="platform-preference-copy"><small>{language === "zh" ? "语言" : "Language"}</small><strong>{currentLanguageLabel}</strong></span></> : (language === "zh" ? "EN" : "中")}
          </button>
        </div>

        <div className="header-account">
          {viewer ? (
            <>
              <span className={`plan-badge plan-badge--${viewer.role}`}>{viewer.role}</span>
              <Link className="header-action" href="/account" prefetch={false}>
                {viewer.avatarUrl ? <img className="header-avatar header-avatar--image" src={viewer.avatarUrl} alt="" width="34" height="34" /> : <span className="header-avatar" aria-hidden="true">{initial}</span>}
                <span className="header-label">{label}</span>
              </Link>
              {viewer.role === "admin" ? (
                <Link className="header-action header-admin-link" href="/admin" prefetch={false}>
                  {language === "zh" ? "后台" : "Admin"}
                </Link>
              ) : null}
            </>
          ) : (
            <Link className="header-action header-action--primary" href="/login" prefetch={false}>
              {language === "zh" ? "登录 / 注册" : "Sign in"}
            </Link>
          )}
        </div>

      </div>
    </header>
  );
}
