import assert from "node:assert/strict";
import { HALF_BAND, REF_MID, anchorGrid } from "../src/config.js";
import {
  assertFeeOk,
  assertMarginOk,
  buildGrid,
  computeRisk,
  planFromFillsAndSeed,
  seedOrders,
} from "../src/grid.js";
import { resolveLiveSizing } from "../src/liveSizing.js";
import { summarizeOfficialStats, type OfficialBundle } from "../src/officialStats.js";
import {
  configureDecibelSelfPayGas,
  configureDecibelGasStationErrors,
  formatDecibelGasStationError,
  formatDecibelTransactionError,
  isDecibelFeeBalanceError,
  isDecibelGasStationError,
} from "../src/venues/decibelLive.js";
import {
  isNadoOrderRuleError,
  roundNadoPrice,
  roundNadoSize,
} from "../src/venues/nado.js";

function checkVenue(label: string, gridCount: number, expectEach: number, mid: number) {
  const base = {
    lower: 0,
    upper: 0,
    halfBand: HALF_BAND,
    gridCount,
    sizeBase: 0,
    leverage: 30,
    feeRate: 0.0005,
    equityUsd: 800,
    marginFraction: 0.3,
    maxWritesPerTick: 10,
    mode: "neutral" as const,
    skipBand: 0.25,
  };
  const anchored = anchorGrid(base, mid);
  const g = buildGrid({
    lower: anchored.lower,
    upper: anchored.upper,
    gridCount,
  });
  assert.equal(g.levels.length, gridCount + 1);
  const expectHalf = mid * (HALF_BAND / REF_MID);
  assert.ok(Math.abs(anchored.lower - (mid - expectHalf)) < 1e-6);
  assert.ok(Math.abs(anchored.upper - (mid + expectHalf)) < 1e-6);

  const seeds = seedOrders({
    levels: g.levels,
    price: mid,
    mode: "neutral",
    spacing: g.spacing,
  });
  const buys = seeds.filter((s) => s.side === "buy").length;
  const sells = seeds.filter((s) => s.side === "sell").length;
  assert.equal(buys, expectEach, `${label} buy`);
  assert.equal(sells, expectEach, `${label} sell`);

  const risk = computeRisk(
    g,
    {
      sizeBase: anchored.sizeBase,
      leverage: 30,
      equityUsd: 800,
      marginFraction: 0.3,
    },
    mid
  );
  const fee = assertFeeOk(risk.spacingPct, 0.0005);
  assert.equal(fee.ok, true, `${label} fee ${fee.message}`);
  const margin = assertMarginOk(risk, 800, 0.3);
  assert.equal(margin.ok, true, `${label} margin`);
  console.log(
    `${label}: mid=${mid} count=${gridCount} ≈上下各${expectEach} spacing=${g.spacing.toFixed(2)} size=${anchored.sizeBase} perRung≈${risk.perRungProfit}U spacingPct=${risk.spacingPct}%`
  );
}

for (const mid of [65_000, 97_500, 120_000]) {
  checkVenue(`ext/n1@${mid}`, 80, 40, mid);
  checkVenue(`ris/dec@${mid}`, 50, 25, mid);
}

{
  const base = {
    lower: 0,
    upper: 0,
    halfBand: Math.round(REF_MID * 0.045),
    gridCount: 80,
    sizeBase: 0,
    leverage: 30,
    feeRate: 0.0001,
    equityUsd: 200.19,
    marginFraction: 0.7,
    maxWritesPerTick: 10,
    mode: "neutral" as const,
    skipBand: 0.5,
  };
  const anchored = anchorGrid(base, 63_133.03, {
    sizeIncrement: 0.00005,
    minOrderNotionalUsd: 100,
  });
  assert.equal(anchored.gridCount, 38);
  assert.equal(anchored.sizeBase, 0.00175);
  assert.ok(anchored.sizeBase * anchored.lower >= 100);
  const built = buildGrid({
    lower: anchored.lower,
    upper: anchored.upper,
    gridCount: anchored.gridCount,
  });
  const risk = computeRisk(built, anchored, 63_133.03);
  assert.ok(risk.requiredMargin <= base.equityUsd * base.marginFraction);
  assert.ok(risk.notional <= base.equityUsd * base.marginFraction * base.leverage);

  assert.equal(roundNadoSize(0.00083236, 0.00005), 0.0008);
  assert.equal(roundNadoSize(0.001799, 0.00005), 0.00175);
  assert.equal(roundNadoPrice(60_292.4, 1), 60_292);
  assert.equal(isNadoOrderRuleError(new Error("2094: Invalid order size")), true);
  assert.throws(
    () =>
      anchorGrid({ ...base, equityUsd: 1 }, 63_133.03, {
        sizeIncrement: 0.00005,
        minOrderNotionalUsd: 100,
      }),
    /实时可用资金不足/
  );
}

{
  const callbacks: Array<(error: unknown, response?: { status?: number }) => unknown> = [];
  const write = {
    aptos: {
      config: {
        getTransactionSubmitter: () => ({
          client: {
            client: {
              interceptors: {
                error: { use: (callback: (error: unknown, response?: { status?: number }) => unknown) => callbacks.push(callback) },
              },
            },
          },
        }),
      },
    },
  };
  assert.equal(configureDecibelGasStationErrors(write), true);
  assert.equal(callbacks.length, 1);
  const adapted = callbacks[0]!({ message: "Unauthorized: API key not found" }, { status: 401 });
  assert.ok(adapted instanceof Error);
  assert.match((adapted as Error).message, /Gas Station 鉴权失败/);
  assert.match((adapted as Error).message, /HTTP 401/);
  assert.equal(isDecibelGasStationError((adapted as Error).message), true);
  assert.equal(configureDecibelGasStationErrors({}), false);
  assert.match(
    formatDecibelGasStationError({ message: "policy allowlist rejected" }, 403),
    /策略拒绝/
  );
  assert.match(
    formatDecibelTransactionError({ message: "Unauthorized: API key not found" }),
    /不是 Decibel\/Node API Key/
  );
}

