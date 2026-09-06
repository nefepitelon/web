# TideSight Quant 独立执行与 MACD 自动策略

## 本次版本

- TideSight 总览与 MACD 共用 12 个 USDT 永续标的：BTC、ETH、BNB、SOL、ZEC、TAO、ENA、ONDO、UNI、XRP、SUI、HYPE；Alpha Radar 的 DOGE 和其他配置保持原样。
- MACD 独立导航页覆盖月、周、日、4 小时、1 小时、15 分钟。数据来自 Binance Futures 已收盘 K 线，12/26/9，柱值采用 2 × (DIF − DEA)。历史不足时显示不可计算，不伪造月线。
- `tidesight_*` 八张独立表保存凭据、配置、意图、计划、订单、持仓、审计和自动事件。历史 Alpha 记录不迁移、不删除、不继承其 LIVE 解锁。
- 普通策略仍需逐计划人工确认。自动区六套规则见 `lib/tidesight/automatic-strategies.ts`；只有服务端识别的新收盘重生/死亡交叉可以自动执行。

## 首次启用（必须由用户完成）

1. 创建 TideSight 专用 Binance USDT 永续子账户。不要与 Alpha Radar、其他机器人或手工仓位共用。软件配置隔离不等于共用交易所账户的资金隔离。
2. 在“执行与接入”加密保存独立 Key，完成预检及健康对账。Key 必须由交易所确认禁用提现，启用读取及对应交易权限：统一账户为 `enablePortfolioMarginTrading`，普通合约为 `enableFutures`，现货/杠杆权限不能替代。IP 白名单建议启用，但不作为 TideSight 平台预检或解锁条件，交易所自身的权限要求仍需满足。不在客户端保存 Secret。执行器要求单向仓位；PAPI 使用统一保证金，FAPI 使用逐仓，不会自动切换交易所账户或持仓模式。
3. 在“风险闸门”设置 TideSight 自己的限额。六套规则需要允许 25× 与 1.5% 最大单笔净值风险；200/500/1000 USDT 是目标名义仓位上限。自动信号会按实时净值风险、单笔/单日/组合剩余额度和可用保证金安全下调，不会放大；不足交易所最小名义额度仍会拒绝。日损熔断、仓位数等硬门禁仍可否决任意信号。
4. 在“自成交策略区”明确填写价格止损/止盈并确认。没有默认替用户选择的参数。止损至少 0.25%，25× 下小于 3.2%，止盈至少为止损的 1.5 倍；这些是软件校验，不是实际损失保证。
5. 通过管理员 2FA，勾选真实资金/风险额度及 API Key 提现关闭两项协议，再点击“显式解锁生产实盘”。之后如需启动自动交易，点击“自成交启动按钮”，逐项勾选真实资金/最高 25× 杠杆风险与 TideSight 专用子账户两项协议，再点击“确认授权并启动”。两处均不再输入确认短语。取消、完成启动或启动资格失效后会清空勾选；服务端仍严格要求两项布尔值为 true，并校验 LIVE、2FA、对账、保护参数和独立风控。

## 界面与显示设置（2026-09-03）

- 九个模块共用更大的字号、明确的卡片边界和响应式网格；MACD 大图与策略表格仅在自身区域横向滚动。
- 深浅色使用统一配色变量，覆盖图表、提醒、表单和状态卡。中英文覆盖自动策略、风险编辑、协议和周期标签；交易所/审计原始消息保留原文。
- 沿用全站主题与语言偏好，刷新后恢复、多标签同步；存储受限时仍可切换当前页面。React 自主管理的文案不再由全站旧式 DOM 翻译重复改写。
- `scripts/verify-tidesight-ui.cjs` 使用真实组件和隔离数据验证页面布局与协议提交，不访问真实交易账户。

上线不自动解锁、不复制 Alpha 凭据、不启动自动交易。本次测试不发送真实订单。第一次实盘仍需用户自行完成小额验收和观察交易所保护单。

## 运行与停止语义

- Vercel Workflow 在服务端持久运行，关闭浏览器不会停止。每轮后休眠 30 秒，数据读取、风控及对账另需时间，不承诺即时或高胜率。
- 仅消费启用之后、最新已收盘 K 线不超过 120 秒的交叉。数据库唯一事件键按“用户 + 规则 + 标的 + 收盘时间”去重；拒绝也不会反复追单。停机后不追历史信号。
- 每个用户使用数据库执行租约，避免手动、自动和对账并发写入；计划还使用原子状态认领、确定性客户端订单号。未知状态不盲目重试。
- 发单前重新读取实时价格及账户风险。相同标的存在仓位或挂单时拒绝叠加或对冲。交易所不支持的标的、杠杆或数量过滤器会拒绝并显示原因。
- 自动规则的名义额度是目标上限：计划取目标、净值风险额度、单笔/单日/组合剩余额度与可用保证金中的最小值，只会安全下调、不自动放大；下调后不足交易所最小名义额度会拒绝。普通策略的显式固定名义仓位仍保持严格拒绝、不缩放。数量只按交易所步长向下取整。风险预算包含 0.15% 预估费用/滑点余量；市价成交、跳空、清算或交易所故障仍可能超出预算。
- 日损益采用 UTC 当日已实现损益 + 资金费 + 手续费 + 当前未实现损益，较保守；明细不完整（单日达到 1000 行）停止新增风险。
- 成交后创建交易所原生 reduce-only 止损与止盈。创建失败会触发 Kill Switch 并尝试紧急平仓；失败/未知结果需要人工检查，不代表已保证平仓。
- 关闭自成交、切换 PAPER、重新锁定 LIVE 或编辑风险/保护参数会阻止后续自动开仓。已经发出的订单无法撤回，原生保护单继续生效。Kill Switch 则另行处置平台可识别的订单和持仓。
- 心跳中断超过 3 分钟后不再新增自动风险，用户需检查后显式重启。运行错误、拒绝、待对账结果显示在控制页和自动事件记录中。

