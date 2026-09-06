import "server-only";
import { createHmac } from "node:crypto";
import { Agent, ProxyAgent, type Dispatcher } from "undici";
import { accountNumber, accountRows, portfolioRiskSnapshot } from "./portfolio-risk";

export type BinanceEnvironment = "testnet" | "live";
export type BinanceMarket = "spot" | "futures";
export type BinanceAccountMode = "classic" | "portfolio";

type BinanceClientOptions = {
  environment: BinanceEnvironment;
  market: BinanceMarket;
  apiKey: string;
  apiSecret: string;
  proxy?: string | null;
  accountMode?: BinanceAccountMode | "auto";
};

type OrderInput = {
  symbol: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT";
  quantity: number;
  price?: number | null;
  leverage?: number;
  clientOrderId: string;
  reduceOnly?: boolean;
  referencePrice?: number;
  maxSlippageBps?: number;
  beforeSubmit?: () => Promise<void>;
};

export type BinanceOrderResult = {
  exchangeOrderId: string;
  clientOrderId: string;
  status: string;
  filledQuantity: number;
  averagePrice: number | null;
  raw: Record<string, unknown>;
};

type SymbolRules = {
  quantityStep: number;
  priceStep: number;
  minQuantity: number;
  minNotional: number;
};

const BASE_URLS: Record<BinanceEnvironment, Record<BinanceMarket, string>> = {
  testnet: {
    spot: "https://testnet.binance.vision",
    futures: "https://demo-fapi.binance.com"
  },
  live: {
    spot: "https://api.binance.com",
    futures: "https://fapi.binance.com"
  }
};

const WS_URLS: Record<BinanceEnvironment, Record<BinanceMarket, string>> = {
  testnet: {
    spot: "wss://stream.testnet.binance.vision/ws",
    futures: "wss://fstream.binancefuture.com/ws"
  },
  live: {
    spot: "wss://stream.binance.com:9443/ws",
    futures: "wss://fstream.binance.com/ws"
  }
};

function decimalPlaces(step: number) {
  const text = String(step);
  if (/e-/i.test(text)) return Number(text.split(/e-/i)[1]);
  return (text.split(".")[1] || "").replace(/0+$/, "").length;
}

export function floorToBinanceStep(value: number, step: number) {
  if (!(step > 0)) return value;
  const digits = decimalPlaces(step);
  return Number((Math.floor((value + step * 1e-9) / step) * step).toFixed(digits));
}

export function signBinanceQuery(params: Record<string, string | number | boolean>, secret: string) {
  const query = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)])).toString();
  return { query, signature: createHmac("sha256", secret).update(query).digest("hex") };
}

function responseStatus(raw: Record<string, unknown>) {
  return String(raw.status ?? raw.algoStatus ?? "UNKNOWN");
}

function orderResult(raw: Record<string, unknown>, fallbackClientOrderId: string): BinanceOrderResult {
  const executed = Number(raw.executedQty ?? raw.actualQty ?? 0);
  const quoteQuantity = Number(raw.cummulativeQuoteQty ?? raw.cumQuote ?? 0);
  const reportedAverage = Number(raw.avgPrice ?? raw.actualPrice ?? raw.price ?? 0);
  const average = reportedAverage > 0 ? reportedAverage : executed > 0 && quoteQuantity > 0 ? quoteQuantity / executed : 0;
  return {
    exchangeOrderId: String(raw.actualOrderId ?? raw.orderId ?? raw.orderListId ?? raw.algoId ?? ""),
    clientOrderId: String(raw.clientOrderId ?? raw.origClientOrderId ?? raw.clientAlgoId ?? fallbackClientOrderId),
    status: responseStatus(raw),
    filledQuantity: Number.isFinite(executed) ? executed : 0,
    averagePrice: average > 0 ? average : null,
    raw
  };
}

export class BinanceRequestError extends Error {
  status: number;
  code: number | null;
  statusUnknown: boolean;
  actionRequired: string | null;

  constructor(message: string, status: number, code: number | null, statusUnknown = false, actionRequired: string | null = null) {
    super(message);
    this.name = "BinanceRequestError";
    this.status = status;
    this.code = code;
    this.statusUnknown = statusUnknown;
    this.actionRequired = actionRequired;
  }
}

export function isBinanceMissingOrderError(caught: unknown) {
  return caught instanceof BinanceRequestError && (caught.code === -2013 || caught.code === -2011);
}

