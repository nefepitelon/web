import { unlinkSocialAction, unlinkWalletAction } from "@/app/actions/connections";
import { WalletConnector } from "@/components/wallet-connector";
import { prisma } from "@/lib/prisma";
import { requireViewer } from "@/lib/membership";
import { redirect } from "next/navigation";
import { hasSupabaseXIdentity, syncSupabaseXIdentity } from "@/lib/social-connections";
import { createServerSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/server";

export default async function ConnectionsPage({
  searchParams
}: {
  searchParams: Promise<{ connected?: string; error?: string; oauth?: string }>;
}) {
  const viewer = await requireViewer("/account/connections");
  const query = await searchParams;

  const [socials, wallets] = await Promise.all([
    prisma.socialAccount.findMany({ where: { userId: viewer.id }, orderBy: { createdAt: "desc" } }),
    prisma.wallet.findMany({ where: { userId: viewer.id }, orderBy: { createdAt: "desc" } })
  ]);
  const socialByProvider = new Map(socials.map((social) => [social.provider, social]));
  let twitter = socialByProvider.get("twitter");
  const discord = socialByProvider.get("discord");
  const twitterReady = isSupabaseConfigured();
  const discordReady = Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);

  // Repair the local projection when Supabase completed the link but the return
  // query/cookie was lost during a canonical-host redirect.
  if (!twitter && twitterReady) {
    let repairedTwitter = false;
    let syncError: string | null = null;
    try {
      const supabase = await createServerSupabaseClient();
      if (!supabase) throw new Error("Supabase Auth 尚未配置");
      const { data, error } = await supabase.auth.getUserIdentities();
      if (error) throw error;
      if (hasSupabaseXIdentity(data.identities)) {
        twitter = await syncSupabaseXIdentity({ userId: viewer.id, identities: data.identities });
        repairedTwitter = true;
        console.info("[connections:x] Repaired local X account projection", {
          authority: "supabase-x-oauth2"
        });
      } else if (query.oauth === "x") {
        syncError = "X 授权已返回，但 Supabase 会话中没有找到 X 身份，请重新授权";
      }
    } catch (error) {
      syncError = error instanceof Error ? error.message : "X 身份同步失败，请重新授权";
      console.error("[connections:x] Local X account repair failed", { message: syncError });
    }
    if (repairedTwitter) redirect("/account/connections?connected=twitter");
    if (syncError) redirect(`/account/connections?error=${encodeURIComponent(syncError)}`);
  }

  if (query.oauth === "x" && twitter) {
    redirect("/account/connections?connected=twitter");
  }

  return (
    <div className="section-stack">
      {query.connected ? <div className="form-message form-message--success">{query.connected} 已成功绑定。</div> : null}
      {query.error ? <div className="form-message">绑定失败：{query.error}</div> : null}
      <section className="panel">
        <div className="panel-header"><div><h2>社交账户</h2><p>通过 OAuth 验证真实账号，不接受只填写链接的伪绑定。</p></div></div>
        <div className="panel-body">
          <div className="connection-grid">
            <article className="connection-card">
              <span className="connection-icon">X</span>
              <div className="connection-copy"><strong>X / Twitter</strong><span>{twitter ? `@${twitter.username ?? twitter.providerAccountId}` : twitterReady ? "未绑定" : "等待配置 OAuth"}</span></div>
              {twitter ? (
                <form action={unlinkSocialAction}><input type="hidden" name="id" value={twitter.id} /><button className="button button--small button--outline" type="submit">解绑</button></form>
              ) : (
                <a className="button button--small" href="/api/connections/twitter/start" aria-disabled={!twitterReady}>{twitterReady ? "绑定" : "未配置"}</a>
              )}
            </article>
            <article className="connection-card">
              <span className="connection-icon">D</span>
              <div className="connection-copy"><strong>Discord</strong><span>{discord ? discord.username ?? discord.providerAccountId : discordReady ? "未绑定" : "等待配置 OAuth"}</span></div>
              {discord ? (
                <form action={unlinkSocialAction}><input type="hidden" name="id" value={discord.id} /><button className="button button--small button--outline" type="submit">解绑</button></form>
              ) : (
                <a className="button button--small" href="/api/connections/discord/start" aria-disabled={!discordReady}>{discordReady ? "绑定" : "未配置"}</a>
              )}
            </article>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header"><div><h2>Web3 钱包</h2><p>钱包签名只证明地址控制权，不会成为登录方式，也不会请求交易授权。</p></div><WalletConnector /></div>
        <div className="panel-body">
          {wallets.length ? wallets.map((wallet) => (
            <div className="status-line" key={wallet.id}>
              <div className="status-copy"><strong>{wallet.chain}</strong><span>{wallet.address}</span></div>
              <form action={unlinkWalletAction}><input type="hidden" name="id" value={wallet.id} /><button className="button button--small button--outline" type="submit">解绑</button></form>
            </div>
          )) : <div className="empty-state">尚未绑定钱包。第一版支持 EVM 签名验证；Solana 接口已预留。</div>}
          <div className="status-line">
            <div className="status-copy"><strong>Solana 钱包</strong><span>接口与数据模型已预留，当前版本暂不启用 SDK。</span></div>
            <span className="status-pill status-pill--muted">即将开放</span>
          </div>
          <div className="status-line">
            <div className="status-copy"><strong>Privy Embedded Wallet</strong><span>Adapter 与 privy_user_id / embedded_wallet_id 字段已预留，功能开关默认关闭。</span></div>
            <span className="status-pill status-pill--muted">OFF</span>
          </div>
        </div>
      </section>
    </div>
  );
}
