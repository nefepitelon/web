import catalogData from './cex-hub-catalog.json';
import type { CexExchange, CexField, CexHubSnapshot, CexSource, CexStatus } from './cex-hub-types';

// Fixed public, unauthenticated reads only. No caller-supplied URL, account, key or trading API.
export const CEX_SOURCES = {
  SPOT: 'https://api.coingecko.com/api/v3/exchanges?per_page=250&page=1',
  DERIVATIVES: 'https://api.coingecko.com/api/v3/derivatives/exchanges?per_page=100&page=1',
  DERIVATIVES_PAGE_2: 'https://api.coingecko.com/api/v3/derivatives/exchanges?per_page=100&page=2',
  BTC_PRICE: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_last_updated_at=true',
  COINPAPRIKA: 'https://api.coinpaprika.com/v1/exchanges',
  COINBASE_PRODUCTS: 'https://api.exchange.coinbase.com/products',
  BINGX_SPOT_SYMBOLS: 'https://open-api.bingx.com/openApi/spot/v1/common/symbols',
  BITUNIX_SPOT_PAIRS: 'https://openapi.bitunix.com/api/spot/v1/common/coin_pair/list',
} as const;

type Obj = Record<string, unknown>;
type Catalog = { id: string; name: string; centralized: true; spotId?: string; derivativesIds?: string[]; coinpaprikaId?: string; productNotes?: { derivatives?: string }; url: string; color?: string; excludedYearValues?: number[]; metadataEvidenceUrl?: string; metadataEvidenceAsOf?: string };
type Cached = { value?: unknown; fetchedMs?: number; providerMs?: number; attemptedMs?: number; error?: string; pending?: Promise<void> };
type Definition<T> = { id: string; name: string; url: string; parse: (value: unknown) => T; providerTime?: (value: T) => number | null; cacheTtlMs?: number };
type Result<T> = { value: T | null; source: CexSource };
type MarketCounts = { markets: number; coins: number };
type ServiceOptions = { fetch?: typeof fetch; now?: () => number; cacheTtlMs?: number; staleTtlMs?: number; timeoutMs?: number };
const catalog = catalogData as Catalog[];
const dollarFields = new Set<CexField>(['spotVolume24hUsd', 'derivativesVolume24hUsd', 'openInterestUsd']);

