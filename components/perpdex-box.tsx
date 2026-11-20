"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpRight, BarChart3, Check, CircleAlert, Clock3, Database, RefreshCw, Search } from "lucide-react";
import { perpdexExchangeIcons } from "@/lib/perpdex-box-icons";
import "@/app/hedge-ops/perpdex-box.css";

import type { PerpdexExchange as Exchange, PerpdexBoxSnapshot as Snapshot } from "@/lib/perpdex-box-types";
export type { PerpdexExchange as Exchange, PerpdexBoxSnapshot as Snapshot } from "@/lib/perpdex-box-types";

type Metric = "oiUsd" | "volume24hUsd" | "tvlUsd";
type SortKey = Metric | "name" | "ratio" | "markets" | "makerFeePct" | "takerFeePct" | "maxLeverage";
const metricLabels: Record<Metric, string> = { oiUsd: "持仓 OI", volume24hUsd: "24h 成交量", tvlUsd: "TVL" };
const palette = ["#b8e879", "#68c9c4", "#d6ba75", "#9b9ee3", "#6ba6dc", "#c688ad", "#8bc4a2", "#bd9f7b", "#8098b7", "#d99d81"];
const numericFields = ["oiUsd", "volume24hUsd", "tvlUsd", "markets", "makerFeePct", "takerFeePct", "maxLeverage"] as const;
const statusNames = { live: "公开数据", stale: "最近数据", unavailable: "暂不可用" };

