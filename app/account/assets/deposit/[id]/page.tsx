import Link from "next/link";
import Image from "next/image";
import QRCode from "qrcode";
import { verifyWlbDepositAction } from "@/app/actions/wlb-assets";
import { CopyButton } from "@/components/copy-button";
import { paymentMethodLabel, USDT_BSC_CONTRACT, USDT_TRC20_CONTRACT } from "@/lib/crypto-payments";
import { requireViewer } from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { formatWlb } from "@/lib/wlb-assets";

export const dynamic = "force-dynamic";

export default async function WlbDepositPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; paid?: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer(`/account/assets/deposit/${id}`);
  const [deposit, query] = await Promise.all([
    prisma.wlbTransaction.findFirst({ where: { id, ownerUserId: viewer.id, type: "DEPOSIT" } }),
    searchParams
  ]);
  if (!deposit || !deposit.receiveAddress || !deposit.paymentMethod || !deposit.usdtAmountCents) return <section className="panel"><div className="panel-body"><h2>充值订单不存在</h2><Link className="button" href="/account/assets">返回资产管理</Link></div></section>;
  const qr = await QRCode.toDataURL(deposit.receiveAddress, { width: 360, margin: 2, color: { dark: "#07140c", light: "#f2fff5" } });
  const paid = deposit.status === "COMPLETED" || query.paid === "1";
  const errors: Record<string, string> = {
    invalid_tx: "请输入正确格式的链上交易哈希。",
    payment_not_confirmed: "交易尚未确认或确认数不足，请稍后重试。",
    payment_address_mismatch: "该交易的收款地址与充值订单不一致。",
    payment_amount_insufficient: "该交易的 USDT 到账金额不足。",
    tx_already_used: "该交易哈希已经用于其他充值或订阅订单。",
    invoice_expired: "充值订单已过期，请重新创建。",
    trongrid_rate_limit: "TRON 查询繁忙，请稍后重试。",
    trongrid_unavailable: "TRON 链上查询暂不可用。",
    bsc_rpc_unavailable: "BSC 链上节点暂不可用。",
    bsc_wrong_network: "BSC 节点网络校验失败。"
  };
  return (
    <div className="section-stack">
      {paid ? <div className="form-message form-message--success">充值已确认，{formatWlb(deposit.amountMilliWlb)} WLB 已进入可用余额。</div> : null}
      {query.error ? <div className="form-message">{errors[query.error] ?? "链上充值核验失败，请稍后重试。"}</div> : null}
      <section className="panel crypto-invoice">
        <div className="panel-header"><div><p className="eyebrow">WLB DEPOSIT · ON-CHAIN VERIFY</p><h2>{paymentMethodLabel(deposit.paymentMethod)}</h2><p>固定汇率 1 USDT = 10 WLB</p></div><span className={`status-pill ${paid ? "" : "status-pill--warn"}`}>{deposit.status}</span></div>
        <div className="panel-body crypto-invoice-grid">
          <div className="crypto-qr"><Image src={qr} alt="充值收款地址二维码" width={260} height={260} unoptimized /></div>
          <div className="crypto-payment-details">
            <div><span>应付金额</span><strong>{(deposit.usdtAmountCents / 100).toFixed(2)} USDT</strong></div>
            <div><span>预计入账</span><strong>{formatWlb(deposit.amountMilliWlb)} WLB</strong></div>
            <div><span>管理员收款地址</span><code>{deposit.receiveAddress}</code><CopyButton value={deposit.receiveAddress} /></div>
            <div><span>官方 USDT 合约</span><code>{deposit.paymentMethod === "BSC_USDT" ? USDT_BSC_CONTRACT : USDT_TRC20_CONTRACT}</code></div>
            <p>只可使用订单指定网络与官方 USDT 合约。不要从其他网络转账，到账金额不得少于订单金额。</p>
          </div>
        </div>
        {!paid ? <div className="panel-body crypto-verify"><form action={verifyWlbDepositAction.bind(null, deposit.id)}><div className="field"><label htmlFor="txHash">付款后的交易哈希</label><input className="input" id="txHash" name="txHash" defaultValue={deposit.txHash ?? ""} placeholder={deposit.paymentMethod === "BSC_USDT" ? "0x…" : "64 位 TRON TXID"} required /></div><button className="button" type="submit">核验并入账 WLB</button></form></div> : null}
        <div className="panel-body"><Link className="button button--outline" href="/account/assets">返回资产管理</Link></div>
      </section>
    </div>
  );
}
