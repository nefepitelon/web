import Image from "next/image";
import Link from "next/link";
import QRCode from "qrcode";
import { submitManualPaymentAction, verifyCryptoInvoiceAction } from "@/app/actions/crypto-billing";
import { CopyButton } from "@/components/copy-button";
import { paymentMethodLabel, USDT_BSC_CONTRACT, USDT_TRC20_CONTRACT } from "@/lib/crypto-payments";
import { requireViewer } from "@/lib/membership";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function metadataRecord(value: unknown) {
  return value && !Array.isArray(value) && typeof value === "object" ? value as Record<string, unknown> : {};
}

export default async function CryptoInvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; paid?: string; review?: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer(`/account/subscription/crypto/${id}`);
  const invoice = await prisma.cryptoPayment.findFirst({ where: { id, userId: viewer.id } });
  if (!invoice) return <section className="panel"><div className="panel-body"><h2>订单不存在</h2><Link className="button" href="/account/subscription">返回订阅</Link></div></section>;
  const query = await searchParams;
  const manual = ["BINANCE_UID", "WECHAT"].includes(invoice.paymentMethod);
  const metadata = metadataRecord(invoice.metadata);
  const configuredQr = typeof metadata.qrCodeUrl === "string" ? metadata.qrCodeUrl : "";
  const generatedQr = !manual ? await QRCode.toDataURL(invoice.receiveAddress, { width: 360, margin: 2, color: { dark: "#07140c", light: "#f2fff5" } }) : "";
  const qr = configuredQr || generatedQr;
  const errors: Record<string, string> = {
    invalid_tx: "请输入正确格式的交易哈希。",
    payment_not_confirmed: "尚未达到所需区块确认数，请稍后再次核验。",
    payment_address_mismatch: "该交易的收款地址与订单不一致。",
    payment_amount_insufficient: "该交易的到账金额不足。",
    tx_already_used: "该交易哈希已用于其他订单。",
    invoice_expired: "订单已过期，请重新创建。",
    payment_proof_required: "请填写付款编号或上传付款截图。",
    proof_too_large: "付款截图不能超过 5MB。",
    invalid_proof: "付款截图仅支持 JPG、PNG 或 WebP。",
    trongrid_rate_limit: "TRON 链上查询繁忙，请稍后重试。",
    trongrid_unavailable: "TRON 链上查询暂时不可用。",
    bsc_rpc_unavailable: "BSC 链上节点暂时不可用，请稍后重试。",
    bsc_wrong_network: "链上节点网络校验失败，请联系管理员。"
  };
  const paid = invoice.status === "PAID" || query.paid === "1";
  const reviewing = invoice.status === "REVIEW" || query.review === "1";
  const amount = invoice.paymentAmount?.toString() ?? (invoice.amountCents / 100).toFixed(2);

  return (
    <div className="section-stack">
      {paid ? <div className="form-message form-message--success">付款已确认，{invoice.planKey.toUpperCase()} 权益和邀请返佣已同步生效。</div> : null}
      {reviewing && !paid ? <div className="form-message form-message--success">付款凭证已提交。管理员将在 {invoice.reviewDueAt?.toLocaleString("zh-CN") ?? "4 小时内"}完成审核，到账后自动开通权益。</div> : null}
      {query.error ? <div className="form-message">{errors[query.error] ?? "付款处理失败，请检查订单信息后重试。"}</div> : null}
      <section className="panel crypto-invoice">
        <div className="panel-header"><div><p className="eyebrow">{manual ? "MANUAL REVIEW · 4H" : "ON-CHAIN AUTO VERIFY"}</p><h2>{paymentMethodLabel(invoice.paymentMethod)}</h2><p>{invoice.planKey.toUpperCase()} · {invoice.billingInterval === "year" ? "年付（只收 10 个月）" : "月付"}</p></div><span className={`status-pill ${paid ? "" : "status-pill--warn"}`}>{invoice.status}</span></div>
        <div className="panel-body crypto-invoice-grid">
          <div className="crypto-qr">
            {qr ? <Image src={qr} alt={`${paymentMethodLabel(invoice.paymentMethod)} 收款二维码`} width={260} height={260} unoptimized /> : <div className="payment-qr-placeholder">请按右侧收款信息完成付款</div>}
          </div>
          <div className="crypto-payment-details">
            <div><span>应付金额</span><strong>{amount} {invoice.paymentCurrency}</strong></div>
            <div><span>支付方式</span><strong>{paymentMethodLabel(invoice.paymentMethod)}</strong></div>
            <div><span>{manual ? "收款账号" : "收款地址"}</span><code>{invoice.receiveAddress}</code><CopyButton value={invoice.receiveAddress} /></div>
            {invoice.paymentMethod === "TRON_USDT" ? <div><span>官方 USDT 合约</span><code>{USDT_TRC20_CONTRACT}</code></div> : null}
            {invoice.paymentMethod === "BSC_USDT" ? <div><span>官方 USDT 合约</span><code>{USDT_BSC_CONTRACT}</code></div> : null}
            {typeof metadata.recipientName === "string" && metadata.recipientName ? <div><span>收款人</span><strong>{metadata.recipientName}</strong></div> : null}
            <p>{typeof metadata.instructions === "string" && metadata.instructions ? metadata.instructions : manual ? "付款后请提交订单编号或截图，管理员核对实际到账后开通。" : "请严格使用订单指定网络和 USDT 合约，到账金额不得少于订单金额。"}</p>
          </div>
        </div>
        {!paid && !manual ? <div className="panel-body crypto-verify"><form action={verifyCryptoInvoiceAction.bind(null, invoice.id)}><div className="field"><label htmlFor="txHash">付款后的交易哈希</label><input className="input" id="txHash" name="txHash" defaultValue={invoice.txHash ?? ""} placeholder={invoice.paymentMethod === "BSC_USDT" ? "0x…" : "64 位 TRON TXID"} required /></div><button className="button" type="submit">核验链上付款</button></form></div> : null}
        {!paid && manual && !reviewing ? <div className="panel-body crypto-verify"><form action={submitManualPaymentAction.bind(null, invoice.id)}><div className="field"><label htmlFor="paymentReference">付款编号 / 转账备注</label><input className="input" id="paymentReference" name="paymentReference" placeholder="填写币安订单号、微信转账单号或付款备注" /></div><div className="field"><label htmlFor="proof">付款截图（JPG / PNG / WebP，最多 5MB）</label><input className="input" id="proof" name="proof" type="file" accept="image/jpeg,image/png,image/webp" /></div><button className="button" type="submit">提交付款凭证审核</button></form></div> : null}
      </section>
    </div>
  );
}
