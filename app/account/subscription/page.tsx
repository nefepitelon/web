import Link from "next/link";
import { createCheckoutAction, openBillingPortalAction } from "@/app/actions/billing";
import { createCryptoInvoiceAction } from "@/app/actions/crypto-billing";
import { enabledPaymentMethods, getCryptoPaymentSettings, paymentMethodLabel, type PaymentMethod } from "@/lib/crypto-payments";
import { requireViewer } from "@/lib/membership";
import { planPricing, type BillingInterval } from "@/lib/plans";

const plans = [
  { key: "free" as const, name: "Free", description: "建立身份并体验基础 Bitcoin intelligence。", features: ["基础 Dashboard 指标", "Alpha Radar 部分字段", "每月 3 次小微深研", "专属推荐链接"] },
  { key: "pro" as const, name: "Pro", description: "给需要完整分析与高频研究的专业用户。", features: ["高级 Dashboard 指标", "Alpha Radar 完整基础版", "每月 35 次标准深研", "CSV / 报告与百宝箱导出"] },
  { key: "max" as const, name: "Max", description: "全量信号、API 与交易工作台的最高会员层。", features: ["AI 网格交易 Ops 与 AIClassic", "全量高级 Alpha 信号", "API Key 与高级研究档案", "优先队列与服务"] }
];

const allMethods: Array<{ key: PaymentMethod | "STRIPE"; short: string }> = [
  { key: "BSC_USDT", short: "BSC USDT" },
  { key: "TRON_USDT", short: "TRON USDT" },
  { key: "BINANCE_UID", short: "币安 UID" },
  { key: "WECHAT", short: "微信" },
  { key: "STRIPE", short: "Stripe" }
];

