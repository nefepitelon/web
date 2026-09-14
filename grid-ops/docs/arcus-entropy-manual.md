<!-- GRID_OPS_ARCUS_ENTROPY_BEGIN -->
## 11. Arcus 配置

官方入口：

- [Arcus 官网与地区资格说明](https://arcus.xyz/)
- [Arcus 应用](https://app.arcus.xyz/ref/WELINKBTC)
- [Arcus REST 下单指南](https://docs.arcus.xyz/guides/rest-trading)
- [Arcus WebSocket 下单指南](https://docs.arcus.xyz/guides/websocket-trading)
- [Arcus 完整 API 索引](https://docs.arcus.xyz/llms.txt)

Arcus `paper` 使用官方公开实时行情并在本机模拟成交。Arcus `live` 可以通过官方 Perps REST / WebSocket API 完整下单，但当前产品仍处于 **Perps Beta**：只有已获相应权限、且所在国家或地区符合 Arcus 条款的账户才能启用。获得 Spot Beta 或使用 Spot SDK，不代表该账户已有 Perps API 权限。

```dotenv
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
ARCUS_PROXY=
```

| 字段 | 何时必填 | 填写内容 |
|---|---|---|
| `AR_MODE` | 总是 | `paper` 或 `live`。未获 Perps Beta/地区资格时必须保持 `paper`。 |
| `AR_NETWORK` | 总是 | `mainnet` 或 `testnet`；两套环境的 API key 不通用。 |
| `ARCUS_ADDRESS` | 实盘必填 | 获授权的钱包公开地址：`0x` + 40 位十六进制。绝不是 Ethereum / Robinhood Chain 主钱包私钥。 |
| `ARCUS_ACCOUNT_INDEX` | 实盘必填 | 创建 API key 返回的子账户编号 `0-9`。 |
| `ARCUS_API_KEY` | 实盘必填 | Arcus 专用 Ed25519 API 公钥。 |
| `ARCUS_API_PRIVATE_KEY` | 二选一 | 与 API 公钥配对的 Ed25519 API Signing Key；不是钱包私钥。 |
| `ARCUS_API_PRIVATE_KEY_FILE` | 二选一 | 指向 Signing Key 文件的相对或绝对路径，例如 `secrets/arcus-private.pem`。 |
| `ARCUS_GOOD_TIL_DAYS` | 建议保留 | 程序限制为 32–180 天，默认 40 天。 |
| `ARCUS_FEE_RATE` | 建议保留 | 无法读取账户实际费率时的保守回退值。 |
| `ARCUS_API_URL` / `ARCUS_WS_URL` | 通常留空 | 留空按网络使用官方 REST / WebSocket；不要填第三方镜像。 |
| `ARCUS_PROXY` | 可选 | 仅 Arcus 请求使用的代理。 |

在 Arcus 应用的 API Keys 页面创建 Ed25519 API keypair 时，需要用一次 EIP-712 钱包签名把 API 公钥绑定到公开地址与子账户。此后机器人只应使用专用 API Signing Key 给交易请求签名。REST 私有请求按官方规范使用 `X-API-Key`、纳秒时间戳 `X-Timestamp` 与 `X-Signature`；不要自行改变待签名消息或时间单位。

推荐把 Signing Key 保存为本机文件：

1. 在项目根目录创建 `secrets` 文件夹。
2. 把 Arcus 导出的 Signing Key 文件放入其中。
3. 保持 `ARCUS_API_PRIVATE_KEY=` 为空。
4. 配置 `ARCUS_API_PRIVATE_KEY_FILE=secrets/arcus-private.pem`。

程序会从私钥推导公钥并与 `ARCUS_API_KEY` 比较，不匹配时拒绝实盘启动；还会检查地址、accountIndex、账户权限和权益快照。**Arcus 主钱包私钥和任何助记词永远不应该进入本程序。**

实盘预检必须从官方 `/v1/markets` 动态读取市场 ID、`status`、`tickSize`、分层 `tickTiers`、`stepSize`、`minOrderNotional` 与 `minOrderSize`。价格和数量必须按官方要求保留为精确十进制字符串；离线市场、未按当前价格档 tick 对齐的价格、或不满足最小值的数量必须在签名前拒绝，不能硬编码旧规则。Arcus 官方 `arcus-spot-sdk` 服务于 Spot RFQ，不是永续订单簿 SDK，不能用它替代本节的 Perps API。

## 11.1 Entropy 配置（Hyperliquid HIP-3；仅 Paper）

官方入口：

- [Entropy 官方文档](https://docs.entropy.io/)
- [Hyperliquid HIP-3 官方说明](https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-3-builder-deployed-perpetuals)
- [Hyperliquid Perpetuals Info API](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/perpetuals)
- [Hyperliquid 资产 ID 规则](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids)
- [Hyperliquid 价格与数量精度](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/tick-and-lot-size)

Entropy 是 Hyperliquid 上 DEX 标识为 `io` 的 HIP-3 市场部署者。当前接入只从 Hyperliquid 官方 API 获取实时市场、订单簿与 K 线，并在本机用虚拟余额模拟成交；**不签名、不发送真实订单，也不开放 `live`**。

```dotenv
ENTROPY_MODE=paper
ENTROPY_NETWORK=mainnet
ENTROPY_DEX=io
ENTROPY_API_URL=https://api.hyperliquid.xyz
ENTROPY_PROXY=
```

| 字段 | 何时必填 | 填写内容 |
|---|---|---|
| `ENTROPY_MODE` | 总是 | 当前只能是 `paper`；填写 `live` 必须 fail-closed，不能静默降级后仍显示 LIVE。 |
| `ENTROPY_NETWORK` | 总是 | 当前为 `mainnet`。 |
| `ENTROPY_DEX` | 总是 | 官方 HIP-3 DEX 标识 `io`。 |
| `ENTROPY_API_URL` | 总是 | Hyperliquid 官方 API **基地址** `https://api.hyperliquid.xyz`；程序在其后调用 `/info`，不要在配置值中追加 `/info`。 |
| `ENTROPY_PROXY` | 可选 | 仅 Entropy 官方行情请求使用的代理。 |

市场名称形如 `io:ANTH`。实际市场清单、顺序、下架状态、`szDecimals`、`marginMode` 和 asset ID 必须以官方 `meta(dex:"io")` 的实时结果为准，不得硬编码历史市场，也不要臆造 `api.entropy.io` 一类接口。官方数据不可用时应显示离线，不能用合成价格冒充 Entropy 实时行情。

Entropy Paper 不需要任何账户或密钥。不要在本项目中填写 Hyperliquid 主钱包私钥、助记词或 Agent/API Wallet 私钥。只有未来完成并审计 Agent Wallet 签名、nonce、HIP-3 isolated margin / collateral、动态 asset ID、订单状态确认与撤单恢复后，才能单独评估实盘接入；在此之前界面和文档均不得宣称 Entropy 支持实盘。
<!-- GRID_OPS_ARCUS_ENTROPY_END -->
