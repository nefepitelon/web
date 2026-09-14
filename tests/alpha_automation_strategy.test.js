const test = require("node:test");
const assert = require("node:assert/strict");
require("tsx/cjs");
const {
  alphaAutomationSettingsSchema, DEFAULT_ALPHA_AUTOMATION_SETTINGS,
  selectAlphaAutomationCandidates, normalizeAlphaAutomationSymbol, ALPHA_AUTOMATION_STRATEGIES, matchAlphaAutomationStrategies,
  diagnoseAlphaAutomationSettings, diagnoseAlphaAutomationStrategies,
} = require("../lib/alpha-execution/automation-strategy.ts");
const {evaluateTradeIntent} = require("../workers/risk_engine.js");
const {validateAutomaticOrder} = require("../lib/alpha-execution/automation-guard.ts");

const now = Date.parse("2026-09-09T10:00:00.000Z");
function observation(source, overrides = {}) {
  return {source, evidenceId:`${source}:BTC:upstream-event-1`, symbol:"BTC", side:"LONG", score:source === "momentum" ? null : 86,
    observedAt:now-1000, dataComplete:true, overheated:false, sameCoinCount:source === "signal" ? 1 : null,
    priceMomentumScore:source === "anomaly" ? 90 : null, volumeAnomalyScore:source === "anomaly" ? 92 : null, ...overrides};
}
function market(overrides = {}) {
  return {symbol:"BTCUSDT",market:"futures",tradable:true,observedAt:now-1000,quoteAt:now-1000,
    bid:99.99,ask:100.01,quoteVolume24h:30_000_000,return15mPct:0.4,return1hPct:1,return24hPct:3,
    volumeMultiple:1.5,atrPct:1,fundingPct:0.005,oiChangePct:2,estimatedSlippagePct:0.1,
    liquidityNotional:100,takerFeePct:0.05,
    filters:{tickSize:0.01,stepSize:0.001,minQty:0.001,maxQty:100_000,minNotional:5,maxNotional:null},...overrides};
}
function account(overrides = {}) {
  return {observedAt:now-1000,equity:1000,dayStartEquity:1000,dailyPnl:0,availableMargin:1000,
    openPositions:[],pendingEntries:[],reconciliationHealthy:true,killSwitch:false,unresolvedOrders:false,...overrides};
}
function input(overrides = {}) {
  return {settings:{enabled:true},now,market:"futures",observations:[observation("anomaly"),observation("momentum")],
    markets:[market()],account:account(),recentEntries:[],lastOrderAt:null,...overrides};
}
const select = overrides => selectAlphaAutomationCandidates(input(overrides));
function reason(overrides, expected) {
  const result = select(overrides);
  assert.equal(result.candidates.length, 0, expected);
  assert.ok(result.blockedReason === expected || result.rejections.some(row=>row.reason===expected), JSON.stringify(result));
}

test("automation template is disabled, bounded, serializable and rejects non-finite or unexpected settings", () => {
  assert.equal(DEFAULT_ALPHA_AUTOMATION_SETTINGS.enabled,false);
  assert.equal(DEFAULT_ALPHA_AUTOMATION_SETTINGS.sessionDurationHours,24);
  assert.equal(DEFAULT_ALPHA_AUTOMATION_SETTINGS.intervalMinutes,15);
  assert.equal(DEFAULT_ALPHA_AUTOMATION_SETTINGS.minOrderGapMinutes,15);
  assert.equal(DEFAULT_ALPHA_AUTOMATION_SETTINGS.maxOrdersPerRun,1);
  assert.equal(DEFAULT_ALPHA_AUTOMATION_SETTINGS.orderNotional,50);
  assert.equal(DEFAULT_ALPHA_AUTOMATION_SETTINGS.maxOrderNotional,100);
  assert.equal(DEFAULT_ALPHA_AUTOMATION_SETTINGS.leverage,2);
  assert.equal(DEFAULT_ALPHA_AUTOMATION_SETTINGS.maxPositions,3);
  assert.equal(DEFAULT_ALPHA_AUTOMATION_SETTINGS.maxPortfolioNotional,200);
  assert.equal(DEFAULT_ALPHA_AUTOMATION_SETTINGS.riskPerTradePct,0.25);
  assert.equal(DEFAULT_ALPHA_AUTOMATION_SETTINGS.atrStopMultiplier,2);
  assert.equal(DEFAULT_ALPHA_AUTOMATION_SETTINGS.minStopLossPct,1.5);
  assert.equal(DEFAULT_ALPHA_AUTOMATION_SETTINGS.maxStopLossPct,3);
  assert.deepEqual(DEFAULT_ALPHA_AUTOMATION_SETTINGS.selectedStrategies,[...ALPHA_AUTOMATION_STRATEGIES]);
  assert.deepEqual(JSON.parse(JSON.stringify(DEFAULT_ALPHA_AUTOMATION_SETTINGS)),DEFAULT_ALPHA_AUTOMATION_SETTINGS);
  reason({settings:{}},"AUTOMATION_DISABLED");
  for (const settings of [{enabled:"true"},{leverage:4},{intervalMinutes:1},{minOrderGapMinutes:0},{sessionDurationHours:25},
    {orderNotional:101,maxOrderNotional:100},{orderNotional:20,maxPortfolioNotional:10},{maxOrdersPerRun:0},
    {minStopLossPct:2,maxStopLossPct:1},{minRiskRewardRatio:1.99},{minIndependentSources:1},{martingale:true},
    {selectedStrategies:[]},{selectedStrategies:["unknown"]},{selectedStrategies:["anomaly","anomaly"]},
    {maxAbsReturn15mPct:2},{maxAbsReturn1hPct:5},{maxAbsReturn24hPct:15},{maxAbsFundingPct:0.05},
    {minVolumeMultiple:1.2},{maxVolumeMultiple:4},
    {orderNotional:"50"},{riskPerTradePct:NaN},{minQuoteVolume24h:Infinity},{orderNotional:-Infinity}]) {
    assert.equal(alphaAutomationSettingsSchema.safeParse(settings).success,false,JSON.stringify(settings));
  }
});

