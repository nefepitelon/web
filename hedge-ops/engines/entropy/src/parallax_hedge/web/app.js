'use strict';

const $ = (id) => document.getElementById(id);
const fmt = (v, d = 3) => (v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toFixed(d));
const cls = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : 'dim');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let costBps = 10;
let timer = null;
function consoleActive() {
  return typeof window === 'undefined' || typeof window.hedgeConsoleIsActive !== 'function' || window.hedgeConsoleIsActive();
}
function inactiveRead(error) {
  return !!error?.hedgeConsoleInactive || (error?.name === 'AbortError' && !consoleActive());
}
const reads = new Map();
const connection = { status: null, statusError: null, funding: null, fundingError: null };

function readChannel(name, action) {
  if (!consoleActive()) return Promise.resolve();
  if (reads.has(name)) return reads.get(name);
  const pending = Promise.resolve().then(action).finally(() => reads.delete(name));
  reads.set(name, pending);
  return pending;
}

async function readJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(12000), cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw Error(data.detail || data.error || `HTTP ${response.status}`);
  return data;
}

function renderConnection() {
  let title, detail, kind = '';
  const funding = connection.funding;
  if (connection.statusError) {
    title = '引擎连接中断'; detail = connection.statusError; kind = ' offline';
  } else if (!connection.status) {
    title = '正在检测引擎'; detail = '账户、行情与任务分别读取';
  } else if (connection.fundingError || funding?.error) {
    title = '引擎已连接 · 行情异常'; detail = connection.fundingError || funding.error; kind = ' degraded';
  } else if (!funding?.ready) {
    title = '引擎已连接 · 行情待就绪'; detail = '行情刷新中，账户与任务仍可查看'; kind = ' degraded';
  } else {
    const age = funding.generated_at ? Date.now() / 1000 - funding.generated_at : Infinity;
    const stale = age > (connection.status.stale_max_seconds || 180)
      || Object.values(funding.venues || {}).some(v => !v.ok || v.stale);
    title = stale ? '引擎已连接 · 行情有延迟' : '运行中';
    detail = `${funding.matched_count ?? 0} 个共有币种`; kind = stale ? ' degraded' : '';
  }
  $('conn-card').className = 'connection-card' + kind;
  $('conn-title').textContent = title;
  $('conn-sub').textContent = String(detail).slice(0, 160);
}

function tickClock() {
  $('clock').textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false });
}

function renderVenues(venues) {
  const names = { arcus: ['Arcus', 'Arcus Perps · 全仓'], entropy: ['Entropy', 'Hyperliquid io · 逐仓'] };
  $('venue-grid').innerHTML = Object.entries(venues || {}).map(([key, v]) => {
    const [title, sub] = names[key] || [key, ''];
    const state = !v.ok ? 'bad' : v.stale ? 'stale' : '';
    const label = !v.ok ? '离线' : v.stale ? `沿用 ${v.age_seconds}s 前` : '正常';
    return `<div class="venue-card ${state}">
      <header><span class="pulse-dot"></span><div><b>${esc(title)}</b></div><i>${esc(label)}</i></header>
      <div class="row"><span>${esc(sub)}</span></div>
      <div class="row"><span>网络出口</span><b>${esc(v.proxy)}</b></div>
      ${v.error ? `<div class="row"><span style="color:var(--amber)">${esc(v.error).slice(0, 90)}</span></div>` : ''}
    </div>`;
  }).join('');
}

function renderWarnings(list) {
  const box = $('period-warnings');
  if (!list || !list.length) { box.innerHTML = ''; box.style.display = 'none'; return; }
  box.style.display = '';
  box.innerHTML = list.map((w) =>
    `<p class="assumption-note" style="border-left-color:var(--red);border-color:rgba(255,109,122,.28);background:rgba(255,109,122,.05)">
      <b style="color:var(--red)">周期自检告警</b> ${esc(w)}
    </p>`).join('');
}

function renderPositions(snap) {
  const grid = $('pos-grid');
  const note = $('acct-note');
  const acct = snap.accounts || {};
  const missing = [];
  if (acct.arcus_configured === false) missing.push('Arcus 地址');
  if (acct.entropy_configured === false) missing.push('Entropy 主钱包地址');
  const errs = Object.entries(acct.errors || {});
  if (!Object.keys(acct).length) {
    note.textContent = '账户状态正在读取，持仓核实与行情刷新分别进行。';
  } else if (missing.length) {
    note.innerHTML = `尚未配置 ${esc(missing.join(' 和 '))} —— 在 .env 里填上即可读取持仓。`
      + ` <b style="color:var(--green)">这一步只读公开数据，不需要任何私钥。</b>`;
  } else if (errs.length) {
    note.innerHTML = errs.map(([k, v]) =>
      `<span style="color:var(--amber)">${esc(k)} 账户读取失败：${esc(v).slice(0, 110)}</span>`).join('<br>');
  } else {
    note.innerHTML = `两边账户读取正常。危险线：任一条腿距强平价小于 `
      + `<b>${esc(snap.liquidation_warn_pct)}%</b> —— `
      + `<b style="color:var(--amber)">处置动作是双腿同时平掉，绝不单腿止损</b>`
      + `（单腿平掉的瞬间，另一条腿就变成满仓裸单边）。`
      + `引擎只处理「轮换任务」里启用的币种。`;
  }

  const held = (snap.rows || []).filter((r) => r.position && r.position.status !== 'flat');
  $('pos-meta').textContent = held.length ? `${held.length} 个币种有持仓` : '当前空仓';
  if (!held.length) {
    if (!snap.ready || errs.length) {
      $('pos-meta').textContent = '持仓待核实';
      grid.innerHTML = '<div class="pos-empty">账户或行情尚未读全，当前持仓状态未知；请查看账户错误详情，面板会自动重试。</div>';
      return;
    }
    grid.innerHTML = '<div class="pos-empty">当前两边都没有持仓。'
      + '手动在两个所各开一笔小额反向仓，这里就会显示强平价和距离，用来核对数字读得对不对。</div>';
    return;
  }
  grid.innerHTML = held.map((r) => {
    const p = r.position;
    const legs = ['entropy', 'arcus'].map((v) => {
      const l = p[v];
      if (!l || !l.size) return '';
      const isRisk = p.riskiest_venue === v;
      const sane = l.liquidation_sane;
      return `<div class="leg ${isRisk ? 'risk' : 'safe'}">
        <span class="leg-venue">${v === 'entropy' ? 'ENTROPY' : 'ARCUS'}</span>
        <span class="leg-main">${esc(l.side)} ${fmt(Math.abs(l.size), 4)}
          <small>开仓 ${fmt(l.entry_price, 4)} · 标记 ${fmt(l.mark_price, 4)} · 强平 ${fmt(l.liquidation_price, 4)}${sane ? '' : ' ⚠方向异常'}</small></span>
        <span class="leg-dist">${l.distance_pct === null ? '—' : fmt(l.distance_pct, 2) + '%'}
          <small>距强平</small></span>
      </div>`;
    }).join('');
    return `<div class="pos-card ${esc(p.status)}">
      <header><b>${esc(r.asset)}</b><i>${esc(p.status_text)}</i></header>
      <div class="pos-sub">净敞口 ${fmt(p.net_size, 4)} · 浮盈亏 ${fmt(p.total_unrealized, 2)} USDC${p.is_hedged ? ' · 对冲完好' : ''}</div>
      ${legs}
    </div>`;
  }).join('');
}

