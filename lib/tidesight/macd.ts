export type MacdSignal = "GOLDEN_CROSS" | "REBIRTH_GOLDEN_CROSS" | "DEATH_CROSS" | "NONE";

export type MacdPoint = {
  index: number;
  dif: number;
  dea: number;
  histogram: number;
};

export type MacdCross = MacdPoint & {
  signal: Exclude<MacdSignal, "NONE">;
};

export type MacdChartCandle = {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type MacdChartPoint = MacdChartCandle & Omit<MacdPoint, "index"> & {
  signal: MacdSignal;
};

function ema(values: number[], period: number) {
  const output: Array<number | null> = Array(values.length).fill(null);
  if (values.length < period) return output;

  let current = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  output[period - 1] = current;
  const multiplier = 2 / (period + 1);
  for (let index = period; index < values.length; index += 1) {
    current = ((values[index] - current) * multiplier) + current;
    output[index] = current;
  }
  return output;
}

export function calculateMacd(closes: number[]) {
  if (closes.length < 35 || closes.some((value) => !Number.isFinite(value) || value <= 0)) return [];

  const fast = ema(closes, 12);
  const slow = ema(closes, 26);
  const difValues: number[] = [];
  const difIndexes: number[] = [];
  for (let index = 0; index < closes.length; index += 1) {
    const fastValue = fast[index];
    const slowValue = slow[index];
    if (fastValue == null || slowValue == null) continue;
    difValues.push(fastValue - slowValue);
    difIndexes.push(index);
  }

  const signal = ema(difValues, 9);
  const points: MacdPoint[] = [];
  for (let index = 0; index < difValues.length; index += 1) {
    const signalValue = signal[index];
    if (signalValue == null) continue;
    const dif = difValues[index];
    const dea = signalValue;
    points.push({ index: difIndexes[index], dif, dea, histogram: (dif - dea) * 2 });
  }
  return points;
}

export function classifyMacdCross(previous: MacdPoint, current: MacdPoint): MacdSignal {
  const crossesUp = previous.dif <= previous.dea && current.dif > current.dea;
  const crossesDown = previous.dif >= previous.dea && current.dif < current.dea;

  if (crossesUp && current.dif < 0 && current.dea < 0 && current.dif > previous.dif) {
    return "REBIRTH_GOLDEN_CROSS";
  }
  if (crossesUp) return "GOLDEN_CROSS";
  if (crossesDown && current.dif > 0 && current.dea > 0 && current.dif < previous.dif) {
    return "DEATH_CROSS";
  }
  return "NONE";
}

export function findLatestMacdCross(points: MacdPoint[]): MacdCross | null {
  for (let index = points.length - 1; index > 0; index -= 1) {
    const signal = classifyMacdCross(points[index - 1], points[index]);
    if (signal !== "NONE") return { ...points[index], signal };
  }
  return null;
}

export function buildMacdChartSeries(candles: MacdChartCandle[], maxPoints = 120): MacdChartPoint[] {
  const valid = candles.filter((candle) => {
    const values = [candle.openTime, candle.closeTime, candle.open, candle.high, candle.low, candle.close, candle.volume];
    return values.every(Number.isFinite)
      && candle.openTime > 0
      && candle.closeTime >= candle.openTime
      && candle.open > 0
      && candle.high >= Math.max(candle.open, candle.close)
      && candle.low <= Math.min(candle.open, candle.close)
      && candle.low > 0
      && candle.volume >= 0;
  });
  const macd = calculateMacd(valid.map((candle) => candle.close));
  if (!macd.length) return [];

  const series: MacdChartPoint[] = [];
  for (let pointIndex = 0; pointIndex < macd.length; pointIndex += 1) {
    const point = macd[pointIndex];
    const candle = valid[point.index];
    if (!candle) continue;
    const previous = macd[pointIndex - 1];
    series.push({
      ...candle,
      dif: point.dif,
      dea: point.dea,
      histogram: point.histogram,
      signal: previous ? classifyMacdCross(previous, point) : "NONE",
    });
  }
  return series.slice(-Math.max(40, Math.min(180, Math.trunc(maxPoints))));
}