test("a selected anomaly returns one risk-ready proposal without requiring a second vote or submitting trades", () => {
  const payload=input(); const before=structuredClone(payload);
  const result=selectAlphaAutomationCandidates(payload);
  assert.deepEqual(payload,before,"pure selector must not mutate account, configuration or evidence");
  assert.equal(result.blockedReason,null);
  assert.equal(result.candidates.length,1);
  const candidate=result.candidates[0];
  assert.equal(candidate.symbol,"BTCUSDT");
  assert.equal(candidate.side,"LONG");
  assert.deepEqual(candidate.independentSources,["anomaly"]);
  assert.deepEqual(candidate.matchedStrategies,["anomaly"]);
  assert.equal(candidate.alphaScore,86);
  assert.ok(candidate.notional<=50);
  assert.ok(candidate.notional>49);
  assert.equal(candidate.leverage,2);
  const costs=candidate.estimatedLossWithCosts-candidate.quantity*Math.abs(candidate.entryPrice-candidate.stopLoss);
  assert.ok(Math.abs(candidate.marginRequired-(candidate.notional/2+costs))<1e-8);
  assert.ok(candidate.estimatedLossWithCosts<=1000*0.25/100);
  assert.ok(candidate.stopLoss<candidate.entryPrice && candidate.takeProfit>candidate.entryPrice);
  assert.ok(candidate.expiresAt>now && candidate.expiresAt<=now+30_000);
  assert.equal(candidate.evidenceExpiresAt,now-1000+600_000,"original evidence lifetime remains distinct from renewable quote lifetime");
  assert.equal(candidate.maxHoldingMinutes,120);
  assert.equal(candidate.dedupeKey,"BTCUSDT|LONG");
  assert.equal(Object.hasOwn(candidate,"mode"),false,"pure proposal does not select a real-money environment");
});

test("each of the five strategies qualifies independently and preserves missing genuine Alpha scores", () => {
  const cases = [
    ["p1_three_source", observation("risk_pool", {riskPoolPriority:"P1",score:null})],
    ["p2_two_source", observation("risk_pool", {riskPoolPriority:"P2",score:null})],
    ["strong_signal", observation("signal", {sameCoinCount:1,score:null})],
    ["same_coin_x2", observation("signal", {sameCoinCount:2,score:null})],
    ["anomaly", observation("anomaly", {score:95})],
  ];
  for (const [strategy, row] of cases) {
    const settings={enabled:true,selectedStrategies:[strategy],minScore:95};
    const result=select({settings,observations:[row]});
    assert.equal(result.candidates.length,1,strategy);
    assert.deepEqual(result.candidates[0].matchedStrategies,[strategy]);
    assert.equal(result.candidates[0].alphaScore,strategy === "anomaly" ? 95 : null);
    const evaluated=evaluateTradeIntent({...result.candidates[0],mode:"paper"},
      {equity:1000,dailyPnl:0,openPositions:0,openNotional:0,recentIntents:[],requireManualConfirmation:false},
      {now:new Date(now),policy:{minAlphaScore:95},strategyQualification:{matchedStrategies:result.candidates[0].matchedStrategies}});
    assert.equal(evaluated.ok,true,JSON.stringify(evaluated.violations));
    assert.equal(evaluated.intent.alphaScore,result.candidates[0].alphaScore);
    assert.equal(evaluated.warnings.some(item=>item.code === "SCORE_MISSING"),false);
    const helper=matchAlphaAutomationStrategies([row],alphaAutomationSettingsSchema.parse({...settings,enabled:false}),now);
    assert.deepEqual(helper.matchedStrategies,result.candidates[0].matchedStrategies,"market prefetch and selector share the same matching rule");
  }
  for (const [strategy, priority] of [["p1_three_source","P2"],["p2_two_source","P1"],["p1_three_source",null]]) {
    reason({settings:{enabled:true,selectedStrategies:[strategy]},observations:[observation("risk_pool",{riskPoolPriority:priority})]},"NO_SELECTED_STRATEGY_MATCH");
  }
});

