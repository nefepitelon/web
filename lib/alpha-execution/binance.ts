import "server-only";
import { createHmac } from "node:crypto";
import { Agent, ProxyAgent, type Dispatcher } from "undici";

export type BinanceEnvironment = "testnet" | "live";
export type BinanceMarket = "spot" | "futures";

type BinanceClientOptions = {
  environment: BinanceEnvironment;
  market: BinanceMarket;
  apiKey: string;
  apiSecret: string;
  proxy?: string | null;
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
};

export type BinanceOrderResult = {
  exchangeOrderId: string;
  clientOrderId: string;
  status: string;
  filledQuantity: number;
  averagePrice: number | null;
  raw: Record<string, unknown>;
};

export type AutomationAccountSnapshot = {
  availableMargin: number; equity: number; unrealizedPnl: number; observedAt: string;
  positions: Array<{ symbol: string; side: "long" | "short"; quantity: number; entryPrice: number; markPrice: number; notional: number }>;
  openEntryOrders: Array<{ id: string; clientOrderId: string; symbol: string; side: "buy" | "sell"; quantity: number; remainingQuantity: number; price: number; notional: number; conditional: boolean }>;
};

function requiredNumber(value: unknown, label: string) {
  if ((typeof value !== "string" && typeof value !== "number") || String(value).trim() === "" || !Number.isFinite(Number(value))) {
    throw new Error(`Binance 账户快照缺少有效 ${label}`);
  }
  return Number(value);
}

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

/** Preserve integer tokens that JSON's Number representation cannot represent.
 * Only the income endpoint opts into this parser, so order-response contracts stay
 * unchanged. Tokenizing quoted strings first leaves IDs mentioned in text intact.
 */
export function parseBinanceIncomeJson(text: string): unknown {
  const lossless = text.replace(/"(?:\\[\s\S]|[^"\\])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/g, (token) => {
    if (token.startsWith('"') || !/^-?\d+$/.test(token) || Number.isSafeInteger(Number(token))) return token;
    return JSON.stringify(token);
  });
  return JSON.parse(lossless);
}