function renderStats(s) {
  const tradable = (s.rows || []).filter((r) => r.tradable);
  const best = tradable[0];
  const cards = [
    ['共有币种', s.matched_count ?? 0, 'MATCHED', `两所交集 ${s.market_count ?? 0} 个市场`],
    ['可交易', tradable.length, 'TRADABLE', s.suspect_count ? `${s.suspect_count} 个存疑已排除` : '全部通过合理性检查'],
    ['最优净费率', best ? fmt(best.net_bps_per_hour, 3) : '—', 'BPS/H', best ? `${best.asset} · ${best.direction_label}` : '等待数据'],
    ['最优年化', best ? fmt(best.apr_pct, 1) + '%' : '—', 'APR', best && best.breakeven_hours ? `回本约 ${fmt(best.breakeven_hours, 1)} 小时` : '—'],
  ];
  $('stats-grid').innerHTML = cards.map(([label, value, unit, foot]) => `
    <div class="stat-card">
      <div class="stat-top"><span>${esc(label)}</span><i>${esc(unit)}</i></div>
      <div class="stat-value">${esc(value)}</div>
      <div class="stat-foot"><span class="trend neutral">●</span><span>${esc(foot)}</span></div>
    </div>`).join('');
}

function renderTable(rows) {
  const body = $('funding-body');
  if (!rows || !rows.length) {
    body.innerHTML = '<tr><td colspan="9" class="dim" style="text-align:center;padding:40px">暂无数据</td></tr>';
    return;
  }
  body.innerHTML = rows.map((r) => {
    const dirCls = r.direction === 'long_entropy_short_arcus' ? 'long-entropy' : 'short-entropy';
    const blocked = !r.tradable;
    return `<tr class="${blocked ? 'blocked' : ''}">
      <td><div class="asset-cell"><b>${esc(r.asset)}</b><small>${esc(r.entropy_symbol)} / ${esc(r.arcus_symbol)}${r.off_hours ? ' · 休市中（Arcus 杠杆上限降低）' : ''}</small></div></td>
      <td class="${cls(r.entropy_bps_per_hour)}">${fmt(r.entropy_bps_per_hour)}</td>
      <td class="${cls(r.arcus_bps_per_hour)}">${fmt(r.arcus_bps_per_hour)}</td>
      <td class="${cls(r.net_bps_per_hour)}"><b>${fmt(r.net_bps_per_hour)}</b></td>
      <td>${blocked
        ? `<span class="warn-badge" title="${esc(r.reason)}">存疑</span>`
        : `<span class="dir-pill ${dirCls}">${esc(r.direction_label)}</span>`}</td>
      <td class="${cls(r.apr_pct)}">${fmt(r.apr_pct, 1)}%</td>
      <td class="${cls(r.net_bps_per_day)}">${fmt(r.net_bps_per_day, 2)}</td>
      <td class="${r.breakeven_hours && r.breakeven_hours < 24 ? 'pos' : 'dim'}">${r.breakeven_hours ? fmt(r.breakeven_hours, 1) : '—'}</td>
      <td class="dim">${esc(r.max_leverage)}×</td>
    </tr>`;
  }).join('');
}

function load(force) { return readChannel('funding', () => fundingRead(force)); }
async function fundingRead(force) {
  const btn = $('refresh-button');
  btn.classList.add('rotating');
  try {
    const s = await readJson(`/api/funding?cost_bps=${encodeURIComponent(costBps)}${force ? '&refresh=true' : ''}`);
    connection.funding = s; connection.fundingError = null;
    renderConnection();
    renderVenues(s.venues);
    renderPositions(s);
    if (s.error) {
      renderTable([]);
      renderStats(s);
      $('table-meta').textContent = '行情读取失败：' + String(s.error).slice(0, 160);
      return;
    }
    $('nav-count').textContent = s.matched_count ?? 0;
    $('table-meta').textContent = s.generated_at
      ? new Date(s.generated_at * 1000).toLocaleTimeString('zh-CN', { hour12: false }) + ' 更新'
      : '首次行情读取中';
    renderWarnings(s.period_warnings);
    renderStats(s);
    renderTable(s.rows);
    if (!assets.length) loadSpreads();
    $('system-dump').textContent = JSON.stringify({ ...s, rows: `(${(s.rows || []).length} 行，见表格)` }, null, 2);
  } catch (e) {
    if (inactiveRead(e)) return;
    connection.fundingError = String(e.message || e);
    renderConnection();
    $('table-meta').textContent = '行情读取失败，已保留上次展示：' + connection.fundingError.slice(0, 160);
  } finally {
    btn.classList.remove('rotating');
  }
}


