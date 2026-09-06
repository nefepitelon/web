# 观潮量化 TideSight Quant

TideSight Quant 是 WELINKBTC 的低频趋势与市场中性量化控制平面。WELINKBTC 负责信号、界面、人工审批和运行可见性；交易所资金始终留在独立子账户。

## 唯一生产链路

```text
WELINKBTC / Freqtrade / Jesse
              ↓ normalized Signal
       Portfolio Allocator
              ↓ target position
          Risk Engine
              ↓ approved plan
   Order Manager（唯一写入者）
              ↓
 CCXT / Hummingbot / venue adapter
              ↓
       Exchange subaccount
              ↓
 PostgreSQL facts + reconciliation
```

策略进程禁止直接持有生产下单权。外部策略使用 `POST /api/tidesight/signals` 写入标准信号；该入口只接受 `paper`、`mock_exchange` 和 `testnet`，不能创建 `live` 意图。生产实盘必须经过已登录管理员会话、2FA、凭据预检、健康对账、无提现权限确认、独立解锁和计划级人工确认。

## 运行职责

| 层 | 职责 | 推荐运行位置 |
| --- | --- | --- |
| WELINKBTC | 页面、信号入口、审批、审计查询 | Vercel |
| 数据采集 | OHLCV、资金费率、基差、订单簿、链上和预测市场 | 常驻 Worker |
| Freqtrade / Jesse | 策略研究和信号生成 | 独立容器 |
| Portfolio Allocator | 合并信号并输出目标仓位 | 独立服务 |
| Risk Engine | 敞口、杠杆、回撤、流动性、去重与熔断 | WELINKBTC + 独立副本 |
| Hummingbot / CCXT | 唯一执行适配器 | 靠近交易所的常驻容器 |
| hftbacktest | L2 / 逐笔成交回放与故障注入 | 离线研究集群 |
| PostgreSQL | 信号、计划、订单、成交、仓位、对账与审计事实 | 托管数据库 |

## 分阶段上线

1. `PAPER`：固定数据集回测、Walk-forward、无未来函数检查。
2. `SHADOW`：实时行情、模拟成交、记录预期与实际可成交价格。
3. `TESTNET`：真实交易所签名、过滤器、订单状态机和对账。
4. `LIVE`：独立子账户、小额、低杠杆、提现和划转永久关闭。
5. 扩容：只有压力模型回撤、纸面/实盘偏差和故障恢复持续达标后才提高额度。

## 不在 Vercel 内运行的组件

Freqtrade、Jesse、Hummingbot、CCXT 常驻执行器和 hftbacktest 不应伪装成 Vercel Serverless Function。它们需要独立常驻容器、私网、密钥管理、队列、心跳和进程监督；WELINKBTC 只暴露版本化契约与受控命令面。
