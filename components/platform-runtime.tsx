"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { readDisplayPreferences } from "@/lib/display-preferences";

type Language = "zh" | "en";
type Theme = "light" | "dark";

const nativePhrases: Array<readonly [string, string]> = [
  ["Max 与管理员可进入完整交易工作台；未登录、Free 与 Pro 账户保留产品说明和升级入口。所有交易写接口同时执行服务端权限校验。", "Max members and administrators can enter the full trading workspace. Guests, Free, and Pro accounts retain product information and upgrade access. Every trading mutation is also authorized server-side."],
  ["访客可预览前三条信号与打码字段", "Guests can preview the first three signals and masked fields"],
  ["预览到这里，完整信号在会员层。", "The preview ends here. Full signals are available to members."],
  ["访客可预览前三条信号与打码字段 登录后即可查看基础内容；Pro 与 Max 会继续解锁高级指标、导出、研究额度和 API。", "Guests can preview the first three signals and masked fields. Sign in for basic content; Pro and Max unlock advanced metrics, exports, research credits, and APIs."],
  ["完整能力、运营配置与审计", "Full access, operations configuration, and audit"],
  ["完整交易工作台与执行能力", "Full trading workspace and execution"],
  ["高级研究、导出与策略预览", "Advanced research, exports, and strategy previews"],
  ["基础内容与会员入口", "Basic content and membership access"],
  ["功能介绍与有限预览", "Product information and limited preview"],
  ["查看权限与价格", "View access and pricing"],
  ["角色权限说明", "Role access guide"],
  ["登录查看完整内容", "Sign in for full access"],
  ["比较会员方案", "Compare plans"],
  ["登录 / 注册", "Sign in / Register"],
  ["管理后台", "Admin Console"],
  ["运营总览", "Operations Overview"],
  ["用户管理", "User Management"],
  ["订阅管理", "Subscription Management"],
  ["推荐返佣", "Referral Commissions"],
  ["内容权限", "Content Access"],
  ["百宝箱工具台", "Toolbox Console"],
  ["审计日志", "Audit Log"],
  ["返回个人中心", "Back to Account"],
  ["返回用户管理", "Back to Users"],
  ["查看用户中心、搜索、封禁、角色授权与 2FA 重置。最多显示最近 100 条。", "Inspect users, search, suspend accounts, assign roles, and reset 2FA. Shows up to the latest 100 records."],
  ["邮箱或用户名", "Email or username"],
  ["查看中心", "View Center"],
  ["保存角色", "Save Role"],
  ["封禁", "Suspend"],
  ["搜索", "Search"],
  ["绑定推特", "X linked"],
  ["已绑定钱包", "Wallet linked"],
  ["持有 WLB", "WLB holder"],
  ["个人资料与账户状态", "Profile and account status"],
  ["绑定账户", "Linked Accounts"],
  ["当前权限", "Current access"],
  ["成功邀请", "Successful referrals"],
  ["累计返佣", "Total commission"],
  ["新人任务", "Onboarding tasks"],
  ["显示名称", "Display name"],
  ["个人简介", "Bio"],
  ["账户状态", "Account status"],
  ["邮箱身份", "Email identity"],
  ["双重验证", "Two-factor authentication"],
  ["加入时间", "Joined"],
  ["提现审核", "Withdrawal Review"],
  ["收款地址", "Destination address"],
  ["复制地址", "Copy address"],
  ["申请时间", "Requested"],
  ["链上审批", "On-chain approval"],
  ["核验哈希并批准", "Verify hash and approve"],
  ["拒绝并释放 Pending", "Reject and release Pending"],
  ["活动奖励发放", "Campaign Rewards"],
  ["用户资产账户", "User Asset Accounts"],
  ["可用", "Available"],
  ["累计入账", "Total credited"],
  ["累计支出", "Total spent"],
  ["工具知识库", "Tool Knowledge Base"],
  ["AI 网格交易 Ops", "AI Grid Trading Ops"],
  ["添加工具", "Add Tool"],
  ["添加分类", "Add Category"],
  ["导出 Excel", "Export Excel"],
  ["操作日志", "Activity Log"],
  ["搜索名称、链接、账号或教程", "Search names, links, accounts, or tutorials"],
  ["全部分类", "All categories"],
  ["全部发布状态", "All publishing states"],
  ["全部公开状态", "All visibility states"],
  ["全部评分", "All ratings"],
  ["常用", "Favorites"],
  ["分类", "Category"],
  ["序号", "Order"],
  ["名称", "Name"],
  ["简要描述", "Description"],
  ["官方推特", "Official X"],
  ["官网链接", "Official Website"],
  ["登录账号", "Login Account"],
  ["是否发币", "Token Issued"],
  ["是否发布", "Published"],
  ["是否公开", "Public"],
  ["评分", "Rating"],
  ["融资", "Funding"],
  ["空投交互教程", "Airdrop Tutorial"],
  ["操作", "Actions"],
  ["导入", "Import"],
  ["管理员", "Administrator"],
  ["未登录", "Guest"],
  ["登录", "Sign in"],
  ["研究", "Research"]
];
nativePhrases.sort((left, right) => right[0].length - left[0].length);