function object(value: unknown): Obj | null { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Obj : null; }
export function cexNumber(value: unknown): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || value.trim() === '')) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
function integer(value: unknown, minimum = 0): number | null { const number = cexNumber(value); return number !== null && Number.isSafeInteger(number) && number >= minimum ? number : null; }
function sumComplete(values: (number | null)[]): number | null { return values.length && values.every((value): value is number => value !== null) ? cexNumber(values.reduce((sum, value) => sum + value, 0)) : null; }
function records(value: unknown, allowEmpty = false): Obj[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || !value.every(row => object(row) && typeof row.id === 'string' && row.id.length > 0) || new Set(value.map(row => row.id)).size !== value.length) throw new Error('CoinGecko 交易所返回结构或标识无效');
  return value as Obj[];
}
function btcParser(value: unknown): Obj {
  const bitcoin = object(object(value)?.bitcoin);
  if (!bitcoin || cexNumber(bitcoin.usd) === null || Number(bitcoin.usd) <= 0 || cexNumber(bitcoin.last_updated_at) === null) throw new Error('BTC/USD 价格或时间戳无效');
  return bitcoin;
}
function publicLogo(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try { const url = new URL(value); return url.protocol === 'https:' && ['coin-images.coingecko.com', 'assets.coingecko.com'].includes(url.hostname) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
function publishedTime(value: unknown, nowMs: number): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const stamp = Date.parse(value);
  return Number.isFinite(stamp) && nowMs - stamp <= 30 * 60_000 && stamp <= nowMs + 5 * 60_000 ? stamp : null;
}
function marketRecords(value: unknown, idField: string): Obj[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20_000 || !value.every(row => object(row) && typeof row[idField] === 'string' && row[idField].trim()) || new Set(value.map(row => row[idField])).size !== value.length) throw new Error('公开市场目录为空、结构或交易对标识无效');
  return value as Obj[];
}
function countMarkets(rows: Obj[], active: (row: Obj) => boolean, base: (row: Obj) => unknown): MarketCounts {
  const selected = rows.filter(active), bases = selected.map(base);
  if (bases.some(value => typeof value !== 'string' || value.trim() === '')) throw new Error('公开市场目录缺少基础资产标识');
  return { markets: selected.length, coins: new Set((bases as string[]).map(value => value.trim().toUpperCase())).size };
}
function coinbaseCounts(value: unknown): MarketCounts {
  const rows = marketRecords(value, 'id');
  if (rows.some(row => typeof row.status !== 'string' || !['online', 'offline', 'internal', 'delisted'].includes(row.status) || ['trading_disabled', 'cancel_only'].some(flag => row[flag] !== undefined && typeof row[flag] !== 'boolean'))) throw new Error('Coinbase 公开市场目录缺少有效交易状态');
  return countMarkets(rows, row => row.status === 'online' && row.trading_disabled !== true && row.cancel_only !== true, row => row.base_currency);
}
function bingxCounts(value: unknown): MarketCounts {
  const body = object(value);
  if (body?.code !== 0) throw new Error('BingX 公开市场目录返回错误状态');
  const rows = marketRecords(object(body.data)?.symbols, 'symbol');
  // Official v3 lifecycle enum: offline, online, pre-open, accessed, suspended, pre-delisted, delisted.
  if (rows.some(row => typeof row.status !== 'number' || ![0, 1, 5, 10, 25, 29, 30].includes(row.status))) throw new Error('BingX 公开市场目录缺少有效交易状态');
  return countMarkets(rows, row => row.status === 1, row => {
    const symbol = String(row.symbol), delimiter = symbol.lastIndexOf('-');
    return delimiter > 0 && delimiter < symbol.length - 1 ? symbol.slice(0, delimiter) : null;
  });
}
function bitunixCounts(value: unknown): MarketCounts {
  const body = object(value);
  if (body?.code !== 0 && body?.code !== '0') throw new Error('Bitunix 公开市场目录返回错误状态');
  const rows = marketRecords(body.data, 'symbol');
  if (rows.some(row => ![0, 1, '0', '1'].includes(row.isOpen as string | number))) throw new Error('Bitunix 公开市场目录缺少有效交易状态');
  return countMarkets(rows, row => row.isOpen === 1 || row.isOpen === '1', row => row.base);
}