function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function safeUrl(value: string): string | undefined { try { const url = new URL(value); return url.protocol === "https:" ? url.href : undefined; } catch { return undefined; } }
function money(value: number | null): string {
  if (value === null || !finite(value)) return "—";
  const absolute = Math.abs(value);
  const unit = absolute >= 1e12 ? [1e12, "T"] as const : absolute >= 1e9 ? [1e9, "B"] as const : absolute >= 1e6 ? [1e6, "M"] as const : absolute >= 1e3 ? [1e3, "K"] as const : [1, ""] as const;
  return `$${(value / unit[0]).toLocaleString("en-US", { maximumFractionDigits: absolute >= 1e3 ? 2 : 0 })}${unit[1]}`;
}
function precise(value: number | null) { return value === null ? "暂无公开数据" : `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`; }
function percent(value: number | null) { return value === null ? "—" : `${value.toLocaleString("en-US", { maximumFractionDigits: 5 })}%`; }
function ratio(exchange: Exchange) { return exchange.oiUsd !== null && exchange.oiUsd > 0 && exchange.volume24hUsd !== null ? exchange.volume24hUsd / exchange.oiUsd : null; }
function time(value: string | null, withDate = false) {
  if (!value || !Number.isFinite(Date.parse(value))) return "时间未提供";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", ...(withDate ? { month: "2-digit", day: "2-digit" } : {}), hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}
function aggregate(rows: Exchange[], metric: Metric) { const values = rows.map(row => row[metric]).filter(finite); return values.length ? values.reduce((sum, value) => sum + value, 0) : null; }
function color(exchange: Exchange, _index: number) {
  const hash = Array.from(exchange.id).reduce((sum, character) => sum + character.charCodeAt(0), 0);
  if (!exchange.color || !/^#[0-9a-f]{6}$/i.test(exchange.color)) return palette[hash % palette.length];
  const rgb = [1, 3, 5].map(start => parseInt(exchange.color!.slice(start, start + 2), 16));
  // Keep dark brand colors legible on the workspace's dark chart surface.
  if (rgb[0] * .299 + rgb[1] * .587 + rgb[2] * .114 < 85) return `#${rgb.map(value => Math.round(value * .55 + 255 * .45).toString(16).padStart(2, "0")).join("")}`;
  return exchange.color;
}
function readSnapshot(value: unknown): Snapshot {
  if (!value || typeof value !== "object") throw new Error("公开数据返回格式异常，请稍后重试。");
  const candidate = value as Snapshot;
  if (!Number.isFinite(Date.parse(candidate.generatedAt)) || !Array.isArray(candidate.exchanges) || !Array.isArray(candidate.sources) || !Array.isArray(candidate.warnings) || !candidate.warnings.every(item => typeof item === "string")) throw new Error("公开数据不完整，请稍后重试。");
  const ids = new Set<string>();
  for (const row of candidate.exchanges) {
    if (!row || typeof row.id !== "string" || ids.has(row.id) || typeof row.name !== "string" || !["dex", "hip3", "cex"].includes(row.category) || !["live", "stale", "unavailable"].includes(row.status) || typeof row.tradeUrl !== "string" || typeof row.sourceUrl !== "string" || numericFields.some(key => row[key] !== null && (!finite(row[key]) || (key !== "makerFeePct" && row[key]! < 0)))) throw new Error("交易所数据格式异常，请稍后重试。");
    ids.add(row.id);
  }
  if (candidate.sources.some(source => !source || typeof source.id !== "string" || typeof source.name !== "string" || typeof source.url !== "string" || !["live", "stale", "unavailable"].includes(source.status))) throw new Error("数据来源状态异常，请稍后重试。");
  return candidate;
}

function MetricSwitch({ value, onChange, label }: { value: Metric; onChange: (metric: Metric) => void; label: string }) {
  return <div className="pdb-switch" role="group" aria-label={label}>{(Object.keys(metricLabels) as Metric[]).map(metric => <button type="button" key={metric} aria-pressed={value === metric} onClick={() => onChange(metric)}>{metricLabels[metric]}</button>)}</div>;
}

function ExchangeLabel({ exchange, index = 0 }: { exchange: Exchange; index?: number }) {
  const [failed, setFailed] = useState(false);
  const icon = perpdexExchangeIcons[exchange.id];
  return <span className="pdb-exchange-label" title={[exchange.name, statusNames[exchange.status], exchange.productLabel, exchange.observedAt ? `行情观测于 ${time(exchange.observedAt, true)}（北京时间）` : null].filter(Boolean).join(" · ")}><span className="pdb-avatar" style={{ color: color(exchange, index), backgroundColor: `${color(exchange, index)}15` }} aria-hidden="true">{icon && !failed ? <img src={icon} width={24} height={24} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} /> : exchange.name.slice(0, 2).toUpperCase()}</span><span className="pdb-exchange-name">{exchange.name}{exchange.category === "hip3" ? <span className="pdb-badge">HIP-3</span> : exchange.category === "cex" ? <span className="pdb-badge pdb-badge-cex">CEX</span> : exchange.oiIncludesChildren ? <small>含 HIP-3</small> : null}{exchange.productLabel ? <small className="pdb-product-label">{exchange.productLabel}</small> : null}</span></span>;
}

function FeePromotionNote({ exchange }: { exchange: Exchange }) {
  const promotion = exchange.feePromotion;
  if (!promotion) return null;
  const note = `${exchange.metadataAsOf ? `${exchange.metadataAsOf.slice(0, 10)} 核对记录：` : "公开资料记录："}表列费率为活动参考价；基础 Maker ${percent(promotion.baseMakerFeePct)}、Taker ${percent(promotion.baseTakerFeePct)}。${promotion.until ? `记录截止日期 ${promotion.until}；` : "记录未提供活动截止日期；"}当前活动是否有效，以交易所官方规则为准。`;
  return <small><span className="pdb-promotion-note" tabIndex={0} title={note} aria-label={note}>活动参考价</span></small>;
}

function TradeLink({ exchange }: { exchange: Exchange }) {
  const url = safeUrl(exchange.tradeUrl);
  if (!url) return <>—</>;
  const closed = exchange.tradingStatus === "closed";
  return <a className="pdb-trade" href={url} target="_blank" rel="noopener noreferrer" aria-label={`前往 ${exchange.name} 官方${closed ? "说明" : "交易页面"}`}>{closed ? "查看说明" : "去交易"} <ArrowUpRight size={13} aria-hidden="true" /></a>;
}

function Rankings({ rows }: { rows: Exchange[] }) {
  const [metric, setMetric] = useState<Metric>("oiUsd");
  const ranked = useMemo(() => rows.filter(row => row[metric] !== null).sort((a, b) => b[metric]! - a[metric]!).slice(0, 15), [rows, metric]);
  const maximum = ranked[0]?.[metric] || 1;
  return <section className="pdb-panel pdb-ranking" aria-labelledby="pdb-ranking-title"><div className="pdb-panel-head"><div><span className="pdb-eyebrow">EXCHANGE RANKING</span><h2 id="pdb-ranking-title">{metricLabels[metric]}排行 <small>前 15 名</small></h2></div><MetricSwitch value={metric} onChange={setMetric} label="排行榜指标" /></div>
    {ranked.length ? <div className="pdb-bars">{ranked.map((row, index) => <div className="pdb-bar-row" key={row.id}><span className="pdb-rank">{String(index + 1).padStart(2, "0")}</span><ExchangeLabel exchange={row} index={index} /><div className="pdb-bar-track" title={`${row.name} · ${precise(row[metric])}`}><div className="pdb-bar" style={{ width: `${Math.max(0, row[metric]! / maximum * 100)}%`, backgroundColor: color(row, index) }} /></div><strong title={precise(row[metric])}>{money(row[metric])}</strong></div>)}</div> : <div className="pdb-empty">该指标暂无公开数据</div>}
    <p className="pdb-chart-note">HIP-3 子市场独立列示；父平台已包含的子市场不重复计入合计。</p>
  </section>;
}

function donutArc(start: number, portion: number) {
  const point = (fraction: number) => { const angle = fraction * Math.PI * 2 - Math.PI / 2; return [120 + 88 * Math.cos(angle), 120 + 88 * Math.sin(angle)].join(" "); };
  const from = point(start);
  // Two arcs also cover a single platform with 100% share without an empty SVG path.
  if (portion >= .999999) return `M ${from} A 88 88 0 1 1 ${point(start + .5)} A 88 88 0 1 1 ${from}`;
  return `M ${from} A 88 88 0 ${portion > .5 ? 1 : 0} 1 ${point(start + portion)}`;
}

function MarketShare({ rows }: { rows: Exchange[] }) {
  const [metric, setMetric] = useState<Metric>("oiUsd");
  const [selected, setSelected] = useState<string | null>(null);
  const eligible = useMemo(() => rows.filter(row => row.category !== "hip3" && row[metric] !== null && row[metric]! > 0).sort((a, b) => b[metric]! - a[metric]!), [rows, metric]);
  const total = aggregate(eligible, metric);
  const others = eligible.slice(7);
  const slices = eligible.slice(0, 7).map((row, index) => ({ id: row.id, name: row.name, value: row[metric]!, color: color(row, index) }));
  if (others.length) slices.push({ id: "other", name: `其他 ${others.length} 家`, value: others.reduce((sum, row) => sum + row[metric]!, 0), color: "#4d5c6a" });
  const picked = eligible.find(row => row.id === selected);
  const pickedSlice = picked ? { id: picked.id, name: picked.name, value: picked[metric]! } : slices.find(slice => slice.id === selected);
  const otherOpen = others.length > 0 && (selected === "other" || others.some(row => row.id === selected));
  let offset = 0;
  function changeMetric(next: Metric) { setMetric(next); setSelected(null); }
  return <section className="pdb-panel pdb-share" aria-labelledby="pdb-share-title"><div className="pdb-panel-head"><div><span className="pdb-eyebrow">MARKET SHARE</span><h2 id="pdb-share-title">市场份额</h2></div><MetricSwitch value={metric} onChange={changeMetric} label="市场份额指标" /></div>
    {total && slices.length ? <><div className="pdb-share-content"><div className="pdb-donut"><svg viewBox="0 0 240 240" role="group" aria-label={`${metricLabels[metric]}市场份额，点击图块查看交易所数据`}><circle cx="120" cy="120" r="88" fill="none" stroke="#1a2530" strokeWidth="25" />{slices.map(slice => {
      const portion = slice.value / total; const start = offset; offset += portion;
      const chosen = selected === slice.id || (slice.id === "other" && otherOpen);
      return <path key={slice.id} className="pdb-donut-slice" d={donutArc(start, portion)} fill="none" stroke={slice.color} strokeWidth={chosen ? 32 : 25} strokeOpacity={pickedSlice && !chosen ? .55 : 1} role="button" tabIndex={0} aria-pressed={chosen} aria-label={`${slice.name}，${metricLabels[metric]} ${precise(slice.value)}，占比 ${(portion * 100).toFixed(2)}%`} onClick={() => setSelected(slice.id)} onFocus={() => setSelected(slice.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(slice.id); } }}><title>{slice.name} · {precise(slice.value)} · {(portion * 100).toFixed(2)}%</title></path>;
    })}<text x="120" y="107" textAnchor="middle" className="pdb-donut-label">{pickedSlice?.name || `合计${metricLabels[metric]}`}</text><text x="120" y="137" textAnchor="middle" className="pdb-donut-total">{money(pickedSlice?.value ?? total)}</text>{pickedSlice ? <text x="120" y="158" textAnchor="middle" className="pdb-donut-label">{(pickedSlice.value / total * 100).toFixed(2)}%</text> : null}</svg></div><ul className="pdb-legend">{slices.map(slice => <li key={slice.id}><button type="button" aria-pressed={selected === slice.id || (slice.id === "other" && otherOpen)} onClick={() => setSelected(slice.id)}><span className="pdb-legend-dot" style={{ background: slice.color }} /><span className="pdb-legend-name">{slice.name}</span><span>{money(slice.value)}</span><strong>{(slice.value / total * 100).toFixed(2)}%</strong></button></li>)}</ul></div>
    <div className="pdb-share-detail" role="status" aria-live="polite">{pickedSlice ? <><div><strong>{pickedSlice.name}</strong><span>{metricLabels[metric]}</span><b>{precise(pickedSlice.value)}</b><span>占比 {(pickedSlice.value / total * 100).toFixed(2)}%</span><button type="button" onClick={() => setSelected(null)} aria-label="清除市场份额选择">×</button></div>{picked ? <dl>{(Object.keys(metricLabels) as Metric[]).map(key => <div key={key}><dt>{metricLabels[key]}</dt><dd title={precise(picked[key])}>{money(picked[key])}</dd></div>)}</dl> : null}</> : <span>点击环形图或右侧交易所，查看金额与市场占比。</span>}</div>
    {otherOpen ? <div className="pdb-share-others" aria-label="其他交易所市场份额">{others.map(row => <button type="button" key={row.id} aria-pressed={selected === row.id} onClick={() => setSelected(row.id)}><span>{row.name}</span><strong>{money(row[metric])}</strong><small>{(row[metric]! / total * 100).toFixed(2)}%</small></button>)}</div> : null}</> : <div className="pdb-empty">该指标暂无可计算的市场份额</div>}
    <p className="pdb-chart-note">以已取得该指标的平台合计计算；不重复计算 HIP-3 子市场。</p>
  </section>;
}

