# 量化交易集：Windows 本机引擎与云端调度

网站入口为「产品 → 量化交易集」，设备入口为 `/quant-suite/devices`。
下载 `启动量化交易集.bat` 后双击，启动器会校验源码包、准备 Node.js，并打开
`http://127.0.0.1:8790` 本机控制台。原生 Python / Rust / .NET 进程由本机
Docker Desktop 的 Linux 容器运行；Vercel 提供网站，已连接的 Supabase PostgreSQL
保存设备、任务、心跳与审计。无需公网 IP、端口映射或让 Supabase 常驻运行 Python。

## 使用步骤

1. 安装并启动 Windows 64 位 Docker Desktop，启用 WSL 2 和 Linux 容器。
   从网站下载 `.bat` 并运行。已有 Node.js 22 以上可直接使用；否则启动器下载并校验
   官方便携版 Node.js 24.18.0，不改写系统 Node.js。
2. 用已验证的 Max 或管理员账户登录网站，在「连接与执行」保存对应引擎的模拟配置。
   然后在「本地交易执行器」生成配对信息，粘贴到本机控制台，点击「连接网站」。
   同一账户的每个引擎只能分配给一台有效设备。配对令牌在网页仅显示一次，数据库只保存哈希。
3. 本机控制台同步已保存的配置后，选择需要的引擎并安装。它会拉取固定镜像，创建独立
   目录与随机原生登录凭据。安装不会默认下载全部引擎，也不会开启实盘交易。
4. 点击「打开原版界面」使用项目自身的交互、配置与研究流程。本机凭据通过控制台的
   受保护入口查看，或读取本机 `native/credentials.json`。交易所密钥留在本机。
   网站也提供「载入本机原版界面」；浏览器拦截本地网络时，使用独立窗口打开。
5. 按每个引擎的原生要求补齐策略、行情与账户，完成实际验证后再使用站内执行动作。
   页面配置修改会使原有配置审核失效。配对、安装成功或 HTTP 健康检查都不等于实盘验收。

## 六个项目的原版界面与执行边界

| 项目 | 原版界面 / 默认本机地址 | 本次提供的运行方式 |
| --- | --- | --- |
| Freqtrade 2026.8 | FreqUI，`http://127.0.0.1:8791` | 首次启动原生研究 Web 服务，默认 dry-run、stopped；交易模式需要原生配置及验证。 |
| NautilusTrader 1.231.0 | 开源项目使用 Python/Rust SDK | 安装 SDK 镜像、真实官方示例和本项目运行器。需提供 catalog、节点配置与交易适配器；商业 Pro Dashboard 未包含。 |
| Hummingbot 2.16.0 / API 1.0.1 | 原版 Streamlit Dashboard，`http://127.0.0.1:8793` | Dashboard、API、MQTT 与数据库。交易机器人仍需原版账户、控制器及 Docker 网络配置验证。 |
| QuantConnect LEAN 18057 | 开源项目使用 Python/C# 算法工程 | 安装锁定 LEAN 镜像和示例。需行情数据与 brokerage 配置；QuantConnect 云端 IDE 未包含。 |
| Jesse 3.1.1 | 原版 Nuxt Dashboard，`http://127.0.0.1:8795` | 原生研究后端、Redis、PostgreSQL。商业实时插件及许可证未包含，本站网关只集成 MIT 研究回测。 |
| OctoBot 2.1.1 | 原版 Flask / Socket.IO，`http://127.0.0.1:8796` | 首次启用原生模拟环境与 Web 界面，保留原版首次使用流程；数据、tentacles 与实盘账户需自行配置验证。 |

FreqUI 3.1.2 与 Jesse 3.1.1 的官方前端资产也托管在本站，保留来源、许可证、固定提交和
逐文件校验清单。本站 Jesse 前端可浏览，但尚未代理完整后端、WebSocket 或语言服务；
完整登录与交互使用本机原版服务。FreqUI 的站内 API 适配使用本站会话，原生凭据不会写入浏览器。
Nautilus 与 LEAN 工作区展示真实官方 SDK 示例，源码浏览不会执行策略。

## 配置、更新与停止