test("strategy selection uses OR, keeps provenance deterministic and does not elevate derived or duplicate votes", () => {
  const all=[observation("signal",{score:null}),observation("risk_pool",{riskPoolPriority:"P1",score:null}),observation("momentum"),observation("anomaly")];
  const result=select({observations:all});
  assert.deepEqual(result.candidates[0].sources,["anomaly","signal","risk_pool"]);
  assert.deepEqual(result.candidates[0].matchedStrategies,["p1_three_source","strong_signal","anomaly"]);
  assert.deepEqual(result.candidates[0].independentSources,["anomaly","signal"]);
  assert.deepEqual(select({observations:[...all].reverse()}),result);
  const cloned=select({observations:[observation("anomaly"),observation("anomaly")]});
  assert.deepEqual(cloned.candidates[0].matchedStrategies,["anomaly"]);
  assert.equal(cloned.candidates[0].evidenceIds.length,1);
  const duplicateIdentity=select({observations:[observation("anomaly"),observation("signal",{evidenceId:"anomaly:BTC:upstream-event-1",score:null})]});
  assert.equal(duplicateIdentity.candidates[0].evidenceIds.length,1);
  assert.equal(duplicateIdentity.candidates[0].independentSources.length,1);
  reason({observations:[observation("momentum"),observation("risk_pool")]},"NO_SELECTED_STRATEGY_MATCH");
  assert.equal(select({observations:[observation("signal",{score:null}),observation("anomaly",{score:50,side:"SHORT"})]}).candidates.length,1,"a failed alternative is not a hidden extra veto");
  assert.equal(select({settings:{enabled:true,selectedStrategies:["anomaly"]},observations:[observation("anomaly"),observation("signal",{side:"SHORT"})]}).candidates.length,1,"an unselected strategy cannot veto the chosen strategy");
});

test("signal strategies use original same-coin metadata and inclusive ten-minute timestamps without inventing scores", () => {
  for (const strategy of ["strong_signal","same_coin_x2"]) {
    const settings=alphaAutomationSettingsSchema.parse({enabled:true,selectedStrategies:[strategy]});
    const count=strategy === "strong_signal" ? 1 : 2;
    const event=observation("signal",{sameCoinCount:count,score:null,observedAt:now-600_000});
    assert.deepEqual(matchAlphaAutomationStrategies([event],settings,now).matchedStrategies,[strategy]);
    for (const observedAt of [now-600_001,now+1,NaN,null]) {
      assert.equal(matchAlphaAutomationStrategies([{...event,observedAt}],settings,now),null);
    }
    for (const sameCoinCount of [null,undefined,-1,1.5,"2",3,4]) {
      assert.equal(matchAlphaAutomationStrategies([{...event,sameCoinCount}],settings,now),null,`${strategy}: ${sameCoinCount}`);
    }
    assert.ok(matchAlphaAutomationStrategies([{...event,observedAt:now-300_001,snapshotAt:now-1000}],{...settings,maxDataAgeMinutes:5},now),
      "the original signal rule is always ten minutes; source snapshot freshness has its separate configured window");
    assert.equal(matchAlphaAutomationStrategies([{...event,observedAt:now-1000,snapshotAt:now-300_001}],{...settings,maxDataAgeMinutes:5},now),null);
    assert.equal(select({settings,observations:[{...event,observedAt:now-1000}]}).candidates[0].alphaScore,null);
  }
  const strong=alphaAutomationSettingsSchema.parse({selectedStrategies:["strong_signal"]});
  assert.ok(matchAlphaAutomationStrategies([observation("signal",{sameCoinCount:0})],strong,now));
  assert.equal(matchAlphaAutomationStrategies([observation("signal",{sameCoinCount:2})],strong,now),null);
  const x2=alphaAutomationSettingsSchema.parse({selectedStrategies:["same_coin_x2"]});
  assert.equal(matchAlphaAutomationStrategies([observation("signal",{sameCoinCount:1})],x2,now),null);
});

test("anomaly has strict Alpha >80 and both dimension scores >89 with minScore applying only to anomaly", () => {
  const settings={enabled:true,selectedStrategies:["anomaly"],minScore:60};
  for (const patch of [{score:80},{score:79.9},{score:null},{score:101},{priceMomentumScore:89},{volumeAnomalyScore:89},
    {priceMomentumScore:null},{volumeAnomalyScore:undefined},{priceMomentumScore:"90"},{volumeAnomalyScore:101}]) {
    reason({settings,observations:[observation("anomaly",patch)]},"NO_SELECTED_STRATEGY_MATCH");
  }
  assert.equal(select({settings,observations:[observation("anomaly",{score:80.01,priceMomentumScore:89.01,volumeAnomalyScore:89.01})]}).candidates.length,1);
  reason({settings:{...settings,minScore:90},observations:[observation("anomaly",{score:89.99})]},"NO_SELECTED_STRATEGY_MATCH");
  assert.equal(select({settings:{...settings,minScore:90},observations:[observation("anomaly",{score:90})]}).candidates.length,1);
  assert.equal(select({settings:{enabled:true,selectedStrategies:["strong_signal"],minScore:95},observations:[observation("signal",{score:50})]}).candidates[0].alphaScore,50);
});

test("OR evidence expiry follows the remaining valid alternative instead of expiring with an older optional match", () => {
  const result=select({observations:[observation("anomaly",{observedAt:now-590_000}),observation("signal",{score:null})]});
  assert.equal(result.candidates[0].evidenceExpiresAt,now-1000+600_000);
  assert.equal(result.candidates[0].expiresAt,now-1000+30_000);
});

test("stale, future, incomplete, neutral, unscored and fabricated direction evidence cannot qualify", () => {
  for (const patch of [{observedAt:now-601_000},{observedAt:now+1},{dataComplete:false},{side:"NEUTRAL"},
    {score:79},{score:NaN},{score:101},{score:"99"},{score:null},{evidenceId:""},{source:"gainers"}]) {
    const result=select({observations:[observation("anomaly",patch),observation("momentum")]});
    assert.equal(result.candidates.length,0,JSON.stringify(patch));
  }
  reason({observations:[observation("anomaly"),observation("signal",{side:"SHORT"})]},"CONFLICTING_DIRECTIONS");
  assert.equal(select({observations:[observation("anomaly",{overheated:true})]}).candidates.length,1,"legacy overheated display metadata is not an implicit gate");
});