// ── 账户与交易统计 ───────────────────────────────────────
const money = (v, d = 2) => (v === null || v === undefined || Number.isNaN(Number(v))
  ? '—'
  : (Number(v) < 0 ? '-$' : '$') + Math.abs(Number(v)).toLocaleString('en-US',
      { minimumFractionDigits: d, maximumFractionDigits: d }));
const signed = (v, d = 2) => (v === null || v === undefined || Number.isNaN(Number(v))
  ? '—' : (Number(v) > 0 ? '+' : '') + money(v, d));
const hhmm = (ts) => new Date(ts * 1000).toLocaleString('zh-CN',
  { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });

function feeCell(v) {
  // 一笔都还没核对上时显示「—」，别让还不知道的手续费看起来像 $0.00
  if (v.fee_unknown > 0 && v.fee_unknown >= v.fills) return ['—', `${v.fee_unknown} 笔待交易所核对`];
  const main = money(v.fees, 2);
  return v.fee_unknown > 0 ? [main, `另有 ${v.fee_unknown} 笔待核对`] : [main, ''];
}
const MODE_LABEL = { ISOLATED: '逐仓', CROSS: '全仓', 'CROSS/ISOLATED': '全仓+逐仓',
  standard: '普通账户', unifiedAccount: '统一账户', portfolioMargin: '组合保证金' };

// 净损益 / 磨损：按「已经平掉的完整轮次」算，每平一次仓就更新（v1.6）
function roundNet(r) { return r && r.net_pnl !== null && r.net_pnl !== undefined ? signed(r.net_pnl) : '—'; }
function roundWear(r) { return r && r.wear_per_10k !== null && r.wear_per_10k !== undefined ? money(r.wear_per_10k) : '—'; }
function roundsNote(r) {
  if (!r || !r.rounds) return '平过仓后才有';
  return `已完成 ${r.rounds} 轮` + (r.fee_estimated ? ` · ${r.fee_estimated} 笔费估算` : '');
}

function ledgerCard(title, sub, bal, v, opts = {}) {
  const [fee, feeNote] = feeCell(v);
  const cells = opts.total
    ? [
        ['可用', bal ? money(bal.available) : '—', ''],
        ['浮动盈亏', bal ? signed(bal.unrealized_pnl) : '—', '', bal ? cls(bal.unrealized_pnl) : ''],
        ['交易量', money(v.volume, 0), `${v.fills} 笔成交`],
        ['手续费', fee, feeNote],
        ['净损益', roundNet(opts.rounds), roundsNote(opts.rounds),
          opts.rounds && opts.rounds.net_pnl !== null ? cls(opts.rounds.net_pnl) : ''],
        ['每万美元磨损', roundWear(opts.rounds),
          opts.rounds && opts.rounds.wear_per_10k !== null ? '每平一次仓更新' : '还没有平过仓'],
      ]
    : [
        ['可用', bal ? money(bal.available) : '—', ''],
        ['浮动盈亏', bal ? signed(bal.unrealized_pnl) : '—', '', bal ? cls(bal.unrealized_pnl) : ''],
        ['持仓', bal ? `${bal.open_positions} 个` : '—', bal && bal.mode ? (MODE_LABEL[bal.mode] || bal.mode) : ''],
        ['交易量', money(v.volume, 0), ''],
        ['手续费', fee, feeNote],
        ['成交', `${v.fills} 笔`, v.pending ? `${v.pending} 笔对账中` : (v.estimated ? `${v.estimated} 笔为估算` : '')],
      ];
  return `<div class="ledger-card${opts.total ? ' total' : ''}">
    <header><span class="venue-logo ${opts.logo || ''}">${esc(opts.mark || '∑')}</span>
      <div><b>${esc(title)}</b><small>${esc(sub)}</small></div>
      <i class="${bal ? '' : 'offline'}">${bal ? '账户权益' : esc(opts.readLabel || '读取中')}</i></header>
    <div class="ledger-equity">${bal ? money(bal.equity) : '—'}<small>USDC</small></div>
    <div class="ledger-cells">${cells.map(([k, val, note, c]) => `<div>
      <span>${esc(k)}</span><b class="${c || ''}">${esc(val)}</b>${note ? `<small>${esc(note)}</small>` : ''}
    </div>`).join('')}</div>
  </div>`;
}