function BubbleChart({ rows }: { rows: Exchange[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const points = rows.filter(row => row.oiUsd !== null && row.oiUsd > 0 && row.volume24hUsd !== null && row.volume24hUsd > 0);
  const values = points.flatMap(row => [row.oiUsd!, row.volume24hUsd!]);
  const low = Math.max(0, Math.min(3, Math.floor(Math.log10(Math.min(...values, 1e3)))));
  const high = Math.max(low + 2, Math.ceil(Math.log10(Math.max(...values, 1e6))));
  const ticks = Array.from({ length: high - low + 1 }, (_, index) => 10 ** (index + low));
  const scale = (value: number) => (Math.log10(value) - low) / (high - low);
  const plot = { x: 68, y: 28, width: 510, height: 292 };
  const maxTvl = Math.max(...points.map(row => row.tvlUsd || 0), 1);
  const picked = points.find(row => row.id === selected);
  return <section className="pdb-panel pdb-bubble" aria-labelledby="pdb-bubble-title"><div className="pdb-panel-head"><div><span className="pdb-eyebrow">VOLUME VS OPEN INTEREST</span><h2 id="pdb-bubble-title">成交量 vs 持仓量</h2></div><span className="pdb-subtle">气泡大小 = TVL</span></div>
    {points.length ? <><svg className="pdb-bubble-svg" viewBox="0 0 610 380" role="group" aria-label="对数坐标气泡图，横轴持仓 OI、纵轴 24 小时成交量。聚焦气泡查看详情。"><rect x={plot.x} y={plot.y} width={plot.width} height={plot.height} fill="none" stroke="#263442" />{ticks.map(tick => { const x = plot.x + scale(tick) * plot.width; const y = plot.y + (1 - scale(tick)) * plot.height; return <g key={tick}><line x1={x} y1={plot.y} x2={x} y2={plot.y + plot.height} stroke="#263442" strokeDasharray="2 4" /><line x1={plot.x} y1={y} x2={plot.x + plot.width} y2={y} stroke="#263442" strokeDasharray="2 4" /><text x={x} y={plot.y + plot.height + 22} textAnchor="middle" className="pdb-axis">{money(tick)}</text><text x={plot.x - 10} y={y + 4} textAnchor="end" className="pdb-axis">{money(tick)}</text></g>; })}<line x1={plot.x} y1={plot.y + plot.height} x2={plot.x + plot.width} y2={plot.y} stroke="#607781" strokeDasharray="5 5" /><text x={plot.x + plot.width - 8} y={plot.y + 15} textAnchor="end" className="pdb-axis">成交 / 持仓 = 1×</text><text x={plot.x + plot.width / 2} y="370" textAnchor="middle" className="pdb-axis">持仓 OI（USD · 对数坐标）</text><text transform={`translate(17 ${plot.y + plot.height / 2}) rotate(-90)`} textAnchor="middle" className="pdb-axis">24h 成交量（USD）</text>{points.map((row, index) => { const x = plot.x + scale(row.oiUsd!) * plot.width; const y = plot.y + (1 - scale(row.volume24hUsd!)) * plot.height; const radius = row.tvlUsd !== null ? Math.max(5, Math.sqrt(row.tvlUsd / maxTvl) * 30) : 6; return <g key={row.id}><circle className="pdb-bubble-point" cx={x} cy={y} r={radius} fill={row.tvlUsd !== null ? color(row, index) : "#0d141d"} fillOpacity={row.tvlUsd !== null ? .64 : 1} stroke={selected === row.id ? "#f1f6ed" : color(row, index)} strokeWidth={selected === row.id ? 2.5 : 1.5} tabIndex={0} role="button" aria-label={`${row.name}，持仓${precise(row.oiUsd)}，24小时成交${precise(row.volume24hUsd)}，TVL${precise(row.tvlUsd)}`} onMouseEnter={() => setSelected(row.id)} onFocus={() => setSelected(row.id)} onClick={() => setSelected(row.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(row.id); } }}><title>{`${row.name}\nOI ${precise(row.oiUsd)}\n24h ${precise(row.volume24hUsd)}\nTVL ${precise(row.tvlUsd)}`}</title></circle>{(index < 3 || selected === row.id) && <text x={Math.min(x + radius + 5, plot.x + plot.width - 5)} y={Math.max(plot.y + 12, y - radius - 4)} textAnchor={x > plot.x + plot.width * .75 ? "end" : "start"} className="pdb-point-label" pointerEvents="none">{row.name}</text>}</g>; })}</svg><div className="pdb-bubble-detail" aria-live="polite">{picked ? <><strong>{picked.name}</strong><span>OI {money(picked.oiUsd)}</span><span>24h {money(picked.volume24hUsd)}</span><span>TVL {money(picked.tvlUsd)}</span><span>成交 / 持仓 {ratio(picked)?.toFixed(2)}×</span></> : <span>悬停、点选或聚焦气泡，查看交易所指标</span>}</div></> : <div className="pdb-empty">等待持仓与成交量公开数据</div>}
    <p className="pdb-chart-note">空心圈表示未提供 TVL。左上方代表成交相对持仓更高；HIP-3 子市场单独展示。</p>
  </section>;
}

function ExchangeTable({ rows, totalOi }: { rows: Exchange[]; totalOi: number | null }) {
  const [sort, setSort] = useState<{ key: SortKey; ascending: boolean }>({ key: "oiUsd", ascending: false });
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | "dex" | "hip3" | "cex">("all");
  const filtered = useMemo(() => rows.filter(row => (category === "all" || row.category === category) && row.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a, b) => {
    if (sort.key === "name") return (sort.ascending ? 1 : -1) * a.name.localeCompare(b.name);
    const left = sort.key === "ratio" ? ratio(a) : a[sort.key]; const right = sort.key === "ratio" ? ratio(b) : b[sort.key];
    if (left === null) return right === null ? a.name.localeCompare(b.name) : 1;
    if (right === null) return -1;
    return (left - right) * (sort.ascending ? 1 : -1) || a.name.localeCompare(b.name);
  }), [rows, query, category, sort]);
  const headers: { key: SortKey; label: string }[] = [{ key: "name", label: "交易所" }, { key: "oiUsd", label: "持仓 OI" }, { key: "volume24hUsd", label: "24h 成交量" }, { key: "ratio", label: "成交 / 持仓" }, { key: "tvlUsd", label: "TVL" }, { key: "markets", label: "交易对" }, { key: "makerFeePct", label: "Maker" }, { key: "takerFeePct", label: "Taker" }, { key: "maxLeverage", label: "最高杠杆" }];
  function changeSort(key: SortKey) { setSort(previous => ({ key, ascending: previous.key === key ? !previous.ascending : key === "name" })); }
  return <section className="pdb-panel pdb-table-panel" aria-labelledby="pdb-table-title"><div className="pdb-panel-head"><div><span className="pdb-eyebrow">ALL PERPETUAL VENUES</span><h2 id="pdb-table-title">全部交易所 <small>{rows.filter(row => row.category === "dex").length} DEX · {rows.filter(row => row.category === "cex").length} CEX · {rows.filter(row => row.category === "hip3").length} HIP-3</small></h2></div><div className="pdb-table-tools"><label className="pdb-search"><Search size={14} aria-hidden="true" /><input type="search" aria-label="搜索交易所" placeholder="搜索交易所…" value={query} onChange={event => setQuery(event.target.value)} /></label><select aria-label="交易所类型" value={category} onChange={event => setCategory(event.target.value as typeof category)}><option value="all">全部类型</option><option value="dex">DEX 平台</option><option value="cex">CEX 平台</option><option value="hip3">HIP-3 子市场</option></select></div></div>
    <div className="pdb-table-meta"><span role="status" aria-live="polite">显示 <strong>{filtered.length}</strong> / {rows.length} 个市场</span><span className="pdb-table-hint">金额单位 USD · 点击表头排序</span>{query || category !== "all" ? <button type="button" className="pdb-filter-reset" onClick={() => { setQuery(""); setCategory("all"); }}>清除筛选</button> : null}</div>
    <div className="pdb-table-scroll" tabIndex={0} role="region" aria-label="交易所指标，可横向与纵向滚动"><table><thead><tr><th scope="col" className="pdb-index">#</th>{headers.map(header => <th scope="col" key={header.key} aria-sort={sort.key === header.key ? sort.ascending ? "ascending" : "descending" : "none"}><button type="button" onClick={() => changeSort(header.key)}>{header.label}{sort.key === header.key ? sort.ascending ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" /> : null}</button></th>)}<th scope="col"><span className="pdb-sr-only">交易入口</span></th></tr></thead><tbody>{filtered.map((row, index) => <tr key={row.id}><td className="pdb-index">{String(index + 1).padStart(2, "0")}</td><th scope="row"><ExchangeLabel exchange={row} index={rows.findIndex(item => item.id === row.id)} /></th><td title={precise(row.oiUsd)}><strong>{money(row.oiUsd)}</strong>{row.category !== "hip3" && totalOi !== null && totalOi > 0 && row.oiUsd !== null ? <small>{(row.oiUsd / totalOi * 100).toFixed(2)}%</small> : row.category === "hip3" ? <small>子市场</small> : null}</td><td title={precise(row.volume24hUsd)}>{money(row.volume24hUsd)}</td><td className="pdb-muted">{ratio(row) === null ? "—" : `${ratio(row)!.toFixed(2)}×`}</td><td title={precise(row.tvlUsd)}>{money(row.tvlUsd)}</td><td>{row.markets === null ? "—" : row.markets.toLocaleString("en-US")}</td><td className={row.makerFeePct !== null && row.makerFeePct < 0 ? "pdb-positive" : ""}>{percent(row.makerFeePct)}<FeePromotionNote exchange={row} /></td><td>{percent(row.takerFeePct)}</td><td title={row.metadataAsOf ? `公开规则核对日期：${row.metadataAsOf.slice(0, 10)}` : undefined}>{row.maxLeverage === null ? "—" : `${row.maxLeverage}×`}</td><td><TradeLink exchange={row} /></td></tr>)}</tbody></table>{!filtered.length && <div className="pdb-empty">{rows.length ? "没有匹配的交易所" : "暂无交易所公开数据"}</div>}</div>
  </section>;
}

