import { PERCENT_SUPPLY_PROFIT_SEED } from "../data/percent-supply-profit-seed.js";

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

const average = (values) => {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const rollingAverage = (values, windowSize) => values.map((_, index) => {
  const start = Math.max(0, index - windowSize + 1);
  return average(values.slice(start, index + 1));
});

const normalizeSeed = () => PERCENT_SUPPLY_PROFIT_SEED
  .map(([date, price, profitSupply, lossSupply]) => ({
    date,
    price: Number(price),
    profitSupply: Number(profitSupply),
    lossSupply: Number(lossSupply),
  }))
  .filter((row) => row.date && row.price > 0 && row.profitSupply >= 0 && row.lossSupply >= 0);

export const createSupplyProfitLossProxySeries = () => {
  const rows = normalizeSeed();
  const rawRatios = rows.map((row) => row.profitSupply / Math.max(row.lossSupply, 1));
  const smoothedRatios = rollingAverage(rawRatios, 7);

  return rows.map((row, index) => ({
    date: row.date,
    price: row.price,
    ratioRaw: rawRatios[index],
    activeProfitSupply: row.profitSupply,
    lossSupply: row.lossSupply,
    dormantOverSeven: 0,
    activeSupply: row.profitSupply + row.lossSupply,
    ratio: smoothedRatios[index],
  }));
};

export const createRhodlProxySeries = () => {
  const rows = normalizeSeed();
  let longTermBasis = rows[0]?.price || 1;
  const values = rows.map((row, index) => {
    longTermBasis += (row.price - longTermBasis) * (2 / 731);
    const priorPrice = rows[Math.max(0, index - 30)]?.price || row.price;
    const momentum = Math.abs(Math.log(row.price / Math.max(priorPrice, 0.01)));
    const valuation = Math.max(row.price / Math.max(longTermBasis, 0.01), 0.05);
    return clamp(120 + 320 * Math.pow(valuation, 2.4) + 12000 * momentum, 50, 200000);
  });
  const monthly = rollingAverage(values, 30);

  return rows.map((row, index) => ({
    date: row.date,
    price: row.price,
    rhodl: values[index],
    rhodl1m: monthly[index],
  }));
};

export const createVddProxySeries = () => {
  const rows = normalizeSeed();
  let annualBasis = rows[0]?.price || 1;
  const rawValues = rows.map((row, index) => {
    annualBasis += (row.price - annualBasis) * (2 / 366);
    const previousPrice = rows[Math.max(0, index - 1)]?.price || row.price;
    const dailyMove = Math.abs(Math.log(row.price / Math.max(previousPrice, 0.01)));
    const valuationPressure = Math.max(0, row.price / Math.max(annualBasis, 0.01) - 1);
    return clamp(0.42 + dailyMove * 18 + valuationPressure * 0.65, 0.25, 8);
  });
  const values = rollingAverage(rawValues, 7);

  return rows.map((row, index) => ({
    date: row.date,
    price: row.price,
    vdd: values[index],
  }));
};

export const createLthNuplProxySeries = () => {
  const rows = normalizeSeed();
  let longTermBasis = rows[0]?.price || 1;
  const rawValues = rows.map((row) => {
    longTermBasis += (row.price - longTermBasis) * (2 / 731);
    return clamp((row.price - longTermBasis) / Math.max(row.price, 0.01), -1, 0.85);
  });
  const values = rollingAverage(rawValues, 14);

  return rows.map((row, index) => ({
    date: row.date,
    price: row.price,
    nupl: values[index],
  }));
};
