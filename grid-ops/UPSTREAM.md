# 上游来源

本模块基于以下公开参考项目接入并保留原有功能结构：

- 仓库：https://github.com/ZAIJIN88/3xx-wangge
- 原项目名称：三交易所整合网格交易机器人
- 原支持交易所：Decibel、Extended、RISEx

在保留上游三所能力的基础上，本项目已内置 Binance USDⓈ-M Futures、Ondo Perps、Phoenix（Solana）、Nado（Ink L2）、OKX 永续、GRVT 永续与 RHC Lighter 适配器，并把交易所元数据、环境字段、代理、仪表盘与服务端路由重构为可扩展注册表；运行时仍不会读取或执行原 GitHub 仓库代码。

## 当前交付方式

- 上游代码已经完整展开并保存在本项目的 `grid-ops/` 目录，不在运行时读取或执行 GitHub 代码。
- 生产站点随部署发布自有的 `ai-grid-ops-engine.zip`，一键启动器只从 welinkBTC 正式域名下载该受控副本。
- 用户无需访问 GitHub、克隆仓库或手动下载源码；启动器会自动安装本地引擎。
- 交易引擎仍必须在用户电脑运行，才能保证交易所密钥、签名私钥和运行状态不上传到服务器。