{
  const base = {
    lower: 0,
    upper: 0,
    halfBand: HALF_BAND,
    gridCount: 80,
    sizeBase: 0,
    leverage: 30,
    feeRate: 0.0005,
    equityUsd: 800,
    marginFraction: 0.7,
    maxWritesPerTick: 10,
    mode: "neutral" as const,
    skipBand: 0.5,
  };
  const sizing = resolveLiveSizing(base, {
    venue: "extended",
    market: "BTC",
    mid: 63_000,
    position: 0,
    equityUsd: 83.54,
    availableForTradeUsd: 5,
    // 环境模板仍是 30x，但真实 Extended 子账户当前是 10x。
    leverage: 10,
    openOrders: Array.from({ length: 4 }, (_, i) => ({
      id: `old-${i}`,
      market: "BTC",
      side: "buy" as const,
      price: 60_000 + i * 70,
      size: 0.0033332,
      level: i,
    })),
  });
  assert.ok(sizing.equityUsd > 60 && sizing.equityUsd <= 83.54);
  assert.equal(sizing.leverage, 10);
  const anchored = anchorGrid(
    {
      ...base,
      equityUsd: sizing.equityUsd,
      leverage: sizing.leverage ?? base.leverage,
    },
    63_000,
    { sizeIncrement: 0.00001, minOrderSize: 0.0001 }
  );
  assert.equal(anchored.sizeBase, 0.00011);
  assert.ok(
    Math.abs(
      Math.round(anchored.sizeBase / 0.00001) * 0.00001 -
        anchored.sizeBase
    ) < 1e-12
  );

  const levels = buildGrid({
    lower: anchored.lower,
    upper: anchored.upper,
    gridCount: anchored.gridCount,
  });
  const resize = planFromFillsAndSeed({
    market: "BTC",
    mid: 63_000,
    levels: levels.levels,
    spacing: levels.spacing,
    mode: "neutral",
    sizeBase: anchored.sizeBase,
    openOrders: [
      {
        id: "old-large",
        market: "BTC",
        side: "buy",
        price: levels.levels[10]!,
        size: 0.0033332,
        level: 10,
      },
    ],
    prevActive: new Map(),
    maxWrites: 10,
    seeded: true,
    sizeTolerance: 0.000005,
  });
  assert.deepEqual(resize.intents, [
    { type: "cancel", orderId: "old-large", market: "BTC" },
  ]);
}

console.log("grid.test.ts OK");

{
  const unavailable = (venue: keyof OfficialBundle["venues"]) => ({
    venue,
    ok: false,
    source: "unavailable" as const,
    volume: null,
    fees: null,
    realizedPnl: null,
    fills: null,
    closeFills: null,
    feeMaker: null,
    feeTaker: null,
    updatedAt: new Date(0).toISOString(),
  });
  const bundle: OfficialBundle = {
    dayKey: "2026-08-17",
    dayStartMs: Date.parse("2026-08-17T00:00:00+08:00"),
    updatedAt: "2026-08-17T01:00:00.000Z",
    venues: {
      extended: { ...unavailable("extended"), ok: true, source: "official", volume: 408.93, fees: 0, realizedPnl: 0.1591, fills: 5, closeFills: 1 },
      risex: { ...unavailable("risex"), ok: true, source: "official", volume: 1239.37, fees: 0.1239, realizedPnl: 0.424, fills: 9, closeFills: 2 },
      phoenix: { ...unavailable("phoenix"), ok: true, source: "official", volume: 15795.53, fees: 0.7108, realizedPnl: 4.5746, fills: 21, closeFills: 3 },
      nado: unavailable("nado"),
      decibel: unavailable("decibel"),
      n1: unavailable("n1"),
      phoenix2: unavailable("phoenix2"),
      popdex: unavailable("popdex"),
    },
  };
  const summary = summarizeOfficialStats(bundle, ["extended", "risex", "phoenix", "nado"]);
  assert.equal(summary.volume, 17443.83);
  assert.equal(summary.volumeVenues, 3);
  assert.equal(summary.realizedPnl, 5.1577);
  assert.equal(summary.fees, 0.8347);
  assert.equal(summary.netPnl, 4.323);
  assert.equal(summary.pnlVenues, 3);
  assert.equal(summary.fills, 35);
  assert.equal(summary.completedRungs, 6);
}

{
  const write = {
    aptos: { config: { transactionGenerationConfig: { defaultMaxGasAmount: 200_000 } } },
  };
  assert.equal(configureDecibelSelfPayGas(write), true);
  assert.equal(write.aptos.config.transactionGenerationConfig.defaultMaxGasAmount, 1);
  assert.equal(configureDecibelSelfPayGas({}), false);
}

{
  const raw =
    'Request to [Fullnode] failed with: {"message":"Invalid transaction: Validation Code: INSUFFICIENT_BALANCE_FOR_TRANSACTION_FEE"}';
  const message = formatDecibelTransactionError(raw);
  assert.equal(isDecibelFeeBalanceError(raw), true);
  assert.equal(isDecibelFeeBalanceError(message), true);
  assert.match(message, /USDC 不能支付 Aptos 链上 Gas/);
  assert.match(message, /DECIBEL_GAS_STATION_API_KEY/);
  assert.equal(formatDecibelTransactionError("other failure"), "other failure");
}