export function createCexHubService(options: ServiceOptions = {}) {
  const request = options.fetch ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  const ttl = options.cacheTtlMs ?? 60_000;
  const staleTtl = options.staleTtlMs ?? 60 * 60_000;
  const timeout = options.timeoutMs ?? 9_000;
  const cache = new Map<string, Cached>();

  async function read<T>(definition: Definition<T>): Promise<Result<T>> {
    const sourceTtl = options.cacheTtlMs ?? definition.cacheTtlMs ?? ttl;
    const entry = cache.get(definition.id) ?? {};
    cache.set(definition.id, entry);
    if (entry.pending) await entry.pending;
    else if (entry.attemptedMs === undefined || now() - entry.attemptedMs >= sourceTtl) {
      entry.attemptedMs = now();
      entry.pending = (async () => {
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          // This deadline covers both response headers and body decoding, including non-cooperative fetch mocks.
          const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('公开接口读取超时')); }, timeout); });
          const value = await Promise.race([(async () => {
            const response = await request(definition.url, { method: 'GET', headers: { accept: 'application/json' }, cache: 'no-store', redirect: 'error', signal: controller.signal });
            if (!response.ok) throw new Error(`公开接口 HTTP ${response.status}`);
            return definition.parse(await response.json());
          })(), deadline]);
          const providerMs = definition.providerTime?.(value) ?? null;
          if (providerMs !== null && (!Number.isFinite(providerMs) || now() - providerMs > 30 * 60_000 || providerMs > now() + 5 * 60_000)) throw new Error('公开来源时间戳过期或超前');
          entry.value = value; entry.fetchedMs = now(); entry.providerMs = providerMs ?? undefined; entry.error = undefined;
        } catch (error) { entry.error = error instanceof Error ? error.message : '公开接口读取失败'; }
        finally { if (timer) clearTimeout(timer); entry.pending = undefined; }
      })();
      await entry.pending;
    }
    const retained = entry.value !== undefined && entry.fetchedMs !== undefined && now() - entry.fetchedMs <= staleTtl;
    const status: CexStatus = !retained ? 'unavailable' : entry.error || now() - entry.fetchedMs! >= sourceTtl ? 'stale' : 'live';
    return { value: retained ? entry.value as T : null, source: { id: definition.id, name: definition.name, url: definition.url, status, fetchedAt: retained ? new Date(entry.fetchedMs!).toISOString() : null, updatedAt: retained && entry.providerMs !== undefined ? new Date(entry.providerMs).toISOString() : null, ...(entry.error ? { error: entry.error } : {}) } };
  }

  async function getSnapshot(): Promise<CexHubSnapshot> {
    const [spot, derivatives, derivatives2, btc, paprika, coinbase, bingx, bitunix] = await Promise.all([
      read({ id: 'coingecko-spot', name: 'CoinGecko 现货交易所', url: CEX_SOURCES.SPOT, parse: (value: unknown) => records(value) }),
      read({ id: 'coingecko-derivatives', name: 'CoinGecko 衍生品交易所', url: CEX_SOURCES.DERIVATIVES, parse: (value: unknown) => records(value) }),
      read({ id: 'coingecko-derivatives-2', name: 'CoinGecko 衍生品交易所 第 2 页', url: CEX_SOURCES.DERIVATIVES_PAGE_2, parse: (value: unknown) => records(value, true) }),
      read({ id: 'btc-usd', name: 'CoinGecko BTC/USD', url: CEX_SOURCES.BTC_PRICE, parse: btcParser, providerTime: (value: Obj) => Number(value.last_updated_at) * 1000 }),
      read({ id: 'coinpaprika-spot', name: 'CoinPaprika 现货市场与币种', url: CEX_SOURCES.COINPAPRIKA, parse: (value: unknown) => records(value) }),
      read({ id: 'coinbase-products', name: 'Coinbase 官方现货市场', url: CEX_SOURCES.COINBASE_PRODUCTS, parse: coinbaseCounts, cacheTtlMs: 5 * 60_000 }),
      read({ id: 'bingx-spot-symbols', name: 'BingX 官方现货市场', url: CEX_SOURCES.BINGX_SPOT_SYMBOLS, parse: bingxCounts, cacheTtlMs: 5 * 60_000 }),
      read({ id: 'bitunix-spot-pairs', name: 'Bitunix 官方现货市场', url: CEX_SOURCES.BITUNIX_SPOT_PAIRS, parse: bitunixCounts, cacheTtlMs: 5 * 60_000 }),
    ]);
    const sources = [spot.source, derivatives.source, derivatives2.source, btc.source, paprika.source, coinbase.source, bingx.source, bitunix.source];
    const warnings = sources.filter(source => source.status !== 'live').map(source => `${source.name}：${source.status === 'stale' ? '暂用上次成功读取的数据' : '当前不可用'}${source.error ? `（${source.error}）` : ''}`);
    const spotMap = new Map(spot.value?.map(row => [String(row.id), row]));
    const paprikaMap = new Map(paprika.value?.map(row => [String(row.id), row]));
    const derivativeMap = new Map<string, { row: Obj; source: CexSource }>();
    for (const result of [derivatives, derivatives2]) for (const row of result.value ?? []) {
      const id = String(row.id), prior = derivativeMap.get(id);
      if (!prior || prior.source.status !== 'live' && result.source.status === 'live') derivativeMap.set(id, { row, source: result.source });
    }
    const btcUsd = btc.value ? cexNumber(btc.value.usd) : null;
    const exchanges = catalog.map(item => {
      const row: CexExchange = { id: item.id, name: item.name, centralized: true, url: item.url, logoUrl: null, spotVolume24hUsd: null, derivativesVolume24hUsd: null, openInterestUsd: null, spotMarkets: null, derivativesMarkets: null, coins: null, trustScore: null, trustRank: null, country: null, yearEstablished: null, hasSpot: Boolean(item.spotId), hasDerivatives: Boolean(item.derivativesIds?.length), status: 'unavailable', updatedAt: null, sourceUrl: item.spotId ? CEX_SOURCES.SPOT : CEX_SOURCES.DERIVATIVES, color: item.color, fieldSources: {}, fieldStatus: {}, fieldUpdatedAt: {}, fieldNotes: {} };
      const observations = new Map<CexField, CexSource>();
      function set<K extends CexField>(key: K, value: CexExchange[K], source: CexSource, note?: string) {
        if (value === null) return;
        row[key] = value; row.fieldSources[key] = source.id; row.fieldStatus[key] = source.status; observations.set(key, source);
        if (source.updatedAt) row.fieldUpdatedAt![key] = source.updatedAt;
        else delete row.fieldUpdatedAt![key];
        if (note) row.fieldNotes![key] = note;
      }
      function convert(value: unknown, source: CexSource): { value: number | null; source: CexSource } {
        const number = cexNumber(value);
        const status: CexStatus = source.status === 'live' && btc.source.status === 'live' ? 'live' : btcUsd === null || source.status === 'unavailable' ? 'unavailable' : 'stale';
        return { value: number !== null && btcUsd !== null ? cexNumber(number * btcUsd) : null, source: { ...source, status, fetchedAt: [source.fetchedAt, btc.source.fetchedAt].filter((time): time is string => time !== null).sort()[0] ?? null } };
      }
      function metadata(data: Obj, source: CexSource, includeTrust: boolean) {
        row.logoUrl ??= publicLogo(data.image);
        const country = typeof data.country === 'string' && data.country.trim() && data.country !== 'Unknown or Invalid Region' ? data.country.trim() : null;
        if (row.country === null) set('country', country, source);
        const year = integer(data.year_established, 1900);
        if (row.yearEstablished === null && year !== null && year <= new Date(now()).getUTCFullYear() && !item.excludedYearValues?.includes(year)) set('yearEstablished', year, source);
        if (includeTrust) {
          const trust = cexNumber(data.trust_score);
          set('trustScore', trust !== null && trust <= 10 ? trust : null, source);
          set('trustRank', integer(data.trust_score_rank, 1), source);
        }
      }
      const spotData = item.spotId ? spotMap.get(item.spotId) : undefined;
      if (spotData) {
        const converted = convert(spotData.trade_volume_24h_btc, spot.source);
        set('spotVolume24hUsd', converted.value, converted.source);
        metadata(spotData, spot.source, true);
      }
      const paprikaData = item.spotId && item.coinpaprikaId ? paprikaMap.get(item.coinpaprikaId) : undefined;
      if (paprikaData && paprikaData.active === true && paprikaData.api_status === true && paprikaData.markets_data_fetched === true && Array.isArray(paprikaData.type) && paprikaData.type.includes('cex') && !paprikaData.type.some(type => ['dex', 'other', 'otc', 'perpetuals'].includes(String(type)))) {
        // CoinPaprika's category is its default market category; perpetual/OTC records are never spot fallbacks.
        const providerMs = publishedTime(paprikaData.last_updated, now());
        if (providerMs !== null) {
          const source = { ...paprika.source, updatedAt: new Date(providerMs).toISOString() };
          set('spotMarkets', integer(paprikaData.markets), source, 'CoinPaprika 已收录的现货市场数量；与交易所官网的覆盖范围可能不同。');
          set('coins', integer(paprikaData.currencies), source, 'CoinPaprika 已收录的现货币种数量；不代表充值资产或衍生品标的总数。');
          if (row.spotVolume24hUsd === null) {
            const usd = object(object(paprikaData.quotes)?.USD);
            set('spotVolume24hUsd', cexNumber(usd?.reported_volume_24h), source, 'CoinPaprika 报告的现货 24 小时 USD 成交量；仅在 CoinGecko 的现货金额不可用时补充，不使用 adjusted 成交量。');
          }
        }
      }
      const nativeCounts = item.id === 'coinbase' ? coinbase : item.id === 'bingx' ? bingx : item.id === 'bitunix' ? bitunix : null;
      if (nativeCounts?.value) {
        const note = '交易所官方公开目录中的可交易现货交易对；币种按这些交易对的基础资产去重，不含仅可充值或已停用的资产。市场目录每 5 分钟更新。';
        set('spotMarkets', nativeCounts.value.markets, nativeCounts.source, note);
        set('coins', nativeCounts.value.coins, nativeCounts.source, note);
      }
      const derivativeRows = (item.derivativesIds ?? []).map(id => derivativeMap.get(id));
      if (derivativeRows.length && derivativeRows.every((value): value is { row: Obj; source: CexSource } => value !== undefined)) {
        const status: CexStatus = derivativeRows.some(value => value.source.status === 'stale') ? 'stale' : 'live';
        const source = { ...derivativeRows[0].source, status, fetchedAt: derivativeRows.map(value => value.source.fetchedAt).filter((time): time is string => time !== null).sort()[0] ?? null };
        for (const [field, upstream] of [['derivativesVolume24hUsd', 'trade_volume_24h_btc'], ['openInterestUsd', 'open_interest_btc']] as const) {
          const converted = convert(sumComplete(derivativeRows.map(value => cexNumber(value.row[upstream]))), source);
          set(field, converted.value, converted.source);
        }
        const markets = sumComplete(derivativeRows.flatMap(value => [integer(value.row.number_of_perpetual_pairs), integer(value.row.number_of_futures_pairs)]));
        // A zero-count stub with both market aggregates missing does not establish zero active markets.
        const hasRawAggregate = derivativeRows.some(value => cexNumber(value.row.trade_volume_24h_btc) !== null || cexNumber(value.row.open_interest_btc) !== null);
        if (markets !== 0 || hasRawAggregate) set('derivativesMarkets', markets, source);
        metadata(derivativeRows[0].row, source, false);
      }
      const core = [...observations].filter(([field]) => dollarFields.has(field));
      // Live descriptive metadata cannot make absent market data look connected.
      if (core.length) {
        row.status = core.some(([, source]) => source.status === 'stale') ? 'stale' : 'live';
        row.updatedAt = core.map(([, source]) => source.fetchedAt).filter((time): time is string => time !== null).sort()[0] ?? null;
        row.sourceUrl = core[0][1].url;
      }
      if (item.productNotes?.derivatives) for (const field of ['derivativesVolume24hUsd', 'openInterestUsd', 'derivativesMarkets'] as const) if (row[field] === null) row.fieldNotes![field] = item.productNotes.derivatives;
      return row;
    });
    warnings.push('现货成交量使用 CoinGecko 报告成交量 trade_volume_24h_btc；不使用已停止支持的 normalized 字段。现货与衍生品分别统计，不把二者相加为统一市场份额。');
    warnings.push('USD 行情以同批公开 BTC/USD 价格换算；BTC 价格超过 30 分钟或超前 5 分钟时拒绝接纳新报价。接口失败时最多保留一小时最近数据，并标记最近数据。');
    warnings.push('现货交易对及币种数补充自 CoinPaprika 的已收录市场，可能与官网覆盖范围不同；仅接纳精确映射、活跃、已采集行情且时间有效的现货记录。衍生品交易对仍为 CoinGecko 永续与交割合约数量之和，不包含期权。');
    warnings.push('CoinPaprika 仅补充缺失的现货 USD 报告成交量，不将其 adjusted 成交量、衍生品默认市场或评分混入 CoinGecko 的对应指标。');
    warnings.push('已接入的官方市场目录优先补充现货数量，按可交易状态筛选并按基础资产去重；目录每 5 分钟读取，行情每分钟读取。未提供相关业务或来源未覆盖的字段仍保持未知，不补造 0。');
    warnings.push('Trust Score 及排名由 CoinGecko 发布；并非平台自身评级、资产担保或安全承诺。国家与成立年份按公开来源原值展示，可能对应交易主体或衍生品业务。');
    warnings.push('BitMart 的公开聚合源年份 1996 与其官方说明冲突，已排除该值并显示 —；若来源修正为有效年份会自动显示，不把手工年份伪装成实时数据。');
    warnings.push('采用已核对的中心化交易所目录及精确来源 ID 映射，排除 DEX。地区业务独立列示；仅汇总已获取到的指标，未公开或未覆盖字段为 —，不当作 0。');
    return { version: 1, generatedAt: new Date(now()).toISOString(), refreshIntervalSeconds: 60, exchanges, sources, warnings };
  }
  return { getSnapshot };
}

const service = createCexHubService();
export async function getCexHubSnapshot(): Promise<CexHubSnapshot> { return service.getSnapshot(); }