function describeBinanceRejection(code: number | null, rawMessage: unknown, status: number) {
  if (code === -4411) {
    return {
      actionRequired: "SIGN_TRADFI_PERPS_AGREEMENT",
      message: "Binance TradFi 永续协议未签署（-4411）。请登录与该 API Key 相同 UID 的 Binance 账户，在 USDⓈ-M 合约的 TradFi 区打开该标的并完成风险披露与服务协议确认。当前订单未成交，系统不会自动重试；签署后请重新连接校验并创建新的交易意图。"
    };
  }
  return {
    actionRequired: null,
    message: `Binance 拒绝请求${code == null ? "" : ` (${code})`}：${String(rawMessage ?? `HTTP ${status}`)}`
  };
}

export class TideSightBinanceClient {
  readonly environment: BinanceEnvironment;
  readonly market: BinanceMarket;
  readonly baseUrl: string;
  private apiKey: string;
  private apiSecret: string;
  private dispatcher: Dispatcher | null;
  private timeOffset = 0;
  private rules = new Map<string, SymbolRules>();
  private accountMode: BinanceAccountMode | "auto";

  constructor(options: BinanceClientOptions) {
    this.environment = options.environment;
    this.market = options.market;
    this.baseUrl = BASE_URLS[options.environment][options.market];
    this.apiKey = options.apiKey;
    this.apiSecret = options.apiSecret;
    this.accountMode = options.accountMode ?? "classic";
    if (this.accountMode === "portfolio" && (options.environment !== "live" || options.market !== "futures")) throw new Error("PAPI 仅支持生产统一账户 UM 合约");
    this.dispatcher = options.proxy === "direct"
      ? new Agent()
      : options.proxy
        ? new ProxyAgent(options.proxy)
        : null;
  }

  async close() {
    await this.dispatcher?.close().catch(() => undefined);
  }

  private async rawRequest(
    method: "GET" | "POST" | "DELETE" | "PUT",
    path: string,
    params: Record<string, string | number | boolean> = {},
    options: { signed?: boolean; apiKey?: boolean; retryTime?: boolean } = {}
  ): Promise<Record<string, unknown>> {
    const values = { ...params };
    if (options.signed) {
      values.recvWindow = 5000;
      values.timestamp = Date.now() + this.timeOffset;
    }
    const { query, signature } = signBinanceQuery(values, options.signed ? this.apiSecret : "");
    const suffix = `${query}${options.signed ? `${query ? "&" : ""}signature=${signature}` : ""}`;
    let response: Response;
    try {
      const host = path.startsWith("/papi/") ? "https://papi.binance.com" : path.startsWith("/sapi/") || path.startsWith("/api/") && this.accountMode === "portfolio" ? BASE_URLS.live.spot : this.baseUrl;
      response = await fetch(`${host}${path}${suffix ? `?${suffix}` : ""}`, {
        method,
        headers: options.signed || options.apiKey ? { "X-MBX-APIKEY": this.apiKey } : undefined,
        signal: AbortSignal.timeout(12_000),
        ...(this.dispatcher ? { dispatcher: this.dispatcher } : {})
      } as RequestInit & { dispatcher?: Dispatcher });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "network request failed";
      throw new BinanceRequestError(`Binance 网络请求失败：${message}`, 503, null, method === "POST");
    }

    const raw = await response.json().catch(() => ({})) as Record<string, unknown>;
    const code = typeof raw.code === "number" ? raw.code : null;
    if (!response.ok || (code != null && code < 0)) {
      if (options.signed && options.retryTime !== false && code === -1021) {
        await this.syncTime();
        return this.rawRequest(method, path, params, { ...options, retryTime: false });
      }
      const rejection = describeBinanceRejection(code, raw.msg, response.status);
      throw new BinanceRequestError(
        rejection.message,
        response.status,
        code,
        method === "POST" && (response.status >= 500 || code === -1007),
        rejection.actionRequired
      );
    }
    return raw;
  }

  async syncTime() {
    const path = this.market === "spot" ? "/api/v3/time" : "/fapi/v1/time";
    const raw = await this.rawRequest("GET", path);
    this.timeOffset = Number(raw.serverTime ?? Date.now()) - Date.now();
  }

