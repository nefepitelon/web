# WelinkBTC 量化交易集原生运行网关

此目录是系统内量化工作台的持久运行层：原生引擎在独立 Linux Docker 主机执行，
Next.js 负责登录、授权、配置、审计和界面。它不会把模拟结果标记为实盘，也不会仅打开第三方网站。
本次代码交付没有创建交易所订单，所有安装模板默认禁用。

## 已接入的执行路径

| 引擎与锁定版本 | 本地集成代码 | 当前操作边界 |
| --- | --- | --- |
| Freqtrade 2026.8 | 官方镜像、Python 命令驱动、原创 EMA 策略、真实历史行情下载、回测与 Hyperopt | `trade` Dry-run/实盘、回测、参数优化；风险参数直接写入原生配置 |
| NautilusTrader 1.231.0 | 固定 SDK 的 BacktestNode / TradingNode、Binance 数据客户端、Sandbox 或 Binance 执行客户端 | Parquet 回测、paper、经审核的实盘策略；示例策略禁止进入实盘 |
| Hummingbot 2.16.0 / API 1.0.1 | 原生 API 的机器人启停、撤单、异步控制器回测 | 需部署 API + PostgreSQL + EMQX 及独立机器人；控制器本身必须支持回测 |
| LEAN 镜像 18057 | 官方 .NET Launcher、Python 算法、真实订阅与原生止损订单 | 原生回测、PaperBrokerage、经审核 brokerage 实盘配置；附带基线仅支持 Binance 现货 USDT |
| Jesse 3.1.1 | MIT 核心 `jesse.research.backtest`、原创策略、连续真实 1m 数据校验 | 研究回测；商业 live/paper 插件未集成，不宣称具有该权限 |
| OctoBot 2.1.1 | 原生 CLI、持久 user/tentacles、模拟、实盘、回测、策略优化器 | 需先安装/审核原生 profile、策略模块和数据；未编写自动篡改不同 tentacle 风控字段的逻辑 |

`ready` 仅表示已连接的运行主机/原生服务，`running` 表示容器或原生机器人正在运行，
都不表示成交成功或盈利。没有原生部署时返回 `unconfigured`，不可用时返回 `offline`。
每项动作只有经过管理员原生验证并加入 `verifiedActions` 后才会暴露为能力。

## 安装运行主机

需要 Linux、Node.js 22+、Docker Engine、持久磁盘、可靠时钟、交易所网络访问、
TLS 反向代理。Vercel/Next.js 的函数进程不能承载持续交易机器人。

1. 将仓库部署至 `/opt/welinkbtc`，创建专用系统账户 `welink-quant`，允许其调用 Docker；
   创建归该账户所有的 `/srv/welink-quant`。Docker 权限属于高权限服务边界，只向 Next.js 服务端开放网关。
2. 创建 Docker 网络 `docker network create welink-quant`，安装镜像：

   ```sh
   docker pull freqtradeorg/freqtrade:2026.8
   docker pull hummingbot/hummingbot:version-2.16.0
   docker pull quantconnect/lean:18057
   docker pull drakkarsoftware/octobot:2.1.1
   docker build -t welink/nautilus:1.231.0 quant-runtime/recipes/nautilus
   docker build -t welink/jesse:3.1.1 quant-runtime/recipes/jesse
   ```

   首次安装后记录各镜像实际 digest，并将 `deployment.json.image` 改为 `image@sha256:...`。
   Python 基础镜像及顶层 SDK 固定版本，完整传递依赖以构建出的 OCI digest 为准；
   重新构建必须重新原生验证。不要使用 `latest`/`stable`/nightly/RC/beta 标签。
3. 在 `/etc/welink-quant/runtime.env` 写入 `deploy/runtime.env.example` 所示环境变量，
   生成至少 32 字符的随机 token。用 `deploy/welink-quant.service` 安装 systemd 服务。
   初始 `QUANT_ALLOW_LIVE=false`。公网入口使用 TLS，禁止记录 Authorization 请求头。
4. 网站服务端配置同一 `QUANT_GATEWAY_TOKEN` 和 `QUANT_GATEWAY_URL`。
   网关不会接收浏览器 cookie，也不会直接向浏览器暴露交易所凭据。

## 配置一个账户与引擎

从本系统导出保存的非敏感策略配置到 `saved-config.json`，以运行服务账户执行：

```sh
node quant-runtime/bin/init-profile.mjs --user-id DATABASE_USER_ID --engine freqtrade --config saved-config.json
```

