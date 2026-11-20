"use client";

import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpRight, BarChart3, Check, CircleAlert, Clock3, Database, RefreshCw, Search } from "lucide-react";
import type { CexExchange as Exchange, CexHubSnapshot as Snapshot, CexStatus } from "@/lib/cex-hub-types";
import { cexHubIcon } from "@/lib/cex-hub-icons";
import { cexHubIconLayout } from "@/lib/cex-hub-icon-layouts";
import "@/app/hedge-ops/perpdex-box.css";
import "@/app/hedge-ops/cex-hub.css";

type Metric = "spotVolume24hUsd" | "derivativesVolume24hUsd" | "openInterestUsd";
type SortKey = Metric | "name" | "trustScore" | "trustRank" | "spotMarkets" | "derivativesMarkets" | "coins" | "country" | "yearEstablished";
const metricLabels: Record<Metric, string> = { spotVolume24hUsd: "现货 24h 成交", derivativesVolume24hUsd: "合约 24h 成交", openInterestUsd: "合约持仓 OI" };
const numericFields = ["spotVolume24hUsd", "derivativesVolume24hUsd", "openInterestUsd", "spotMarkets", "derivativesMarkets", "coins", "trustScore", "trustRank", "yearEstablished"] as const;
const statusLabels: Record<CexStatus, string> = { live: "公开数据", stale: "最近数据", unavailable: "暂不可用" };
const palette = ["#b8e879", "#68c9c4", "#d6ba75", "#9b9ee3", "#6ba6dc", "#c688ad", "#8bc4a2", "#bd9f7b", "#8098b7", "#d99d81"];
const emptyExchanges: Exchange[] = [];
const emptySources: Snapshot["sources"] = [];
const maxRetainedMarketAgeMs = 60 * 60 * 1000;

function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function safeUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try { const url = new URL(value); return url.protocol === "https:" ? url.href : undefined; } catch { return undefined; }
}
function money(value: number | null): string {
  if (!finite(value)) return "—";
  const unit = value >= 1e12 ? [1e12, "T"] as const : value >= 1e9 ? [1e9, "B"] as const : value >= 1e6 ? [1e6, "M"] as const : value >= 1e3 ? [1e3, "K"] as const : [1, ""] as const;
  return `$${(value / unit[0]).toLocaleString("en-US", { maximumFractionDigits: value >= 1e3 ? 2 : 0 })}${unit[1]}`;
}
function precise(value: number | null) { return finite(value) ? `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "暂无公开数据"; }
function number(value: number | null) { return finite(value) ? value.toLocaleString("en-US", { maximumFractionDigits: 1 }) : "—"; }
function time(value: string | null, withDate = false) {
  if (!value || !Number.isFinite(Date.parse(value))) return "时间未提供";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", ...(withDate ? { month: "2-digit", day: "2-digit" } : {}), hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}
function aggregate(rows: Exchange[], metric: Metric) {
  const values = rows.map(row => row[metric]).filter(finite);
  const sum = values.reduce((total, value) => total + value, 0);
  return values.length && finite(sum) ? sum : null;
}
function color(row: Exchange) {
  const hash = Array.from(row.id).reduce((sum, letter) => sum + letter.charCodeAt(0), 0);
  if (!row.color || !/^#[0-9a-f]{6}$/i.test(row.color)) return palette[hash % palette.length];
  const rgb = [1, 3, 5].map(start => parseInt(row.color!.slice(start, start + 2), 16));
  return rgb[0] * .299 + rgb[1] * .587 + rgb[2] * .114 < 85 ? `#${rgb.map(value => Math.round(value * .55 + 255 * .45).toString(16).padStart(2, "0")).join("")}` : row.color;
}
function ratio(row: Exchange) {
  const result = finite(row.openInterestUsd) && row.openInterestUsd > 0 && finite(row.derivativesVolume24hUsd) ? row.derivativesVolume24hUsd / row.openInterestUsd : null;
  return finite(result) ? result : null;
}
function readSnapshot(value: unknown): Snapshot {
  if (!value || typeof value !== "object") throw new Error("公开数据返回格式异常，请稍后重试。");
  const result = value as Snapshot;
  if (result.version !== 1 || !Number.isFinite(Date.parse(result.generatedAt)) || !Array.isArray(result.exchanges) || !Array.isArray(result.sources) || !Array.isArray(result.warnings) || !result.warnings.every(warning => typeof warning === "string")) throw new Error("公开数据不完整，请稍后重试。");
  const ids = new Set<string>();
  for (const row of result.exchanges) {
    if (typeof row?.hasSpot !== "boolean" || typeof row?.hasDerivatives !== "boolean") throw new Error("交易所产品信息异常，请稍后重试。");
    if (!row || typeof row.id !== "string" || ids.has(row.id) || typeof row.name !== "string" || row.centralized !== true || typeof row.url !== "string" || typeof row.sourceUrl !== "string" || !["live", "stale", "unavailable"].includes(row.status) || numericFields.some(key => row[key] !== null && (!finite(row[key]) || row[key]! < 0)) || (row.trustScore !== null && row.trustScore > 10) || (row.country !== null && typeof row.country !== "string") || (row.logoUrl !== null && typeof row.logoUrl !== "string")) throw new Error("交易所数据格式异常，请稍后重试。");
    if (row.fieldNotes !== undefined && (!row.fieldNotes || typeof row.fieldNotes !== "object" || Array.isArray(row.fieldNotes) || Object.values(row.fieldNotes).some(note => typeof note !== "string"))) throw new Error("交易所资料说明格式异常，请稍后重试。");
    if (row.fieldUpdatedAt !== undefined && (!row.fieldUpdatedAt || typeof row.fieldUpdatedAt !== "object" || Array.isArray(row.fieldUpdatedAt) || Object.values(row.fieldUpdatedAt).some(stamp => typeof stamp !== "string" || !Number.isFinite(Date.parse(stamp))))) throw new Error("交易所数据时间格式异常，请稍后重试。");
    ids.add(row.id);
  }
  if (result.sources.some(source => !source || typeof source.id !== "string" || typeof source.name !== "string" || typeof source.url !== "string" || !["live", "stale", "unavailable"].includes(source.status))) throw new Error("数据来源状态异常，请稍后重试。");
  return result;
}