export default async function SubscriptionPage({ searchParams }: { searchParams: Promise<{ checkout?: string; crypto?: string; interval?: string; method?: string }> }) {
  const viewer = await requireViewer("/account/subscription");
  const query = await searchParams;
  const interval: BillingInterval = query.interval === "year" ? "year" : "month";
  const settings = await getCryptoPaymentSettings();
  const enabled = enabledPaymentMethods(settings);
  const requestedMethod = allMethods.some((item) => item.key === query.method) ? query.method as PaymentMethod | "STRIPE" : null;
  const method: PaymentMethod | "STRIPE" = requestedMethod ?? enabled[0] ?? "STRIPE";
  const stripeReady = Boolean(process.env.STRIPE_SECRET_KEY);
  const methodReady = method === "STRIPE" ? stripeReady : enabled.includes(method);
  const linkFor = (nextInterval: BillingInterval, nextMethod = method) => `/account/subscription?interval=${nextInterval}&method=${nextMethod}`;

  return (
    <div className="section-stack">
      {viewer.accessGrant ? <div className="form-message form-message--success">Access Code 已开启 Max 全功能体验，有效至 {new Date(viewer.accessGrant.endsAt).toLocaleString("zh-CN")}。</div> : null}
      {query.checkout === "success" ? <div className="form-message form-message--success">Stripe 支付已完成，会员状态正在同步。</div> : null}
      {query.checkout === "manage_existing" ? <div className="form-message">你已有 Stripe 订阅。请先通过“管理账单”调整或取消现有订阅，避免重复扣费。</div> : null}
      {query.crypto === "not_configured" ? <div className="form-message">该收款方式尚未由管理员启用，请选择其他方式。</div> : null}
      <section className="panel">
        <div className="panel-header"><div><h2>会员订阅</h2><p>{viewer.role === "admin" ? "管理员账户已包含全站与 Max 级别功能。" : `当前方案：${viewer.plan.toUpperCase()}。BSC USDT 为推荐默认支付方式。`}</p></div>{viewer.subscription?.provider === "stripe" ? <form action={openBillingPortalAction}><button className="button button--small button--outline" type="submit" disabled={!stripeReady}>管理 Stripe 账单</button></form> : null}</div>
        <div className="panel-body">
          <div className="billing-switches">
            <div className="billing-toggle" aria-label="账期"><Link className={interval === "month" ? "is-active" : ""} href={linkFor("month")}>按月</Link><Link className={interval === "year" ? "is-active" : ""} href={linkFor("year")}>按年 · 免 2 个月</Link></div>
            <div className="billing-toggle billing-toggle--methods" aria-label="支付方式">{allMethods.map((item) => {
              const available = item.key === "STRIPE" ? stripeReady : enabled.includes(item.key);
              return <Link className={`${method === item.key ? "is-active" : ""} ${available ? "" : "is-disabled"}`} href={linkFor(interval, item.key)} key={item.key}>{item.short}</Link>;
            })}</div>
          </div>
          <div className={`crypto-method-note ${methodReady ? "is-ready" : ""}`}>
            <strong>{method === "STRIPE" ? "Stripe Sandbox" : paymentMethodLabel(method)}</strong>
            <span>{method === "BSC_USDT" ? "BSC 主网链上自动核验，满足确认数后即时开通。" : method === "TRON_USDT" ? "TRON 主网链上自动核验已确认 USDT Transfer。" : method === "BINANCE_UID" ? "向指定币安 UID 内部转账；提交订单号或截图后由管理员 4 小时内审核。" : method === "WECHAT" ? "按实时后台汇率支付人民币；提交截图后由管理员 4 小时内审核。" : "Stripe Sandbox 卡支付，由签名 Webhook 同步订阅。"}</span>
          </div>
          <div className="pricing-grid">
            {plans.map((plan) => {
              const current = viewer.plan === plan.key || (viewer.role === "admin" && plan.key === "max");
              const cents = plan.key === "free" ? 0 : planPricing[plan.key][interval];
              return <article className={`pricing-card ${plan.key === "pro" ? "pricing-card--featured" : ""}`} key={plan.key}><h3>{plan.name}</h3><p>{plan.description}</p><div className="price"><strong>{`$${(cents / 100).toFixed(0)}`}</strong><span>/ {interval === "year" ? "year" : "month"}</span></div>{interval === "year" && plan.key !== "free" ? <div className="annual-saving">按 10 个月计费，免费 2 个月</div> : null}<ul className="feature-list">{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>{plan.key === "free" ? <button className="button button--block button--outline" disabled>{current ? "当前方案" : "基础方案"}</button> : method === "STRIPE" ? <form action={createCheckoutAction.bind(null, plan.key, interval)}><button className={`button button--block ${plan.key === "pro" ? "button--light" : ""}`} type="submit" disabled={!stripeReady || current || viewer.role === "admin"}>{current ? "当前方案" : `使用 Stripe 订阅 ${plan.name}`}</button></form> : <form action={createCryptoInvoiceAction.bind(null, plan.key, interval, method)}><button className={`button button--block ${plan.key === "pro" ? "button--light" : ""}`} type="submit" disabled={!methodReady || current || viewer.role === "admin"}>{current ? "当前方案" : viewer.role === "admin" ? "管理员已含全部权益" : `使用 ${paymentMethodLabel(method)} 订阅`}</button></form>}</article>;
            })}
          </div>
        </div>
      </section>
      <section className="panel"><div className="panel-header"><div><h2>支付与权益同步</h2><p>所有等级变更均由服务端到账凭证触发，前端无法直接修改会员身份。</p></div></div><div className="panel-body"><div className="status-line"><div className="status-copy"><strong>BSC / TRON USDT</strong><span>核验官方合约、网络、地址、金额、确认数和唯一交易哈希后自动开通。</span></div><span className="status-pill">自动确认</span></div><div className="status-line"><div className="status-copy"><strong>币安 UID / 微信</strong><span>个人收款通道没有可信公开回调，提交凭证后管理员须在 4 小时内确认。</span></div><span className="status-pill status-pill--warn">人工审核</span></div></div></section>
    </div>
  );
}