  async loadSymbolRules(symbol: string) {
    const normalized = symbol.toUpperCase();
    if (this.rules.has(normalized)) return this.rules.get(normalized)!;
    const path = this.market === "spot" ? "/api/v3/exchangeInfo" : "/fapi/v1/exchangeInfo";
    const raw = await this.rawRequest("GET", path, { symbol: normalized });
    const symbols = Array.isArray(raw.symbols) ? raw.symbols as Array<Record<string, unknown>> : [];
    const item = symbols.find((entry: Record<string, unknown>) => String(entry.symbol) === normalized);
    if (!item) throw new Error(`${normalized} 不在当前 Binance ${this.market === "spot" ? "现货" : "永续"}环境的可交易列表中`);
    if (item.status !== "TRADING") throw new Error(`${normalized} 当前不可交易`);
    const filters = Array.isArray(item.filters) ? item.filters as Array<Record<string, unknown>> : [];
    const lot = filters.find((filter) => filter.filterType === "LOT_SIZE") ?? {};
    const price = filters.find((filter) => filter.filterType === "PRICE_FILTER") ?? {};
    const notional = filters.find((filter) => ["MIN_NOTIONAL", "NOTIONAL"].includes(String(filter.filterType))) ?? {};
    const rules = {
      quantityStep: Number(lot.stepSize ?? 0.001),
      priceStep: Number(price.tickSize ?? 0.0001),
      minQuantity: Number(lot.minQty ?? 0),
      minNotional: Number(notional.minNotional ?? notional.notional ?? 5)
    };
    this.rules.set(normalized, rules);
    return rules;
  }

  async preflight() {
    await this.syncTime();
    const permissions = await this.readPermissions();
    if (this.accountMode === "portfolio") {
      const [account, config, positions, balances, cm, cmOrders, cmAlgos, umOrders, umAlgos] = await Promise.all([
        this.rawRequest("GET", "/papi/v1/account", {}, { signed: true }),
        this.rawRequest("GET", "/papi/v1/um/accountConfig", {}, { signed: true }),
        this.rawRequest("GET", "/papi/v1/um/positionRisk", {}, { signed: true }),
        this.rawRequest("GET", "/papi/v1/balance", {}, { signed: true }),
        this.rawRequest("GET", "/papi/v1/cm/positionRisk", {}, { signed: true }),
        this.rawRequest("GET", "/papi/v1/cm/openOrders", {}, { signed: true }),
        this.rawRequest("GET", "/papi/v1/cm/conditional/openOrders", {}, { signed: true }),
        this.rawRequest("GET", "/papi/v1/um/openOrders", {}, { signed: true }),
        this.rawRequest("GET", "/papi/v1/um/algo/openAlgoOrders", {}, { signed: true }),
      ]);
      if (config.canTrade !== true) throw new Error("PAPI 统一账户 UM 交易权限不可确认；请启用统一账户交易");
      if (config.dualSidePosition !== false) throw new Error("PAPI 执行器要求已确认的 One-way Mode；不会自动切换账户持仓模式");
      if (accountRows(cmOrders, "CM 挂单").length || accountRows(cmAlgos, "CM 条件单").length) throw new Error("PAPI 专用账户存在 COIN-M 挂单；禁止混用风险资金");
      const openOrderClientIds = [...accountRows(umOrders, "UM 挂单").map(o => o.clientOrderId), ...accountRows(umAlgos, "UM Algo 挂单").map(o => o.clientAlgoId)];
      if (openOrderClientIds.some(id => typeof id !== "string" || !id)) throw new Error("PAPI 挂单归属不可确认");
      return { connected: true, canTrade: true, environment: this.environment, market: this.market,
        accountMode: "portfolio" as const, accountType: "PORTFOLIO_MARGIN_UM", adapterVersion: 2,
        openOrderClientIds: openOrderClientIds as string[],
        withdrawalsDisabled: true, ipRestricted: typeof permissions.ipRestrict === "boolean" ? permissions.ipRestrict : null,
        ...portfolioRiskSnapshot(account, positions, balances, cm), updateTime: new Date().toISOString() };
    }
    const accountPath = this.market === "spot" ? "/api/v3/account" : "/fapi/v3/account";
    const account = await this.rawRequest("GET", accountPath, {}, { signed: true });
    if (account.canTrade !== true) throw new Error("该 API Key 交易权限不可确认");
    if (this.market === "futures") {
      const positionMode = await this.rawRequest("GET", "/fapi/v1/positionSide/dual", {}, { signed: true });
      if (positionMode.dualSidePosition !== false) throw new Error("执行器要求已确认的 One-way Mode");
      if (!Array.isArray(account.positions)) throw new Error("账户持仓快照不完整");
    }
    const balances = Array.isArray(account.balances) ? account.balances as Array<Record<string, unknown>> : [];
    const positions = Array.isArray(account.positions) ? account.positions as Array<Record<string, unknown>> : [];
    if (positions.some((position) => !Number.isFinite(Number(position.positionAmt)) || (Number(position.positionAmt) !== 0 && !Number.isFinite(Number(position.notional)) && !Number.isFinite(Number(position.markPrice))))) throw new Error("账户敞口明细不可确认");
    const equity = this.market === "futures"
      ? Number(account.totalMarginBalance ?? account.totalWalletBalance ?? 0)
      : Number(balances.find((item: Record<string, unknown>) => String(item.asset) === "USDT")?.free ?? 0);
    const riskExposureNotional = this.market === "futures"
      ? positions.reduce((total, position) => {
        const notional = Number(position.notional);
        const fallbackNotional = Number(position.positionAmt) * Number(position.markPrice);
        const value = Number.isFinite(notional) ? notional : fallbackNotional;
        return total + (Number.isFinite(value) ? Math.abs(value) : 0);
      }, 0)
      : null;
    const unrealizedPnl = this.market === "futures"
      ? Number(account.totalUnrealizedProfit ?? positions.reduce((total, position) => total + Number(position.unrealizedProfit ?? 0), 0))
      : null;
    return {
      connected: true,
      canTrade: true,
      environment: this.environment,
      market: this.market,
      accountType: String(account.accountType ?? (this.market === "futures" ? "USD_M_FUTURES" : "SPOT")),
      accountMode: "classic" as const,
      adapterVersion: 2,
      equity: Number.isFinite(equity) ? equity : 0,
      availableBalance: Number(account.availableBalance ?? equity),
      withdrawalsDisabled: true,
      ipRestricted: typeof permissions.ipRestrict === "boolean" ? permissions.ipRestrict : null,
      riskExposureNotional: riskExposureNotional != null && Number.isFinite(riskExposureNotional) ? riskExposureNotional : null,
      unrealizedPnl: unrealizedPnl != null && Number.isFinite(unrealizedPnl) ? unrealizedPnl : null,
      openPositionCount: this.market === "futures" ? positions.filter((position) => Math.abs(Number(position.positionAmt) || 0) > 0).length : null,
      updateTime: new Date().toISOString()
    };
  }

