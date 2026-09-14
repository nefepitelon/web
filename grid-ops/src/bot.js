// GridBot: orchestrates an arithmetic grid on one market. Places the initial
// ladder of limit orders, and on every fill places the opposite order one rung
// away (buy->sell up, sell->buy down), capturing `spacing * size` per round.
// Risk controls: leverage cap, margin pre-check, fee/spacing check, out-of-range
// alerts (optional auto-stop), periodic open-order reconciliation, crash-safe
// persistence with resume-on-restart, live range adjustment, and a health probe.
import { buildGrid, seedOrders, replacementFor, isReduceOnly } from './grid.js';

const RECONCILE_MS = 30000;   // periodic open-order reconciliation cadence
const PRUNE_GRACE_MS = 20000; // don't prune a tracked order younger than this

export class GridBot {
  constructor(exchange, opts = {}) {
    this.ex = exchange;
    this.exchangeName = String(
      opts.exchangeName
      || exchange?.exchangeName
      || exchange?.constructor?.name?.replace(/(?:Paper)?Exchange$/, '').replace(/Paper$/, '')
      || '交易所',
    );
    this.running = false;
    this.config = null;
    this.grid = null;
    this.active = new Map();        // orderId -> {levelIndex, side, price, opening, placedAt}
    this.fills = [];                // recent fills (capped)
    this.completedByLevel = {};     // grid cell index -> completed cycle count (overview ladder)
    this.alerts = [];               // recent alerts (capped)
    this.stats = { buys: 0, sells: 0, completedRungs: 0, gridProfit: 0, volume: 0 };
    this.startBalance = null;
    this.lastPrice = null;
    this.outOfRange = false;
    this.risk = null;
    this._stopping = false;         // re-entrancy guard for auto-stop
    this._coidSeq = 0;              // monotonic client-order-id counter
    this._placeFails = 0;          // cumulative order-placement failures
    this._lastFailAt = 0;
    this._exchangeOpenOrders = null; // last reconciled real open-order count
    this._ordersSyncedAt = null;     // last read-only exchange order refresh time
    this._ordersSyncError = null;    // latest read-only order refresh error
    this._pendingLevels = new Set(); // levels with a placement in flight (dedup guard)
    this._recoveryOccupied = new Set(); // recovery: real exchange-occupied levels (from reconcile)
    this._reconTimer = null;
    this.recovery = false;          // standalone reduce-only recovery mode
    this._onChange = typeof opts.onChange === 'function' ? opts.onChange : null; // persistence hook
    this._onFill = (f) => this._handleFill(f);
    this._onPrice = (p) => this._handlePrice(p);
    // CRITICAL: an EventEmitter that emits 'error' with no listener crashes the
    // whole Node process. Adapters emit 'error' on cancelled/rejected orders, so
    // we MUST always have a listener attached for the bot's whole lifetime.
    this._onError = (e) => this._handleExError(e);
    this.ex.on('error', this._onError);
    this._cancelTimes = [];          // timestamps of recent order cancellations
    this._refillPausedUntil = 0;     // back-off window: pause new placements until this time
    this._lastErrAlertAt = 0;
    this._lastErrLogAt = 0;
    this._retryQueue = [];           // failed CLOSING-leg placements awaiting retry (never opening legs)
    this._noPosStreak = 0;           // consecutive empty-position observations (recovery finish guard)
    this._pnlBase = null;            // realizedPnl baseline; resetStats uses an offset because some
                                     // adapters (RISEx) re-fetch realizedPnl from the exchange every poll
  }

  /**
   * Handle an 'error' emitted by the exchange adapter. Never throws (that would
   * crash the process). Records a throttled alert, and — if orders are being
   * cancelled rapidly (the tell-tale of collateral exhaustion or manual
   * intervention) — pauses auto-refill so we stop hammering the exchange and
   * burning gas on orders that just get rejected.
   */
  _handleExError(e) {
    const msg = (e && e.message) ? e.message : String(e);
    const now = Date.now();
    if (now - this._lastErrLogAt > 3000) { this._lastErrLogAt = now; try { console.error('[交易所事件] ' + msg); } catch {} }
    if (now - this._lastErrAlertAt > 5000) { this._lastErrAlertAt = now; this._alert('交易所事件: ' + msg); }

    if (/取消|cancel|collateral|保证金|reject/i.test(msg)) {
      this._cancelTimes.push(now);
      this._cancelTimes = this._cancelTimes.filter((t) => now - t < 60000); // last 60s
      if (this._cancelTimes.length >= 5 && now >= this._refillPausedUntil) {
        this._refillPausedUntil = now + 60000;
        this._alert('⚠️ 检测到 60 秒内多笔订单被取消（疑似保证金不足或手动撤单），已暂停自动补单 60 秒，避免反复被拒、浪费手续费。请检查保证金/减小持仓。');
      }
    }
  }

  /** Notify the persistence layer (if any) that durable state changed. */
  _changed() { try { this._onChange?.(this.snapshot()); } catch { /* never let persistence break trading */ } }

  /** Durable snapshot for crash recovery / resume. Includes resting orders. */
  snapshot() {
    return {
      running: this.running, config: this.config, stats: this.stats,
      recovery: this.recovery, pnlBase: this._pnlBase,
      startBalance: this.startBalance, outOfRange: this.outOfRange, lastPrice: this.lastPrice,
      completedByLevel: this.completedByLevel,
      active: [...this.active.entries()],
    };
  }

  /**
   * Restore display/accounting state after a process restart WITHOUT resuming
   * trading (running stays false). Used when we only want continuity of stats.
   */
  restore(snap) {
    if (!snap || !snap.config) return;
    this.config = snap.config;
    this.stats = { buys: 0, sells: 0, completedRungs: 0, gridProfit: 0, volume: 0, ...(snap.stats || {}) };
    this.completedByLevel = normalizeCompletedByLevel(snap.completedByLevel);
    this.startBalance = snap.startBalance ?? null;
    this._pnlBase = snap.pnlBase ?? null;
    try {
      this.grid = buildGrid({ lower: this.config.lower, upper: this.config.upper, gridCount: this.config.gridCount });
      this._recomputeRisk();
    } catch { /* config may be incomplete */ }
  }

  /**
   * Resume a grid that was running when the process died: re-attach to the
   * orders still resting on the exchange (rebuilding both our tracking and the
   * adapter's), restart listeners, then reconcile against the real book.
   */
  async resume(snap) {
    if (!snap || !snap.config) throw new Error('无可恢复的运行中网格快照');
    if (this.running) throw new Error('已在运行，无法重复恢复');
    // Standalone recovery ladder has no grid (gridCount=null): resume it via its
    // own path — the old code fell into buildGrid, threw, and the fallback then
    // CANCELLED the whole ladder while the position stayed open.
    if (snap.recovery || snap.config.mode === 'recovery') return this._resumeRecovery(snap);
    if (!Array.isArray(snap.active)) throw new Error('无可恢复的运行中网格快照');
    // A previous version could persist running=true even when every initial
    // order was rejected. Never resurrect that invalid zero-order state: keep
    // the configuration/statistics for display and let startup recovery check
    // the exchange for any real position instead.
    if (snap.active.length === 0) {
      this.restore(snap);
      throw new Error('上次网格没有任何可接管的挂单，已拒绝恢复为“运行中”。请检查资金/手续费后重新启动。');
    }
    this.config = snap.config;
    this.stats = { buys: 0, sells: 0, completedRungs: 0, gridProfit: 0, volume: 0, ...(snap.stats || {}) };
    this.completedByLevel = normalizeCompletedByLevel(snap.completedByLevel);
    this.startBalance = snap.startBalance ?? null;
    this._pnlBase = snap.pnlBase ?? null;
    this.outOfRange = !!snap.outOfRange;
    this.lastPrice = snap.lastPrice ?? null;
    this.grid = buildGrid({ lower: this.config.lower, upper: this.config.upper, gridCount: this.config.gridCount });
    this._recomputeRisk();

    // Rebuild our active map AND the adapter's order tracking so fills on these
    // pre-existing orders are detected.
    this.active.clear();
    for (const [id, info] of snap.active) {
      const oid = String(id);
      this.active.set(oid, { ...info, placedAt: info.placedAt ?? Date.now() });
      if (typeof this.ex.adoptOrder === 'function') {
        try {
          this.ex.adoptOrder({
            orderId: oid, marketId: this.config.marketId, levelIndex: info.levelIndex,
            side: info.side, price: info.price, sizeBase: info.sizeBase ?? this.config.sizeBase,
          });
        } catch { /* best effort */ }
      }
    }

    this.ex.on('fill', this._onFill);
    this.ex.on('price', this._onPrice);
    if (typeof this.ex.start === 'function') this.ex.start();
    this.running = true;
    this._startReconcileTimer();
    this._alert(`已恢复运行中的 ${this.config.displayName} ${labelMode(this.config.mode)}：接管 ${this.active.size} 个挂单，正在与交易所对账…`);
    this.reconcileOpenOrders().catch(() => {}); // immediate reconcile
    this._changed();
    return this.getState();
  }

