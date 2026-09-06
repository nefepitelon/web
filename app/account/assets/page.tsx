import Link from "next/link";
import { createWlbDepositAction, transferWlbAction, withdrawWlbAction } from "@/app/actions/wlb-assets";
import { enabledPaymentMethods, getCryptoPaymentSettings, paymentMethodLabel } from "@/lib/crypto-payments";
import { requireViewer } from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { formatUsdtFromMilliWlb, formatWlb, getWlbAssetSettings, syncEligibleCommissionWlb } from "@/lib/wlb-assets";

export const dynamic = "force-dynamic";

const typeLabels: Record<string, string> = {
  DEPOSIT: "充值",
  TRANSFER: "站内划转",
  WITHDRAWAL: "提现",
  COMMISSION: "邀请返佣",
  REWARD: "活动奖励",
  ADJUSTMENT: "资产调整"
};

const statusLabels: Record<string, string> = {
  PENDING: "待处理",
  CONFIRMING: "链上确认中",
  COMPLETED: "已完成",
  REJECTED: "已拒绝",
  FAILED: "失败",
  EXPIRED: "已过期"
};

function transactionAmount(transaction: { type: string; ownerUserId: string; counterpartyUserId: string | null; amountMilliWlb: bigint }, userId: string) {
  if (transaction.type === "WITHDRAWAL") return -transaction.amountMilliWlb;
  if (transaction.type === "TRANSFER") return transaction.ownerUserId === userId ? -transaction.amountMilliWlb : transaction.amountMilliWlb;
  return transaction.amountMilliWlb;
}