该命令只生成禁用模板。用户路径为 `tenants/<SHA256(userId) 前32位>/<engine>/`：

```text
deployment.json        管理员维护的安装与验证信息
project/               只读原生配置、策略及行情，禁止由 HTTP 写入
  engine.env           可选：服务器专用 API 环境变量，权限600
state/trading/         持久交易状态
state/jobs/.../        按 requestId 隔离的研究输入与结果
ledger/                持久请求去重与恢复记录
audit.ndjson           不含凭据的操作审计
```

补齐原生配置和数据，实际验证各动作，再设置 `enabled:true`、`verifiedActions` 和对应
`paperVerified` 等字段。`approvedConfigHash` 绑定模式、交易所、策略、交易对、周期、单笔金额、
最大持仓数及止损；修改任何执行参数都需重新核对原生配置。名称及回测日期不参与该 hash。
Freqtrade、附带 Jesse/LEAN 策略直接使用请求风险参数；Nautilus 配置包装器再次核对全部字段；
Hummingbot/OctoBot 的策略参数体系不同，需要管理员验证原生控制器/策略与该 hash 一致，
不可仅为消除界面阻塞而开启验证标记。

容器以网关系统 UID/GID 运行。原生文件应允许该账户读取，输出目录由该账户拥有，
不需要把敏感文件改成777。Docker CLI 使用参数数组，HTTP 不接受脚本、容器名、路径、镜像或命令。

原生文件约定：

- Freqtrade：`project/config.json`、`project/strategies/`。附带可运行模板，真实下载再回测。
- Nautilus：`project/paper.json`、`project/live.json`、`project/backtest.json`、Parquet catalog。
  详见 `recipes/nautilus/README.md`。实盘凭据写入 `project/engine.env` 的
  `BINANCE_API_KEY` / `BINANCE_API_SECRET` 并在 deployment 设置 `envFile:true`。
- Hummingbot：`deployment.api` 及 `project/api-auth.json`；见对应 recipe README。
- LEAN：`project/{paper,live,backtest}.json`、`algorithm.py`、`data/`。回测示例不包含行情；
  导入有权使用的 LEAN 数据格式。paper 必须显式配置 `PaperBrokerage` 和真实行情服务。
- Jesse：`project/backtest.json`、`strategies/`、`candles.json`。蜡烛采用官方 Jesse 顺序
  `[timestamp_ms, open, close, high, low, volume]`，key 为 `exchange-symbol`。
- OctoBot：`project/user/`、`tentacles/`、`backtesting/*.data` 和 `backtest-window.json`。
  回测窗口文件必须与本系统起止日期一致；初次启动复制原生 user/tentacles 到持久 state。
  升级原生策略文件后应在停机对账后重新部署持久副本，避免覆盖已有交易记录。

实盘要求 `QUANT_ALLOW_LIVE=true`、`liveVerified`、`accountConfigured`、
`withdrawalsDisabled`、`ipAllowlistVerified` 全部为 true，并有实际服务器专用凭据。
这些设置只提供启动能力，不会自动提交启动请求。Jesse 商业插件许可和托管使用权不能由标记替代。

## HTTP 合约

所有接口必须携带 `Authorization: Bearer <QUANT_GATEWAY_TOKEN>`，响应不缓存。
`GET /health` 检查网关与 Docker 连接。`POST /v1/command`：

```json
{
  "userId": "database-user-id",
  "engine": "freqtrade",
  "action": "preflight",
  "targetAction": "backtest",
  "config": {
    "name": "BTC 趋势", "mode": "paper", "exchange": "binance",
    "symbols": ["BTC/USDT"], "timeframe": "1h", "strategy": "ema-trend",
    "stakeAmount": 50, "maxOpenTrades": 2, "stopLossPct": 3,
    "startDate": "2026-06-01", "endDate": "2026-09-01"
  }
}
```

动作：`status|preflight|start|stop|backtest|optimize`。`targetAction` 仅用于 preflight，
默认 start。变更动作需要唯一的8–100位 `requestId`，字符限字母、数字、下划线、连字符。
同时需要由 Next.js 数据库原子递增生成的正整数 `controlSequence`。网关持久保存最大序号，
拒绝较旧指令，防止延迟到达的 start 在更新的 stop 之后启动交易。原请求重放使用原序号。
status 与 stop 可以省略 config。回测/优化需要明确起止日期；结束日期按上游约定处理，
Jesse/LEAN 为不包含结束日。研究不会因为保存配置选择 live 而执行实盘交易。

