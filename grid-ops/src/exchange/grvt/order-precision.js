import BigNumber from 'bignumber.js';

// Keep wire decimals and EIP-712 integers identical, without binary-float math.
const Decimal = BigNumber.clone({ DECIMAL_PLACES: 40 });
const UINT64_MAX = new Decimal('18446744073709551615');

function positive(value, label) {
  const result = new Decimal(value ?? NaN);
  if (!result.isFinite() || !result.gt(0)) throw new Error(`GRVT ${label}必须为有效正数。`);
  return result;
}

export function grvtUnits(value, decimals) {
  const units = new Decimal(value).shiftedBy(decimals);
  if (!units.isFinite() || !units.isInteger() || units.lt(0) || units.gt(UINT64_MAX)) {
    throw new Error('GRVT 订单精度或数值超出 uint64 签名范围。');
  }
  return BigInt(units.toFixed(0));
}

export function normalizeGrvtOrder(order, market, isMarket = false) {
  if (order.side !== 'buy' && order.side !== 'sell') throw new Error('GRVT 订单方向必须为 buy 或 sell。');
  const decimals = Number(market.baseDecimals);
  if (!Number.isInteger(decimals) || Math.abs(decimals) > 18) {
    throw new Error('GRVT 缺少有效的数量精度，请刷新交易所市场信息。');
  }
  // base_decimals is the EIP-712 scale, NOT the tradable lot. For example,
  // XPL has base_decimals=6 but min_size=1: 93.432203 is not a valid order.
  // Keep the raw decimal lot from the instrument response and fail closed if
  // it is unavailable/incompatible; guessing a finer lot causes GRVT 2065.
  const lot = positive(market.sizeStep ?? market.stepSize, '最小数量步长 min_size');
  grvtUnits(lot, decimals);
  const size = positive(order.sizeBase, '订单数量').dividedToIntegerBy(lot).times(lot);
  if (!size.gt(0)) throw new Error(`GRVT 订单数量按最小数量步长 ${lot.toFixed()} 对齐后为 0，请调整每格数量。`);
  let price = new Decimal(0);
  if (!isMarket) {
    const tick = positive(market.tickSize ?? market.stepPrice, '价格步长 tick_size');
    // Move away from the market, never toward it: preserve maker/limit intent.
    price = positive(order.price, '订单价格').div(tick)
      .integerValue(order.side === 'buy' ? Decimal.ROUND_FLOOR : Decimal.ROUND_CEIL).times(tick);
    if (!price.gt(0)) throw new Error('GRVT 订单价格按 tick_size 对齐后为 0，请调整网格区间。');
    if (!order.reduceOnly) {
      if (size.lt(market.minOrderSize || 0)) throw new Error(`GRVT 每格数量低于最小数量 ${market.minOrderSize}。`);
      if (size.times(price).lt(market.minNotional || 0)) throw new Error(`GRVT 每格名义金额低于最小金额 ${market.minNotional}，请调整每格数量。`);
    }
  }
  // Reject unsupported precision before signing or making any network writes.
  grvtUnits(size, decimals);
  grvtUnits(price, 9);
  return { price: price.toFixed(), sizeBase: size.toFixed() };
}
