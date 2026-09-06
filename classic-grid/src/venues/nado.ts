import fs from "node:fs";
import path from "node:path";
import { createNadoClient } from "@nadohq/client";
import {
  CHAIN_ENV_TO_CHAIN,
  addDecimals,
  calcPerpBalanceValue,
  isPerpBalance,
  isSpotBalance,
  nowInSeconds,
  packOrderAppendix,
  removeDecimals,
} from "@nadohq/shared";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Intent, LiveOrder, Side, VenueSnapshot } from "../types";
import { loadEnv } from "../loadEnv";
import { dryApply, type ApplyResult, type VenueExecutor } from "./types";

const CHAIN_ENV = "inkMainnet" as const;
const DEFAULT_PRODUCT_ID = 2; // BTC-PERP
const FALLBACK_SIZE_INC = 0.00005;
const FALLBACK_PRICE_INC = 1;

function bnNum(v: { toString(): string } | number | string | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(typeof v === "string" ? v : v.toString());
  return Number.isFinite(n) ? n : 0;
}

/** engine 已映射成人话单位；若仍是 x18 则降下来 */
function humanAmount(v: unknown): number {
  const n = bnNum(v as any);
  if (!(n > 0) && !(n < 0)) return 0;
  if (Math.abs(n) >= 1e12) return bnNum(removeDecimals(n));
  return n;
}

export function roundNadoSize(
  size: number,
  increment = FALLBACK_SIZE_INC
): number {
  if (!(size > 0)) return 0;
  if (!(increment > 0)) throw new Error(`Nado 无效数量步进 ${increment}`);
  const ticks = Math.floor(size / increment + 1e-12);
  // 先按 tick 取整，再 toFixed 消 IEEE 尘埃，避免 addDecimals → 3250…0001 被拒
  return Number((ticks * increment).toFixed(12));
}

export function roundNadoPrice(
  px: number,
  increment = FALLBACK_PRICE_INC
): number {
  if (!(px > 0)) return 0;
  if (!(increment > 0)) throw new Error(`Nado 无效价格步进 ${increment}`);
  return Number((Math.round(px / increment) * increment).toFixed(12));
}

export function isNadoOrderRuleError(error: unknown): boolean {
  return /(?:2094|invalid order size|min_size|size_increment|price_increment)/i.test(
    String((error as any)?.message || error || "")
  );
}