function renderLedger(s) {
  const L = s.ledger || {};
  const venues = L.venues || {};
  const bal = s.balances || {};
  const empty = { volume: 0, fees: 0, fee_unknown: 0, fills: 0, pending: 0, estimated: 0,
                  net_pnl: null, wear_per_10k: null };
  const readLabel = venue => s.account_errors?.[venue] ? '读取失败' : s.account_pending ? '读取中' : '账户待确认';
  $('ledger-grid').innerHTML = [
    ledgerCard('Entropy', 'Hyperliquid io · 逐仓', bal.entropy, venues.entropy || empty,
      { logo: 'entropy-logo', mark: 'E', readLabel: readLabel('entropy') }),
    ledgerCard('Arcus', 'Arcus Perps · 全仓', bal.arcus, venues.arcus || empty,
      { logo: 'arcus-logo', mark: 'A', readLabel: readLabel('arcus') }),
    ledgerCard('合计', '两边加总 · 全部任务', bal.total, L.total || empty,
      { total: true, rounds: L.rounds, readLabel: Object.keys(s.account_errors || {}).length ? '读取未完成' : '读取中' }),
  ].join('');

  const total = L.total || empty;
  const rec = s.reconciler || {};
  const meta = [];
  const readTimes = Object.values(s.account_read_at || {}).filter(v => Number.isFinite(v) && v > 0);
  if (readTimes.length) meta.push('账户上次成功读取 ' + new Date(Math.min(...readTimes) * 1000).toLocaleTimeString('zh-CN', { hour12: false }));
  const attempts = Object.values(s.account_attempt_at || {}).filter(v => Number.isFinite(v) && v > 0);
  if (Object.keys(s.account_errors || {}).length && attempts.length) {
    meta.push('最新尝试 ' + new Date(Math.max(...attempts) * 1000).toLocaleTimeString('zh-CN', { hour12: false }));
  }
  if (L.since) meta.push(`统计起点 ${hhmm(L.since)}`);
  if (total.pending) meta.push(`${total.pending} 笔对账中`);
  if (rec.at) meta.push(`上次对账 ${new Date(rec.at * 1000).toLocaleTimeString('zh-CN', { hour12: false })}`);
  $('ledger-meta').textContent = meta.join(' · ') || (s.dry_run ? '演练模式' : '还没有成交');

  const notes = [];
  if (s.dry_run) notes.push('<b>演练模式</b>：这里的交易量是模拟成交（按盘口参考价计），没有真实手续费。');
  Object.entries(s.account_errors || {}).forEach(([k, v]) => {
    const at = s.account_attempt_at?.[k];
    const attempt = at ? `（最近尝试 ${new Date(at * 1000).toLocaleTimeString('zh-CN', { hour12: false })}）` : '';
    notes.push(`<b>${esc(k)} 账户读取失败${esc(attempt)}</b>：${esc(String(v).slice(0, 120))}`);
  });
  (rec.errors || []).forEach((e) => notes.push(`<b>对账</b>：${esc(String(e).slice(0, 160))}`));
  const note = $('ledger-note');
  note.style.display = notes.length ? '' : 'none';
  note.innerHTML = notes.join('<br>');

  const enabled = {};
  (s.tasks || []).forEach((t) => { enabled[t.asset] = t.enabled; });
  const byAsset = L.by_asset || {};
  const names = Array.from(new Set([...Object.keys(byAsset), ...Object.keys(enabled)])).sort();
  $('ledger-body').innerHTML = names.length
    ? names.map((a) => {
        const r = byAsset[a] || { entropy: empty, arcus: empty, total: { ...empty, realized_pnl: 0, pnl_unknown: 0 }, opens: 0 };
        const t = r.total;
        const state = a in enabled ? (enabled[a] ? '' : '<small class="dim">（已停用）</small>')
                                   : '<small class="dim">（任务已删除）</small>';
        const [fee, feeNote] = feeCell(t);
        const rd = r.rounds;
        const rdTip = rd ? `已完成 ${rd.rounds} 轮（两边平仓后计入）`
          + (rd.skipped ? `；${rd.skipped} 轮数据不全已跳过` : '')
          + (rd.fee_estimated ? `；${rd.fee_estimated} 笔手续费为估算` : '')
          + (rd.in_progress ? '；当前持仓这一轮平仓后计入' : '') : '';
        return `<tr>
          <td><div class="asset-cell"><b>${esc(a)}</b>${state}</div></td>
          <td>${esc(r.opens)}</td>
          <td>${money(r.entropy.volume, 0)}</td>
          <td>${money(r.arcus.volume, 0)}</td>
          <td><b>${money(t.volume, 0)}</b></td>
          <td title="${esc(feeNote)}">${fee}${t.fee_unknown ? ' <span class="dim">*</span>' : ''}</td>
          <td title="${esc(rdTip)}" class="${rd && rd.rounds ? cls(rd.spread_pnl) : 'dim'}">${rd && rd.rounds ? signed(rd.spread_pnl) : '—'}</td>
          <td title="${esc(rdTip)}" class="${rd && rd.net_pnl !== null ? cls(rd.net_pnl) : 'dim'}">${roundNet(rd)}</td>
          <td title="${esc(rdTip)}" class="${rd && rd.wear_per_10k !== null ? '' : 'dim'}">${roundWear(rd)}</td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="9" class="dim" style="text-align:center;padding:26px">还没有成交记录。</td></tr>';
}

// ── 侧栏：日交易量仪表盘 ─────────────────────────
function usdShort(v) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return '—';
  const n = Number(v);
  if (n >= 1e8) return '$' + (n / 1e8).toFixed(2) + '亿';
  if (n >= 1e4) return '$' + (n / 1e4).toFixed(n >= 1e6 ? 0 : 1) + '万';
  return '$' + n.toFixed(0);
}

function gaugePoint(frac, radius) {
  const a = Math.PI * (1 - Math.min(1, Math.max(0, frac)));   // 左 = 0，右 = 满
  return [110 + radius * Math.cos(a), 110 - radius * Math.sin(a)];
}

function loadCapacity() { return readChannel('capacity', capacityRead); }
async function capacityRead() {
  let c;
  try { c = await readJson('/api/capacity'); } catch (e) {
    if (inactiveRead(e)) return;
    $('gauge-pct').textContent = '估算读取失败';
    return;
  }
  const cur = Number(c.current_daily) || 0;
  const max = Number(c.max_daily) || 0;
  const actual = Number(c.actual_24h) || 0;
  const scale = Math.max(max, cur, actual) || 1;
  const frac = cur / scale;
  $('gauge-fill').setAttribute('stroke-dasharray', `${(frac * 100).toFixed(2)} 100`);
  $('gauge-needle').setAttribute('transform', `rotate(${(-90 + 180 * frac).toFixed(2)} 110 110)`);
  // 刻度：0、25%、50%、75%、100% 的理论上限
  $('gauge-ticks').innerHTML = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const [x1, y1] = gaugePoint(f, 98); const [x2, y2] = gaugePoint(f, 104);
    // 两端的数字写在弧线端点正下方，不出卡片边界
    const label = f === 0 || f === 1 ? `<text class="gauge-tick-label" x="${f === 0 ? 20 : 200}" y="126" text-anchor="middle">${f === 0 ? '0' : usdShort(scale)}</text>` : '';
    return `<line class="gauge-tick" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" />${label}`;
  }).join('');
  const mark = $('gauge-actual');
  if (actual > 0) {
    const [x1, y1] = gaugePoint(actual / scale, 80); const [x2, y2] = gaugePoint(actual / scale, 100);
    mark.setAttribute('x1', x1.toFixed(1)); mark.setAttribute('y1', y1.toFixed(1));
    mark.setAttribute('x2', x2.toFixed(1)); mark.setAttribute('y2', y2.toFixed(1));
    mark.style.display = '';
  } else { mark.style.display = 'none'; }
  $('gauge-current').textContent = usdShort(cur);
  $('gauge-max').textContent = max > 0 ? usdShort(max) + ' / 天' : '—';
  $('gauge-actual-text').textContent = usdShort(actual);
  $('gauge-pct').textContent = max > 0 ? `占上限 ${(cur / max * 100).toFixed(1)}%` : '—';
  const lines = ['【当前任务预估】两所合计 = 每天轮数 × 4 × 单边金额'];
  (c.tasks || []).forEach((t) => lines.push(
    `  ${t.asset}：单边 ${usdShort(t.notional)}（${t.notional_source}）× 每天 ${Number(t.rounds_per_day).toFixed(1)} 轮`
    + `（持有 ${Number(t.hold_hours).toFixed(2)}h + 开销 ${Math.round(t.overhead_seconds)}s）≈ ${usdShort(t.daily_volume)}`));
  if (!(c.tasks || []).length) lines.push('  没有启用中的任务');
  lines.push('', '【理论上限】两边最大杠杆 + 全部权益，同时守住开仓门槛（离强平 ≥ 设定值）');
  lines.push(`  两边各能同时持有 ${usdShort(c.max_notional)}，被 ${c.max_binding || '—'} 卡住`);
  lines.push(`  按最短轮换 0.1 小时、吃单开平，每天约 ${Number(c.max_rounds_per_day || 0).toFixed(0)} 轮`);
  lines.push(`  Entropy 权益 ${usdShort(c.equity?.entropy)}，Arcus 权益 ${usdShort(c.equity?.arcus)}`);
  lines.push('', '青色刻度 = 近 24 小时实际成交（两所合计）。以上都是估算，不影响交易。');
  $('gauge-card').title = lines.join('\n');
}

