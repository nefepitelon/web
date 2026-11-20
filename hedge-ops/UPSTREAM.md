# 源码来源与本地融合

本目录将上游的两套完整引擎直接纳入 WeLink 源码。运行时不克隆 GitHub、不下载 ZIP、不通过远程网站执行策略。

- 上游仓库：<https://github.com/ZAIJIN88/Arcus-Entropy-Lighter->
- 导入日期：2026-10-24（Asia/Shanghai）
- 授权：MIT；两个引擎分别保留原始 `LICENSE` 和版权声明。
- 上游没有固定到 commit；以下原始归档文件的 SHA-256 唯一标识本次导入内容。

| 本地目录 | 上游版本 / 文件 | 原始归档 SHA-256 |
| --- | --- | --- |
| `engines/lighter` | [Lighter 1.5.1](https://raw.githubusercontent.com/ZAIJIN88/Arcus-Entropy-Lighter-/main/Parallax-Hedge-Arcus-Lighter-OpenSource-v1.5.1.zip) | `b0489b2d0ae6e7f4fa4e5a9127935f37acbd5607e5476e9db939f1a27dff446c` |
| `engines/entropy` | [Entropy 1.6.0](https://raw.githubusercontent.com/ZAIJIN88/Arcus-Entropy-Lighter-/main/Parallax-Hedge-Arcus-Entropy-OpenSource.zip) | `72f7ea94d19a7feb094ef9801b11306fb4ae05ff653cefc1d700b463b3ab39f7` |

## 导入范围

每套引擎包括全部 Python 模块、原生 HTML/CSS/JavaScript 面板、全部原版测试、`pyproject.toml`、MIT 授权、README、中文使用说明，以及原版独立启动脚本。没有导入账户密钥、用户 `.env`、SQLite 数据、日志、虚拟环境或缓存。

策略逻辑保留原版：资金费率、方向判断、订单簿、容量测算、任务轮换、随机金额/时间区间、Arcus Maker、两腿执行、部分成交处理、孤腿处置、强平走廊、成交账本与对账。

## 集成适配记录

1. 配置模板由 `.env.example` 改名为 `env.example`，并同步启动脚本、代码和说明中的模板引用，确保模板可被主项目跟踪。
2. 两套 `config.py` 的 `dotenv_values` 使用 `interpolate=False`；配置值不从父进程环境插值读取，以保证用户配置隔离。这不改变策略计算。
3. `run.py` 从本地 `engines/<engine>/src` 加载源码，向原版 `create_app(Settings)` 提供独立数据路径与端口，给 HTTP 端点增加内部 Bearer 认证；每套引擎运行在独立进程中。
4. 平台接入由外围网关和 Next.js 路由完成，原版策略模块与原版前端交互保持可独立阅读和修改。
5. 测试跨平台适配：每套 `tests/conftest.py` 在临时目录清理前关闭该目录内的测试 SQLite 连接，解决 Windows 无法删除打开文件的问题；`test_arcus_ws.py` 等待连接拒绝错误采用最多 5 秒轮询，替代固定 0.3 秒。保留全部原始业务断言，生产代码和策略不受影响。
6. `run.py` 新增内部只读 `/api/runtime-safety`，报告引擎执行锁状态，供网关停机前检查；不改变执行循环，也不向浏览器开放此路由。
7. 两套 `api.py` 将现有的 `spreads` 与 `reconciler` 暴露到 `app.state`，供云端适配器执行有限的一轮扫描与对账。云端由 Vercel Workflow 调度原版 `engine.run_cycle`，等待挂单/对冲任务完成，并将原 SQLite 检查点加密存入 PostgreSQL；不在函数内启动无限后台循环。
8. `local.py`、`local.html`、`bootstrap.ps1` 提供本机图形配置与一键安装入口；安装包只包含明确列出的本地源码，不携带账户数据、密钥或虚拟环境。
9. 平台配置校验按 Lighter 官方 ECgFp5 编码接收 80 位十六进制 API 私钥；新增 `network.py`，统一本地和云端的只读网络诊断，区分错误类型、限制重试与超时。RHC 始终使用官方 Robinhood Chain 实例，不回退到 Lighter Core。上述改动不改变策略或订单执行。
10. 新增平台自研 `binance_lighter`，独立实现 Binance USD-M × Lighter Core 的适配器、任务状态机和订单意图账本；复用本地/云端外围设施，与两套导入引擎分离。实现梳理及验证边界见 `docs/hedge-ops-trading-logic.md`。
11. Binance 控制台复用 Entropy 面板的 MIT 授权 HTML/CSS 结构与视觉样式，保留原始 LICENSE；数据投影与交互脚本为本地实现。新增独立账户读取、精确权限诊断、持仓与成交统计、区间任务编辑及 CSV 导出；不把 Arcus Maker 控制映射为 Binance 下单方式。

以后升级时，应在单独分支比较上述归档版本和新版本，保留本地适配、原始授权和全部回归测试，不要在运行时拉取上游覆盖代码。

- 1.2.0：新增三引擎持久化停撤平锁定与旧版运行兼容，普通停止支持核验从未交易的 Binance 空实例；页签运行标记及 Binance 费率排名显示与原界面对齐。vendored engine/API 变更仅增加 emergency_stop 锁定保护，MIT 许可证保留。
- 1.3.0：Binance V3 余额与 accountConfig 交易权限分开读取，使用测试订单核实 Key；接入官方账户杠杆档位、Lighter 保证金参数及双所盘口价差排序。任务新增双所杠杆和 Binance GTX 挂单 / 双腿 IOC 选项；挂单终态成交后对冲，撤单和未知结果继续沿用持久化订单账本，不调用 Arcus Maker。