## 验证与运维

- `node --test tests/*.test.js`：全站回归，包含隔离、六规则、固定额度、失效授权、并发、未知订单和保护失败测试。
- `node node_modules/tsx/dist/cli.mjs --test tests/tidesight_macd_logic.test.ts`：指标定义和历史边界。
- `scripts/verify-tidesight-browser.cjs`：12 行情卡、72 MACD 面板、独立导航、周期切换、桌面和移动端。
- `scripts/verify-tidesight-controls.cjs`：六策略、12 手动交易对、独立风险设置及未登录接口拒绝。
- 生产构建通过 `scripts/migrate-on-vercel.mjs` 执行新增迁移；迁移只创建 TideSight 表和约束，不改 Alpha 表。
- 排查顺序：自动心跳/错误 → 自动事件状态 → 计划/订单审计 → Binance 实际持仓与保护单 → 健康对账。不要为“重试”删除事件去重键。

接口依据：[Binance API Key 权限](https://developers.binance.com/en/docs/catalog/core-trading-wallet/api/rest-api/account)、[USDⓈ-M 交易接口](https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/trade)。

## PAPI 统一保证金适配（2026-09-03）

- 原有 Key 不需要复制到其他平台；未验证凭据在预检时读取 Binance 权限并自动识别。识别结果以 `permissionSummary.accountMode` / `adapterVersion: 2` 保存，之后执行、保护、平仓和对账使用同一路由。账户权限模式发生变化时拒绝静默切换；如确需更换，先清理持仓/挂单、停止自动执行，再重新保存凭据。
- 首次识别 PAPI 时撤销 LIVE 与自动执行授权，保持 PAPER，要求用户重新健康对账、勾选协议并解锁。部署本身不启用实盘，不替用户点击自动执行。
- 权限检查使用 SAPI；公共行情、合约过滤器、服务器时间继续使用 FAPI。所有统一账户私有交易走 `https://papi.binance.com`，HMAC 签名，12 秒超时；仅时间偏差错误重校时一次，未知下单结果不重复 POST。
- 账户检查：`/papi/v1/account`、`/um/accountConfig`、`/balance`、UM/CM `positionRisk`、UM/CM 普通挂单及 Algo/条件挂单。交易使用 `/papi/v1/um/order`、`/um/leverage`；保护使用现行 `/papi/v1/um/algo/order`，不使用已弃用 UM conditional API。保护触发后通过 `actualOrderId` 查询真实子订单状态、成交数量和均价，不把触发价当成交价。
- 资金范围仍为 TideSight 专用 **USDT UM** 账户。支持由交易所折算的多资产抵押品，但不借币、不划转、不交易 COIN-M，也不接管其他策略仓位。非零 CM 仓位/挂单、杠杆借款/利息/负余额/锁定资金、未知 UM 仓位或挂单会否决新增风险；不会替用户自动清理这些资产或负债。
- 权益预算取折算权益与实际净权益的较小值；不将 `virtualMaxWithdrawAmount` 当作可用余额。账户必须 `NORMAL`，有维持保证金时同时要求报告与计算的 uniMMR ≥ 1.5（平台保守缓冲，不是交易所清算阈值）。可用预算取交易所可用余额、净权益扣除初始保证金/挂单浮亏、`equity / 1.5 - maintenanceMargin` 三者最小值；旧版空可用字段只按后两项保守计算。
- 固定与手动仓位均受该预算约束，新增初始保证金被保守计入维持保证金缓冲，并计入 0.15% 费用预算。发单前再次检查当前账户与保证金；减少风险的平仓不被新增仓位门禁拦截，交易所自身限制仍适用。
- UTC 日损益是 UM 交易损益口径，不是抵押品总回报。USDT 已实现损益/资金费/手续费加 UM 当前浮盈亏；BNB 抵扣手续费按近 24 小时最高 USDT 价计入保守风险支出，不冒充会计成交估值。不支持的损益币种或明细达到 1000 条上限时停止新增风险。抵押品价格与折算率变动另由实时权益/保证金门禁约束。
- 回归：`tests/tidesight_papi.test.js`（签名/路由、权限、风险、原生保护、未知结果）；`tests/tidesight_execution_flow.test.js`（真实适配器接入内存数据库与模拟交易所，覆盖手动/自动全链路和首次预检加锁）。测试从不使用真实 Key 或提交真实交易。

接口依据：[PAPI 账户与风险](https://developers.binance.com/en/docs/catalog/advanced-trading-derivatives-trading-portfolio-margin/api/rest-api/account)、[PAPI 下单及 Algo Order](https://developers.binance.com/en/docs/catalog/advanced-trading-derivatives-trading-portfolio-margin/api/rest-api/trade)、[PAPI 用户数据流](https://developers.binance.com/en/docs/catalog/advanced-trading-derivatives-trading-portfolio-margin/api/rest-api/user-data-streams)。
