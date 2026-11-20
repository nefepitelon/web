# 套利对冲Ops：八个控制台的交易与账户边界

## Ondoperps 两组控制台（1.5.0）

`ondoperps_entropy` 和 `ondoperps_ondoperps` 复用第三套控制台已使用的订单意图、实际成交记账、未知订单恢复及只减仓退出状态机。适配层负责交易所签名、市场单位和账户语义，不能把换名称当成完成接入。两个入口有独立配置、SQLite、进程或云端检查点；新增入口和网络故障不会重启原有策略。

| 控制台 | 左腿 / 右腿 | 资金费与账户要求 |
| --- | --- | --- |
| Ondoperps <> Entropy | Ondoperps 永续 / Hyperliquid `io` HIP-3 逐仓永续 | 只匹配相同基础标的，按各自小时费率计算净差；Entropy 使用资金账户公开地址和已授权 agent，不使用主钱包私钥。 |
| Ondoperps <> Ondoperps | Ondoperps 账户 A / 不同的账户 B | 同一合约的资金费相抵。固定 A 多、B 空进行双账户对冲轮换，净资金费差为零，不显示虚构套利 APR；仍承担价差、手续费和两边保证金风险。 |

### 现有两套策略的复用边界

Arcus/RHC 与 Entropy/Arcus 的实际流程为 `FundingService → HedgeEngine → risk/scheduler → Executor/Maker → FillReconciler → Store`：先确认资金费单位和方向，再核实两所真实账户、可成交盘口、数量精度、保证金和强平距离，最后执行双腿并对账。Arcus Maker 为 ALO，部分成交按实际成交对冲，撤余单和失败救援都由任务执行层负责。RHC 的八小时等值费率须换算为小时，Entropy 的 `io` 不能混用 Hyperliquid 原生市场。

新两组沿用 Binance/Lighter 的持久化意图流程：发送左腿 IOC 或只挂单限价，核实终态和实际成交，再对冲右腿；明确拒单或部分成交的残量只能减仓补救。回执丢失、非终态订单和成交明细不完整均保持 UNKNOWN/REVIEW，不能把 HTTP 接收成功当作成交，也不能重复提交。任务停用、轮换到期、强平风险和全部停撤平均使用本任务账本确认的 reduce-only 数量，不接管其他程序或手工仓位。

### 官方配置与前次问题的处理

- Ondoperps 固定官方主网 `https://api.ondoperps.xyz`；单账户用 `ONDOPERPS_API_KEY_ID`、`ONDOPERPS_API_SECRET`，双账户分别用 `ONDOPERPS_A_*` 与 `ONDOPERPS_B_*`。Key 保留 `ondoKeyId_`，Secret 保留 `ondoApiSecret_`；不发明 64 位十六进制或固定字符集限制。凭据只在私有配置保存，页面和错误日志脱敏。
- 官方 HMAC-SHA256 签名原文是 `timestamp + UPPERCASE_METHOD + path_with_query + exact_body`，使用完整 Secret；时间戳最多落后 10 秒或领先 1 秒。只读校时恢复与报单分开，写请求不盲重试。权限使用当前 Key 的实际 scopes 核实，IP 错误保留交易所错误码但不回显凭据。
- Ondoperps 资金费按小时结算，`fundingIntervalDivisions` 是费率平滑除数，不是结算小时数；按官方预计小时费率归一为 bps/h。杠杆和数量、价格步长读取真实合约及当前名义额档位，不编造上限。双腿空仓且设置读回成功后才能开仓。
- 双 Ondoperps 不仅检查 Key 是否不同，还读取真实 `accountID`，同一账户的不同 Key 仍不能作为双腿。跨控制台使用相同 Key、已知资金地址或 agent 时拒绝并行启动；该静态冲突检查不能证明不同 Ondoperps Key 一定属于不同真实账户，因此各控制台仍须使用独立专用账户，不能用新 Key 绕过共享资金账户边界。
- 延续 1.4.4 的界面连续性：只创建一次已访问的 iframe，隐藏页面暂停只读轮询，激活后恢复读取；不重放写请求、不清空表单。运行状态、行情状态和账户授权分别呈现，网络未知不当成空仓或零余额。