同一账户/引擎有文件锁及持久 ledger，同 requestId+同内容只返回已保存结果；
同 ID 不同内容被拒绝。不同 ID 也不能并行启动同一引擎。HTTP 超时后先查询 status、
重读原 requestId，不要创建新请求。Hummingbot 异步任务由原生 task ID 追踪。
结果中 `runtime.job` 表示实际任务进度，`runtime.metrics` 只投影有限数值。

停止无需当前配置 hash 匹配或实盘开关开启；停止可能需要75秒。引擎停止不代表平仓。
网关崩溃不会自动停止独立容器；Docker 未配置自动恢复交易，以避免意外重启实盘。

## 故障恢复与验证

运行 `npm --prefix quant-runtime test`。测试使用假的 Docker 边界验证身份隔离、风控、
幂等与恢复，不会连接交易所。Nautilus 附带 SDK 配置/研究验证；其他完整镜像运行、
brokerage 连接及真实账户交易需要目标 Linux 主机验收，当前环境未完成这些生产验收。

`mutation.lock` 残留、ledger pending 或 `reconciliation-required.json` 表示操作结果未确认。
先检查带 `welink.quant.*` 标签的容器、原生任务和交易所订单，确认现存操作状态，再由管理员
记录恢复审计并解除相应锁；不要删除 ledger 以重放交易请求。保留交易数据库、成交记录和审计备份。
原始引擎日志仅供运行管理员读取，因为上游可能记录交易账户信息。

## 上游来源与许可证

- Freqtrade（GPL-3.0）：https://github.com/freqtrade/freqtrade/releases/tag/2026.8
- NautilusTrader（LGPL-3.0）：https://github.com/nautechsystems/nautilus_trader/releases/tag/v1.231.0
- Hummingbot（Apache-2.0）：https://hummingbot.org/hummingbot-api/routers/
- LEAN（Apache-2.0）：https://github.com/QuantConnect/Lean ；CLI/云与数据提供商有独立使用条款。
- Jesse（MIT 核心）：https://docs.jesse.trade/docs/research/backtest.html ；商业实时插件未包含。
- OctoBot（GPL-3.0-or-later）：https://github.com/Drakkar-Software/OctoBot/tree/2.1.1

本目录是原创集成层，不复制完整上游源码。镜像和 SDK 保留其各自许可证；如分发修改后的
上游二进制或源码，需履行相应的许可证与源码提供义务。

## Supabase 持久调度与本地执行器

网站/Vercel 设置 `QUANT_DISPATCH_MODE=supabase`，使用现有服务端 Prisma
`DATABASE_URL`/`DIRECT_URL` 连接 Supabase PostgreSQL，并应用仓库迁移。生产
`NEXT_PUBLIC_APP_URL` 必须是可信 HTTPS 应用地址。数据库保存设备、指令、不可变配置快照、
控制序号、租约、执行结果与心跳；原生 Python/Rust/.NET 引擎仍运行在用户电脑或持久 Linux 主机。
没有配对设备时，页面如实显示引擎离线，启动指令不会排队等待未来自动触发。

推荐在 `/quant-suite/devices` 用已验证的 Max/管理员账户配对。每个用户的每个引擎只能
分配给一台有效设备；生成的 JSON 配对信息包含可信站点地址、设备 ID、用户 ID 和随机
32 字节令牌，仅显示一次。数据库仅保存令牌的 SHA-256，网页不将令牌写入 localStorage。
复制到 Windows 本地控制台后隐藏配对信息。Windows 启动器将本机状态目录设为当前用户与
SYSTEM 可访问；交易所凭据在本机配置，不随源码包分发。

Linux 可使用 `deploy/pull-worker.env.example`，安全写入服务器私有环境文件后运行
`node --env-file=/private/worker.env quant-runtime/bin/pull-worker.mjs`。
Windows 用户使用网站提供的 `启动量化交易集.bat` 和本地控制台；引擎容器需要
Docker Desktop 的 Linux 容器模式。本地工作器通过 HTTPS 主动轮询，不需要公网开放本机 API。
显式管理员服务器绑定也兼容 `QUANT_WORKER_TOKENS_JSON`：
`[{"id":"worker-name","token":"a-long-private-token","userIds":["user-uuid"],"engines":["freqtrade"]}]`。
此变量只在网站服务器设置，不可与设备配对重叠绑定，也不允许任意首台执行器接收其他账户任务。