function loadPrivateKey(): Hex {
  loadEnv();
  let raw = (process.env.NADO_PRIVATE_KEY || "").trim();
  if (!raw) {
    const keyPath =
      process.env.NADO_KEY_PATH?.trim() ||
      path.resolve(process.cwd(), "secrets", "nado.key");
    if (fs.existsSync(/* turbopackIgnore: true */ keyPath)) raw = fs.readFileSync(/* turbopackIgnore: true */ keyPath, "utf8").trim();
  }
  if (!raw) throw new Error("缺少 NADO_PRIVATE_KEY（或 secrets/nado.key）");
  return (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
}

export class NadoExecutor implements VenueExecutor {
  readonly id = "nado" as const;
  /** SDK + 多份 viem 类型易冲突，运行时 API 稳定 */
  private client: any = null;
  private address = "";
  private subaccountName = "default";
  private productId = DEFAULT_PRODUCT_ID;
  private sizeIncrement = FALLBACK_SIZE_INC;
  private priceIncrement = FALLBACK_PRICE_INC;
  private minOrderNotionalUsd = 0;

  constructor(private dryRun: boolean) {}

  async connect(): Promise<void> {
    loadEnv();
    this.subaccountName = (process.env.NADO_SUBACCOUNT || "default").trim() || "default";
    this.productId = Math.max(
      1,
      Number(process.env.NADO_BTC_PRODUCT_ID || DEFAULT_PRODUCT_ID) || DEFAULT_PRODUCT_ID
    );
    const chain = CHAIN_ENV_TO_CHAIN[CHAIN_ENV];
    const rpc =
      process.env.NADO_INK_RPC?.trim() ||
      chain.rpcUrls.default.http[0] ||
      "https://rpc-gel.inkonchain.com";
    const publicClient = createPublicClient({
      chain,
      transport: http(rpc),
    });

    if (this.dryRun) {
      this.client = createNadoClient(CHAIN_ENV, {
        publicClient: publicClient as any,
      });
      await this.refreshMarketRules();
      console.log(`[nado] dry-run connected productId=${this.productId}`);
      return;
    }

    const account = privateKeyToAccount(loadPrivateKey());
    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(rpc),
    });
    this.address = account.address;
    this.client = createNadoClient(CHAIN_ENV, {
      walletClient: walletClient as any,
      publicClient: publicClient as any,
    });
    await this.refreshMarketRules();
    console.log(
      `[nado] address=${this.address} subaccount=${this.subaccountName} productId=${this.productId}`
    );
  }

  disconnect(): void {
    this.client = null;
    this.address = "";
    this.sizeIncrement = FALLBACK_SIZE_INC;
    this.priceIncrement = FALLBACK_PRICE_INC;
    this.minOrderNotionalUsd = 0;
  }

  private ensure(): any {
    if (!this.client) throw new Error("Nado 未 connect");
    return this.client;
  }

  private owner(): string {
    if (this.dryRun) {
      const a = (process.env.NADO_ADDRESS || "").trim();
      if (!a) throw new Error("dry-run 读仓位需 NADO_ADDRESS，或改用实盘密钥");
      return a;
    }
    if (!this.address) throw new Error("Nado 实盘未就绪（缺私钥）");
    return this.address;
  }

  private async refreshMarketRules(): Promise<void> {
    const markets = await this.ensure().market.getAllMarkets();
    const selected = (markets || []).find(
      (market: any) => Number(market?.productId) === this.productId
    );
    if (!selected) {
      throw new Error(`Nado 找不到 productId=${this.productId} 的实时市场规则`);
    }
    const sizeIncrement = humanAmount(selected.sizeIncrement);
    const priceIncrement = humanAmount(selected.priceIncrement);
    const minOrderNotionalUsd = humanAmount(selected.minSize);
    if (!(sizeIncrement > 0) || !(priceIncrement > 0) || !(minOrderNotionalUsd > 0)) {
      throw new Error(
        `Nado productId=${this.productId} 市场规则无效：min=${minOrderNotionalUsd} sizeInc=${sizeIncrement} priceInc=${priceIncrement}`
      );
    }
    this.sizeIncrement = sizeIncrement;
    this.priceIncrement = priceIncrement;
    this.minOrderNotionalUsd = minOrderNotionalUsd;
    console.log(
      `[nado] rules productId=${this.productId} minNotional=${minOrderNotionalUsd}U sizeIncrement=${sizeIncrement} priceIncrement=${priceIncrement}`
    );
  }

  private async mid(): Promise<number> {
    const c = this.ensure();
    try {
      const p = await c.perp.getPerpPrices({ productId: this.productId });
      const mark = bnNum(p.markPrice);
      if (mark > 0) return mark;
    } catch {
      /* fall through */
    }
    const book = await c.market.getLatestMarketPrice({ productId: this.productId });
    const bid = bnNum(book.bid);
    const ask = bnNum(book.ask);
    const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : bid || ask;
    if (!(mid > 0)) throw new Error("Nado 无效 mid");
    return mid;
  }

  async snapshot(market: string): Promise<VenueSnapshot> {
    if (this.dryRun && !(process.env.NADO_ADDRESS || "").trim()) {
      const mid = await this.mid().catch(() => 100_000);
      return { venue: this.id, market, mid, position: 0, openOrders: [] };
    }
    const c = this.ensure();
    const owner = this.owner();
    const mid = await this.mid();
    const [summary, oo] = await Promise.all([
      c.subaccount.getSubaccountSummary({
        subaccountOwner: owner,
        subaccountName: this.subaccountName,
      }),
      c.market.getOpenSubaccountOrders({
        subaccountOwner: owner,
        subaccountName: this.subaccountName,
        productId: this.productId,
      }),
    ]);

    let position = 0;
    let unrealizedPnl: number | undefined;
    let equityUsd: number | undefined;

    try {
      const health = summary.health?.unweighted?.health;
      const h = humanAmount(health);
      if (h > 0) equityUsd = h;
    } catch {
      /* ignore */
    }

    let spotQuote = 0;
    for (const b of summary.balances || []) {
      if (isSpotBalance(b) && b.productId === 0) {
        spotQuote += humanAmount(b.amount);
      }
      if (isPerpBalance(b) && b.productId === this.productId) {
        position = humanAmount(b.amount);
        try {
          // calcPerpBalanceValue 常仍是 x18，须 humanAmount
          unrealizedPnl = humanAmount(calcPerpBalanceValue(b as any));
        } catch {
          /* ignore */
        }
      }
    }
    if (equityUsd == null && spotQuote > 0) {
      equityUsd = spotQuote + (unrealizedPnl ?? 0);
    }

    const openOrders: LiveOrder[] = [];
    for (const o of oo.orders || []) {
      const unfilled = humanAmount(o.unfilledAmount);
      if (!(Math.abs(unfilled) > 0)) continue;
      const side: Side = unfilled > 0 ? "buy" : "sell";
      openOrders.push({
        id: String(o.digest),
        market,
        side,
        price: roundNadoPrice(
          humanAmount(o.price) || bnNum(o.price),
          this.priceIncrement
        ),
        size: Math.abs(unfilled),
        level: 0,
      });
    }

    return {
      venue: this.id,
      market,
      mid,
      position,
      openOrders,
      equityUsd,
      unrealizedPnl:
        unrealizedPnl != null && Number.isFinite(unrealizedPnl) ? unrealizedPnl : undefined,
      sizeIncrement: this.sizeIncrement,
      minOrderNotionalUsd: this.minOrderNotionalUsd,
    };
  }

  async apply(intents: Intent[]): Promise<ApplyResult> {
    if (this.dryRun) return dryApply(this.id, intents);
    const result: ApplyResult = { placed: 0, cancelled: 0, failed: 0, errors: [] };
    const c = this.ensure();
    const gapMs = Math.max(0, Number(process.env.NADO_ORDER_GAP_MS || 200) || 200);
    let wrote = 0;
    let liveMid = 0;
    try {
      liveMid = await this.mid();
    } catch {
      /* place 时再试 */
    }

    for (const intent of intents) {
      try {
        if (intent.type === "cancel") {
          await c.market.cancelOrders({
            digests: [intent.orderId],
            productIds: [this.productId],
            subaccountName: this.subaccountName,
          });
          result.cancelled += 1;
        } else {
          const size = roundNadoSize(intent.order.size, this.sizeIncrement);
          if (!(size > 0)) throw new Error(`size 过小 inc=${this.sizeIncrement}`);
          const px = roundNadoPrice(intent.order.price, this.priceIncrement);
          if (!(px > 0)) throw new Error(`无效价格 ${intent.order.price}`);
          if (size * px + 1e-9 < this.minOrderNotionalUsd) {
            throw new Error(
              `Nado 本地下单校验失败：${size} × ${px} = ${(size * px).toFixed(2)}U < min_size ${this.minOrderNotionalUsd}U`
            );
          }

          if (liveMid > 0) {
            if (intent.order.side === "sell" && px <= liveMid) {
              console.log(`[nado] skip cross sell@${px} mid=${liveMid.toFixed(2)}`);
              continue;
            }
            if (intent.order.side === "buy" && px >= liveMid) {
              console.log(`[nado] skip cross buy@${px} mid=${liveMid.toFixed(2)}`);
              continue;
            }
          }

          if (wrote > 0 && gapMs > 0) {
            await new Promise((r) => setTimeout(r, gapMs));
          }
          const signedAmt =
            intent.order.side === "buy" ? addDecimals(size) : addDecimals(-size);
          await c.market.placeOrder({
            productId: this.productId,
            order: {
              subaccountName: this.subaccountName,
              price: px,
              amount: signedAmt,
              expiration: nowInSeconds() + 86400 * 28,
              appendix: packOrderAppendix({ orderExecutionType: "post_only" }),
            },
          });
          result.placed += 1;
          wrote += 1;
        }
      } catch (e: any) {
        result.failed += 1;
        result.errors.push(String(e?.message || e).slice(0, 200));
        // 产品规则失败时，同一批后续订单会以同样参数重复失败；留待下一轮
        // 重新读取快照/规则，避免一次 tick 连续向网关发送 10 个无效请求。
        if (isNadoOrderRuleError(e)) break;
      }
    }
    return result;
  }

  async cancelAll(market: string): Promise<void> {
    if (this.dryRun) {
      console.log(`[nado:dry] cancelAll ${market}`);
      return;
    }
    const c = this.ensure();
    await c.market.cancelProductOrders({
      productIds: [this.productId],
      subaccountName: this.subaccountName,
    });
  }

  async closePosition(market: string): Promise<void> {
    if (this.dryRun) {
      console.log(`[nado:dry] closePosition ${market}`);
      return;
    }
    const snap = await this.snapshot(market);
    const pos = snap.position;
    if (!(Math.abs(pos) > this.sizeIncrement / 2)) return;
    const c = this.ensure();
    const mid = snap.mid > 0 ? snap.mid : await this.mid();
    const size = roundNadoSize(Math.abs(pos), this.sizeIncrement);
    const isLong = pos > 0;
    const px = roundNadoPrice(
      isLong ? mid * 0.998 : mid * 1.002,
      this.priceIncrement
    );
    const amount = isLong ? addDecimals(-size) : addDecimals(size);
    await c.market.placeOrder({
      productId: this.productId,
      order: {
        subaccountName: this.subaccountName,
        price: px,
        amount,
        expiration: nowInSeconds() + 120,
        appendix: packOrderAppendix({ orderExecutionType: "ioc" }),
      },
    });
  }
}