test("removed return, funding, volume-multiple and trend filters no longer veto a matched strategy while ATR protection remains", () => {
  for (const patch of [{return15mPct:99},{return1hPct:-99},{return24hPct:200},{fundingPct:2},{volumeMultiple:100},
    {return15mPct:-0.1},{return1hPct:0},{return24hPct:-3},{volumeMultiple:0},{oiChangePct:-2},{oiChangePct:0}]) {
    assert.equal(select({markets:[market(patch)]}).candidates.length,1,JSON.stringify(patch));
  }
  reason({markets:[market({atrPct:2})]},"ATR_STOP_EXCEEDS_LIMIT");
  assert.ok(select({markets:[market({atrPct:0.2})]}).candidates[0].stopLossPct>=1.5);
});

test("exact-market prices, ATR, filters and execution liquidity remain mandatory while unused trend fields are optional", () => {
  const required=["observedAt","quoteAt","bid","ask","quoteVolume24h","atrPct","estimatedSlippagePct","liquidityNotional","takerFeePct","filters"];
  for (const key of required) {
    const snapshot=market(); delete snapshot[key];
    reason({markets:[snapshot]},"MARKET_DATA_INVALID_OR_STALE");
  }
  for (const patch of [{observedAt:now-601_000},{quoteAt:now-31_000},{quoteAt:now+1},{bid:101,ask:100},
    {atrPct:NaN},{atrPct:Infinity},{quoteVolume24h:"30000000"},{tradable:false},{takerFeePct:-1}]) {
    reason({markets:[market(patch)]},"MARKET_DATA_INVALID_OR_STALE");
  }
  const minimal=market();
  for(const key of ["return15mPct","return1hPct","return24hPct","volumeMultiple","fundingPct","oiChangePct"]) delete minimal[key];
  assert.equal(select({markets:[minimal]}).candidates.length,1);
  reason({markets:[market({market:"spot"})]},"MARKET_SNAPSHOT_MISSING_OR_AMBIGUOUS");
  reason({markets:[market(),market()]},"MARKET_SNAPSHOT_MISSING_OR_AMBIGUOUS");
});

test("liquidity gates use actual spread and exact-market 24h quote volume", () => {
  reason({markets:[market({quoteVolume24h:19_999_999})]},"INSUFFICIENT_QUOTE_VOLUME");
  reason({markets:[market({bid:99,ask:101})]},"EXECUTION_FRICTION_TOO_HIGH");
  reason({markets:[market({estimatedSlippagePct:0.31})]},"EXECUTION_FRICTION_TOO_HIGH");
  const result=select({markets:[market({liquidityNotional:20})]});
  assert.ok(result.candidates[0].notional<=20,"never exceed the notional measured by the order book estimate");
});

test("account safety rejects unknown balances, old reconciliation, daily loss, open unknown orders and expired automation positions", () => {
  for (const patch of [{equity:null},{equity:0},{equity:"1000"},{dayStartEquity:0},{dailyPnl:null},{availableMargin:NaN},
    {observedAt:now-31_000},{pendingEntries:null},{killSwitch:null},{unresolvedOrders:null}]) {
    reason({account:account(patch)},"ACCOUNT_DATA_UNAVAILABLE");
  }
  reason({account:account({killSwitch:true})},"KILL_SWITCH_ACTIVE");
  reason({account:account({unresolvedOrders:true})},"RECONCILIATION_REQUIRED");
  reason({account:account({reconciliationHealthy:false})},"RECONCILIATION_REQUIRED");
  reason({account:account({dailyPnl:-10})},"DAILY_LOSS_LIMIT");
  reason({account:account({equity:2000,dailyPnl:-10})},"DAILY_LOSS_LIMIT");
  reason({account:account({openPositions:[null]})},"EXPOSURE_DATA_UNAVAILABLE");
  const old={symbol:"ETHUSDT",side:"LONG",notional:20,openedAt:now-120*60_000,automationManaged:true};
  reason({account:account({openPositions:[old]})},"EXPIRED_POSITION_REQUIRES_EXIT");
  assert.equal(select({account:account({openPositions:[{...old,automationManaged:false}]})}).candidates.length,1,"manual positions are not forced to exit by an automation holding deadline");
});

test("pending entries reserve slots and exposure and same-symbol positions block either new direction", () => {
  const pending={symbol:"ETHUSDT",side:"SHORT",notional:30,openedAt:now-1000};
  reason({account:account({pendingEntries:[pending,{...pending,symbol:"SOL"},{...pending,symbol:"BNB"}]})},"POSITION_LIMIT");
  reason({account:account({pendingEntries:[{...pending,notional:200}]})},"PORTFOLIO_LIMIT");
  reason({account:account({openPositions:[{...pending,symbol:"BTC",side:"SHORT"}]})},"SYMBOL_ALREADY_EXPOSED");
  const result=select({account:account({pendingEntries:[{...pending,notional:185}]})});
  assert.ok(result.candidates[0].notional<=15);
});

