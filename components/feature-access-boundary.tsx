import Link from "next/link";
import type { EntitlementKey } from "@/lib/entitlements";
import { configuredAccess } from "@/lib/content-gates";
import type { Viewer } from "@/lib/membership";

const tierLabels = [
  ["未登录", "功能介绍与有限预览"],
  ["Free", "基础内容与会员入口"],
  ["Pro", "高级研究、导出与策略预览"],
  ["Max", "完整交易工作台与执行能力"],
  ["管理员", "完整能力、运营配置与审计"]
] as const;

export async function FeatureAccessBoundary({
  viewer,
  entitlement,
  title,
  description,
  children
}: {
  viewer: Viewer | null;
  entitlement: EntitlementKey;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const access = await configuredAccess(viewer, entitlement);
  if (access.allowed) return children;

  return (
    <main className="feature-access-page">
      <section className="feature-access-card">
        <p className="eyebrow">ROLE BASED ACCESS</p>
        <h1>{title}</h1>
        <p>{description}</p>
        <div className="feature-access-tiers" aria-label="角色权限说明">
          {tierLabels.map(([label, detail], index) => (
            <div className={index === 3 ? "is-required" : ""} key={label}>
              <span>{label}</span><strong>{detail}</strong>
            </div>
          ))}
        </div>
        <div className="feature-access-actions">
          <Link className="button" href={viewer ? "/account/subscription" : `/login?next=${encodeURIComponent(entitlement === "grid.ops" ? "/grid-ops" : "/classic-grid")}`}>
            {viewer ? "升级 Max" : "登录 / 注册"}
          </Link>
          <Link className="button button--outline" href="/account/subscription">查看权限与价格</Link>
        </div>
      </section>
    </main>
  );
}
