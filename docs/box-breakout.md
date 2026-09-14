# A股&加密箱体突破看板：原生集成维护指南

## 实现范围

入口为导航栏「产品 → A股&加密箱体突破看板」，站内地址 `/box-breakout`。本功能直接使用本项目的 React / Next.js、身份认证、数据库和 Workflow，不使用 iframe，也不依赖参考仓库的 Python 服务。

功能与规则参考 [Theclues/TradeGenuis-box](https://github.com/Theclues/TradeGenuis-box)。审阅时未发现该仓库提供 LICENSE；本项目采用独立原生实现，没有复制其源代码、字体或品牌素材。参考关系不代表取得该仓库代码的再分发许可。

这是只读研究工具，不会连接交易账户、提交订单或自动交易。扫描结果是规则筛选，不代表收益保证。

## 路由与模块

以下路径均相对项目根目录。

| 路径 | 职责 |
| --- | --- |
| `app/box-breakout/page.tsx` | 获取当前用户、计算操作权限、挂载平台 AppShell |
| `components/platform-header.tsx` | `productLinks` 中的站内产品入口 |
| `components/box-breakout-surface.tsx` | 市场切换、扫描、进度、热点、自选、筛选、导出、设置和通知交互 |
| `components/box-breakout-chart.tsx` | 原生日 K、成交量、箱顶/箱底、试盘点、鼠标/键盘十字线与展开图表 |
| `components/box-breakout.module.css` | 独立样式、深浅主题、响应式布局和减少动态效果支持 |
| `lib/box-breakout/types.ts` | API、候选标的、报价、设置与任务类型 |
| `lib/box-breakout/engine.ts` | 纯计算：倍量、箱体、资金、控盘、热点匹配与评分 |
| `lib/box-breakout/market.ts` | 公开行情适配、数据校验、缓存、备用源、标的全集与快速预筛 |
| `lib/box-breakout/radar-source.ts` | 共用 α-RadarTP 原始扫描快照，榜单去重、时效及 USDT 永续校验 |
| `lib/box-breakout/service.ts` | 命令、限流、扫描准备/分片/完成、通知和定时调度业务 |
| `lib/box-breakout/store.ts` | 按用户隔离的数据库状态、CAS 更新、分片和快照 |
| `lib/box-breakout/workflow.ts` | 持久扫描与定时工作流，网络/数据库操作放在 step 中 |
| `lib/box-breakout/schedule.ts` | 北京时间工作日时刻计算与过期时段检查 |
| `lib/box-breakout/validation.ts` | 严格参数、同源、请求体大小及错误响应校验 |

API：

- `GET /api/box-breakout`：读取当前用户状态；访客返回空白初始状态，不暴露其他用户数据。
- `POST /api/box-breakout`：`scan`、`cancel`、`pool-add`、`pool-remove`、`settings`、`telegram-test`。要求登录、账户正常、完成二次验证，并通过同源及限流检查。
- `GET /api/box-breakout/quotes?market=ashare&symbols=600519`：批量报价；加密市场使用 `market=crypto&symbols=BTCUSDT`。
- `GET /api/box-breakout/chart?market=ashare&symbol=600519`：日 K 图表数据。

报价和图表仅返回公开市场数据，参数有格式、数量和请求频率限制。客户端只刷新当前页标的，报价间隔为 3 秒；隐藏标签页暂停轮询，图表按需加载，日 K 缓存约 60 秒。

## 六种扫描模式

| 模式 | 行为 |
| --- | --- |
| `market` 全市场 | 加载完整沪深 A 股清单，逐股评估，不使用快速模式的粗筛 |
| `quick` 快速 | 全市场快照预筛后选取最多 200 个活跃标的，并合并去重后的个人自选池；因此总数可能超过 200 |
| `pool` 自选池 | 仅扫描该用户保存的自选 A 股，最多 100 个 |
| `crypto` 加密 | 从 Binance 正在交易的 USDT 永续合约中按 24 小时涨幅取前 30 个 |
| `crypto-radar` 异动排行榜 | 扫描 α-RadarTP 同源快照 `items` 中可验证的 USDT 永续标的 |
| `crypto-mainstream` 热门精选主流 | 扫描 α-RadarTP 同源快照 `featuredItems` 中可验证的 USDT 永续标的 |

两种雷达模式复用 `api/alpha-scan.js` 的 `buildAlphaScanSnapshot()`，不复制排名规则，也不将榜单替换为涨幅 TOP 30。保留源榜排序，去重并排除仅现货或无有效永续合约的标的；来源时间、原榜数量、匹配数量和跳过项会写入日志。榜单为空、过期或不可达时明确失败并保留旧结果。雷达分数只用于原榜筛选，机会池仍按下述箱体规则独立评分。

`cryptoSourceMode` 随成功快照发布，失败、取消、A 股扫描或切换市场均不改变已有加密结果来源；旧数据默认标记为 `crypto`。结果标题、范围说明和 JSON 导出均使用已完成结果的来源。

快速预筛要求价格大于 2、涨幅大于 0 且小于 9.8%。量比数据覆盖足够时要求量比至少 1.2；否则以换手率 1.5%–30% 作备用活动度筛选。具体排序在 `selectQuickUniverse()` 中。

## 实际计算与评分

倍量：每根日 K 的成交量除以前五根均量；计算最近十根中的最长连续倍量天数。完整条件为连续至少 3 天且当前量比至少 1.8；A 股当前量比取日 K 比值与实时量比的较大者。

箱体：至少需要 40 根有效日 K。在最近 15 根中寻找首个收盘超过此前 40 根最高价 0.5% 的突破点，以其之前最多 60 根为箱体窗口。试盘同时要求接近箱顶、满足上影条件、成交量不低于窗口均量的 70%。低价加密资产保留价格精度，不将箱体边界强制四舍五入为两位小数。

| A 股条件 | 满分 | 部分分值 |
| --- | --- | --- |
| 匹配实时热门 TOP 10 或用户关注板块 | 25 | 不匹配为 0 |
| 连续倍量至少 3 天且当前量比 ≥1.8 | 25 | 连续至少 2 天或当前量比 ≥1.5：12 |
| 近五日资金流入且高控盘 | 25 | 资金流入但未确认高控盘：15 |
| 箱顶试盘至少 3 次 | 25 | 2 次：10 |

资金「流入」要求最近最多五日净额合计为正且至少 3 日为正。股东户数环比 ≤−2% 为高控盘代理，≤0.5% 为中，其余为低；换手率 ≥15% 时高控盘降为中。股东数据缺失时保持未知，不伪造中/高控盘。

| 加密条件 | 满分 | 部分分值 |
| --- | --- | --- |
| 连续倍量至少 3 天且量比 ≥1.8 | 34 | 连续至少 2 天或量比 ≥1.5：17 |
| 箱顶试盘至少 3 次 | 33 | 2 次：16 |
| 24 小时涨幅 ≥10% | 33 | 涨幅 ≥5%：16 |

两个市场均以总分 ≥85 为「达标关注」，70–84 为「突破观察」，50–69 为「观察」，更低为「箱内 / 排除」。加密评分不套用 A 股资金与股东规则。

## 数据来源和限制

- A 股清单：优先巨潮资讯沪深目录 + 腾讯批量行情校验，备用东方财富和新浪。腾讯每批最多 200 个代码、4 路并发、失败重试一次；要求完整覆盖，过滤退市、无效及过期报价，不把小样本冒充全市场。报价：腾讯，备用东方财富；日 K：腾讯、东方财富、新浪依次尝试，复权口径按来源而异。
- 热门板块、个股概念、股东户数：东方财富公开接口。
- 资金流：东方财富，备用新浪；过旧或无效数据拒绝使用。
- 加密：Binance USDⓈ-M Futures 的合约信息、24h ticker 与 200 根日 K，使用同市场的多个公开域名回退，不将现货数据伪装为永续。

公开接口可能限流、区域不可达、变更字段或缺失数据。缺失条件不计分并显示数据说明；整个扫描全部获取失败时保留上次有效结果。资金流、股东披露存在滞后，不能视为实时持仓事实。长时间停牌、披露较早或不足完整五日资金窗口会产生提示。

全市场会遍历完整清单，但结果快照最多保留按评分排序的前 **1000** 项；超过上限时任务日志明确提示。筛选和 JSON 导出针对保留的结果，不是未保留标的的完整历史归档。

## 后台任务、存储与安全

扫描使用持久 Workflow，关闭浏览器不会主动终止任务。每片 8 个标的，片内分批并行；具体上限位于 `service.ts` 的 `SCAN_CHUNK_SIZE`，工作流切片需同步调整。

状态存放于 Prisma `SystemSetting`，键以 `box-breakout:v1:<用户ID>` 开头。配置/任务状态与结果快照分开保存，避免每次心跳重写大数组。`revision` 的 CAS 更新防止多个实例并发覆盖；分片和快照使用确定的任务键，重复步骤不会重复累加已提交进度。

每用户同时仅允许一个活动扫描。取消后，不再提交后续扫描结果；已经发出的少量公开行情请求可能先结束，然后清理该任务分片。成功结果由快照指针切换发布，失败或取消不覆盖旧结果。任务心跳长时间失联会释放扫描锁并提示重新扫描。

准备阶段会立即进入运行状态，并持续记录尝试次数、正在读取的来源及股票清单校验进度；总数确定前的 `0 / 0` 不表示已经逐股扫描。失败时保留经脱敏的具体阶段和原因，同时将 Workflow 标记为失败；页面撤下提交成功提示并提供「重试本次扫描」。快速预筛有效但没有候选时，保存真实的空结果并正常完成，区别于行情获取失败。

排查扫描失败时，先看本用户任务日志，再用 `vercel logs --environment production --no-branch --since 1h --level error --expand` 和 Workflow inspect 查找 `prepare_failed` / `symbol_failed`。仅检查公开报价接口成功不足以证明扫描成功：必须验证清单获取、准备步骤、全部分片和最终快照落库。

自动扫描**默认关闭**。用户开启后按北京时间工作日指定时刻运行，默认 `11:30`、`15:00`。当前仅排除周六和周日，**没有识别法定节假日或交易所休市日**。关闭或修改设置会撤销旧调度 generation；时段去重、任务互斥和创建在原子状态更新内完成。调度异常终止会回写关闭状态和错误提示。已开始的扫描需使用「停止」单独取消。

Telegram Bot Token 使用项目现有交易密钥加密工具在服务端加密保存，接口不返回原文；客户端仅显示是否配置。请确保生产环境现有密钥加密服务配置正确，不在源码、日志或测试中写入 Token。测试通知必须由用户主动点击；扫描通知须显式开启。通知在发送前认领，无法确认发送结果时不自动重复发送，避免 Telegram 缺少幂等键造成重复消息。

## 安全本地开发与验证

不要为单独检查本看板运行 `npm run dev` 或 `npm start`：本项目这些脚本还会启动交易相关引擎。仅启动 Next 页面服务：

```powershell
node node_modules/next/dist/bin/next dev --hostname localhost --port 3108
```

随后访问 `http://localhost:3108/box-breakout`。如有端口冲突，换一个空闲端口，不终止不属于本次测试的服务。

本地没有可用 `DATABASE_URL` 时，可以验证访客 UI 和公开报价/图表读取；个人设置、扫描和持久任务需要可用数据库、项目认证及 Workflow 运行环境。不可通过移除鉴权或伪造生产用户来完成验证。

```powershell
node --test tests/box-breakout-engine.test.js tests/box-breakout-backend.test.js tests/box-breakout-ui.test.js
npm run typecheck
npm test
```

验证证据应区分：纯规则及 mocked 后端单测、真实公开行情读取、浏览器展示/交互、真实持久任务完整运行。前三者通过不等于所有生产全市场扫描、跨日定时或真实 Telegram 推送已完成端到端验证；生产验证须在授权账号下显式执行，并保留任务状态和日志。不要为验收擅自开启持续调度或通知。

## 后续定制入口

- 修改箱体、倍量、控盘阈值或评分：`engine.ts` 的 `BOX_RULES`、`computeBox()`、`computeVolume()`、`computeControl()`、`scoreConditions()`；同步更新策略说明、此文档和 engine 测试。
- 修改主题匹配：`engine.ts` 的 `matchThemes()`；热门板块筛选、数量与排除词在 `market.ts` 的 `fetchTopics()`、`irrelevantTopic`；个人关注板块由设置面板保存。
- 增减数据源：`market.ts` 的 `fetchQuote()`、`fetchBars()`、`fetchUniverse()`、`fetchTopics()`、`flowsFor()`、`holderFor()`；保留超时、校验、来源和未知状态，不引入模拟回填。
- 修改扫描规模或缓存：`service.ts` 的 `MAX_PUBLIC_RESULTS`、`SCAN_CHUNK_SIZE`，以及 `market.ts` 的缓存时长；同时检查响应大小、上游限流和 Workflow 成本。
- 修改视觉风格、密度和断点：`box-breakout.module.css` 的 `--box-*` 变量及媒体查询；卡片内容在 `box-breakout-surface.tsx`，图表在 `box-breakout-chart.tsx`。
- 深色采用 AI 网格风格的深蓝底色；市场切换居中，窄屏独立成行。评分区提供分隔线，卡片边框流光只作用于机会卡片，支持减少动态效果，不影响导航栏与其他产品。
- 修改调度或通知：`schedule.ts`、`workflow.ts`、`service.ts`；保持按用户隔离、取消语义、故障可见性和通知防重。