test("minimum order gap is global and rejected entries do not create false cooldown", () => {
  reason({lastOrderAt:now-14*60_000},"ORDER_COOLDOWN");
  const entry={symbol:"ETH",side:"LONG",createdAt:now-1000,blocksDedupe:true};
  reason({recentEntries:[entry]},"ORDER_COOLDOWN");
  assert.equal(select({recentEntries:[{...entry,blocksDedupe:false}]}).candidates.length,1);
  assert.equal(select({lastOrderAt:now-15*60_000}).candidates.length,1);
  reason({lastOrderAt:now+1},"ORDER_HISTORY_UNAVAILABLE");
  reason({recentEntries:[{...entry,createdAt:now+1}]},"ORDER_HISTORY_UNAVAILABLE");
  reason({recentEntries:null},"ORDER_HISTORY_UNAVAILABLE");
});

test("position sizing is capped by risk including costs, both portfolio caps, margin and exchange filters without rounding up", () => {
  for (const overrides of [
    {account:account({equity:100,dayStartEquity:100})},
    {account:account({availableMargin:8})},
    {settings:{enabled:true,maxPortfolioNotional:60},account:account({openPositions:[{symbol:"ETH",side:"LONG",notional:45,openedAt:now-1000}]})},
  ]) {
    const result=select(overrides); assert.equal(result.candidates.length,1);
    const c=result.candidates[0]; const a=overrides.account || account();
    assert.ok(c.estimatedLossWithCosts<=a.equity*0.25/100+1e-9);
    assert.ok(c.marginRequired<=a.availableMargin+1e-9);
    assert.ok(c.notional<=50+1e-9);
  }
  reason({account:account({equity:20,dayStartEquity:20})},"ORDER_BELOW_EXCHANGE_MINIMUM");
  reason({markets:[market({filters:{...market().filters,minNotional:60}})]},"ORDER_BELOW_EXCHANGE_MINIMUM");
  reason({markets:[market({filters:{...market().filters,stepSize:1,minQty:1}})]},"ORDER_BELOW_EXCHANGE_MINIMUM");
  const capped=select({markets:[market({filters:{...market().filters,maxNotional:25}})]}).candidates[0];
  assert.ok(capped.notional<=25);
});

test("protection prices respect tick direction and provide at least 2R after the explicit cost reserve", () => {
  const long=select().candidates[0];
  const short=select({observations:[observation("anomaly",{side:"SHORT"}),observation("momentum",{side:"SHORT"})],
    markets:[market({return15mPct:-0.4,return1hPct:-1,return24hPct:-3})]}).candidates[0];
  for (const c of [long,short]) {
    const grossReward=Math.abs(c.takeProfit-c.entryPrice)*c.quantity;
    const grossStop=Math.abs(c.entryPrice-c.stopLoss)*c.quantity;
    const cost=c.estimatedLossWithCosts-grossStop;
    assert.ok((grossReward-cost)/c.estimatedLossWithCosts>=2-1e-8);
    assert.ok(Math.abs(c.stopLoss/0.01-Math.round(c.stopLoss/0.01))<1e-7);
    assert.ok(Math.abs(c.takeProfit/0.01-Math.round(c.takeProfit/0.01))<1e-7);
  }
  assert.ok(short.stopLoss>short.entryPrice && short.takeProfit<short.entryPrice);
  reason({markets:[market({filters:{...market().filters,tickSize:10}})]},"PROTECTION_PRICE_RANGE_UNAVAILABLE");
});

test("protection ranges preserve the original ATR stop while remaining valid at both permitted price edges", () => {
  for (const side of ["LONG","SHORT"]) for (const atrPct of [0.2, 1]) {
    const result=select({observations:[observation("anomaly",{side})],markets:[market({atrPct})]});
    assert.equal(result.candidates.length,1);
    const c=result.candidates[0];
    assert.ok(c.stopLossPct>=Math.max(1.5,atrPct*2)-1e-9,"the original ATR distance must never be narrowed to make the interval fit");
    const costRate=(c.estimatedLossWithCosts-c.quantity*Math.abs(c.entryPrice-c.stopLoss))/c.notional;
    for (const price of [c.entryPrice*0.997,c.entryPrice*1.003]) {
      const stopPct=Math.abs(price-c.stopLoss)/price*100;
      assert.ok(stopPct>=1.5-1e-9 && stopPct<=3+1e-9);
      const loss=c.quantity*Math.abs(price-c.stopLoss)+c.quantity*price*costRate;
      const reward=c.quantity*Math.abs(c.takeProfit-price)-c.quantity*price*costRate;
      assert.ok(reward/loss>=2-1e-9);
    }
  }
  for (const side of ["LONG","SHORT"]) {
    reason({observations:[observation("anomaly",{side})],markets:[market({atrPct:1.5})]},"PROTECTION_PRICE_RANGE_UNAVAILABLE");
    reason({observations:[observation("anomaly",{side})],markets:[market({atrPct:1.51})]},"ATR_STOP_EXCEEDS_LIMIT");
    reason({settings:{enabled:true,minStopLossPct:2,maxStopLossPct:2},observations:[observation("anomaly",{side})]},"PROTECTION_PRICE_RANGE_UNAVAILABLE");
  }
});

test("per-run selection reserves worst-price notional and margin for multiple candidate orders", () => {
  const observations=["BTC","ETH"].map(symbol=>observation("anomaly",{symbol,evidenceId:`${symbol}:scan`}));
  const markets=["BTC","ETH"].map(symbol=>market({symbol}));
  for (const overrides of [
    {settings:{enabled:true,maxOrdersPerRun:2,maxPortfolioNotional:99.8}},
    {settings:{enabled:true,maxOrdersPerRun:2},account:account({availableMargin:50.75})},
  ]) {
    const result=select({...overrides,observations,markets});
    assert.equal(result.candidates.length,1);
    assert.ok(result.rejections.some(row=>row.reason==="RUN_RESERVATION_LIMIT"));
  }
});

