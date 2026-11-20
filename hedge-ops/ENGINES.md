# 本地引擎开发说明

两套源码分别位于 `engines/lighter`（Arcus × RHC Lighter）和 `engines/entropy`（Arcus × Entropy）。它们都使用 `parallax_hedge` Python 包名，因此必须通过不同进程加载；不要将两套源码同时以 editable package 安装到同一 Python 环境。

## 环境和启动

使用 Python 3.11 或 3.12；本次集成使用 Windows x64 / Python 3.12.14 验证。项目级依赖安装与网关启动入口是根目录的 `npm run hedge:setup` 和 `npm run hedge:start`。虚拟环境位于 `hedge-ops/.venv`，依赖版本固定在 `constraints.txt`。网关通过如下命令启动单个引擎：

```text
python hedge-ops/run.py --engine lighter --host 127.0.0.1 --port 18101 --data-dir <该用户该引擎的绝对数据路径>
```

Entropy 对应 `--engine entropy` 和另一端口。调用进程必须提供随机的 `HEDGE_OPS_INTERNAL_TOKEN`，然后在引擎请求中设置 `Authorization: Bearer <token>`。此 token 只在服务端内部传递。

`run.py` 仅从指定数据目录的 `.env` 读取配置，在同目录创建 `hedge.db`。不读取项目根 `.env`、不读取另一用户配置、不打开浏览器。未配置账户时默认 `DRY_RUN=true`；行情仍使用真实公共市场接口，缺失或失败时由原引擎报告错误，不制造行情数据。

仅部署层包装发生变化；引擎循环、风控、订单执行和原版 UI 均来自本地源码。API 凭据配置与交易模式切换经平台的已登录用户隔离网关处理。

## 原版 HTTP API

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/status` | 版本、代理脱敏标签、实际生效配置 |
| GET | `/api/funding` | 资金费率、方向、账户余额与持仓；`refresh=true` 强制刷新 |
| GET / POST | `/api/tasks` | 读取 / 保存任务、杠杆、金额和轮换区间、限价/市价 |
| DELETE | `/api/tasks/{asset}` | 删除任务；原版业务检查仍生效 |
| POST | `/api/preflight` | 原版实盘预检 |
| POST | `/api/cycle` | 立即执行一轮 |
| GET | `/api/spreads` | 两所价差扫描 |
| GET | `/api/capacity` | 资金和容量测算 |
| GET | `/api/stats` | 账户余额、成交量、费用和已实现盈亏 |
| GET | `/api/cycles` | 最近执行日志 |
| GET | `/`、`/static/*` | 原版完整面板及资源 |

`/api/status` 没有持仓；持仓在 `/api/funding` 的 `rows[].position`。任务开关和执行中状态在 `/api/tasks` 的 `tasks`、`busy`、`unmanaged`。资金费率刷新失败时 `ready=false` 或各 venue 状态反映失败，不应将错误当成空仓。

## 回归测试

使用 `npm run hedge:test` 分别运行两套原版测试，以及网关隔离测试。原版测试使用模拟交易所响应和本地 WebSocket 假服务器；不需要真实 API 密钥，不发送实盘订单。运行测试不要加载个人实盘 `.env`。由于包名相同，两个测试套件应以独立 Python 进程执行。

测试适配只处理 Windows 的资源释放与网络错误等待：临时目录删除前关闭测试 SQLite，WebSocket 连接拒绝用有上限的轮询等待。原版测试的业务断言保持不变。生产代码继续使用上游事件处理方式，目前 FastAPI 对 `on_event` 给出弃用提示；升级到 lifespan 应另开变更并回归验证。

2026-10-24 的导入回归结果：Lighter 347 项通过，Entropy 355 项通过，`pip check` 无依赖冲突。测试环境为 Windows x64 / Python 3.12.14，使用 `constraints.txt` 中的依赖版本；没有配置真实账户，也没有发送实盘订单。

引擎原始细节可查阅各目录中的 `README.md` 和 `使用说明.md`。导入版本、授权和适配范围记录在 `UPSTREAM.md`。