const questions = [
  ["持仓 OI、24h 成交量与 TVL 有什么区别？", "OI 是尚未平仓的合约名义价值；24h 成交量反映最近一天的交易活动；TVL 反映来源定义下的锁定资金。三者衡量不同维度，成交量高并不等于资金多或市场深度充足。"],
  ["HIP-3 市场如何计入排行？", "HIP-3 市场使用 Hyperliquid 的交易基础设施，由不同部署方运营。本看板将子市场单独列出以便比较；父平台包含它们的指标，因此汇总和市场份额仅计算独立平台，避免重复累计。"],
  ["公开接口的数据会自动更新吗？", "页面按顶部标注的间隔重新读取，切回页面时也会刷新。交易所、聚合服务的采集频率可能不同，底部公开来源处可查看更新时间。基础费率和杠杆为已公布规则资料，以来源页面及其核对日期为准。"],
  ["为什么有些字段是空的，或和交易所官网不同？", "「—」表示来源未公开、当前读取失败或无法采用统一口径，不代表零。持仓单双边、TVL 统计范围、24 小时窗口和采集时刻都可能造成差异。发生读取错误时会保留最近成功的数据并标注状态。"],
  ["Maker、Taker 费率和最高杠杆如何理解？", "Maker 是提供挂单流动性的成交，Taker 是主动吃单成交；负 Maker 费率表示返佣。表内是公开基础规则，账户等级、优惠和不同产品会影响实际费率。最高杠杆是部分市场的上限，实际可用倍数由币种、仓位规模和交易所风控决定。"],
  ["成交 / 持仓比例与气泡图怎么看？", "成交 / 持仓是 24h 成交量除以 OI。气泡图横纵轴都使用对数刻度，便于同时比较不同规模平台；气泡面积随 TVL 增大，空心圈表示 TVL 未提供。高比例可能与周转、行情或活动有关，单个指标不能确定成交质量。"],
];

