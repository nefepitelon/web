"use client";

import { BookOpen, ExternalLink, Info, ShieldCheck, X } from "lucide-react";
import { useEffect } from "react";

const REGISTER_LINKS = [
  ["Extended", "https://app.extended.exchange/join/WELINKBTC", "WELINKBTC"],
  ["RISEx", "https://rise.trade/", "暂无推荐码"],
  ["Decibel", "https://app.decibel.trade/r/C5WV3H", "C5WV3H"],
  ["N1", "https://app.n1.xyz/r/orderly-loop-curve", "orderly-loop-curve"],
  ["Phoenix / Phoenix2", "https://phoenix.trade/?code=GN4RELUC", "GN4RELUC"],
  ["Nado", "https://app.nado.xyz?join=0qvxvdx", "0qvxvdx"],
  ["PopDEX", "https://app.popdex.xyz/referral?referralCode=WELINKBTC", "WELINKBTC"],
] as const;

const FEATURES = [
  ["统一适配器", "多所统一 VenueExecutor：snapshot / apply / 可选 cancelAll · closePosition"],
  ["经典网格核心", "seed 铺单 + 成交补相邻反向档 + skipBand（近价跳过带宽）"],
  ["本地看板", "总览 KPI、今日明细、各所状态、挂单档位横轴、日历盈亏"],
  ["官方统计", "官方成交量 / 手续费 / 平仓盈亏，采用节流拉取避免内存爆增"],
  ["Telegram", "开/平简报、整点总览、异常去重；完全可选"],
  ["SOFT_RESUME", "重启恢复锚点，只补漏档，避免误整表撤单"],
  ["运行控制", "紧急暂停 / 出入金记账（看板按钮 + API）"],
] as const;

const FAQ = [
  ["成交后网格断档", "买 → 上邻卖 / 卖 → 下邻买，每个 level 保持一单"],
  ["重启冲掉挂单", "SOFT_RESUME + 本地锚点，只补漏，不整表重铺"],
  ["官方统计 OOM", "节流拉取 + 加大 Node 堆，避免统计数据撑爆内存"],
  ["各所盈亏口径不一", "Extended 用已平仓 history；RISEx / Decibel 使用 fill realized 等官方口径"],
  ["仓位名义差很多", "各所净仓路径不同，先对满格名义，再核对净格数"],
  ["限流 / 挂单上限", "maxOpenOrders、写频、请求间隔与错误去重共同控制"],
  ["Decibel tick / lot", "签名和编码前先按交易所精度对齐"],
  ["链上 CLOB（PopDEX）", "viem 签名 + gasless 中继广播"],
  ["坏 JSON 回包", "归类为瞬时软错误，不发送 Telegram 成交通知，下轮重试"],
] as const;

const DEFAULTS = [
  ["Extended", "80", "30x", "±4.6%", <>Starknet，预算 800U × 70%</>],
  ["RISEx", "46", "25x", "±3%", <>单笔偏大，注意降低风险</>],
  ["Decibel", "80", "30x", "±5%", <>Aptos，<code>DECIBEL_EQUITY_USD</code></>],
  ["N1", "80", "30x", "±5%", <>Solana，<code>N1_EQUITY_USD</code>，PostOnly</>],
  ["Phoenix", "80", "30x", "±4.5%", <>Solana，<code>PHOENIX_HALF_BAND</code></>],
  ["Phoenix2", "80", "30x", "±4.5%", <>同 Phoenix，使用独立 keypair</>],
  ["Nado", "80", "30x", "±4.5%", <>Ink 链，<code>NADO_HALF_BAND</code></>],
  ["PopDEX", "80", "30x", "±4.5%", <>Morph Tachyon，<code>POPDEX_EQUITY_USD</code></>],
] as const;

function SectionTitle({ number, title, id }: { number: string; title: string; id: string }) {
  return (
    <div className="classic-grid-guide-section-title" id={id}>
      <span>{number}</span>
      <h3>{title}</h3>
    </div>
  );
}