function loadStats() { return readChannel('stats', statsRead); }
async function statsRead() {
  try {
    const s = await readJson('/api/stats');
    renderLedger(s);
  } catch (e) {
    if (inactiveRead(e)) return;
    $('ledger-meta').textContent = '统计读取失败 · 已保留上次展示';
    const note = $('ledger-note');
    note.style.display = '';
    note.textContent = '账户与统计接口读取失败：' + String(e.message || e).slice(0, 180);
  }
}

// ── 轮换任务 ─────────────────────────────────────────────
let assets = [];
let spreadSignature = '';

// 币种下拉：按两所价差从窄到宽排（后台每 10 分钟扫一次）。
// 挂单模式按 Entropy 价差排（Arcus 那边是挂单，不付价差），吃单模式按两边之和排。
function loadSpreads() { return readChannel('spreads', spreadsRead); }
async function spreadsRead() {
  try {
    const r = await readJson('/api/spreads');
    const list = r.assets || [];
    const label = (x) => {
      if (x.total_bps === undefined) return `${x.asset}  · 价差待扫描`;
      const main = r.maker ? x.entropy_bps : x.total_bps;
      return `${x.asset}  · ${fmt(main, 2)} bps（E ${fmt(x.entropy_bps, 2)} / A ${fmt(x.arcus_bps, 2)}）`;
    };
    const sig = list.map(label).join('|');
    if (!list.length || sig === spreadSignature) return;
    spreadSignature = sig;
    assets = list.map((x) => x.asset);
    const sel = $('f-asset');
    const keep = sel.value;
    sel.innerHTML = list.map((x) => `<option value="${esc(x.asset)}">${esc(label(x))}</option>`).join('');
    if (keep && assets.includes(keep)) sel.value = keep;
    const hint = $('spread-hint');
    if (hint) {
      hint.textContent = r.scanned_at
        ? `按${r.maker ? ' Entropy ' : '两所合计'}价差从窄到宽排序 · ${new Date(r.scanned_at * 1000).toLocaleTimeString('zh-CN', { hour12: false })} 扫描`
        : (r.scanning ? '正在扫描两所价差…' : '价差扫描将在启动后约 15 秒开始');
    }
  } catch (e) { /* 下拉框不该因为这个崩掉 */ }
}
let formTouched = false;

function fillFormFromTask(tasks) {
  // 选中已有任务时把它的设置带进表单，免得改一个字段时把别的字段覆盖成默认值
  if (formTouched) return;
  const task = tasks.find((t) => t.asset === $('f-asset').value);
  if (!task) { $('f-order-type').value = orderTypeOf(null); return; }
  $('f-leverage').value = task.leverage;
  $('f-rotation').value = task.rotation_hours;
  $('f-rotation-max').value = task.rotation_hours_max ?? '';
  $('f-notional').value = task.notional_usdc ?? '';
  $('f-notional-max').value = task.notional_usdc_max ?? '';
  $('f-order-type').value = orderTypeOf(task);
}

// 任务没单独设过就跟随 .env 的 ARCUS_MAKER
let defaultMaker = false;
function orderTypeOf(task) {
  if (task && (task.arcus_order_type === 'limit' || task.arcus_order_type === 'market')) return task.arcus_order_type;
  return defaultMaker ? 'limit' : 'market';
}