  private async readPermissions() {
    const permissions = await this.rawRequest("GET", "/sapi/v1/account/apiRestrictions", {}, { signed: true });
    if (permissions.enableWithdrawals !== false) throw new Error("TideSight 要求交易所确认提现关闭；不限制是否已启用 IP 白名单");
    if (this.market === "futures") {
      const detected: BinanceAccountMode = permissions.enablePortfolioMarginTrading === true ? "portfolio" : "classic";
      if (this.accountMode !== "auto" && this.accountMode !== detected) throw new Error("交易所账户模式与已验证的 TideSight 通道不一致；请停止执行并重新配置/预检，不自动切换资金模式");
      if (detected === "classic" && permissions.enableFutures !== true) throw new Error("TideSight 凭据未启用 Futures 交易权限：现货/杠杆权限不等于合约权限；统一账户请开启统一账户交易权限");
      if (detected === "portfolio" && this.environment !== "live") throw new Error("PAPI 仅支持生产统一账户");
      this.accountMode = detected;
    }
    return permissions;
  }

  private async futuresPath(classic: string, portfolio: string) {
    if (this.accountMode === "auto") await this.readPermissions();
    return this.accountMode === "portfolio" ? portfolio : classic;
  }

  async getPrice(symbol: string) {
    const path = this.market === "spot" ? "/api/v3/ticker/price" : "/fapi/v1/premiumIndex";
    const raw = await this.rawRequest("GET", path, { symbol: symbol.toUpperCase() });
    const value = Number(raw.price ?? raw.markPrice ?? raw.indexPrice);
    if (!(value > 0)) throw new Error(`Binance 未返回 ${symbol} 的有效价格`);
    return value;
  }

