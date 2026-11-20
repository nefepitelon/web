import catalogData from './perpdex-box-catalog.json';
import type { PerpdexBoxSnapshot, PerpdexExchange, PerpdexSource, PerpdexStatus } from './perpdex-box-types';

// Only fixed, public read endpoints. This service never accepts a user URL, key, account or order.
export const PERPDEX_SOURCES = {
  COIN_GECKO: 'https://api.coingecko.com/api/v3/derivatives/exchanges?per_page=100&page=1',
  BTC_PRICE: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_last_updated_at=true',
  LLAMA_OI: 'https://api.llama.fi/overview/open-interest?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true',
  LLAMA_TVL: 'https://api.llama.fi/protocols',
  HYPERLIQUID: 'https://api.hyperliquid.xyz/info',
  PERPDEX_LIST: 'https://perpdexlist.com/api/markets',
} as const;

type Obj = Record<string, unknown>;
type Metric = 'oiUsd' | 'volume24hUsd' | 'tvlUsd' | 'markets' | 'maxLeverage';
type Catalog = Omit<PerpdexExchange, 'oiUsd' | 'volume24hUsd' | 'tvlUsd' | 'markets' | 'sourceUrl' | 'updatedAt' | 'status'> & {
  coingeckoIds?: string[]; llamaTvlSlugs?: string[]; llamaOiSlug?: string; hyperliquidDex?: string; referenceId?: string; allowSynthetic?: boolean;
};
type Cached = { value?: unknown; fetchedMs?: number; providerMs?: number; attemptedMs?: number; error?: string; pending?: Promise<void> };
type Result<T> = { value: T | null; source: PerpdexSource };
type Definition<T> = { id: string; name: string; url: string; body?: Obj; parse: (value: unknown) => T; providerTime?: (value: T) => number | null };
type ServiceOptions = { fetch?: typeof fetch; now?: () => number; cacheTtlMs?: number; staleTtlMs?: number; timeoutMs?: number };
const catalog = catalogData as Catalog[];

function object(value: unknown): Obj | null { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Obj : null; }
export function perpdexNumber(value: unknown): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || value.trim() === '')) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
function sumComplete(values: (number | null)[]): number | null {
  if (values.length === 0 || !values.every((v): v is number => v !== null)) return null;
  return perpdexNumber(values.reduce((a, b) => a + b, 0));
}
function records(value: unknown, label: string, key: string): Obj[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every(item => object(item) && typeof item[key] === 'string')) throw new Error(`${label} 返回结构无效`);
  return value as Obj[];
}
function cgParser(value: unknown): Obj[] { return records(value, 'CoinGecko', 'id'); }
function btcParser(value: unknown): Obj {
  const bitcoin = object(object(value)?.bitcoin);
  if (!bitcoin || perpdexNumber(bitcoin.usd) === null || Number(bitcoin.usd) <= 0) throw new Error('BTC/USD 返回结构无效');
  return bitcoin;
}
function oiParser(value: unknown): Obj[] { return records(object(value)?.protocols, 'DefiLlama OI', 'slug'); }
function tvlParser(value: unknown): Obj[] { return records(value, 'DefiLlama TVL', 'slug'); }
type ReferenceData = { venues: Obj[]; generatedMs: number };
function referenceParser(value: unknown): ReferenceData {
  const data = object(value);
  const venues = records(data?.venues, 'PerpDexList', 'exchange');
  const generatedMs = typeof data?.generated_at === 'string' ? Date.parse(data.generated_at) : NaN;
  if (!Number.isFinite(generatedMs) || new Set(venues.map(row => row.exchange)).size !== venues.length) throw new Error('PerpDexList 时间或交易所标识无效');
  return { venues, generatedMs };
}
type HipData = { oiUsd: number | null; volume24hUsd: number | null; markets: number; maxLeverage: number | null };
function hipParser(value: unknown): HipData {
  if (!Array.isArray(value) || value.length !== 2) throw new Error('Hyperliquid 返回结构无效');
  const universe = records(object(value[0])?.universe, 'Hyperliquid universe', 'name');
  const contexts = value[1];
  if (!Array.isArray(contexts) || contexts.length !== universe.length || !contexts.every(object)) throw new Error('Hyperliquid 市场与行情数量不符');
  const active = universe.map((market, index) => ({ market, context: contexts[index] as Obj })).filter(({ market }) => market.isDelisted !== true);
  const oi = active.map(({ context }) => {
    const quantity = perpdexNumber(context.openInterest), mark = perpdexNumber(context.markPx);
    return quantity === null || mark === null ? null : perpdexNumber(quantity * mark);
  });
  const leverage = active.map(({ market }) => perpdexNumber(market.maxLeverage)).filter((n): n is number => n !== null);
  return { oiUsd: active.length ? sumComplete(oi) : 0, volume24hUsd: active.length ? sumComplete(active.map(({ context }) => perpdexNumber(context.dayNtlVlm))) : 0, markets: active.length, maxLeverage: leverage.length ? Math.max(...leverage) : null };
}