function MetricSwitch({ value, onChange, label }: { value: Metric; onChange: (value: Metric) => void; label: string }) {
  return <div className="pdb-switch" role="group" aria-label={label}>{(Object.keys(metricLabels) as Metric[]).map(metric => <button type="button" key={metric} aria-pressed={metric === value} onClick={() => onChange(metric)}>{metricLabels[metric]}</button>)}</div>;
}
function ExchangeLabel({ exchange }: { exchange: Exchange }) {
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  const localLogo = cexHubIcon(exchange.id);
  const logo = localLogo || safeUrl(exchange.logoUrl);
  return <span className="pdb-exchange-label" title={`${exchange.name} · ${statusLabels[exchange.status]}${exchange.updatedAt ? ` · 更新于 ${time(exchange.updatedAt, true)}（北京时间）` : ""}`}><span className="pdb-avatar" style={{ color: color(exchange), backgroundColor: `${color(exchange)}15` }} aria-hidden="true">{logo && failedLogo !== logo ? <img src={logo} width={40} height={40} style={localLogo ? cexHubIconLayout(exchange.id) : undefined} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedLogo(logo)} /> : exchange.name.slice(0, 2).toUpperCase()}</span><span className="pdb-exchange-name">{exchange.name}</span></span>;
}
function VenueLink({ row }: { row: Exchange }) {
  const url = safeUrl(row.url);
  return url ? <a className="pdb-trade" href={url} target="_blank" rel="noopener noreferrer" aria-label={`前往 ${row.name} 官方网站`}>官网 <ArrowUpRight size={13} aria-hidden="true" /></a> : <>—</>;
}

