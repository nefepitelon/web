# STM hunt 公开榜单与手动更新

核查日期：2026-11-25。接入代码：`lib/stm-hunt/radar.ts`；页面「同步数据」同时检查工作台、当前榜单与已展开资料。更新请求使用固定来源、超时、响应大小限制、限流、缓存和单请求合并；不能强制第三方重新生成榜单。

| 平台 | 公开接口及当前交付 | 真实边界 |
| --- | --- | --- |
| FOMO | 默认总榜采用 `https://web3smartmoney.com/fomo/data/traders.json` 的公开 Top100（ALL-TIME），首次返回已披露资产、主要持仓与链分布；`https://985monitor.xyz/fomo-leaderboards.json` 提供独立的 24h/7d/30d 排行；`/api/fomo-watch/profile?handle=...` 补充公开资料与来源成交 | 本次 WSM 总榜实际时间仍为 2026-11-19，93 位有可用资产及持仓快照；其余 7 位虽有原始金额字段 0，但无持仓时间或记录，按未知处理。985 周期榜仍为 2026-11-17 的 30 人快照，不与总榜混排。官方 `prod-api.fomo.family` 用户及榜单接口匿名读取返回 unauthorized；公开主页元数据不等于持仓。钱包、持仓、盈亏、成交分别保留时间，只通过明确 UUID 或完整钱包证明身份关联；WSM 的 X handle 与 `fomo_api_handle` 分开使用。 |
| Hyperliquid | `https://stats-data.hyperliquid.xyz/Mainnet/leaderboard`；`POST https://api.hyperliquid.xyz/info` 的 `clearinghouseState` / `userFills` | 已验证匿名读取。榜单包含多个收益窗口；账户详情仅默认永续 DEX，非全部现货、Vault、HIP-3 账户。仅明确的开仓/平仓成交与起始数量用于分类增减仓，跨越多空的复杂成交不强行分类。 |
| Lighter | `https://mainnet.zklighter.elliot.ai/api/v1/pnlLeaderboard`；`/account?by=l1_address&value=...` | 已验证公开收益榜与账户仓位。榜单保留 `updated_at`，账户没有仓位生成时间时保持未知。只展示首个匹配子账户；未接入需要账户权限的完整成交记录。 |
| Binance | 页面保留 WSM 的 CEX 跟单账户榜单；独立研究接口 `/api/stm-hunt/radar?venue=binance&period=7d`（或 `30d`）接入 Web3 公共钱包收益榜 `/bapi/defi/v1/public/wallet-direct/market/leaderboard/query/ai`，每页 25 个 Solana 钱包 | Web3 链上钱包榜单与 CEX 跟单账户是不同数据集，不能替换身份、收益或持仓。本地样本请求连接失败时返回来源不可用，未宣称已验证实时数据；页面默认不会把该数据混入 CEX 榜单。 |
| Pump.fun | 当前保留 WSM 历史来源；正式 `/v1/pnl-leaderboard` 已查明 | 正式接口需要获批组织的服务端 Bearer key 和 `leaderboards.read` scope。未取得凭据，不把第三方旧快照标成实时。 |
| OKX | 当前保留 WSM 历史来源；正式 `/api/v6/dex/market/leaderboard/list` 已查明 | 正式接口需要服务端签名、API key 及相应权限/额度。历史盈利代币列表不是当前持仓；未取得授权，不接入受限接口。 |

新增研究接口与 S1–S5 证据、钱包审核和交易授权分离。来源报告的成交不等于本平台已验证收据；USD 市值变化不用于推断买入、加仓、卖出或减仓。缓存保留失败前的结果时，显示保留状态与实际来源时间。不同收益窗口不相互填充。

v1.5 所有平台榜单按筛选结果完整平铺，不再分页。FOMO 总榜首屏直接显示来源已有的持仓，无需逐行展开才能加载。总榜使用稳定的 WSM 身份查询详情；985 资料缺失、上游拒绝或身份不符时，继续保留该交易员的已知 WSM 持仓。公开披露不保证完整钱包组合，也不表示实时链上余额。

主要资料：

- [FOMO 参考页面](https://985monitor.xyz/fomo/)
- [Hyperliquid 官方 Info API](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint)
- [Lighter 官方 API 文档](https://apidocs.lighter.xyz/)
- [Binance 官方公开榜单代码](https://github.com/binance/binance-skills-hub/blob/main/skills/binance-web3/crypto-market-rank/scripts/cli.mjs)
- [Pump 认证](https://docs.pump.fun/authentication/)、[权限](https://docs.pump.fun/scopes/)、[额度](https://docs.pump.fun/limits-and-headers/)、[使用条款](https://docs.pump.fun/terms/)
- [OKX 榜单接口](https://web3.okx.com/onchainos/dev-docs/market/market-signal-leaderboard-list)、[额度](https://web3.okx.com/onchainos/dev-docs/market/market-api-fee)

后续接入需要凭据的平台时，在服务端配置授权并重新核查对应数据使用条件；不向浏览器发送密钥，不借用浏览器登录状态绕过上游限制。