  async getFuturesPosition(symbol: string) {
    if (this.market !== "futures") return null;
    const normalized = symbol.toUpperCase();
    const raw = await this.rawRequest("GET", await this.futuresPath("/fapi/v3/positionRisk", "/papi/v1/um/positionRisk"), { symbol: normalized }, { signed: true }) as unknown;
    if (!Array.isArray(raw)) throw new Error("持仓响应不可确认");
    const rows = raw as Array<Record<string, unknown>>;
    const position = rows.find((item) => String(item.symbol).toUpperCase() === normalized);
    if (position && position.positionSide != null && position.positionSide !== "BOTH") throw new Error("持仓模式变化，禁止按单向仓位处理");
    const signedQuantity = position ? accountNumber(position.positionAmt, "持仓数量") : 0;
    if (!Number.isFinite(signedQuantity)) throw new Error("持仓数量无效");
    const entryPrice = Number(position?.entryPrice ?? 0);
    const markPrice = Number(position?.markPrice ?? 0);
    const unrealizedPnl = Number(position?.unRealizedProfit ?? position?.unrealizedProfit ?? 0);
    return {
      symbol: normalized,
      signedQuantity: Number.isFinite(signedQuantity) ? signedQuantity : 0,
      quantity: Number.isFinite(signedQuantity) ? Math.abs(signedQuantity) : 0,
      side: signedQuantity > 0 ? "LONG" as const : signedQuantity < 0 ? "SHORT" as const : null,
      entryPrice: Number.isFinite(entryPrice) && entryPrice > 0 ? entryPrice : null,
      markPrice: Number.isFinite(markPrice) && markPrice > 0 ? markPrice : null,
      unrealizedPnl: Number.isFinite(unrealizedPnl) ? unrealizedPnl : 0,
      updateTime: Number(position?.updateTime ?? 0) || null
    };
  }

  async getReferencePrice(symbol: string) {
    const path = this.market === "spot" ? "/api/v3/ticker/price" : "/fapi/v1/ticker/price";
    const raw = await this.rawRequest("GET", path, { symbol: symbol.toUpperCase() });
    const value = Number(raw.price);
    if (!(value > 0)) throw new Error(`Binance 未返回 ${symbol} 的有效实时成交价`);
    return value;
  }

  async setLeverage(symbol: string, leverage: number) {
    if (this.market === "spot") return;
    const raw = await this.rawRequest("POST", await this.futuresPath("/fapi/v1/leverage", "/papi/v1/um/leverage"), {
      symbol: symbol.toUpperCase(),
      leverage: Math.max(1, Math.min(25, Math.trunc(leverage)))
    }, { signed: true });
    if (this.accountMode === "portfolio" && Number(raw.leverage) !== Math.max(1, Math.min(25, Math.trunc(leverage)))) throw new Error("PAPI 杠杆设置回执不匹配");
  }

  async tradingRiskSnapshot() {
    const account = await this.preflight();
    if (this.market !== "futures") throw new Error("TideSight 执行只支持 USDT 永续合约");
    const now = new Date();
    const startTime = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const raw = await this.rawRequest("GET", await this.futuresPath("/fapi/v1/income", "/papi/v1/um/income"), { startTime, endTime: now.getTime(), limit: 1000 }, { signed: true }) as unknown;
    if (!Array.isArray(raw) || raw.length >= 1000) throw new Error("当日损益明细不完整，禁止新增仓位");
    const tradingTypes = new Set(["REALIZED_PNL", "FUNDING_FEE", "COMMISSION", "INSURANCE_CLEAR"]);
    let dailyRealized = 0;
    let bnbFeePrice: number | null = null;
    for (const row of raw as Array<Record<string, unknown>>) {
      if (!tradingTypes.has(String(row.incomeType))) continue;
      const income = accountNumber(row.income, "当日损益");
      if (this.accountMode === "portfolio" && row.asset === "BNB" && row.incomeType === "COMMISSION" && income <= 0) {
        if (bnbFeePrice == null) {
          const ticker = await this.rawRequest("GET", "/api/v3/ticker/24hr", { symbol: "BNBUSDT" });
          bnbFeePrice = accountNumber(ticker.highPrice, "BNB 手续费估值");
          if (!(bnbFeePrice > 0)) throw new Error("BNB 手续费估值不可确认");
        }
        // Conservative risk debit at the rolling 24h high, not realized-PnL accounting.
        dailyRealized += income * bnbFeePrice;
      } else {
        if (row.asset !== "USDT") throw new Error("损益币种或金额不可确认");
        dailyRealized += income;
      }
    }
    return { ...account, dailyPnl: dailyRealized + Number(account.unrealizedPnl ?? 0) };
  }

