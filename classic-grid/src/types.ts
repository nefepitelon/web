export type VenueId =
  | "extended"
  | "risex"
  | "decibel"
  | "n1"
  | "phoenix"
  | "phoenix2"
  | "nado"
  | "popdex";
export type Side = "buy" | "sell";
export type GridMode = "neutral" | "long" | "short";

export type GridParams = {
  /** 锚点后填入：mid − halfBand */
  lower: number;
  /** 锚点后填入：mid + halfBand */
  upper: number;
  /** 半幅（USD），默认 3000 → 总宽 6000 */
  halfBand: number;
  /** 格子数（价格线 = gridCount+1）；上下各 gridCount/2 */
  gridCount: number;
  sizeBase: number;
  leverage: number;
  /** 单边费率（maker），用于间距校验 */
  feeRate: number;
  /** 账户权益估算（保证金预检）；实盘以后可用真实 equity 覆盖 */
  equityUsd: number;
  /** 用权益的多少做保证金预算 */
  marginFraction: number;
  maxWritesPerTick: number;
  mode: GridMode;
  /** 近现价跳过带宽 = skipBand * spacing */
  skipBand: number;
  /** 单市场挂单上限（如 RISEx 50）；达限后本轮不再 place */
  maxOpenOrders?: number;
};

export type SeedOrder = {
  levelIndex: number;
  price: number;
  side: Side;
  reduceOnly: boolean;
};

export type DesiredOrder = {
  market: string;
  side: Side;
  price: number;
  size: number;
  level: number;
};

export type LiveOrder = DesiredOrder & { id: string };

export type VenueSnapshot = {
  venue: VenueId;
  market: string;
  mid: number;
  position: number;
  openOrders: LiveOrder[];
  /** 官方未实现盈亏（所方字段/均价×标记）；读不到则省略，看板显示 - */
  unrealizedPnl?: number;
  /** 账户权益（USD）；读不到则为 undefined */
  equityUsd?: number;
  /** 当前仍可用于新交易/挂单的保证金（USD） */
  availableForTradeUsd?: number;
  /** 当前市场实际杠杆；用于按交易所口径估算可恢复保证金 */
  leverage?: number;
  /** 市场最小数量变化，用于把网格单量对齐到交易所精度 */
  sizeIncrement?: number;
  /** 市场最小下单量 */
  minOrderSize?: number;
  /** 市场最小订单名义价值（USD/报价币）；与最小基础币数量不是同一口径 */
  minOrderNotionalUsd?: number;
  /** 官方爆仓价；读不到则为 undefined */
  liquidationPrice?: number;
};

export type Intent =
  | { type: "place"; order: DesiredOrder }
  | { type: "cancel"; orderId: string; market: string };

export type ApplyResult = {
  placed: number;
  cancelled: number;
  failed: number;
  errors: string[];
};

export type ActiveOrder = {
  id: string;
  levelIndex: number;
  side: Side;
  price: number;
  size: number;
};