function Rankings({ rows }: { rows: Exchange[] }) {
  const [metric, setMetric] = useState<Metric>("spotVolume24hUsd");
  const ranked = useMemo(() => rows.filter(row => finite(row[metric])).sort((a, b) => b[metric]! - a[metric]! || a.name.localeCompare(b.name)).slice(0, 15), [rows, metric]);
  const maximum = ranked[0]?.[metric] || 1;
  return <section className="pdb-panel pdb-ranking" aria-labelledby="cex-ranking-title"><div className="pdb-panel-head"><div><span className="pdb-eyebrow">CENTRALIZED EXCHANGE RANKING</span><h2 id="cex-ranking-title">{metricLabels[metric]}排行 <small>前 15 名</small></h2></div><MetricSwitch value={metric} onChange={setMetric} label="中心化交易所排行榜指标" /></div>{ranked.length ? <div className="pdb-bars">{ranked.map((row, index) => <div className="pdb-bar-row" key={row.id}><span className="pdb-rank">{String(index + 1).padStart(2, "0")}</span><ExchangeLabel exchange={row} /><div className="pdb-bar-track" title={`${row.name} · ${precise(row[metric])}`}><div className="pdb-bar" style={{ width: `${Math.max(0, row[metric]! / maximum * 100)}%`, backgroundColor: color(row) }} /></div><strong title={precise(row[metric])}>{money(row[metric])}</strong></div>)}</div> : <div className="pdb-empty">该指标暂无公开数据</div>}<p className="pdb-chart-note">现货与衍生品分别统计；排行仅覆盖当前已取得该指标的中心化交易所。</p></section>;
}
function donutArc(start: number, portion: number) {
  const point = (fraction: number) => { const angle = fraction * Math.PI * 2 - Math.PI / 2; return [120 + 88 * Math.cos(angle), 120 + 88 * Math.sin(angle)].join(" "); };
  const from = point(start);
  return portion >= .999999 ? `M ${from} A 88 88 0 1 1 ${point(start + .5)} A 88 88 0 1 1 ${from}` : `M ${from} A 88 88 0 ${portion > .5 ? 1 : 0} 1 ${point(start + portion)}`;
}
function MarketShare({ rows }: { rows: Exchange[] }) {
  const [metric, setMetric] = useState<Metric>("spotVolume24hUsd");
  const [selected, setSelected] = useState<string | null>(null);
  const eligible = useMemo(() => rows.filter(row => finite(row[metric]) && row[metric]! > 0).sort((a, b) => b[metric]! - a[metric]!), [rows, metric]);
  const total = aggregate(eligible, metric);
  const others = eligible.slice(7);
  const slices = eligible.slice(0, 7).map(row => ({ id: row.id, name: row.name, value: row[metric]!, color: color(row) }));
  if (others.length) slices.push({ id: "__others__", name: `其他 ${others.length} 家`, value: others.reduce((sum, row) => sum + row[metric]!, 0), color: "#4d5c6a" });
  const picked = eligible.find(row => row.id === selected);
  const pickedSlice = picked ? { id: picked.id, name: picked.name, value: picked[metric]! } : slices.find(slice => slice.id === selected);
  const otherOpen = others.length > 0 && (selected === "__others__" || others.some(row => row.id === selected));
  let offset = 0;
  return <section className="pdb-panel pdb-share" aria-labelledby="cex-share-title"><div className="pdb-panel-head"><div><span className="pdb-eyebrow">MARKET SHARE</span><h2 id="cex-share-title">市场份额</h2></div><MetricSwitch value={metric} onChange={value => { setMetric(value); setSelected(null); }} label="中心化交易所市场份额指标" /></div>{total && slices.length ? <><div className="pdb-share-content"><div className="pdb-donut"><svg viewBox="0 0 240 240" role="group" aria-label={`${metricLabels[metric]}市场份额，点击图块查看交易所数据`}><circle cx="120" cy="120" r="88" fill="none" stroke="#1a2530" strokeWidth="25" />{slices.map(slice => {
    const portion = slice.value / total; const start = offset; offset += portion;
    const chosen = selected === slice.id || (slice.id === "__others__" && otherOpen);
    return <path key={slice.id} className="pdb-donut-slice" d={donutArc(start, portion)} fill="none" stroke={slice.color} strokeWidth={chosen ? 32 : 25} strokeOpacity={pickedSlice && !chosen ? .55 : 1} tabIndex={0} role="button" aria-pressed={chosen} aria-label={`${slice.name}，${metricLabels[metric]} ${precise(slice.value)}，占比 ${(portion * 100).toFixed(2)}%`} onClick={() => setSelected(slice.id)} onFocus={() => setSelected(slice.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(slice.id); } }}><title>{slice.name} · {precise(slice.value)} · {(portion * 100).toFixed(2)}%</title></path>;
  })}<text x="120" y="107" textAnchor="middle" className="pdb-donut-label">{pickedSlice?.name || "合计" + metricLabels[metric]}</text><text x="120" y="137" textAnchor="middle" className="pdb-donut-total">{money(pickedSlice?.value ?? total)}</text>{pickedSlice ? <text x="120" y="158" textAnchor="middle" className="pdb-donut-label">{(pickedSlice.value / total * 100).toFixed(2)}%</text> : null}</svg></div><ul className="pdb-legend">{slices.map(slice => <li key={slice.id}><button type="button" aria-pressed={selected === slice.id || (slice.id === "__others__" && otherOpen)} onClick={() => setSelected(slice.id)}><span className="pdb-legend-dot" style={{ background: slice.color }} /><span className="pdb-legend-name">{slice.name}</span><span>{money(slice.value)}</span><strong>{(slice.value / total * 100).toFixed(2)}%</strong></button></li>)}</ul></div><div className="pdb-share-detail" role="status" aria-live="polite">{pickedSlice ? <><div><strong>{pickedSlice.name}</strong><span>{metricLabels[metric]}</span><b>{precise(pickedSlice.value)}</b><span>占比 {(pickedSlice.value / total * 100).toFixed(2)}%</span><button type="button" onClick={() => setSelected(null)} aria-label="清除中心化交易所市场份额选择">×</button></div>{picked ? <dl>{(Object.keys(metricLabels) as Metric[]).map(key => <div key={key}><dt>{metricLabels[key]}</dt><dd>{money(picked[key])}</dd></div>)}</dl> : null}</> : <span>点击环形图或右侧交易所，查看金额与市场占比。</span>}</div>{otherOpen ? <div className="pdb-share-others" aria-label="其他中心化交易所市场份额">{others.map(row => <button type="button" key={row.id} aria-pressed={selected === row.id} onClick={() => setSelected(row.id)}><span>{row.name}</span><strong>{money(row[metric])}</strong><small>{(row[metric]! / total * 100).toFixed(2)}%</small></button>)}</div> : null}</> : <div className="pdb-empty">该指标暂无可计算的市场份额</div>}<p className="pdb-chart-note">份额以本页有公开数值的交易所合计计算，不代表全球市场的完整占比。</p></section>;
}