  async assertFlatSymbol(symbol: string) {
    const position = await this.getFuturesPosition(symbol);
    if (!position || position.quantity !== 0) throw new Error(`${symbol} 已有交易所仓位，拒绝叠加或反向抵消`);
    const orders = await this.rawRequest("GET", await this.futuresPath("/fapi/v1/openOrders", "/papi/v1/um/openOrders"), { symbol }, { signed: true }) as unknown;
    const algos = await this.rawRequest("GET", await this.futuresPath("/fapi/v1/openAlgoOrders", "/papi/v1/um/algo/openAlgoOrders"), { symbol }, { signed: true }) as unknown;
    const algoRows = Array.isArray(algos) ? algos : algos && typeof algos === "object" && "orders" in algos ? (algos as { orders: unknown }).orders : null;
    if (!Array.isArray(orders) || !Array.isArray(algoRows)) throw new Error("交易所未返回可确认的挂单列表");
    if (orders.length || algoRows.length) throw new Error(`${symbol} 已有挂单或保护单，拒绝创建冲突订单`);
  }

  async setIsolatedMargin(symbol: string) {
    if (this.accountMode === "auto") await this.readPermissions();
    if (this.accountMode === "portfolio") return; // Unified collateral: never send a classic marginType mutation.
    try {
      await this.rawRequest("POST", "/fapi/v1/marginType", { symbol, marginType: "ISOLATED" }, { signed: true });
    } catch (caught) {
      if (!(caught instanceof BinanceRequestError) || caught.code !== -4046) throw caught;
    }
  }

  async placeOrder(input: OrderInput) {
    const symbol = input.symbol.toUpperCase();
    const rules = await this.loadSymbolRules(symbol);
    const quantity = floorToBinanceStep(input.quantity, rules.quantityStep);
    const price = input.price ? floorToBinanceStep(input.price, rules.priceStep) : null;
    if (!(quantity >= rules.minQuantity)) throw new Error(`下单数量低于 ${symbol} 最小数量 ${rules.minQuantity}`);
    const reference = price ?? await this.getReferencePrice(symbol);
    if (!input.reduceOnly && input.referencePrice && Math.abs(reference / input.referencePrice - 1) * 10_000 > (input.maxSlippageBps ?? 25)) throw new Error("实时价格偏移超过 25 bps，计划须重新审批");
    if (quantity * reference < rules.minNotional) throw new Error(`订单名义价值低于 ${symbol} 最低 ${rules.minNotional} USDT`);
    if (this.market === "futures" && !input.reduceOnly) {
      await this.assertFlatSymbol(symbol);
      await this.setIsolatedMargin(symbol);
      await this.setLeverage(symbol, input.leverage ?? 1);
    }

    const params: Record<string, string | number | boolean> = {
      symbol,
      side: input.side,
      type: input.type,
      quantity,
      newClientOrderId: input.clientOrderId.slice(0, 36)
    };
    params.newOrderRespType = this.market === "spot" ? "FULL" : "RESULT";
    if (input.type === "LIMIT") {
      params.price = price!;
      params.timeInForce = "GTC";
    }
    if (this.market === "futures" && input.reduceOnly) params.reduceOnly = "true";
    const path = this.market === "spot" ? "/api/v3/order" : await this.futuresPath("/fapi/v1/order", "/papi/v1/um/order");
    if (this.accountMode === "portfolio" && !input.reduceOnly) {
      const snapshot = await this.preflight();
      const marginWithCosts = quantity * reference * (1 / (input.leverage ?? 1) + 0.0015);
      if (marginWithCosts > snapshot.availableBalance) throw new Error("PAPI 最终保证金复核不足（含安全缓冲及费用预算）");
      params.selfTradePreventionMode = "EXPIRE_BOTH";
    }
    await input.beforeSubmit?.();
    try {
      const receipt = await this.rawRequest("POST", path, params, { signed: true });
      if (this.accountMode === "portfolio" && (!(Number(receipt.orderId) > 0) || receipt.clientOrderId !== input.clientOrderId.slice(0, 36) || !["NEW", "PARTIALLY_FILLED", "FILLED", "CANCELED", "EXPIRED", "REJECTED"].includes(String(receipt.status)))) throw new BinanceRequestError("PAPI 下单回执不完整，按同一订单号查询，不重复发单", 409, null, true);
      return orderResult(receipt, input.clientOrderId);
    } catch (caught) {
      if (!(caught instanceof BinanceRequestError) || !caught.statusUnknown) throw caught;
      try {
        return await this.getOrder(symbol, input.clientOrderId);
      } catch {
        throw new BinanceRequestError(`${caught.message}；订单状态未知，已停止自动重试并等待对账`, caught.status, caught.code, true, caught.actionRequired);
      }
    }
  }