// 两边此刻真正用的杠杆：各自不超过该所上限（Arcus 美股休市时上限会降）
function levSub(task) {
  const e = task.effective_leverage;
  if (!e || (e.entropy === Number(task.leverage) && e.arcus === Number(task.leverage))) return '杠杆';
  return `实际 E ${e.entropy}× · A ${e.arcus}×`;
}
function levTip(task) {
  const e = task.effective_leverage;
  if (!e) return '';
  const safe = e.entropy_safe ? `，逐仓守住 ${e.min_corridor_pct}% 开仓门槛最多 ${e.entropy_safe}×` : '';
  return `任务设 ${task.leverage}×；Entropy 上限 ${e.entropy_max ? Math.floor(e.entropy_max) + '×' : '未知'}${safe}，`
    + `Arcus 当前上限 ${e.arcus_max ? Math.floor(e.arcus_max) + '×' : '未知'}（美股等品种休市时会降低）。`
    + 'Arcus 按 min(任务值, 上限) 设全仓；Entropy 只能逐仓，按 min(任务值, 上限, 守门槛杠杆) 设。';
}

function amountText(task) {
  const lo = task.notional_usdc, hi = task.notional_usdc_max;
  if (!lo) return '开满';
  if (hi && Number(hi) > Number(lo)) return `${esc(lo)}–${esc(hi)} U`;
  return `${esc(lo)} U`;
}

function renderUnmanaged(list) {
  const boxes = ['unmanaged-warn', 'unmanaged-warn-top'].map((id) => $(id)).filter(Boolean);
  if (!boxes.length) return;
  if (!list || !list.length) {
    boxes.forEach((b) => { b.innerHTML = ''; b.style.display = 'none'; });
    return;
  }
  const html = list.map((u) => {
    const dist = u.min_distance_pct === null || u.min_distance_pct === undefined
      ? '—' : fmt(u.min_distance_pct, 2) + '%';
    return `<p class="assumption-note" style="border-left-color:var(--red);border-color:rgba(255,109,122,.3);background:rgba(255,109,122,.06)">
      <b style="color:var(--red)">${esc(u.asset)} 有持仓，但没有启用中的任务在管它。</b>
      当前状态「${esc(u.status_text || '')}」，距强平 ${esc(dist)}。
      面板会标红，但<b>引擎不会对它动手</b> —— 引擎只处理下面列表里启用的币种。
      要让程序接管，就给它建一个任务并启用；否则请自己盯着或手动平掉。
    </p>`;
  }).join('');
  boxes.forEach((b) => { b.style.display = ''; b.innerHTML = html; });
}

function planChip(plan, urgent) {
  const map = { open: ['on', '已开仓'], close: ['hold', '已平仓'], idle: ['off', '闲置'],
                blocked: ['blocked', '受阻'], flatten_orphan: ['urgent', '孤腿抢救'],
                open_failed: ['urgent', '开仓失败'], close_failed: ['urgent', '平仓失败'],
                flatten_orphan_failed: ['urgent', '抢救失败'],
                adopt: ['hold', '接管'], ledger: ['off', '账本'], rebase: ['off', '基准重设'],
                maker_wait: ['off', '未成交'], maker_started: ['hold', '挂单中'],
                maker_busy: ['hold', '挂单中'],
                topup: ['on', '已补仓'], topup_failed: ['urgent', '补仓失败'],
                topup_stop: ['hold', '叫停补仓'],
                error: ['urgent', '出错'] };
  const [cls, text] = map[plan] || ['off', plan];
  return `<span class="chip ${urgent ? 'urgent' : cls}">${esc(text)}</span>`;
}