两组 UI 延续账户与成交统计、盘口价差排序、共同最大杠杆、金额与轮换区间、IOC/左腿 Maker、实盘预检、任务编辑启停、日志、订单导出、持仓强平距离、停止与全部停撤平。公开行情可在未配置凭据时读取；新账户实盘成交验收需要用户在本地/服务器配置专用 `view` 和 `trade` Key，代码及模拟全流程通过不等于已经替用户提交真实订单。

官方依据：[Ondoperps REST OpenAPI](https://docs.ondoperps.xyz/api-reference/rest-spec.json)、[API Key 鉴权](https://docs.ondoperps.xyz/api-reference/api_key_authentication)、[Hyperliquid HIP-3 信息接口](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint)、[Hyperliquid 交易接口](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint)。

## 六个控制台与共同执行层（1.4.0）

新增 `binance_okx`、`binance_hyperliquid`、`hyperliquid_lighter`。前三个入口保持原有次序，新增入口接在后面；本地管理器、服务器 Worker、Workflow、配置、网络诊断与全部停撤平均识别六个独立引擎。新增三组共用 `paired_hedge` 适配器，复用 `binance_lighter/engine.py`、`store.py`、`api.py`、`views.py` 的订单状态机和账本，不调用外部 Git 服务。共用账本中的 `binance` / `lighter` 字段分别是左腿 / 右腿兼容槽位，真实交易所由市场描述及适配器决定，界面显示真实名称和保证金币种。

先发送左腿 IOC 或限价只做 maker，终态实际成交后发送右腿 IOC；部分成交按共同数量步长对冲，明确失败的差额只减仓补救。未知订单按持久化客户订单号恢复，禁止重新提交；任务持仓、成交、手续费、轮换时长和损益遵循第三套已有规则。停用、风控及全部停撤平始终以 IOC reduce-only 退出本任务仓位。服务器每次有限调用仍在提交意图后立即保存加密检查点，订单未知时保留操作锁。

三个新增控制台从同一前端模板生成，生成器为 `scripts/expand-hedge-pairs.py`。均具备账户及交易统计、任务成交表、交易所状态、容量仪表、持仓强平距离、共有币种费率排名及筛选排序、两所最大杠杆、按两所合计价差排序的币种选择、杠杆及金额/时长区间、IOC / 左腿 Maker、实盘预检、任务启停编辑、执行日志、订单导出和诊断。生成后的文件纳入本地 ZIP 及生产部署；既有定时数据读取继续更新数据，不重建 iframe 或重置表单。

### 各交易所配置与单位

| 交易所 | 配置 | 交易范围和核验 |
| --- | --- | --- |
| Binance | HMAC `BINANCE_API_KEY`、`BINANCE_API_SECRET` | USDT USD-M 永续；使用 `accountConfig` 核实单向、单资产和 `canTrade`，实盘预检对任务使用不进入撮合的 `/order/test` 核实当前 Key 交易权限；复用单调时钟校时及 -1021 只读恢复。 |
| OKX | `OKX_API_KEY`、`OKX_API_SECRET`、`OKX_API_PASSPHRASE`；`OKX_REGION=global/us/eea` | USDT 线性 SWAP；Futures 单币种保证金模式 `acctLv=2`、净持仓 `net_mode`、全仓 `cross`；配置接口 `perm` 必须含 `trade`。按注册地区固定官方域名。用服务器时间、ISO8601 和 HMAC-SHA256/Base64 签名；只读时间错误可重新校时，写请求不重放。 |
| Hyperliquid | `HYPERLIQUID_ACCOUNT_ADDRESS` 为实际资金主/子账户；`HYPERLIQUID_PRIVATE_KEY` 为授权专用 agent；子账户同时填写相同的 `HYPERLIQUID_VAULT_ADDRESS` | 原生 USDC 永续，空 `dex`，与 Entropy 的 `io` HIP-3 市场区分。检查主账户授权 agent 及到期时间，拒绝主钱包私钥。官方 SDK `sign_l1_action` 签名；nonce 在签名前持久化，使用官方服务器时间，价格满足最多五位有效数字及 `6-szDecimals` 小数限制。 |
| Lighter | Core 账户、API Key index 和 80 位十六进制 API 私钥 | 继续使用 Core 官方 SDK 和既有账户/Key 匹配、nonce、405 读取有限恢复；不混用 RHC 实例。 |

所有适配器暴露的数量统一为基础资产。OKX 下单张数与账本基础数量之间按 `ctVal × ctMult` 转换，数量步长为 `lotSz × 合约面值`，精度不满足即拒绝；只匹配完全相同单位名称，不能把 1000 倍资产当成普通资产。资金费统一 bps/小时：Binance 使用实际结算周期，OKX 使用 `nextFundingTime-fundingTime`，Hyperliquid 原生为每小时，Lighter 为八小时等值除以八。

杠杆按两所官方上限较小值显示，并在双腿空仓时按当前名义额档位设置、读回核实；读回失败不下开仓单。OKX 使用线性永续合约档位，Hyperliquid 使用 margin tables 和 `activeAssetData`；不支持跨保证金的 Hyperliquid 市场排除。实际强平距离继续来自持仓，而非只根据杠杆推算。

### 多程序账户边界和验收范围

新增实盘组合应使用独立子账户和专用 API agent。启动时阻止与其他活动控制台复用已知资金地址、Lighter Core 账户、相同 Binance/OKX Key 或 Hyperliquid agent；RHC 与 Core 的账户编号属于不同命名空间。该检查不证明不同 Binance/OKX Key 属于不同资金账户，也不能协调平台外客户端。实际仓位与任务账本不符时拒绝操作，避免接管其他程序仓位；不要用不同 Key 绕过专用账户要求。服务器启动检查采用可串行化事务，本机启动检查采用管理器级串行锁。

已用官方公共主网接口只读核实四所行情/合约字段；自动化验收覆盖三个组合的完整模拟开平仓、部分成交、未知成交、Maker、重启恢复、停撤平、配置保密和页面入口。没有使用新增实盘凭据进行下单验收，也没有操作既有实盘仓位；上线代码及只读行情通过不等于新账户实盘订单已经成交。

官方依据：[OKX API](https://www.okx.com/docs-v5/)、[OKX 地区域名](https://github.com/okx/agent-trade-kit/blob/github-main/docs/site-compatibility.md)、[Hyperliquid 信息接口](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint)、[永续规格和资金费](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/perpetuals)、[交易接口](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint)、[价格与数量精度](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/tick-and-lot-size)、[官方 Python SDK](https://github.com/hyperliquid-dex/hyperliquid-python-sdk)。

## 两套现有平台

`engines/lighter` 是 Arcus × **Robinhood Chain Lighter**，`engines/entropy` 是 Arcus × **Hyperliquid HIP-3 io（Entropy）**。各自保留完整原版源码、独立 SQLite 和完整前端。它们不是远程 Git 调用，也不是一个订单接口换两种名称。

共同流程是 `FundingService.refresh → HedgeEngine.run_cycle → risk / scheduler → Executor → FillReconciler → Store`。行情层匹配共同市场、核对资金费单位与周期、读取盘口和两所账户；账户读取失败不能当成空仓。任务层决定开仓、轮换、停用后平仓、补仓、孤腿补救和强平距离保护。执行层以实际成交和仓位变化判断成功；订单受理回执不是成交凭证。账本通过交易所订单号 / 成交记录核对价格、手续费和损益。

Arcus Maker 使用 ALO，订单推送触发第二腿对冲，断线时轮询；部分成交按已成交数量对冲，超时撤余单。正常轮换允许挂单，风控退出使用吃单；对冲失败需撤单并处理残余裸腿。两套引擎的 `execution.py / maker.py / engine.py / ledger.py` 是这些行为的实际实现。RHC 资金费报价为 8 小时等值，Entropy 原生资金费按小时，Arcus 按小时；不可直接把 API 数字相减。

外层 `gateway.py / local.py` 提供本机配置、CSRF、进程隔离和安全停机；Next.js 接口提供会员和管理员二次验证。Vercel 模式使用 Workflow 调度有限周期，HMAC Worker 原子领取执行标识，SQLite 检查点加密存储在 PostgreSQL。请求结果未知时保留标识、暂停自动重试，避免重复真实订单。

## 第三套：Binance USD-M × Lighter Core

新增原生模块在 `hedge-ops/binance_lighter`。它使用独立配置、任务、订单意图和账本，复用平台权限、启动器、配置界面、网络诊断、进程和云端检查点机制。没有把 Binance 数据冒充 Arcus 字段，也不改变前两套策略。

交易范围为 Binance **USDT 线性永续**与 Lighter **Core USDC 永续**，固定官方地址 `fapi.binance.com` 和 `mainnet.zklighter.elliot.ai`；不复用 RHC 账户编号或 API Key。只匹配完全相同的基础资产代码，不自动进行 1000 倍合约或其他单位换算。Binance 使用 `fundingInfo` 的周期调整值及官方默认 8 小时，Lighter `funding-rates` 的 8 小时等值除以 8，统一成 bps/h。盘口基差再次阻止同名不同标的误配。

### 开仓与退出

1. 用户在外层保存 HMAC Binance Key/Secret、Lighter Core 账户编号与 80 位 API 私钥。默认演练。实盘需管理员二次验证、显式授权、只读实盘预检和启用任务。
2. 预检检查 Binance 单向持仓 / 单资产模式、USDT 可用保证金、Lighter 原生 SDK、密钥账户匹配、nonce 通道、余额、共同市场、挂单及仓位归属。不会自动修改账户模式或杠杆。任务外仓位阻止新开仓。
3. 风控检查两所精度的最小公倍数量步长、最小数量/名义额、最大数量、滑点内可成交深度、实时盘口基差、资金费门槛和双所保证金缓冲。默认保证金缓冲为名义额的 1.25 倍。
4. Binance 先发有价格上限的 IOC 限价单。终态确认实际成交后，按可共同表示的数量在 Lighter 发 IOC 对冲。每张单在发送前提交唯一客户订单号和意图；成交与持仓所有权在同一次数据库事务内更新。
5. 第二腿已明确未提交或部分成交时，仅减仓 Binance 未对冲部分；第二腿结果未知时冻结任务并查询原订单，不盲目重发或假定失败。重启后读取原客户订单号，确认终态后恢复减仓至空仓。
6. 停用、轮换到期、强平距离不足或双腿数量不匹配时，按任务拥有的数量分别使用 reduce-only 退出。账户读取错误不触发误平；实际仓位与自有账本不符时停止自动操作，不接管手工仓位。资金费接口中断仍允许核实账户后处理已有仓位。

本版本采用 IOC 双腿执行，不包含 Binance Maker 挂单策略。任务最多 4 个，有限云端调用每轮处理一个任务并持久化轮询游标；循环间隔为每轮间隔，不是每个任务的固定检测间隔。交易所不可达时无法保证即时减仓，应在实际使用的网络出口完成预检。

### 对账与验证边界

成交量和现金流来自终态成交记录，Binance 手续费从 `userTrades` 读取，Lighter 手续费从订单成交的微单位字段读取。缺失或非 USDT 的 Binance 手续费保持未知，不当成零。界面显示的闭仓交易现金流近似 USD 合计不含资金费，不等于账户净收益；USDT 与 USDC 不是同一种资产。订单视图保留最近 10000 条，不应将它当作完整税务或永久收益报表。

自动测试覆盖本地 HTTP 配置与控制台、正常开平仓、部分成交补救、第二腿拒单、报单后断线、重启恢复、仓位归属冲突、账户读取失败、资金费中断时减仓、演练零下单、Binance HMAC / IOC / reduce-only 参数、Lighter SDK 整数精度及手续费单位、云端 SQLite 检查点跨调用恢复。测试使用交易所响应夹具，不触碰用户账户。

真实账户成交验收仍需用户在界面配置专用交易凭据并完成预检。本次只读复测中 Binance 公共接口 HTTP 200，但本机已保存 Key 的合约接口返回 HTTP 401 / -2015；官方权限接口明确返回 `enableReading=true, enableFutures=false`。这属于该 Key 的合约授权问题，普通读取权限不能替代合约权限，不能声称已完成真实账户全流程成交。

### 账户诊断与控制台补全（2026-10-25）

`Venues.account_snapshot` 分别读取双所账户，`Engine.refresh` 将公开费率和账户读取分离。某一所失败只将该所余额与仓位标记为未知，另一所仍可显示；不会把未知余额当零或据此误判孤腿。实盘路径仍使用严格 `accounts()` 和预检，要求两所账户及模式均通过后才开仓。

HTTP 错误保留状态码、交易所代码和请求路径，只隐藏实际密钥、代理等秘密。不会再因为 Lighter Key 编号为 `4` 而将 `401` 误替换成 `[已隐藏]01`。遇到 Binance `-2015` 时附加只读 `GET /sapi/v1/account/apiRestrictions` 检测；若明确 `enableFutures=false`，直接提示在 Binance API 管理中为同一组 Key 开启合约权限。检测缓存 5 分钟；Futures 接口恢复成功后直接采用实时账户，不依赖缓存。

UI 使用与前两套相同的导航、卡片、统计表、强平距离、费率排名和日交易量仪表结构。提供区间金额/时间、停用状态下保存和编辑、启停/删除保护、只读预检、单轮执行、执行记录、订单状态与 CSV 导出。区间值每次新开仓抽样并写入任务，重启后沿用本轮持仓时间。IOC 与杠杆沿用交易所设置的限制在界面明确显示。

账户权益来自交易所；平台成交统计仅计算已确认成交，完整闭仓按双腿净数量归零识别。缺失费用或截断历史不计算确定损益。USDT 和 USDC 汇总仅为近似 USD，闭仓损益不包含资金费；预计日交易量与理论容量只是估算，不是收益保证。前两套引擎与已有实盘任务不变。

### 官方接口依据

- [Binance USD-M 交易接口](https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/trade)
- [Binance 市场与资金费周期](https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/market-data)
- [Lighter SDK 与账户 / 签名](https://apidocs.lighter.xyz/docs/get-started)
- [Lighter 官方响应结构与 8 小时资金费口径](https://github.com/elliottech/lighter-agent-kit/blob/main/references/schemas-read.md)


### 停止与全部停撤平（1.2.0）

普通停止先核验任务、执行锁与账户。Binance 引擎若由内部认证接口明确证明 SQLite 任务和订单意图总数都为零，可在账户授权或网络异常时停止空程序；非空历史、未确认订单或执行中的程序不适用此例外。Windows 停止会结束 Python 虚拟环境启动器和实际工作子进程，避免只停止外层进程。

顶部每个交易对独立读取运行状态，显示已运行、未运行、停撤平中或状态待确认。全部强制停止作用于当前选择的本地或服务器模式，并列出三个程序各自的结果；两种运行环境相互独立。

本地通过 emergency.json 和 SQLite meta/emergency_stop 持久化开仓锁定，首先将全部任务停用并改为市价平仓，再由独立后台任务处理每个引擎。已运行的旧版引擎无需带仓重启：兼容现有任务字段及 cycle 接口，挂单由原有 maker 的撤单/成交核对/补救路径收尾，随后按真实仓位关闭。新版引擎同时主动触发 maker stop event。所有任务变更在停撤平期间被拒绝。

Binance/Lighter 只撤销与账本客户订单号匹配的挂单，不使用账户级 cancel-all。订单必须查询到终态才更新成交及仓位所有权，未知报单不会重复发送；平仓使用原有 reduce-only 路径。两所实际仓位与任务账本不符时保持待确认，不自动平掉任务外仓位。连接或权限失败不会误报已平仓，开仓保持锁定，恢复连接后继续处理。

服务器将状态先持久化为 DRAINING，生成新 Workflow 代次，保留正在执行的订单操作锁；原调用结束不能覆盖 DRAINING。工作流按有限批次撤单平仓，只有核验 flat 才标记 STOPPED。未知执行结果保留操作锁并转人工核对，禁止盲目重试。明确重新启动已停止的程序才释放开仓锁，原任务仍保持停用。

本次验收使用交易所夹具覆盖三套策略停用平仓、只减仓、空程序授权故障、未知订单核对、不接管外部仓位、恢复连接继续收尾及跨用户/2FA/CSRF 边界。没有对现有实盘程序执行一键停撤平。

### Binance 交易权限、杠杆及任务参数（1.3.0）

`/fapi/v3/account` 不包含 `canTrade`。余额继续使用 V3，权限和模式改为 `/fapi/v1/accountConfig`，币种当前杠杆从 `/fapi/v1/symbolConfig` 取得。明确 false 和未知值分别阻止开仓，不将字段缺失解释为未开放权限。有任务的实盘预检还调用 `/fapi/v1/order/test`；该请求验证 TRADE 权限与参数但不进入撮合，不生成平台订单意图。

费率排名的共同最大杠杆为 Binance 账户 `/fapi/v1/leverageBracket` 上限与 Lighter `/api/v1/orderBookDetails` 的 `10000 / min_initial_margin_fraction` 的较小值，并显示两所各自上限。账户档位读取失败时明确显示待核实，不编造数值。开仓时按本轮名义额再次校验 Binance 档位。

币种下拉读取两所最优买卖盘口，以 `(ask-bid)/mid*10000` 计算每所价差，再按两所之和从窄到宽排列；未知项置后。最多缓存十分钟，手动刷新可重新扫描。此排序不是资金费差，也不替代下单时盘口深度、滑点和跨所基差校验。

任务杠杆为双所共同目标倍数；留空保留旧任务行为。仅在仓位所有权核实且双腿为空时设置，不修改持仓模式或保证金模式。使用 Binance leverage 接口和 Lighter SDK update_leverage，读回两所设置后才创建订单意图。Lighter 账户的 initial_margin_fraction 是百分比字符串（5.00），市场配置与签名使用万分比（500），分别转换。设置失败或未生效不发送开仓订单；保证金按名义额除以已确认杠杆再加缓冲校验。

下单方式可选双腿 IOC 或 Binance 限价 GTX（只挂单）/ Lighter IOC。挂单等待 5–60 秒，首次观测成交即撤余单，取得终态后按实际成交量对冲；第二腿已知拒绝或基差超限时只减仓补救首腿。挂单回执丢失不会重发，恢复先撤原客户订单号并查询终态。未知状态保持暂停；所有风控和停用平仓使用 IOC reduce-only。任务外仓位不会接管。

验收包含模拟的部分成交、超时、回执丢失、紧急停止与参数保存；真实账户验证只读数据和 Binance 测试订单，不提交真实订单或修改真实杠杆。官方依据：[Binance 账户接口](https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/account)、[Lighter 官方账户响应](https://github.com/elliottech/lighter-agent-kit/blob/main/references/schemas-read.md)。
Binance 校时按时间接口自身请求的往返中点估算，不能等其他交易所慢请求全部完成后再计算偏移。签名只读请求遇到 `-1021` 时最多重新校时并读取一次；任何写请求均不因校时错误自动重发。

### Ondoperps API 权限与挂单查询修复（1.5.1）

`GET /v1/api_keys` 是密钥管理列表接口。正常交易 API Key 在该接口可能返回 `403 key_not_allowed_for_action`（实际响应为 `api keys cannot be used with this end-point`），不能据此判断该 Key 未开放交易权限。现在只对这一条精确的状态码、错误码、接口组合降级为“无法只读自查 trade 权限”；签名账户身份、账户状态、可用市场与真实双账户 accountID 仍必须通过。列表可读时继续核对当前 Key 的 trade scope。其他认证、IP 或账户错误不降级，真实杠杆和下单接口拒绝仍然阻止交易，写请求不重试。预检页面显示每个账户的实际核验范围，不把读取通过当作交易权限已证实。

订单查询使用每页 500 条并完整遍历 nextCursor。官方接口实际拒绝 1000 条请求（`limit must be a number between 1 - 500`），虽然公开 REST schema 示例仍为 1000；不能照搬过期示例。短页仍检查游标，分页中断、重复游标或达到读取边界均保持失败，不能误判账户没有挂单。修复同时适用于 Ondoperps/Entropy 和 Ondoperps 双账户控制台。

依据：[官方认证说明](https://docs.ondoperps.xyz/api-reference/api_key_authentication)、[官方 REST schema](https://docs.ondoperps.xyz/rest-spec.json)，以及 2026-10-28 官方接口只读响应。API scope 枚举为 trade/transfer，没有公开的当前 Key scope 自查端点，不要求用户配置不存在的管理 scope。

### Entropy 余额来源与 API agent 核验（1.5.2）

2026-11-02 对 Ondoperps/Entropy 已保存资金账户的只读核验：官方 userAbstraction 为 unifiedAccount，io/native clearinghouseState 的 accountValue 均为 0，但 spotClearinghouseState 的 USDC total 为 148.264135、hold 为 0。现有统一账户读取分支以及本机引擎刷新后均返回 148.264135，并未复现持续读取失败。不得把 io 的零余额当作统一账户没有资金，也不能在未经模式确认时将不同资金池相加。

新版本把实际 account_mode 和 balance_source 从适配器传递到页面，余额卡标明统一账户的现货 USDC 抵押品来源。模式切换每次重新核实，不沿用旧池余额；缺失、重复或明确 token 身份冲突的 USDC 保持未知。账户读取失败时同时隐藏旧余额和来源说明。标准账户维持 io 独立余额，组合保证金仍仅展示保守 USDC 口径，不宣称为完整组合权益或可借额度。本次没有改变交易保证金公式。

同次预检只在本机比较签名公钥与资金地址，确认当前保存的 HYPERLIQUID_PRIVATE_KEY 对应资金主账户本身，所以原有“不能使用主钱包私钥”保护正确拒绝交易。程序不能替用户把主钱包私钥变成 agent，也不会移除这项保护。用户须在官方 https://app.hyperliquid.xyz/API 创建并授权专用 agent，将 agent 私钥填入本机 HYPERLIQUID_PRIVATE_KEY，HYPERLIQUID_ACCOUNT_ADDRESS 继续填写资金账户地址。预检继续核实 extraAgents 授权及官方服务器时间下的有效期；未授权、过期或即将过期的 agent 均拒绝，不发送交易请求。

随后用户修改配置并重启后，官方 userRole 明确把新的读取地址识别为 agent，而签名地址仍为 user。此时 io 和现货查询均返回合法空结构，旧实现会误标“读取正常，0 余额”。现在账户读取和预检都先核实资金地址角色：仅真实 user/subAccount/vault 可作为资金账户，agent、missing、未知或畸形角色保持读取失败；不自动改成其他有余额地址。该校验与账户读取共用 8 秒预算，失败时不展示已确认零余额或旧余额。

依据：[官方账户抽象模式](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/account-abstraction-modes)、[官方 API 签名与 agent](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets)。