  async getOrder(symbol: string, clientOrderId: string, conditional = false) {
    if (this.market === "futures" && conditional) {
      const raw = await this.rawRequest("GET", await this.futuresPath("/fapi/v1/algoOrder", "/papi/v1/um/algo/algoOrder"), {
        clientAlgoId: clientOrderId.slice(0, 36)
      }, { signed: true });
      if (this.accountMode === "portfolio" && String(raw.actualOrderId ?? "").match(/^[1-9][0-9]*$/)) {
        try {
          const actual = await this.rawRequest("GET", "/papi/v1/um/order", { symbol: symbol.toUpperCase(), orderId: String(raw.actualOrderId) }, { signed: true });
          return { ...orderResult(actual, clientOrderId), clientOrderId, raw: { ...actual, algo: raw } };
        } catch {
          throw new BinanceRequestError("PAPI 保护单已触发，实际子订单尚不可确认；不得视为撤销或重试", 409, null, true);
        }
      }
      if (this.accountMode === "portfolio" && !["NEW", "CANCELED", "EXPIRED", "REJECTED"].includes(String(raw.algoStatus))) throw new BinanceRequestError("PAPI 保护单已触发但实际成交不可确认，等待对账，不重试下单", 409, null, true);
      return orderResult(raw, clientOrderId);
    }
    const path = this.market === "spot" ? "/api/v3/order" : await this.futuresPath("/fapi/v1/order", "/papi/v1/um/order");
    const raw = await this.rawRequest("GET", path, {
      symbol: symbol.toUpperCase(),
      origClientOrderId: clientOrderId.slice(0, 36)
    }, { signed: true });
    return orderResult(raw, clientOrderId);
  }

  async placeProtection(input: {
    symbol: string;
    quantity: number;
    stopLoss: number;
    takeProfit: number;
    side: "LONG" | "SHORT";
    stopClientOrderId: string;
    takeProfitClientOrderId: string;
    listClientOrderId: string;
  }) {
    const symbol = input.symbol.toUpperCase();
    const rules = await this.loadSymbolRules(symbol);
    const quantity = floorToBinanceStep(input.quantity, rules.quantityStep);
    const stop = floorToBinanceStep(input.stopLoss, rules.priceStep);
    const target = floorToBinanceStep(input.takeProfit, rules.priceStep);
    const exitSide = input.side === "LONG" ? "SELL" : "BUY";
    if (this.market === "spot") {
      if (input.side !== "LONG") throw new Error("现货保护单只支持多头持仓");
      const stopLimit = floorToBinanceStep(stop * 0.995, rules.priceStep);
      const raw = await this.rawRequest("POST", "/api/v3/orderList/oco", {
        symbol,
        side: "SELL",
        quantity,
        listClientOrderId: input.listClientOrderId.slice(0, 36),
        aboveType: "TAKE_PROFIT_LIMIT",
        abovePrice: target,
        aboveStopPrice: target,
        aboveTimeInForce: "GTC",
        aboveClientOrderId: input.takeProfitClientOrderId.slice(0, 36),
        belowType: "STOP_LOSS_LIMIT",
        belowPrice: stopLimit,
        belowStopPrice: stop,
        belowTimeInForce: "GTC",
        belowClientOrderId: input.stopClientOrderId.slice(0, 36)
      }, { signed: true });
      return { type: "OCO", raw };
    }

    const common = {
      algoType: "CONDITIONAL",
      symbol,
      side: exitSide,
      quantity,
      reduceOnly: "true",
      workingType: "MARK_PRICE",
      priceProtect: "true"
    };
    const protectionPath = await this.futuresPath("/fapi/v1/algoOrder", "/papi/v1/um/algo/order");
    const stopResult = await this.rawRequest("POST", protectionPath, {
      ...common,
      type: "STOP_MARKET",
      triggerPrice: stop,
      clientAlgoId: input.stopClientOrderId.slice(0, 36),
      newOrderRespType: "RESULT"
    }, { signed: true });
    this.assertProtectionReceipt(stopResult, input.stopClientOrderId, symbol);
    const targetResult = await this.rawRequest("POST", protectionPath, {
      ...common,
      type: "TAKE_PROFIT_MARKET",
      triggerPrice: target,
      clientAlgoId: input.takeProfitClientOrderId.slice(0, 36),
      newOrderRespType: "RESULT"
    }, { signed: true });
    this.assertProtectionReceipt(targetResult, input.takeProfitClientOrderId, symbol);
    return { type: "PAIR", stop: stopResult, takeProfit: targetResult };
  }