  /** Resume a standalone reduce-only recovery ladder after a process restart. */
  async _resumeRecovery(snap) {
    this.config = snap.config;
    this.stats = { buys: 0, sells: 0, completedRungs: 0, gridProfit: 0, volume: 0, ...(snap.stats || {}) };
    this.completedByLevel = normalizeCompletedByLevel(snap.completedByLevel);
    this.startBalance = snap.startBalance ?? null;
    this._pnlBase = snap.pnlBase ?? null;
    this.grid = null; this.risk = null;
    this.recovery = true; this.outOfRange = false;
    this.lastPrice = snap.lastPrice ?? null;
    this._noPosStreak = 0; this._retryQueue = [];
    this.active.clear();
    for (const [id, info] of (Array.isArray(snap.active) ? snap.active : [])) {
      const oid = String(id);
      this.active.set(oid, { ...info, placedAt: info.placedAt ?? Date.now() });
      try {
        this.ex.adoptOrder?.({
          orderId: oid, marketId: this.config.marketId, levelIndex: info.levelIndex,
          side: info.side, price: info.price, sizeBase: info.sizeBase ?? this.config.sizeBase,
        });
      } catch { /* best effort */ }
    }
    this.ex.on('fill', this._onFill);
    this.ex.on('price', this._onPrice);
    if (typeof this.ex.start === 'function') this.ex.start();
    this.running = true;
    // seed the adapter's price watch + refresh lastPrice
    const px = await this.ex.getPrice(this.config.marketId).catch(() => null);
    if (px > 0) this.lastPrice = px;
    this._recoveryOccupied = new Set();
    this._alert(`已恢复 ${this.config.displayName} 的「只减仓回收阶梯」：接管 ${this.active.size} 个挂单，正在与交易所对账…`);
    await this.reconcileOpenOrders().catch(() => {});
    this._startReconcileTimer();
    this._changed();
    return this.getState();
  }

  /**
   * Fallback recovery: cancel any resting orders from a previous run (used when
   * resume is not desired or fails).
   */
  async recoverStrayOrders() {
    if (!this.config) return;
    await this.ex.cancelAll(this.config.marketId).catch(() => {});
    this._alert('⚠️ 检测到上次运行未正常结束：已撤销该市场遗留挂单。请确认仓位后重新启动网格。');
    this._changed();
  }

  // Release only local listeners/timers. This deliberately does not cancel
  // orders or close positions; hosted Workflow sessions hand the durable
  // snapshot to the next invocation and then reconnect to the same orders.
  dispose() {
    if (this._reconTimer) clearInterval(this._reconTimer);
    this._reconTimer = null;
    this.ex.off?.('fill', this._onFill);
    this.ex.off?.('price', this._onPrice);
    this.ex.off?.('error', this._onError);
    this.running = false;
  }

  /** @param cfg {marketId, mode, lower, upper, gridCount, sizeBase, leverage, outOfRangeAction} */
  async start(cfg) {
    if (this.running || this._starting) throw new Error('机器人已在运行或正在启动，请勿重复点击。');
    this._starting = true;
    try { return await this._start(cfg); }
    finally { this._starting = false; }
  }