const textOriginals = new WeakMap<Text, string>();
const attributeOriginals = new WeakMap<Element, Record<string, string>>();
const translatedAttributes = ["placeholder", "title", "aria-label"] as const;

function isNativeTranslationExcluded(node: Node) {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  return Boolean(element?.closest(
    ".platform-shell-header, [data-native-i18n='react'], #surf-assistant, script, style, code, pre, svg, " +
    "[aria-label='神秘园站内音乐播放器'], [aria-label='Secret Garden site music player']"
  ));
}

function translateNativeValue(value: string) {
  return nativePhrases.reduce((output, [zh, en]) => output.split(zh).join(en), value);
}

function applyNativeLanguage(language: Language, target: Node = document.querySelector(".app-shell") ?? document.body) {
  if (isNativeTranslationExcluded(target)) return;
  const updateNode = (node: Node) => {
    if (isNativeTranslationExcluded(node)) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const textNode = node as Text;
      if (!textOriginals.has(textNode)) textOriginals.set(textNode, textNode.nodeValue ?? "");
      const original = textOriginals.get(textNode) ?? "";
      const next = language === "en" ? translateNativeValue(original) : original;
      if (textNode.nodeValue !== next) textNode.nodeValue = next;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as Element;
    if (!attributeOriginals.has(element)) attributeOriginals.set(element, {});
    const originals = attributeOriginals.get(element)!;
    translatedAttributes.forEach((attribute) => {
      if (!element.hasAttribute(attribute)) return;
      if (!(attribute in originals)) originals[attribute] = element.getAttribute(attribute) ?? "";
      element.setAttribute(attribute, language === "en" ? translateNativeValue(originals[attribute]) : originals[attribute]);
    });
  };

  updateNode(target);
  const walker = document.createTreeWalker(target, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    updateNode(node);
    node = walker.nextNode();
  }
}

function readPreferences() {
  return readDisplayPreferences();
}

function applyPreferences(preferences = readPreferences()) {
  document.documentElement.dataset.theme = preferences.theme;
  document.documentElement.dataset.language = preferences.language;
  document.documentElement.lang = preferences.language === "zh" ? "zh-CN" : "en";
  document.documentElement.style.colorScheme = preferences.theme;
  document.querySelectorAll<HTMLIFrameElement>("iframe.legacy-frame, iframe[data-welink-preferences]").forEach((frame) => {
    frame.contentWindow?.postMessage(
      { type: "welinkbtc:preferences", ...preferences },
      window.location.origin
    );
  });
}

export function PlatformRuntime() {
  const pathname = usePathname();

  useEffect(() => {
    const sync = () => {
      const preferences = readPreferences();
      applyPreferences(preferences);
      applyNativeLanguage(preferences.language);
    };
    const onPreference = (event: Event) => {
      const detail = (event as CustomEvent<Partial<{ theme: Theme; language: Language }>>).detail;
      const current = readPreferences();
      applyPreferences({
        theme: detail?.theme ?? current.theme,
        language: detail?.language ?? current.language
      });
      applyNativeLanguage(detail?.language ?? current.language);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === "welinkbtc-theme" || event.key === "welinkbtc-language") sync();
    };
    const onVisibility = () => {
      document.documentElement.classList.toggle("is-page-hidden", document.hidden);
    };
    const observer = new MutationObserver((mutations) => {
      const language = readPreferences().language;
      mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => applyNativeLanguage(language, node)));
    });

    sync();
    onVisibility();
    observer.observe(document.querySelector(".app-shell") ?? document.body, { childList: true, subtree: true });
    window.addEventListener("welinkbtc:preferences", onPreference);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("welinkbtc:preferences", onPreference);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const preferences = readPreferences();
    applyPreferences(preferences);
    window.requestAnimationFrame(() => {
      applyNativeLanguage(preferences.language);
      window.dispatchEvent(new CustomEvent("welinkbtc:navigation", { detail: { pathname } }));
    });
  }, [pathname]);

  return null;
}
