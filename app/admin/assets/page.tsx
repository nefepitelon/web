import Link from "next/link";
import {
  grantWlbRewardAction,
  reviewWlbWithdrawalAction,
  updateWlbAssetSettingsAction
} from "@/app/actions/admin-wlb-assets";
import { CopyButton } from "@/components/copy-button";
import { paymentMethodLabel } from "@/lib/crypto-payments";
import { requireAdmin } from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { formatUsdtFromMilliWlb, formatWlb, getWlbAssetSettings } from "@/lib/wlb-assets";

export const dynamic = "force-dynamic";

const typeLabels: Record<string, string> = {
  DEPOSIT: "充值",
  TRANSFER: "站内划转",
  WITHDRAWAL: "提现",
  COMMISSION: "返佣",
  REWARD: "活动奖励",
  ADJUSTMENT: "调账"
};

const statusLabels: Record<string, string> = {
  PENDING: "待处理",
  CONFIRMING: "链上确认中",
  COMPLETED: "已完成",
  REJECTED: "已拒绝",
  FAILED: "失败",
  EXPIRED: "已过期"
};

export default async function AdminAssetsPage({ searchParams }: {
  searchParams: Promise<{ saved?: string; reviewed?: string; rewarded?: string; error?: string }>;
}) {
  await requireAdmin("/admin/assets");
  const [settings, totals, pendingWithdrawals, recentTransactions, accounts, eligibleCommissions, creditedCommissionReferences, query] = await Promise.all([
    getWlbAssetSettings(),
    prisma.wlbAccount.aggregate({
      _count: { _all: true },
      _sum: {
        availableMilliWlb: true,
        pendingWithdrawalMilliWlb: true,
        totalCreditedMilliWlb: true,
        totalDebitedMilliWlb: true
      }
    }),
    prisma.wlbTransaction.findMany({
      where: { type: "WITHDRAWAL", status: "PENDING" },
      include: { owner: { include: { profile: true } } },
      orderBy: { createdAt: "asc" },
      take: 100
    }),
    prisma.wlbTransaction.findMany({
      include: {
        owner: { include: { profile: true } },
        counterparty: { include: { profile: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 200
    }),
    prisma.wlbAccount.findMany({
      include: { user: { include: { profile: true } } },
      orderBy: { availableMilliWlb: "desc" },
      take: 100
    }),
    prisma.commissionLedger.findMany({
      where: { status: { in: ["APPROVED", "PAYABLE", "PAID"] }, amountCents: { gt: 0 } },
      select: { id: true },
      take: 5000
    }),
    prisma.wlbTransaction.findMany({
      where: { type: "COMMISSION", externalReference: { not: null } },
      select: { externalReference: true },
      take: 5000
    }),
    searchParams
  ]);

  const available = totals._sum.availableMilliWlb ?? 0n;
  const pending = totals._sum.pendingWithdrawalMilliWlb ?? 0n;
  const creditedCommissionIds = new Set(
    creditedCommissionReferences
      .map((item) => item.externalReference?.replace(/^commission:/, "") ?? "")
      .filter(Boolean)
  );
  const unsyncedCommissions = eligibleCommissions.reduce(
    (count, item) => count + (creditedCommissionIds.has(item.id) ? 0 : 1),
    0
  );
  const errorMessages: Record<string, string> = {
    tx_hash_required: "批准提现前必须先完成链上转账并填写交易哈希。",
    payment_not_confirmed: "该链上转账尚未达到确认要求，请稍后重试。",
    payment_address_mismatch: "交易哈希中的收款地址与用户提现地址不一致。",
    payment_amount_insufficient: "链上实际 USDT 转账金额不足。",
    tx_already_used: "该链上交易哈希已经用于其他订单。",
    invalid_amount: "WLB 金额格式无效。",
    invalid_recipient: "请输入有效的 用户名.welinkBTC。",
    recipient_not_found: "未找到该站内用户。",
    reward_note_required: "活动奖励必须填写原因。",
    withdrawal_already_reviewed: "该提现申请已被其他管理员处理。",
    withdrawal_reserve_missing: "用户 Pending 余额与提现申请不一致，请停止操作并审计账本。"
  };

  return (
    <div className="section-stack admin-assets">
      {query.saved ? <div className="form-message form-message--success">WLB 资产规则已保存。</div> : null}
      {query.reviewed ? <div className="form-message form-message--success">提现申请已处理，用户 Pending 与账本已同步。</div> : null}
      {query.rewarded ? <div className="form-message form-message--success">活动奖励已实时发放到用户可用余额。</div> : null}
      {query.error ? <div className="form-message">{errorMessages[query.error] ?? "资产管理操作失败，请核对链上交易与输入。"}</div> : null}

      <section className="panel">
        <div className="panel-header"><div><p className="eyebrow">WLB TREASURY · APPEND-ONLY LEDGER</p><h2>资产运营全览</h2><p>1 USDT 固定换算 10 WLB；链上哈希全局唯一，内部余额仅由服务端原子事务变更。</p></div><Link className="button button--small button--outline" href="/admin/crypto-payments">配置收款地址</Link></div>
        <div className="panel-body"><div className="stat-grid">
          <div className="stat-card"><span>站内可用资产</span><strong>{formatWlb(available)}</strong><small>WLB · ≈ {formatUsdtFromMilliWlb(available)} USDT</small></div>
          <div className="stat-card"><span>提现 Pending</span><strong>{formatWlb(pending)}</strong><small>WLB · {pendingWithdrawals.length} 笔待审</small></div>
          <div className="stat-card"><span>资产账户</span><strong>{totals._count._all}</strong><small>个用户账本</small></div>
          <div className="stat-card"><span>待同步返佣</span><strong>{unsyncedCommissions}</strong><small>用户访问资产页或返佣审批后自动入账</small></div>
        </div></div>
      </section>

      <section className="panel">
        <div className="panel-header"><div><h2>WLB 风控配置</h2><p>充值只开放 BSC USDT 与 TRON USDT；提现需要管理员完成链上转账后粘贴哈希复核。</p></div></div>
        <div className="panel-body"><form className="admin-form asset-settings-form" action={updateWlbAssetSettingsAction}>
          <div className="asset-setting-toggles">
            <label className="checkbox-line"><input name="depositEnabled" type="checkbox" defaultChecked={settings.depositEnabled} /> 启用充值</label>
            <label className="checkbox-line"><input name="transferEnabled" type="checkbox" defaultChecked={settings.transferEnabled} /> 启用站内划转</label>
            <label className="checkbox-line"><input name="withdrawalEnabled" type="checkbox" defaultChecked={settings.withdrawalEnabled} /> 启用提现</label>
          </div>
          <div className="form-row">
            <div className="field"><label htmlFor="minDepositUsdt">最低充值 USDT</label><input className="input" id="minDepositUsdt" name="minDepositUsdt" type="number" min="0.01" step="0.01" defaultValue={settings.minDepositUsdt} /></div>
            <div className="field"><label htmlFor="minTransferWlb">最低划转 WLB</label><input className="input" id="minTransferWlb" name="minTransferWlb" type="number" min="0.001" step="0.001" defaultValue={settings.minTransferWlb} /></div>
            <div className="field"><label htmlFor="maxDailyTransferWlb">每日划转上限 WLB</label><input className="input" id="maxDailyTransferWlb" name="maxDailyTransferWlb" type="number" min="1" step="1" defaultValue={settings.maxDailyTransferWlb} /></div>
          </div>
          <div className="form-row">
            <div className="field"><label htmlFor="minWithdrawalWlb">最低提现 WLB</label><input className="input" id="minWithdrawalWlb" name="minWithdrawalWlb" type="number" min="0.1" step="0.1" defaultValue={settings.minWithdrawalWlb} /></div>
            <div className="field"><label htmlFor="withdrawalFeeWlb">提现手续费 WLB</label><input className="input" id="withdrawalFeeWlb" name="withdrawalFeeWlb" type="number" min="0" step="0.1" defaultValue={settings.withdrawalFeeWlb} /></div>
            <div className="field"><label>固定汇率</label><input className="input" value="1 USDT = 10 WLB" readOnly /></div>
          </div>
          <button className="button" type="submit">保存资产规则</button>
        </form></div>
      </section>

      <section className="panel">
        <div className="panel-header"><div><h2>提现审核 · {pendingWithdrawals.length}</h2><p>先向用户地址发送指定网络 USDT，再将交易哈希粘贴到此处；系统会校验网络、地址、金额和确认状态后结算 Pending。</p></div></div>
        <div className="table-wrap"><table className="data-table asset-admin-table"><thead><tr><th>用户</th><th>提现</th><th>收款地址</th><th>申请时间</th><th>链上审批</th></tr></thead><tbody>
          {pendingWithdrawals.length ? pendingWithdrawals.map((item) => <tr key={item.id}>
            <td><strong>{item.owner.profile?.handle ? `${item.owner.profile.handle}.welinkBTC` : item.owner.email}</strong><br /><span>{item.owner.email}</span></td>
            <td><strong>{formatWlb(item.amountMilliWlb)} WLB</strong><br /><span>实付 {((item.usdtAmountCents ?? 0) / 100).toFixed(2)} USDT · {item.paymentMethod ? paymentMethodLabel(item.paymentMethod) : item.network}</span></td>
            <td>{item.payoutAddress ? (
              <div className="admin-address-cell">
                <code>{item.payoutAddress}</code>
                <CopyButton value={item.payoutAddress} label="复制地址" />
              </div>
            ) : "—"}</td>
            <td>{item.createdAt.toLocaleString("zh-CN")}</td>
            <td><form className="admin-payment-review" action={reviewWlbWithdrawalAction.bind(null, item.id, "approve")}>
              <input className="input" name="txHash" placeholder="管理员转账后的链上哈希" required />
              <input className="input" name="note" placeholder="审核备注（可选）" />
              <button className="button button--small" type="submit">核验哈希并批准</button>
              <button className="button button--small button--outline" formAction={reviewWlbWithdrawalAction.bind(null, item.id, "reject")} formNoValidate type="submit">拒绝并释放 Pending</button>
            </form></td>
          </tr>) : <tr><td colSpan={5}>当前没有待审核提现。</td></tr>}
        </tbody></table></div>
      </section>

      <section className="panel">
        <div className="panel-header"><div><h2>活动奖励发放</h2><p>向已设置用户名的用户发放 WLB；该操作即时入账并写入审计日志。</p></div></div>
        <div className="panel-body"><form className="admin-form reward-form" action={grantWlbRewardAction}>
          <div className="field"><label htmlFor="rewardRecipient">收款用户</label><input className="input" id="rewardRecipient" name="recipient" placeholder="alice.welinkBTC" required /></div>
          <div className="field"><label htmlFor="rewardAmount">奖励 WLB</label><input className="input" id="rewardAmount" name="amountWlb" type="number" min="0.001" step="0.001" required /></div>
          <div className="field"><label htmlFor="rewardNote">活动 / 奖励原因</label><input className="input" id="rewardNote" name="note" maxLength={1000} required /></div>
          <button className="button" type="submit">确认发放</button>
        </form></div>
      </section>

      <section className="panel">
        <div className="panel-header"><div><h2>用户资产账户</h2><p>按可用余额排序，账户总额等于可用余额与 Pending 提现之和。</p></div></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>用户</th><th>可用</th><th>Pending</th><th>累计入账</th><th>累计支出</th><th>操作</th></tr></thead><tbody>
          {accounts.map((item) => <tr key={item.id}><td><strong>{item.user.profile?.handle ? `${item.user.profile.handle}.welinkBTC` : item.user.email}</strong><br /><span>{item.user.email}</span></td><td>{formatWlb(item.availableMilliWlb)} WLB</td><td>{formatWlb(item.pendingWithdrawalMilliWlb)} WLB</td><td>{formatWlb(item.totalCreditedMilliWlb)} WLB</td><td>{formatWlb(item.totalDebitedMilliWlb)} WLB</td><td><Link href={`/admin/users/${item.userId}`}>查看个人中心 →</Link></td></tr>)}
        </tbody></table></div>
      </section>

      <section className="panel">
        <div className="panel-header"><div><h2>最近资产流水</h2><p>充值、提现、划转、返佣与活动奖励统一归档。</p></div></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>时间</th><th>用户</th><th>分类</th><th>金额</th><th>状态</th><th>网络 / 对方</th><th>凭证</th></tr></thead><tbody>
          {recentTransactions.map((item) => <tr key={item.id}><td>{item.createdAt.toLocaleString("zh-CN")}</td><td>{item.owner.profile?.handle ?? item.owner.email}</td><td>{typeLabels[item.type] ?? item.type}</td><td>{formatWlb(item.amountMilliWlb)} WLB</td><td>{statusLabels[item.status] ?? item.status}</td><td>{item.counterparty?.profile?.handle ? `${item.counterparty.profile.handle}.welinkBTC` : item.network ?? "welinkBTC"}</td><td>{item.txHash ? <code>{item.txHash.slice(0, 12)}…</code> : item.externalReference ?? "—"}</td></tr>)}
        </tbody></table></div>
      </section>
    </div>
  );
}