function loadTasks() { return readChannel('tasks', tasksRead); }
async function tasksRead() {
  try {
    const t = await readJson('/api/tasks');
    const pill = $('mode-pill');
    if (pill) {
      pill.className = 'mode-pill' + (t.dry_run ? '' : ' live');
      pill.querySelector('b').textContent = t.dry_run ? '演练 · 不下单' : '实盘 · 会下单';
    }
    renderUnmanaged(t.unmanaged);
    defaultMaker = !!t.maker;
    const banner = $('dry-banner');
    banner.className = 'dry-banner' + (t.dry_run ? '' : ' live');
    banner.innerHTML = t.dry_run
      ? `<b>演练模式</b> —— 引擎照常做全部判断并记录意图，但<b>不会提交任何订单</b>。`
        + (t.maker ? ` 挂单模式已开（演练里仍按吃单模拟成交）。` : '')
        + ` 开仓门槛：离强平 ≥ ${esc(t.min_corridor_pct)}%；平仓线 ${esc(t.close_corridor_pct)}%；每 ${esc(t.cycle_seconds)} 秒一轮。`
        + ` 确认判断无误后，把 .env 里的 DRY_RUN 改成 false 再重启。`
      : `<b>实盘模式</b> —— 引擎会真实下单。`
        + `Arcus 下单方式按任务设置（没单独设的任务：${t.maker ? '限价挂单' : '市价吃单'}）。`
        + `Arcus 限价挂单 0 手续费（Entropy 对冲腿照常付吃单费），每次最多等 ${esc(t.maker_wait_seconds)} 秒，在后台等；风控平仓一律立刻吃单。`
        + (t.bell ? (t.bell.healthy ? ' 成交推送：<b style="color:var(--green)">已连接</b>（成交后立刻对冲）。'
                                    : ' 成交推送：<b style="color:var(--amber)">未连接</b>，已退回每 0.5 秒查一次成交。') : '')
        + `开仓门槛 ${esc(t.min_corridor_pct)}%，平仓线 ${esc(t.close_corridor_pct)}%，`
        + ` 每 ${esc(t.cycle_seconds)} 秒一轮。`;

    $('nav-tasks').textContent = (t.tasks || []).length;
    const byAsset = {};
    (t.decisions || []).forEach((d) => { byAsset[d.asset] = d; });

    $('task-list').innerHTML = (t.tasks || []).length
      ? t.tasks.map((task) => {
          const d = byAsset[task.asset];
          const held = task.opened_at
            ? ((Date.now() / 1000 - task.opened_at) / 3600).toFixed(2) + ' 小时'
            : '空仓';
          const lo = Number(task.rotation_hours);
          const hi = task.rotation_hours_max ? Number(task.rotation_hours_max) : lo;
          const random = hi > lo;
          // 和调度器同一个口径：抽到的时长夹进【当前】区间
          const draw = task.hold_hours === null || task.hold_hours === undefined
            ? null : Math.min(Math.max(Number(task.hold_hours), lo), hi);
          const rotation = random ? `${esc(lo)}–${esc(hi)}h` : `${esc(lo)}h`;
          const rotationSub = random
            ? (task.opened_at && draw !== null ? `本轮随机 ${draw.toFixed(2)}h` : '随机轮换')
            : '轮换周期';
          return `<div class="task-row">
            <div><b>${esc(task.asset)}</b></div>
            <div>${esc(task.leverage)}×<div class="muted" title="${esc(levTip(task))}">${levSub(task)}</div></div>
            <div>${amountText(task)}<div class="muted">${orderTypeOf(task) === 'limit' ? 'Arcus 限价挂单' : 'Arcus 市价吃单'}</div></div>
            <div>${rotation}<div class="muted">${esc(rotationSub)}</div></div>
            <div>${esc(held)}<div class="muted">${task.open_direction ? esc(task.open_direction.startsWith('long') ? 'Entropy 多' : 'Entropy 空') : '当前持仓'}</div></div>
            <div>${task.corridor_at_open ? fmt(task.corridor_at_open, 2) + '%' : '—'}<div class="muted">开仓走廊</div></div>
            <div>${d ? planChip(d.plan, d.urgent) : ''}<div class="muted" title="${esc(d?.reason || '')}">${esc((d?.reason || '').slice(0, 40))}</div></div>
            <div style="display:flex;gap:6px">
              <button class="mini-btn" data-toggle="${esc(task.asset)}" data-on="${task.enabled ? 0 : 1}">${task.enabled ? '停用' : '启用'}</button>
              <button class="mini-btn danger" data-del="${esc(task.asset)}">删</button>
            </div>
          </div>`;
        }).join('')
      : '<div class="pos-empty">还没有任务。上面选个币种、设好杠杆和轮换周期就能建。</div>';
    fillFormFromTask(t.tasks || []);

    $('task-list').title = t.market_parameters_error
      ? '市场杠杆参数暂未更新：' + t.market_parameters_error : '';
  } catch (e) {
    if (inactiveRead(e)) return;
    $('dry-banner').className = 'dry-banner';
    $('dry-banner').textContent = '任务读取失败，已保留上次列表与输入：' + String(e.message || e).slice(0, 180);
  }
}

let confirmedCycleHtml = '';
function loadCycles() { return readChannel('cycles', cyclesRead); }
async function cyclesRead() {
  try {
    const c = await readJson('/api/cycles?limit=40');
    $('cycle-log').title = '';
    confirmedCycleHtml = (c.cycles || []).length
      ? c.cycles.map((x) => `<div class="log-line">
          <time>${new Date(x.created_at * 1000).toLocaleTimeString('zh-CN', { hour12: false })}</time>
          <span>${esc(x.asset)}</span>
          <span>${planChip(x.plan, x.urgent)} ${esc(x.reason || '')}</span>
        </div>`).join('')
      : '<div class="pos-empty">暂无执行记录。</div>';
    $('cycle-log').innerHTML = confirmedCycleHtml;
  } catch (e) {
    if (inactiveRead(e)) return;
    const error = '执行记录读取失败，保留上次记录：' + String(e.message || e).slice(0, 180);
    $('cycle-log').title = error;
    $('cycle-log').innerHTML = `<p class="assumption-note" role="status">${esc(error)}</p>` + confirmedCycleHtml;
  }
}

document.addEventListener('click', async (ev) => {
  const t = ev.target.closest('[data-toggle]');
  const d = ev.target.closest('[data-del]');
  if (t) {
    await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset: t.dataset.toggle, enabled: t.dataset.on === '1' }) });
    loadTasks();
  } else if (d) {
    const res = await fetch('/api/tasks/' + encodeURIComponent(d.dataset.del), { method: 'DELETE' });
    if (!res.ok) alert((await res.json()).detail || '删除失败');
    loadTasks();
  }
});

$('f-save').addEventListener('click', async () => {
  const lo = Number($('f-rotation').value);
  const hiRaw = $('f-rotation-max').value.trim();
  const hi = hiRaw === '' ? null : Number(hiRaw);
  if (!(lo > 0)) { alert('轮换周期最短值必须大于 0'); return; }
  if (hi !== null && !(hi >= lo)) { alert(`最长 ${hi} 小时不能小于最短 ${lo} 小时`); return; }
  const body = {
    asset: $('f-asset').value,
    leverage: Number($('f-leverage').value),
    rotation_hours: lo,
    rotation_hours_max: hi,
    notional_usdc: $('f-notional').value === '' ? null : Number($('f-notional').value),
    notional_usdc_max: $('f-notional-max').value === '' ? null : Number($('f-notional-max').value),
    arcus_order_type: $('f-order-type').value,
  };
  if (body.notional_usdc_max !== null && body.notional_usdc === null) { alert('填了开仓金额最大值，就必须同时填最小值'); return; }
  if (body.notional_usdc_max !== null && !(body.notional_usdc_max >= body.notional_usdc)) {
    alert(`开仓金额最大 ${body.notional_usdc_max} 不能小于最小 ${body.notional_usdc}`); return; }
  const res = await fetch('/api/tasks', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) { alert((await res.json()).detail || '保存失败'); return; }
  formTouched = false;
  loadTasks();
});

['f-leverage', 'f-rotation', 'f-rotation-max', 'f-notional', 'f-notional-max'].forEach((id) =>
  $(id).addEventListener('input', () => { formTouched = true; }));
