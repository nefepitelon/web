import { TwoFactorManager } from "@/components/two-factor-manager";
import { requireViewer } from "@/lib/membership";
import { prisma } from "@/lib/prisma";

export default async function SecurityPage({
  searchParams
}: {
  searchParams: Promise<{ admin_required?: string }>;
}) {
  const viewer = await requireViewer("/account/security", false);
  const [setting, unusedBackupCodes, query] = await Promise.all([
    prisma.twoFactorSetting.findUnique({ where: { userId: viewer.id } }),
    prisma.backupCode.count({ where: { userId: viewer.id, usedAt: null } }),
    searchParams
  ]);
  const enabled = Boolean(setting?.enabledAt);

  return (
    <div className="section-stack">
      <section className="panel">
        <div className="panel-header"><div><h2>双重验证 (2FA)</h2><p>TOTP 因子由认证服务管理；备份码只以不可逆摘要保存。</p></div></div>
        <div className="panel-body">
          <TwoFactorManager
            enabled={enabled}
            factorId={setting?.factorId ?? null}
            unusedBackupCodes={unusedBackupCodes}
            adminRequired={viewer.role === "admin" || query.admin_required === "1"}
          />
        </div>
      </section>
      <section className="panel">
        <div className="panel-header"><div><h2>会话与登录保护</h2><p>账户会话不存入 localStorage，关键权限在每个服务端请求重新检查。</p></div></div>
        <div className="panel-body">
          <div className="status-line"><div className="status-copy"><strong>会话 Cookie</strong><span>HttpOnly · Secure · SameSite=Lax</span></div><span className="status-pill">已启用</span></div>
          <div className="status-line"><div className="status-copy"><strong>邮箱请求限速</strong><span>按邮箱与 IP 组合限制，避免验证码轰炸。</span></div><span className="status-pill">已启用</span></div>
          <div className="status-line"><div className="status-copy"><strong>OAuth state / CSRF</strong><span>Google 由认证服务校验；社交绑定使用签名 state 与同站 Cookie。</span></div><span className="status-pill">已启用</span></div>
        </div>
      </section>
    </div>
  );
}