  async _start(cfg) {
    const market = (await this.ex.getMarkets()).find((m) => m.marketId === Number(cfg.marketId));
    if (!market) throw new Error('找不到该市场 marketId=' + cfg.marketId);

    const leverage = Math.min(Number(cfg.leverage || 3), market.maxLeverage || 50);
    const sizeBase = Math.max(Number(cfg.sizeBase), market.minOrderSize || 0);
    this.config = {
      marketId: market.marketId, displayName: market.displayName,
      mode: cfg.mode || 'neutral',
      lower: Number(cfg.lower), upper: Number(cfg.upper),
      gridCount: Number(cfg.gridCount), sizeBase, leverage,
      // 区间外止损策略：'close'=冲破区间平仓（撤单+平仓+停止）；'recover'=只减仓回收阶梯
      outOfRangeAction: cfg.outOfRangeAction === 'recover' ? 'recover' : 'close',
      stepSize: market.stepSize, stepPrice: market.stepPrice,
    };
    this.grid = buildGrid({ lower: this.config.lower, upper: this.config.upper, gridCount: this.config.gridCount });
    this._recomputeRisk();
    this._refillPausedUntil = 0; this._cancelTimes = []; // fresh start clears any back-off
    this._retryQueue = []; this._noPosStreak = 0;
    this.recovery = false;

    // record the starting equity up front (margin pre-check, returnPct, recovery)
    if (this.startBalance == null) {
      this.startBalance =
        typeof this.ex.equity === 'number' ? this.ex.equity
        : typeof this.ex.balance === 'number' ? this.ex.balance
        : null;
    }

    // ---- margin pre-check ----
    const requiredMargin = this.risk.requiredMargin;
    const available = typeof this.ex.equity === 'number' ? this.ex.equity
      : typeof this.ex.balance === 'number' ? this.ex.balance : null;
    if (available != null) {
      if (requiredMargin > available) {
        throw new Error(`保证金不足：该网格约需 ${round2(requiredMargin)} USDC（名义敞口 ${this.risk.notional}，${leverage}x），当前可用 ${round2(available)} USDC。请降低每格数量/网格数，或提高杠杆/充值后再启动。`);
      }
      if (requiredMargin > available * 0.8) {
        this._alert(`⚠️ 保证金占用偏高：约 ${round2(requiredMargin)} / 可用 ${round2(available)} USDC（>80%），价格波动时有强平风险。`);
      }
    }

    // ---- fee vs spacing sanity check ----
    const feeRate = Number(this.ex.feeRate) || 0.0005;
    const roundTripFeePct = feeRate * 2 * 100;
    if (this.risk.spacingPct <= roundTripFeePct) {
      this._alert(`⚠️ 网格间距 ${this.risk.spacingPct}% 不足以覆盖往返手续费（约 ${round2(roundTripFeePct)}%），每完成一格可能亏损。建议拉大间距或减少网格数。`);
    }

    // DEX-specific chain fee check. Decibel uses a separate API Wallet to pay
    // Aptos gas; USDC collateral in the Trading Account cannot cover it.
    if (typeof this.ex.preflightTrading === 'function') {
      await this.ex.preflightTrading(this.config.marketId, { config: this.config, risk: this.risk });
    }

    // A range may have been calculated for a different market or from a
    // delayed candle close. Validate it against a fresh venue quote before
    // leverage changes, stale-order cancellation, or any new order write.
    this.lastPrice = await this.ex.getPrice(market.marketId);
    if (!Number.isFinite(this.lastPrice) || this.lastPrice <= 0) {
      throw new Error('未能获取有效的最新价（行情中断），已取消启动且未挂出初始订单。请稍后重试。');
    }
    if (this.lastPrice <= this.config.lower || this.lastPrice >= this.config.upper) {
      throw new Error(`最新价 ${this.lastPrice} 不在网格区间 [${this.config.lower}, ${this.config.upper}] 内，已取消启动且未挂出初始订单。请刷新行情或重新智能填充区间后再启动。`);
    }
    this.outOfRange = false;

    // start() always begins a new grid session; crash recovery uses resume()
    // and therefore never reaches this branch. Re-baseline here so statistics
    // from a previous stopped grid cannot appear as fills/PnL immediately after
    // a brand-new ladder is only resting on the book.
    this._beginFreshSessionAccounting();

    const levOk = await this.ex.setLeverage(market.marketId, leverage).catch(() => false);
    if (levOk === false) this._alert(`⚠️ 杠杆设置 ${leverage}x 未生效，将沿用交易所端该市场的当前杠杆，请在交易所网页端核实后再继续。`);
    await this.ex.cancelAll(market.marketId).catch(() => {});

    this.ex.on('fill', this._onFill);
    this.ex.on('price', this._onPrice);
    if (typeof this.ex.start === 'function') this.ex.start();

    // ---- seed the ladder (every seed order is an OPENING leg) ----
    const seeds = seedOrders({ levels: this.grid.levels, price: this.lastPrice, mode: this.config.mode, spacing: this.grid.spacing });
    try {
      if (!seeds.length) throw new Error('当前价格与网格区间没有生成可挂的初始订单。');
      if (this.config.mode === 'neutral'
        && (!seeds.some((order) => order.side === 'buy') || !seeds.some((order) => order.side === 'sell'))) {
        throw new Error('当前价格过于靠近网格边界，无法同时生成上下双向初始挂单。请刷新行情或重新智能填充区间。');
      }
      if (seeds.length > 1 && typeof this.ex.placeLimitOrders === 'function') {
        this._alert(`正在按交易所批量接口分批挂出 ${seeds.length} 个初始网格单，请勿重复点击启动。`);
        await this._placeInitialBatch(seeds);
      } else {
        for (const s of seeds) {
          const placed = await this._place({ ...s, opening: true }, { failFast: true });
          if (!placed) throw new Error(`初始网格单未挂出（level ${s.levelIndex}）。`);
        }
      }
    } catch (e) {
      const hadOrders = this.active.size > 0;
      const statusUnknown = e?.statusUnknown === true;
      let cleanupConfirmed = true;
      if (hadOrders || statusUnknown) cleanupConfirmed = await this.ex.cancelAll(market.marketId).catch(() => false);
      this.active.clear();
      this._retryQueue = [];
      this.ex.off('fill', this._onFill);
      this.ex.off('price', this._onPrice);
      this.running = false;
      const cleanup = statusUnknown
        ? (cleanupConfirmed ? '下单结果未确认，已尝试撤销本市场挂单；请到交易所核对订单状态，机器人未进入运行状态。' : `下单和撤单结果未确认，请立即到 ${this.exchangeName} 交易页检查挂单。`)
        : hadOrders
        ? (cleanupConfirmed ? '本次已挂出的订单已尝试撤销。' : `撤单结果未确认，请立即到 ${this.exchangeName} 交易页检查挂单。`)
        : '未挂出任何初始订单，机器人未进入运行状态。';
      const message = `网格启动失败：${e?.message || e}\n${cleanup}`;
      this._alert('❌ ' + message);
      this._changed();
      const error = new Error(message);
      if (statusUnknown) error.statusUnknown = true;
      throw error;
    }

    if (this.startBalance == null && typeof this.ex.balance === 'number') this.startBalance = this.ex.balance;
    this.running = true;
    this._startReconcileTimer();
    this._alert(`已启动 ${this.config.displayName} ${labelMode(this.config.mode)}，${this.grid.count} 格，间距 ${this.grid.spacing}（${this.risk.spacingPct}%），杠杆 ${leverage}x，挂出 ${this.active.size} 单。`);
    this._changed();
    return this.getState();
  }

  async stop({ closePosition = true, requireConfirmedClose = false } = {}) {
    this._stopReconcileTimer();
    if (this.running) {
      this.ex.off('fill', this._onFill);
      this.ex.off('price', this._onPrice);
    }

    let cancelError = null;
    let closeConfirmed = !closePosition;
    if (this.config) {
      try { await this.ex.cancelAll(this.config.marketId); }
      catch (error) {
        cancelError = error;
        this._alert('撤单失败: ' + (error?.message || error));
      }

      if (closePosition) {
        if (typeof this.ex.closePosition === 'function') {
          closeConfirmed = await this._closeWithConfirm(this.config.marketId);
        } else {
          const position = this.ex.getPosition?.(this.config.marketId);
          closeConfirmed = !position?.sizeBase;
        }
      }
    }

    this.active.clear();
    this.running = false;
    this.recovery = false;
    this._retryQueue = [];
    this._alert(closePosition
      ? (cancelError || !closeConfirmed
        ? '机器人已停止，但撤单或平仓未完全确认，请立即到交易所核查。'
        : '机器人已停止：挂单已撤销，且已确认仓位已平。')
      : (cancelError ? '机器人已停止，但撤单未确认，请立即到交易所核查。' : '机器人已停止，挂单已撤销（未平仓）。'));
    this._changed();
    const state = this.getState();

    if (requireConfirmedClose && (cancelError || !closeConfirmed)) {
      const failures = [];
      if (cancelError) failures.push(`撤单失败：${cancelError?.message || cancelError}`);
      if (!closeConfirmed) failures.push('平仓未确认');
      const error = new Error(`紧急停撤平未完全完成：${failures.join('；')}`);
      error.code = 'EMERGENCY_ACTION_INCOMPLETE';
      error.details = { cancelConfirmed: !cancelError, closeConfirmed };
      error.state = state;
      throw error;
    }

    return state;
  }

  /**
   * One-click: cancel ALL resting orders for this market WITHOUT touching the
   * open POSITION. Also stops the grid (running=false) and detaches handlers so
   * no later automated action (fill replacements / auto-stop) can affect the
   * position afterwards. To resume trading, start the grid again.
   */
  async cancelAllOrders() {
    if (!this.config) throw new Error('尚未配置市场，没有可撤的挂单。');
    this._stopReconcileTimer();
    this.ex.off('fill', this._onFill);
    this.ex.off('price', this._onPrice);
    await this.ex.cancelAll(this.config.marketId).catch((e) => this._alert('撤单失败: ' + (e?.message || e)));
    this.active.clear();
    this.running = false;
    this._refillPausedUntil = 0; this._cancelTimes = []; this._retryQueue = [];
    this._alert('已一键撤销该市场全部挂单（持仓保留、未平仓）。网格已停止，如需继续请重新启动。');
    this._changed();
    return this.getState();
  }

  /**
   * Adjust the grid's price range WITHOUT stopping. Margin is re-checked against
   * the new range; if it passes, current orders are cancelled and the ladder is
   * re-seeded around the live price. The open POSITION is left untouched.
   */
  async adjustRange({ lower, upper }) {
    if (!this.running || !this.config) throw new Error('网格未在运行，无法调整区间。');
    const lo = Number(lower), hi = Number(upper);
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || !(hi > lo)) throw new Error('上边界必须大于下边界。');
    const price = this.lastPrice;
    if (Number.isFinite(price) && (price < lo * 0.5 || price > hi * 2)) {
      throw new Error(`新区间 [${lo}, ${hi}] 与当前价 ${round2(price)} 偏离过大，已取消调整。`);
    }
    const newGrid = buildGrid({ lower: lo, upper: hi, gridCount: this.config.gridCount });
    const mid = (lo + hi) / 2;
    const notional = newGrid.count * this.config.sizeBase * mid;
    const requiredMargin = notional / this.config.leverage;
    const available = typeof this.ex.equity === 'number' ? this.ex.equity
      : typeof this.ex.balance === 'number' ? this.ex.balance : null;
    if (available != null && requiredMargin > available) {
      throw new Error(`保证金不足以支持新区间：约需 ${round2(requiredMargin)} USDC，当前可用 ${round2(available)} USDC。请缩小区间/减少格数后再试。`);
    }

