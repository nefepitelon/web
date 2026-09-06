export type ExtendedOrderStatus = "open" | "filled" | "cancelled" | "unknown";

export type ExtendedOrderIdentity = {
  /** 唯一持久化主键。Extended 的撤单键也是 externalId。 */
  canonicalId: string;
  externalId: string;
  internalIds: string[];
  exchangeIds: string[];
  aliases: string[];
};

export type ExtendedResolvedOrder = {
  identity: ExtendedOrderIdentity;
  row: any | null;
  trades: any[];
  status: ExtendedOrderStatus;
  cumulativeFilled: number | null;
};

export type ExtendedIdentityRaw = {
  _get(path: string): Promise<any>;
  _req(method: string, path: string, body?: unknown, opts?: unknown): Promise<any>;
};

function id(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function aliasId(value: unknown): string {
  if (typeof value === "number" && !Number.isSafeInteger(value)) return "";
  return id(value);
}

function rows(value: any): any[] {
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function finite(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function extendedExternalId(row: any): string {
  return id(
    row?.externalId ??
      row?.external_id ??
      row?.externalOrderId ??
      row?.external_order_id ??
      row?.clientOrderId ??
      row?.order?.externalId
  );
}

export function extendedInternalIds(row: any): string[] {
  return [
    aliasId(row?.internalId),
    aliasId(row?.internal_id),
    aliasId(row?.id),
    aliasId(row?.order?.id),
  ].filter((value, index, all) => value && all.indexOf(value) === index);
}

export function extendedExchangeIds(row: any): string[] {
  return [
    aliasId(row?.exchangeId),
    aliasId(row?.exchange_id),
    aliasId(row?.orderId),
    aliasId(row?.order_id),
    aliasId(row?.order?.orderId),
  ].filter((value, index, all) => value && all.indexOf(value) === index);
}

export function extendedStatus(row: any): ExtendedOrderStatus {
  const status = String(row?.status ?? row?.order_status ?? "").toUpperCase();
  if (status === "FILLED") return "filled";
  if (/CANCEL|REJECT|EXPIRE/.test(status)) return "cancelled";
  if (/NEW|OPEN|PARTIAL|PENDING|UNTRIGGERED/.test(status)) return "open";
  return "unknown";
}

/**
 * Extended 订单身份注册表。
 *
 * externalId/CID 是唯一 canonical id；internal/exchange/order id 都只是别名。
 * 所有 ID 保持字符串，禁止经过 Number。一个别名若指向两个 CID 会立即 fail closed。
 */
export class ExtendedOrderIdentityIndex {
  private readonly byExternal = new Map<
    string,
    { internalIds: Set<string>; exchangeIds: Set<string>; aliases: Set<string> }
  >();
  private readonly externalByAlias = new Map<string, string>();

  register(row: any, expectedExternalId = ""): ExtendedOrderIdentity | null {
    const explicitExternal = extendedExternalId(row);
    if (explicitExternal && expectedExternalId && explicitExternal !== expectedExternalId) {
      throw new Error(
        `Extended order identity conflict: expected externalId=${expectedExternalId}, got ${explicitExternal}`
      );
    }
    const externalId = explicitExternal || id(expectedExternalId);
    if (!externalId) return null;
    const internalIds = extendedInternalIds(row);
    const exchangeIds = extendedExchangeIds(row);
    const aliases = new Set([externalId, ...internalIds, ...exchangeIds]);
    const existing = this.byExternal.get(externalId) ?? {
      internalIds: new Set<string>(),
      exchangeIds: new Set<string>(),
      aliases: new Set<string>(),
    };
    for (const alias of aliases) {
      const mapped = this.externalByAlias.get(alias);
      if (mapped && mapped !== externalId) {
        throw new Error(
          `Extended order identity conflict: alias=${alias} maps to ${mapped} and ${externalId}`
        );
      }
    }
    for (const value of internalIds) existing.internalIds.add(value);
    for (const value of exchangeIds) existing.exchangeIds.add(value);
    for (const alias of aliases) {
      existing.aliases.add(alias);
      this.externalByAlias.set(alias, externalId);
    }
    this.byExternal.set(externalId, existing);
    return this.identity(externalId);
  }

  registerReceipt(externalId: string, receipt: any): ExtendedOrderIdentity {
    const identity = this.register(receipt, externalId);
    if (!identity) throw new Error("Extended place response missing externalId");
    return identity;
  }

  externalFor(alias: string): string | null {
    const key = id(alias);
    return this.externalByAlias.get(key) ?? (this.byExternal.has(key) ? key : null);
  }

  identity(alias: string): ExtendedOrderIdentity | null {
    const externalId = this.externalFor(alias) ?? id(alias);
    const record = this.byExternal.get(externalId);
    if (!record) return null;
    return {
      canonicalId: externalId,
      externalId,
      internalIds: [...record.internalIds],
      exchangeIds: [...record.exchangeIds],
      aliases: [...record.aliases],
    };
  }

  async resolve(raw: ExtendedIdentityRaw, alias: string): Promise<ExtendedResolvedOrder | null> {
    const input = id(alias);
    if (!input) return null;
    let externalId = this.externalFor(input);

    // 未知别名先按 official internal/order-id endpoint 恢复 externalId。
    if (!externalId) {
      const direct = await raw
        ._get(`/api/v1/user/orders/${encodeURIComponent(input)}`)
        .catch(() => null);
      if (direct) {
        const identity = this.register(direct);
        externalId = identity?.externalId ?? null;
      }
    }
    if (!externalId) {
      const [openResponse, historyResponse] = await Promise.all([
        raw._get("/api/v1/user/orders?market=BTC-USD").catch(() => null),
        raw
          ._req(
            "GET",
            "/api/v1/user/orders/history?limit=100",
            undefined,
            { full: true }
          )
          .catch(() => null),
      ]);
      const matched = [...rows(openResponse), ...rows(historyResponse)].find((row) =>
        [...extendedInternalIds(row), ...extendedExchangeIds(row)].includes(input)
      );
      if (matched) externalId = this.register(matched)?.externalId ?? null;
    }
    if (!externalId) return null;
    return this.resolveExternal(raw, externalId);
  }

  async resolveExternal(
    raw: ExtendedIdentityRaw,
    externalIdInput: string
  ): Promise<ExtendedResolvedOrder | null> {
    const externalId = id(externalIdInput);
    if (!externalId) return null;
    this.register({}, externalId);
    const encoded = encodeURIComponent(externalId);
    const direct = await raw
      ._get(`/api/v1/user/orders/external/${encoded}`)
      .catch(() => null);
    const directRows = rows(direct).filter((row) => {
      const candidate = extendedExternalId(row);
      return !candidate || candidate === externalId;
    });
    this.assertSingleOfficialOrder(directRows, externalId, "external");
    const openResponse = await raw
      ._get("/api/v1/user/orders?market=BTC-USD")
      .catch(() => null);
    const openRows = rows(openResponse).filter(
      (row) => extendedExternalId(row) === externalId
    );
    this.assertSingleOfficialOrder(openRows, externalId, "open");

    const historyResponse = await raw
      ._req(
        "GET",
        `/api/v1/user/orders/history?externalId=${encoded}&limit=100`,
        undefined,
        { full: true }
      )
      .catch(() => null);
    const historyRows = rows(historyResponse).filter((row) => {
      const candidate = extendedExternalId(row);
      // filter endpoint 可只返回 internal id；请求上下文本身就是 externalId 证据。
      return !candidate || candidate === externalId;
    });
    this.assertSingleOfficialOrder(historyRows, externalId, "history");

    const candidates = [...openRows, ...directRows, ...historyRows];
    const officialInternalIds = new Set(
      candidates.map((candidate) => id(candidate?.id)).filter(Boolean)
    );
    if (officialInternalIds.size > 1) {
      throw new Error(
        `Extended order identity conflict: externalId=${externalId} has inconsistent official internal ids`
      );
    }
    for (const candidate of candidates) this.register(candidate, externalId);
    const row = candidates[0] ?? null;
    const identity = this.identity(externalId)!;
    const tradesResponse = await raw
      ._req(
        "GET",
        "/api/v1/user/trades?market=BTC-USD&limit=500",
        undefined,
        { full: true }
      )
      .catch(() => null);
    const trades = rows(tradesResponse).filter((trade) => {
      const tradeExternal = extendedExternalId(trade);
      const aliases = [
        ...extendedInternalIds(trade),
        ...extendedExchangeIds(trade),
      ];
      return (
        tradeExternal === externalId ||
        aliases.some((value) => identity.aliases.includes(value))
      );
    });
    for (const trade of trades) this.register(trade, externalId);

    if (!row && !trades.length) return null;
    const rowFilled = Math.abs(
      finite(row?.filledQty, row?.filled_size, row?.executedQty) ?? 0
    );
    const tradeFilled = trades.reduce(
      (sum, trade) =>
        sum + Math.abs(finite(trade?.qty, trade?.size, trade?.quantity) ?? 0),
      0
    );
    const cumulativeFilled = Math.max(rowFilled, tradeFilled);
    // trades 不能单独证明终态；索引延迟或部分成交时必须保持 UNKNOWN。
    const parsedStatus = row ? extendedStatus(row) : "unknown";
    // V2 没有“部分成交后撤销”的独立状态；已有成交必须进入成交对账，不能当纯撤单释放格位。
    const status =
      parsedStatus === "cancelled" && cumulativeFilled > 0 ? "filled" : parsedStatus;
    return {
      identity: this.identity(externalId)!,
      row,
      trades,
      status,
      cumulativeFilled: cumulativeFilled > 0 ? cumulativeFilled : 0,
    };
  }

  private assertSingleOfficialOrder(rowsForSource: any[], externalId: string, source: string) {
    if (rowsForSource.length <= 1) return;
    const signatures = new Set(
      rowsForSource.map((row) =>
        JSON.stringify({
          internal: extendedInternalIds(row).sort(),
          exchange: extendedExchangeIds(row).sort(),
        })
      )
    );
    if (signatures.size > 1) {
      throw new Error(
        `Extended order identity conflict: externalId=${externalId} has ${rowsForSource.length} ${source} results`
      );
    }
  }
}
