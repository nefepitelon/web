import Link from "next/link";
import type { EntitlementKey } from "@/lib/entitlements";
import { configuredAccess } from "@/lib/content-gates";
import { getViewer, requireAdmin } from "@/lib/membership";

function Locked({ title, description, href = "/account/subscription" }: { title: string; description: string; href?: string }) {
  return (
    <section className="panel">
      <div className="panel-body">
        <p className="eyebrow">ACCESS GATE</p>
        <h2>{title}</h2>
        <p className="field-hint">{description}</p>
        <Link className="button" href={href}>解锁此内容</Link>
      </div>
    </section>
  );
}

export async function AuthGate({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) return fallback ?? <Locked title="登录后继续" description="该区域需要经过验证的 welinkBTC 账户。" href="/login" />;
  return children;
}

export async function SubscriptionGate({
  entitlement,
  children,
  fallback
}: {
  entitlement: EntitlementKey;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const viewer = await getViewer();
  const access = await configuredAccess(viewer, entitlement);
  if (!access.allowed) {
    return fallback ?? <Locked title="会员内容已锁定" description={`当前账户不具备 ${entitlement} 权益。`} />;
  }
  return children;
}

export async function AdminGate({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return children;
}