$('f-order-type').addEventListener('change', () => { formTouched = true; });
$('f-asset').addEventListener('change', () => { formTouched = false; loadTasks(); });

$('run-preflight').addEventListener('click', async () => {
  const btn = $('run-preflight');
  const box = $('preflight-box');
  btn.textContent = '检查中…';
  try {
    const r = await fetch('/api/preflight', { method: 'POST' }).then((x) => x.json());
    const mark = (ok) => ok
      ? '<span style="color:var(--green)">通过</span>'
      : '<span style="color:var(--red)">未过</span>';
    const checks = (r.checks || []).map((c) => `<div class="log-line">
      <span>${mark(c.ok)}</span><span>${esc(c.name)}</span><span>${esc(c.detail)}</span>
    </div>`).join('');
    const plans = (r.plans || []).map((p) => `<div class="log-line">
      <span>${mark(p.ok)}</span><span>${esc(p.asset)}${p.enabled ? '' : '（停用）'}</span>
      <span>${p.quantity !== undefined
        ? `${esc(p.direction_label || '')} 数量 <b>${fmt(p.quantity, 6)}</b>`
          + (p.entropy_leverage ? ` · 杠杆 E ${esc(p.entropy_leverage)}× / A ${esc(p.arcus_leverage)}×` : '')
          + ` · 名义 ${fmt(p.notional, 2)} USDC · 走廊 ${fmt(p.corridor_pct, 2)}%`
          + ` · 最小量 ${esc(p.min_quantity)}`
          + (p.aligned ? '' : ' <b style="color:var(--red)">数量未对齐精度</b>')
          + ` — ${esc(p.detail)}`
        : esc(p.detail)}</span>
    </div>`).join('');
    box.style.display = '';
    box.innerHTML = `<div class="panel" style="padding:18px 20px">
      <header class="panel-header compact">
        <div><span class="kicker">PREFLIGHT</span><h2>实盘预检</h2></div>
        <span class="chip ${r.ready ? 'on' : 'urgent'}">${esc(r.summary)}</span>
      </header>
      <div style="margin-top:12px">${checks}${plans}</div>
      <p class="acct-note" style="margin-top:14px">
        预检【不会下任何单】。全部通过之后，把 .env 里的 <b>DRY_RUN 改成 false</b> 并重启，
        才会真正下单。建议第一次把「开仓金额」设到 20~30 USDC，用一轮真实开平
        把签名、精度、报文这层走通 —— 成本约 8 bps，也就是两三分钱。
      </p>
    </div>`;
  } catch (e) {
    box.style.display = '';
    box.innerHTML = `<p class="assumption-note">预检失败：${esc(e.message || e)}</p>`;
  } finally { btn.textContent = '实盘预检'; }
});

$('run-cycle').addEventListener('click', async () => {
  $('run-cycle').textContent = '运行中…';
  try { await fetch('/api/cycle', { method: 'POST' }); } finally {
    $('run-cycle').textContent = '立即跑一轮'; loadTasks();
  }
});

document.querySelectorAll('.nav-item').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.nav-item').forEach((x) => x.classList.remove('active'));
  b.classList.add('active');
  const page = b.dataset.page;
  // 用 .active 类切换，不要碰行内 display ——
  // CSS 里是 .page{display:none} + .page.active{display:block}，
  // 设 style.display='' 会落回那条隐藏规则，页面永远出不来。
  ['funding', 'tasks', 'system'].forEach((name) => {
    $('page-' + name).classList.toggle('active', page === name);
  });
  $('page-title').textContent = { funding: '资金费总览', tasks: '轮换任务', system: '系统' }[page];
  if (page === 'tasks') { loadTasks(); loadCycles(); }
}));

$('refresh-button').addEventListener('click', () => { load(true); loadStats(); loadStatus(); loadTasks(); loadCycles(); });
$('cost-input').addEventListener('change', (e) => {
  const v = Number(e.target.value);
  if (Number.isFinite(v) && v >= 0) { costBps = v; load(false); }
  else e.target.value = costBps;
});

function loadStatus() { return readChannel('status', statusRead); }
async function statusRead() {
try {
  const s = await readJson('/api/status');
  connection.status = s; connection.statusError = null;
  const pill = $('mode-pill');
  if (typeof s.dry_run === 'boolean') {
    pill.className = 'mode-pill' + (s.dry_run ? '' : ' live');
    pill.querySelector('b').textContent = s.dry_run ? '演练 · 不下单' : '实盘 · 会下单';
  }
  renderConnection();
  $('meta-version').textContent = s.version || '—';
  $('meta-port').textContent = s.port || '—';
  const eff = s.effective || {};
  const dump = $('system-dump');
  if (dump) {
    dump.textContent = '当前实际生效的设置（不管 .env 里写没写，这里是准的）：\n\n'
      + Object.entries(eff).map(([k, v]) => `  ${k} = ${v}`).join('\n')
      + `\n\n  代理 · Arcus = ${s.proxies?.arcus || '—'}`
      + `\n  代理 · Entropy  = ${s.proxies?.entropy || '—'}`;
  }
} catch (e) {
    if (inactiveRead(e)) return;
  connection.statusError = String(e.message || e);
  renderConnection();
}
}

tickClock();
setInterval(tickClock, 1000);
loadStatus();
setInterval(loadStatus, 10000);
loadSpreads();
setInterval(loadSpreads, 30000);
load(true);
loadStats();
timer = setInterval(() => { load(false); loadStats(); }, 15000);
loadTasks();
loadCycles();
setInterval(() => { loadTasks(); loadCycles(); }, 10000);
loadCapacity();
setInterval(loadCapacity, 30000);

if (typeof window !== 'undefined') window.addEventListener('hedge-console-active', () => {
  if (!consoleActive()) return;
  loadStatus(); loadStats(); load(false); loadTasks(); loadCycles(); loadSpreads(); loadCapacity();
});