test("spot remains unlevered and cannot create a naked short even with full consensus", () => {
  const spot=market({market:"spot",fundingPct:null,oiChangePct:null});
  const result=select({market:"spot",markets:[spot]});
  assert.equal(result.candidates[0].leverage,1);
  reason({market:"spot",markets:[spot],observations:[observation("anomaly",{side:"SHORT"}),observation("signal",{side:"SHORT"})]},"SPOT_SHORT_UNSUPPORTED");
});

test("ranking, symbol normalization and per-run reservations are deterministic and bounded", () => {
  const symbols=["SOL","BTC","ETH"];
  const observations=symbols.flatMap(symbol=>[observation("anomaly",{symbol,evidenceId:`${symbol}:scan`}),observation("signal",{symbol,evidenceId:`${symbol}:signal`})]);
  const markets=symbols.map(symbol=>market({symbol}));
  const result=select({settings:{enabled:true,maxOrdersPerRun:3,maxPortfolioNotional:80},observations,markets});
  assert.equal(result.candidates.length,1);
  assert.equal(result.candidates[0].symbol,"BTCUSDT");
  assert.ok(result.candidates.reduce((sum,c)=>sum+c.notional,0)<=80);
  assert.deepEqual(result,select({settings:{enabled:true,maxOrdersPerRun:3,maxPortfolioNotional:80},observations:[...observations].reverse(),markets:[...markets].reverse()}));
  assert.equal(normalizeAlphaAutomationSymbol(" btc/usdt "),"BTCUSDT");
  assert.equal(normalizeAlphaAutomationSymbol("BTC-USDT"),"BTCUSDT");
  assert.equal(normalizeAlphaAutomationSymbol("https://invalid"),null);
  assert.equal(normalizeAlphaAutomationSymbol("USDC"),null);
});

test("existing risk engine preserves the proposal notional via its computed riskPct", () => {
  const candidate=select().candidates[0];
  const evaluated=evaluateTradeIntent({...candidate,mode:"paper",orderType:"MARKET"},
    {equity:1000,dailyPnl:0,openPositions:0,openNotional:0,recentIntents:[],environmentEnabled:true},
    {now:new Date(now),policy:{perOrderNotionalLimit:100,maxPortfolioExposurePct:20,minAlphaScore:80,maxLeverage:2}});
  assert.equal(evaluated.ok,true,JSON.stringify(evaluated.violations));
  assert.ok(Math.abs(evaluated.executionPlan.risk.notional-candidate.notional)<0.011);
  assert.ok(evaluated.executionPlan.risk.notional<=50);
});

test("narrow stop/slippage settings remain readable and unmodified with an adaptive execution-window notice", () => {
  const draft={enabled:false,minStopLossPct:1,maxStopLossPct:1.5,maxSlippagePct:0.3,atrStopMultiplier:2};
  const before=structuredClone(draft);
  const parsed=alphaAutomationSettingsSchema.parse(draft);
  const warnings=diagnoseAlphaAutomationSettings(parsed);
  assert.deepEqual(draft,before);
  assert.equal(warnings.length,1);
  assert.equal(warnings[0].code,"PRICE_WINDOW_NARROWED");
  assert.ok(Math.abs(warnings[0].details.maxEntryDriftPct-0.22222222222222224)<1e-10);
  assert.equal(warnings[0].details.candidateSpecificAtrAndTickCheckRequired,true);
  assert.match(warnings[0].message,/最多 ±0\.2222%/);
  assert.equal(warnings[0].message.includes("无法覆盖"),false,"an allowed slippage maximum must not become a requirement for every candidate");
  const disabled=select({settings:draft});
  assert.equal(disabled.blockedReason,"AUTOMATION_DISABLED");
  assert.deepEqual(disabled.parameterWarnings,warnings,"reading a stopped configuration still explains its narrower candidate window");
  assert.deepEqual(diagnoseAlphaAutomationSettings(DEFAULT_ALPHA_AUTOMATION_SETTINGS),[]);
  const exactStop=diagnoseAlphaAutomationSettings({...parsed,maxStopLossPct:1});
  assert.equal(exactStop[0].details.maxEntryDriftPct,0);
  assert.match(exactStop[0].message,/仅报价无漂移/);
});

test("a genuinely matched P2 reports ATR rejection separately from parameter conflicts and no-match failures", () => {
  const settings={enabled:true,selectedStrategies:["p2_two_source"],minStopLossPct:1,maxStopLossPct:1.5,maxSlippagePct:0.3,atrStopMultiplier:2};
  const observations=[observation("risk_pool",{riskPoolPriority:"P2",score:null})];
  const result=select({settings,observations,markets:[market({atrPct:0.9})]});
  const rejection=result.rejections[0];
  assert.equal(result.candidates.length,0);
  assert.equal(rejection.reason,"ATR_STOP_EXCEEDS_LIMIT");
  assert.match(rejection.message,/P2.*已命中.*ATR 0\.9% × 2.*1\.8%.*1\.5%/);
  assert.deepEqual(rejection.details.matchedStrategies,["p2_two_source"]);
  assert.equal(rejection.details.strategyChecks[0].matched,true);
  assert.equal(rejection.details.atrPct,0.9);
  assert.equal(rejection.details.requiredStopLossPct,1.8);
  assert.equal(rejection.details.maxStopLossPct,1.5);
  assert.equal(result.parameterWarnings[0].code,"PRICE_WINDOW_NARROWED");
  const interval=select({settings,observations,markets:[market({atrPct:0.2})]});
  assert.equal(interval.candidates.length,1,"narrow stop ranges can execute with a smaller candidate price window");
  assert.ok(interval.candidates[0].maxEntryDriftPct>0.2 && interval.candidates[0].maxEntryDriftPct<0.3);
  assert.deepEqual(settings,{enabled:true,selectedStrategies:["p2_two_source"],minStopLossPct:1,maxStopLossPct:1.5,maxSlippagePct:0.3,atrStopMultiplier:2});
});

