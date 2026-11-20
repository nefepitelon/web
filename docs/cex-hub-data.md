# Cex Hub 公开数据与目录

核对日期：2026-11-08（北京时间）。Cex Hub 是只读公开信息页面，与套利对冲引擎、账户配置和交易接口隔离。用户无需提供账户、API key 或钱包信息。

## 收录范围

`lib/cex-hub-catalog.json` 明确列出 151 个中心化交易所条目，使用精确来源 ID 映射。143 项有现货来源映射，55 项有衍生品来源映射；其中 8 项仅映射衍生品来源。不同地区站或独立交易主体分别保留，例如 Binance / Binance US、Bybit / Bybit EU、HashKey Exchange / HashKey Global，不把它们的指标合并进同一行。

现货条目逐项对应 CoinGecko 的[中心化交易所列表](https://www.coingecko.com/en/exchanges)及[第 2 页](https://www.coingecko.com/en/exchanges?page=2)公开分类，另加入已核对的 PrimeXBT、Flipster、BitMEX、BitMart、CoinEx、HashKey Global、Kalshi、Coincall 衍生品条目。Coincall 的[官方介绍](https://support.coincall.com/hc/en-us/articles/16530592375705-About-Coincall)明确说明其 CEX 属性，精确映射批量 API 第 2 页的 `coincall`。Ondo Stocks 发行平台、Figure Markets 的托管分类疑义项未纳入；Hyperliquid、Uniswap、PancakeSwap、Aster、dYdX、Gate DEX 等 DEX 不因批量 API 返回而自动进入 CEX 目录。

Deribit 行同时承接其现货与衍生品精确来源 ID，名称统一为 Deribit。[Coinbase 官方迁移说明](https://help.coinbase.com/en/international-exchange/deribit/what-you-need-to-know)确认 Coinbase International Exchange 已于 2026-10-01 完成向 Deribit 的整合，因此不另添加重复的 International Exchange 衍生品行；Coinbase Exchange 现货来源仍独立保留。

目录保存名称、精确来源 ID、官网地址、分类依据与核对日期，不保存实时成交量、OI、评分、市场数量或手续费假设。官网链接剔除来源中的推广跳转及追踪参数，例如 Bitstamp 使用 `https://www.bitstamp.net/`，不使用其推广跳转域名。

该目录覆盖核对时常见的全球及地区中心化平台，不声称存在一个永远完整、永久有效的“所有交易所”集合。来源遗漏、停业、改名和地区调整需要后续按公开证据更新目录。

## 固定公开接口

每轮最多读取以下 8 个固定端点：4 个原有行情接口、1 个批量补充接口、3 个已核验的官方市场目录。行情缓存 60 秒，官方目录缓存 5 分钟；不会向 151 家交易所逐一发请求，不接受调用者传入 URL 或请求头：

| 来源 ID | 免登录公开端点 | 用途 |
| --- | --- | --- |
| `coingecko-spot` | `https://api.coingecko.com/api/v3/exchanges?per_page=250&page=1` | 现货报告成交量、Trust Score、排名、国家、年份、公开图标 |
| `coingecko-derivatives` | `https://api.coingecko.com/api/v3/derivatives/exchanges?per_page=100&page=1` | 衍生品成交量、OI、永续与交割合约数量 |
| `coingecko-derivatives-2` | `https://api.coingecko.com/api/v3/derivatives/exchanges?per_page=100&page=2` | 继续覆盖 BitMEX、BitMart、CoinEx 等精确 ID 条目，空数据不补造 |
| `btc-usd` | `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_last_updated_at=true` | BTC 计价行情换算 USD，保留报价时间 |
| `coinpaprika-spot` | `https://api.coinpaprika.com/v1/exchanges` | 精确映射的现货市场数、币种数，缺失现货 USD 报告成交量的备用来源 |
| `coinbase-products` | `https://api.exchange.coinbase.com/products` | Coinbase Exchange 官方可交易现货目录 |
| `bingx-spot-symbols` | `https://open-api.bingx.com/openApi/spot/v1/common/symbols` | BingX 官方活跃现货目录 |
| `bitunix-spot-pairs` | `https://openapi.bitunix.com/api/spot/v1/common/coin_pair/list` | Bitunix 官方开放现货目录 |

字段结构依据 CoinGecko 官方的[现货接口文档](https://docs.coingecko.com/demo/reference/exchanges)、[衍生品接口文档](https://docs.coingecko.com/demo/reference/derivatives-exchanges)与[简单价格接口文档](https://docs.coingecko.com/demo/reference/simple-price)。文档介绍可选的 API 订阅和凭证；本实现只使用核对时实际免登录返回 HTTP 200 的公开访问，不读取或发送任何凭证。未来若上游限制免登录读取，按来源不可用处理，不绕过访问控制。

## 指标口径

- 现货 24h 成交：`trade_volume_24h_btc × 同轮 BTC/USD`。只使用报告成交量字段，不使用已停止支持的 `trade_volume_24h_btc_normalized`，不混用两种口径。
- 衍生品 24h 成交：相应衍生品记录的 `trade_volume_24h_btc × BTC/USD`，与现货成交分列、分别汇总与排名。
- 衍生品 OI：`open_interest_btc × BTC/USD`。保留来源原有单边或双边统计口径，不擅自乘除 2。
- 衍生品交易对：`number_of_perpetual_pairs + number_of_futures_pairs`，需要两项均有效。它不是期权交易对数量，也不是账户仓位数。上游同时缺失成交量与 OI 却返回 0 / 0 的空壳记录，数量显示未知，不将其推断为平台没有交易市场。
- 现货交易对与币种数：优先使用已接入的官方完整市场目录，筛选可交易状态后统计交易对，并对基础资产代码去重统计币种；不把报价货币或仅支持充值的资产加进基础资产数。Coinbase 要求 `status=online` 且未限制交易或仅可撤单；BingX 要求 `status=1`；Bitunix 要求 `isOpen=1`。全部目录必须是非空、结构有效且交易对标识不重复的完整数组，避免空响应或截断页生成错误的 0。每条记录必须含有效生命周期字段：Coinbase 为 `online/offline/internal/delisted` 字符串（限制交易标志如存在必须为布尔值）；BingX 为官方 v3 数值枚举 `0/1/5/10/25/29/30`；Bitunix 为 `0/1` 数字或对应字符串。不完整或未知状态拒绝整个目录，不将“缺少状态”推断为全部停用。完整且明确全部停用的目录仍可产生有效的 0。
- 其他已映射平台的现货数量使用 CoinPaprika 批量接口的 `markets` 与 `currencies`，是该提供方已收录的现货市场/币种范围，可能与官网可交易目录不同，字段提示明确列出来源与统计范围。只接纳 `active=true`、`api_status=true`、`markets_data_fetched=true`、`type` 含 `cex` 且不含 `perpetuals` / `dex` / `otc` / `other` 的记录。占位 `0/1` 且未采集行情的记录不补入。列表中的所有数量均要求非负安全整数。
- CoinPaprika 的 73 项 `coinpaprikaId` 使用审计后的精确 ID，不能按名字模糊匹配。例如 Coinbase=`coinbase`、Gate=`gateio`、CEX.IO=`cexio`（`cex` 是其他平台）、Bybit=`bybit-spot`、MAX=`maicoin-asset-exchange`。相似名称、地区实体或重命名主体未经证明不合并。BingX、Deribit 在该来源是衍生品默认市场，已逐项验证其市场类别，不能将其数量放入现货列。
- CoinPaprika 现货报告成交量：仅在 CoinGecko 对应现货 USD 金额不可用时使用 `quotes.USD.reported_volume_24h`，不使用 `adjusted_volume_24h`，不转换或填入衍生品与 OI。直接 USD 来源独立于 BTC/USD，BTC 接口故障不会清除这项公开 USD 备用观测。
- Trust Score 与排名：按 CoinGecko 公布值展示，评分限制为 0–10，排名为正整数；并非本平台自评。
- 国家与成立年份：按来源所列交易实体或业务的公开元数据展示，缺失时为 `—`，不由网址或名称推断。
- 图标：使用明确来源 ID 对应的公开 CoinGecko 图标，本地图标文件及来源见 `docs/cex-hub-icons.md`。服务返回的远程备选图标仅接受 CoinGecko 图片域名的 HTTPS URL。

金额缺失、空字符串、负数、无穷值与非法数字均为 `null`；明确有效的 0 保留。仅汇总有值的平台。某平台空值不表示它没有相关业务，例如 CoinGecko 目前未为 BitMEX、BitMart、CoinEx 返回有效成交量和 OI。

BitMart 的聚合源年份 `1996` 与其[官方说明](https://www.bitmart.com/en-US/support/articles/7922665245339/39162120325403/50420037790619)所列“2017 年 8 月成立”冲突。目录以 `excludedYearValues: [1996]` 记录排除值、官方证据和核对日期；服务将此冲突值显示为 `—`，不手工填入 2017 冒充实时来源。如果聚合源未来修正为 2017 或其他有效且未被排除的年份，将自动恢复显示。

## 刷新、超时与来源状态

页面每 60 秒刷新，支持手动刷新。服务按端点缓存成功数据、合并并发请求；行情及 CoinPaprika 批量源缓存成功或失败尝试 60 秒，3 个官方市场目录缓存 5 分钟，避免浏览器重复刷新击穿接口。每个端点有 9 秒总期限，包含 HTTP 头及 JSON 正文读取。失败互相隔离，某一个端点异常不会清空其他来源。

成功数据最多保留一小时。读取失败时保留的数据为 `stale`，超过保留期限后移除相关字段。目录与官网仍可使用。缓存未命中且不可读取的字段为 `unavailable`。

BTC/USD 必须有上游时间戳。超过当前时间 5 分钟或落后 30 分钟的新报价不接纳；不可用的换算价格不会生成新的 USD 行情。使用保留价格换算时，该 USD 字段也标为 `stale`，不会因交易所列表读取成功而错误标成实时。

每个字段保留 `fieldSources` 与 `fieldStatus`。CoinGecko USD 字段同时依赖交易所来源及 `btc-usd`；CoinPaprika USD 字段独立来自其公开 USD 观测。来源 `fetchedAt` 是成功读取时间，不能伪装成上游测量时间。

CoinPaprika 每个交易所记录都有 `last_updated`；只有时差不超过 30 分钟且未来不超过 5 分钟的记录才参与补充，字段在 `fieldUpdatedAt` 单独保留其提供方时间。批量源级别没有单一的测量时间，`updatedAt` 仍为 `null`。官方产品列表没有测量时间，只显示成功读取时间；覆盖 CoinPaprika 数量时会移除先前提供方时间，避免串用时间戳。`fieldNotes` 记录数量统计范围或产品身份说明。

Coinbase Exchange 本行仅展示其现货业务。缺失的衍生品成交、OI、交易对保持 `null`，通过字段说明引导查看 Deribit；不把两个独立行的指标复制为 Coinbase 的行情。

行级状态只由现货成交、衍生品成交与 OI 的有效观测决定。国家、年份、图标或交易对数量的成功读取不能让缺失行情的行显示为实时。

## 核验记录

2026-11-08 01:09 北京时间的只读探测：全部 4 个来源均为 `live`，150 个目录条目中，143 项有现货 USD 数据与评分，51 项有衍生品 USD 成交、OI 与有效市场数量。探测耗时 689 毫秒。这是当时的覆盖快照，产品数据始终由公开接口读取，不将这些覆盖数量写死在页面。

初次覆盖的原始来源响应保存于忽略部署的 `artifacts/cex-v163-spot.json`、`artifacts/cex-v163-derivatives.json`、`artifacts/cex-v163-derivatives2.json`；后续最新探测保存于 `artifacts/cex-v163-live-snapshot.json` 与 `artifacts/cex-v163-live-report.json`。01:19 北京时间复测遇到上游 HTTP 429，服务保留目录而将缺失行情显示未知，验证了初次连接被限流时不会生成模拟数字。Coincall 随后依据已保存的公开响应补齐映射，最终目录为 151 项；历史覆盖数量不充当最终覆盖承诺。路由、客户端校验、缓存、失败保留、数值边界、精确 ID 隔离及交易引擎隔离由自动化检查与部署核验覆盖。

## 1.6.4 补充来源核验

[CoinPaprika 批量交易所文档](https://docs.coinpaprika.com/api-reference/exchanges/list-exchanges)说明免费匿名请求、现货市场数量及币种字段；[其统计方法](https://coinpaprika.com/methodology)说明市场采集与报告/调整成交量的区别。2026-11-08 本机只读核验返回 HTTP 200、1,142 条记录，按固定目录和类型/状态审计后映射 73 项；该数字为核验时覆盖范围，不是后续数据保证。

官方目录依据 [Coinbase 产品文档](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-all-known-trading-pairs)、[BingX 官方 v3 现货说明](https://bingx-api.github.io/docs-v3/#/en/spot/Market%20Data/Spot%20trading%20symbols)（含完整交易对状态枚举）、[Bitunix 公共接口说明](https://www.bitunix.com/api-docs/spots/en_us/public/)及[匿名接口/域名说明](https://www.bitunix.com/api-docs/spots/en_us/)。核验时 Coinbase 返回 846 条已知产品，其中 517 项可交易、410 种基础资产；BingX 2,297 条目录中 646 项活跃、623 种基础资产；Bitunix 853 条目录中 538 项开放、538 种基础资产。官方目录成功覆盖/补充后，75 家平台具备现货交易对和币种观测，其余来源未覆盖或未公开的字段继续保持未知。

上述响应仅保存于忽略部署的 `artifacts/cex-v164-*.json` 供回归验证，产品读取始终调用固定公开端点，不将这些金额、数量或覆盖快照硬编码为实时数据。不使用受登录保护的数据，不绕过限流、区域访问限制或访问控制；不能验证口径的其他聚合源不进入现货列。