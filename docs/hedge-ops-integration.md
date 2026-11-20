# 套利对冲Ops 集成与运行

当前发布 1.5.0 共八套控制台，新增 Ondoperps <> Entropy 和 Ondoperps <> Ondoperps。左侧入口保留各自运行状态和已访问页面，环境、任务、账本与进程分别隔离。运行方式页提供 `一键启动文件(1.5.0).bat`；下载包包含完整适配器与 UI，SHA-256 由 manifest 校验。新两组配置、同所账户边界和小时资金费口径见 [交易逻辑梳理](hedge-ops-trading-logic.md)。已有交易引擎继续运行时，界面管理服务升级不得停止或重启它们。

入口 `/hedge-ops`，导航紧随「AI网格」。两套完整引擎源码和原控制台均纳入本仓库，运行时不拉取 GitHub。版本、归档校验和与适配记录见 `hedge-ops/UPSTREAM.md`。

另有第三套自研 **Binance USD-M <> Lighter Core**，独立配置、任务、订单账本、本地与 Vercel Worker 均已接入。前两套与第三套的交易控制、验收边界及官方接口依据见 [交易逻辑梳理](hedge-ops-trading-logic.md)。

## 本地服务模式

在平台选择「本地服务」，下载并双击 `启动套利对冲Ops.bat`。脚本从正式平台下载本项目生成的源码包、核对 SHA-256，安装至 `%LOCALAPPDATA%\welinkBTC\Hedge-Ops`。首次自动寻找 Python 3.11/3.12；缺少时下载并验证官方 Python 安装程序签名，为当前用户安装。随后建立独立虚拟环境并安装依赖，启动 `http://127.0.0.1:8011/`。

在本机控制台「环境与 IP 设置」填写账户、专用 API 交易密钥、代理及风控参数，点击「保存到本机」。配置和 SQLite 保存在安装目录的 `data`，升级源码不会覆盖这些数据。密钥字段读取时隐藏，留空保留，勾选清除才删除。只填写 API 交易密钥，不填写助记词或主钱包私钥。

RHC Lighter 的 `LIGHTER_API_PRIVATE_KEY` 是 **40 字节 / 80 位十六进制**，可带 `0x` 前缀；不能套用 Entropy 的 64 位 EVM API 钱包私钥校验。依据为 [Lighter 官方密钥生成实现](https://github.com/elliottech/lighter-go/blob/main/client/client.go)和 [ECgFp5 40 字节编码](https://github.com/elliottech/poseidon_crypto/blob/main/curve/ecgfp5/scalar_field.go)。应复制 Robinhood Chain Lighter API Keys 页的 Private Key，账户编号和 Key 编号也须来自同一实例。

本地「检测当前填写的网络配置」可先检测尚未保存的代理，不提交密钥、不保存配置、不启动引擎。空白的隐藏代理保留已保存值，勾选清除可检测移除代理后的路径。结果显示官方目标地址、直连/共用/独立代理来源，并区分 DNS、超时、TLS、代理认证、HTTP 拒绝和限流。连接/读取超时分别为 15/30 秒，传输异常最多重试一次，整体不超过 35 秒。检测通过后再点击「保存到本机」。

RHC 的目标固定为 `https://api.rh.lighter.xyz`，不会因连接失败切换到 Lighter Core；两者账户与市场不同。若仅 RHC 直连持续超时，须在 `LIGHTER_PROXY` 填写可访问该接口的网络代理（或设置共用代理），核对协议、认证并重新检测。真实出口不可达不能靠更改密钥或隐藏报错解决。

本机服务仅监听回环地址；写操作校验 Origin 与随机 CSRF。线上页面首次访问本地服务可能需要浏览器允许本地网络访问，也可直接打开本机控制台。浏览器关闭不等于停止引擎，应先停用任务并等待平仓，再使用「停止」。

开发者可运行 `npm run hedge:local`；旧的常驻网关命令 `hedge:setup`、`hedge:start` 继续保留。

## 服务器模式

默认使用现有 Vercel 项目，配置界面不再要求用户部署外部常驻服务器。账户环境、原 SQLite 检查点与行情视图在 PostgreSQL 中按用户和引擎隔离；凭据与检查点使用现有 `TRADING_CREDENTIALS_ENCRYPTION_KEY` 加密。部署必须已有数据库连接和该加密配置，生产构建会执行 Prisma migration。

Vercel Workflow 调度有限周期的 Python Function，调用原版行情、执行与对账逻辑；每次 SQLite commit 同步加密检查点，等待挂单/补单任务完成后结束函数。Workflow 每 300 轮续接，避免无限增长。Worker 只接受短时 HMAC 签名，并原子领取数据库操作标识，拒绝重复执行。同一账户同一引擎的配置、任务和周期操作互斥。

正式 Worker 通过平台现有公开自定义域名调用，保留现有部署访问控制，不创建部署保护绕过密钥。`GET /api/hedge_lighter` 和 `/api/hedge_entropy` 只返回服务、依赖与数据库就绪状态；不返回用户配置。所有平台配置和交易接口仍需登录及会员权限。

服务器代理支持公网 HTTP/HTTPS，执行时验证 DNS 结果，拒绝内网目标。Maker 单次等待上限 120 秒，函数最长 300 秒。失去实盘周期响应时保留操作标识、暂停并要求人工核对，避免盲目重试真实订单。累计 SQLite 检查点有容量上限，应定期归档账本。

若显式配置 `HEDGE_OPS_SERVICE_URL`，仍可连接旧的常驻网关；该路径须同时配置至少 32 字符的 `HEDGE_OPS_SERVICE_TOKEN`。这是兼容选项，并非默认服务器模式的前置条件。

## 使用与验证

两种模式都默认 `DRY_RUN=true`，无交易凭据也可读取公开行情。切换模式或 Lighter/Entropy 只切换显示，不会停止另一套引擎。修改配置前必须停止引擎；停止前须停用任务且确认空仓。服务器实盘仍要求管理员、双重验证及明确授权，先执行原控制台「实盘预检」。

主要代码：`hedge-ops/engines` 为原策略源码；`cloud_worker.py` 为有限周期及持久化适配；`local.py`/`local.html` 为本机服务及配置页；`lib/hedge-ops` 为平台权限、加密配置、Workflow 与服务接口；`components/hedge-ops-*` 为模式和配置界面。

验证命令：

```powershell
npm run typecheck
node --test tests/hedge_ops.test.js tests/grid_ops_hosted.test.js tests/grid_ops_integration.test.js
npm run hedge:test
node node_modules/next/dist/bin/next build --webpack
```

已验证原引擎 702 项、网关及本地/云端适配 55 项、Node 回归 26 项；1 项 Windows 符号链接权限测试跳过。生产构建通过。两套本机引擎均经真实 HTTP 验证配置、启动、原控制台、状态读取和安全停止。云端 SQLite 恢复测试调用真实原始 API，行情使用测试数据。以上均无用户密钥、无真实下单；实盘验证需用户交易所账户。