function responseStatus(raw: Record<string, unknown>) {
  return String(raw.status ?? raw.algoStatus ?? (Number(raw.executedQty ?? raw.actualQty ?? 0) > 0 ? "FILLED" : "NEW"));
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

export class AlphaBinanceClient {
  readonly environment: BinanceEnvironment;
  readonly market: BinanceMarket;
  readonly baseUrl: string;
  private apiKey: string;
  private apiSecret: string;
  private dispatcher: Dispatcher | null;
  private timeOffset = 0;
  private rules = new Map<string, SymbolRules>();

  constructor(options: BinanceClientOptions) {
    this.environment = options.environment;
    this.market = options.market;
    this.baseUrl = BASE_URLS[options.environment][options.market];
    this.apiKey = options.apiKey;
    this.apiSecret = options.apiSecret;
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
    options: { signed?: boolean; apiKey?: boolean; retryTime?: boolean; losslessIncome?: boolean } = {}
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
      response = await fetch(`${this.baseUrl}${path}${suffix ? `?${suffix}` : ""}`, {
        method,
        headers: options.signed || options.apiKey ? { "X-MBX-APIKEY": this.apiKey } : undefined,
        signal: AbortSignal.timeout(12_000),
        ...(this.dispatcher ? { dispatcher: this.dispatcher } : {})
      } as RequestInit & { dispatcher?: Dispatcher });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "network request failed";
      throw new BinanceRequestError(`Binance 网络请求失败：${message}`, 503, null, method === "POST");
    }

    const raw = await (options.losslessIncome ? response.text().then(parseBinanceIncomeJson) : response.json()).catch(() => ({})) as Record<string, unknown>;
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

  async getIncomeHistoryPage(input: { startTime: number; endTime: number; page: number; limit?: number }) {
    if (this.market !== "futures") throw new Error("Binance Spot does not provide futures income history");
    const { startTime, endTime, page } = input;
    const limit = input.limit ?? 1000;
    if (!Number.isSafeInteger(startTime) || !Number.isSafeInteger(endTime) || startTime > endTime
      || !Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
      throw new Error("Invalid Binance income history interval or page");
    }
    // Read all income types to expose transfers separately from trading PnL.
    // Official USER_DATA endpoint: last 3 months, page-based, at most 1,000 rows.
    const raw = await this.rawRequest("GET", "/fapi/v1/income", { startTime, endTime, page, limit }, { signed: true, losslessIncome: true });
    if (!Array.isArray(raw)) throw new Error("Binance income history returned an invalid response");
    return raw as Array<Record<string, unknown>>;
  }

  /** Account-wide, read-only exposure; never substitute local Alpha positions for it. */
  async getAutomationAccountSnapshot(): Promise<AutomationAccountSnapshot> {
    if (this.environment !== "live" || this.market !== "futures") throw new Error("自动账户风险快照仅支持 LIVE USDⓈ-M 合约");
    // accountConfig checks empty hedge accounts too. Both order services must be read:
    // conditional entries moved to /openAlgoOrders and are absent from /openOrders.
    const [config, account, risk, regular, conditional] = await Promise.all([
      this.rawRequest("GET", "/fapi/v1/accountConfig", {}, { signed: true }),
      this.rawRequest("GET", "/fapi/v3/account", {}, { signed: true }),
      this.rawRequest("GET", "/fapi/v3/positionRisk", {}, { signed: true }),
      this.rawRequest("GET", "/fapi/v1/openOrders", {}, { signed: true }),
      this.rawRequest("GET", "/fapi/v1/openAlgoOrders", {}, { signed: true }),
    ]);
    if (config.dualSidePosition !== false || config.multiAssetsMargin !== false || config.canTrade !== true) {
      throw new Error("自动交易需要已确认的单向持仓、单资产且可交易的合约账户");
    }
    if (!Array.isArray(account.assets) || !Array.isArray(account.positions) || !Array.isArray(risk) || !Array.isArray(regular) || !Array.isArray(conditional)) {
      throw new Error("Binance 账户、仓位或挂单快照不完整");
    }
    const usdt = account.assets.find((asset: Record<string, unknown>) => asset.asset === "USDT");
    if (!usdt) throw new Error("Binance 未返回 USDT 保证金账户");
    const availableMargin = requiredNumber(usdt.availableBalance, "USDT availableBalance");
    const equity = requiredNumber(usdt.marginBalance, "USDT marginBalance");
    const unrealizedPnl = requiredNumber(usdt.unrealizedProfit, "USDT unrealizedProfit");
    if (availableMargin < 0 || equity <= 0) throw new Error("USDT 保证金账户权益或可用保证金不足");
    const positions: AutomationAccountSnapshot["positions"] = [];
    const markPrices = new Map<string, number>();
    const amounts = new Map<string, number>();
    for (const row of risk as Array<Record<string, unknown>>) {
      const symbol = String(row.symbol || "");
      if (!symbol || row.positionSide !== "BOTH" || amounts.has(symbol)) throw new Error("仓位模式或仓位快照无法确认");
      const amount = requiredNumber(row.positionAmt, `${symbol} positionAmt`);
      amounts.set(symbol, amount);
      const markPrice = requiredNumber(row.markPrice, `${symbol} markPrice`);
      if (markPrice > 0) markPrices.set(symbol, markPrice);
      if (amount === 0) continue;
      if (row.marginAsset !== "USDT") throw new Error("存在非 USDT 保证金持仓，无法统一计算自动风险额度");
      const entryPrice = requiredNumber(row.entryPrice, `${symbol} entryPrice`);
      const notional = Math.abs(requiredNumber(row.notional, `${symbol} notional`));
      if (markPrice <= 0 || entryPrice <= 0 || notional <= 0) throw new Error("持仓价格或名义敞口无效");
      positions.push({ symbol, side: amount > 0 ? "long" : "short", quantity: Math.abs(amount), entryPrice, markPrice, notional });
    }
    // A missing positionRisk row must not be interpreted as an empty account.
    const accountAmounts = new Map<string, number>();
    for (const row of account.positions as Array<Record<string, unknown>>) {
      const symbol = String(row.symbol || "");
      const amount = requiredNumber(row.positionAmt, `${symbol} account positionAmt`);
      if (row.positionSide !== "BOTH" || !symbol || accountAmounts.has(symbol)) throw new Error("账户持仓模式或重复仓位无法确认");
      accountAmounts.set(symbol, amount);
      if (amount !== 0 && amounts.get(symbol) !== amount) throw new Error("账户与持仓数量不同步，请等待下一轮风险快照");
    }
    for (const [symbol, amount] of amounts) if (amount !== 0 && accountAmounts.get(symbol) !== amount) throw new Error("持仓与账户数量不同步，请等待下一轮风险快照");
    const openEntryOrders: AutomationAccountSnapshot["openEntryOrders"] = [];
    for (const [rows, isConditional] of [[regular, false], [conditional, true]] as const) {
      for (const row of rows as Array<Record<string, unknown>>) {
        if (row.positionSide !== "BOTH") throw new Error("存在无法确认持仓模式的挂单");
        if (row.reduceOnly === true || row.reduceOnly === "true" || row.closePosition === true || row.closePosition === "true") continue;
        const symbol = String(row.symbol || "");
        if (!/USDT$/.test(symbol) || !["BUY", "SELL"].includes(String(row.side))) throw new Error("存在非 USDT 或方向未知的开仓挂单");
        const quantity = requiredNumber(isConditional ? row.quantity : row.origQty, `${symbol} order quantity`);
        // Open conditional orders reserve their full quantity until their child order
        // disappears from this endpoint. Double counting during transition is safer.
        const executed = isConditional ? 0 : requiredNumber(row.executedQty, `${symbol} executedQty`);
        if (!(quantity > 0) || executed < 0 || executed > quantity) throw new Error("开仓挂单剩余数量无效");
        const remainingQuantity = quantity - executed;
        if (remainingQuantity === 0) continue;
        const clientOrderId = String((isConditional ? row.clientAlgoId : row.clientOrderId) || "");
        const id = row[isConditional ? "algoId" : "orderId"];
        if (id == null || !clientOrderId || (typeof id === "number" && !Number.isSafeInteger(id))) throw new Error("开仓挂单标识不完整");
        let markPrice = markPrices.get(symbol);
        if (!(markPrice && markPrice > 0)) {
          const priceData = await this.rawRequest("GET", "/fapi/v1/premiumIndex", { symbol });
          markPrice = requiredNumber(priceData.markPrice, `${symbol} order markPrice`);
          if (!(markPrice > 0)) throw new Error("开仓挂单标记价格不可用");
          markPrices.set(symbol, markPrice);
        }
        const orderPrice = requiredNumber(row.price, `${symbol} order price`);
        const triggerPrice = isConditional ? requiredNumber(row.triggerPrice, `${symbol} triggerPrice`) : 0;
        if (orderPrice < 0 || triggerPrice < 0) throw new Error("开仓挂单价格无效");
        const price = Math.max(markPrice, orderPrice, triggerPrice);
        const notional = remainingQuantity * price;
        if (!Number.isFinite(notional)) throw new Error("开仓挂单名义敞口无效");
        openEntryOrders.push({ id: String(id), clientOrderId, symbol, side: row.side === "BUY" ? "buy" : "sell", quantity, remainingQuantity, price, notional, conditional: isConditional });
      }
    }
    return { availableMargin, equity, unrealizedPnl, positions, openEntryOrders, observedAt: new Date().toISOString() };
  }

  async loadSymbolRules(symbol: string) {
    const normalized = symbol.toUpperCase();
    if (this.rules.has(normalized)) return this.rules.get(normalized)!;
    const path = this.market === "spot" ? "/api/v3/exchangeInfo" : "/fapi/v1/exchangeInfo";
    const raw = await this.rawRequest("GET", path, { symbol: normalized });
    const symbols = Array.isArray(raw.symbols) ? raw.symbols as Array<Record<string, unknown>> : [];
    const item = symbols.find((entry: Record<string, unknown>) => String(entry.symbol) === normalized);
    if (!item) throw new Error(`${normalized} 不在当前 Binance ${this.market === "spot" ? "现货" : "永续"}环境的可交易列表中`);
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
    const accountPath = this.market === "spot" ? "/api/v3/account" : "/fapi/v3/account";
    const account = await this.rawRequest("GET", accountPath, {}, { signed: true });
    if (account.canTrade === false) throw new Error("该 API Key 未启用交易权限");
    if (this.market === "futures") {
      const positionMode = await this.rawRequest("GET", "/fapi/v1/positionSide/dual", {}, { signed: true });
      if (positionMode.dualSidePosition === true) throw new Error("Futures 当前为 Hedge Mode；执行器要求 One-way Mode");
    }
    const balances = Array.isArray(account.balances) ? account.balances as Array<Record<string, unknown>> : [];
    const positions = Array.isArray(account.positions) ? account.positions as Array<Record<string, unknown>> : [];
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
      canTrade: account.canTrade !== false,
      environment: this.environment,
      market: this.market,
      accountType: String(account.accountType ?? (this.market === "futures" ? "USD_M_FUTURES" : "SPOT")),
      equity: Number.isFinite(equity) ? equity : 0,
      riskExposureNotional: riskExposureNotional != null && Number.isFinite(riskExposureNotional) ? riskExposureNotional : null,
      unrealizedPnl: unrealizedPnl != null && Number.isFinite(unrealizedPnl) ? unrealizedPnl : null,
      openPositionCount: this.market === "futures" ? positions.filter((position) => Math.abs(Number(position.positionAmt) || 0) > 0).length : null,
      updateTime: new Date().toISOString()
    };
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
    const raw = await this.rawRequest("GET", "/fapi/v3/positionRisk", { symbol: normalized }, { signed: true }) as unknown;
    if (!Array.isArray(raw)) throw new Error("Binance 持仓响应不完整，不能判定持仓归零");
    const rows = raw as Array<Record<string, unknown>>;
    const position = rows.find((item) => String(item.symbol).toUpperCase() === normalized);
    const signedQuantity = Number(position?.positionAmt ?? 0);
    if ((rows.length && !position) || (position && (position.positionAmt == null || !Number.isFinite(signedQuantity))))
      throw new Error("Binance 持仓数量缺失或无效，停止持仓同步");
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
    await this.rawRequest("POST", "/fapi/v1/leverage", {
      symbol: symbol.toUpperCase(),
      leverage: Math.max(1, Math.min(20, Math.trunc(leverage)))
    }, { signed: true });
  }

  async placeOrder(input: OrderInput) {
    const symbol = input.symbol.toUpperCase();
    const rules = await this.loadSymbolRules(symbol);
    const quantity = floorToBinanceStep(input.quantity, rules.quantityStep);
    const price = input.price ? floorToBinanceStep(input.price, rules.priceStep) : null;
    if (!(quantity >= rules.minQuantity)) throw new Error(`下单数量低于 ${symbol} 最小数量 ${rules.minQuantity}`);
    const reference = price ?? await this.getReferencePrice(symbol);
    if (quantity * reference < rules.minNotional) throw new Error(`订单名义价值低于 ${symbol} 最低 ${rules.minNotional} USDT`);
    if (this.market === "futures") await this.setLeverage(symbol, input.leverage ?? 1);

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
    const path = this.market === "spot" ? "/api/v3/order" : "/fapi/v1/order";
    try {
      return orderResult(await this.rawRequest("POST", path, params, { signed: true }), input.clientOrderId);
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
      const raw = await this.rawRequest("GET", "/fapi/v1/algoOrder", {
        clientAlgoId: clientOrderId.slice(0, 36)
      }, { signed: true });
      return orderResult(raw, clientOrderId);
    }
    const path = this.market === "spot" ? "/api/v3/order" : "/fapi/v1/order";
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
    const stopResult = await this.rawRequest("POST", "/fapi/v1/algoOrder", {
      ...common,
      type: "STOP_MARKET",
      triggerPrice: stop,
      clientAlgoId: input.stopClientOrderId.slice(0, 36),
      newOrderRespType: "RESULT"
    }, { signed: true });
    const targetResult = await this.rawRequest("POST", "/fapi/v1/algoOrder", {
      ...common,
      type: "TAKE_PROFIT_MARKET",
      triggerPrice: target,
      clientAlgoId: input.takeProfitClientOrderId.slice(0, 36),
      newOrderRespType: "RESULT"
    }, { signed: true });
    return { type: "PAIR", stop: stopResult, takeProfit: targetResult };
  }

  async cancelOrder(symbol: string, clientOrderId: string, conditional = false) {
    if (this.market === "futures" && conditional) {
      return this.rawRequest("DELETE", "/fapi/v1/algoOrder", {
        clientAlgoId: clientOrderId.slice(0, 36)
      }, { signed: true });
    }
    const path = this.market === "spot" ? "/api/v3/order" : "/fapi/v1/order";
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
      this.rawRequest("DELETE", "/fapi/v1/allOpenOrders", { symbol: normalized }, { signed: true }),
      this.rawRequest("DELETE", "/fapi/v1/algoOpenOrders", { symbol: normalized }, { signed: true })
    ]);
    const failures = results.filter((item): item is PromiseRejectedResult => item.status === "rejected");
    if (failures.length) throw failures[0].reason;
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
    const path = this.market === "spot" ? "/api/v3/userDataStream" : "/fapi/v1/listenKey";
    const raw = await this.rawRequest("POST", path, {}, { apiKey: true });
    const listenKey = String(raw.listenKey ?? "");
    if (!listenKey) throw new Error("Binance 未返回 User Data Stream listenKey");
    return { listenKey, wsUrl: `${WS_URLS[this.environment][this.market]}/${listenKey}` };
  }
}

export async function getLiveBinanceReferencePrice(market: BinanceMarket, symbol: string) {
  const client = new AlphaBinanceClient({
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