    await this.ex.cancelAll(this.config.marketId).catch(() => {});
    this.active.clear();
    this._refillPausedUntil = 0; this._cancelTimes = []; // user re-set the range: clear back-off
    this.config = { ...this.config, lower: lo, upper: hi };
    this.grid = newGrid;
    // The cell indexes belong to the old price range. Keeping them after a
    // range adjustment would paint completed cells at unrelated prices.
    this.completedByLevel = {};
    this._recomputeRisk();
    this.outOfRange = Number.isFinite(price) ? (price < lo || price > hi) : false;
    if (!this.outOfRange && Number.isFinite(price) && price > 0) {
      const seeds = seedOrders({ levels: newGrid.levels, price, mode: this.config.mode, spacing: newGrid.spacing });
      for (const s of seeds) await this._place({ ...s, opening: true });
    }
    this._alert(`已调整区间为 [${lo}, ${hi}]，${newGrid.count} 格，间距 ${newGrid.spacing}（${this.risk.spacingPct}%），重新挂出 ${this.active.size} 单（持仓保留）。`);
    this._changed();
    return this.getState();
  }

  /** Zero cumulative stats and re-baseline PnL to the current equity. */
  resetStats() {
    this.stats = { buys: 0, sells: 0, completedRungs: 0, gridProfit: 0, volume: 0 };
    this.fills = [];
    this.completedByLevel = {};
    this._placeFails = 0;
    this._lastFailAt = 0;
    this._refillPausedUntil = 0; this._cancelTimes = [];
    this.startBalance = typeof this.ex.equity === 'number' ? this.ex.equity
      : typeof this.ex.balance === 'number' ? this.ex.balance : this.startBalance;
    // Offset-based reset: adapters like RISEx refresh realizedPnl from the
    // exchange every poll, so writing 0 into it never sticks — record a
    // baseline instead and subtract it in getState.
    this._pnlBase = typeof this.ex.realizedPnl === 'number' ? this.ex.realizedPnl : null;
    this._alert('已重置统计：已实现盈亏、收益率、成交量、完成格数清零，并以当前权益为新基准。');
    this._changed();
    return this.getState();
  }

  _beginFreshSessionAccounting() {
    this.stats = { buys: 0, sells: 0, completedRungs: 0, gridProfit: 0, volume: 0 };
    this.fills = [];
    this.completedByLevel = {};
    this._placeFails = 0;
    this._lastFailAt = 0;
    this.startBalance = typeof this.ex.equity === 'number' ? this.ex.equity
      : typeof this.ex.balance === 'number' ? this.ex.balance : null;
    this._pnlBase = typeof this.ex.realizedPnl === 'number' ? this.ex.realizedPnl : null;
  }

  _recomputeRisk() {
    if (!this.grid || !this.config) return;
    const mid = (this.config.lower + this.config.upper) / 2;
    const notional = this.grid.count * this.config.sizeBase * mid;
    this.risk = {
      leverage: this.config.leverage,
      notional: round2(notional),
      requiredMargin: round2(notional / this.config.leverage),
      perRungProfit: round2(this.grid.spacing * this.config.sizeBase),
      spacingPct: round2((this.grid.spacing / mid) * 100),
    };
  }

  async _placeInitialBatch(seeds) {
    const prepared = seeds.map((seed) => {
      const levelIndex = seed.levelIndex;
      const seq = (++this._coidSeq) % 1_000_000;
      const clientOrderId = Number(`${Date.now() % 1_000_000_0}${String(seq).padStart(6, '0')}`);
      const sizeBase = Number(seed.sizeBase) > 0 ? Number(seed.sizeBase) : this.config.sizeBase;
      return {
        marketId: this.config.marketId,
        side: seed.side,
        price: seed.price,
        sizeBase,
        reduceOnly: seed.reduceOnly ?? isReduceOnly(seed.side, this.config.mode),
        levelIndex,
        clientOrderId,
        opening: true,
      };
    });
    const byClientId = new Map(prepared.map((order) => [String(order.clientOrderId), order]));
    const recorded = new Set();
    const record = (row) => {
      const order = byClientId.get(String(row?.clientOrderId || ''));
      if (!order || !row?.orderId || recorded.has(String(row.orderId))) return;
      recorded.add(String(row.orderId));
      this.active.set(String(row.orderId), {
        levelIndex: order.levelIndex, side: order.side,
        price: Number(row.price) > 0 ? Number(row.price) : order.price,
        sizeBase: Number(row.sizeBase) > 0 ? Number(row.sizeBase) : order.sizeBase,
        opening: true, recovery: false, placedAt: Date.now(),
      });
    };

    try {
      let result;
      try {
        result = await this.ex.placeLimitOrders(prepared);
      } catch (error) {
        for (const row of error?.partialOrders || []) record(row);
        this._placeFails++;
        this._lastFailAt = Date.now();
        this._alert('批量下单失败: ' + (error?.message || error));
        throw error;
      }
      for (const row of result?.placed || []) record(row);
      const failed = result?.failed || [];
      if (failed.length || recorded.size !== prepared.length) {
        const first = failed[0];
        const detail = first ? `${first.code || 'rejected'}: ${first.message || '订单被拒绝'}` : '返回订单数不完整';
        throw new Error(`批量挂单部分失败（成功 ${recorded.size}/${prepared.length}）：${detail}`);
      }
      return true;
    } finally {
      for (const order of prepared) this._pendingLevels.delete(order.levelIndex);
    }
  }

  async _place(o, { failFast = false } = {}) {
    const opening = o.opening !== false;
    const reduceOnly = o.reduceOnly ?? isReduceOnly(o.side, this.config.mode);
    // Back-off: while paused (after a burst of cancellations / collateral
    // rejections) do not place new OPENING orders. CLOSING / reduce-only /
    // recovery legs need no extra margin and are never blocked — dropping a
    // take-profit leg would strand its inventory without an exit order.
    if (opening && !o.recovery && this._refillPausedUntil && Date.now() < this._refillPausedUntil) return false;
    // INVARIANT: at most ONE resting order per grid level. If this level is
    // already covered (or a placement for it is in flight), skip. Stacking a
    // second order on an occupied level is exactly what made the open-order
    // count creep up over time (replacement-one-rung-away colliding with the
    // order already resting there).
    const lvl = o.levelIndex;
    if (this._pendingLevels.has(lvl)) return false;
    for (const a of this.active.values()) if (a.levelIndex === lvl) return false;
    this._pendingLevels.add(lvl);
    const seq = (++this._coidSeq) % 1_000_000;
    const clientOrderId = Number(`${Date.now() % 1_000_000_0}${String(seq).padStart(6, '0')}`);
    const sizeBase = Number(o.sizeBase) > 0 ? Number(o.sizeBase) : this.config.sizeBase; // per-order override (partial fills)
    try {
      let r;
      try {
        r = await this.ex.placeLimitOrder({
          marketId: this.config.marketId, side: o.side, price: o.price,
          sizeBase, reduceOnly, opening,
          levelIndex: o.levelIndex, clientOrderId,
        });
      } catch (e) {
        this._placeFails++; this._lastFailAt = Date.now();
        this._alert('下单失败: ' + (e?.message || e));
        if (failFast) throw e;
        // Some exchanges (notably Binance) document transport timeout / 5xx as
        // "execution status unknown". Re-submitting can create a duplicate live
        // order, so the adapter marks these errors and we require reconciliation.
        if (!e?.statusUnknown) this._queueRetry({ ...o, opening, reduceOnly, sizeBase });
        return false;
      }
      if (r?.orderId) {
        this.active.set(String(r.orderId), { levelIndex: lvl, side: o.side, price: Number(r.price) > 0 ? Number(r.price) : o.price, sizeBase: Number(r.sizeBase) > 0 ? Number(r.sizeBase) : sizeBase, opening, recovery: !!o.recovery, placedAt: Date.now() });
        return true;
      }
      if (failFast) throw new Error('交易所未返回订单号。');
      return false;
    } finally {
      this._pendingLevels.delete(lvl);
    }
  }

  /**
   * Queue a CLOSING / reduce-only order for retry after a failed placement.
   * Only closing legs are retried — they can never ADD inventory, so retrying is
   * always safe; silently dropping one (the old behavior) left inventory without
   * its take-profit order forever, since replacements are only quoted on fills.
   */
  _queueRetry(o) {
    if (o.opening !== false && !o.reduceOnly && !o.recovery) return; // opening legs: by design not retried
    const tries = (o._tries || 0) + 1;
    if (tries > 5) {
      this._alert(`❌ 补挂平仓单（level ${o.levelIndex} @ ${o.price}）连续 ${tries - 1} 次失败，已放弃。请到交易所核实并手动挂单。`);
      return;
    }
    this._retryQueue.push({ ...o, _tries: tries, _nextAt: Date.now() + 5000 * tries }); // linear back-off
  }

  /** Retry due closing-leg placements (driven by price ticks + reconcile timer). */
  _drainRetryQueue() {
    if (!this.running || !this._retryQueue.length) return;
    const now = Date.now();
    const due = [];
    this._retryQueue = this._retryQueue.filter((o) => (o._nextAt <= now ? (due.push(o), false) : true));
    for (const o of due) this._place(o); // _place re-queues on failure with tries+1
  }

  _handleFill(f) {
    if (!this.running || f.marketId !== this.config.marketId) return;
    const id = String(f.orderId);
    const act = this.active.get(id);
    this.active.delete(id);
    const levelIndex = act?.levelIndex ?? f.levelIndex;
    const fillPrice = Number.isFinite(f.price) ? f.price : (act?.price ?? 0);
    const fillSize = Number.isFinite(f.sizeBase) ? f.sizeBase : this.config.sizeBase;

    if (f.side === 'buy') this.stats.buys++; else this.stats.sells++;
    this.stats.volume = round2(this.stats.volume + fillPrice * fillSize);
    const isRecovery = !!(act && act.recovery);
    const closing = isRecovery ? true
      : (act ? act.opening === false
             : ((this.config.mode === 'short') ? f.side === 'buy' : f.side === 'sell'));
    let completedCell = null;
    if (closing) {
      this.stats.completedRungs++;
      if (this.grid && Number.isInteger(Number(levelIndex))) {
        const candidate = f.side === 'sell' ? Number(levelIndex) - 1 : Number(levelIndex);
        if (candidate >= 0 && candidate < this.grid.count) {
          completedCell = candidate;
          this.completedByLevel[candidate] = (this.completedByLevel[candidate] || 0) + 1;
        }
      }
      // Incremental accumulation with the ACTUAL fill size: adjustRange no longer
      // rewrites history (the old code recomputed rungs × CURRENT spacing), and
      // partial fills are credited with what really executed.
      const sp = this.grid?.spacing ?? this.config.spacing ?? 0;
      this.stats.gridProfit = round2(this.stats.gridProfit + sp * fillSize);
    }
    this.fills.unshift({ t: Date.now(), side: f.side, price: fillPrice, size: fillSize, level: levelIndex, closing, completedCell });
    if (this.fills.length > 50) this.fills.pop();

    // Recovery-ladder fills are pure reduce-only EXITS of stranded inventory —
    // never re-quote a replacement for them.
    if (!isRecovery && this.grid) {
      const repl = replacementFor({ side: f.side, levelIndex }, this.grid.levels, this.config.mode);
      if (repl && !this.outOfRange && this.running) {
        repl.opening = closing; // replacement is the opposite leg
        if (fillSize > 0) repl.sizeBase = fillSize; // partial fill: mirror the actually-filled qty
        this._place(repl);
      }
    }
    this._changed();
  }

  _handlePrice(p) {
    if (p.marketId !== this.config.marketId) return;
    this.lastPrice = p.price;
    this._drainRetryQueue();
    if (this.recovery) { this._manageRecoveryStandalone(); return; }
    const out = p.price < this.config.lower || p.price > this.config.upper;
    const action = this.config.outOfRangeAction || 'close';
    if (out && !this.outOfRange) {
      this.outOfRange = true;
      const where = p.price < this.config.lower ? '跌破下边界' : '突破上边界';
      if (action === 'recover') {
        this._alert(`⚠️ 价格${where}（${round2(p.price)}），启用「只减仓回收阶梯」：暂停补单，挂出 reduce-only 单等回调分批减仓（只减不加、不自动止损，请自行控制风险）。`);
        this._placeRecoveryLadder();
      } else {
        this._alert(`⚠️ 价格${where}（${round2(p.price)}），触发「冲破区间平仓」：撤单 + 平仓 + 停止。`);
        if (!this._stopping) {
          this._stopping = true;
          this.stop({ closePosition: true }).finally(() => { this._stopping = false; });
        }
      }
    } else if (out && this.outOfRange && action === 'recover') {
      this._placeRecoveryLadder(); // extend the ladder as price makes new extremes (dedup keeps it idempotent)
    } else if (!out && this.outOfRange) {
      this.outOfRange = false;
      this._cancelRecoveryLadder();
      this._alert(`价格回到区间内（${round2(p.price)}），撤销回收阶梯，恢复正常网格运行。`);
    }
  }

  /**
   * 只减仓回收阶梯：价格冲出区间后，在「现价 ↔ 被冲破的边界」之间挂一批 reduce-only
   * 单。价格每回调一档就分批了结被套住的库存。reduce-only 保证「只减不加」（永远不会
   * 把套牢的仓位越加越大）；本策略不自动止损 —— 趋势继续单边延续会一直扛着。
   */
  _placeRecoveryLadder() {
    if (!this.running || !this.outOfRange || !this.grid) return;
    if ((this.config.outOfRangeAction || 'close') !== 'recover') return;
    const price = this.lastPrice;
    if (!Number.isFinite(price) || price <= 0) return;
    const pos = this.ex.getPosition?.(this.config.marketId);
    if (!pos || !pos.sizeBase) return; // 没有可减的持仓
    const sp = this.grid.spacing, lvl0 = this.grid.levels[0];
    const L = this.config.lower, U = this.config.upper;
    const long = pos.sizeBase > 0;
    const existing = new Set([...this.active.values()].filter((o) => o.recovery).map((o) => o.levelIndex));
    const maxRungs = this.grid.count;
    let placed = 0;
    const room = () => existing.size + placed < maxRungs;
    if (long && price < L) {
      // 跌破下边界、手里是多头：在「现价 ↔ 下边界」之间挂 reduce-only 卖单
      for (let lv = L - sp; lv > price && room(); lv -= sp) {
        const idx = Math.round((lv - lvl0) / sp);
        if (existing.has(idx)) continue;
        this._place({ levelIndex: idx, side: 'sell', price: lv, reduceOnly: true, recovery: true, opening: false });
        placed++;
      }
    } else if (!long && price > U) {
      // 突破上边界、手里是空头：在「上边界 ↔ 现价」之间挂 reduce-only 买单
      for (let lv = U + sp; lv < price && room(); lv += sp) {
        const idx = Math.round((lv - lvl0) / sp);
        if (existing.has(idx)) continue;
        this._place({ levelIndex: idx, side: 'buy', price: lv, reduceOnly: true, recovery: true, opening: false });
        placed++;
      }
    }
    if (placed) {
      this._alert(`回收阶梯：新挂 ${placed} 个 reduce-only ${long ? '卖' : '买'}单，等回调分批减仓。`);
      this._changed();
    }
  }

  /** Cancel all recovery-ladder orders (when price returns into range). */
  async _cancelRecoveryLadder() {
    const ids = [...this.active].filter(([, o]) => o.recovery).map(([id]) => id);
    if (!ids.length) return;
    for (const id of ids) {
      await this.ex.cancelOrder?.(this.config.marketId, id)?.catch?.(() => {});
      this.active.delete(id);
    }
    this._alert(`已撤销 ${ids.length} 个回收阶梯挂单。`);
    this._changed();
  }

  // ============ 未托管持仓处置（开机扫描后手动选择）============

  /**
   * 只减仓回收阶梯（独立模式）：对一笔已存在的持仓，挂 reduce-only 单在反弹时分批
   * 减仓；只减不加、不需要新保证金、不自动止损。不需要完整网格。
   */
  async startRecovery(cfg) {
    if (this.running || this._starting) throw new Error('已在运行，请先停止再操作。');
    this._starting = true;
    try {
      const market = (await this.ex.getMarkets()).find((m) => m.marketId === Number(cfg.marketId));
      if (!market) throw new Error('找不到该市场 marketId=' + cfg.marketId);
      const pos = this.ex.getPosition?.(market.marketId);
      if (!pos || !pos.sizeBase) throw new Error('该市场当前没有持仓，无需回收。');
      const price = await this.ex.getPrice(market.marketId);
      if (!Number.isFinite(price) || price <= 0) throw new Error('未能获取有效最新价，请稍后重试。');
      // 阶梯间距：入参 -> 上次网格间距 -> 现价的 0.15%
      let spacing = Number(cfg.spacing) || this.config?.spacing || this.grid?.spacing;
      if (!(spacing > 0)) spacing = Math.max(market.stepPrice || 0.1, price * 0.0015);
      // 每档减仓量：入参 -> 上次每格量 -> 持仓量/20
      let sizeBase = Number(cfg.sizeBase) || this.config?.sizeBase || (Math.abs(pos.sizeBase) / 20);
      sizeBase = Math.max(sizeBase, market.minOrderSize || 0);
      this.config = {
        marketId: market.marketId, displayName: market.displayName, mode: 'recovery',
        sizeBase, spacing, stepSize: market.stepSize, stepPrice: market.stepPrice,
        lower: null, upper: null, gridCount: null, leverage: pos.leverage ?? null,
        outOfRangeAction: 'recover',
        aboveEntryOnly: !!cfg.aboveEntryOnly, // 只在成本价上方(多)/下方(空)、即不亏的价位才挂减仓单
      };
      this.grid = null; this.risk = null;
      this.recovery = true; this.outOfRange = false; this.lastPrice = price;
      this._noPosStreak = 0; this._retryQueue = [];
      this.active.clear();
      if (this.startBalance == null) {
        this.startBalance = typeof this.ex.equity === 'number' ? this.ex.equity
          : typeof this.ex.balance === 'number' ? this.ex.balance : null;
      }
      this.ex.on('fill', this._onFill);
      this.ex.on('price', this._onPrice);
      if (typeof this.ex.start === 'function') this.ex.start();
      this.running = true;
      const dir = pos.sizeBase > 0 ? '多' : '空';
      const modeTxt = this.config.aboveEntryOnly ? '仅在成本价以上(不亏)分批减仓' : '任何反弹都分批减仓';
      this._alert(`已对 ${market.displayName} 的${dir}头 ${Math.abs(round6(pos.sizeBase))} 启用「只减仓回收阶梯」：${modeTxt}（只减不加、不自动止损，请自行控制风险）。`);
      // Seed against any orders ALREADY resting on the exchange (e.g. left over from
      // a prior recovery session) so we adopt/dedup them instead of stacking a whole
      // new ladder on top — the cause of the runaway open-order count.
      this._recoveryOccupied = new Set();
      await this.reconcileOpenOrders().catch(() => {});
      this._manageRecoveryStandalone();
      this._startReconcileTimer(); // keep deduping/pruning the ladder while it runs
      this._changed();
      return this.getState();
    } finally { this._starting = false; }
  }

  /** 市价平仓：撤销该市场全部挂单并立即市价平掉持仓。 */
  async closePositionNow(marketId) {
    const mId = Number(marketId ?? this.config?.marketId);
    if (!Number.isFinite(mId)) throw new Error('未指定市场，无法平仓。');
    this._stopReconcileTimer();
    this.ex.off('fill', this._onFill);
    this.ex.off('price', this._onPrice);
    await this.ex.cancelAll(mId).catch(() => {});
    this.active.clear();
    this._retryQueue = [];
    let closed = false;
    if (typeof this.ex.closePosition === 'function') {
      await this._closeWithConfirm(mId);
      closed = true;
    }
    this.running = false; this.recovery = false;
    this._alert(closed ? '已发送市价平仓指令并撤销该市场挂单（请在交易所确认已平）。' : '已撤销挂单（该交易所不支持自动平仓）。');
    this._changed();
    return this.getState();
  }

  /**
   * Send a market close and CONFIRM the position is actually gone (polls the
   * adapter's position cache). Retries up to 3 times — an IOC close capped at a
   * worst-case price (±5%) can miss entirely when the market moves fast; each
   * retry re-prices from the latest mark. The old code fired once and hoped.
   */
  async _closeWithConfirm(marketId) {
    const mId = Number(marketId);
    if (typeof this.ex.closePosition !== 'function') return false;
    if (!this.ex.getPosition?.(mId)) {
      try { await this.ex.closePosition(mId); return true; }
      catch (error) {
        this._alert('平仓指令发送失败: ' + (error?.message || error));
        return false;
      }
    }
    for (let attempt = 1; attempt <= 3; attempt++) {
      try { await this.ex.closePosition(mId); }
      catch (e) { this._alert('平仓指令发送失败: ' + (e?.message || e)); }
      const t0 = Date.now();
      while (Date.now() - t0 < 8000) { // wait for the adapter's position poll to reflect it
        await sleep(1000);
        const pos = this.ex.getPosition?.(mId);
        if (!pos || !pos.sizeBase) { this._alert('✅ 已确认仓位已平。'); return true; }
      }
      if (attempt < 3) this._alert(`⚠️ 平仓后仓位仍在（第 ${attempt} 次），按最新价重试市价平仓…`);
    }
    this._alert('❌ 已尝试 3 次平仓但仓位仍未平掉，请立即到交易所手动处理！');
    return false;
  }

  /** 独立回收阶梯：始终在现价的"下一档步进"处维持一排 reduce-only 退出单。 */
  _manageRecoveryStandalone() {
    if (!this.running || !this.recovery || !this.config) return;
    const price = this.lastPrice;
    if (!Number.isFinite(price) || price <= 0) return;
    const pos = this.ex.getPosition?.(this.config.marketId);
    if (!pos || !pos.sizeBase) {
      // Require several CONSECUTIVE empty observations before declaring the
      // recovery finished — a single transient empty response from the position
      // endpoint (network blip) must not tear down the whole ladder.
      if (++this._noPosStreak >= 5) this._finishRecovery();
      return;
    }
    this._noPosStreak = 0;
    const sp = this.config.spacing;
    if (!(sp > 0)) return;
    const long = pos.sizeBase > 0;
    // "只在入场价以上(不亏)减仓"：多头只在 >= 成本价挂卖，空头只在 <= 成本价挂买。
    const aboveEntry = !!this.config.aboveEntryOnly;
    const entry = Number(pos.entryPrice) || 0;
    // Rungs needed = enough to fully exit the CURRENT position (not a fixed 30).
    // As fills shrink the position, `need` shrinks too, so the ladder never
    // over-provisions. Hard ceiling guards against a pathological position/step.
    const HARD_MAX = 80;
    const perRung = this.config.sizeBase || (Math.abs(pos.sizeBase) / 20);
    const need = Math.min(HARD_MAX, Math.max(1, Math.ceil(Math.abs(pos.sizeBase) / perRung)));
    // Occupied = our tracked recovery levels UNION the exchange's real resting
    // levels (from reconcile). Using the real set means a spurious "order gone"
    // can't trick us into stacking a second order on a level that is still live.
    const existing = new Set([...this.active.values()].filter((o) => o.recovery).map((o) => o.levelIndex));
    for (const idx of this._recoveryOccupied) existing.add(idx);
    let placed = 0;
    if (long) {
      let lv = Math.ceil(price / sp) * sp; if (lv <= price) lv += sp;
      if (aboveEntry && entry > 0) { const eLv = Math.ceil(entry / sp) * sp; if (lv < eLv) lv = eLv; } // 不在成本价下方卖
      for (let k = 0; k < HARD_MAX && existing.size + placed < need; k++, lv += sp) {
        const idx = Math.round(lv / sp);
        if (existing.has(idx)) continue;
        this._place({ levelIndex: idx, side: 'sell', price: lv, reduceOnly: true, recovery: true, opening: false });
        placed++;
      }
    } else {
      let lv = Math.floor(price / sp) * sp; if (lv >= price) lv -= sp;
      if (aboveEntry && entry > 0) { const eLv = Math.floor(entry / sp) * sp; if (lv > eLv) lv = eLv; } // 不在成本价上方买
      for (let k = 0; k < HARD_MAX && existing.size + placed < need; k++, lv -= sp) {
        const idx = Math.round(lv / sp);
        if (existing.has(idx)) continue;
        this._place({ levelIndex: idx, side: 'buy', price: lv, reduceOnly: true, recovery: true, opening: false });
        placed++;
      }
    }
    if (placed) this._changed();
  }

  /** 持仓已减完 -> 结束回收。 */
  _finishRecovery() {
    if (!this.recovery) return;
    this.recovery = false;
    this._stopReconcileTimer();
    this._recoveryOccupied = new Set();
    this.ex.off('fill', this._onFill);
    this.ex.off('price', this._onPrice);
    this.ex.cancelAll?.(this.config.marketId)?.catch?.(() => {});
    this.active.clear();
    this.running = false;
    this._alert('回收完成：持仓已全部减完，回收阶梯已停止。');
    this._changed();
  }

  /**
   * Reconcile our tracking against the exchange's REAL open orders:
   *  - prune tracked orders no longer on the book (missed fills/cancels),
   *  - refill grid levels that have no resting order on the exchange.
   * "Occupied" levels are derived from the real order prices, so this is robust
   * even when our in-memory tracking has drifted.
   */
  async reconcileOpenOrders() {
    if (!this.running || !this.config) return;
    if (typeof this.ex.fetchOpenOrders !== 'function') return;
    // Keep the adapter's price watch warm so a long-running market is never
    // pruned as "idle" (adapters drop unwatched markets after 10 min).
    this.ex.getPrice?.(this.config.marketId)?.catch?.(() => {});
    this._drainRetryQueue();
    const recovery = !!this.recovery;
    // Recovery has no grid: derive levels straight from price via config.spacing.
    const sp = recovery ? this.config.spacing : this.grid?.spacing;
    const lvl0 = recovery ? 0 : this.grid?.levels?.[0];
    if (!(sp > 0) || lvl0 == null) return;
    const nLevels = recovery ? Infinity : this.grid.levels.length;
    // Grid-mode recovery ladder (outOfRangeAction='recover') rests OUTSIDE the
    // grid: negative idx below the range, >= nLevels above. Widen the accepted
    // window so dedup/trim covers the ladder too (it used to be skipped, letting
    // duplicate ladder orders stack unchecked).
    const ladderPad = (!recovery && this.config.outOfRangeAction === 'recover') ? (this.grid?.count ?? 0) : 0;
    const idxLo = 0 - ladderPad, idxHi = nLevels === Infinity ? Infinity : nLevels + ladderPad;
    let real;
    try {
      real = await this.ex.fetchOpenOrders(this.config.marketId);
      this._ordersSyncedAt = Date.now();
      this._ordersSyncError = null;
    } catch (error) {
      this._ordersSyncError = error?.message || String(error);
      return;
    }
    if (!Array.isArray(real)) return;
    this._exchangeOpenOrders = real.length;
    const realIds = new Set(real.map((o) => String(o.orderId)));
    const now = Date.now();

    // GUARD against transient bad snapshots: Extended's open-order endpoint has
    // been observed returning "0 orders" while dozens are really resting. An
    // all-vanished snapshot while we track many is overwhelmingly an API glitch
    // (real fills arrive via fill events anyway) — trusting it once wiped 78
    // tracked orders and orphaned them on the exchange. Skip pruning entirely on
    // such a snapshot, and in general require an order to be missing from TWO
    // consecutive reconciles before pruning it.
    const massVanish = real.length === 0 && this.active.size >= 3;
    if (massVanish && now - (this._lastVanishAlertAt || 0) > 60000) {
      this._lastVanishAlertAt = now;
      this._alert(`⚠️ 挂单对账：交易所返回 0 单但本地跟踪 ${this.active.size} 单，疑似接口异常快照，本轮不清理（等待下轮复核）。`);
    }
    let pruned = 0;
    if (!massVanish) {
      for (const [oid, info] of [...this.active]) {
        if (realIds.has(oid)) { info.goneRecon = 0; continue; }
        if (now - (info.placedAt || 0) <= PRUNE_GRACE_MS) continue;
        info.goneRecon = (info.goneRecon || 0) + 1;
        if (info.goneRecon >= 2) { this.active.delete(oid); pruned++; }
      }
    }

    // Map real orders to levels. Cancel any DUPLICATE resting order on a level so
    // we converge to one-order-per-level (the root cause of count creep). ADOPT
    // any untracked survivor into tracking — in recovery mode that's a leftover
    // ladder; in grid mode it's an order we lost track of (e.g. a bad "0 orders"
    // snapshot once wiped tracking while the orders stayed live on the exchange).
    // Adoption restores accounting AND fill handling for those orphans.
    const occupied = new Set();
    let trimmed = 0, adopted = 0;
    for (const o of real) {
      const px = Number(o.price);
      if (!Number.isFinite(px) || !(sp > 0)) continue;
      const idx = Math.round((px - lvl0) / sp);
      if (!(idx >= idxLo && idx < idxHi)) continue;
      if (!occupied.has(idx)) {
        occupied.add(idx);
        if (!this.active.has(String(o.orderId))
            && ![...this.active.values()].some((a) => a.levelIndex === idx)) { // level truly unclaimed
          const side = o.side === 'buy' ? 'buy' : 'sell';
          // opening/closing heuristic (mirrors _handleFill's fallback): in short
          // mode buys close, otherwise sells close.
          const closing = recovery ? true : ((this.config.mode === 'short') ? side === 'buy' : side === 'sell');
          try { this.ex.adoptOrder?.({ orderId: o.orderId, marketId: this.config.marketId, levelIndex: idx, side, price: px, sizeBase: this.config.sizeBase }); } catch { /* ignore */ }
          this.active.set(String(o.orderId), { levelIndex: idx, side, price: px, opening: !closing, recovery, placedAt: now });
          adopted++;
        }
        continue;
      }
      try { await this.ex.cancelOrder(this.config.marketId, o.orderId); this.active.delete(String(o.orderId)); trimmed++; }
      catch { /* leave it; next cycle retries */ }
    }
    if (recovery) this._recoveryOccupied = occupied;

    // IMPORTANT: reconciliation no longer re-seeds opening orders. Re-seeding via
    // seedOrders re-opened a SAME-SIDE order on a level that a fill had just
    // (correctly) vacated — its take-profit order lives one rung away — which made
    // the grid open positions endlessly in one direction (runaway inventory).
    // The grid is now maintained ONLY by the normal fill -> opposite-leg
    // replacement chain. Reconcile just keeps tracking accurate (prune) and
    // enforces one-order-per-level (trim). It never opens new positions.
    if (pruned || trimmed || adopted) {
      this._alert(`挂单对账：交易所实际 ${real.length} 单；清理失效 ${pruned}，撤除重复 ${trimmed}${adopted ? `，接管 ${adopted}` : ''}。`);
      this._changed();
    }
  }

  /**
   * Read the exchange's current resting orders for the summary dashboard.
   * This deliberately does not reconcile/adopt/cancel/reseed anything, so a
   * periodic dashboard refresh can never mutate a LIVE order book.
   */
  async refreshExchangeOpenOrders() {
    if (!this.config || this.config.marketId == null) {
      return { ok: true, skipped: true, reason: '当前没有已选择的网格市场' };
    }
    if (typeof this.ex.fetchOpenOrders !== 'function') {
      return { ok: true, skipped: true, reason: '交易所未提供挂单查询接口' };
    }
    try {
      const rows = await this.ex.fetchOpenOrders(this.config.marketId);
      if (!Array.isArray(rows)) throw new Error('交易所挂单接口未返回列表');
      this._exchangeOpenOrders = rows.length;
      this._ordersSyncedAt = Date.now();
      this._ordersSyncError = null;
      return { ok: true, count: rows.length, syncedAt: this._ordersSyncedAt };
    } catch (error) {
      this._ordersSyncError = error?.message || String(error);
      return { ok: false, error: this._ordersSyncError, syncedAt: this._ordersSyncedAt };
    }
  }

  _startReconcileTimer() {
    if (this._reconTimer) return;
    this._reconTimer = setInterval(() => { this.reconcileOpenOrders().catch(() => {}); }, RECONCILE_MS);
    this._reconTimer.unref?.();
  }
  _stopReconcileTimer() { if (this._reconTimer) { clearInterval(this._reconTimer); this._reconTimer = null; } }

  _alert(message) {
    this.alerts.unshift({ t: Date.now(), message });
    if (this.alerts.length > 30) this.alerts.pop();
  }

  /** Per-exchange health classification surfaced to the dashboard. */
  _health() {
    const ex = this.ex;
    const okAge = (typeof ex.lastOkAt === 'number' && ex.lastOkAt > 0) ? Date.now() - ex.lastOkAt : null;
    const priceStale = !!(ex._pxStale && this.config && typeof ex._pxStale.has === 'function' && ex._pxStale.has(this.config.marketId));
    const recentFail = this._lastFailAt && (Date.now() - this._lastFailAt < 60000);
    const paused = this._refillPausedUntil && Date.now() < this._refillPausedUntil;
    let status = 'ok', reason = '正常运行';
    if (!this.running && !this.config) { status = 'idle'; reason = '未运行'; }
    else if (paused) { status = 'error'; reason = `订单频繁被取消（疑似保证金不足），已暂停补单 ${Math.ceil((this._refillPausedUntil - Date.now())/1000)}s`; }
    else if (ex.dataSource === 'synthetic') { status = 'warn'; reason = '合成行情（未连真实交易所）'; }
    else if (okAge != null && okAge > 30000) { status = 'error'; reason = `交易所数据 ${Math.round(okAge / 1000)}s 未更新`; }
    else if (priceStale) { status = 'warn'; reason = '行情滞后（已用持仓推算价兜底）'; }
    else if (recentFail) { status = 'warn'; reason = `近1分钟下单失败 ${this._placeFails} 次`; }
    return {
      status, reason,
      dataSource: ex.dataSource ?? null,
      lastOkAgeMs: okAge,
      priceStale,
      placeFails: this._placeFails,
      exchangeOpenOrders: this._exchangeOpenOrders,
      ordersSyncedAt: this._ordersSyncedAt,
      ordersSyncError: this._ordersSyncError,
    };
  }

  getState() {
    const pos = this.running || this.config ? this.ex.getPosition?.(this.config?.marketId) : null;
    const openByLevel = {};
    for (const o of this.active.values()) openByLevel[o.levelIndex] = o.side;

    const unrealized = pos ? round2(pos.unrealizedPnl) : 0;
    const balance = typeof this.ex.balance === 'number' ? round2(this.ex.balance) : null;
    const equityRaw = typeof this.ex.equity === 'number' ? this.ex.equity
      : (balance != null ? balance + unrealized : null);
    const equity = equityRaw != null ? round2(equityRaw) : null;

    let realized;
    if (typeof this.ex.realizedPnl === 'number') {
      realized = round2(this.ex.realizedPnl - (this._pnlBase ?? 0)); // offset applied by resetStats
    } else {
      // Available collateral can fall merely because resting orders reserve or
      // transfer margin (Phoenix isolated subaccounts are the clearest case).
      // That is not a realized loss. Without an authoritative venue figure,
      // only confirmed fill cycles may contribute to realized grid PnL.
      realized = round2(this.stats.gridProfit);
    }
    const totalPnl = round2(realized + unrealized);
    const returnPct = (this.startBalance && this.startBalance > 0)
      ? round2((totalPnl / this.startBalance) * 100)
      : ((equity && equity > 0) ? round2((totalPnl / equity) * 100) : null);
    return {
      mode: this.ex.mode,
      recovery: this.recovery,
      running: this.running,
      config: this.config,
      grid: this.grid,
      lastPrice: this.lastPrice != null ? round2(this.lastPrice) : null,
      outOfRange: this.outOfRange,
      risk: this.risk,
      stats: this.stats,
      openOrders: this.active.size,
      exchangeOpenOrders: this._exchangeOpenOrders,
      ordersSyncedAt: this._ordersSyncedAt,
      ordersSyncError: this._ordersSyncError,
      openByLevel,
      completedByLevel: { ...this.completedByLevel },
      health: this._health(),
      position: pos ? {
        sizeBase: round6(pos.sizeBase),
        entryPrice: round2(pos.entryPrice),
        liquidationPrice: pos.liquidationPrice != null && Number.isFinite(Number(pos.liquidationPrice)) ? round6(Number(pos.liquidationPrice)) : null,
        liquidationPriceStatus: pos.liquidationPriceStatus
          ?? (pos.liquidationPrice != null && Number.isFinite(Number(pos.liquidationPrice)) ? 'available' : 'unavailable'),
        liquidationPriceSource: pos.liquidationPriceSource
          ?? (pos.liquidationPrice != null && Number.isFinite(Number(pos.liquidationPrice)) ? 'exchange' : null),
        unrealizedPnl: round2(pos.unrealizedPnl),
        leverage: pos.leverage ?? null,
      } : null,
      realizedPnl: realized,
      unrealizedPnl: unrealized,
      totalPnl,
      returnPct,
      equity,
      balance,
      volume: this.stats.volume,
      theoreticalProfit: round2(this.stats.gridProfit),
      startBalance: this.startBalance != null ? round2(this.startBalance) : null,
      fills: this.fills.slice(0, 20),
      alerts: this.alerts.slice(0, 12),
    };
  }
}

function labelMode(m) { return m === 'long' ? '做多网格' : m === 'short' ? '做空网格' : '中性网格'; }

function normalizeCompletedByLevel(value) {
  const normalized = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return normalized;
  for (const [rawIndex, rawCount] of Object.entries(value)) {
    const index = Number(rawIndex);
    const count = Number(rawCount);
    if (!Number.isInteger(index) || index < 0 || !Number.isFinite(count) || count <= 0) continue;
    normalized[index] = Math.floor(count);
  }
  return normalized;
}

function round2(x) { return Math.round(x * 100) / 100; }
function round6(x) { return Math.round(x * 1e6) / 1e6; }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