test("adaptive LONG and SHORT windows preserve configured stops, cost-adjusted risk and all final caps", () => {
  const settings=alphaAutomationSettingsSchema.parse({enabled:true,selectedStrategies:["p2_two_source"],minStopLossPct:1,maxStopLossPct:1.5,maxSlippagePct:0.3});
  for(const side of ["LONG","SHORT"]) for(const atrPct of [0.2,0.7]) {
    const result=select({settings,observations:[observation("risk_pool",{riskPoolPriority:"P2",score:null,side})],markets:[market({atrPct})]});
    assert.equal(result.candidates.length,1,JSON.stringify(result));
    const candidate=result.candidates[0];
    assert.ok(candidate.maxEntryDriftPct>0 && candidate.maxEntryDriftPct<settings.maxSlippagePct);
    assert.ok(candidate.stopLossPct>=Math.max(settings.minStopLossPct,atrPct*settings.atrStopMultiplier)-1e-9);
    if(atrPct===0.7) assert.ok(candidate.maxEntryDriftPct<0.1,"actual ATR consumes part of the available price range");
    const guard={candidate,settings,account:account(),quantity:candidate.quantity,leverage:candidate.leverage,now};
    for(const change of [-1,-0.5,0,0.5,1]) {
      const price=candidate.entryPrice*(1+change*candidate.maxEntryDriftPct/100);
      assert.doesNotThrow(()=>validateAutomaticOrder({...guard,price}),`${side} ${atrPct} ATR ${change} window endpoint`);
      const stopPct=Math.abs(price-candidate.stopLoss)/price*100;
      assert.ok(stopPct>=settings.minStopLossPct-1e-8 && stopPct<=settings.maxStopLossPct+1e-8);
    }
    assert.throws(()=>validateAutomaticOrder({...guard,price:candidate.entryPrice*(1+(candidate.maxEntryDriftPct+0.001)/100)}),/偏移|窗口/);
  }
});

test("equal min/max stop permits only a zero-drift exact tick instead of widening the stop", () => {
  const settings=alphaAutomationSettingsSchema.parse({enabled:true,minStopLossPct:1,maxStopLossPct:1});
  for(const side of ["LONG","SHORT"]) {
    const result=select({settings,observations:[observation("anomaly",{side})],markets:[market({bid:100,ask:100,atrPct:0.2})]});
    assert.equal(result.candidates.length,1,JSON.stringify(result));
    const candidate=result.candidates[0];
    assert.equal(candidate.maxEntryDriftPct,0);
    assert.equal(candidate.stopLossPct,1);
    const guard={candidate,settings,account:account(),quantity:candidate.quantity,leverage:candidate.leverage,now};
    assert.doesNotThrow(()=>validateAutomaticOrder({...guard,price:100}));
    assert.throws(()=>validateAutomaticOrder({...guard,price:100.0001}));
    const coarse=select({settings,observations:[observation("anomaly",{side})],markets:[market({bid:100,ask:100,atrPct:0.2,filters:{...market().filters,tickSize:2}})]});
    assert.equal(coarse.candidates.length,0);
    assert.equal(coarse.rejections[0].reason,"PROTECTION_PRICE_RANGE_UNAVAILABLE");
    assert.equal(coarse.rejections[0].details.maxEntryDriftPct,0);
  }
});

test("no-match diagnostics identify pool priority, original signal age/count and both real anomaly thresholds", () => {
  const result=select({settings:{enabled:true,minScore:90},observations:[
    observation("risk_pool",{riskPoolPriority:"P2",side:"NEUTRAL",score:null}),
    observation("signal",{observedAt:now-660_000,snapshotAt:now-1000,sameCoinCount:3,score:null}),
    observation("anomaly",{score:85,priceMomentumScore:89,volumeAnomalyScore:null}),
  ]});
  const rejection=result.rejections[0];
  assert.equal(rejection.reason,"NO_SELECTED_STRATEGY_MATCH");
  assert.ok(rejection.message.includes("11 分钟"));
  assert.ok(rejection.message.includes("同币 ×3"));
  assert.ok(rejection.message.includes("≥90"));
  const byStrategy=Object.fromEntries(rejection.details.strategyChecks.map(row=>[row.strategy,row]));
  const codes=strategy=>byStrategy[strategy].observations[0].issues.map(issue=>issue.code);
  assert.ok(codes("p1_three_source").includes("POOL_PRIORITY_MISMATCH"));
  assert.ok(codes("p2_two_source").includes("DIRECTION_UNCLEAR"));
  assert.equal(byStrategy.p2_two_source.observations[0].riskPoolPriority,"P2");
  assert.ok(codes("strong_signal").includes("SIGNAL_TOO_OLD"));
  assert.ok(codes("strong_signal").includes("SAME_COIN_COUNT_MISMATCH"));
  assert.ok(codes("same_coin_x2").includes("SAME_COIN_COUNT_MISMATCH"));
  assert.ok(codes("anomaly").includes("ALPHA_SCORE_BELOW_THRESHOLD"));
  assert.ok(codes("anomaly").includes("PRICE_MOMENTUM_BELOW_THRESHOLD"));
  assert.ok(codes("anomaly").includes("VOLUME_ANOMALY_SCORE_MISSING"));
  assert.equal(byStrategy.anomaly.observations[0].volumeAnomalyScore,null);
});

