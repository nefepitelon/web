const POSITION_EPSILON = 1e-10;

function valuesOf(value) {
  if (value instanceof Map) return [...value.values()];
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

function positionKey(position) {
  return [position?.marketId ?? '', Number(position?.sizeBase || 0), Number(position?.entryPrice || 0)].join(':');
}

function collectCachedPositions(exchange, statePosition, marketId) {
  const rows = [];
  if (statePosition) rows.push({ ...statePosition, marketId });
  if (marketId != null && typeof exchange?.getPosition === 'function') {
    const current = exchange.getPosition(marketId);
    if (current) rows.push({ ...current, marketId: current.marketId ?? marketId });
  }
  for (const field of ['_positions', '_pos', 'positions']) {
    const source = exchange?.[field];
    if (source instanceof Map) {
      for (const [id, position] of source) rows.push({ ...position, marketId: position?.marketId ?? id });
    } else {
      rows.push(...valuesOf(source));
    }
  }
  const unique = new Map();
  for (const row of rows) {
    const sizeBase = Number(row?.sizeBase || 0);
    if (!Number.isFinite(sizeBase) || Math.abs(sizeBase) <= POSITION_EPSILON) continue;
    const normalized = {
      marketId: row?.marketId ?? marketId ?? null,
      sizeBase,
      entryPrice: Number(row?.entryPrice || 0) || null,
    };
    unique.set(positionKey(normalized), normalized);
  }
  return [...unique.values()];
}

function countCachedOrders(exchange, stateOpenOrders) {
  const counts = [Number(stateOpenOrders || 0)];
  for (const field of ['_tracked', 'orders', '_orders']) {
    // Deletion is account-scoped, so orders from every market owned by this
    // adapter must count. Filtering by the bot's last market could hide stale
    // orders after the user changes markets.
    const rows = valuesOf(exchange?.[field]);
    counts.push(rows.length);
  }
  return Math.max(0, ...counts.filter(Number.isFinite));
}

function collectKnownMarketIds(exchange, state) {
  const ids = new Map();
  const add = (value) => {
    if (value !== undefined && value !== null && String(value).trim()) ids.set(String(value), value);
  };
  add(state?.config?.marketId);
  add(state?.position?.marketId);
  for (const field of ['_tracked', 'orders', '_orders', '_positions', '_pos', 'positions']) {
    const source = exchange?.[field];
    if (source instanceof Map) {
      for (const [key, row] of source) add(row?.marketId ?? key);
    } else {
      for (const row of valuesOf(source)) add(row?.marketId);
    }
  }
  return [...ids.values()];
}

function verificationError(error) {
  const message = error?.message || String(error);
  const wrapped = new Error(`无法实时确认该账号的挂单和持仓，已拒绝删除：${message}`);
  wrapped.code = 'INSTANCE_RISK_CHECK_FAILED';
  wrapped.cause = error;
  return wrapped;
}

/**
 * Fail-closed removal check. LIVE instances must successfully refresh their
 * account and every known managed market's open orders. Cached collections are also
 * inspected so a stopped bot cannot hide a still-open position/order.
 */
export async function inspectExchangeInstanceExposure({ bot, exchange, mode }) {
  let state = bot?.getState?.() || {};
  const marketId = state.config?.marketId ?? null;
  const live = mode === 'live';

  if (live) {
    try {
      if (typeof exchange?._refreshAccount === 'function') await exchange._refreshAccount();
    } catch (error) {
      throw verificationError(error);
    }
    state = bot?.getState?.() || state;
  }

  const marketIds = collectKnownMarketIds(exchange, state);
  let remoteOpenOrders = null;
  if (live && marketIds.length > 0) {
    if (typeof exchange?.fetchOpenOrders !== 'function') {
      throw verificationError(new Error('交易所适配器未提供实时挂单查询能力'));
    }
    try {
      remoteOpenOrders = 0;
      for (const id of marketIds) {
        const rows = await exchange.fetchOpenOrders(id);
        if (!Array.isArray(rows)) throw new Error(`交易所挂单接口未返回列表（市场 ${id}）`);
        remoteOpenOrders += rows.length;
      }
    } catch (error) {
      throw verificationError(error);
    }
  }

  const cachedOpenOrders = countCachedOrders(exchange, state.openOrders);
  const positions = collectCachedPositions(exchange, state.position, marketId);
  const openOrders = Math.max(cachedOpenOrders, remoteOpenOrders ?? 0);
  const running = Boolean(state.running);
  return {
    safeToDelete: !running && openOrders === 0 && positions.length === 0,
    running,
    mode: live ? 'live' : 'paper',
    marketId,
    marketIds,
    openOrders,
    remoteOpenOrders,
    positions,
  };
}