export default async function AccountAssetsPage({ searchParams }: { searchParams: Promise<{ error?: string; transferred?: string; withdrawal?: string }> }) {
  const viewer = await requireViewer("/account/assets");
  await syncEligibleCommissionWlb(viewer.id);
  const query = await searchParams;
  const [settings, cryptoSettings, account, deposits, inboundTransfers, commissions, rewards, transactions] = await Promise.all([
    getWlbAssetSettings(),
    getCryptoPaymentSettings(),
    prisma.wlbAccount.upsert({ where: { userId: viewer.id }, update: {}, create: { userId: viewer.id } }),
    prisma.wlbTransaction.aggregate({ where: { ownerUserId: viewer.id, type: "DEPOSIT", status: "COMPLETED" }, _sum: { amountMilliWlb: true } }),
    prisma.wlbTransaction.aggregate({ where: { counterpartyUserId: viewer.id, type: "TRANSFER", status: "COMPLETED" }, _sum: { amountMilliWlb: true } }),
    prisma.wlbTransaction.aggregate({ where: { ownerUserId: viewer.id, type: "COMMISSION", status: "COMPLETED" }, _sum: { amountMilliWlb: true } }),
    prisma.wlbTransaction.aggregate({ where: { ownerUserId: viewer.id, type: { in: ["REWARD", "ADJUSTMENT"] }, status: "COMPLETED" }, _sum: { amountMilliWlb: true } }),
    prisma.wlbTransaction.findMany({
      where: { OR: [{ ownerUserId: viewer.id }, { counterpartyUserId: viewer.id }] },
      include: {
        owner: { select: { email: true, profile: { select: { handle: true } } } },
        counterparty: { select: { email: true, profile: { select: { handle: true } } } }
      },
      orderBy: { createdAt: "desc" },
      take: 50
    })
  ]);
  const methods = enabledPaymentMethods(cryptoSettings).filter((method) => ["BSC_USDT", "TRON_USDT"].includes(method));
  const total = account.availableMilliWlb + account.pendingWithdrawalMilliWlb;
  const errorMessages: Record<string, string> = {
    invalid_amount: "金额格式无效，请最多保留 3 位 WLB 小数或 2 位 USDT 小数。",
    amount_out_of_range: "金额低于最小限额或超过系统上限。",
    invalid_payment_method: "请选择 BSC USDT 或 TRON USDT。",
    payment_method_not_configured: "该链收款通道尚未启用，请联系管理员。",
    deposit_disabled: "充值当前暂停。",
    transfer_disabled: "站内划转当前暂停。",
    withdrawal_disabled: "提现当前暂停。",
    invalid_recipient: "请输入 3–20 位小写字母用户名，可带 .welinkBTC 后缀。",
    recipient_not_found: "没有找到该用户名对应的有效用户。",
    self_transfer_not_allowed: "不能向自己的账户划转。",
    sender_username_required: "请先设置用户名后再使用站内划转。",
    insufficient_wlb: "可用 WLB 余额不足。",
    daily_transfer_limit: "已达到今日站内划转限额。",
    invalid_payout_address: "提现地址与所选网络不匹配。",
    withdrawal_precision: "提现金额扣除手续费后须为 0.1 WLB 的整数倍。"
  };

  return (
    <div className="section-stack wlb-assets">
      {query.transferred ? <div className="form-message form-message--success">站内划转已完成，双方账本已同步入账。</div> : null}
      {query.withdrawal ? <div className="form-message form-message--success">提现申请已提交，资金已进入 Pending；管理员完成链上转账并核验交易哈希后结算。</div> : null}
      {query.error ? <div className="form-message">{errorMessages[query.error] ?? "资产操作失败，请检查输入后重试。"}</div> : null}

      <section className="panel wlb-balance-panel">
        <div className="panel-header">
          <div><p className="eyebrow">INTERNAL ASSET · WLB</p><h2>站内总资产</h2><p>固定换算：1 USDT = 10 WLB。WLB 是 welinkBTC 站内记账单位，不是链上代币。</p></div>
          <span className="status-pill">REAL-TIME LEDGER</span>
        </div>
        <div className="panel-body">
          <div className="wlb-balance-hero">
            <span>总资产</span>
            <div className="wlb-balance-hero__main">
              <div className="wlb-balance-amount">
                <strong>{formatWlb(total)} <small>WLB</small></strong>
                <p>≈ {formatUsdtFromMilliWlb(total)} USDT</p>
              </div>
              <nav className="wlb-quick-actions" aria-label="资产快捷操作">
                <Link className="wlb-quick-action wlb-quick-action--deposit" href="#wlb-deposit">
                  <span aria-hidden="true">＋</span><span><strong>充值</strong><small>BSC / TRON USDT</small></span>
                </Link>
                <Link className="wlb-quick-action wlb-quick-action--transfer" href="#wlb-transfer">
                  <span aria-hidden="true">⇄</span><span><strong>划转</strong><small>站内实时到账</small></span>
                </Link>
                <Link className="wlb-quick-action wlb-quick-action--withdraw" href="#wlb-withdraw">
                  <span aria-hidden="true">↗</span><span><strong>提现</strong><small>审核后链上转账</small></span>
                </Link>
              </nav>
            </div>
          </div>
          <div className="stat-grid">
            <div className="stat-card"><span>可用余额</span><strong>{formatWlb(account.availableMilliWlb)}</strong><small>WLB</small></div>
            <div className="stat-card"><span>提现 Pending</span><strong>{formatWlb(account.pendingWithdrawalMilliWlb)}</strong><small>WLB</small></div>
            <div className="stat-card"><span>累计入账</span><strong>{formatWlb(account.totalCreditedMilliWlb)}</strong><small>WLB</small></div>
            <div className="stat-card"><span>累计支出</span><strong>{formatWlb(account.totalDebitedMilliWlb)}</strong><small>WLB</small></div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header"><div><h2>资产来源</h2><p>所有来源均由服务端不可变流水汇总，返佣只在批准后兑换为 WLB。</p></div></div>
        <div className="panel-body"><div className="wlb-source-grid">
          <div><span>用户充值</span><strong>{formatWlb(deposits._sum.amountMilliWlb ?? 0n)}</strong><small>WLB</small></div>
          <div><span>站内转入</span><strong>{formatWlb(inboundTransfers._sum.amountMilliWlb ?? 0n)}</strong><small>WLB</small></div>
          <div><span>累计返佣</span><strong>{formatWlb(commissions._sum.amountMilliWlb ?? 0n)}</strong><small>WLB</small></div>
          <div><span>活动与其他奖励</span><strong>{formatWlb(rewards._sum.amountMilliWlb ?? 0n)}</strong><small>WLB</small></div>
        </div></div>
      </section>

      <section className="wlb-action-grid" aria-label="资产操作">
        <article className="panel" id="wlb-deposit">
          <div className="panel-header"><div><p className="eyebrow">01 · DEPOSIT</p><h2>充值</h2><p>仅支持 BSC / TRON USDT 汇入管理员配置的收款地址。</p></div></div>
          <div className="panel-body"><form action={createWlbDepositAction} className="asset-form">
            <div className="field"><label htmlFor="depositMethod">充值网络</label><select className="select" id="depositMethod" name="method" defaultValue="BSC_USDT">{methods.map((method) => <option value={method} key={method}>{paymentMethodLabel(method)}</option>)}</select></div>
            <div className="field"><label htmlFor="depositAmount">充值金额（USDT）</label><input className="input" id="depositAmount" name="amountUsdt" type="number" min={settings.minDepositUsdt} step="0.01" placeholder={`最低 ${settings.minDepositUsdt} USDT`} required /></div>
            <p className="asset-form-note">到账后按固定比例自动换算，例如 10 USDT = 100 WLB。</p>
            <button className="button" type="submit" disabled={!settings.depositEnabled || methods.length === 0}>创建充值订单</button>
          </form></div>
        </article>

        <article className="panel" id="wlb-transfer">
          <div className="panel-header"><div><p className="eyebrow">02 · INTERNAL</p><h2>站内划转</h2><p>通过已绑定的 用户名.welinkBTC 实时到账，不可撤销。</p></div></div>
          <div className="panel-body"><form action={transferWlbAction} className="asset-form">
            <div className="field"><label htmlFor="recipient">收款用户名</label><input className="input" id="recipient" name="recipient" placeholder="alice.welinkBTC" autoComplete="off" required /></div>
            <div className="field"><label htmlFor="transferAmount">划转金额（WLB）</label><input className="input" id="transferAmount" name="amountWlb" type="number" min={settings.minTransferWlb} max={settings.maxDailyTransferWlb} step="0.001" required /></div>
            <div className="field"><label htmlFor="transferNote">备注（可选）</label><input className="input" id="transferNote" name="note" maxLength={300} /></div>
            <button className="button" type="submit" disabled={!settings.transferEnabled}>确认站内划转</button>
          </form></div>
        </article>

        <article className="panel" id="wlb-withdraw">
          <div className="panel-header"><div><p className="eyebrow">03 · WITHDRAW</p><h2>提现</h2><p>提交后冻结为 Pending，管理员链上转账并核验成功后完成。</p></div></div>
          <div className="panel-body"><form action={withdrawWlbAction} className="asset-form">
            <div className="field"><label htmlFor="withdrawMethod">提现网络</label><select className="select" id="withdrawMethod" name="method" defaultValue="BSC_USDT">{methods.map((method) => <option value={method} key={method}>{paymentMethodLabel(method)}</option>)}</select></div>
            <div className="field"><label htmlFor="withdrawAddress">USDT 收款地址</label><input className="input" id="withdrawAddress" name="payoutAddress" placeholder="0x… 或 T…" required /></div>
            <div className="field"><label htmlFor="withdrawAmount">提现金额（WLB）</label><input className="input" id="withdrawAmount" name="amountWlb" type="number" min={settings.minWithdrawalWlb} step="0.1" required /></div>
            <p className="asset-form-note">最低 {settings.minWithdrawalWlb} WLB；手续费 {settings.withdrawalFeeWlb} WLB。请确认网络与地址一致。</p>
            <button className="button" type="submit" disabled={!settings.withdrawalEnabled || methods.length === 0}>提交提现审核</button>
          </form></div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-header"><div><h2>近期资金账单</h2><p>记录充值、提现、站内划转、返佣与活动奖励。点击充值单可继续链上核验。</p></div></div>
        <div className="table-wrap"><table className="data-table asset-ledger-table"><thead><tr><th>时间</th><th>分类</th><th>对方 / 网络</th><th>金额</th><th>状态</th><th>凭证</th></tr></thead><tbody>
          {transactions.length ? transactions.map((transaction) => {
            const amount = transactionAmount(transaction, viewer.id);
            const counterparty = transaction.type === "TRANSFER"
              ? transaction.ownerUserId === viewer.id
                ? transaction.counterparty?.profile?.handle
                : transaction.owner.profile?.handle
              : null;
            return <tr key={transaction.id}><td>{transaction.createdAt.toLocaleString("zh-CN")}</td><td><strong>{typeLabels[transaction.type] ?? transaction.type}</strong>{transaction.note ? <><br /><span>{transaction.note}</span></> : null}</td><td>{counterparty ? `${counterparty}.welinkBTC` : transaction.network ?? "welinkBTC"}</td><td className={amount >= 0n ? "asset-amount--credit" : "asset-amount--debit"}>{amount >= 0n ? "+" : ""}{formatWlb(amount)} WLB</td><td><span className={`status-pill ${["PENDING", "CONFIRMING"].includes(transaction.status) ? "status-pill--warn" : transaction.status === "COMPLETED" ? "" : "status-pill--muted"}`}>{statusLabels[transaction.status] ?? transaction.status}</span></td><td>{transaction.type === "DEPOSIT" && transaction.status !== "COMPLETED" ? <Link href={`/account/assets/deposit/${transaction.id}`}>继续核验 →</Link> : transaction.txHash ? <code>{transaction.txHash.slice(0, 10)}…</code> : "—"}</td></tr>;
          }) : <tr><td colSpan={6}>暂无资金账单。</td></tr>}
        </tbody></table></div>
      </section>
    </div>
  );
}
