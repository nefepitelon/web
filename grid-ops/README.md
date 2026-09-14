# 多交易所整合网格交易机器人

一个跑在你自己电脑上的**永续合约网格交易机器人**，当前支持 **Decibel**（Aptos 链）、**Extended**（Starknet 链）、**RISEx**、**Binance USDⓈ-M Futures**、**Ondo Perps**、**Phoenix**（Solana 链）、**Nado**（Ink L2）、**OKX**、**GRVT**、**RHC Lighter** 与 **Arcus**。**Entropy** 当前仅提供基于 Hyperliquid 官方实时行情的 `paper` 模拟，不开放 `live`。各交易所可以同时独立运行网格策略，统一在一个浏览器仪表盘里监控和操控。

> ⚠️ **免责声明**：本程序仅供学习和研究。合约交易带高杠杆风险，可能损失全部本金。实盘前请务必先用模拟模式充分熟悉。使用本程序造成的任何盈亏由使用者自行承担。

---

## 目录

- [一、功能总览](#一功能总览)
- [二、三分钟快速上手（模拟模式）](#二三分钟快速上手模拟模式)
- [三、一键启动脚本做了什么](#三一键启动脚本做了什么)
- [四、手动安装（备选方案）](#四手动安装备选方案)
- [五、仪表盘使用教程](#五仪表盘使用教程)
- [5.5 同类型交易所多账号](#55-同类型交易所多账号)
- [六、网格策略原理与参数详解](#六网格策略原理与参数详解)
- [七、实盘模式：API 密钥获取与配置](#七实盘模式api-密钥获取与配置)
- [八、代理 / IP 配置](#八代理--ip-配置)
- [九、AI 助手配置](#九ai-助手配置)
- [十、通知推送（Telegram / Webhook）](#十通知推送telegram--webhook)
- [十一、.env 配置项完整对照表](#十一env-配置项完整对照表)
- [十二、断电 / 崩溃自动恢复机制](#十二断电--崩溃自动恢复机制)
- [十三、REST API 一览（进阶）](#十三rest-api-一览进阶)
- [十四、常见问题 FAQ](#十四常见问题-faq)
- [十五、项目结构](#十五项目结构)
- [十六、安全须知](#十六安全须知)

---

## 一、功能总览

### 交易核心

| 功能 | 说明 |
|---|---|
| 多交易所并行 | Decibel / Extended / RISEx / Binance / Ondo Perps / Phoenix / Nado / OKX / GRVT / RHC Lighter / Arcus 各自独立运行；Entropy 当前仅运行官方实时行情驱动的 paper 模拟 |
| 同所多账号 | 每种交易所最多创建 3 个独立账号实例；密钥、账户、模式、机器人状态和持久化数据彼此隔离 |
| 配置化接入 | 交易所名称、环境字段、代理、实盘说明、页面卡片和路由由统一注册表生成，后续新增交易所只需补元数据与适配器 |
| 双运行模式 | 通常提供 `paper` 模拟盘（虚拟资金，真实行情）和 `live` 实盘（真实下单）；Entropy 为安全边界明确的例外，当前只允许 `paper` |
| 三种网格类型 | 中性（区间震荡双向吃单）、做多（低吸高抛）、做空（高抛低补） |
| 等差网格 | 在设定区间内均匀布单，每次成交后在相邻一格自动补反向单，赚取格差 |
| 智能填充参数 | 一键根据近期 K 线趋势分析，自动推荐网格类型、区间上下界、格数 |
| 稳健 / 激进两档 | 稳健 = 格距大成交少更安全；激进 = 格距小成交频繁风险高 |
| 区间外止损策略 | 价格冲出区间时可选：直接平仓停止，或只减仓回收阶梯（recover） |
| 在线调整区间 | 不停止网格的情况下平移 / 扩缩区间 |
| 风控内置 | 杠杆上限、保证金预检查、手续费/格距合理性校验、挂单定期对账 |
| 崩溃续跑 | 断电 / 崩溃后重启程序，自动接管交易所上还挂着的单继续跑 |

### 仪表盘（浏览器操作，无需改代码）

- 📊 **总览页**：全部交易所的余额、权益、总盈亏、已实现/未实现盈亏、收益率、成交量、完成格数实时刷新（SSE 秒级推送）
- 🧬 **复制交易所（多账号）**：在任一总览卡片下创建同类型账号 2/3；同类账号相邻排列，并可在总览、控制台和环境设置中一键切换
- 每个交易所独立**控制台**：选交易对、看 K 线趋势分析、启动 / 停止 / 撤单 / 平仓 / 重置统计 / 重连交易所
- ⚙ **IP 配置页**：在网页里直接设置全局或各所独立代理，检测出口 IP，写入 .env
- 🧩 **环境设置页**：把交易所运行模式、网络、账户与 API 凭据界面化；可分别切换 paper / live，保存后自动重启并让本机 `.env` 生效
- 🤖 **AI 助手页**：连接你自己的 AI 服务（DeepSeek / Kimi / OpenAI / Claude / Gemini / Ollama 等），提供五大能力：
  1. **风控哨兵**：定时巡检全部已注册交易所状态，发现异常推送告警
  2. **每日复盘日报**：每天定点生成交易总结
  3. **市况分析**：定时生成 BTC 市况报告
  4. **对话操控**：用自然语言问状态、下指令（如"把 Extended 上边界调到 66000"，AI 只提议，你点确认才执行）
  5. **出区间建议**：价格冲出网格区间时，AI 给出处置建议
- 📱 **通知推送**：Telegram 机器人 + 通用 Webhook，成交异常 / 哨兵告警 / 日报自动推送

### 安全设计

- AI 永远不进交易快回路，下单补单对账全部是纯规则代码
- AI 对话只能"提议"操作，必须由你在网页上点确认才会执行
- 私钥只存在本机 `.env` 文件，程序不上传任何数据

---

## 二、三分钟快速上手（模拟模式）

模拟模式**不需要任何 API 密钥、不需要任何账号**，用虚拟的 10000 USDC 和真实行情练手。

1. **下载本项目**到电脑任意文件夹（如果是 zip 包，先解压）。
2. **双击 `一键启动.bat`**。脚本会自动完成所有准备工作（没装 Node.js 会帮你装，详见下一节）。
3. 等待窗口显示"已启动"，浏览器会**自动打开** `http://localhost:8080`。
4. 在网页里任选一个交易所（比如 Decibel），点 **🎯 智能填充参数**，再点 **启动 Decibel 网格**。
5. 完成！观察总览页的盈亏变化。想停就点 **停止 + 撤单 + 平仓**，想关程序就关掉那个黑色命令行窗口。

---

## 三、一键启动脚本做了什么

`一键启动.bat`（模拟模式）逐步执行以下动作，全程无需手动干预：

1. **检查 Node.js**
   - 已安装 → 直接进入下一步；
   - 未安装 → 自动调用 Windows 自带的 winget 静默安装 Node.js LTS 版；
   - winget 也不可用（老系统）→ 自动打开 Node.js 官网下载页 `https://nodejs.org/zh-cn/download`，你手动安装后重新双击脚本即可。
2. **初始化配置**：如果没有 `.env` 文件，自动从 `.env.example` 复制一份。默认配置就是全模拟模式，零填写。
3. **安装依赖**：如果没有 `node_modules` 文件夹（首次运行），自动执行 `npm install`，约 1–3 分钟。失败时会提示切换国内 npm 镜像的命令。
4. **启动程序**：运行 `node src/server.js`，4 秒后自动打开浏览器仪表盘。

`实盘启动.bat` 多两个保护步骤：检查 `.env` 是否存在（实盘必须先配置密钥），以及要求你手动输入 `YES` 确认才会启动。

> 💡 关闭命令行窗口 = 停止程序。已挂在交易所的单不会被自动撤销，下次启动程序会自动接管续跑（见[第十二节](#十二断电--崩溃自动恢复机制)）。

---

## 四、手动安装（备选方案）

如果你不想用 bat 脚本，或在 Mac / Linux 上运行：

1. 安装 [Node.js](https://nodejs.org/zh-cn/download) v20 或更高版本。验证：终端执行 `node -v` 能显示版本号。
2. 在项目文件夹打开终端，执行：
   ```bash
   npm install        # 安装依赖
   cp .env.example .env   # Windows 用: copy .env.example .env
   npm start          # 启动，等价于 node src/server.js
   ```
3. 浏览器打开 `http://localhost:8080`。
4. 运行测试（可选）：`npm test`。

---

## 五、仪表盘使用教程

启动后浏览器打开 `http://localhost:8080`，顶部页签由交易所注册表自动生成：**📊 总览**、各交易所控制台、**🤖 AI助手**、**🧩 环境设置**、**⚙ IP配置**。

### 5.1 总览页

每张卡片对应一个已注册交易所，实时显示（每秒刷新）：

- **运行状态**：是否在跑、paper/live 模式
- **余额 / 权益**：账户余额和含未实现盈亏的总权益
- **总盈亏** = 已实现盈亏 + 未实现盈亏，以及收益率百分比
- **成交量 / 完成格数**：累计成交额和已完成的"买-卖"完整来回次数
- **挂单数**：本地跟踪的挂单 vs 交易所实际挂单（对账用）
- **出区间警示**：价格冲出网格区间时高亮提醒

点"进入 XX 控制台 →"跳到对应交易所页面。

### 5.2 交易所控制台（全部交易所使用统一界面）

**第一步：选交易对**。下拉框列出该所全部可交易市场（如 BTC/USD、ETH/USD）。

**第二步：看趋势（可选）**。选择 K 线周期后，程序自动拉取近 200 根 K 线做趋势分析（涨/跌/震荡、强度、波动率 ATR），并给出推荐的网格类型。

**第三步：填参数**。两种方式：

- **🎯 智能填充参数**（推荐新手）：根据趋势分析自动填好网格类型、上下边界、网格数量、每格数量。你只需要检查一下再启动。还可以点"采用推荐策略 + 自动区间"完全托管。
- **手动填写**：
  | 参数 | 含义 |
  |---|---|
  | 网格类型 | 中性 / 做多 / 做空（详见第六节） |
  | 下边界 / 上边界 | 网格区间的最低价和最高价 |
  | 网格数量 | 区间内均分成多少格，格数越多格距越小、成交越频繁 |
  | 每格数量(币) | 每一格挂单的币数量（如 0.001 BTC） |
  | 杠杆 (x) | 使用的杠杆倍数，程序有保证金预检查，超了不让启动 |
  | 稳健 / 激进 | 快捷预设：稳健=成交少更安全，激进=成交频繁风险高 |
  | 区间外止损策略 | 价格冲出区间怎么办：`平仓` 或 `只减仓回收阶梯` |

**第四步：点"启动 XX 网格"**。程序会先做风控检查（保证金够不够、格距是否大于手续费成本），通过后一次性铺满区间挂单。

**运行中可用的操作**：

- **调整区间（不停止网格）**：直接改上下边界，程序增补/撤销对应挂单
- **撤销所有挂单（保留持仓）**：清掉挂单但不动仓位
- **停止 + 撤单 + 平仓**：完全退出，市价平掉持仓
- **重置统计（盈亏/成交量清零）**：只清显示数据，不动交易
- **🔌 重连交易所（不动挂单/持仓）**：网络闪断后重建连接并自动对账续跑

**遗留持仓处理**：如果程序重启后发现交易所上还有没处理完的持仓，界面会弹出三个选项：
① 只减仓回收阶梯（挂 reduce-only 单逐步退出）② 按现价重开网格 ③ 市价平仓。

### 5.3 ⚙ IP 配置页

给全部交易所配置网络代理（部分地区直连不了交易所 API 时需要）：

- **本机直连**：最高优先级，每次按真实目标域名先检测
- **各所独立代理**：直连失败后的第二通道
- **全局代理**：最低优先级兜底；一键启动的严格就绪闸门
- **全局代理**：最低优先级兜底；网络异常只告警，不阻止进入控制台修改配置
- **一键检测全部链路**：自动切换并立即应用首个可用通道

格式见[第八节](#八代理--ip-配置)。

### 5.4 🤖 AI 助手页

见[第九节](#九ai-助手配置)。

---

### 5.5 同类型交易所多账号

每张总览卡片下方都有 **“＋ 复制交易所（多账号）”**。点击后会创建该类型的下一个账号实例；每种交易所最多包含账号 1、账号 2、账号 3。

- **完全独立**：每个账号拥有自己的 API Key、私钥、账户地址、运行模式、策略、挂单、持仓、盈亏与恢复快照。
- **安全复制**：只复用交易所适配器、页面功能和普通默认参数；不会复制原账号的 API Key、私钥、账户地址或其他敏感字段，新账号固定从 `paper` 开始。
- **相邻展示**：同类型账号在顶栏、总览卡片、汇总表、控制台与环境设置中始终相邻；出现多个账号后，会显示“账号 1 / 账号 2 / 账号 3”切换按钮。
- **保存方式**：页面会自动把新增实例写入本机 `.env` 的 `EXCHANGE_INSTANCES`，并重启本地引擎。若当前有运行中的网格，会再次要求确认，避免意外中断交易。
- **代理共享**：同一交易所类型访问相同 API 域名，因此共享该类型的独立代理；账号凭据、模式和交易状态仍各自独立。

以 Binance 账号 2 为例，页面自动使用 `BN2_MODE`、`BN2_NETWORK`、`BINANCE_API_KEY_2`、`BINANCE_API_SECRET_2` 等独立配置。通常无需手工编辑这些变量，直接在 **🧩 环境设置** 中填写并保存即可。

> ⚠️ 创建新账号会重启本地引擎。实盘网格正在运行时，请先确认挂单和持仓处置；页面不会静默复制密钥或静默中断运行策略。

---

## 六、网格策略原理与参数详解

### 6.1 网格是怎么赚钱的

在你设定的价格区间 `[下边界, 上边界]` 内均匀画出 N 条价格线（格线）。程序在现价**下方格线挂买单、上方格线挂卖单**。价格每穿过一条格线就会成交一单，成交后程序立刻在**相邻一格**挂出反向单：

- 买单成交 → 在上方一格挂卖单（等反弹卖出）
- 卖单成交 → 在下方一格挂买单（等回落买回）

每完成一次"买入→卖出"来回，就赚到 `格距 × 每格数量` 的差价（扣除手续费）。**震荡行情来回越多赚越多；单边行情冲出区间就会被套**，所以区间外策略和止损很重要。

### 6.2 三种网格类型

| 类型 | 挂单方式 | 适合行情 |
|---|---|---|
| 中性 | 现价下方挂买单、上方挂卖单，双向开仓 | 横盘震荡 |
| 做多 | 只在下方挂买单（低吸），涨上去只挂平多的卖单 | 震荡偏涨 |
| 做空 | 只在上方挂卖单（高抛），跌下来只挂平空的买单 | 震荡偏跌 |

做多网格的卖单、做空网格的买单都是 **reduce-only（只减仓）**，不会反向开仓。

### 6.3 参数选择建议

- **区间**：包住近期主要震荡范围。区间太窄容易冲出去，太宽则格距大、成交少。"智能填充"会按 ATR 波动率自动算。
- **格数**：格距 = (上边界 − 下边界) / 格数。**格距必须明显大于一来一回的手续费**，否则做一单亏一单——程序启动时会强制校验这一点。
- **每格数量**：决定资金占用。程序启动前做保证金预检查：所有格子同方向全部成交时所需保证金不能超过 `余额 × 杠杆`。
- **杠杆**：放大收益也放大爆仓风险。新手建议 ≤ 5x，先用模拟盘试。
- **区间外策略**：`平仓`（冲出区间立即撤单+平仓+停止，损失确定）或 `recover 只减仓回收`（挂 reduce-only 阶梯单等价格回来逐步退出，不追加风险但退出时间不确定）。

---

## 七、实盘模式：API 密钥获取与配置

### 7.0 总体步骤

1. 用记事本（或任何文本编辑器）打开项目文件夹里的 `.env` 文件（没有就先复制 `.env.example` 改名为 `.env`；注意文件名就是 `.env`，前面有个点，没有别的后缀）。
2. 把你要实盘的交易所模式改为 live：`DE_MODE=live`（Decibel）/ `EX_MODE=live`（Extended）/ `RS_MODE=live`（RISEx）/ `BN_MODE=live`（Binance）/ `ONDO_MODE=live`（Ondo Perps）/ `PHOENIX_MODE=live`（Phoenix）/ `NADO_MODE=live`（Nado）/ `OKX_MODE=live`（OKX）/ `GRVT_MODE=live`（GRVT）/ `LR_MODE=live`（RHC Lighter）/ `AR_MODE=live`（Arcus，须具备 Perps Beta 与地区资格）。**各交易所互相独立**，可以只实盘一个、其余保持 paper。Entropy 当前固定 `ENTROPY_MODE=paper`；改为 `live` 会被拒绝，不能绕过。
3. 按下面各小节获取并填入对应凭据。
4. 保存 `.env`，双击 `实盘启动.bat`，输入 `YES` 确认启动。
5. 启动日志里看到 `[XX] ✓ 连接成功 [LIVE 模式]` 即成功。

> ⚠️ 填写规则：等号后面直接跟值，不要加空格和引号（例：`DECIBEL_API_KEY=abc123`）。私钥是极度敏感信息，`.env` 绝不要发给任何人、绝不要提交到 GitHub（本项目 `.gitignore` 已默认排除）。

### 7.1 Decibel（Aptos 链）

需要填 3 项：

```ini
DE_MODE=live
DECIBEL_API_KEY=       # ① API Key
DECIBEL_PRIVATE_KEY=   # ② API 钱包 Ed25519 私钥
DECIBEL_SUBACCOUNT=    # ③ Trading Account 地址
```

获取步骤：

1. **① API Key**：到 **geomi.dev**（Aptos 官方 API 网关，原 Aptos Build）注册账号 → 创建项目 → 生成 API Key。这是访问 Aptos 全节点 API 的通行证。
2. **② API 钱包私钥**：打开 **app.decibel.trade/api** → 连接你的钱包 → 创建 **API Wallet**，会生成一个 Ed25519 私钥。这个 API 钱包只有交易权限，不能提币，安全性比主钱包私钥高。复制生成的私钥填入。
3. **③ Trading Account 地址**：在 Decibel 交易界面里查看你的 **Trading Account（子账户）地址**（0x 开头的一长串），复制填入。
4. **API Wallet 充入 APT gas：**把 APT 转入创建 API Wallet 时显示的 **API Wallet Address**，不是 Trading Account。挂单、撤单和设置杠杆都是 Aptos 链上交易，必须用 APT 支付手续费。机器人会在实盘启动前按当前 gas 价格计算并检查最低预留。
5. **Trading Account 充入 USDC：**确保 Trading Account 里有足够 USDC 作为保证金。USDC 不能代替 API Wallet 里的 APT 支付 gas。

### 7.2 Extended（Starknet 链）

需要填 4 项：

```ini
EX_MODE=live
EXTENDED_API_KEY=              # ① API Key
EXTENDED_VAULT=                # ② Vault ID
EXTENDED_STARK_PRIVATE_KEY=    # ③ Stark 私钥
EXTENDED_STARK_PUBLIC_KEY=     # ④ Stark 公钥
```

获取步骤：

1. 打开 **app.extended.exchange**，连接钱包并完成开户（首次会创建你的 Starknet 交易账户）。
2. 进入 **API Management**（一般在账户设置 / 头像菜单里）→ 点 **Create API Key**。
3. 页面会一次性展示 4 个值：**API Key、Vault（数字 ID）、Stark Private Key、Stark Public Key**。⚠️ 私钥只显示一次，务必当场复制保存。
4. 四个值对应填入 `.env`。机器人会在启动网格前调用 `/api/v1/user/fees`，按该子账户和市场的当前 maker/taker 费率签名；`EXTENDED_MAX_FEE` 只是安全上限，保持默认 `0.0005` 即可。
5. 若交易所明确返回 `1128 Trading fees are invalid`，机器人会刷新当前费率、重新签名并安全重试一次；网络超时或状态未知不会盲目重试。
5. 确保账户里有 USDC 保证金。

### 7.3 RISEx

需要填 2 项：

```ini
RS_MODE=live
ACCOUNT_ADDRESS=       # ① 账户地址
SIGNER_PRIVATE_KEY=    # ② 签名私钥
```

获取步骤：

1. 打开 RISEx 官网交易应用，连接钱包完成开户。
2. 在账户 / API 设置中查看你的**账户地址**，并创建 / 导出用于签名下单的 **Signer 私钥**（具体入口以 RISEx 官方文档为准，通常在 API 或账户安全设置里）。
3. 两个值填入 `.env`，确保账户有保证金。

`RISEX_API_URL` / `RISEX_WS_URL` 留空即用官方默认地址，一般不用改。

### 7.4 Binance USDⓈ-M Futures

需要填 2 项，并建议第一次先使用 Binance Futures Testnet：

```ini
BN_MODE=live
BN_NETWORK=testnet
BINANCE_API_KEY=       # ① Futures API Key
BINANCE_API_SECRET=    # ② Futures API Secret
```

获取与启用步骤：

1. **测试网优先**：先在 Binance Futures Testnet 创建测试账户和 API 凭据，把 `BN_NETWORK=testnet`，确认下单、撤单、对账、重启恢复均符合预期。
2. **创建实盘 Key**：登录 Binance，在 API Management 创建独立 API Key，只打开期货交易权限；不要打开提现权限，并尽量配置固定出口 IP 白名单。
3. **账户准备**：向 USDⓈ-M Futures 账户转入保证金；机器人使用单向持仓模式，启动实盘前会检查持仓模式、账户、市场规则和余额。
4. **切换主网**：测试通过后才将 `BN_NETWORK=mainnet`。`BINANCE_API_URL` 通常留空，由网络选择自动使用官方地址。
5. **时钟与签名**：Binance 私有接口需要时间戳和 HMAC SHA256 签名；适配器会自动同步服务器时间、按 `tickSize` / `stepSize` 取整，并用 `newClientOrderId` 处理网络超时后的订单状态确认，避免不确定状态下重复下单。

> ⚠️ Binance 实盘适配仅支持 USDⓈ-M Futures 的单向持仓模式。若账户启用了双向持仓（Hedge Mode），预检查会阻止启动，避免 `positionSide` 语义错误导致反向仓位。

### 7.5 Ondo Perps

需要填 2 项，强烈建议先使用官方 sandbox：

```ini
ONDO_MODE=live
ONDO_NETWORK=testnet
ONDO_KEY_ID=          # ① ondoKeyId_ 开头
ONDO_API_SECRET=      # ② ondoApiSecret_ 开头
```

获取与启用步骤：

1. 先确认你的所在地区符合 Ondo Perps 的服务资格；受限制地区不要启用 live。
2. 登录 **app.ondoperps.xyz**，点击右上角账户地址 → **API Keys** → **Add New API Key**，创建读取与交易专用 Key。
3. 立即保存完整 Key ID 与 API Secret。建议绑定固定 IPv4 出口白名单；代理出口变化时也要同步更新白名单。
4. `ONDO_NETWORK=testnet` 使用官方 sandbox。先验证限价单、撤单、杠杆、重启接管和市价平仓，再切换 `mainnet`。
5. 主网账户需有 USDC 保证金。实盘适配器按官方规则生成 `ONDO-TIMESTAMP` 与 HMAC-SHA256 `ONDO-SIGN`，按市场增量取整；下单网络状态未知时只按 client order ID 查询，不盲目重复提交。

> ⚠️ API Secret 只保存在本机 `.env`。不要填写钱包助记词或钱包私钥；股票、ETF 等标的还可能受交易时段和地区规则限制。

### 7.6 Phoenix（Solana 链）

Phoenix 实盘不使用传统 API Key，而是由本机 Solana 专用钱包签名。私钥和 Keypair 路径二选一：

```ini
PHOENIX_MODE=live
PHOENIX_PRIVATE_KEY=                  # ① 专用钱包私钥；与下一项二选一
PHOENIX_KEYPAIR_PATH=secrets/phoenix.key  # ② 本机 Solana keypair JSON 路径
PHOENIX_API_URL=https://perp-api.phoenix.trade
PHOENIX_SOLANA_RPC=https://api.mainnet-beta.solana.com
```

获取与启用步骤：

1. 先确认所在地区符合 Phoenix 服务资格并完成开户；Phoenix 当前可能限制新用户访问。
2. 创建**只用于 Phoenix** 的 Solana 钱包。支持 Solana CLI 64 字节 JSON、Base58、Base64 或 Hex 私钥；不要复用存放大额资产的主钱包。
3. 在 Phoenix 存入 USDC 保证金，并在钱包保留少量 SOL，用于挂单、撤单和平仓的链上手续费。
4. `PHOENIX_API_URL` 使用官方接口；`PHOENIX_SOLANA_RPC` 可先使用 Solana 官方主网 RPC，高频实盘建议更换为稳定的专用 RPC。
5. 先在 `paper` 验证网格参数、断线重连与恢复，再切 `live`。实盘网格挂单使用 Post-Only，本机签名后提交 Solana；撤单使用交易所返回的精确价格 tick 与订单序号。

> ⚠️ Phoenix 订单发送后若链上状态暂时未知，机器人不会盲目重复提交。应先在 Phoenix 或 Solana 浏览器核对。Phoenix 官方建议集成场景使用专用/嵌入式钱包。

### 7.7 Nado（Ink L2）

Nado 使用 Ink L2 上的 EIP-712 本机签名。推荐创建最小权限的 **Linked Signer**；私钥和本机私钥路径二选一：

```ini
NADO_MODE=live
NADO_NETWORK=mainnet
NADO_PRIVATE_KEY=                    # ① 32 字节 Hex 专用签名私钥；与下一项二选一
NADO_KEY_PATH=secrets/nado.key       # ② 本机私钥文件
NADO_ADDRESS=                        # Linked Signer 模式填写主账户地址
NADO_SUBACCOUNT=default
NADO_BTC_PRODUCT_ID=2
NADO_INK_RPC=https://rpc-gel.inkonchain.com
NADO_ORDER_GAP_MS=200
```

获取与启用步骤：

1. 先确认所在国家或地区符合服务资格，在 **app.nado.xyz** 连接 Ink 钱包、完成开户并存入 USDT0 保证金。
2. 在 Nado 的 **Linked Signers** 页面创建只用于机器人的签名钱包；仅把该 32 字节 Hex 私钥填入 `NADO_PRIVATE_KEY` 或保存在 `NADO_KEY_PATH` 指向的本机文件，不要填写主钱包助记词。
3. 使用 Linked Signer 时，把资金主账户地址填入 `NADO_ADDRESS`；如果私钥本身就是主账户钱包，可留空由程序推导。子账户留空或填写 `default`。
4. BTC-PERP 官方 Product ID 默认为 `2`。机器人从 Nado 官方 symbols 接口动态加载全部永续市场、价格步进、数量步进、最低名义价值与费率，无需手工维护交易对。
5. 主网 Gateway 与 Ink RPC 会进入统一网络选路；先在 `paper` 验证行情、网格、撤单和恢复，再切换 `live`。实盘初始单使用 Post-Only，撤单使用订单 digest 精确签名。

> ⚠️ Linked Signer 是推荐的最小权限方案。所有私钥与 EIP-712 签名只保留在本机；首次实盘请用小额和低杠杆。网络状态未知时机器人不会盲目重复下单。

**实时行情锚点（2.3.1）**：Nado Archive K 线会先去重并按时间升序归一化，趋势指标基于历史 K 线计算，但智能区间始终以所选产品的最新 Sequencer BBO 为锚点。切换交易对会清除旧市场区间并重新取价；迟到的旧行情响应会被丢弃。启动前机器人再次读取实时价，若现价不在新区间内或中性网格无法同时生成上下双向初始单，会在撤单、设置杠杆和下单前直接阻止启动。

### 7.8 OKX USDⓈ 永续

OKX 实盘需要 API Key、Secret Key 和创建 Key 时设置的 Passphrase：

```ini
OKX_MODE=live
OKX_NETWORK=testnet
OKX_API_KEY=
OKX_API_SECRET=
OKX_PASSPHRASE=
```

1. 在 OKX 的 **API** 页面创建只用于机器人的 Key，只勾选 **Read** 与 **Trade**，不要开启 **Withdraw**。
2. 保存 API Key、Secret Key 和 Passphrase；Secret 通常只显示一次，Passphrase 不是 OKX 登录密码。
3. 建议绑定固定出口 IP，先用 `OKX_NETWORK=testnet` 进入官方 Demo Trading 环境验证完整流程。
4. 适配器使用 SWAP 永续与 cross 全仓；连接时会自动读取账户的 net 单向或 long/short 双向持仓模式，并按官方 `tickSz` / `lotSz` / `ctVal` 换算和取整。界面“每格数量”统一按标的币填写，发送给 OKX 时自动换算为合约张数；批量挂撤单每批不超过 20 单。
5. 测试通过后再切 `mainnet`，并确认永续账户已有 USDT/USDC 保证金。

官方文档：<https://www.okx.com/docs-v5/en/>

**持仓模式 / 初始批量挂单（2.2.6）**：连接 OKX 后先读取 `/api/v5/account/config` 的 `posMode`。单向模式省略 `posSide` 并使用 `reduceOnly`；双向模式按开多 `buy+long`、开空 `sell+short`、平多 `sell+long`、平空 `buy+short` 生成参数且不发送仅适用于单向模式的 `reduceOnly`，无需用户更改账户持仓模式。初始批量挂单会把 OKX 的 `ordId` 与每个原始 `clientOrderId` 逐笔关联；部分成功时保留已确认订单并触发整市场撤单清理，缺失订单号则按“结果未知”停止，禁止盲目重发。

**合约面值 / 保证金预检（2.2.7）**：OKX 的 SWAP 下单字段 `sz` 是“合约张数”，不是标的币数量。程序会读取每个市场的 `ctVal`，把界面、风险预算、挂单回读和持仓统一为标的币单位，仅在 OKX API 边界换算成张数并按 `lotSz` 向下取整。例如 `ONDO-USDT-SWAP` 若 `ctVal=10`，填写 `369 ONDO/格` 会安全换算为 `36 张 = 360 ONDO`，不会误发成 `369 张 = 3690 ONDO`。启动前还会重新读取对应 USDT/USDC 的 `availEq`；预计保证金超出真实可用额时，在撤单、设杠杆和首笔挂单之前直接阻止启动。

### 7.9 GRVT L2 永续

GRVT 使用 Trade API Key 建立会话，并用专用交易签名私钥按 EIP-712 在本机签名订单：

```ini
GRVT_MODE=live
GRVT_NETWORK=testnet
GRVT_API_KEY=
GRVT_PRIVATE_KEY=
GRVT_SUB_ACCOUNT_ID=
```

1. 在 GRVT 创建 Trading Account / Sub Account，并在账户设置生成 **Trade API Key**。
2. 创建并绑定只用于该 Trading Account 的交易签名 Key，将其 `0x` 私钥填入 `GRVT_PRIVATE_KEY`；不要填写主钱包助记词。
3. 填入数字 `GRVT_SUB_ACCOUNT_ID`。程序使用 API Key 登录 `gravity` 会话，并读取 `X-Grvt-Account-Id`；会话过期时自动重新登录。
4. 订单按 GRVT 官方 `Order` / `OrderLeg` EIP-712 类型签名；主网 chain ID 为 325，测试网为 326。
5. 先在 testnet 完成挂单、撤单、杠杆、重启对账和减仓验证，再切 mainnet/live。

官方配置说明：<https://api-docs.grvt.io/api_setup/>

**数量 / 价格精度（2.2.4）**：`Order size too granular` 表示数量不是有效下单单位的整数倍，与 `Invalid limit price tick`（价格步长错误）不同。程序从官方 instrument 元数据读取 `min_size` 作为数量步长，`base_decimals` 仅用于 EIP-712 签名缩放，不能用作下单步长。以 XPL 为例：`base_decimals=6`，但 `min_size=1.0`，每格 `93.432203 XPL` 会向下对齐为 `93 XPL`，不会向上增加敞口。智能填参使用同一数量步长；初始铺单、补单及减仓订单在签名前统一对齐，签名、发送和本地挂单记录保持一致。对齐后数量为 0、低于开仓最小名义金额或缺少有效规则时，阻止发送并提示原因。

**批量回包 / 订单跟踪（2.2.5）**：GRVT 的 `create_order` 会返回占位 `order_id="0x00"`，不能将其当成唯一订单号，否则多笔订单被合并成一笔，误报“成功 1/16”。现在以逐笔唯一的 `metadata.client_order_id` 建立稳定本地引用 `grvt-client:<编号>`，创建回包、实时挂单查询、撤单、缓存重建和重启恢复均关联到同一笔订单。查询获得的真实交易所订单号单独保存；旧版真实编号的订单仍可接管。回包缺少可验证的订单标识时，不计为成功、不自动重发，而是停止启动、尝试撤单并提示人工核对，不会再断言“未挂出任何初始订单”。

升级线上网页不会自动替换已运行的本地引擎。请保留 `.env` 与 `data`，通过平台下载最新引擎或使用启动器更新，在合适的维护时间重启并确认版本 **2.3.1**；无需重填交易密钥。本次回归使用公开市场规则与离线签名/模拟接口，不会发出实盘测试订单。

回包与撤单规则参考：[GRVT 官方集成说明](https://github.com/gravity-technologies/grvt-skills/blob/main/skills/perpetual-trading/SKILL.md) · [官方交易 API](https://api-docs.grvt.io/trading_api/)

数量规则参考：[官方市场元数据](https://api-docs.grvt.io/market_data_api/) · [官方阶梯单数量向下对齐说明](https://help.grvt.io/en/articles/13680720-advanced-order-type-scale-order)

### 7.10 Arcus（Robinhood Chain；Perps Beta）

Arcus `paper` 使用官方公开实时行情并在本机模拟成交。`live` 通过 Arcus 官方永续 REST / WebSocket API 下单，但只适用于已经获得 **Perps Beta** 权限、且所在国家或地区符合 Arcus 条款的账户。Spot Beta 开放不等于 Perps API 已对该账户开放。

```ini
AR_MODE=paper
AR_NETWORK=mainnet
ARCUS_ADDRESS=
ARCUS_ACCOUNT_INDEX=0
ARCUS_API_KEY=
ARCUS_API_PRIVATE_KEY=
ARCUS_API_PRIVATE_KEY_FILE=secrets/arcus-private.pem
ARCUS_GOOD_TIL_DAYS=40
ARCUS_FEE_RATE=0.0005
ARCUS_API_URL=
ARCUS_WS_URL=
```

1. 先阅读 [Arcus 官网资格说明](https://arcus.xyz/)；未获 Perps Beta 权限或处于受限地区时保持 `AR_MODE=paper`。
2. 在 [Arcus 主网应用](https://app.arcus.xyz/) 或 [Arcus 测试网](https://testnet.arcus.xyz/) 的 API Keys 页面生成密钥。Arcus 在浏览器中创建 **Ed25519 API keypair**，并用一次 EIP-712 钱包签名把 API 公钥绑定到地址和子账户。
3. `ARCUS_ADDRESS` 只填写公开钱包地址，`ARCUS_ACCOUNT_INDEX` 填授权的子账户编号，`ARCUS_API_KEY` 填 Ed25519 公钥。API Signing Key 是 Ed25519 私钥半部，只显示一次；建议保存到 `ARCUS_API_PRIVATE_KEY_FILE` 指向的本机文件。
4. **绝不能**把 Ethereum / Robinhood Chain 主钱包私钥或助记词填入任何 `ARCUS_*` 字段。`ARCUS_API_PRIVATE_KEY` 只接受 Arcus 专用 API Signing Key。
5. 市场 ID、在线状态、`tickSize`、分层 `tickTiers`、`stepSize`、最小数量与最小名义金额必须从官方 `/v1/markets` 动态读取。离线市场、未按当前价格档 tick 对齐的价格、或不满足最小值的数量都必须在签名前拒绝。

官方资料：[REST 下单指南](https://docs.arcus.xyz/guides/rest-trading) · [WebSocket 下单指南](https://docs.arcus.xyz/guides/websocket-trading) · [完整 API 索引](https://docs.arcus.xyz/llms.txt)

> ⚠️ Arcus 官方的 `arcus-spot-sdk` 服务于 Spot RFQ，不是永续订单簿 SDK，不能拿它替代本节的 Perps API。`live` 启动前还必须通过 API key、公私钥匹配、账户权限、余额、市场状态和保证金预检；任一项失败都不发送订单。

### 7.11 Entropy（Hyperliquid HIP-3；仅 Paper）

Entropy 是 Hyperliquid 上 ticker / DEX 名为 `io` 的 HIP-3 市场部署者。当前版本只通过 Hyperliquid **官方** `/info` 接口读取 Entropy 的实时市场、订单簿与 K 线，在本机使用虚拟余额撮合；不会签名，也不会发送真实订单。

```ini
ENTROPY_MODE=paper
ENTROPY_NETWORK=mainnet
ENTROPY_DEX=io
ENTROPY_API_URL=https://api.hyperliquid.xyz
ENTROPY_PROXY=
```

- `ENTROPY_MODE` 当前只允许 `paper`；设置为 `live` 必须 fail-closed 并提示尚未开放，不能静默降级后仍显示 LIVE。
- `ENTROPY_DEX` 固定为官方标识 `io`。市场名称形如 `io:ANTH`，具体清单、顺序、下架状态和 `szDecimals` 必须通过 `meta(dex:"io")` 动态读取，不能硬编码历史市场或 asset ID。
- `ENTROPY_API_URL` 是官方 API **基地址**，保持 `https://api.hyperliquid.xyz`，不要追加 `/info`，也不要替换为臆造的 `api.entropy.io`。
- Paper 不需要任何账户或密钥。不要在本项目中填写 Hyperliquid 主钱包私钥、助记词或 Agent/API Wallet 私钥。

官方资料：[Entropy 架构与 `io` 标识](https://docs.entropy.io/) · [Hyperliquid HIP-3](https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-3-builder-deployed-perpetuals) · [Perpetuals Info API](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/perpetuals) · [资产 ID](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids) · [价格与数量精度](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/tick-and-lot-size)

> 安全边界：只有未来完成并审计 Hyperliquid Agent Wallet 签名、nonce、HIP-3 isolated margin / collateral、动态 asset ID、订单状态确认和撤单恢复后，才可以单独评估开放 Entropy `live`。当前文档和界面不得宣称 Entropy 已支持实盘。

### 7.12 RHC Lighter（Robinhood Chain）

RHC 固定使用官方主网，由官方 Python signer 在本机签名。账户编号、API Key 索引和 API 私钥必须属于同一个 RHC Profile：

```ini
LR_MODE=live
LR_NETWORK=mainnet
LIGHTER_ACCOUNT_INDEX=
LIGHTER_API_KEY_INDEX=
LIGHTER_API_PRIVATE_KEY=
LIGHTER_API_PRIVATE_KEY_FILE=secrets/lighter-api-private-key.txt
LIGHTER_PYTHON=
LIGHTER_FEE_RATE=0.0005
LIGHTER_ORDER_GAP_MS=300
```

1. 在 RHC Lighter 创建账户和专用 API Key，复制非负整数 `LIGHTER_ACCOUNT_INDEX`；它不是钱包地址。
2. `LIGHTER_API_KEY_INDEX` 使用 4–254，并与 API 签名私钥的索引完全一致。
3. `LIGHTER_API_PRIVATE_KEY` 与 `LIGHTER_API_PRIVATE_KEY_FILE` 二选一；推荐把单行 API 私钥放到 `secrets/lighter-api-private-key.txt`。它不是 Ethereum 主钱包私钥。
4. 一键启动会准备兼容的 64 位 Python 3.12 与固定版本官方 `lighter-sdk`；已有兼容解释器时可填写 `LIGHTER_PYTHON`。
5. 实盘预检会验证官方端点、签名 chain ID `466324`、API Key 鉴权、账户索引和权益快照；关键检查不通过时 RHC 保持离线，不发送签名交易。

官方 API：<https://apidocs.rh.lighter.xyz/>；官方应用：<https://robinhoodchain.lighter.xyz/?referral=WELINKBTC>

### 7.13 测试网练手（可选）

支持测试环境的交易所都应先走沙盒流程：把对应的 `*_NETWORK` 改为 `testnet`，再使用该测试网账户凭据；Ondo Perps 的 `testnet` 映射到官方 sandbox。

---

## 八、代理 / IP 配置

部分地区网络直连不了交易所 API，需要代理。两种配置方式：**仪表盘 ⚙ IP配置页**（推荐，可在线检测）或直接编辑 `.env`。

```ini
# 全局代理：最低优先级兜底；direct=全局通道使用本机直连
GLOBAL_PROXY=direct

# 各所独立代理（本机直连失败后使用）
DECIBEL_PROXY=
EXTENDED_PROXY=
RISEX_PROXY=
BINANCE_PROXY=
ONDO_PROXY=
PHOENIX_PROXY=
NADO_PROXY=
OKX_PROXY=
GRVT_PROXY=
ARCUS_PROXY=
ENTROPY_PROXY=
LIGHTER_PROXY=
```

支持的格式：

| 格式 | 示例 |
|---|---|
| HTTP(S) 代理 | `http://127.0.0.1:7890` |
| SOCKS5 代理 | `socks5://127.0.0.1:1080` |
| 带账号密码 | `socks5://user:pass@host:port` |
| 简写格式 | `host:port:user:pass` |
| 明确直连 | `direct` |

网络路由优先级固定为：**本机直连 → 服务独立代理 → `GLOBAL_PROXY`**。AI 与每个交易所按真实目标域名依次探测，某条路线失败会自动切换到下一条；查询可以安全重试，下单请求不会跨路线盲目重放，避免重复订单。程序会忽略 npm、PowerShell 或系统注入的 `HTTP_PROXY` / `HTTPS_PROXY`。

一键启动会先启动本地控制台，再在后台诊断网络。网络异常会在顶部和 IP 配置页告警，但不会阻止进入控制台修复代理；随后每项服务按上述优先级选择最终路线。仪表盘“一键检测全部链路”会列出尝试顺序、最终路线和诊断代码。

> 💡 用本机代理软件（如 Clash 默认 `http://127.0.0.1:7890`）时，请保证代理软件先启动。

---

## 九、AI 助手配置

AI 助手是**可选**功能，不配置完全不影响交易。它把你自己的大模型 API 接进来，提供风控哨兵、日报、市况分析、对话操控、出区间建议五个能力。

### 9.1 在仪表盘配置（推荐）

打开 **🤖 AI助手** 页签 → 选择**服务商**（会自动填好协议、接口地址、推荐模型）→ 填入 **API Key** → 点**测试连接** → 通过后点**保存配置**（自动写入 `.env`）。

### 9.2 支持的服务商与 Key 获取

`AI_PROVIDER` 只有三种协议：`openai`（所有 OpenAI 兼容服务都选它）、`anthropic`、`gemini`。

| 服务商 | AI_PROVIDER | AI_BASE_URL | Key 获取地址 |
|---|---|---|---|
| DeepSeek（便宜好用） | `openai` | `https://api.deepseek.com/v1` | platform.deepseek.com |
| Kimi / 月之暗面 | `openai` | `https://api.moonshot.cn/v1` | platform.moonshot.cn |
| 通义千问 | `openai` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | 阿里云百炼控制台 |
| OpenAI | `openai` | 留空 | platform.openai.com |
| OpenRouter（聚合） | `openai` | `https://openrouter.ai/api/v1` | openrouter.ai |
| Claude / Anthropic | `anthropic` | 留空 | console.anthropic.com |
| Gemini / Google | `gemini` | 留空 | aistudio.google.com |
| Ollama（本地免费） | `openai` | `http://127.0.0.1:11434/v1` | 无需 Key，本地跑 |

通用流程：注册账号 → 控制台里找 **API Keys** → 创建 Key（一般 `sk-` 开头）→ 复制填入。多数国产服务需要先充值几块钱。

### 9.3 相关配置项

```ini
AI_PROVIDER=openai
AI_API_KEY=sk-xxxx
AI_BASE_URL=https://api.deepseek.com/v1
AI_PROXY=                     # 可选：直连失败后的 AI 专用代理；全局代理最后兜底
AI_MODEL=deepseek-chat        # 主模型：复盘/分析/对话
AI_MODEL_SMALL=               # 小模型：哨兵高频巡检省钱，留空=同主模型
AI_SENTINEL_MINUTES=5         # 哨兵巡检间隔（分钟，0=关闭）
AI_MARKET_MINUTES=30          # BTC 市况报告间隔（分钟，0=关闭）
AI_REPORT_HOUR=20             # 每天几点生成日报（0-23 整点）
```

`AI_PROXY` 会在本机直连失败后自动接受检测，仍失败才尝试 `GLOBAL_PROXY`。代理商所称“HTTPS 代理”通常是通过 HTTP CONNECT 转发 HTTPS，因此地址仍写成 `http://user:pass@host:port`；只有服务商明确提供 TLS 代理端口时才使用 `https://`。公网 IP 检测成功不代表节点允许访问 `api.openai.com`，必须以目标域名检测结果为准。

### 9.4 对话操控示例

在 AI 助手页的对话框输入自然语言，例如：

- "全部交易所现在整体情况怎么样？"
- "把 Extended 上边界调到 66000"
- "Decibel 该不该止损？"

涉及**写操作**（调区间、停止等）时 AI 只会提出建议，网页弹出确认框，你点确认才真正执行——AI 无法擅自动你的仓位。

---

## 十、通知推送（Telegram / Webhook）

配置后，哨兵告警、日报、重要事件会自动推送到你手机。不配则只在网页显示。

### Telegram 机器人（推荐）

1. 在 Telegram 搜索 **@BotFather** → 发送 `/newbot` → 按提示给机器人起名 → 得到 **Bot Token**（形如 `123456:ABC-xxx`），填入 `TELEGRAM_BOT_TOKEN`。
2. 获取你的 **Chat ID**：给刚创建的机器人随便发一条消息，然后浏览器打开 `https://api.telegram.org/bot<你的Token>/getUpdates`，返回 JSON 里 `"chat":{"id":123456789}` 的数字就是 Chat ID，填入 `TELEGRAM_CHAT_ID`。（或者直接给 @userinfobot 发消息查自己的 ID。）
3. 保存后在 AI 助手页可以点"立即巡检一次"测试推送。

### 通用 Webhook

`NOTIFY_WEBHOOK=https://你的接收地址`，程序会 POST `{"text": "消息内容"}`，可对接企业微信 / 钉钉 / 飞书机器人或自建服务。

---

## 十一、.env 配置项完整对照表

| 配置项 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `8080` | 仪表盘端口，被占用时改成 8081 等 |
| `PAPER_BALANCE` | `10000` | 模拟模式初始虚拟余额（USDC） |
| `EXCHANGE_INSTANCES` | 空 | 页面自动维护的多账号实例清单，如 `de2,bn2,bn3`；每种交易所最多 3 个账号 |
| `GLOBAL_PROXY` | `direct` | 直连和服务独立代理都失败后的最低优先级兜底，见第八节 |
| `DECIBEL_PROXY` / `EXTENDED_PROXY` / `RISEX_PROXY` / `BINANCE_PROXY` / `ONDO_PROXY` / `PHOENIX_PROXY` / `NADO_PROXY` / `OKX_PROXY` / `GRVT_PROXY` / `ARCUS_PROXY` / `ENTROPY_PROXY` / `LIGHTER_PROXY` | 空 | 直连失败后使用的各所独立代理 |
| `DE_MODE` / `EX_MODE` / `RS_MODE` / `BN_MODE` / `ONDO_MODE` / `PHOENIX_MODE` / `NADO_MODE` / `OKX_MODE` / `GRVT_MODE` / `AR_MODE` / `LR_MODE` | `paper` | 各所运行模式：`paper` 或 `live`；Arcus live 另受 Beta/地区资格约束 |
| `ENTROPY_MODE` | `paper` | Entropy 当前只允许 `paper`；`live` 明确禁用 |
| `DE_NETWORK` / `EX_NETWORK` / `RS_NETWORK` / `BN_NETWORK` / `ONDO_NETWORK` / `PHOENIX_NETWORK` / `NADO_NETWORK` / `OKX_NETWORK` / `GRVT_NETWORK` / `AR_NETWORK` / `LR_NETWORK` | 各适配器默认值 | 主网 / 测试网；RHC 固定官方主网，Arcus testnet/mainnet 凭据互不通用 |
| `ENTROPY_NETWORK` / `ENTROPY_DEX` | `mainnet` / `io` | Entropy 官方 Hyperliquid HIP-3 网络与 DEX 标识；当前不可改为 live |
| `DECIBEL_API_KEY` | 空 | Decibel：geomi.dev 的 API Key |
| `DECIBEL_PRIVATE_KEY` | 空 | Decibel：API 钱包 Ed25519 私钥 |
| `DECIBEL_SUBACCOUNT` | 空 | Decibel：Trading Account 地址 |
| `DECIBEL_ORDER_GAP_MS` | `500` | Decibel 连续链上写请求的最小间隔，避免节点限流和交易拥塞 |
| `DECIBEL_API_URL` | 官方默认 | 自定义 API 地址，一般不填 |
| `EXTENDED_API_KEY` | 空 | Extended：API Key |
| `EXTENDED_VAULT` | 空 | Extended：Vault ID |
| `EXTENDED_STARK_PRIVATE_KEY` / `EXTENDED_STARK_PUBLIC_KEY` | 空 | Extended：Stark 密钥对 |
| `EXTENDED_MAX_FEE` | `0.0005` | Extended 手续费安全上限；实际 maker/taker 费率自动从账户接口读取 |
| `EXTENDED_ORDER_GAP_MS` | `400` | Extended 连续下单/撤单请求的最小间隔 |
| `EXTENDED_API_URL` | 官方默认 | 自定义 API 地址 |
| `ACCOUNT_ADDRESS` | 空 | RISEx：账户地址 |
| `SIGNER_PRIVATE_KEY` | 空 | RISEx：签名私钥 |
| `RISEX_API_URL` / `RISEX_WS_URL` | 官方默认 | 自定义 API / WebSocket 地址 |
| `RISEX_ORDER_GAP_MS` | `300` | RISEx 连续链上写请求的最小间隔 |
| `BINANCE_API_KEY` / `BINANCE_API_SECRET` | 空 | Binance USDⓈ-M Futures API 凭据 |
| `BINANCE_RECV_WINDOW` | `5000` | Binance 签名请求允许的时间窗口（毫秒） |
| `BINANCE_ORDER_GAP_MS` | `200` | Binance 连续写请求的最小间隔；明确 429/-1003 时自动退避 |
| `BINANCE_API_URL` | 网络对应官方地址 | 自定义 Binance Futures API 地址，一般留空 |
| `ONDO_KEY_ID` / `ONDO_API_SECRET` | 空 | Ondo Perps API HMAC 凭据 |
| `ONDO_POLL_MS` | `3000` | Ondo Perps 行情、订单和持仓轮询间隔（毫秒） |
| `ONDO_ORDER_GAP_MS` | `1200` | Ondo Perps 账户写请求/批次间隔；初始网格按官方上限每批最多 20 单 |
| `ONDO_API_URL` / `ONDO_WS_URL` | 网络对应官方地址 | 自定义 Ondo Perps REST / WebSocket 地址，一般留空 |
| `PHOENIX_PRIVATE_KEY` / `PHOENIX_KEYPAIR_PATH` | 空 / `secrets/phoenix.key` | Phoenix 专用 Solana 钱包凭据，二选一 |
| `PHOENIX_API_URL` / `PHOENIX_SOLANA_RPC` | 官方默认 | Phoenix API 与 Solana RPC；自动选路会同时验证二者 |
| `PHOENIX_ORDER_GAP_MS` / `PHOENIX_CU_LIMIT` | `1200` / `600000` | 链上连续写入间隔与 Compute Unit 上限；引擎会对 Phoenix API 与 Solana RPC 的 429 自动限速退避 |
| `PHOENIX_LEVERAGE` / `PHOENIX_HALF_BAND` | 空 | 可选的 Phoenix 专属杠杆上限与价格半带宽保护 |
| `NADO_PRIVATE_KEY` / `NADO_KEY_PATH` | 空 / `secrets/nado.key` | Nado 专用 EVM/Ink 签名私钥或本机私钥文件，二选一 |
| `NADO_ADDRESS` / `NADO_SUBACCOUNT` | 空 / `default` | Linked Signer 对应的资金主账户地址与 Nado 子账户名 |
| `NADO_BTC_PRODUCT_ID` / `NADO_INK_RPC` | `2` / Ink 官方主网 RPC | BTC-PERP 产品号与 Ink RPC；其余永续市场由官方接口动态发现 |
| `NADO_ORDER_GAP_MS` / `NADO_LEVERAGE` | `200` / 空 | 连续签名下单间隔与可选的 Nado 专属策略杠杆上限 |
| `OKX_API_KEY` / `OKX_API_SECRET` / `OKX_PASSPHRASE` | 空 | OKX Read + Trade API 三项凭据；禁止开启提现权限 |
| `OKX_ORDER_GAP_MS` / `OKX_POLL_MS` | `200` / `3000` | OKX 批量写请求间隔与账户/订单轮询间隔 |
| `OKX_API_URL` | `https://www.okx.com` | OKX 官方 REST 地址；测试环境通过模拟交易请求头启用 |
| `GRVT_API_KEY` / `GRVT_PRIVATE_KEY` / `GRVT_SUB_ACCOUNT_ID` | 空 | GRVT Trade API Key、专用 EIP-712 交易签名私钥与数字子账户 ID |
| `GRVT_ORDER_GAP_MS` / `GRVT_POLL_MS` | `250` / `4000` | GRVT 连续签名下单间隔与账户/订单轮询间隔 |
| `GRVT_MARKET_URL` / `GRVT_TRADE_URL` / `GRVT_AUTH_URL` | 网络对应官方地址 | GRVT 市场、交易和登录接口，一般留空 |
| `ARCUS_ADDRESS` / `ARCUS_ACCOUNT_INDEX` | 空 / `0` | Arcus 获授权的公开钱包地址与子账户编号；公开地址不是钱包私钥 |
| `ARCUS_API_KEY` | 空 | Arcus Ed25519 API 公钥；仅 live 使用 |
| `ARCUS_API_PRIVATE_KEY` / `ARCUS_API_PRIVATE_KEY_FILE` | 空 / `secrets/arcus-private.pem` | Arcus 专用 Ed25519 API Signing Key 或本机文件，二选一；绝不能填写主钱包私钥 |
| `ARCUS_GOOD_TIL_DAYS` / `ARCUS_FEE_RATE` | `40` / `0.0005` | GTT 有效期与无法读取实际费率时的保守回退值 |
| `ARCUS_API_URL` / `ARCUS_WS_URL` | 网络对应官方地址 | Arcus 官方 REST / WebSocket 地址，一般留空 |
| `ENTROPY_API_URL` | `https://api.hyperliquid.xyz` | Hyperliquid 官方 API 基地址；程序调用 `/info` 获取 `io` 市场实时数据，不要追加 `/info` |
| `LIGHTER_ACCOUNT_INDEX` / `LIGHTER_API_KEY_INDEX` | 空 | RHC 账户编号与 API Key 索引；实盘必填，Key 索引限制为 4–254 |
| `LIGHTER_API_PRIVATE_KEY` / `LIGHTER_API_PRIVATE_KEY_FILE` | 空 / `secrets/lighter-api-private-key.txt` | RHC API 签名私钥或单行私钥文件，二选一 |
| `LIGHTER_PYTHON` | 空 | 可选 64 位 Python 3.12 路径；留空由一键启动准备本机运行时 |
| `LIGHTER_FEE_RATE` / `LIGHTER_ORDER_GAP_MS` | `0.0005` / `300` | 无法读取 maker fee 时的回退值与签名批次间隔 |
| `AI_PROVIDER` | `openai` | AI 协议：`openai` / `anthropic` / `gemini` |
| `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL` / `AI_MODEL_SMALL` | 空 | 见第九节 |
| `AI_PROXY` | 空 | 本机直连失败后使用的 AI 专用代理；全局代理最后兜底 |
| `AI_SENTINEL_MINUTES` | `5` | 哨兵巡检间隔（分钟，0=关） |
| `AI_MARKET_MINUTES` | `30` | 市况报告间隔（分钟，0=关） |
| `AI_REPORT_HOUR` | `20` | 日报生成时间（0-23 点） |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | 空 | Telegram 推送，见第十节 |
| `NOTIFY_WEBHOOK` | 空 | 通用 Webhook 推送地址 |

---

## 十二、断电 / 崩溃自动恢复机制

程序每次状态变化都会把快照写入项目目录下的 `.state.json`（自动生成，含配置、挂单、累计统计）。重启后：

1. **上次是运行状态** → 自动**续跑**：重新连接交易所，按市场名称重新解析交易对（交易所每次连接会重新编号市场 ID），接管还挂着的单，对账后继续运行。
2. **续跑失败**（如交易所连不上）→ 撤销遗留挂单，绝不在"半知半解"状态下运行网格。
3. **交易所暂时连不上** → 跳过续跑、保留挂单，等你在界面点 **🔌 重连交易所** 成功后自动接管。
4. **发现遗留持仓** → 界面弹三选项：只减仓回收 / 按现价重开网格 / 市价平仓。

累计盈亏、成交量等统计也随快照保留，跨重启连续显示。想清零就点"重置统计"。

---

## 十三、REST API 一览（进阶）

服务是纯 HTTP + SSE，可以自行编程调用。`{ex}` 为动态实例键，例如基础账号 `de` / `bn`，复制账号 `de2` / `bn2`；实际清单请从 `/api/exchanges` 获取：

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/api/exchanges` | 交易所注册表的公开元数据、环境字段和实盘说明 |
| POST | `/api/exchanges/clone` | 仅限本机：创建同类型的下一个账号实例并重启引擎；不会复制任何密钥 |
| GET | `/api/overview` | 全部交易所总览 |
| GET | `/api/overview/stream` | 总览 SSE 实时流 |
| GET | `/api/{ex}/markets` | 市场列表 |
| GET | `/api/{ex}/trend?marketId=&intervalSec=` | K 线 + 趋势分析 |
| GET | `/api/{ex}/state` | 机器人当前状态 |
| GET | `/api/{ex}/stream` | 单所 SSE 实时流 |
| POST | `/api/{ex}/start` | 启动网格（JSON：marketId, mode, lower, upper, gridCount, sizeBase, leverage, outOfRangeAction） |
| POST | `/api/{ex}/stop` | 停止（`{"closePosition": true/false}`） |
| POST | `/api/{ex}/adjust` | 在线调整区间 |
| POST | `/api/{ex}/cancel-orders` | 撤所有挂单 |
| POST | `/api/{ex}/close-position` | 市价平仓 |
| POST | `/api/{ex}/start-recovery` | 启动只减仓回收阶梯 |
| POST | `/api/{ex}/reset` | 重置统计 |
| POST | `/api/{ex}/reconnect` | 重连交易所 |
| GET/POST | `/api/ai/status`, `/api/ai/test`, `/api/ai/chat`, `/api/ai/analyze`, `/api/ai/report`, `/api/ai/sentinel-run`, `/api/ai/market-run` | AI 助手相关 |
| GET | `/api/proxy-check`, `/api/proxy-config` | 代理检测 / 查询 |
| GET/POST | `/api/env-config` | 获取/保存界面化环境配置；密钥只在本机读写，读取时始终脱敏 |
| POST | `/api/env` | 写入白名单内的代理 / AI / 通知配置 |

---

## 十四、常见问题 FAQ

**Q：双击 bat 窗口一闪而过？**
右键 bat → 编辑，确认文件完整；或先打开 cmd，把 bat 拖进去回车运行，即可看到报错信息。

**Q：提示"端口 8080 已被占用"？**
上一个程序窗口没关，先关掉；或编辑 `.env` 把 `PORT=8080` 改成 `8081`，重启后访问 `http://localhost:8081`。

**Q：npm install 很慢或失败？**
执行 `npm config set registry https://registry.npmmirror.com` 切换国内镜像后重试。

**Q：交易所显示"初始化失败 / ENOTFOUND / 连接超时"？**
网络问题。到 ⚙ IP配置页配置代理（见第八节），点"检测当前出口 IP"验证，然后点 🔌 重连交易所。

**Q：模拟模式的行情是真的吗？**
是。paper 模式拉真实行情、用虚拟资金撮合；一般适配器拿不到行情时可能退化为合成数据（界面会标注 dataSource）。Entropy 是明确例外：只接受 Hyperliquid 官方 `io` 实时行情，官方数据不可用时应显示离线，不把合成价格伪装成 Entropy 行情。

**Q：启动网格时报"格距过小"之类的错误？**
格距不够覆盖手续费。减少网格数量或扩大区间。

**Q：启动时报保证金不足？**
降低每格数量、减少格数，或提高杠杆（谨慎）。

**Q：想同时实盘 A 所、模拟 B 所可以吗？**
可以，支持 live 的交易所其 `*_MODE` 各自独立。Entropy 当前只允许 paper，不能作为实盘一侧。

**Q：Arcus 为什么有 API Signing Key，还需要钱包地址？**
钱包地址是公开账户标识；Ed25519 API keypair 经一次 EIP-712 钱包签名后绑定到该地址与子账户，之后机器人只使用专用 API Signing Key 签交易请求。绝不能把主钱包私钥或助记词交给程序。Arcus live 还要求账户已获 Perps Beta 权限且地区符合官方条款。

**Q：为什么 Entropy 不能切换到 live？**
Entropy 虽可通过 Hyperliquid HIP-3 官方 API 真实交易，但当前版本尚未实现并审计 Agent Wallet 签名、nonce、isolated margin/collateral 与恢复流程。为避免把未完成的签名路径包装成实盘，当前只开放官方实时行情驱动的 paper；不需要、也不应填写任何钱包私钥。

**Q：程序会把我的私钥传到哪里吗？**
不会。私钥只在本机 `.env`，仅用于给交易请求签名。代码全部开源可审计。

**Q：怎么彻底重置程序？**
关程序 → 删除 `.state.json`（和 `.env` 如果想清配置）→ 重新启动。

---

## 十五、项目结构

```
├── 一键启动.bat          # 模拟模式一键启动（自动装环境）
├── 实盘启动.bat          # 实盘模式启动（带确认）
├── .env.example          # 配置模板（复制为 .env 使用）
├── package.json          # 依赖与脚本定义
├── public/
│   └── index.html        # 仪表盘前端（单文件，无构建）
├── src/
│   ├── server.js         # HTTP/SSE 服务器与路由
│   ├── bot.js            # 网格机器人核心（下单/补单/风控/恢复）
│   ├── grid.js           # 网格纯函数（铺单/补单规则）
│   ├── config.js         # 根据注册表加载全部交易所配置
│   ├── trend.js          # K 线趋势分析（智能填充用）
│   ├── indicators.js     # 技术指标
│   ├── proxy.js          # 代理设置与检测
│   ├── persist.js        # 状态快照持久化
│   ├── ai/               # AI 助手（provider 适配 + 服务）
│   └── exchange/
│       ├── manifest.js   # 单一配置源：交易所元数据、环境字段、实盘说明
│       ├── instances.js  # 同类型多账号实例、编号环境变量与账号隔离规则
│       ├── registry.js   # 适配器工厂注册与统一实例化
│       ├── de/           # Decibel 接入（live + paper）
│       ├── ex/           # Extended 接入（live + paper + Stark 签名）
│       ├── rs/           # RISEx 接入（live + paper）
│       ├── binance/      # Binance USDⓈ-M 接入（live + paper）
│       ├── ondo/         # Ondo Perps REST/HMAC 接入（live + paper）
│       ├── phoenix/      # Phoenix 官方 SDK/Solana 签名接入（live + paper）
│       ├── nado/         # Nado 官方 SDK/EIP-712 签名接入（live + paper）
│       ├── okx/          # OKX REST/HMAC 与 Demo Trading 接入（live + paper）
│       ├── grvt/         # GRVT API Key 会话/EIP-712 接入（live + paper）
│       └── lr/           # RHC Lighter 官方 Python signer 接入（live + paper）
└── test/
    ├── grid.test.js      # 网格逻辑单元测试
    ├── binance.test.js   # Binance 签名、规则与配置测试
    ├── ondo.test.js      # Ondo HMAC、精度、配置与未知订单测试
    ├── phoenix.test.js   # Phoenix 行情、Post-Only、精确撤单与配置测试
    ├── nado.test.js      # Nado 行情、单位换算、Post-Only、digest 撤单与配置测试
    ├── okx.test.js       # OKX HMAC、Demo 请求头、账户与持仓解析测试
    ├── grvt.test.js      # GRVT 官方字段、会话与 EIP-712 签名测试
    └── lighter.test.js   # RHC 端点、chain ID、官方 signer 与账户解析测试
```

### 15.1 配置化新增下一个交易所

1. 在环境设置的“交易所接入中心”点“复制下一交易所模板”，再在 `src/exchange/manifest.js` 增加定义：简称、名称、主题色、模式/网络/代理变量、能力、健康检查、配置字段、默认 API 与实盘获取说明。
2. 新增适配器工厂，实现模板列出的统一契约：初始化、市场、K 线、价格、限价下单、撤单、真实挂单、持仓和平仓；paper 与 live 由同一工厂选择，启动时会自动校验缺失方法。
3. 在 `src/exchange/registry.js` 注册工厂。服务器会自动生成路由、SSE、总览、AI 巡检、代理与环境白名单。
4. 仪表盘从 `/api/exchanges` 读取定义，自动生成页签、控制台、总览卡、环境表单、代理输入和实盘说明，无需再复制修改整套页面逻辑。

接入时仍必须为真实交易所补充针对性的签名、精度、最小名义价值、持仓模式与“订单状态未知”处理；配置化负责消除重复编排，不会绕过交易安全检查。

---

## 十六、安全须知

1. **`.env` 是最高机密**：里面的私钥等于你的资金控制权。不要截图、不要发群、不要提交到任何代码仓库（`.gitignore` 已默认排除，fork 后请保留）。
2. **优先使用交易所的 API 钱包 / API Key**，而不是主钱包私钥——API 凭据通常只有交易权限、无提币权限，泄露损失可控。
3. **实盘前先模拟**：同样的参数先在 paper 模式跑几天，理解成交节奏和风险再上真钱。
4. **小资金起步**：首次实盘用你亏得起的钱。
5. **仪表盘默认只监听本机**（localhost）。若日志提示监听 `0.0.0.0`，说明局域网内其他设备也能访问，请确保网络环境可信。
6. 本程序没有远程服务器、不上传任何数据，所有状态都在你本机。

---

祝交易顺利 📈