test("current pool and anomaly snapshots do not inherit old event ages, while signals retain their original ten-minute deadline", () => {
  const settings=alphaAutomationSettingsSchema.parse({enabled:true,maxDataAgeMinutes:5});
  const old=now-24*60*60_000;
  for (const row of [observation("risk_pool",{riskPoolPriority:"P2",observedAt:old,snapshotAt:now-1000,score:null}),
    observation("anomaly",{observedAt:old,snapshotAt:now-1000})]) {
    assert.ok(matchAlphaAutomationStrategies([row],settings,now));
    const selected=select({settings,observations:[row]});
    assert.equal(selected.candidates.length,1);
    assert.equal(selected.candidates[0].evidenceExpiresAt,now-1000+300_000,"current source snapshot bounds the candidate lifetime");
    for(const snapshotAt of [null,now-300_001,now+1]) assert.equal(matchAlphaAutomationStrategies([{...row,snapshotAt}],settings,now),null);
  }
  const signal=observation("signal",{observedAt:now-9*60_000,snapshotAt:now-1000,score:null});
  const selected=select({settings,observations:[signal]});
  assert.equal(selected.candidates.length,1);
  assert.equal(selected.candidates[0].evidenceExpiresAt,now+60_000,"freshly fetching an old signal cannot renew its event lifetime");
  assert.equal(matchAlphaAutomationStrategies([{...signal,observedAt:old}],settings,now),null);
  const noSnapshot=diagnoseAlphaAutomationStrategies([observation("signal")],settings,now).strategyChecks.find(row=>row.strategy==="strong_signal");
  assert.equal(noSnapshot.observations[0].snapshotAt,null,"an original event timestamp is not presented as a known fetch timestamp");
});

test("unknown original signal time is explicit and cannot qualify signal strategies but a separately trusted current pool can match", () => {
  const signal=observation("signal",{score:null,observedAt:null,snapshotAt:now-1000,sourceStatus:"unknown",sourceReason:"SIGNAL_EVENT_TIME_UNKNOWN",dataComplete:false,sameCoinCount:null});
  const result=select({observations:[signal]});
  const check=result.rejections[0].details.strategyChecks.find(row=>row.strategy==="strong_signal");
  assert.equal(check.observations[0].observedAt,null);
  assert.equal(check.observations[0].ageMinutes,null);
  assert.equal(check.observations[0].alphaScore,null);
  assert.ok(check.observations[0].issues.some(issue=>issue.code==="SIGNAL_EVENT_TIME_UNKNOWN"));
  assert.ok(check.observations[0].issues.some(issue=>issue.code==="SAME_COIN_COUNT_UNKNOWN"));
  const pool=observation("risk_pool",{score:null,riskPoolPriority:"P2",observedAt:now-1000,snapshotAt:now-1000,sourceStatus:"live",
    poolMembers:[{source:"signal",evidenceId:"real-upstream-id",snapshotAt:now-1000,eventAt:null}]});
  const selected=select({observations:[signal,pool]});
  assert.deepEqual(selected.candidates[0].matchedStrategies,["p2_two_source"]);
});

test("diagnostics are bounded safe scalars, omit raw evidence and explain genuinely conflicting selected strategies", () => {
  const settings=alphaAutomationSettingsSchema.parse({enabled:true,selectedStrategies:["strong_signal","anomaly"]});
  const rawMarker="SECRET_RAW_UPSTREAM_ID_OR_MESSAGE";
  const observations=Array.from({length:12},(_,i)=>observation("signal",{evidenceId:`${rawMarker}:${i}`,sameCoinCount:3,
    sourceStatus:rawMarker,sourceReason:rawMarker,raw:rawMarker,score:null}));
  const diagnostic=diagnoseAlphaAutomationStrategies(observations,settings,now);
  assert.equal(JSON.stringify(diagnostic).includes(rawMarker),false);
  const check=diagnostic.strategyChecks.find(row=>row.strategy==="strong_signal");
  assert.equal(check.observationCount,12);
  assert.equal(check.observations.length,10);
  assert.equal(check.truncated,true);
  assert.ok(check.observations[0].issues.some(issue=>issue.code==="SOURCE_STATUS_INVALID"));
  assert.equal(diagnostic.strategyChecks.find(row=>row.strategy==="anomaly").issues[0].code,"SOURCE_OBSERVATION_MISSING");
  assert.deepEqual(JSON.parse(JSON.stringify(diagnostic)),diagnostic);
  const conflict=select({settings,observations:[observation("anomaly"),observation("signal",{side:"SHORT",score:null})]}).rejections[0];
  assert.equal(conflict.reason,"CONFLICTING_DIRECTIONS");
  assert.equal(conflict.details.conflictingDirections,true);
  assert.equal(conflict.details.strategyChecks.every(row=>row.matched),true);
  assert.match(conflict.message,/同时命中多空方向/);
  assert.equal(matchAlphaAutomationStrategies([observation("anomaly")],settings,NaN),null,"invalid clock must not bypass freshness checks");
});