export function ClassicGridGuideDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="classic-grid-modal" role="dialog" aria-modal="true" aria-labelledby="classic-grid-guide-title">
      <article className="classic-grid-config-card classic-grid-guide-card">
        <header className="classic-grid-config-head classic-grid-guide-head">
          <div>
            <span>CONFIGURATION GUIDE</span>
            <h2 id="classic-grid-guide-title">AIClassic 配置说明</h2>
            <p>等差网格机制、交易所入口、完整功能、常见问题与默认参数。所有交易所链接均会在新窗口打开。</p>
          </div>
          <button type="button" aria-label="关闭配置说明" onClick={onClose} autoFocus><X size={20} /></button>
        </header>

        <nav className="classic-grid-guide-nav" aria-label="配置说明目录">
          <a href="#classic-grid-guide-overview">网格解释</a>
          <a href="#classic-grid-guide-register">注册链接</a>
          <a href="#classic-grid-guide-features">功能一览</a>
          <a href="#classic-grid-guide-faq">常见问题</a>
          <a href="#classic-grid-guide-defaults">默认参数</a>
        </nav>

        <div className="classic-grid-guide-body">
          <section>
            <SectionTitle number="01" title="等差网格解释" id="classic-grid-guide-overview" />
            <div className="classic-grid-guide-table-wrap">
              <table className="classic-grid-guide-table">
                <tbody>
                  <tr><th scope="row">运行机制</th><td>现价下方买入、上方卖出；成交后在相邻档补反向订单。</td></tr>
                  <tr><th scope="row">启动校验</th><td>格距必须大于双边手续费，并在启动前完成保证金预算预检。</td></tr>
                  <tr><th scope="row">适配器</th><td>Extended · RISEx · Decibel · N1 · Phoenix · Phoenix2 · Nado · PopDEX</td></tr>
                  <tr><th scope="row">开源边界</th><td>模板不包含私钥、API Key、Telegram Token、服务器地址或账本文件。</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <SectionTitle number="02" title="交易所注册链接" id="classic-grid-guide-register" />
            <div className="classic-grid-guide-advice"><Info size={14} />注册链接为可选入口，不构成投资建议；请自行核验所在地区的可用性与风险。</div>
            <div className="classic-grid-guide-table-wrap">
              <table className="classic-grid-guide-table classic-grid-guide-links">
                <thead><tr><th>交易所</th><th>注册链接</th><th>推荐码</th></tr></thead>
                <tbody>
                  {REGISTER_LINKS.map(([venue, href, code]) => (
                    <tr key={venue}>
                      <th scope="row">{venue}</th>
                      <td><a href={href} target="_blank" rel="noopener noreferrer">打开注册页面 <ExternalLink size={13} /></a></td>
                      <td><code>{code}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <SectionTitle number="03" title="功能一览" id="classic-grid-guide-features" />
            <div className="classic-grid-guide-table-wrap">
              <table className="classic-grid-guide-table">
                <thead><tr><th>模块</th><th>能力</th></tr></thead>
                <tbody>{FEATURES.map(([name, detail]) => <tr key={name}><th scope="row">{name}</th><td>{detail}</td></tr>)}</tbody>
              </table>
            </div>
          </section>

          <section>
            <SectionTitle number="04" title="常见问题 FAQ" id="classic-grid-guide-faq" />
            <div className="classic-grid-guide-table-wrap">
              <table className="classic-grid-guide-table">
                <thead><tr><th>常见问题</th><th>处理方式</th></tr></thead>
                <tbody>{FAQ.map(([question, answer]) => <tr key={question}><th scope="row">{question}</th><td>{answer}</td></tr>)}</tbody>
              </table>
            </div>
          </section>

          <section>
            <SectionTitle number="05" title="默认参数（可改）" id="classic-grid-guide-defaults" />
            <div className="classic-grid-guide-table-wrap">
              <table className="classic-grid-guide-table classic-grid-guide-defaults">
                <thead><tr><th>交易所</th><th>格数</th><th>杠杆</th><th>半幅</th><th>备注</th></tr></thead>
                <tbody>{DEFAULTS.map(([venue, count, leverage, band, note]) => <tr key={venue}><th scope="row">{venue}</th><td>{count}</td><td>{leverage}</td><td>{band}</td><td>{note}</td></tr>)}</tbody>
              </table>
            </div>
            <div className="classic-grid-guide-note">
              <ShieldCheck size={15} />
              <span><code>GRID_MARGIN_FRAC</code> 默认 <code>0.7</code>（保证金占预算 70%）。格数、杠杆、半幅和权益均可在“环境配置”覆盖；实盘还会按实时资金、数量步进与最小订单规则安全缩减档数。</span>
            </div>
          </section>
        </div>

        <footer className="classic-grid-guide-footer">
          <span><BookOpen size={14} />修改参数前请先使用模拟盘验证。</span>
          <button type="button" onClick={onClose}>我已了解</button>
        </footer>
      </article>
    </div>
  );
}