function BubbleChart({ rows }: { rows: Exchange[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const points = rows.filter(row => finite(row.openInterestUsd) && row.openInterestUsd > 0 && finite(row.derivativesVolume24hUsd) && row.derivativesVolume24hUsd > 0);
  const values = points.flatMap(row => [row.openInterestUsd!, row.derivativesVolume24hUsd!]);
  const low = Math.max(0, Math.min(3, Math.floor(Math.log10(Math.min(...values, 1e3)))));
  const high = Math.max(low + 2, Math.ceil(Math.log10(Math.max(...values, 1e6))));
  const ticks = Array.from({ length: high - low + 1 }, (_, index) => 10 ** (index + low));
  const scale = (value: number) => (Math.log10(value) - low) / (high - low);
  const plot = { x: 68, y: 28, width: 510, height: 292 };
  const maxOi = Math.max(...points.map(row => row.openInterestUsd!), 1);
  const picked = points.find(row => row.id === selected);
  return <section className="pdb-panel pdb-bubble" aria-labelledby="cex-bubble-title"><div className="pdb-panel-head"><div><span className="pdb-eyebrow">DERIVATIVES VOLUME VS OPEN INTEREST</span><h2 id="cex-bubble-title">合约成交量 vs 持仓量</h2></div><span className="pdb-subtle">气泡大小 = 持仓 OI</span></div>{points.length ? <><svg className="pdb-bubble-svg" viewBox="0 0 610 380" role="group" aria-label="合约对数坐标气泡图，横轴持仓 OI、纵轴 24 小时衍生品成交量。聚焦气泡查看详情。"><rect x={plot.x} y={plot.y} width={plot.width} height={plot.height} fill="none" stroke="#263442" />{ticks.map(tick => { const x = plot.x + scale(tick) * plot.width; const y = plot.y + (1 - scale(tick)) * plot.height; return <g key={tick}><line x1={x} y1={plot.y} x2={x} y2={plot.y + plot.height} stroke="#263442" strokeDasharray="2 4" /><line x1={plot.x} y1={y} x2={plot.x + plot.width} y2={y} stroke="#263442" strokeDasharray="2 4" /><text x={x} y={plot.y + plot.height + 22} textAnchor="middle" className="pdb-axis">{money(tick)}</text><text x={plot.x - 10} y={y + 4} textAnchor="end" className="pdb-axis">{money(tick)}</text></g>; })}<line x1={plot.x} y1={plot.y + plot.height} x2={plot.x + plot.width} y2={plot.y} stroke="#607781" strokeDasharray="5 5" /><text x={plot.x + plot.width - 8} y={plot.y + 15} textAnchor="end" className="pdb-axis">成交 / 持仓 = 1×</text><text x={plot.x + plot.width / 2} y="370" textAnchor="middle" className="pdb-axis">合约持仓 OI（USD · 对数坐标）</text><text transform={`translate(17 ${plot.y + plot.height / 2}) rotate(-90)`} textAnchor="middle" className="pdb-axis">合约 24h 成交量（USD）</text>{points.map((row, index) => {
    const x = plot.x + scale(row.openInterestUsd!) * plot.width; const y = plot.y + (1 - scale(row.derivativesVolume24hUsd!)) * plot.height;
    const radius = Math.max(5, Math.sqrt(row.openInterestUsd! / maxOi) * 27);
    return <g key={row.id}><circle className="pdb-bubble-point" cx={x} cy={y} r={radius} fill={color(row)} fillOpacity={.64} stroke={selected === row.id ? "#f1f6ed" : color(row)} strokeWidth={selected === row.id ? 2.5 : 1.5} tabIndex={0} role="button" aria-label={`${row.name}，合约持仓 ${precise(row.openInterestUsd)}，合约24小时成交 ${precise(row.derivativesVolume24hUsd)}`} onMouseEnter={() => setSelected(row.id)} onFocus={() => setSelected(row.id)} onClick={() => setSelected(row.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(row.id); } }}><title>{`${row.name}\n合约 OI ${precise(row.openInterestUsd)}\n合约24h ${precise(row.derivativesVolume24hUsd)}`}</title></circle>{index < 3 || selected === row.id ? <text x={Math.min(x + radius + 5, plot.x + plot.width - 5)} y={Math.max(plot.y + 12, y - radius - 4)} textAnchor={x > plot.x + plot.width * .75 ? "end" : "start"} className="pdb-point-label" pointerEvents="none">{row.name}</text> : null}</g>;
  })}</svg><div className="pdb-bubble-detail" aria-live="polite">{picked ? <><strong>{picked.name}</strong><span>OI {money(picked.openInterestUsd)}</span><span>合约 24h {money(picked.derivativesVolume24hUsd)}</span><span>成交 / 持仓 {ratio(picked)?.toFixed(2)}×</span></> : <span>悬停、点选或聚焦气泡，查看交易所指标</span>}</div></> : <div className="pdb-empty">等待持仓与合约成交量公开数据</div>}<p className="pdb-chart-note">仅比较同一交易所的衍生品成交量与 OI；现货成交量不混入合约换手比例。</p></section>;
}

function DirectoryCell({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return <td className={className} role="cell"><span className="cex-cell-label">{label}</span><span className="cex-cell-value">{children}</span></td>;
}

function ExchangeTable({ rows }: { rows: Exchange[] }) {
  const [query, setQuery] = useState("");
  const [product, setProduct] = useState<"all" | "spot" | "derivatives">("all");
  const [sort, setSort] = useState<{ key: SortKey; ascending: boolean }>({ key: "spotVolume24hUsd", ascending: false });
  const filtered = useMemo(() => rows.filter(row => {
    const productMatch = product === "all" || (product === "spot" ? row.hasSpot : row.hasDerivatives);
    return productMatch && `${row.name} ${row.country || ""} ${row.id}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  }).sort((a, b) => {
    const left = a[sort.key]; const right = b[sort.key];
    if (left === null) return right === null ? a.name.localeCompare(b.name) : 1;
    if (right === null) return -1;
    const difference = typeof left === "string" && typeof right === "string" ? left.localeCompare(right) : (left as number) - (right as number);
    return difference * (sort.ascending ? 1 : -1) || a.name.localeCompare(b.name);
  }), [rows, query, product, sort]);
  const headers: { key: SortKey; label: string }[] = [{ key: "name", label: "交易所" }, { key: "spotVolume24hUsd", label: "现货 24h 成交" }, { key: "derivativesVolume24hUsd", label: "合约 24h 成交" }, { key: "openInterestUsd", label: "合约持仓 OI" }, { key: "trustScore", label: "信任评分" }, { key: "trustRank", label: "信任排名" }, { key: "spotMarkets", label: "现货交易对" }, { key: "derivativesMarkets", label: "合约交易对" }, { key: "coins", label: "币种数" }, { key: "country", label: "注册地区" }, { key: "yearEstablished", label: "成立年份" }];
  function changeSort(key: SortKey) { setSort(previous => ({ key, ascending: previous.key === key ? !previous.ascending : ["name", "country", "trustRank"].includes(key) })); }
  function metricValue(row: Exchange, field: Metric) {
    return row[field] === null && row.fieldNotes?.[field]?.includes("Deribit") ? <span className="cex-field-reference">见 Deribit</span> : money(row[field]);
  }
  return <section className="pdb-panel pdb-table-panel" aria-labelledby="cex-table-title">
    <div className="pdb-panel-head"><div><span className="pdb-eyebrow">CENTRALIZED EXCHANGE DIRECTORY</span><h2 id="cex-table-title">全部中心化交易所 <small>{rows.length} 家平台</small></h2></div><div className="pdb-table-tools"><label className="pdb-search"><Search size={14} aria-hidden="true" /><input type="search" aria-label="搜索中心化交易所" placeholder="搜索名称、地区…" value={query} onChange={event => setQuery(event.target.value)} /></label><select aria-label="中心化交易所产品类型" value={product} onChange={event => setProduct(event.target.value as typeof product)}><option value="all">全部平台</option><option value="spot">已接入现货数据</option><option value="derivatives">已接入合约数据</option></select></div></div>
    <div className="pdb-table-meta"><span role="status" aria-live="polite">显示 <strong>{filtered.length}</strong> / {rows.length} 家平台</span><span className="pdb-table-hint">金额单位 USD · 点击表头排序</span>{query || product !== "all" ? <button type="button" className="pdb-filter-reset" onClick={() => { setQuery(""); setProduct("all"); }}>清除筛选</button> : null}</div>
    <div className="cex-mobile-sort"><label><span>排序字段</span><select aria-label="中心化交易所排序字段" value={sort.key} onChange={event => { const key = event.target.value as SortKey; setSort(previous => ({ ...previous, key })); }}>{headers.map(header => <option key={header.key} value={header.key}>{header.label}</option>)}</select></label><label><span>排序方式</span><select aria-label="中心化交易所排序方向" value={sort.ascending ? "asc" : "desc"} onChange={event => { const ascending = event.target.value === "asc"; setSort(previous => ({ ...previous, ascending })); }}><option value="desc">从高到低</option><option value="asc">从低到高</option></select></label></div>
    <div className="pdb-table-scroll" role="region" aria-label="中心化交易所列表" tabIndex={0}>
      <table role="table"><colgroup><col className="cex-col-index" /><col className="cex-col-venue" /><col className="cex-col-market" /><col className="cex-col-market" /><col className="cex-col-market" /><col className="cex-col-score" /><col className="cex-col-rank" /><col className="cex-col-count" /><col className="cex-col-count" /><col className="cex-col-coins" /><col className="cex-col-country" /><col className="cex-col-year" /><col className="cex-col-link" /></colgroup>
        <thead><tr><th scope="col" className="pdb-index">#</th>{headers.map(header => <th scope="col" key={header.key} aria-sort={sort.key === header.key ? sort.ascending ? "ascending" : "descending" : "none"}><button type="button" onClick={() => changeSort(header.key)}>{header.label}{sort.key === header.key ? sort.ascending ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" /> : null}</button></th>)}<th scope="col"><span className="pdb-sr-only">官方网站</span></th></tr></thead>
        <tbody>{filtered.map((row, index) => <tr key={row.id} role="row">
          <td className="pdb-index" role="cell">{String(index + 1).padStart(2, "0")}</td>
          <th scope="row" role="rowheader"><ExchangeLabel exchange={row} /></th>
          <DirectoryCell label="现货 24h 成交"><strong>{metricValue(row, "spotVolume24hUsd")}</strong></DirectoryCell>
          <DirectoryCell label="合约 24h 成交">{metricValue(row, "derivativesVolume24hUsd")}</DirectoryCell>
          <DirectoryCell label="合约持仓 OI">{metricValue(row, "openInterestUsd")}</DirectoryCell>
          <DirectoryCell label="信任评分"><span className={`cex-trust${(row.trustScore ?? 0) >= 8 ? " is-high" : ""}`}>{row.trustScore === null ? "—" : <>{number(row.trustScore)}<small>/ 10</small></>}</span></DirectoryCell>
          <DirectoryCell label="信任排名">{row.trustRank === null ? "—" : `#${number(row.trustRank)}`}</DirectoryCell>
          <DirectoryCell label="现货交易对">{number(row.spotMarkets)}</DirectoryCell>
          <DirectoryCell label="合约交易对">{number(row.derivativesMarkets)}</DirectoryCell>
          <DirectoryCell label="币种数">{number(row.coins)}</DirectoryCell>
          <DirectoryCell label="注册地区" className="cex-country">{row.country || "—"}</DirectoryCell>
          <DirectoryCell label="成立年份">{row.yearEstablished ?? "—"}</DirectoryCell>
          <td className="cex-official" role="cell"><VenueLink row={row} /></td>
        </tr>)}</tbody>
      </table>{!filtered.length ? <div className="pdb-empty">{rows.length ? "没有匹配的中心化交易所" : "暂无中心化交易所公开数据"}</div> : null}
    </div>
  </section>;
}

// The clock and connection badge can update without rebuilding the directory or charts.
const MarketPanels = memo(function MarketPanels({ rows }: { rows: Exchange[] }) {
  return <><Rankings rows={rows} /><div className="pdb-chart-grid"><MarketShare rows={rows} /><BubbleChart rows={rows} /></div><ExchangeTable rows={rows} /></>;
});

const questions = [
  ["Cex Hub 收录哪些交易所？", "本页汇集常见中心化交易所，按平台主体分别展示现货与衍生品公开信息。地区站与独立品牌可能分别收录。现货与合约筛选依据已确认的产品映射，空值表示当前缺少该字段的公开数值。收录范围与公开接口覆盖会变化。"],
  ["现货、合约成交量与持仓 OI 如何理解？", "现货成交量反映最近 24 小时的现货交易；衍生品成交量涵盖来源所定义的合约交易；OI 是尚未平仓的合约名义价值。三个指标分别统计，不能把现货成交额用于计算合约换手比例。"],
  ["交易对与币种数采用什么口径？", "现货交易对与币种数优先使用可核验的公开市场资料，按来源已收录的市场统计；覆盖范围和更新时间可能与交易所官网不同。合约交易对按来源公开的永续与交割合约统计。"],
  ["公开数据多久更新一次？", "页面每分钟自动读取，切回页面时也会刷新。来源接口有各自的采集与缓存周期，页面读取时间不等于所有交易所的同一撮合时刻。底部来源标签可以查看更新时间与连接状态。"],
  ["信任评分和信任排名代表什么？", "表内 Trust Score 和排名来自 CoinGecko 对交易所的公开评估。评分通常为 0 至 10 分，涉及流动性、规模等多项因素；不构成对平台偿付能力、监管许可或用户资金安全的承诺。"],
  ["为什么部分字段显示「—」？", "「—」表示公开接口没有提供、当前读取失败或无法按统一口径换算，不代表零。读取失败时可保留最近成功的数据，并在连接状态中标明；数据来源与统计窗口不同也会造成官网数值差异。"],
  ["市场份额和气泡图如何使用？", "点击环形图、图例或“其他”分组可查看平台金额及占比。份额仅以本页可用数据合计计算。气泡图采用对数坐标，对比合约成交量与持仓 OI；两轴均不混入现货成交量。"],
];
function Methodology() { return <section className="pdb-panel pdb-methodology" aria-labelledby="cex-faq-title"><div className="pdb-panel-head"><div><span className="pdb-eyebrow">METHODOLOGY & FAQ</span><h2 id="cex-faq-title">统计口径与常见问题</h2></div></div><div>{questions.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></section>; }
function PublicSources({ sources }: { sources: Snapshot["sources"] }) {
  return <footer className="pdb-sources" aria-labelledby="cex-sources-title"><div className="pdb-sources-head"><div><span className="pdb-eyebrow">PUBLIC DATA SOURCES</span><h2 id="cex-sources-title">公开数据来源 <small>{sources.filter(source => source.status === "live").length} 个来源已连接</small></h2></div></div><div className="pdb-source-marquee"><div className="pdb-source-track">{[false, true].map(duplicate => <div className="pdb-source-group" key={String(duplicate)} aria-hidden={duplicate || undefined}>{sources.map(source => <a key={source.id} href={safeUrl(source.url)} target="_blank" rel="noopener noreferrer" tabIndex={duplicate ? -1 : undefined} className={`pdb-source-chip is-${source.status}`} title={[source.error, source.updatedAt ? `来源更新于 ${time(source.updatedAt, true)}（北京时间）` : source.fetchedAt ? `读取于 ${time(source.fetchedAt, true)}（北京时间）` : "来源未提供更新时间"].filter(Boolean).join(" · ")}>{source.status === "live" ? <Check size={12} aria-hidden="true" /> : <CircleAlert size={12} aria-hidden="true" />}{source.name}<span>{source.status === "live" ? "已连接" : statusLabels[source.status]}</span><ArrowUpRight size={11} aria-hidden="true" /></a>)}</div>)}</div></div></footer>;
}

export function CexHub({ active = true }: { active?: boolean }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const snapshotRef = useRef<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    let disposed = false; let fetching = false; let resumeRequested = false;
    let controller: AbortController | null = null; let timer: ReturnType<typeof setTimeout> | undefined;
    const interval = () => Math.max(30, Math.min(600, finite(snapshotRef.current?.refreshIntervalSeconds) ? snapshotRef.current!.refreshIntervalSeconds : 60)) * 1000;
    async function refresh() {
      if (disposed || document.hidden) return;
      if (fetching) { resumeRequested = true; return; }
      fetching = true; resumeRequested = false; controller = new AbortController(); const request = controller;
      const timeout = window.setTimeout(() => request.abort("timeout"), 25000);
      setLoading(true); setNow(Date.now());
      try {
        const response = await fetch("/api/hedge-ops/cex-hub", { cache: "no-store", signal: request.signal });
        const result = readSnapshot(await response.json());
        if (!disposed && !request.signal.aborted) {
          // A valid 503 snapshot can deliberately remove server-expired market fields.
          snapshotRef.current = result; setSnapshot(result);
          setError(response.ok ? "" : `公开数据暂不可用（HTTP ${response.status}），稍后自动重试。`);
          setNow(Date.now());
        }
      } catch (caught) {
        if (!disposed && (!request.signal.aborted || request.signal.reason === "timeout")) setError(request.signal.reason === "timeout" ? "公开数据读取超时，稍后自动重试。" : caught instanceof Error ? caught.message : "公开数据读取失败，稍后自动重试。");
      } finally {
        window.clearTimeout(timeout); fetching = false;
        if (!disposed) { setLoading(false); if (!document.hidden) timer = setTimeout(() => void refresh(), resumeRequested ? 0 : interval()); }
      }
    }
    function visibility() {
      clearTimeout(timer);
      if (document.hidden) { controller?.abort("hidden"); setLoading(false); }
      else { setNow(Date.now()); void refresh(); }
    }
    void refresh(); document.addEventListener("visibilitychange", visibility);
    const clock = window.setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 30000);
    return () => { disposed = true; controller?.abort("inactive"); clearTimeout(timer); clearInterval(clock); document.removeEventListener("visibilitychange", visibility); };
  }, [active, revision]);
  const marketExpired = Boolean(snapshot && now - Date.parse(snapshot.generatedAt) >= maxRetainedMarketAgeMs);
  const rows = useMemo<Exchange[]>(() => {
    if (!snapshot) return emptyExchanges;
    if (!marketExpired) return snapshot.exchanges;
    return snapshot.exchanges.map((row): Exchange => ({ ...row, spotVolume24hUsd: null, derivativesVolume24hUsd: null, openInterestUsd: null, status: "unavailable", fieldStatus: { ...row.fieldStatus, spotVolume24hUsd: "unavailable", derivativesVolume24hUsd: "unavailable", openInterestUsd: "unavailable" } }));
  }, [snapshot, marketExpired]);
  const intervalSeconds = snapshot && finite(snapshot.refreshIntervalSeconds) ? Math.max(30, Math.min(600, snapshot.refreshIntervalSeconds)) : 60;
  const stale = Boolean(snapshot && (now - Date.parse(snapshot.generatedAt) > intervalSeconds * 2000 || snapshot.sources.some(source => source.status !== "live") || rows.some(row => row.status === "stale" || Object.values(row.fieldStatus || {}).some(status => status === "stale"))));
  const hasData = rows.some(row => Object.keys(metricLabels).some(key => row[key as Metric] !== null));
  const notice = marketExpired ? `${error ? `${error} ` : ""}公开行情超过 1 小时未更新，已隐藏过期金额。` : error;
  return <section className="perpdex-box cex-hub" aria-label="Cex Hub 中心化交易所公开数据看板"><div className="pdb-page-head"><div><span className="pdb-eyebrow"><span className="pdb-lime-line" />CENTRALIZED EXCHANGES · MARKET INTELLIGENCE</span><h1>Cex Hub <span>中心化交易所数据中心</span></h1><p>现货、合约与平台信息，一览常见中心化交易所。</p></div><div className="pdb-page-actions"><span className={`pdb-live-pill${error || stale ? " is-stale" : ""}`}><i />{loading && !snapshot ? "读取公开数据" : error ? "连接暂未确认" : stale ? "部分来源待更新" : snapshot ? "公开数据已连接" : "等待数据"}</span><button type="button" className="pdb-refresh" disabled={loading || !active} onClick={() => setRevision(value => value + 1)}><RefreshCw size={14} className={loading ? "pdb-spin" : ""} aria-hidden="true" />{loading ? "更新中" : "刷新数据"}</button></div></div>{notice ? <div className="pdb-notice is-error" role="status"><CircleAlert size={16} aria-hidden="true" /><span>{notice}{snapshot && hasData ? " 已保留最近成功数据，以下数值不代表当前实时状态。" : snapshot ? marketExpired ? " 可继续查看平台资料。" : " 行情字段暂缺，可继续查看平台资料。" : ""}</span><button type="button" disabled={loading} onClick={() => setRevision(value => value + 1)}>重试</button></div> : null}<div className="pdb-summary"><article><span className="pdb-summary-label"><BarChart3 size={15} aria-hidden="true" />现货 24h 成交合计</span><strong>{money(aggregate(rows, "spotVolume24hUsd"))}</strong><small>{rows.filter(row => row.spotVolume24hUsd !== null).length} 家平台有现货数据</small></article><article><span className="pdb-summary-label"><BarChart3 size={15} aria-hidden="true" />合约 24h 成交合计</span><strong>{money(aggregate(rows, "derivativesVolume24hUsd"))}</strong><small>持仓 OI {money(aggregate(rows, "openInterestUsd"))} · {rows.filter(row => row.derivativesVolume24hUsd !== null).length} 家有合约数据</small></article><article><span className="pdb-summary-label"><Database size={15} aria-hidden="true" />收录中心化交易所</span><strong>{snapshot ? rows.length : "—"}<em>家</em></strong><small>现货与衍生品独立列示</small></article><article className="pdb-summary-updated"><span className="pdb-summary-label"><Clock3 size={15} aria-hidden="true" />数据读取于</span><strong>{snapshot ? time(snapshot.generatedAt, true) : "—"}</strong><small>北京时间 · 每 {intervalSeconds % 60 === 0 ? `${intervalSeconds / 60} 分钟` : `${intervalSeconds} 秒`}自动更新</small></article></div>{loading && !snapshot ? <div className="pdb-loading" role="status"><RefreshCw size={22} className="pdb-spin" aria-hidden="true" /><strong>正在汇集中心化交易所公开数据</strong><p>现货、合约与价格换算来源独立读取。</p></div> : <MarketPanels rows={rows} />}<Methodology /><PublicSources sources={snapshot?.sources || emptySources} /></section>;
}
