const DEFAULT_PATHS = [
  'liquidationPrice',
  'liquidation_price',
  'estimatedLiquidationPrice',
  'estimated_liquidation_price',
  'estimatedLiquidationPriceUsd',
  'estimated_liquidation_price_usd',
  'liquidationPriceUsd',
  'liquidation_price_usd',
  'liquidationPx',
  'liquidation_px',
  'liqPrice',
  'liq_price',
  'risk.liquidationPrice',
  'risk.liquidation_price',
  'margin.liquidationPrice',
  'margin.liquidation_price',
  'position.liquidationPrice',
  'position.liquidation_price',
];

function readPath(value, path) {
  return String(path).split('.').reduce((current, key) => current?.[key], value);
}

/**
 * Convert exchange/SDK numeric wrappers (including TokenAmount and BigNumber)
 * without treating an absent value as zero.
 */
export function finiteExchangeNumber(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  if (typeof value === 'object') {
    for (const key of ['ui', 'decimal', 'display', 'number']) {
      if (value[key] != null && value[key] !== value) {
        const number = finiteExchangeNumber(value[key]);
        if (number != null) return number;
      }
    }
    if (typeof value.toNumber === 'function') {
      try {
        const number = Number(value.toNumber());
        if (Number.isFinite(number)) return number;
      } catch { /* try string form */ }
    }
    if (typeof value.toString === 'function') {
      try {
        const text = value.toString();
        if (text !== '[object Object]') {
          const number = Number(text);
          if (Number.isFinite(number)) return number;
        }
      } catch { /* invalid wrapper */ }
    }
    // TokenAmount uses `value` when `ui` is unavailable. It is a final
    // compatibility fallback because raw integer units are uncommon here.
    if (value.value != null && value.value !== value) return finiteExchangeNumber(value.value);
    return null;
  }
  const number = Number(String(value).trim());
  return Number.isFinite(number) ? number : null;
}

/**
 * Return both the value and its semantics. Several exchanges deliberately
 * return 0 when current collateral means no finite liquidation boundary; that
 * must not be collapsed into the same state as a missing response field.
 */
export function extractLiquidationPrice(row, paths = DEFAULT_PATHS) {
  for (const path of paths) {
    const raw = readPath(row, path);
    if (raw == null || raw === '') continue;
    const value = finiteExchangeNumber(raw);
    if (value == null || value < 0) continue;
    if (value === 0) {
      return {
        liquidationPrice: null,
        liquidationPriceStatus: 'none',
        liquidationPriceSource: 'exchange',
      };
    }
    return {
      liquidationPrice: value,
      liquidationPriceStatus: 'available',
      liquidationPriceSource: 'exchange',
    };
  }
  return {
    liquidationPrice: null,
    liquidationPriceStatus: 'unavailable',
    liquidationPriceSource: null,
  };
}