默认安装目录为 `%LOCALAPPDATA%\welinkBTC\Quant-Suite`。
`versions/<buildId>/quant-runtime` 保存版本代码，`state` 保存设备配对、各账户引擎配置、
数据库、任务记录与凭据。升级源码不会覆盖 `state`。启动器将状态目录的 Windows ACL
限定为当前用户和 SYSTEM。下载包只包含允许的源码目录，不包含用户交易配置或密钥。

关闭本机控制台窗口会断开云端调度；Docker 中已经运行的引擎可能继续工作。
「停止本机服务」先写持久停止锁，再断开工作器并停止原生服务，保留数据库和凭据。
停止锁跨重启有效，旧云端任务不能因此重新启动引擎。恢复需明确操作并重新核对配置。
停止进程不等于平仓；原有订单与持仓需在原版界面及交易所核对。

网站撤销设备授权可阻止后续领取任务，但不能让离线电脑上的进程立即停止。
应先停止并核对运行状态，再撤销或更换设备。UNKNOWN、遗留 mutation.lock 或
reconciliation-required.json 代表执行结果未确认，需要对账，不能删除记录后重放交易。

## 网站部署与任务协议

沿用 Vercel 项目 `welinkbtc-main`，生产设置 `QUANT_DISPATCH_MODE=supabase`。
使用既有服务端 Prisma 数据库连接；`NEXT_PUBLIC_APP_URL` 必须为受信任的 HTTPS 网站地址。
构建生成并验证原版前端和本机下载包、生成 Prisma 客户端、应用增量迁移、构建 Next.js。
从当前本地工作区执行 `vercel deploy --prod --yes --force`，覆盖生产别名。

新增表包括量化实例、指令、持久分发队列、工作器与设备；迁移启用 RLS 并撤销
`anon` / `authenticated` 的直接访问权限。设备仅能处理所属账户和授权引擎。
工作器通过 HTTPS 主动调用 `/api/quant-suite/worker/{claim,begin,heartbeat,complete}`，
领取后还需开始许可。不可变配置快照、版本、控制序号、租约与本地持久 ledger 共同阻止
跨账户执行、过期指令和重复执行。已经执行但失联的任务不会重新分发。

离线状态不能提交待上线自动启动的交易命令。实盘仍需网站账户权限与管理员 2FA、
明确的 `LIVE 引擎标识` 确认、本机当次会话实盘解锁、原生账户及策略审核。
这些条件不会因下载、配对或安装而被自动标记通过。

## 验证范围

自动检查覆盖网站权限、CSRF、设备隔离、任务租约、幂等恢复、本机停止锁、安装器和
本机 HTTP 控制台边界；浏览器检查覆盖原版前端资产、六个入口、移动布局及控制交互。
Windows 启动器使用本地源码包完成 InstallOnly 安装验证。
当前开发环境没有 Docker Desktop 及实盘凭据，未执行六套原生镜像的真实交易端到端验收，
没有提交订单。实际交易全流程仍需目标电脑、交易所账户、策略数据和所需商业许可完成验收。

更详细的原生文件及网关部署约定见 [运行器说明](../quant-runtime/README.md)。

## 上游依据

- [Freqtrade 2026.8](https://github.com/freqtrade/freqtrade/releases/tag/2026.8)、[FreqUI](https://github.com/freqtrade/frequi)：GPL-3.0。
- [NautilusTrader 1.231.0](https://github.com/nautechsystems/nautilus_trader/releases/tag/v1.231.0)：LGPL-3.0。
- [Hummingbot API](https://github.com/hummingbot/hummingbot-api)、[Dashboard](https://github.com/hummingbot/dashboard)：Apache-2.0。
- [LEAN](https://github.com/QuantConnect/Lean)：Apache-2.0。
- [Jesse](https://github.com/jesse-ai/jesse/tree/v3.1.1)、[商业服务条款](https://jesse.trade/terms-of-service)：MIT 核心；商业插件另行授权。
- [OctoBot 2.1.1](https://github.com/Drakkar-Software/OctoBot/tree/2.1.1)：GPL-3.0。
- [Supabase 托管函数限制](https://supabase.com/docs/guides/functions/limits)：本方案使用数据库调度，原生常驻进程放在本机。