export function createPerpdexBoxService(options: ServiceOptions = {}) {
  const request = options.fetch ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  const ttl = options.cacheTtlMs ?? 60_000;
  const staleTtl = options.staleTtlMs ?? 60 * 60_000;
  const timeout = options.timeoutMs ?? 9_000;
  const cache = new Map<string, Cached>();

  async function read<T>(definition: Definition<T>): Promise<Result<T>> {
    const entry = cache.get(definition.id) ?? {};
    cache.set(definition.id, entry);
    if (entry.pending) await entry.pending;
    else if (entry.attemptedMs === undefined || now() - entry.attemptedMs >= ttl) {
      entry.attemptedMs = now();
      entry.pending = (async () => {
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          // The deadline also covers body decoding and injected/non-cooperative fetch implementations.
          const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('公开接口读取超时')); }, timeout); });
          const value = await Promise.race([(async () => {
            const response = await request(definition.url, {
              method: definition.body ? 'POST' : 'GET',
              ...(definition.body ? { body: JSON.stringify(definition.body) } : {}),
              headers: { accept: 'application/json', ...(definition.body ? { 'content-type': 'application/json' } : {}) },
              cache: 'no-store', redirect: 'error', signal: controller.signal,
            });
            if (!response.ok) throw new Error(`公开接口 HTTP ${response.status}`);
            return definition.parse(await response.json());
          })(), deadline]);
          const providerMs = definition.providerTime?.(value) ?? null;
          // An old BTC conversion price is not a valid fresh USD quote.
          if (providerMs !== null && (now() - providerMs > 30 * 60_000 || providerMs > now() + 5 * 60_000)) throw new Error('公开来源时间戳过期或超前');
          entry.value = value; entry.fetchedMs = now(); entry.providerMs = providerMs ?? undefined; entry.error = undefined;
        } catch (error) {
          entry.error = error instanceof Error ? error.message : '公开接口读取失败';
        } finally { if (timer) clearTimeout(timer); entry.pending = undefined; }
      })();
      await entry.pending;
    }
    const retained = entry.value !== undefined && entry.fetchedMs !== undefined && now() - entry.fetchedMs <= staleTtl;
    const status: PerpdexStatus = !retained ? 'unavailable' : entry.error || (now() - entry.fetchedMs! >= ttl) ? 'stale' : 'live';
    return {
      value: retained ? entry.value as T : null,
      source: { id: definition.id, name: definition.name, url: definition.url, status, fetchedAt: retained ? new Date(entry.fetchedMs!).toISOString() : null, updatedAt: retained && entry.providerMs !== undefined ? new Date(entry.providerMs).toISOString() : null, ...(entry.error ? { error: entry.error } : {}) },
    };
  }

  async function getSnapshot(): Promise<PerpdexBoxSnapshot> {
    const hipDexes = [...new Set(catalog.flatMap(item => item.hyperliquidDex ? [item.hyperliquidDex] : []))];
    const [cg, btc, oi, tvl, reference, ...hip] = await Promise.all([
      read({ id: 'coingecko', name: 'CoinGecko 衍生品交易所', url: PERPDEX_SOURCES.COIN_GECKO, parse: cgParser }),
      read({ id: 'btc-usd', name: 'CoinGecko BTC/USD', url: PERPDEX_SOURCES.BTC_PRICE, parse: btcParser, providerTime: (value: Obj) => { const seconds = perpdexNumber(value.last_updated_at); return seconds === null ? null : seconds * 1000; } }),
      read({ id: 'llama-oi', name: 'DefiLlama 持仓量', url: PERPDEX_SOURCES.LLAMA_OI, parse: oiParser }),
      read({ id: 'llama-tvl', name: 'DefiLlama 协议 TVL', url: PERPDEX_SOURCES.LLAMA_TVL, parse: tvlParser }),
      read({ id: 'perpdex-list', name: 'PerpDexList 交易所公开行情', url: PERPDEX_SOURCES.PERPDEX_LIST, parse: referenceParser, providerTime: (value: ReferenceData) => value.generatedMs }),
      ...hipDexes.map(dex => read({ id: `hyperliquid-${dex}`, name: `Hyperliquid ${dex} 公开行情`, url: PERPDEX_SOURCES.HYPERLIQUID, body: { type: 'metaAndAssetCtxs', dex }, parse: hipParser })),
    ]) as [Result<Obj[]>, Result<Obj>, Result<Obj[]>, Result<Obj[]>, Result<ReferenceData>, ...Result<HipData>[]];
    const sources = [cg, btc, oi, tvl, reference, ...hip].map(result => result.source);
    const warnings = sources.filter(source => source.status !== 'live').map(source => `${source.name}：${source.status === 'stale' ? '暂用上次成功读取的数据' : '当前不可用'}${source.error ? `（${source.error}）` : ''}`);
    const btcUsd = btc.value ? perpdexNumber(btc.value.usd) : null;
    const cgMap = new Map(cg.value?.map(row => [String(row.id), row]));
    const oiMap = new Map(oi.value?.map(row => [String(row.slug), row]));
    const tvlMap = new Map(tvl.value?.map(row => [String(row.slug), row]));
    const referenceMap = new Map(reference.value?.venues.map(row => [String(row.exchange), row]));
    const hipMap = new Map(hipDexes.map((dex, index) => [dex, hip[index]]));
    const exchanges = catalog.map(item => {
      const row: PerpdexExchange = {
        id: item.id, name: item.name, category: item.category, ...(item.parentId ? { parentId: item.parentId } : {}), ...(item.oiIncludesChildren ? { oiIncludesChildren: true } : {}),
        oiUsd: null, volume24hUsd: null, tvlUsd: null, markets: null,
        makerFeePct: item.makerFeePct, takerFeePct: item.takerFeePct, maxLeverage: item.maxLeverage,
        tradeUrl: item.tradeUrl, sourceUrl: item.category === 'hip3' ? PERPDEX_SOURCES.HYPERLIQUID : item.coingeckoIds ? PERPDEX_SOURCES.COIN_GECKO : item.llamaOiSlug ? PERPDEX_SOURCES.LLAMA_OI : item.referenceId ? PERPDEX_SOURCES.PERPDEX_LIST : PERPDEX_SOURCES.LLAMA_TVL,
        updatedAt: null, status: 'unavailable', color: item.color, metadataAsOf: item.metadataAsOf, metadataSourceUrl: item.metadataSourceUrl, metadataOfficialUrl: item.metadataOfficialUrl,
        ...(item.feePromotion ? { feePromotion: item.feePromotion } : {}), ...(item.productLabel ? { productLabel: item.productLabel } : {}), ...(item.tradingStatus ? { tradingStatus: item.tradingStatus } : {}), fieldSources: {}, fieldStatus: {},
      };
      const observations = new Map<Metric, { source: PerpdexSource; primary: boolean }>();
      function set(metric: Metric, value: number | null, source: PerpdexSource, primary = true) {
        if (value === null) return;
        row[metric] = value; row.fieldSources![metric] = source.id; row.fieldStatus![metric] = source.status; observations.set(metric, { source, primary });
      }
      if (item.hyperliquidDex) {
        const result = hipMap.get(item.hyperliquidDex)!;
        if (result.value) for (const metric of ['oiUsd', 'volume24hUsd', 'markets', 'maxLeverage'] as const) set(metric, result.value[metric], result.source);
      } else if (item.coingeckoIds) {
        const cgRows = item.coingeckoIds.map(id => cgMap.get(id));
        const complete = cgRows.every((value): value is Obj => value !== undefined);
        if (complete) {
          const rateStatus = cg.source.status === 'live' && btc.source.status === 'live' ? 'live' : btcUsd === null ? 'unavailable' : 'stale';
          const convertedSource = { ...cg.source, status: rateStatus as PerpdexStatus, fetchedAt: [cg.source.fetchedAt, btc.source.fetchedAt].filter((s): s is string => s !== null).sort()[0] ?? null };
          for (const [metric, upstream] of [['oiUsd', 'open_interest_btc'], ['volume24hUsd', 'trade_volume_24h_btc']] as const) {
            const total = sumComplete(cgRows.map(value => perpdexNumber(value[upstream])));
            set(metric, total !== null && btcUsd !== null ? perpdexNumber(total * btcUsd) : null, convertedSource);
          }
          set('markets', sumComplete(cgRows.map(value => perpdexNumber(value.number_of_perpetual_pairs))), cg.source);
        }
      }
      if (item.llamaTvlSlugs) set('tvlUsd', sumComplete(item.llamaTvlSlugs.map(slug => perpdexNumber(tvlMap.get(slug)?.tvl))), tvl.source, false);
      // The reference endpoint is public and reports USD venue aggregates, not market-row sums.
      // Never let an error/pending row or an old observation become a new live value.
      const referenceRow = item.referenceId ? referenceMap.get(item.referenceId) : undefined;
      const observedMs = typeof referenceRow?.observed_at === 'string' ? Date.parse(referenceRow.observed_at) : NaN;
      const ageMs = now() - observedMs;
      if (referenceRow && !referenceRow.error && referenceRow.pending !== true && (referenceRow.synthetic !== true || item.allowSynthetic === true) && Number.isFinite(observedMs) && ageMs >= -300_000 && ageMs <= staleTtl) {
        const source: PerpdexSource = { ...reference.source, updatedAt: new Date(observedMs).toISOString(), status: reference.source.status === 'live' && ageMs <= 10 * 60_000 ? 'live' : 'stale' };
        for (const [metric, key] of [['oiUsd', 'open_interest'], ['volume24hUsd', 'volume_24h']] as const) {
          if (row[metric] === null || row.fieldStatus![metric] === 'stale' && source.status === 'live') set(metric, perpdexNumber(referenceRow[key]), source);
        }
      }
      if (item.llamaOiSlug && (row.oiUsd === null || row.fieldStatus!.oiUsd === 'stale' && oi.source.status === 'live')) {
        set('oiUsd', perpdexNumber(oiMap.get(item.llamaOiSlug)?.total24h), oi.source);
      }
      const allObservations = [...observations.values()];
      const primary = allObservations.filter(value => value.primary);
      const relevant = primary.length ? primary : allObservations;
      if (relevant.length) {
        row.status = relevant.some(value => value.source.status === 'stale') ? 'stale' : relevant.some(value => value.source.status === 'live') ? 'live' : 'unavailable';
        row.updatedAt = relevant.map(value => value.source.fetchedAt).filter((s): s is string => s !== null).sort()[0] ?? null;
        row.sourceUrl = relevant[0].source.url;
        const upstreamTimes = relevant.map(value => value.source.updatedAt).filter((s): s is string => s !== null).sort();
        if (upstreamTimes.length) row.observedAt = upstreamTimes[0];
      }
      return row;
    });
    const parent = exchanges.find(row => row.id === 'hyperliquid');
    const children = exchanges.filter(row => row.parentId === 'hyperliquid');
    if (parent?.oiUsd !== null && parent?.oiUsd !== undefined && children.every(row => row.oiUsd !== null) && children.reduce((sum, row) => sum + row.oiUsd!, 0) > parent.oiUsd) warnings.push('Hyperliquid 父项与 HIP-3 子项来源或观测时间存在差异，子项合计大于父项；合计仍只计父项，不推算或改写原值。');
    warnings.push('OI 口径由数据提供方决定，各平台可能采用单边或双边统计；未擅自乘除 2。HIP-3 子项已包含于 Hyperliquid 父项，合计与市场份额排除子项。');
    warnings.push('CoinGecko 已公告自 2026-11-10 起统一为单边 OI；此前双边口径平台可能出现约 50% 的统计跳变，不能解读为等额资金流出。公告：https://status.coingecko.com/info_notices/409074');
    warnings.push('手续费及非 HIP-3 杠杆为各行标注日期的公开资料参考值（原目录 2026-10-19），不属于实时行情；以官网当前账户等级、活动及市场规则为准。');
    warnings.push('扩展交易所的 USD 持仓与成交量来自 PerpDexList 免登录公开行情；保留各交易所 observed_at，超过 10 分钟标记为最近数据，超过一小时或错误、待处理记录不作为有效行情。Kalshi 为 CEX；Papertrade 为真实合成永续；HYENA 已停止交易。');
    warnings.push('公开源未覆盖的 24h 成交量、TVL、交易对数量显示为 —，不当作 0。TVL 含明确列出的保证金桥或协议池，不能直接视为全部可用保证金。');
    return { generatedAt: new Date(now()).toISOString(), refreshIntervalSeconds: 60, exchanges, sources, warnings };
  }
  return { getSnapshot };
}

const service = createPerpdexBoxService();
export async function getPerpdexBoxSnapshot(): Promise<PerpdexBoxSnapshot> { return service.getSnapshot(); }
