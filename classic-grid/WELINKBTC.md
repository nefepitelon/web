# WELINKBTC 集成说明

- 上游项目：https://github.com/beibei030/classic-grid
- 固定上游提交：`d36446bc46185853dd9ea551647bf9420ba07fcb`
- 导入日期：2026-08-15
- 运行方式：代码和依赖随 WELINKBTC 项目部署，由服务器端持久任务执行；浏览器不会从 GitHub 加载代码，也不要求用户下载本地引擎。

## 安全加固

导入前检查覆盖依赖漏洞、硬编码密钥、命令执行、控制台鉴权、跨站请求、请求体限制、HTML 注入、网络监听和 TypeScript 构建。集成版完成了以下修正：

1. 升级或覆盖存在已知漏洞的 `axios`、`ws`、`uuid`、`undici` 等依赖，并以纯 JavaScript 安全实现替代存在越界写风险的原生 `bigint-buffer`。
2. 原控制台默认从 `0.0.0.0` 改为 `127.0.0.1`；若显式远程监听，强制使用高强度 Bearer Token。
3. 所有控制接口增加同源校验、64KB 请求体限制、安全响应头和输出转义。
4. 修复上游缺失类型、Phoenix/N1 SDK 类型兼容和 PopDEX 交易参数问题，使类型检查通过。
5. WELINKBTC 云端只接受白名单配置项；可编辑的交易所、WebSocket 与 RPC 地址仍限定为对应官方域名，阻止利用自定义地址访问服务器内网。
6. 环境编辑器覆盖上游模板全部字段。“仅保存环境”使用浏览器生成的不可导出 AES-256-GCM 密钥，将配置加密保存在当前设备 IndexedDB，不调用服务器接口。启动任务时会先读取最新本地版本，再通过 HTTPS 提交本次运行副本；运行副本使用服务器 AES-256-GCM 加密且页面永不回显。
7. 原项目的 `*_KEYPAIR_PATH` / `*_KEY_PATH` 字段仅用于自行部署，WELINKBTC 云端不会尝试读取用户电脑路径；N1 云端实盘改用界面中的 `N1_KEYPAIR_JSON` 内容安全生成临时文件。
8. 每个用户的状态、账本和暂停标记隔离保存；持久任务单步不自动重试下单，降低网络不确定状态下的重复订单风险。

上游自身的 MIT License 保留在 `LICENSE`。本目录中的安全 bigint 兼容实现采用 Apache-2.0 License，见 `vendor/bigint-buffer-safe/LICENSE`。