function Methodology() {
  return <section className="pdb-panel pdb-methodology" aria-labelledby="pdb-methodology-title"><div className="pdb-panel-head"><div><span className="pdb-eyebrow">METHODOLOGY & FAQ</span><h2 id="pdb-methodology-title">统计口径与常见问题</h2></div></div><div>{questions.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></section>;
}

function PublicSources({ sources }: { sources: Snapshot["sources"] }) {
  return <footer className="pdb-sources" aria-labelledby="pdb-sources-title"><div className="pdb-sources-head"><div><span className="pdb-eyebrow">PUBLIC DATA SOURCES</span><h2 id="pdb-sources-title">公开数据来源 <small>{sources.filter(source => source.status === "live").length} 个来源已连接</small></h2></div></div><div className="pdb-source-marquee"><div className="pdb-source-track">{[false, true].map(duplicate => <div className="pdb-source-group" key={String(duplicate)} aria-hidden={duplicate || undefined}>{sources.map(source => <a key={source.id} href={safeUrl(source.url)} target="_blank" rel="noopener noreferrer" tabIndex={duplicate ? -1 : undefined} className={`pdb-source-chip is-${source.status}`} title={[source.error, source.updatedAt ? `来源更新于 ${time(source.updatedAt, true)}（北京时间）` : source.fetchedAt ? `读取于 ${time(source.fetchedAt, true)}（北京时间）` : "来源未提供更新时间"].filter(Boolean).join(" · ")}>{source.status === "live" ? <Check size={12} aria-hidden="true" /> : <CircleAlert size={12} aria-hidden="true" />}{source.name}<span>{source.status === "live" ? "已连接" : statusNames[source.status]}</span><ArrowUpRight size={11} aria-hidden="true" /></a>)}</div>)}</div></div></footer>;
}

export function PerpdexBox({ active = true }: { active?: boolean }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const snapshotRef = useRef<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    let disposed = false; let fetching = false; let resumeRequested = false; let controller: AbortController | null = null; let timer: ReturnType<typeof setTimeout> | undefined;
    const interval = () => Math.max(30, Math.min(600, finite(snapshotRef.current?.refreshIntervalSeconds) ? snapshotRef.current!.refreshIntervalSeconds : 600)) * 1000;
    async function refresh() {
      if (disposed || document.hidden) return;
      if (fetching) { resumeRequested = true; return; }
      fetching = true; resumeRequested = false; controller = new AbortController(); const request = controller;
      const timeout = window.setTimeout(() => request.abort("timeout"), 25000);
      setLoading(true);
      try {
        const response = await fetch("/api/hedge-ops/perpdex-box", { cache: "no-store", signal: request.signal });
        const result = readSnapshot(await response.json());
        if (!disposed && !request.signal.aborted) {
          if (response.ok || !snapshotRef.current) { snapshotRef.current = result; setSnapshot(result); }
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
  const rows = snapshot?.exchanges || [];
  const platforms = rows.filter(row => row.category !== "hip3");
  const totalOi = aggregate(platforms, "oiUsd");
  const totalVolume = aggregate(platforms, "volume24hUsd");
  const intervalSeconds = snapshot && finite(snapshot.refreshIntervalSeconds) ? Math.max(30, Math.min(600, snapshot.refreshIntervalSeconds)) : 600;
  const stale = Boolean(snapshot && (now - Date.parse(snapshot.generatedAt) > intervalSeconds * 2000 || snapshot.sources.some(source => source.status !== "live") || rows.some(row => row.status === "stale")));
  return <section className="perpdex-box" aria-label="Perpdex Box 永续交易所数据看板"><div className="pdb-page-head"><div><span className="pdb-eyebrow"><span className="pdb-lime-line" />PERPETUALS · MARKET INTELLIGENCE</span><h1>Perpdex Box <span>永续交易所排行榜</span></h1><p>持仓、成交量与流动性，一览 DEX、CEX 与 HIP-3 永续市场。</p></div><div className="pdb-page-actions"><span className={`pdb-live-pill ${error || stale ? "is-stale" : ""}`}><i />{loading && !snapshot ? "读取公开数据" : error ? "连接暂未确认" : stale ? "部分来源待更新" : snapshot ? "公开数据已连接" : "等待数据"}</span><button type="button" className="pdb-refresh" disabled={loading || !active} onClick={() => setRevision(value => value + 1)}><RefreshCw size={14} className={loading ? "pdb-spin" : ""} aria-hidden="true" />{loading ? "更新中" : "刷新数据"}</button></div></div>
    {error && <div className="pdb-notice is-error" role="status"><CircleAlert size={16} aria-hidden="true" /><span>{error}{snapshot && rows.some(row => row.oiUsd !== null || row.volume24hUsd !== null || row.tvlUsd !== null) ? " 已保留最近一次成功数据，以下数值不代表当前实时状态。" : snapshot ? " 行情字段暂缺，可继续查看公开规则资料。" : ""}</span><button type="button" disabled={loading} onClick={() => setRevision(value => value + 1)}>重试</button></div>}
    <div className="pdb-summary"><article><span className="pdb-summary-label"><BarChart3 size={15} aria-hidden="true" />合计持仓 OI</span><strong>{money(totalOi)}</strong><small>{platforms.filter(row => row.oiUsd !== null).length} 家平台有可用持仓数据 · 不重复统计 HIP-3</small></article><article><span className="pdb-summary-label"><BarChart3 size={15} aria-hidden="true" />合计 24h 成交量</span><strong>{money(totalVolume)}</strong><small>{platforms.filter(row => row.volume24hUsd !== null).length} 家平台有可用成交数据</small></article><article><span className="pdb-summary-label"><Database size={15} aria-hidden="true" />收录交易所</span><strong>{snapshot ? platforms.length : "—"}<em>家</em></strong><small>{snapshot ? `${rows.filter(row => row.category === "dex").length} DEX · ${rows.filter(row => row.category === "cex").length} CEX · 另列 ${rows.filter(row => row.category === "hip3").length} 个 HIP-3` : "正在读取公开来源"}</small></article><article className="pdb-summary-updated"><span className="pdb-summary-label"><Clock3 size={15} aria-hidden="true" />数据读取于</span><strong>{snapshot ? time(snapshot.generatedAt, true) : "—"}</strong><small>北京时间 · 每 {intervalSeconds % 60 === 0 ? `${intervalSeconds / 60} 分钟` : `${intervalSeconds} 秒`}自动更新</small></article></div>
    {loading && !snapshot ? <div className="pdb-loading" role="status"><RefreshCw size={22} className="pdb-spin" aria-hidden="true" /><strong>正在汇集永续交易所公开数据</strong><p>各平台接口独立读取，部分来源不可用时会单独标注。</p></div> : <><Rankings rows={rows} /><div className="pdb-chart-grid"><MarketShare rows={rows} /><BubbleChart rows={rows} /></div><ExchangeTable rows={rows} totalOi={totalOi} /></>}
    <Methodology />
    <PublicSources sources={snapshot?.sources || []} />
  </section>;
}
