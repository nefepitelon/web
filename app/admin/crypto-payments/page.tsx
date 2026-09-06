import Image from "next/image";
import { reviewManualPaymentAction, updateCryptoPaymentSettingsAction } from "@/app/actions/admin-crypto";
import { getCryptoPaymentSettings, paymentMethodLabel, USDT_BSC_CONTRACT, USDT_TRC20_CONTRACT } from "@/lib/crypto-payments";
import { requireAdmin } from "@/lib/membership";
import { prisma } from "@/lib/prisma";

export default async function AdminCryptoPaymentsPage({ searchParams }: { searchParams: Promise<{ saved?: string; reviewed?: string; error?: string }> }) {
  await requireAdmin("/admin/crypto-payments");
  const [settings, payments, query] = await Promise.all([
    getCryptoPaymentSettings(),
    prisma.cryptoPayment.findMany({ include: { user: { include: { profile: true } } }, orderBy: [{ status: "desc" }, { createdAt: "desc" }], take: 150 }),
    searchParams
  ]);
  const reviewOrders = payments.filter((payment) => payment.status === "REVIEW");
  const errorMessages: Record<string, string> = {
    invalid_tron_address: "TRON 地址格式或校验码无效。",
    invalid_bsc_address: "BSC 收款地址格式无效。",
    invalid_qr: "收款码仅支持 JPG、PNG、WebP，且不能超过 5MB。"
  };

  return (
    <div className="section-stack">
      {query.saved ? <div className="form-message form-message--success">四种收款方式的配置已保存。</div> : null}
      {query.reviewed ? <div className="form-message form-message--success">付款审核已完成，订阅权益与返佣已同步。</div> : null}
      {query.error ? <div className="form-message">{errorMessages[query.error] ?? "配置保存失败，请检查输入。"}</div> : null}

      <section className="panel">
        <div className="panel-header"><div><h2>订阅收款通道</h2><p>BSC / TRON 自动查链确认；币安 UID 与微信个人收款提交凭证后进入 4 小时人工审核队列。</p></div></div>
        <div className="panel-body">
          <form action={updateCryptoPaymentSettingsAction}>
            <div className="form-row">
              <div className="field"><label htmlFor="invoiceExpiryMinutes">订单有效分钟</label><input className="input" id="invoiceExpiryMinutes" name="invoiceExpiryMinutes" type="number" min="15" max="1440" defaultValue={settings.invoiceExpiryMinutes} /></div>
              <div className="field"><label htmlFor="reviewSlaHours">人工审核 SLA（小时）</label><input className="input" id="reviewSlaHours" name="reviewSlaHours" type="number" min="1" max="48" defaultValue={settings.reviewSlaHours} /></div>
              <div className="field"><label htmlFor="cnyPerUsd">微信换算汇率 CNY / USD</label><input className="input" id="cnyPerUsd" name="cnyPerUsd" type="number" min="1" max="20" step="0.01" defaultValue={settings.cnyPerUsd} /></div>
            </div>

            <div className="payment-config-grid">
              <article className="payment-config-card">
                <div><span className="eyebrow">AUTO · DEFAULT</span><h3>BSC USDT</h3><p>BNB Smart Chain 主网官方 USDT，满足确认数后自动开通。</p></div>
                <label className="checkbox-line"><input type="checkbox" name="bscEnabled" defaultChecked={settings.bsc.enabled} /> 启用 BSC USDT</label>
                <div className="field"><label htmlFor="bscAddress">BSC 收款地址</label><input className="input" id="bscAddress" name="bscAddress" defaultValue={settings.bsc.receiveAddress} placeholder="0x…" /></div>
                <div className="field"><label htmlFor="bscConfirmations">确认数</label><input className="input" id="bscConfirmations" name="bscConfirmations" type="number" min="1" max="200" defaultValue={settings.bsc.confirmations} /></div>
                <code>{USDT_BSC_CONTRACT}</code>
              </article>

              <article className="payment-config-card">
                <div><span className="eyebrow">AUTO</span><h3>TRON USDT</h3><p>TRC20 已确认 Transfer 自动核验，不托管私钥。</p></div>
                <label className="checkbox-line"><input type="checkbox" name="trc20Enabled" defaultChecked={settings.trc20.enabled} /> 启用 TRON USDT</label>
                <div className="field"><label htmlFor="trc20Address">TRON 收款地址</label><input className="input" id="trc20Address" name="trc20Address" defaultValue={settings.trc20.receiveAddress} placeholder="T…" /></div>
                <code>{USDT_TRC20_CONTRACT}</code>
              </article>

              <article className="payment-config-card">
                <div><span className="eyebrow">MANUAL · 4H</span><h3>币安 UID</h3><p>个人 UID 转账没有可信公开回调，用户提交付款编号或截图后审核。</p></div>
                <label className="checkbox-line"><input type="checkbox" name="binanceEnabled" defaultChecked={settings.binanceUid.enabled} /> 启用币安 UID</label>
                <div className="field"><label htmlFor="binanceUid">收款 UID</label><input className="input" id="binanceUid" name="binanceUid" defaultValue={settings.binanceUid.recipient} /></div>
                <div className="field"><label htmlFor="binanceName">收款账户名称</label><input className="input" id="binanceName" name="binanceName" defaultValue={settings.binanceUid.recipientName} /></div>
                <div className="field"><label htmlFor="binanceQr">收款码（可选）</label><input className="input" id="binanceQr" name="binanceQr" type="file" accept="image/jpeg,image/png,image/webp" /></div>
                {settings.binanceUid.qrCodeUrl ? <Image src={settings.binanceUid.qrCodeUrl} width={160} height={160} alt="币安 UID 收款码" /> : null}
                <div className="field"><label htmlFor="binanceInstructions">付款说明</label><textarea className="input" id="binanceInstructions" name="binanceInstructions" defaultValue={settings.binanceUid.instructions} /></div>
              </article>

              <article className="payment-config-card">
                <div><span className="eyebrow">MANUAL · 4H</span><h3>微信收款</h3><p>个人收款码没有商户回调，按订单人民币金额提交截图后审核。</p></div>
                <label className="checkbox-line"><input type="checkbox" name="wechatEnabled" defaultChecked={settings.wechat.enabled} /> 启用微信收款</label>
                <div className="field"><label htmlFor="wechatRecipient">收款微信号 / 备注</label><input className="input" id="wechatRecipient" name="wechatRecipient" defaultValue={settings.wechat.recipient} /></div>
                <div className="field"><label htmlFor="wechatName">收款人名称</label><input className="input" id="wechatName" name="wechatName" defaultValue={settings.wechat.recipientName} /></div>
                <div className="field"><label htmlFor="wechatQr">微信收款码</label><input className="input" id="wechatQr" name="wechatQr" type="file" accept="image/jpeg,image/png,image/webp" /></div>
                {settings.wechat.qrCodeUrl ? <Image src={settings.wechat.qrCodeUrl} width={160} height={160} alt="微信收款码" /> : null}
                <div className="field"><label htmlFor="wechatInstructions">付款说明</label><textarea className="input" id="wechatInstructions" name="wechatInstructions" defaultValue={settings.wechat.instructions} /></div>
              </article>
            </div>
            <button className="button" type="submit">保存全部收款设置</button>
          </form>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header"><div><h2>待审核付款 · {reviewOrders.length}</h2><p>请核对收款账户、金额、付款编号与截图；超过审核时限的订单会标为逾期提醒，但不会自动开通。</p></div></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>用户 / 方式</th><th>应付</th><th>凭证</th><th>审核截止</th><th>处理</th></tr></thead><tbody>
          {reviewOrders.length ? reviewOrders.map((payment) => {
            const overdue = Boolean(payment.reviewDueAt && payment.reviewDueAt.getTime() < Date.now());
            return <tr key={payment.id}><td><strong>{payment.user.profile?.handle ?? payment.user.email}</strong><br /><span>{paymentMethodLabel(payment.paymentMethod)}</span></td><td>{payment.paymentAmount?.toString()} {payment.paymentCurrency}<br /><span>{payment.planKey} / {payment.billingInterval}</span></td><td>{payment.paymentReference || "未填编号"}{payment.proofUrl ? <><br /><a href={payment.proofUrl} target="_blank" rel="noreferrer">查看付款截图 ↗</a></> : null}</td><td><span className={overdue ? "status-pill status-pill--warn" : "status-pill"}>{overdue ? "已超过 4h" : payment.reviewDueAt?.toLocaleString("zh-CN")}</span></td><td><form className="admin-payment-review" action={reviewManualPaymentAction.bind(null, payment.id, "approve")}><input className="input" name="note" placeholder="审核备注" /><button className="button button--small" type="submit">确认到账并开通</button><button className="button button--small button--outline" formAction={reviewManualPaymentAction.bind(null, payment.id, "reject")} type="submit">拒绝</button></form></td></tr>;
          }) : <tr><td colSpan={5}>当前没有待审核付款。</td></tr>}
        </tbody></table></div>
      </section>

      <section className="panel"><div className="panel-header"><div><h2>最近订阅付款</h2><p>相同链上交易哈希只能入账一次，所有人工审核均记录管理员审计日志。</p></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>用户</th><th>方式</th><th>方案</th><th>金额</th><th>状态</th><th>创建时间</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id}><td>{payment.user.profile?.handle ?? payment.user.email}</td><td>{paymentMethodLabel(payment.paymentMethod)}</td><td>{payment.planKey} / {payment.billingInterval}</td><td>{payment.paymentAmount?.toString() ?? (payment.amountCents/100).toFixed(2)} {payment.paymentCurrency}</td><td>{payment.status}</td><td>{payment.createdAt.toLocaleString("zh-CN")}</td></tr>)}</tbody></table></div></section>
    </div>
  );
}