  private assertProtectionReceipt(raw: Record<string, unknown>, clientOrderId: string, symbol: string) {
    if (this.accountMode !== "portfolio") return;
    if (!(Number(raw.algoId) > 0) || raw.clientAlgoId !== clientOrderId.slice(0, 36) || raw.symbol !== symbol || raw.algoStatus !== "NEW" || raw.reduceOnly !== true) throw new BinanceRequestError("PAPI 原生保护单回执不可确认，禁止宣称保护已生效", 409, null, true);
  }

  async cancelOrder(symbol: string, clientOrderId: string, conditional = false) {
    if (this.market === "futures" && conditional) {
      const result = await this.rawRequest("DELETE", await this.futuresPath("/fapi/v1/algoOrder", "/papi/v1/um/algo/order"), {
        clientAlgoId: clientOrderId.slice(0, 36)
      }, { signed: true });
      if (this.accountMode === "portfolio" && result.complete !== true) throw new Error("PAPI 撤销保护单回执不可确认");
      return result;
    }
    const path = this.market === "spot" ? "/api/v3/order" : await this.futuresPath("/fapi/v1/order", "/papi/v1/um/order");
    return this.rawRequest("DELETE", path, {
      symbol: symbol.toUpperCase(),
      origClientOrderId: clientOrderId.slice(0, 36)
    }, { signed: true });
  }

  async cancelAll(symbol: string) {
    const normalized = symbol.toUpperCase();
    if (this.market === "spot") {
      return this.rawRequest("DELETE", "/api/v3/openOrders", { symbol: normalized }, { signed: true });
    }
    const results = await Promise.allSettled([
      this.rawRequest("DELETE", await this.futuresPath("/fapi/v1/allOpenOrders", "/papi/v1/um/allOpenOrders"), { symbol: normalized }, { signed: true }),
      this.rawRequest("DELETE", await this.futuresPath("/fapi/v1/algoOpenOrders", "/papi/v1/um/algo/allOpenOrders"), { symbol: normalized }, { signed: true })
    ]);
    const failures = results.filter((item): item is PromiseRejectedResult => item.status === "rejected");
    if (failures.length) throw failures[0].reason;
    if (this.accountMode === "portfolio" && results.some(item => item.status === "fulfilled" && item.value.code !== 200)) throw new Error("PAPI 批量撤单回执不可确认，等待对账");
    return { regular: results[0], conditional: results[1] };
  }

  async closePosition(input: { symbol: string; side: "LONG" | "SHORT"; quantity: number; clientOrderId: string }) {
    return this.placeOrder({
      symbol: input.symbol,
      side: input.side === "LONG" ? "SELL" : "BUY",
      type: "MARKET",
      quantity: input.quantity,
      clientOrderId: input.clientOrderId,
      reduceOnly: this.market === "futures"
    });
  }

  async startUserStream() {
    const path = this.market === "spot" ? "/api/v3/userDataStream" : await this.futuresPath("/fapi/v1/listenKey", "/papi/v1/listenKey");
    const raw = await this.rawRequest("POST", path, {}, { apiKey: true });
    const listenKey = String(raw.listenKey ?? "");
    if (!listenKey) throw new Error("Binance 未返回 User Data Stream listenKey");
    return { listenKey, wsUrl: `${this.accountMode === "portfolio" ? "wss://fstream.binance.com/pm/ws" : WS_URLS[this.environment][this.market]}/${listenKey}` };
  }

  async keepaliveUserStream(listenKey: string) {
    const path = this.market === "spot" ? "/api/v3/userDataStream" : await this.futuresPath("/fapi/v1/listenKey", "/papi/v1/listenKey");
    return this.rawRequest("PUT", path, this.market === "spot" ? { listenKey } : {}, { apiKey: true });
  }

  async closeUserStream(listenKey: string) {
    const path = this.market === "spot" ? "/api/v3/userDataStream" : await this.futuresPath("/fapi/v1/listenKey", "/papi/v1/listenKey");
    return this.rawRequest("DELETE", path, this.market === "spot" ? { listenKey } : {}, { apiKey: true });
  }
}

export async function getLiveBinanceReferencePrice(market: BinanceMarket, symbol: string) {
  const client = new TideSightBinanceClient({
    environment: "live",
    market,
    apiKey: "",
    apiSecret: ""
  });
  try {
    return await client.getReferencePrice(symbol);
  } finally {
    await client.close();
  }
}