工作器协议为 `/api/quant-suite/worker/{claim,begin,heartbeat,complete}`，统一需要 Bearer
令牌与 `X-Quant-Worker-Id`。领取指令不代表获准执行；执行前必须获得 `begin` 确认，核对
配置哈希、锁定版本、当前 revision/controlSequence 与本机原生预检。开始期限为 30 秒，
其他指令期限 10 分钟；执行租约 120 秒，心跳每 10 秒，网站 45 秒无心跳显示离线。
已开始且失联的任务进入 UNKNOWN，保留操作锁，绝不重新分发或自动执行一次。
本地持久 `inflight.json` 仅用于补交结果，重启后不重放交易动作。旧结果不会释放更新的停止指令锁。

设备令牌可以在网站撤销。撤销禁止后续领取、执行许可及结果上报，取消未开始的指令，
已发出执行许可的指令保留未知状态；它不能保证断网设备上的原生进程已停止。
应先使用站内停止并确认原生进程/订单，或在原设备核对停止，再撤销和重新配对。
没有设备时提交的研究指令可在有效期内被后来明确配对的设备领取；启动从不采用这个行为。

配对不启用实盘。本机 `QUANT_WORKER_ALLOW_LIVE` 与 `QUANT_ALLOW_LIVE` 默认 false；
实盘仍要求网站管理员已完成 2FA、明确输入引擎实盘确认，以及本机实际账户/策略配置通过原生审核。
Jesse 商业实时插件、数据授权和交易账户权限仍由用户自行提供；系统不伪造这些条件。
运行 `node --test tests/quant_dispatch.test.js tests/quant_suite.test.js` 验证队列与配对边界，
`npm --prefix quant-runtime test` 验证本机网关和工作器恢复流程；这些测试不连接实盘账户。

本地停止先在账户/引擎目录写入 `local-halt.json`，再断开工作器并停止原生服务。
网关在重启后仍拒绝 start/backtest/optimize，只允许状态和停止操作；安装不能清除此标记。
恢复须由用户明确重新验证当前配置，并在核对交易进程、挂单及云端未确认记录后解除，
防止停止后重连收到较早排队的指令而自行恢复交易。

### 本机研究验证与恢复

安装后的 `enabled:false` 表示尚未得到原生运行证据。本地控制台的“验证研究”调用
`lib/verify-engine.mjs`，要求网站已保存 PAPER 配置与回测日期；它检查固定镜像、
Linux Docker 网络、完整文件、基线策略源码摘要，并真正运行隔离的原生历史回测。
只有容器成功退出且产生有效结果，才写入 `verifiedActions: [backtest, stop]`。
该过程不启动交易机器人、不注入引擎凭据环境，也不授予 paper/live/optimize 能力。

- Freqtrade：本项目 WelinkTrend 现货基线，按选择的交易所与日期下载真实历史行情。
  原版 FreqUI 安装运行的是 `webserver`，不能把它当成已运行的交易机器人。
- Jesse：本项目 WelinkTrend 基线，需要 `project/candles.json` 包含原生格式的连续
  1 分钟历史数据；验证时先从实际容器读取 3.1.1 SDK 版本，再调用 MIT 核心回测。
- LEAN：本项目 WelinkTrend 基线，需要 `project/data` 的原生格式数据和参考文件；
  仅批准 Binance 现货 USDT、内置回测处理器与本地数据提供器，并核实实际市场事件数。
- Nautilus、Hummingbot、OctoBot：原版界面/SDK 可独立使用；示例策略的资金风险映射、
  控制器或 tentacles 与本站字段仍需逐项审阅，自动验证器会报告具体缺口，不开放云端执行。

验证结果保存在该账户引擎的 `verification/<id>/evidence.json`，包含实际镜像内容摘要、
配置/源码摘要、回测窗口和有限统计指标。网关每次执行与状态检查都会重新核对镜像、源码、
配置；在原版界面修改相关文件后必须重新验证。用户提供的数据不被替换为演示行情。
失败、超时或没有数据不会开放能力；验证容器及其日志留在本机供检查。

“恢复”必须明确输入 `RESUME engine`。它先断开网站工作器，在实际研究验证成功后
解除本地停止锁，再恢复已有的 PAPER 原版界面服务；不会自动重连网站，也不启用交易。
若网站保留 UNKNOWN 记录，应在核对原生进程后重新连接并提交停止，取得明确结果再继续。
如果仅需重新打开原版界面继续配置/导入数据，可选择“仅恢复原版界面”并输入
`RESUME UI engine`。此入口不要求研究验证成功，但保留本地停止锁和断开的工作器，
不会批准任何云端执行能力；恢复流程仍须核对原版服务保存的实际模拟模式。
