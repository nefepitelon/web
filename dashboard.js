const themeButtons = document.querySelectorAll(".theme-toggle");
const langButtons = document.querySelectorAll(".lang-toggle");
const refreshButton = document.querySelector("#refresh-data");
const onchainSupportOpenButton = document.querySelector("#onchain-support-open");
const onchainSupportCloseButton = document.querySelector("#onchain-support-close");
const onchainSupportDrawer = document.querySelector("#onchain-support-drawer");
const onchainSupportBackdrop = document.querySelector("#onchain-support-backdrop");
const onchainSupportFrame = document.querySelector("#onchain-support-frame");
const onchainSupportLoading = document.querySelector("#onchain-support-loading");
const menuButton = document.querySelector(".menu-button");
const mobileMenu = document.querySelector("#mobile-menu");
const referenceGrid = document.querySelector("#reference-grid");
const trendIndexList = document.querySelector("#trend-index-list");

const translations = {
  zh: {
    "nav.network": "网络",
    "nav.products": "产品",
    "nav.research": "研究",
    "nav.alphaops": "AlphaOps",
    "nav.alpharadar": "Alpha Radar",
    "nav.dashboard": "链上看板",
    "nav.contact": "联系",
    "tools.theme": "浅色",
    "tools.themeLight": "深色",
    "tools.binanceChat": "币安聊天室",
    "tools.support": "支持",
    "hero.titleMain": "BTC 链上数据",
    "hero.titleAccent": "指标看板",
    "hero.text": "用周期估值、链上行为、矿工压力、衍生品与资金流回答一个问题：比特币现在处于什么位置。",
    "status.title": "数据脉冲",
    "status.loading": "正在同步公共数据源...",
    "status.ready": "实时数据已同步，所有时间统一显示为北京时间。",
    "status.partial": "公共数据已同步，部分授权指标暂不可用。",
    "status.error": "数据源暂时不可用，请稍后刷新。",
    "status.refresh": "刷新数据",
    "support.open": "链上支持",
    "support.title": "链上支持",
    "support.external": "新窗口打开",
    "support.loading": "正在连接链上支持...",
    "cyclePulse.eyebrow": "Cycle Sentiment",
    "cyclePulse.title": "周期钟摆与市场情绪",
    "cyclePulse.text": "把链上估值、长期均线、杠杆与情绪压缩成两个可快速扫描的实时刻度。",
    "cyclePulse.live": "实时同步",
    "cyclePulse.pendulum": "周期钟摆",
    "cyclePulse.fearGreed": "恐惧 & 贪婪指数",
    "cyclePulse.currentState": "当前周期状态",
    "cyclePulse.sentimentState": "市场情绪状态",
    "cyclePulse.waiting": "等待数据",
    "cyclePulse.pending": "同步后综合链上估值、长期均线、杠杆与市场情绪。",
    "cyclePulse.fearGreedPending": "情绪指数按公开数据源更新，用于观察市场风险偏好。",
    "cyclePulse.capitulation": "投降",
    "cyclePulse.accumulation": "累积",
    "cyclePulse.neutral": "中性",
    "cyclePulse.overheated": "过热",
    "cyclePulse.euphoria": "狂热",
    "trendNav.title": "趋势指标导航",
    "trendNav.text": "点击名称快速定位",
    "section.overview": "市场概览",
    "section.carousel": "2/3D指标轮询集",
    "section.valuation": "周期估值",
    "section.network": "矿工与网络",
    "section.charts": "趋势图表",
    "section.reference": "指标库",
    "carousel.loading": "正在载入 2/3D 指标轮询集...",
    "carousel.error": "2/3D 指标轮询集暂时无法载入",
    "power.subtitle": "链上趋势快照",
    "power.view": "View 视图",
    "power.model": "Indicator 指标",
    "power.period": "Period 周期",
    "power.live": "实时链上快照",
    "power.eyebrow": "链上数据指标",
    "power.title": "用周期估值、链上行为、矿工压力、衍生品与资金流回答一个问题：比特币现在处于什么位置。",
    "power.topicCycle": "周期估值",
    "power.topicBehavior": "链上行为",
    "power.topicMiners": "矿工压力",
    "power.topicDerivatives": "衍生品",
    "power.topicFlows": "资金流",
    "kpi.price": "BTC 实时价格",
    "kpi.fng": "恐惧 & 贪婪",
    "kpi.ahr": "AHR999 定投指数",
    "kpi.ahrNote": "200DMA 与幂律拟合价格",
    "kpi.mvrv": "MVRV Ratio",
    "kpi.mvrvNote": "<1 低估 · >3.5 过热",
    "kpi.wma": "200 周均线",
    "kpi.wmaNote": "当前价格 / 200WMA",
    "kpi.halving": "减半倒计时",
    "signal.api": "数据同步中",
    "valuation.title": "周期估值矩阵",
    "valuation.text": "把长期价值锚、持币者盈亏与矿工压力放在同一张决策桌上。",
    "mode.all": "全部",
    "mode.value": "估值",
    "mode.holder": "持币者",
    "mode.miner": "矿工",
    "metric.balancedState": "周期底部参考",
    "metric.balancedNote": "已实现价格减去转移价格，需要链上成本基础数据。",
    "metric.mvrvzState": "估值偏差",
    "metric.mvrvzNote": "<0 深度价值 · >7 历史泡沫区。",
    "metric.nuplNote": "持币者净未实现利润与亏损。",
    "metric.soprNote": "<1 平均亏损卖出 · >1 平均盈利卖出。",
    "metric.puellNote": "<0.5 矿工深度压力 · >4 收入过热。",
    "metric.psipState": "获利筹码占比",
    "metric.psipNote": "识别持币者群体是否接近历史投降区。",
    "network.title": "矿工与网络状态",
    "network.text": "网络安全预算、难度和手续费共同反映矿工经营压力。",
    "network.electricity": "参考电费",
    "network.hashrate": "全网算力",
    "network.difficulty": "网络难度",
    "network.fee": "推荐手续费",
    "network.block": "当前区块",
    "network.blockTime": "约 10 分钟/块",
    "derivatives.title": "衍生品与资金流",
    "costBasis.title": "BTC：关键成本基础定价模型",
    "costBasis.subtitle": "用现价、短期持有者成本与真实市场均价识别深度洗盘后的底部构筑窗口。",
    "costBasis.price": "BTC 实时价格",
    "costBasis.sthNote": "155 日短期持有者成本",
    "costBasis.tmmpNote": "活跃投资者真实均价",
    "costBasis.loading": "正在同步链上成本基础序列...",
    "costBasis.signalLabel": "链上状态",
    "costBasis.waiting": "等待数据同步",
    "costBasis.signalPending": "同步完成后，将按真实序列计算死叉日期、当前差值与收敛速度。",
    "costBasis.crossDate": "最近死叉",
    "costBasis.crossDays": "死叉后经过",
    "costBasis.convergence": "14 日收敛速度",
    "costBasis.window": "历史均值窗口",
    "costBasis.analysisToggle": "指标分析",
    "costBasis.explainTitle": "STH 与 TMMP“死亡交叉”再现，历史级底部或在 157 天内确认",
    "costBasis.explainOne": "STH Realized Price 代表过去 155 天内移动过的比特币平均成本，反映近期入场资金的盈亏边界；True Market Mean Price 剔除矿工成本与长期休眠筹码，刻画活跃投资者的真实市场均价。",
    "costBasis.explainTwo": "当 STH 成本线向下跌破 TMMP，近期投资者普遍承压，市场通常进入深度洗盘后期。它不是单独的买卖信号，更适合与流动性、矿工压力和现货需求共同确认底部构筑。",
    "costBasis.daysToBottom": "天至周期底部",
    "costBasis.average": "历史平均",
    "costBasis.days": "天",
    "costBasis.disclaimer": "历史窗口仅用于周期研究，不构成投资建议；链上指标按日更新，实时价格与链上成本线的时间戳可能不同。",
    "ratio.title": "BTC：STH-RP 与 TMMP 的比例",
    "ratio.subtitle": "短期持有者实现价格 / 真实市场平均价格，用于识别均值回归压力与周期级底部区间。",
    "ratio.current": "当前比例",
    "ratio.avg7": "7 日均值",
    "ratio.avg30": "30 日均值",
    "ratio.distance": "距 0.75 信号线",
    "ratio.loading": "正在同步 STH-RP / TMMP 比例序列...",
    "ratio.signalLabel": "比例状态",
    "ratio.waiting": "等待比例数据同步",
    "ratio.signalPending": "同步完成后，将计算当前比例、短期均值、趋势与底部信号距离。",
    "ratio.asOf": "链上日期",
    "ratio.projection": "7 日趋势投影",
    "ratio.thresholdDistance": "阈值距离",
    "ratio.stage": "市场阶段",
    "ratio.explainTitle": "短期筹码进入均值回归，0.75 仍是周期底部观察线",
    "ratio.explainOne": "STH-RP / TMMP 衡量短期持有者成本相对活跃投资者真实市场均价的位置。比例低于 1，代表短期筹码成本已经低于市场真实均价，市场通常处于降温、去杠杆或均值回归阶段。",
    "ratio.explainTwo": "历史上该比例接近 0.75 时，往往对应深度恐慌与筹码换手后的周期底部窗口：2015、2018 与 2022 年的信号分别与最终底部相差约 7、9 与 48 天。",
    "ratio.explainThree": "当前值高于 0.75 时，说明市场虽有压力但尚未进入历史级极端区域。稳健型投资者可等待趋势企稳或比例进一步接近阈值；定投策略可将其作为分批配置参考，但仍需控制仓位并结合流动性与现货需求。",
    "ratio.historyOffset": "距周期底部偏差",
    "ratio.historyLead": "提前周期底部",
    "ratio.threshold": "历史底部信号线",
    "ratio.disclaimer": "比例由同日 STH Realized Price 与 True Market Mean Price 计算，按日更新，仅用于周期研究，不构成投资建议。",
    "lth.title": "BTC：<10年/<7年/<5年零实现价",
    "lth.subtitle": "按 UTXO 年龄段聚合长期持有者的真实成本，观察利润兑现与熊市连环交叉进度。",
    "lth.price": "BTC 实时价格",
    "lth.allCost": "全网 0–10 年平均成本",
    "lth.midCost": "中期老手成本",
    "lth.longCost": "长期老手成本",
    "lth.ultraCost": "极长期持有者成本",
    "lth.loading": "正在同步长期持有者年龄段成本序列...",
    "lth.authRequired": "CryptoQuant 当前套餐未开放 UTXO 年龄段数据，请开通对应 API 权限后重试。",
    "lth.authTitle": "年龄段数据权限待开通",
    "lth.authCopy": "环境变量已连接，但当前 CryptoQuant 套餐返回 403，暂时无法生成长期持有者年龄段成本线。其他实时指标不受影响。",
    "lth.unavailable": "长期持有者年龄段数据暂时不可用，请稍后重试。",
    "lth.signalLabel": "持币成本状态",
    "lth.waiting": "等待年龄段数据同步",
    "lth.signalPending": "同步完成后，将计算 BTC 相对四条成本线的利润空间与连环交叉进度。",
    "lth.asOf": "链上日期",
    "lth.crossProgress": "连环交叉进度",
    "lth.pricePremium": "相对中期成本",
    "lth.stage": "市场阶段",
    "lth.explainTitle": "长期持有者成本线揭示利润兑现阶段与熊市底部的连环交叉",
    "lth.explainOne": "0–10 年实现价代表十年内活跃筹码的综合成本；6 月–5 年、6 月–7 年和 6 月–10 年实现价则逐步扩展长期持有者窗口。现价高于全部成本线，代表大部分筹码仍有较高未实现利润，获利盘抛压可能随波动放大。",
    "lth.explainTwo": "历史熊市的深度出清阶段，0–10 年基准成本会依次向下穿过 6 月–5 年、6 月–7 年和 6 月–10 年成本线。三次交叉全部完成，才更接近筹码充分换手后的宏观底部结构。",
    "lth.explainThree": "当前基准线仍高于长期成本线时，市场更接近利润兑现而非最终投降。避免只因价格回调盲目追高；持有低成本筹码的投资者可结合现货需求、流动性与止损基准管理风险。",
    "lth.cross5y": "0–10Y 跌破 6M–5Y",
    "lth.cross7y": "0–10Y 跌破 6M–7Y",
    "lth.cross10y": "0–10Y 跌破 6M–10Y",
    "lth.disclaimer": "实现价由对应年龄段已实现资本总和除以供应量总和计算，按日更新，仅用于周期研究，不构成投资建议。",
    "rpl.title": "BTC：实现利润与实现损失比",
    "rpl.subtitle": "比较链上转移中已实现利润与已实现损失，识别获利主导、投降阶段与周期底部区间。",
    "rpl.current": "当前比率",
    "rpl.trend": "7 日趋势",
    "rpl.averages": "7D / 30D 均值",
    "rpl.averageNote": "短期方向确认",
    "rpl.distance": "距离 1.0",
    "rpl.loading": "正在同步已实现盈亏完整历史序列...",
    "rpl.waiting": "等待公开数据同步",
    "rpl.signalLabel": "已实现盈亏状态",
    "rpl.signalPending": "同步完成后，将判断当前市场由获利了结还是割肉止损主导。",
    "rpl.crossDate": "30D 均值跌破 2.2",
    "rpl.daysSince": "预警后天数",
    "rpl.profitSma": "利润 365D SMA",
    "rpl.lossSma": "损失 365D SMA",
    "rpl.explainTitle": "盈亏比跌破 1.0，代表链上割肉金额超过获利了结金额",
    "rpl.explainOne": "已实现盈亏比用链上转移产生的已实现利润除以已实现损失。比率高于 1.0 时，市场由获利了结主导；低于 1.0 时，亏损兑现超过盈利兑现，通常对应投降、筹码换手与情绪极度承压阶段。",
    "rpl.explainTwo": "2.2 是周期降温的早期观察线，1.0 是利润与损失的绝对平衡线。历史上从 2.2 下行至 1.0 的窗口分别约为 53、64 与 218 天，但历史节奏不等同于未来结果。",
    "rpl.explainThree": "当比率处于 1.0 下方时，说明抛售结构已偏向亏损兑现，但这不是单独的买入指令。应同时观察现货需求、流动性、短期持有者成本与价格结构，判断抛压是否真正进入尾声。",
    "rpl.daysToBottom": "天到达底部区",
    "rpl.currentCycle": "本轮周期",
    "rpl.daysElapsed": "天已经过",
    "rpl.disclaimer": "比例采用 BGeometrics 公开日频链上数据；利润与损失金额按 BTC 日价格换算并显示 365 日均线。数据按日更新，仅用于周期研究，不构成投资建议。",
    "medianRp.title": "BTC：中位实现价格",
    "medianRp.subtitle": "以全网 BTC 成本分布的第 50 百分位衡量典型持有者成本，观察价格对核心盈亏平衡线的测试。",
    "medianRp.price": "BTC 实时价格",
    "medianRp.median": "中位实现价格",
    "medianRp.ratio": "价格 / 中位数比率",
    "medianRp.monthly": "月度趋势",
    "medianRp.loading": "正在同步中位实现价格日频序列...",
    "medianRp.waiting": "等待公开数据同步",
    "medianRp.signalLabel": "典型持有者成本状态",
    "medianRp.signalPending": "同步完成后，将判断 BTC 是否正在测试中位成本支撑。",
    "medianRp.oneYear": "一年前成本",
    "medianRp.fourYears": "四年前成本",
    "medianRp.yoy": "同比增长",
    "medianRp.fourYearGrowth": "四年增长",
    "medianRp.explainTitle": "中位实现价格刻画“典型投资者”的成本底线",
    "medianRp.explainOne": "中位实现价格是所有 BTC 最后一次在链上移动时成本分布的中位数：一半供应最后移动价格高于它，另一半低于它。与容易受极端大额筹码影响的平均成本相比，中位数更贴近典型持有者。",
    "medianRp.explainTwo": "当现价接近中位实现价格时，市场正在测试核心参与者的盈亏平衡线，历史上常表现为重要支撑或阻力。价格略高于该线通常代表整体微利，但不等同于底部已经确认。",
    "medianRp.explainThree": "稳健型投资者可关注现价能否在中位成本线上方持续企稳，并结合成交量、短期持有者成本与流动性确认。跌破后若无法快速收复，该成本线也可能转化为阻力。",
    "medianRp.liveRatio": "当前比率",
    "medianRp.supportGap": "支撑距离",
    "medianRp.dataMode": "数据模式",
    "medianRp.status": "当前状态",
    "medianRp.typicalCost": "典型成本线",
    "medianRp.disclaimer": "历史线使用 BGeometrics 公开 HODL Waves 供应量与各年龄段对应的历史移动价格重建，并由公开可验证的中位实现价格观测校准；校准日保留原始观测，其余日期为透明的公开估算。仅用于周期研究，不构成投资建议。",
    "lthSth.title": "BTC：LTH/STH 成本基础比",
    "lthSth.subtitle": "比较长期与短期持有者实现价格，观察筹码成本重构、0.48 恢复线与趋势反转窗口。",
    "lthSth.current": "当前比率",
    "lthSth.lth": "LTH 实现价格",
    "lthSth.sth": "STH 实现价格",
    "lthSth.lthNote": "持有超过 155 天",
    "lthSth.sthNote": "持有不超过 155 天",
    "lthSth.averages": "7D / 30D 均值",
    "lthSth.loading": "正在同步 LTH/STH 成本基础比历史序列...",
    "lthSth.waiting": "等待公开数据同步",
    "lthSth.signalLabel": "长短期成本状态",
    "lthSth.signalPending": "同步完成后，将计算 0.48 上穿日期、近期峰值、趋势与成本收敛程度。",
    "lthSth.crossDate": "最近上穿 0.48",
    "lthSth.daysSince": "上穿后天数",
    "lthSth.dailySlope": "7 日日均变化",
    "lthSth.recentPeak": "近一年峰值",
    "lthSth.explainTitle": "LTH 与 STH 成本差距缩小，市场进入筹码换手与成本重构阶段",
    "lthSth.explainOne": "LTH 实现价格代表持有超过 155 天筹码的平均成本，STH 实现价格代表持有不超过 155 天筹码的平均成本。两者比率上升，说明长期持有者成本正在追近短期持有者，筹码结构逐步收敛。",
    "lthSth.explainTwo": "比率低于 0.48 时，历史上通常对应熊市深度积累；向上收复 0.48 并继续靠近周期峰值，往往发生在成本重构完成、趋势准备反转的阶段。它是周期观察工具，不是单独的买卖信号。",
    "lthSth.explainThree": "比率持续上行意味着长短期持仓成本差距缩小。最终峰值常与趋势反转或新一轮行情启动相邻，但仍需结合现货需求、流动性、宏观环境与价格结构共同确认。",
    "lthSth.daysToPeak": "天到达峰值",
    "lthSth.currentCycle": "本轮周期",
    "lthSth.daysElapsed": "天已经过",
    "lthSth.disclaimer": "比率由 BGeometrics 公开日频 LTH 与 STH 实现价格直接计算，BTC 实时价格来自公开现货源；数据按日更新，仅用于周期研究，不构成投资建议。",
    "lthLoss.title": "BTC：LTH 亏损市值 / 活跃市值（剔除 >10Y）",
    "lthLoss.subtitle": "衡量活跃市值中处于水下的长期持有者仓位比例，剔除持有超过 10 年的休眠筹码。",
    "lthLoss.current": "当前比率",
    "lthLoss.threshold": "熊市阈值",
    "lthLoss.distance": "距离 27%",
    "lthLoss.averages": "7D / 30D 均值",
    "lthLoss.loading": "正在同步 LTH 亏损市值占比历史序列...",
    "lthLoss.waiting": "等待公开数据同步",
    "lthLoss.signalLabel": "长期持有者亏损状态",
    "lthLoss.signalPending": "同步完成后，将计算 27% 阈值距离、短期趋势、历史峰值与当前周期状态。",
    "lthLoss.historicalPeak": "历史峰值",
    "lthLoss.dailyChange": "7 日日均变化",
    "lthLoss.thresholdStatus": "阈值状态",
    "lthLoss.referencePrice": "BTC 参考价格",
    "lthLoss.explainTitle": "亏损比例正在抬升，但尚未进入历史级长期持有者投降区",
    "lthLoss.explainOne": "公开代理口径以长期持有者亏损筹码的现价市值，除以 155 天至 10 年长期筹码的活跃市值。比率上升说明更多坚定持有者进入浮亏，链上压力正在累积。",
    "lthLoss.explainTwo": "历史上约 27% 的极值曾与 2015、2018 和 2022 年熊市底部相邻。这种关系是历史观察，不是固定铁律；达到阈值只说明长期筹码承压充分，仍需价格结构、流动性和现货需求确认。",
    "lthLoss.explainThree": "当前值与 27% 的差距可以衡量市场距离历史投降区还有多远。持续上升代表亏损扩散，回落则说明成本压力缓解；投资者应同时观察趋势速度，而不是只盯一个静态阈值。",
    "lthLoss.peak": "峰值",
    "lthLoss.btcPrice": "当时 BTC",
    "lthLoss.currentCycle": "当前周期",
    "lthLoss.toThreshold": "距 27%",
    "lthLoss.disclaimer": "数据使用 BGeometrics 公开日频序列重建：LTH 亏损筹码现价市值 ÷ 155 天至 10 年 LTH 筹码现价市值。这是可审计的公开代理模型，与付费数据商按 UTXO 成本基础计算的原始指标可能存在偏差；按日更新，仅用于周期研究。",
    "supplyPl.title": "比特币：盈亏供应比（剔除 >7Y）",
    "supplyPl.subtitle": "比较活跃盈利与亏损供应量，剔除休眠超过 7 年筹码，并以 7 日移动平均识别周期投降窗口。",
    "supplyPl.current": "当前比率（7D MA）",
    "supplyPl.distribution": "盈亏分布",
    "supplyPl.averages": "7D / 30D 均值",
    "supplyPl.referencePrice": "BTC 参考价格",
    "supplyPl.loading": "正在同步活跃盈亏供应比历史序列...",
    "supplyPl.waiting": "等待公开数据同步",
    "supplyPl.signalLabel": "活跃供应盈亏状态",
    "supplyPl.signalPending": "同步完成后，将计算 1.0 阈值、短期趋势、盈亏分布与当前底部区持续时间。",
    "supplyPl.trend": "7 日趋势",
    "supplyPl.distance": "距离 1.0",
    "supplyPl.daysBelow": "低于 1.0 天数",
    "supplyPl.asOf": "链上日期",
    "supplyPl.explainTitle": "盈亏供应比衡量活跃市场承压程度，低于 1.0 对应极端投降区",
    "supplyPl.explainOne": "该公开代理模型以全网盈利供应量减去 7–10 年与 10 年以上休眠筹码，再除以全网亏损供应量，并对结果应用 7 日移动平均。比率高于 1.0 表示活跃盈利筹码更多，低于 1.0 则表示亏损筹码占据主导。",
    "supplyPl.explainTwo": "历史上，比率持续低于 1.0 曾与 2014–2015、2018–2019 和 2022–2023 年的深度熊市构筑期重叠。红色区域反映广泛浮亏与筹码投降，但单次跌破并不自动确认绝对底部。",
    "supplyPl.explainThree": "应同时观察跌破持续时间、比率斜率、现货需求与流动性。比率重新站上 1.0 且 7 日均值持续抬升，通常比瞬时触线更有参考价值；定投与仓位管理仍需结合自身风险承受能力。",
    "supplyPl.daysBelowLabel": "天低于 1.0",
    "supplyPl.currentCycle": "当前周期",
    "supplyPl.disclaimer": "数据使用 BGeometrics 公开日频 Supply Profit、Supply Loss 与 HODL Waves 重建：7 日均值[(盈利供应量 − >7 年休眠供应量) ÷ 亏损供应量]。由于公开源不直接提供剔除年龄段后的盈亏分类，这是可审计代理模型；按日更新，仅用于周期研究。",
    "medianMvrv.title": "BTC：中位数 MVRV",
    "medianMvrv.subtitle": "用 BTC 现价除以中位实现价格，观察典型持有者距离盈亏平衡线的偏离与修复。",
    "medianMvrv.current": "当前中位数 MVRV",
    "medianMvrv.median": "中位实现价格",
    "medianMvrv.distance": "距离 1.0",
    "medianMvrv.averages": "7D / 30D 均值",
    "medianMvrv.loading": "正在同步中位数 MVRV 历史快照...",
    "medianMvrv.waiting": "等待公开数据同步",
    "medianMvrv.signalLabel": "典型持有者盈亏状态",
    "medianMvrv.signalPending": "同步完成后，将计算盈亏平衡距离、7 日趋势、区间均值与公开快照状态。",
    "medianMvrv.trend": "7 日趋势",
    "medianMvrv.referencePrice": "BTC 参考价格",
    "medianMvrv.dataMode": "数据模式",
    "medianMvrv.asOf": "链上日期",
    "medianMvrv.explainTitle": "中位数 MVRV 接近 1.0 时，典型持有者正在测试盈亏平衡线",
    "medianMvrv.explainOne": "中位数 MVRV = BTC 现价 ÷ 中位实现价格。中位实现价格是全部 BTC 最后一次链上移动价格的中间值，相比传统均值更不容易被巨鲸的大额转账扭曲，更贴近典型市场参与者的成本。",
    "medianMvrv.explainTwo": "指标接近 1.0，代表价格靠近典型持有者成本；跌破 1.0 则意味着超过一半的活跃筹码处于持平或亏损附近。历史熊市低点曾出现 0.55、0.75 与约 1.0 的读数，但阈值随市场成熟度变化，并非固定买入信号。",
    "medianMvrv.explainThree": "当前应同时观察比值能否稳定回到 1.0 上方、7 日均值是否持续抬升，以及现货需求和流动性是否确认。接近盈亏平衡区更适合作为长线估值参考，而不是单独用于短线择时。",
    "medianMvrv.historicalReference": "历史研究参考",
    "medianMvrv.bearBottom": "熊市低点",
    "medianMvrv.localLow": "局部低点",
    "medianMvrv.disclaimer": "实时值按 BTC 现价 ÷ 中位实现价格计算。完整历史采用 BGeometrics 公开 HODL Waves 重建的中位成本线，并由公开中位实现价格观测校准；校准日为原始观测，其余日期为透明估算。历史低点仅作周期研究参考。",
    "mvrvBands.title": "BTC：标准调整的 MVRV 频段（4Y 滚动窗口）",
    "mvrvBands.subtitle": "用四年滚动均值与标准差校准 MVRV，比较不同周期的估值压力、支撑测试与泡沫程度。",
    "mvrvBands.current": "当前 MVRV",
    "mvrvBands.zscore": "Z 分数",
    "mvrvBands.meanStd": "4Y 均值 / 标准差",
    "mvrvBands.range": "-1σ / +1σ",
    "mvrvBands.loading": "正在同步标准调整 MVRV 波段历史序列...",
    "mvrvBands.waiting": "等待公开数据同步",
    "mvrvBands.signalLabel": "标准化估值状态",
    "mvrvBands.signalPending": "同步完成后，将计算四年滚动波段、Z 分数、短期趋势与负一西格玛支撑状态。",
    "mvrvBands.price": "BTC 参考价格",
    "mvrvBands.averages": "7D / 30D 均值",
    "mvrvBands.distance": "距 -1σ 支撑",
    "mvrvBands.asOf": "链上日期",
    "mvrvBands.deepValue": "极度低估区",
    "mvrvBands.lowerBand": "低估观察区",
    "mvrvBands.fairValue": "周期均值",
    "mvrvBands.upperBand": "高估观察区",
    "mvrvBands.overvalued": "高估预警区",
    "mvrvBands.explainTitle": "四年滚动标准化让不同成熟度的 BTC 周期可以放在同一尺度比较",
    "mvrvBands.explainOne": "该模型对 MVRV 使用最近 1,460 个日观测计算均值与总体标准差。Z 分数表示当前 MVRV 距离自身四年均值有多少个标准差，从而降低历届牛市峰值随市值扩张而结构性下降造成的跨周期偏差。",
    "mvrvBands.explainTwo": "当 MVRV 跌破 -1σ，市场相对自身过去四年进入统计极端区。2015、2018、2020 与 2022 年都曾在该波段附近出现深度投降、数周停留或快速 V 型修复，但触线本身不等同于绝对底部确认。",
    "mvrvBands.explainThree": "Z 分数从极端负值回升至 -1 与 +1 之间，通常表示估值压力已经缓解并回到正常范围。后续应观察 MVRV 能否收复四年均值，以及现货需求、流动性与价格结构是否同步改善。",
    "mvrvBands.generationBottom": "世代底部",
    "mvrvBands.extendedStay": "数周停留",
    "mvrvBands.vRecovery": "快速修复",
    "mvrvBands.multipleTests": "多次测试",
    "mvrvBands.disclaimer": "MVRV 与 BTC 日频价格优先来自 Coin Metrics Community API，备用源为 BGeometrics；波段由 welinkBTC 以 1,460 日滚动窗口实时计算。日频链上值与实时现价时间戳不同，仅用于周期研究，不构成投资建议。",
    "mvrvPriceBands.title": "BTC：标准调整后的 MVRV 价格区间",
    "mvrvPriceBands.subtitle": "把四年滚动 MVRV 的统计波段转换为美元价格目标，定位熊市底部、吸筹、公允价值与周期顶部区间。",
    "mvrvPriceBands.price": "BTC 实时价格",
    "mvrvPriceBands.currentMvrv": "当前 MVRV",
    "mvrvPriceBands.realizedPrice": "实现价格",
    "mvrvPriceBands.costBasis": "全网平均成本",
    "mvrvPriceBands.trend": "7 日趋势",
    "mvrvPriceBands.loading": "正在同步标准调整 MVRV 美元价格带...",
    "mvrvPriceBands.waiting": "等待公开数据同步",
    "mvrvPriceBands.signalLabel": "当前估值区间",
    "mvrvPriceBands.signalPending": "同步完成后，将计算实时价格位于五条统计估值带中的位置及修复空间。",
    "mvrvPriceBands.fromBottom": "距 -1σ 底部带",
    "mvrvPriceBands.toMean": "距均值公允价",
    "mvrvPriceBands.toTop": "距 +2σ 顶部带",
    "mvrvPriceBands.asOf": "链上日期",
    "mvrvPriceBands.explainTitle": "把 MVRV 的统计偏离转换为价格带，让周期估值边界更直观",
    "mvrvPriceBands.explainOne": "MVRV 比较市场价值与实现价值。该模型对最近 1,460 个日观测计算均值和总体标准差，再乘以每日实现价格，将 -1、-0.5、0、+1 与 +2 Sigma 转换为动态美元价格区间。",
    "mvrvPriceBands.explainTwo": "历史上，深熊阶段常触及或短暂跌破 -1 Sigma；-0.5 Sigma 至均值之间更接近吸筹与估值修复区；+1 Sigma 往往形成周期中期阻力，而 +2 Sigma 用于观察极端泡沫和顶部风险。",
    "mvrvPriceBands.explainThree": "价格落在 -0.5 Sigma 与均值之间时，代表估值低于四年统计中枢但尚未进入极端投降区。是否形成有效吸筹窗口，仍需由现货需求、流动性、链上成本变化和价格结构共同确认。",
    "mvrvPriceBands.bearBottom": "熊市底部带",
    "mvrvPriceBands.accumulation": "吸筹与支撑带",
    "mvrvPriceBands.fairValue": "均值公允价值",
    "mvrvPriceBands.resistance": "牛市阻力带",
    "mvrvPriceBands.cycleTop": "周期顶部分野",
    "mvrvPriceBands.bearTest": "熊底测试",
    "mvrvPriceBands.topTest": "顶部扩张",
    "mvrvPriceBands.disclaimer": "MVRV 与日频 BTC 价格优先来自 Coin Metrics Community API，备用源为 BGeometrics；实时现价来自 Binance Spot。实现价格按价格 ÷ MVRV 反推，价格带由 welinkBTC 以 1,460 日滚动窗口计算。不同数据时间戳可能存在日级差异，仅用于周期研究，不构成投资建议。",
    "stockToFlow.title": "库存与流量价格模型",
    "stockToFlow.subtitle": "用可验证的链上库存与协议发行速度衡量比特币稀缺性，并追踪现价相对模型与置信区间的偏离。",
    "stockToFlow.price": "BTC 实时价格",
    "stockToFlow.ratio": "当前 S2F",
    "stockToFlow.model": "S2F 模型价格",
    "stockToFlow.deviation": "对数偏离度",
    "stockToFlow.loading": "正在同步库存、发行流量与 S2F 模型序列...",
    "stockToFlow.waiting": "等待公开数据同步",
    "stockToFlow.signalLabel": "模型偏离状态",
    "stockToFlow.signalPending": "同步完成后，将判断实时价格相对 S2F 稀缺性模型及 ±1/±2 Sigma 区间的位置。",
    "stockToFlow.minusTwo": "-2σ 下轨",
    "stockToFlow.minusOne": "-1σ 下轨",
    "stockToFlow.spotDiscount": "现价相对模型",
    "stockToFlow.asOf": "链上日期",
    "stockToFlow.explainTitle": "S2F 把固定供应政策转化为长期稀缺性估值基准，同时也暴露模型与现实需求的分歧",
    "stockToFlow.formulaCopy": "S2F = 当前流通库存 ÷ 年化协议新增供应",
    "stockToFlow.explainOne": "模型使用日频链上流通库存，并依据比特币每 210,000 个区块减半的协议规则，以每日本应产生约 144 个区块估算年化新增供应。每次减半都会降低流量、抬升 S2F，因此模型价格呈阶梯式上移。",
    "stockToFlow.explainTwo": "深蓝区间表示 ±1σ，外层浅蓝区间表示 ±2σ。现价跌破 -2σ 代表价格与稀缺性模型出现统计意义上的极端负偏离，但这既可能是低估，也可能说明只依赖供应稀缺性的模型解释力正在下降。",
    "stockToFlow.explainThree": "历史减半时点的实际价格通常滞后于模型价格，价格回归也并非必然或即时发生。应把 S2F 作为长期稀缺性情景，而不是单独的目标价；需求、流动性、宏观环境、监管和市场结构都可能改变偏离持续时间。",
    "stockToFlow.disclaimer": "BTC 日频价格与流通库存优先来自 Coin Metrics Community API，备用库存来自 Blockchain.com、备用价格来自 BGeometrics，实时现价来自 Binance Spot。年化流量按当前区块补贴 × 144 区块/日 × 365 日估算，不含手续费且不等同于实际逐日出块量。模型仅用于周期研究，不构成投资建议。",
    "cycleTiming.subtitle": "用五组历史事件锚点比较比特币周期时长，并把下一轮减半、牛顶与熊底推演放进未来时间轴。",
    "cycleTiming.modeHalvingTop": "减半 → 牛顶",
    "cycleTiming.modeBottomTop": "熊底 → 牛顶",
    "cycleTiming.modeHalvingBottom": "减半 → 熊底",
    "cycleTiming.modeTopTop": "牛顶 → 牛顶",
    "cycleTiming.modeBottomBottom": "熊底 → 熊底",
    "cycleTiming.price": "BTC 实时价格",
    "cycleTiming.modelDays": "模型周期",
    "cycleTiming.projectedDate": "推演窗口",
    "cycleTiming.windowStatus": "窗口状态",
    "cycleTiming.loading": "正在同步 BTC 日线与五类周期事件...",
    "cycleTiming.waiting": "等待公开数据同步",
    "cycleTiming.signalLabel": "当前周期窗口",
    "cycleTiming.signalPending": "同步完成后，将比较历史持续时间、当前进度与模型窗口是否已经过去。",
    "cycleTiming.elapsed": "已经历",
    "cycleTiming.remaining": "剩余 / 超期",
    "cycleTiming.anchor": "当前锚点",
    "cycleTiming.asOf": "数据日期",
    "cycleTiming.futureLabel": "下一轮周期推演",
    "cycleTiming.futureNote": "主模型节点 + 跨周期交叉验证",
    "cycleTiming.methodTitle": "五模式方法",
    "cycleTiming.methodCopy": "减半→牛顶观察发行冲击；熊底→牛顶观察完整爬坡；减半→下一熊底观察周期出清；牛顶→牛顶与熊底→熊底分别观察顶部和底部的跨周期间隔。",
    "cycleTiming.disclaimer": "BTC 日频价格来自 Coin Metrics Community API，备用源为 BGeometrics，实时现价来自 Binance Spot。下一次减半按 mempool.space 实时区块高度和每区块 10 分钟估算；牛顶与熊底采用减半模型作为主节点，并用顶部、底部跨周期模型给出验证区间。所有日期均为研究情景，不代表实际转折已经确认，也不构成投资建议。",
    "rhodl.title": "BTC：实现 HODL 比率",
    "rhodl.subtitle": "比较 1 周与 1–2 年已实现市值，观察短期投机强度、长期筹码主导程度与周期过热风险。",
    "rhodl.current": "当前 RHODL",
    "rhodl.averages": "7D / 30D 均值",
    "rhodl.price": "BTC 实时价格",
    "rhodl.peak": "历史峰值",
    "rhodl.loading": "正在同步 RHODL 历史序列...",
    "rhodl.waiting": "等待公开数据同步",
    "rhodl.signalLabel": "筹码投机状态",
    "rhodl.signalPending": "同步完成后，将判断长期积累、正常运行、活跃投机或极端过热状态。",
    "rhodl.change": "7 日变化",
    "rhodl.monthly": "30 日均线",
    "rhodl.asOf": "链上日期",
    "rhodl.explainTitle": "RHODL 追踪短期投机相对长期筹码的强弱，当前结构仍需与价格和需求共同确认",
    "rhodl.explainOne": "RHODL 将 1 周已实现市值与 1–2 年已实现市值相比较，并按比特币网络年龄校正。数值越高，近期移动筹码越占主导，短期投机越活跃；数值越低，长期持有者对筹码结构的影响越强。",
    "rhodl.explainTwo": "历史峰值呈现结构性递减：早期周期的短期投机强度远高于成熟市场。资产体量扩大、机构参与和波动率收敛，都可能压低后续周期峰值，因此不应直接套用早期固定阈值。",
    "rhodl.explainThree": "当前读数处于低位或正常区间时，说明市场尚未出现极端短期投机，但不代表价格不会继续波动。应结合现货需求、流动性、链上成本与价格结构判断积累是否转化为趋势。",
    "rhodl.accumulation": "长期积累",
    "rhodl.accumulationCopy": "长期筹码主导，短期活动偏低",
    "rhodl.normal": "正常范围",
    "rhodl.normalCopy": "投机与持有结构相对均衡",
    "rhodl.elevated": "活跃投机",
    "rhodl.elevatedCopy": "短期筹码活动明显升温",
    "rhodl.overheated": "极端过热",
    "rhodl.overheatedCopy": "关注周期高位和派发风险",
    "rhodl.disclaimer": "RHODL 与 BTC 日频历史来自 BGeometrics 公开接口，实时现价来自 Binance Spot。链上值按日更新，与实时价格时间戳不同；区间为 welinkBTC 研究分层，仅用于周期观察，不构成投资建议。",
    "lthRpl.title": "BTC：实体调整后的长期持有者已实现盈亏比率",
    "lthRpl.subtitle": "衡量长期持有者已实现利润与已实现损失的比值，识别 1.0 多空枢纽、水下出清与宏观周期转折。",
    "lthRpl.current": "当前 LTH 盈亏比",
    "lthRpl.averages": "7D / 30D 均值",
    "lthRpl.price": "BTC 实时价格",
    "lthRpl.distance": "距离 1.0 枢纽",
    "lthRpl.loading": "正在同步长期持有者已实现盈亏历史序列...",
    "lthRpl.waiting": "等待公开数据同步",
    "lthRpl.signalLabel": "长期筹码盈亏状态",
    "lthRpl.signalPending": "同步完成后，将判断长期资金处于水下出清、枢纽修复、利润主导或高位派发阶段。",
    "lthRpl.change": "7 日变化",
    "lthRpl.underwaterSince": "水下起始",
    "lthRpl.underwaterDays": "水下天数",
    "lthRpl.asOf": "链上日期",
    "lthRpl.explainTitle": "长期持有者盈亏比重新观察 1.0 枢纽，水下阶段对应深度换手与宏观出清窗口",
    "lthRpl.explainOne": "该比率比较持币超过约 155 天筹码的已实现利润与已实现损失。比值高于 1.0 表示利润兑现占主导；低于 1.0 表示长期筹码也在亏损卖出；重新穿越 1.0 是观察宏观情绪切换的重要信号。",
    "lthRpl.explainTwo": "历史上的水下红区曾覆盖 2012、2015、2019 与 2022–2023 年的深度熊市阶段。它不是单日抄底信号，更适合用来判断长期筹码是否已经进入持续投降与再分配过程。",
    "lthRpl.explainThree": "当比率在水下筑底并重新向上突破 1.0 时，才构成更清晰的右侧修复证据。应结合现货需求、实现价格、流动性与价格结构共同确认，不宜依赖单一阈值。",
    "lthRpl.underwater": "水下出清",
    "lthRpl.underwaterCopy": "长期持有者亏损兑现占主导",
    "lthRpl.pivot": "枢纽修复",
    "lthRpl.pivotCopy": "观察是否重新站稳盈亏平衡",
    "lthRpl.profit": "利润主导",
    "lthRpl.profitCopy": "长线资金主要在盈利兑现",
    "lthRpl.distribution": "高位派发",
    "lthRpl.distributionCopy": "短期利润兑现强度显著升高",
    "lthRpl.disclaimer": "公开历史采用 BGeometrics 的 155 天以上 UTXO 年龄口径代理，并非 Glassnode 专有实体聚类调整序列；实时现价来自 Binance Spot。链上值按日更新，仅用于周期研究，不构成投资建议。",
    "slrv.title": "BTC：短线至长线已实现价值（SLRV）比率（7日移动平均值）",
    "slrv.subtitle": "比较 24 小时与 6 个月至 1 年已实现 HODL 波段，识别短线投机、长期沉淀与周期极值。",
    "slrv.current": "当前 SLRV · 7D",
    "slrv.averages": "7D / 30D 均值",
    "slrv.price": "BTC 实时价格",
    "slrv.distance": "距离极低区",
    "slrv.loading": "正在同步 SLRV 完整历史序列...",
    "slrv.waiting": "等待公开数据同步",
    "slrv.signalLabel": "短长线筹码状态",
    "slrv.signalPending": "同步完成后，将判断短线投机处于极低吸筹、常态运行、活跃升温或过热派发阶段。",
    "slrv.change": "7 日变化",
    "slrv.raw": "原始日频比率",
    "slrv.lowZones": "历史极低区",
    "slrv.asOf": "链上日期",
    "slrv.explainTitle": "SLRV 观察短期流动相对中长期资本的强弱，极低区通常对应投机降温和筹码沉淀",
    "slrv.explainOne": "SLRV = 24 小时已实现 HODL 波 ÷ 6 个月至 1 年已实现 HODL 波，并对日频比率取 7 日移动平均。比率升高表示近期移动筹码相对更活跃；比率降低表示短期流动收缩、较老筹码占据更大结构权重。",
    "slrv.explainTwo": "历史低位并不是单日抄底信号，而是市场投机水分被持续压缩的结构窗口。若低 SLRV 同时伴随现货需求回升、实现价格支撑和流动性改善，长期积累信号才更可靠。",
    "slrv.explainThree": "高 SLRV 则表示短期资本相对中长期筹码快速活跃，常用于观察牛市中后期的投机和派发风险。不同周期峰值会随市场成熟度变化，不宜机械套用固定高位阈值。",
    "slrv.bottom": "历史极低区",
    "slrv.bottomCopy": "投机降温，观察长期吸筹",
    "slrv.normal": "常态区间",
    "slrv.normalCopy": "短长线流动结构相对均衡",
    "slrv.elevated": "活跃升温",
    "slrv.elevatedCopy": "短线资金活动明显增强",
    "slrv.overheated": "过热派发",
    "slrv.overheatedCopy": "关注周期高位与筹码派发",
    "slrv.disclaimer": "完整历史来自 BGeometrics 公开已实现市值 HODL Waves；最新精确波段来自 Bitcoin Data 并按重叠窗口稳健校准至同一尺度，实时现价来自 Binance Spot。公开重建不等同于付费平台专有实体调整数据，仅用于周期研究，不构成投资建议。",
    "realizedCapHodl.title": "BTC：已实现市值 HODL 波浪",
    "realizedCapHodl.subtitle": "按最后一次链上移动时间拆分成本加权筹码，观察 3 个月以上资本的锁定、吸筹与周期峰值。",
    "realizedCapHodl.current": "3 个月以上筹码",
    "realizedCapHodl.averages": "7D / 30D 均值",
    "realizedCapHodl.price": "BTC 实时价格",
    "realizedCapHodl.peak": "历史峰值",
    "realizedCapHodl.loading": "正在同步已实现市值 HODL 波浪完整历史序列...",
    "realizedCapHodl.waiting": "等待公开数据同步",
    "realizedCapHodl.signalLabel": "长期筹码锁定状态",
    "realizedCapHodl.signalPending": "同步完成后，将判断成本加权筹码处于活跃换手、均衡、吸筹或深度锁定阶段。",
    "realizedCapHodl.change": "7 日变化",
    "realizedCapHodl.distance": "距 84% 深度锁定线",
    "realizedCapHodl.cyclePeak": "本周期峰值",
    "realizedCapHodl.asOf": "链上日期",
    "realizedCapHodl.explainTitle": "超过 3 个月的成本加权筹码占比升至高位，意味着活跃供应收缩与长期资本沉淀",
    "realizedCapHodl.explainOne": "已实现市值 HODL 波浪按照每枚比特币最后一次链上移动时的价格进行成本加权，再按静置年龄分层。与单纯按币量统计不同，它更能观察资金成本在短期交易者和长期持有者之间如何迁移。",
    "realizedCapHodl.explainTwo": "历史高点常出现在熊市深度换手后的吸筹后段，但高锁定占比并不保证价格立即上涨。它描述供给端状态，仍需与现货需求、全球流动性和实现盈亏共同确认。",
    "realizedCapHodl.explainThree": "当超过 3 个月的筹码占比持续处于高位，短期可交易供应通常更少，新增需求更容易放大价格变化；若占比快速回落，则说明老筹码重新活跃，需要关注派发和换手。",
    "realizedCapHodl.active": "活跃换手",
    "realizedCapHodl.activeCopy": "短龄资本占比更高",
    "realizedCapHodl.balanced": "均衡结构",
    "realizedCapHodl.balancedCopy": "筹码沉淀与流动并存",
    "realizedCapHodl.accumulation": "长期吸筹",
    "realizedCapHodl.accumulationCopy": "活跃供应明显收缩",
    "realizedCapHodl.deepLock": "深度锁定",
    "realizedCapHodl.deepLockCopy": "观察周期底部与供给冲击",
    "realizedCapHodl.disclaimer": "完整历史来自 BGeometrics 公开已实现市值 HODL Waves，最新精细年龄段由 Bitcoin Data 公开日频数据续接并合并为共同口径；实时现价来自 Binance Spot。该公开模型不复刻付费平台的专有实体聚类，仅用于周期研究，不构成投资建议。",
    "under3mHodl.title": "比特币：小于 3 个月已实现市值年龄波",
    "under3mHodl.subtitle": "衡量持币不足 3 个月的新资金占全网已实现市值的比例，识别短线投机退潮、底部拐点与周期过热。",
    "under3mHodl.current": "小于 3 个月筹码",
    "under3mHodl.averages": "7D / 30D 均值",
    "under3mHodl.price": "BTC 实时价格",
    "under3mHodl.recentLow": "180 日局部低点",
    "under3mHodl.loading": "正在同步小于 3 个月已实现市值年龄波完整历史序列...",
    "under3mHodl.waiting": "等待公开数据同步",
    "under3mHodl.signalLabel": "短期资本结构",
    "under3mHodl.signalPending": "同步完成后，将判断短期资本处于历史底部、吸筹过渡、均衡或投机过热阶段。",
    "under3mHodl.change": "7 日变化",
    "under3mHodl.distance": "距 18% 底部线",
    "under3mHodl.vTurn": "底部 V 形拐点",
    "under3mHodl.asOf": "链上日期",
    "under3mHodl.explainTitle": "短期资本占比深度降至 12%–18% 后拐头，历史上常对应投机出清完成与新资金重新入场",
    "under3mHodl.explainOne": "小于 3 个月已实现市值年龄波衡量最后移动不足 3 个月的筹码，在全网成本加权已实现市值中的占比。占比升高表示新资金与热钱活跃；占比下降表示筹码向中长期持有者沉淀。",
    "under3mHodl.deepBottom": "历史深底",
    "under3mHodl.deepBottomCopy": "短线投机基本出清",
    "under3mHodl.bottom": "底部区间",
    "under3mHodl.bottomCopy": "观察 V 形拐点与增量入场",
    "under3mHodl.accumulation": "吸筹过渡",
    "under3mHodl.accumulationCopy": "短线资本温和回流",
    "under3mHodl.speculation": "投机过热",
    "under3mHodl.speculationCopy": "关注顶部派发风险",
    "under3mHodl.explainTwo": "历史周期中，2011、2015、2019、2022 与本轮低点都落在约 12%–18% 的极低区域。低位本身代表投机退潮；低位后持续抬升，才更接近短线玩家从净离场切换为净入场的右侧证据。",
    "under3mHodl.explainThree": "短期资本占比极低说明大部分成本权重已沉淀至 3 个月以上筹码，活跃供应偏紧；若现货需求同步恢复，小幅新增买盘更容易放大价格变化。高位则表示筹码快速年轻化，需要关注投机和派发。",
    "under3mHodl.disclaimer": "完整历史来自 BGeometrics 公开已实现市值 HODL Waves，最新精细年龄段由 Bitcoin Data 公开日频数据续接；小于 3 个月占比按透明恒等式“100% − 3 个月以上占比”计算，实时现价来自 Binance Spot。不使用付费 API 或专有实体聚类，仅用于周期研究，不构成投资建议。",
    "sth200dma.title": "BTC：“短期持有者成本线”与“200 日均线”的金叉",
    "sth200dma.subtitle": "用 STH 已实现价格上穿 BTC 200 日均线识别熊牛结构转换，并以历史周期样本估算长期窗口。",
    "sth200dma.sth": "STH 短期成本",
    "sth200dma.dma": "BTC 200DMA",
    "sth200dma.cross": "最近宏观金叉",
    "sth200dma.window": "历史均值窗口",
    "sth200dma.loading": "正在同步 STH 已实现价格与 BTC 200DMA 完整历史序列...",
    "sth200dma.waiting": "等待公开数据同步",
    "sth200dma.signalLabel": "宏观结构状态",
    "sth200dma.signalPending": "同步完成后，将依据日频序列确认金叉、连续收盘数与历史周期窗口。",
    "sth200dma.elapsed": "金叉后经过",
    "sth200dma.closes": "确认收盘",
    "sth200dma.projected": "历史推演日期",
    "sth200dma.asOf": "链上日期",
    "sth200dma.explainTitle": "STH 成本线向上穿越 200DMA，代表短期市场成本修复并重新跑赢中长期趋势",
    "sth200dma.explainOne": "红线是持币不足 155 天群体的链上平均成本，黑线是 BTC 每日价格的 200 日简单移动平均。当红线从下方向上穿越黑线并连续收于其上，通常意味着熊市筑底结构向宏观扩张阶段切换。",
    "sth200dma.explainTwo": "历史完整样本中，宏观金叉到随后周期价格高点大致集中在两年半附近。该统计会依据公开日频数据动态计算，不把单一日期写成固定结论。",
    "sth200dma.explainThree": "金叉是宏观结构信号，不是短线买卖指令。应结合现货需求、全球流动性、持有者获利了结与价格趋势共同判断，并对历史样本少、数据修订和周期失效保持警惕。",
    "sth200dma.disclaimer": "STH 已实现价格优先来自 BGeometrics 公开日频接口，限流时使用 Bitbo 公开日频快照；BTC 200DMA 由公开 BTC 日线透明计算，实时现价来自 Binance Spot。STH 采用小于 155 天口径，历史窗口仅用于周期研究，不构成投资建议。",
    "vddMedian.title": "BTC：VDD 与中位数价格逃顶抄底模型",
    "vddMedian.subtitle": "结合 VDD 长线筹码活跃度与中位数价格偏离，标记熊底绿色区、牛顶红柱，并按历史 687 / 678 天窗口动态推演。",
    "vddMedian.price": "BTC 实时价格",
    "vddMedian.median": "中位数价格",
    "vddMedian.vdd": "VDD Multiple",
    "vddMedian.window": "历史均值窗口",
    "vddMedian.loading": "正在同步 VDD、中位数价格与 BTC 完整日频序列...",
    "vddMedian.waiting": "等待公开数据同步",
    "vddMedian.signalLabel": "周期组合信号",
    "vddMedian.signalPending": "同步完成后，将按 VDD 与 BTC / 中位数价格双阈值确认抄底区、逃顶柱及本轮推演窗口。",
    "vddMedian.elapsed": "熊底结束后经过",
    "vddMedian.ratio": "价格 / 中位数",
    "vddMedian.projected": "推演顶部中点",
    "vddMedian.asOf": "链上日期",
    "vddMedian.explainTitle": "低 VDD 与价格回踩中位数共同标记熊底，高 VDD 与价格显著高于中位数共同标记顶部派发风险",
    "vddMedian.explainOne": "绿色区要求 VDD Multiple 低于 0.9，且 BTC 价格不高于中位数价格的 1.25 倍，用于识别长线筹码沉淀、交易活跃度降温后的右侧底部结构；红色柱要求 VDD 不低于 1.5，且 BTC / 中位数价格不低于 1.5，用于标记老筹码高位移动与估值扩张共振。",
    "vddMedian.explainTwo": "参考模型的两个已完成样本分别为 687 天与 678 天，均值为约 683 天（约 22.4 个月）。系统保留这两个研究窗口作为可审计校准样本，并从最新绿色区结束后的首个日线自动滚动推演风险窗口。",
    "vddMedian.explainThree": "绿色区结束只是宏观新周期的候选起点，红色柱也只是风险预警。历史样本少、VDD 与中位数价格可能修订，周期长度也可能失效；应结合现货需求、全球流动性与长期持有者行为继续验证。",
    "vddMedian.disclaimer": "VDD Multiple 来自 BGeometrics 公开日频接口，价格来自公开 BTC 日线与 Binance Spot；中位数价格由公开 HODL Waves 和可验证锚点透明重建。模型不调用付费 API，不把历史窗口解释为确定价格或收益，仅用于周期研究，不构成投资建议。",
    "ssr.title": "BTC：SSR 稳定币供应比例上下条形带",
    "ssr.subtitle": "以 BTC 总市值除以稳定币总市值，叠加 200 日、2 倍标准差布林通道，识别熊底结束后的右侧上轨突破。",
    "ssr.price": "BTC 实时价格",
    "ssr.current": "当前 SSR",
    "ssr.upper": "布林上轨",
    "ssr.lower": "布林下轨",
    "ssr.loading": "正在同步 BTC 市值、稳定币总供应与 SSR 完整日频序列...",
    "ssr.waiting": "等待公开数据同步",
    "ssr.signalLabel": "SSR 右侧趋势状态",
    "ssr.signalPending": "同步完成后，将按 SSR 日线向上穿越布林上轨、连续确认收盘与历史突破样本判断右侧趋势状态。",
    "ssr.elapsed": "突破后经过",
    "ssr.distance": "距离上轨",
    "ssr.closes": "连续确认收盘",
    "ssr.projected": "历史延续观察窗",
    "ssr.explainTitle": "SSR 向上突破 200 日布林上轨，表示 BTC 市值增长正在显著跑赢稳定币购买力存量",
    "ssr.explainOne": "SSR 等于 BTC 总市值除以稳定币总市值；数值越低，单位 BTC 市值背后的稳定币潜在购买力越充足。模型以 200 日均值加减 2 倍总体标准差构造上下轨，并只在 SSR 从轨内向上穿越上轨时记录突破。",
    "ssr.explainTwo": "公开历史序列会自动回算 2019 年与 2023 年右侧突破，并展示突破后 365 日内的价格延续样本；最新突破、连续确认天数和 180–365 日观察窗全部按日滚动更新，不把参考图日期写成固定实时结论。",
    "ssr.explainThree": "上轨突破是熊底结束后的动能证据，不等于单独买入指令。稳定币供应、BTC 市值和历史数据都可能修订；若 SSR 很快跌回上轨下方，应把它视为假突破并继续结合现货需求、流动性和链上筹码结构验证。",
    "ssr.disclaimer": "BTC 市值来自 Coin Metrics Community API；稳定币总市值采用 DefiLlama 全量公开聚合，并以 Coin Metrics 核心稳定币篮子为早期历史下限，避免不完整早期聚合低估供应。模型不调用付费 API，仅用于周期研究，不构成投资建议。",
    "sthBands.title": "BTC：短期持有成本基础模型 [4年，2011年至今] 九彩条形带",
    "sthBands.subtitle": "以短期持有者已实现价格为 Line5，按滚动四年价格成本差波动生成 −2σ 至 +2σ 九条轨道，并用 Line7（+1σ）识别右侧突破。",
    "sthBands.price": "BTC 实时价格",
    "sthBands.line5": "Line5 · STH 成本中枢",
    "sthBands.line7": "Line7 · +1σ",
    "sthBands.zone": "当前九彩区间",
    "sthBands.loading": "正在同步 BTC 与短期持有者成本完整历史，并计算四年九彩轨道...",
    "sthBands.waiting": "等待公开数据同步",
    "sthBands.signalLabel": "Line7 右侧突破状态",
    "sthBands.signalPending": "同步完成后，将按 BTC 日线向上穿越 Line7、连续收盘与 2019/2023 历史样本判断右侧趋势。",
    "sthBands.elapsed": "突破后经过",
    "sthBands.distance": "距离 Line7",
    "sthBands.closes": "连续确认收盘",
    "sthBands.projected": "情景延续观察窗",
    "sthBands.explainTitle": "BTC 向上触及 Line7（STH 成本中枢 +1σ），表示短期购买力正强力脱离成本密集区",
    "sthBands.explainOne": "Line5 直接采用持仓不足 155 天的短期持有者已实现价格。系统计算过去四年每日 BTC 价格与该成本线之差的总体标准差，再以 0.5σ 为步长生成 Line1 至 Line9；Line7 对应 +1σ。",
    "sthBands.explainTwo": "公开历史会自动识别 2019 年和 2023 年 Line7 突破，回算随后 365 日内的价格延续，并按最新有效突破生成 180–365 日观察窗。图中的虚线延伸是基于近期 Line5 斜率衰减与波动回归的情景轨道，不是价格预测。",
    "sthBands.explainThree": "触及 Line7 是右侧趋势证据，不等于确定牛市或单独买入指令。STH 数据、历史价格和波动轨道会随公开源修订；若价格很快跌回 Line7 下方，应继续结合现货需求、流动性和长期持有者行为验证。",
    "sthBands.disclaimer": "价格与 STH 已实现价格来自公开日频源，实时价格来自 Binance Spot。九条轨道均由本系统透明计算，不调用付费 API，也不宣称复刻 CryptoChan 专有序列；仅用于周期研究，不构成投资建议。",
    "percentProfitEx10y.title": "BTC：剔除十年以上沉睡筹码后的比特币链上浮盈比例",
    "percentProfitEx10y.subtitle": "从盈利供应与总供应中同步剔除十年以上未移动筹码，并用 7 日均线识别牛市复苏末段的 55%–60% 深度换手窗口。",
    "percentProfitEx10y.current": "有效浮盈比例 · 7DMA",
    "percentProfitEx10y.price": "BTC 实时价格",
    "percentProfitEx10y.dormant": "剔除 >10 年筹码",
    "percentProfitEx10y.state": "当前换手阶段",
    "percentProfitEx10y.loading": "正在同步 2011 年至今的 BTC、盈利供应与十年以上沉睡筹码，并计算 7 日均线...",
    "percentProfitEx10y.signalLabel": "牛市复苏末段换手状态",
    "percentProfitEx10y.waiting": "等待公开数据同步",
    "percentProfitEx10y.signalPending": "同步完成后，将按有效浮盈比例是否进入 55%–60% 区间、近期低点和 7 日变化判断筹码清洗进度。",
    "percentProfitEx10y.change": "7 日变化",
    "percentProfitEx10y.distance": "距离 55% 阈值",
    "percentProfitEx10y.activeProfit": "有效盈利筹码",
    "percentProfitEx10y.scenario": "情景推演",
    "percentProfitEx10y.explainTitle": "有效浮盈占比回落至 55%–60%，通常对应复苏期收官前的深度获利盘清洗与筹码成本重置",
    "percentProfitEx10y.explainOne": "指标以公开盈利供应除以公开总供应为基础，同时从分子和分母剔除超过十年未移动筹码，再计算 7 日均线。剔除长期沉睡或可能丢失的早期筹码，可更聚焦当前可交易筹码的真实盈亏结构。",
    "percentProfitEx10y.explainTwo": "系统逐日回算 2012、2016、2019 与 2023 周期窗口：前两轮观察 60% 阈值，后两轮观察 55% 阈值，并排除 2020 年 3 月黑天鹅对 2019 样本的干扰。右侧虚线只延续近期动量并向四年中位数回归，不是价格预测。",
    "percentProfitEx10y.explainThree": "低浮盈比例可说明获利盘与杠杆被清洗，但不能单独确认主升浪。若指标持续低于阈值而价格与流动性未修复，应继续结合成本线、现货需求和长期持有者行为验证。",
    "percentProfitEx10y.disclaimer": "本系统采用透明公开数据代理：假设十年以上未移动筹码处于浮盈并从盈利供应和总供应同步扣除。该口径不调用付费 API，也不宣称复刻 CryptoChan 专有实体调整序列；仅用于周期研究，不构成投资建议。",
    "sthMvrv.title": "BTC：短期持有者 MVRV",
    "sthMvrv.subtitle": "用 BTC 市价除以短期持有者已实现价格，识别复苏期收官阶段的首次下探、反弹与二次探底结构。",
    "sthMvrv.current": "当前 STH-MVRV",
    "sthMvrv.price": "BTC 实时价格",
    "sthMvrv.cost": "短期持有者成本",
    "sthMvrv.state": "当前双探阶段",
    "sthMvrv.loading": "正在同步 2011 年至今的 BTC 与短期持有者已实现价格，并计算 STH-MVRV 双探结构...",
    "sthMvrv.signalLabel": "牛市复苏期双探状态",
    "sthMvrv.waiting": "等待公开数据同步",
    "sthMvrv.signalPending": "同步完成后，将按 1.0 盈亏平衡线、首探、反弹与二探结构判断短期筹码的清洗和修复阶段。",
    "sthMvrv.change": "7 日变化",
    "sthMvrv.distance": "距离 1.0",
    "sthMvrv.dips": "本轮首探 / 二探",
    "sthMvrv.scenario": "情景推演",
    "sthMvrv.explainTitle": "STH-MVRV 两次跌破 1.0 并重新收复成本线，通常表示复苏末段的短线浮筹与杠杆已完成两轮清洗",
    "sthMvrv.explainOne": "STH-MVRV 等于 BTC 市价除以持仓不足 155 天筹码的已实现价格。1.0 是短期持有者整体盈亏平衡线；低于 1.0 表示平均浮亏，高于 1.0 表示成本修复。",
    "sthMvrv.explainTwo": "系统逐日识别 2019 与 2023 复苏期的首探、反弹和二探，并明确排除 2020 年 3 月外部黑天鹅。右侧虚线仅按近期动量衰减并向四年中位数回归，持续推演未来 365 天研究情景，不是价格预测。",
    "sthMvrv.explainThree": "双探和重新站回 1.0 是筹码修复证据，但不能单独确认主升浪。若指标再次跌破 1.0 或现货需求未同步恢复，应继续结合长期持有者行为、流动性和成本基础模型验证。",
    "sthMvrv.disclaimer": "本系统采用公开 BTC 日价与公开短期持有者已实现价格计算透明代理，不调用付费 API，也不宣称复刻 CryptoChan 专有实体调整序列；仅用于周期研究，不构成投资建议。",
    "lthSpent.title": "BTC：LTH 花费价格低于水位",
    "lthSpent.subtitle": "比较比特币现价与长期持有者实际花费筹码的平均购入成本，观察亏损抛售、深度投降与价格回收窗口。",
    "lthSpent.current": "LTH 花费价格",
    "lthSpent.price": "BTC 实时价格",
    "lthSpent.ratio": "现价 / LTH 花费价",
    "lthSpent.days": "当前水下天数",
    "lthSpent.loading": "正在同步 LTH 花费价格公开历史序列...",
    "lthSpent.signalLabel": "长期持有者花费状态",
    "lthSpent.waiting": "等待公开数据同步",
    "lthSpent.signalPending": "同步完成后，将判断现价位于长期持有者花费成本之上、回收测试或水下投降阶段。",
    "lthSpent.change": "花费价 7 日变化",
    "lthSpent.sopr": "LTH-SOPR",
    "lthSpent.start": "最近水下起点",
    "lthSpent.publicStart": "精确公开序列起点",
    "lthSpent.explainTitle": "现价持续低于 LTH 花费价格，意味着长期持有者正在以低于购入成本的价格转移筹码",
    "lthSpent.explainOne": "LTH Spent Price 是当天由持有至少 155 天的长期持有者所花费比特币的加权平均购入成本。按照 Glassnode 的公开定义，可由当天 BTC 价格除以 LTH-SOPR 得到；它描述的是当天被花费筹码的成本，不等同于全部长期持有者的持仓均价。",
    "lthSpent.above": "成本线上方",
    "lthSpent.aboveCopy": "长期筹码整体以盈利状态花费",
    "lthSpent.reclaim": "回收测试",
    "lthSpent.reclaimCopy": "价格刚回到成本线上方，观察确认",
    "lthSpent.under": "水下投降",
    "lthSpent.underCopy": "长期持有者出现持续亏损花费",
    "lthSpent.deep": "深度水下",
    "lthSpent.deepCopy": "价格较花费成本低逾 10%",
    "lthSpent.explainTwo": "历史研究窗口显示，价格跌破 LTH 花费成本并持续百余天，常出现在宏观熊市末期：2014 年约 124 天、2018 年约 188 天、2022 年约 193 天；2026 年研究窗口记录约 146 天至 5.78 万美元附近。",
    "lthSpent.explainThree": "长期持有者亏损花费说明强手也在被动出清，但不能单独确认绝对底部。更稳健的右侧信号是价格重新站回 LTH 花费价格上方，并与现货需求、实现盈亏和全球流动性同步改善。",
    "lthSpent.disclaimer": "精确 LTH 花费价格按公开公式 BTC Price ÷ LTH-SOPR 计算，使用 BGeometrics 公开日频 LTH-SOPR 与 BTC 历史价格；实时现价来自 Binance Spot。公开 LTH-SOPR 可用历史起点之前仅展示研究窗口，不补造指标折线。仅用于周期研究，不构成投资建议。",
    "percentProfit.title": "BTC：盈利供应百分比",
    "percentProfit.subtitle": "衡量全网流通比特币中处于账面盈利状态的筹码占比，识别深度出清、周期修复与高位获利盘拥挤区间。",
    "percentProfit.current": "当前盈利供应",
    "percentProfit.price": "BTC 实时价格",
    "percentProfit.averages": "7D / 30D 均值",
    "percentProfit.distance": "距 50% 出清线",
    "percentProfit.loading": "正在同步盈利供应百分比完整历史序列...",
    "percentProfit.signalLabel": "全网筹码盈亏状态",
    "percentProfit.waiting": "等待公开数据同步",
    "percentProfit.signalPending": "同步完成后，将判断供应结构处于底部出清、修复、常态盈利或高位过热阶段。",
    "percentProfit.change": "7 日变化",
    "percentProfit.profitSupply": "盈利供应量",
    "percentProfit.lossSupply": "亏损供应量",
    "percentProfit.asOf": "链上日期",
    "percentProfit.explainTitle": "盈利供应跌破 50% 代表多数筹码处于浮亏，历史上常见于宏观熊市的深度出清窗口",
    "percentProfit.explainOne": "盈利供应百分比衡量最后一次链上移动价格低于当前价格的流通比特币占比。它直接描述全网筹码的账面盈亏结构：比例越高，盈利筹码越拥挤；比例越低，亏损筹码和投降压力越广泛。",
    "percentProfit.flush": "底部出清区",
    "percentProfit.flushCopy": "多数筹码浮亏，观察恐慌释放",
    "percentProfit.recovery": "修复区",
    "percentProfit.recoveryCopy": "从深度浮亏中逐步回升",
    "percentProfit.balanced": "常态盈利区",
    "percentProfit.balancedCopy": "多数筹码盈利但尚未极端",
    "percentProfit.overheated": "顶部过热区",
    "percentProfit.overheatedCopy": "获利盘拥挤，关注派发风险",
    "percentProfit.explainTwo": "历史研究参考值约为：2015 年 36%、2019 年 39%、2022–23 年 45%，本轮 57.8K 美元附近约 46%。这些水平用于对照周期结构；下方卡片同时展示本公开数据源在对应窗口内实际计算的最低值。",
    "percentProfit.explainThree": "从 50% 下方回升说明极端浮亏正在缓解，但不能单独确认绝对底部。更稳健的判断应同时观察现货需求、实现价格、长期持有者行为与全球流动性。",
    "percentProfit.disclaimer": "完整历史使用 BGeometrics 公开日频盈利供应量与亏损供应量，并按 100 × 盈利供应 ÷（盈利供应 + 亏损供应）计算；实时现价来自 Binance Spot。50% 与 95% 为本看板研究区间，不是确定性交易信号，仅用于周期研究，不构成投资建议。",
    "lthExchangeLoss.title": "BTC：长期持有者转入交易所的已实现亏损（30 日移动平均）",
    "lthExchangeLoss.subtitle": "以公开 LTH/STH 已实现盈亏序列构建可复现的长期持有者亏损占比代理，观察强手投降与周期底部压力。",
    "lthExchangeLoss.current": "当前 30D 代理值",
    "lthExchangeLoss.price": "BTC 实时价格",
    "lthExchangeLoss.averages": "7D / 30D 均值",
    "lthExchangeLoss.peak": "近一年峰值",
    "lthExchangeLoss.loading": "正在同步长期持有者已实现亏损公开代理序列...",
    "lthExchangeLoss.signalLabel": "长期持有者亏损压力",
    "lthExchangeLoss.waiting": "等待公开数据同步",
    "lthExchangeLoss.signalPending": "同步完成后，将判断长期持有者亏损占比处于安静、常态、压力或投降阶段。",
    "lthExchangeLoss.change": "7 日变化",
    "lthExchangeLoss.raw": "当日原始占比",
    "lthExchangeLoss.lossUsd": "LTH 已实现亏损",
    "lthExchangeLoss.asOf": "链上日期",
    "lthExchangeLoss.explainTitle": "长期持有者亏损占比急升，代表强手资金也在经历深度洗盘；峰值回落常对应抛压释放后的筹码再分配",
    "lthExchangeLoss.explainOne": "精确的“转入交易所已实现亏损”需要交易所地址标签与实体聚类。公开代理使用 LTH 已实现亏损占 LTH/STH 全部已实现盈亏总额的比例，并计算 30 日移动平均，以透明、可复现的方式观察长期持有者投降强度。",
    "lthExchangeLoss.quiet": "安静区",
    "lthExchangeLoss.quietCopy": "长期筹码亏损活动很低",
    "lthExchangeLoss.normal": "常态区",
    "lthExchangeLoss.normalCopy": "亏损转移仍属常态波动",
    "lthExchangeLoss.stress": "压力区",
    "lthExchangeLoss.stressCopy": "长期持有者亏损抛压扩散",
    "lthExchangeLoss.capitulation": "投降区",
    "lthExchangeLoss.capitulationCopy": "强手筹码发生深度清洗",
    "lthExchangeLoss.explainTwo": "公开代理在 2015、2019、2022–23 周期的峰值约为 56%、55%、69%，与参考结构接近。专有交易所标签研究给出的本轮参考峰值接近 70%，但它不是本图公开代理的实时观测值。",
    "lthExchangeLoss.explainThree": "峰值上升说明长期持有者的亏损实现正在加剧；峰值确认并持续回落，才更接近“最猛烈抛压已释放”的周期含义。应结合现货需求、交易所净流量和价格结构共同确认。",
    "lthExchangeLoss.disclaimer": "本图不是交易所标签原始序列。它使用 BGeometrics 公开日频 LTH/STH 已实现利润与亏损，计算 LTH 亏损占全部已实现盈亏的比例及 30 日均线；实时现价来自 Binance Spot。精确交易所转入指标依赖专有地址标签与实体聚类，仅用于研究参考，不构成投资建议。",
    "twoWeekRsi.title": "比特币：两周级别相对强弱指标",
    "twoWeekRsi.subtitle": "以公开 BTC 日频价格重采样为双周收盘并计算 Wilder RSI(14)，结合长期下倾通道识别宏观动能极值。",
    "twoWeekRsi.current": "当前 2W RSI",
    "twoWeekRsi.price": "BTC 实时价格",
    "twoWeekRsi.channel": "动态下轨 / 上轨",
    "twoWeekRsi.distance": "距下轨支撑",
    "twoWeekRsi.loading": "正在同步 BTC 双周价格并计算长期 RSI 通道...",
    "twoWeekRsi.signalLabel": "宏观动能状态",
    "twoWeekRsi.waiting": "等待公开价格数据",
    "twoWeekRsi.signalPending": "同步完成后，将判断两周 RSI 处于下轨共振、宏观超卖、中性或高位过热阶段。",
    "twoWeekRsi.change": "本期变化",
    "twoWeekRsi.previous": "上一期 RSI",
    "twoWeekRsi.average": "6W / 12W 均值",
    "twoWeekRsi.asOf": "双周观测日",
    "twoWeekRsi.explainTitle": "两周 RSI 接近长期下轨，说明宏观下行动能显著释放；企稳回升才是更可靠的右侧确认",
    "twoWeekRsi.explainOne": "两周级别 RSI 使用 14 个双周收盘周期的 Wilder 平滑算法，能够过滤日线与周线噪音，更清晰地观察宏观买卖动量。上下轨由历史周期 RSI 极值回归得到，会随时间缓慢下倾。",
    "twoWeekRsi.lowerTouch": "下轨共振",
    "twoWeekRsi.lowerTouchCopy": "接近历史熊底动能支撑",
    "twoWeekRsi.oversold": "宏观超卖",
    "twoWeekRsi.oversoldCopy": "下行动能充分释放",
    "twoWeekRsi.neutral": "中性动能",
    "twoWeekRsi.neutralCopy": "等待方向性突破",
    "twoWeekRsi.overheated": "高位过热",
    "twoWeekRsi.overheatedCopy": "关注动能衰减与派发风险",
    "twoWeekRsi.explainTwo": "历史窗口显示，2015、2019、2022–23 与本轮周期的两周 RSI 低点均靠近动态下轨。触轨代表风险收益比改善，但底部仍可能经历数周至数月的震荡磨合。",
    "twoWeekRsi.explainThree": "更稳健的策略是观察 RSI 是否停止创新低、向上脱离下轨，同时结合现货需求、长期持有者成本和全球流动性确认。单次触轨不是确定性买入或抄底信号。",
    "twoWeekRsi.disclaimer": "完整历史使用 BGeometrics 公开日频 BTC 价格，每 14 天取末次收盘并计算 Wilder RSI(14)；实时现价来自 Binance Spot。长期通道是由周期极值线性回归得到的透明技术模型，不是链上原始字段或 Surf 专有数据，仅用于周期研究，不构成投资建议。",
    "vdd.title": "比特币：价值日的毁灭",
    "vdd.subtitle": "比较每日价值日销毁量与过去 365 日均值，识别长期持有者休眠积累和高位派发阶段。",
    "vdd.current": "当前 VDD",
    "vdd.averages": "7D / 30D 均值",
    "vdd.recentLow": "30 日局部低点",
    "vdd.thresholds": "积累 / 派发阈值",
    "vdd.loading": "正在同步价值日销毁倍数历史序列...",
    "vdd.waiting": "等待公开数据同步",
    "vdd.signalLabel": "长期持有者活跃状态",
    "vdd.signalPending": "同步完成后，将判断旧币休眠、常态流动或长期筹码高位派发状态。",
    "vdd.price": "BTC 参考价格",
    "vdd.change": "7 日变化",
    "vdd.peak": "历史峰值",
    "vdd.asOf": "链上日期",
    "vdd.explainTitle": "极低 VDD 表明老币几乎不动，市场进入长期持有者主导的筹码沉淀期",
    "vdd.explainOne": "VDD Multiple 将每日价值日销毁量除以其过去 365 日均值。币龄更长、价值更高的筹码移动会产生更大的价值日销毁，因此该指标用于观察长期持有者是在休眠积累，还是集中花费和派发。",
    "vdd.explainTwo": "当 VDD 跌破 0.75，长期筹码的花费强度显著低于一年均值，历史上常出现在深度积累或趋势启动前的筹码沉淀阶段；高于 2.9 则说明老币活动异常活跃，常被用来观察周期顶部附近的派发压力。",
    "vdd.explainThree": "低 VDD 反映持有者不愿出售，但并不能单独确认价格底部。应同时观察现货需求、交易所流量、流动性和价格结构；若低 VDD 后需求回升，积累信号才更有参考价值。",
    "vdd.accumulation": "深度积累",
    "vdd.accumulationCopy": "旧币少量移动，长期持有者休眠",
    "vdd.normal": "常态流动",
    "vdd.normalCopy": "链上价值日销毁接近历史均值",
    "vdd.distribution": "高位派发",
    "vdd.distributionCopy": "老币大量移动，关注周期顶部风险",
    "vdd.previousZoneOne": "前序低区 I",
    "vdd.previousZoneTwo": "前序低区 II",
    "vdd.currentZone": "当前低区",
    "vdd.liveReading": "最新读数",
    "vdd.disclaimer": "VDD Multiple 与 BTC 日频价格来自 BGeometrics 公开日线接口，实时现价来自 Binance Spot；每日链上值与实时价格时间戳不同。阈值仅用于周期研究，不构成投资建议。",
    "lthNupl.title": "BTC：实体调整 LTH-NUPL",
    "lthNupl.subtitle": "观察长期持有者净未实现盈亏、市场情绪分区与熊市筑底阶段的修复节奏。",
    "lthNupl.current": "当前 LTH-NUPL",
    "lthNupl.averages": "7D / 30D 均值",
    "lthNupl.recentLow": "30 日局部低点",
    "lthNupl.stressDays": "当前恐惧区天数",
    "lthNupl.loading": "正在同步长期持有者 NUPL 历史序列...",
    "lthNupl.waiting": "等待公开数据同步",
    "lthNupl.signalLabel": "长期持有者情绪状态",
    "lthNupl.signalPending": "同步完成后，将判断长期持有者处于投降、恐惧、希望、乐观或狂热阶段。",
    "lthNupl.price": "BTC 参考价格",
    "lthNupl.change": "7D / 30D 变化",
    "lthNupl.distance": "距离希望区 0.25",
    "lthNupl.asOf": "链上日期",
    "lthNupl.explainTitle": "LTH-NUPL 用长期持有者的账面盈亏识别投降、修复与周期过热阶段",
    "lthNupl.explainOne": "LTH-NUPL 衡量持有超过 155 天筹码的净未实现利润与亏损。低于 0 表示长期持有者整体浮亏，0 至 0.25 为恐惧区；数值回升则表示长期筹码的账面压力开始缓解。",
    "lthNupl.explainTwo": "7 日和 30 日趋势同时上行时，通常表示长期持有者的未实现盈亏正在修复；但只有持续脱离恐惧区，并获得价格结构与现货需求确认，才构成更可靠的右侧信号。",
    "lthNupl.explainThree": "长期持有者浮亏与恐惧可以定位深度压力，但不能单独确认底部。应同时观察现货需求、流动性、交易所流量和价格结构，避免把单一阈值当成确定性买卖信号。",
    "lthNupl.capitulation": "投降",
    "lthNupl.capitulationCopy": "长期筹码整体浮亏",
    "lthNupl.fear": "恐惧",
    "lthNupl.fearCopy": "底部压力与修复窗口",
    "lthNupl.hope": "希望",
    "lthNupl.hopeCopy": "盈利能力逐步恢复",
    "lthNupl.optimism": "乐观",
    "lthNupl.optimismCopy": "长期筹码利润扩张",
    "lthNupl.euphoria": "狂热",
    "lthNupl.euphoriaCopy": "关注高位派发压力",
    "lthNupl.patternLabel": "研究假设 · 历史形态对称",
    "lthNupl.patternCopy": "参考研究把 2014–15 左侧红条 62 天与 2022–23 左侧 63 天进行对比；2014–15 右侧持续 192 天。该对称关系是研究推演，并非公开代理序列自动确认。",
    "lthNupl.projectedLabel": "参考推演完成窗口",
    "lthNupl.projectedCopy": "仅作为时间窗口观察，不是价格预测",
    "lthNupl.stressOne": "历史压力期 I",
    "lthNupl.stressTwo": "历史压力期 II",
    "lthNupl.stressCurrent": "最近压力期",
    "lthNupl.liveReading": "最新读数",
    "lthNupl.disclaimer": "公开实时序列采用 BGeometrics 的 UTXO 币龄 LTH-NUPL 作为实体调整模型代理，BTC 历史价格来自 Coin Metrics，实时现价来自 Binance。严格的实体聚类调整口径由 Glassnode 付费接口提供，两者不能视为完全相同；本图仅用于周期研究，不构成投资建议。",
    "surf.open": "打开 Surf 模型解读",
    "surf.title": "Surf 数据模型",
    "surf.loading": "正在调用 Surf 分析当前指标...",
    "surf.refresh": "重新分析",
    "surf.copy": "复制结论",
    "surf.close": "收起",
    "surf.error": "Surf 暂时不可用，请稍后重试。",
    "halving.title": "第五次减半进度",
    "halving.height": "当前区块",
    "halving.target": "目标区块",
    "halving.blocks": "剩余区块",
    "halving.reward": "区块奖励",
    "reference.title": "指标参考说明",
    "reference.action": "点击折叠 / 展开",
    "radar.realtime": "实时判断",
    "radar.score": "周期压力分",
    "radar.waiting": "等待数据",
    "radar.price": "价格趋势",
    "radar.sentiment": "市场情绪",
    "radar.valuation": "链上估值",
    "radar.leverage": "杠杆拥挤",
    "radar.halving": "减半周期",
    "radar.noteTitle": "当前观察",
    "radar.note": "数据同步后生成周期观察，不构成投资建议。",
    "radar.sources": "数据来源",
    "footer.label": "BTC On-chain Intelligence",
    "footer.home": "返回首页",
    days: "天",
    blocks: "个区块",
    updated: "更新",
    source: "来源",
    modelEstimate: "模型估算",
    accumulation: "定投区",
    bottomFishing: "抄底区",
    wait: "等待区",
    overheated: "过热区",
    deepValue: "深度价值",
    neutral: "中性",
    warm: "偏热",
    pressureLow: "压力较低",
    pressureMedium: "压力中等",
    pressureHigh: "压力偏高",
    priceAboveWma: "位于长期均线上方",
    priceBelowWma: "跌破长期均线",
    dataPending: "暂无可用历史序列",
    syncing: "同步中",
    authorized: "待授权"
  },
  en: {
    "nav.network": "Network",
    "nav.products": "Products",
    "nav.research": "Research",
    "nav.alphaops": "AlphaOps",
    "nav.alpharadar": "Alpha Radar",
    "nav.dashboard": "On-chain",
    "nav.contact": "Contact",
    "tools.theme": "Light",
    "tools.themeLight": "Dark",
    "tools.binanceChat": "Binance Chat",
    "tools.support": "Support",
    "hero.titleMain": "BTC On-chain",
    "hero.titleAccent": "Intelligence",
    "hero.text": "Use cycle valuation, holder behavior, miner pressure, derivatives and capital flows to answer one question: where is Bitcoin now?",
    "status.title": "Data Pulse",
    "status.loading": "Syncing public data sources...",
    "status.ready": "Live data synced. All timestamps use China Standard Time.",
    "status.partial": "Public data synced; some licensed metrics are unavailable.",
    "status.error": "Data sources are temporarily unavailable. Refresh later.",
    "status.refresh": "Refresh",
    "support.open": "On-chain Support",
    "support.title": "On-chain Support",
    "support.external": "Open externally",
    "support.loading": "Connecting to on-chain support...",
    "cyclePulse.eyebrow": "Cycle Sentiment",
    "cyclePulse.title": "Cycle Pendulum & Market Sentiment",
    "cyclePulse.text": "Compress on-chain valuation, long-term trend, leverage and sentiment into two live gauges.",
    "cyclePulse.live": "Live Sync",
    "cyclePulse.pendulum": "Cycle Pendulum",
    "cyclePulse.fearGreed": "Fear & Greed Index",
    "cyclePulse.currentState": "Current Cycle State",
    "cyclePulse.sentimentState": "Market Sentiment",
    "cyclePulse.waiting": "Waiting for data",
    "cyclePulse.pending": "Valuation, long-term trend, leverage and sentiment will be combined after synchronization.",
    "cyclePulse.fearGreedPending": "The public sentiment index tracks changes in market risk appetite.",
    "cyclePulse.capitulation": "Capitulation",
    "cyclePulse.accumulation": "Accumulation",
    "cyclePulse.neutral": "Neutral",
    "cyclePulse.overheated": "Overheated",
    "cyclePulse.euphoria": "Euphoria",
    "trendNav.title": "Trend Index",
    "trendNav.text": "Select a metric to jump",
    "section.overview": "Overview",
    "section.carousel": "2D/3D Indicator Loop",
    "section.valuation": "Valuation",
    "section.network": "Miner & Network",
    "section.charts": "Charts",
    "section.reference": "Metric Library",
    "carousel.loading": "Loading the 2D/3D indicator loop...",
    "carousel.error": "The 2D/3D indicator loop is temporarily unavailable",
    "power.subtitle": "On-Chain Trend Snapshots",
    "power.view": "View",
    "power.model": "Indicator",
    "power.period": "Period",
    "power.live": "LIVE ON-CHAIN SNAPSHOT",
    "power.eyebrow": "On-chain data indicators",
    "power.title": "Use cycle valuation, on-chain behavior, miner pressure, derivatives and capital flows to answer one question: where is Bitcoin now?",
    "power.topicCycle": "Cycle valuation",
    "power.topicBehavior": "On-chain behavior",
    "power.topicMiners": "Miner pressure",
    "power.topicDerivatives": "Derivatives",
    "power.topicFlows": "Capital flows",
    "kpi.price": "BTC Live Price",
    "kpi.fng": "Fear & Greed",
    "kpi.ahr": "AHR999 Index",
    "kpi.ahrNote": "200DMA and power-law fitted price",
    "kpi.mvrv": "MVRV Ratio",
    "kpi.mvrvNote": "<1 undervalued · >3.5 overheated",
    "kpi.wma": "200 Week MA",
    "kpi.wmaNote": "Current price / 200WMA",
    "kpi.halving": "Halving Countdown",
    "signal.api": "Syncing data",
    "valuation.title": "Cycle Valuation Matrix",
    "valuation.text": "Put long-term anchors, holder profitability and miner pressure on one decision surface.",
    "mode.all": "All",
    "mode.value": "Value",
    "mode.holder": "Holders",
    "mode.miner": "Miners",
    "metric.balancedState": "Cycle bottom reference",
    "metric.balancedNote": "Realized price minus transfer price; requires cost-basis data.",
    "metric.mvrvzState": "Valuation deviation",
    "metric.mvrvzNote": "<0 deep value · >7 historical bubble zone.",
    "metric.nuplNote": "Net unrealized profit and loss across holders.",
    "metric.soprNote": "<1 average realized loss · >1 average realized profit.",
    "metric.puellNote": "<0.5 deep miner stress · >4 revenue overheating.",
    "metric.psipState": "Supply in profit",
    "metric.psipNote": "Shows whether holders are approaching capitulation zones.",
    "network.title": "Miner & Network State",
    "network.text": "Hashrate, difficulty and fees reveal network security and miner pressure.",
    "network.electricity": "Power cost",
    "network.hashrate": "Network hashrate",
    "network.difficulty": "Difficulty",
    "network.fee": "Recommended fee",
    "network.block": "Block height",
    "network.blockTime": "~10 min / block",
    "derivatives.title": "Derivatives & Flows",
    "costBasis.title": "BTC: Key Cost-Basis Pricing Models",
    "costBasis.subtitle": "Compare spot, short-term holder cost basis and the True Market Mean to locate post-washout bottom-building windows.",
    "costBasis.price": "BTC Live Price",
    "costBasis.sthNote": "155-day short-term holder basis",
    "costBasis.tmmpNote": "Active-investor market mean",
    "costBasis.loading": "Syncing on-chain cost-basis series...",
    "costBasis.signalLabel": "On-chain State",
    "costBasis.waiting": "Waiting for data",
    "costBasis.signalPending": "The latest death cross, spread and convergence rate will be calculated from the synchronized series.",
    "costBasis.crossDate": "Latest Death Cross",
    "costBasis.crossDays": "Days Since Cross",
    "costBasis.convergence": "14D Convergence",
    "costBasis.window": "Historical Mean Window",
    "costBasis.analysisToggle": "Metric Analysis",
    "costBasis.explainTitle": "The STH / TMMP death cross can mark a bottom-confirmation window near 157 days",
    "costBasis.explainOne": "STH Realized Price is the average cost basis of coins moved within 155 days, capturing the break-even line of recent capital. True Market Mean removes miner cost and long-dormant supply to estimate the active investor market mean.",
    "costBasis.explainTwo": "When STH cost basis crosses below TMMP, recent buyers are broadly under pressure and the market can be in the late stage of a deep washout. It is not a standalone trading signal and should be confirmed with liquidity, miner stress and spot demand.",
    "costBasis.daysToBottom": "days to cycle bottom",
    "costBasis.average": "Historical mean",
    "costBasis.days": "days",
    "costBasis.disclaimer": "Historical windows are for cycle research, not investment advice. On-chain metrics update daily, so their timestamp can differ from live BTC price.",
    "ratio.title": "BTC: STH-RP to TMMP Ratio",
    "ratio.subtitle": "Short-Term Holder Realized Price divided by True Market Mean Price, tracking mean-reversion stress and cycle-bottom zones.",
    "ratio.current": "Current Ratio",
    "ratio.avg7": "7D Average",
    "ratio.avg30": "30D Average",
    "ratio.distance": "Distance to 0.75",
    "ratio.loading": "Syncing the STH-RP / TMMP ratio series...",
    "ratio.signalLabel": "Ratio State",
    "ratio.waiting": "Waiting for ratio data",
    "ratio.signalPending": "The current ratio, short-term averages, trend and bottom-signal distance will be calculated after synchronization.",
    "ratio.asOf": "On-chain Date",
    "ratio.projection": "7D Projection",
    "ratio.thresholdDistance": "Threshold Distance",
    "ratio.stage": "Market Stage",
    "ratio.explainTitle": "Short-term supply is mean-reverting while 0.75 remains the cycle-bottom watch line",
    "ratio.explainOne": "STH-RP / TMMP compares the short-term holder cost basis with the active-investor market mean. A reading below 1 means the short-term basis is below the true market mean, a condition often associated with cooling, deleveraging or mean reversion.",
    "ratio.explainTwo": "Historically, readings near 0.75 have aligned with deep-fear and cycle-bottom windows. Signals in 2015, 2018 and 2022 were roughly 7, 9 and 48 days away from the eventual lows.",
    "ratio.explainThree": "A reading above 0.75 indicates pressure without the historical extreme. Conservative investors can wait for stabilization or a deeper move toward the threshold. DCA strategies may use the zone as one input while controlling position size and confirming liquidity and spot demand.",
    "ratio.historyOffset": "distance from cycle bottom",
    "ratio.historyLead": "ahead of cycle bottom",
    "ratio.threshold": "historical bottom line",
    "ratio.disclaimer": "The ratio uses same-day STH Realized Price and True Market Mean Price observations, updates daily and is provided for cycle research only.",
    "lth.title": "BTC: <10y/<7y/<5y LTH-Realized-Price",
    "lth.subtitle": "Aggregate real cost basis by UTXO age to track profit-taking pressure and the sequential bear-bottom cross pattern.",
    "lth.price": "BTC Live Price",
    "lth.allCost": "0–10Y market cost basis",
    "lth.midCost": "Mid-term holder basis",
    "lth.longCost": "Long-term holder basis",
    "lth.ultraCost": "Ultra-long holder basis",
    "lth.loading": "Syncing holder age-band cost-basis series...",
    "lth.authRequired": "The current CryptoQuant plan does not include UTXO age-band data. Enable the required API access and retry.",
    "lth.authTitle": "Age-band data access required",
    "lth.authCopy": "The environment variable is connected, but the current CryptoQuant plan returns 403 for these endpoints. Other live metrics remain available.",
    "lth.unavailable": "Long-term holder age-band data is temporarily unavailable. Please retry later.",
    "lth.signalLabel": "Holder Cost State",
    "lth.waiting": "Waiting for age-band data",
    "lth.signalPending": "BTC premiums to all four cost lines and the sequential-cross progress will be calculated after synchronization.",
    "lth.asOf": "On-chain Date",
    "lth.crossProgress": "Cross Sequence",
    "lth.pricePremium": "Premium to Mid-term",
    "lth.stage": "Market Stage",
    "lth.explainTitle": "Long-term holder cost lines map profit realization and the sequential bear-bottom cross",
    "lth.explainOne": "The 0–10Y Realized Price captures the aggregate cost of supply active within ten years. The 6M–5Y, 6M–7Y and 6M–10Y windows progressively extend the long-term holder cohort. Price above every line means broad unrealized profit and potentially larger profit-taking pressure during volatility.",
    "lth.explainTwo": "During deep historical bear-market washouts, the 0–10Y baseline crossed below the 6M–5Y, 6M–7Y and finally the 6M–10Y cost lines. Completion of all three crosses is more consistent with a macro bottom after substantial supply turnover.",
    "lth.explainThree": "While the baseline remains above long-duration cost, the market is closer to profit realization than final capitulation. Avoid chasing a pullback in isolation and combine the model with spot demand, liquidity and disciplined risk levels.",
    "lth.cross5y": "0–10Y below 6M–5Y",
    "lth.cross7y": "0–10Y below 6M–7Y",
    "lth.cross10y": "0–10Y below 6M–10Y",
    "lth.disclaimer": "Each realized price equals aggregate realized capitalization divided by aggregate supply for the selected age bands. Updated daily for cycle research only; not investment advice.",
    "rpl.title": "BTC: Realized Profit to Realized Loss Ratio",
    "rpl.subtitle": "Compare profit and loss realized by on-chain transfers to identify profit-taking, capitulation and cycle-bottom regimes.",
    "rpl.current": "Current Ratio",
    "rpl.trend": "7-Day Trend",
    "rpl.averages": "7D / 30D Average",
    "rpl.averageNote": "Short-term direction check",
    "rpl.distance": "Distance to 1.0",
    "rpl.loading": "Syncing the full realized profit/loss history...",
    "rpl.waiting": "Waiting for public data",
    "rpl.signalLabel": "Realized P/L State",
    "rpl.signalPending": "After synchronization, the model will identify whether profit-taking or loss realization dominates.",
    "rpl.crossDate": "30D Avg Below 2.2",
    "rpl.daysSince": "Days Since Warning",
    "rpl.profitSma": "Profit 365D SMA",
    "rpl.lossSma": "Loss 365D SMA",
    "rpl.explainTitle": "A ratio below 1.0 means realized losses exceed realized profits",
    "rpl.explainOne": "The Realized Profit/Loss Ratio divides profit realized by on-chain transfers by realized loss. Above 1.0, profit-taking dominates. Below 1.0, loss realization dominates, a structure often associated with capitulation, supply turnover and severe sentiment pressure.",
    "rpl.explainTwo": "The 2.2 level is an early cycle-cooling observation line, while 1.0 is absolute profit/loss balance. Historical moves from 2.2 to 1.0 took roughly 53, 64 and 218 days, but past timing does not guarantee future outcomes.",
    "rpl.explainThree": "A sub-one reading shows that selling has shifted toward loss realization, but it is not a standalone buy signal. Confirm whether pressure is ending with spot demand, liquidity, short-term holder cost basis and price structure.",
    "rpl.daysToBottom": "days to bottom zone",
    "rpl.currentCycle": "Current Cycle",
    "rpl.daysElapsed": "days elapsed",
    "rpl.disclaimer": "The ratio uses public BGeometrics daily on-chain data. Profit and loss amounts are converted at the daily BTC price and shown as 365-day averages. Daily cycle research only; not investment advice.",
    "medianRp.title": "BTC: Median Realized Price",
    "medianRp.subtitle": "Track the 50th percentile of BTC's on-chain cost-basis distribution and how price tests the typical holder's break-even line.",
    "medianRp.price": "BTC Live Price",
    "medianRp.median": "Median Realized Price",
    "medianRp.ratio": "Price / Median Ratio",
    "medianRp.monthly": "Monthly Trend",
    "medianRp.loading": "Syncing the daily median realized price series...",
    "medianRp.waiting": "Waiting for public data",
    "medianRp.signalLabel": "Typical Holder Cost Status",
    "medianRp.signalPending": "The support test will be evaluated after the daily series is synchronized.",
    "medianRp.oneYear": "Cost One Year Ago",
    "medianRp.fourYears": "Cost Four Years Ago",
    "medianRp.yoy": "YoY Growth",
    "medianRp.fourYearGrowth": "Four-Year Growth",
    "medianRp.explainTitle": "Median realized price describes the typical investor's cost floor",
    "medianRp.explainOne": "Median realized price is the midpoint of the prices at which all BTC last moved on-chain: half of supply last moved above it and half below it. Unlike the mean, the median is less distorted by unusually large positions.",
    "medianRp.explainTwo": "When spot price approaches the median realized price, the market is testing a broad break-even line that can become support or resistance. Trading slightly above it implies modest aggregate profit, not a confirmed cycle bottom.",
    "medianRp.explainThree": "Watch whether price can hold above the median cost line together with volume, short-term holder cost and liquidity. A failed reclaim can turn the same level into resistance.",
    "medianRp.liveRatio": "Current Ratio",
    "medianRp.supportGap": "Support Gap",
    "medianRp.dataMode": "Data Mode",
    "medianRp.status": "Current Status",
    "medianRp.typicalCost": "Typical Cost Line",
    "medianRp.disclaimer": "The historical line is reconstructed from public BGeometrics HODL Waves supply and age-cohort last-moved prices, then calibrated with publicly verifiable median realized-price observations. Anchor dates retain the original observations; other dates are transparent public estimates. For cycle research, not investment advice.",
    "lthSth.title": "BTC: LTH/STH Cost Basis Ratio",
    "lthSth.subtitle": "Compare long- and short-term holder realized prices to track cost restructuring, the 0.48 recovery line and trend-reversal windows.",
    "lthSth.current": "Current Ratio",
    "lthSth.lth": "LTH Realized Price",
    "lthSth.sth": "STH Realized Price",
    "lthSth.lthNote": "Coins held over 155 days",
    "lthSth.sthNote": "Coins held up to 155 days",
    "lthSth.averages": "7D / 30D Average",
    "lthSth.loading": "Syncing the LTH/STH cost-basis ratio history...",
    "lthSth.waiting": "Waiting for public data",
    "lthSth.signalLabel": "Long/Short Cost Status",
    "lthSth.signalPending": "After synchronization, the model will calculate the 0.48 recovery date, recent peak, trend and cost convergence.",
    "lthSth.crossDate": "Latest Cross Above 0.48",
    "lthSth.daysSince": "Days Since Cross",
    "lthSth.dailySlope": "7D Daily Change",
    "lthSth.recentPeak": "One-Year Peak",
    "lthSth.explainTitle": "The LTH/STH cost gap is narrowing as the market restructures supply",
    "lthSth.explainOne": "LTH Realized Price is the average basis of coins held for more than 155 days, while STH Realized Price covers coins held for no more than 155 days. A rising ratio means long-term holder cost is catching up with the short-term basis.",
    "lthSth.explainTwo": "Readings below 0.48 have historically aligned with deep bear-market accumulation. Recovering 0.48 and advancing toward a cycle peak often occurs while cost restructuring matures and trend reversal becomes possible. It is not a standalone trade signal.",
    "lthSth.explainThree": "A sustained rise narrows the long/short holder cost gap. Historical peaks often sat near trend reversals or new expansions, but spot demand, liquidity, macro conditions and price structure still need to confirm the signal.",
    "lthSth.daysToPeak": "days to peak",
    "lthSth.currentCycle": "Current Cycle",
    "lthSth.daysElapsed": "days elapsed",
    "lthSth.disclaimer": "The ratio is calculated directly from public BGeometrics daily LTH and STH realized prices; live BTC price comes from a public spot source. Daily cycle research only; not investment advice.",
    "lthLoss.title": "BTC: LTH Market Cap in Loss / Market Cap [Except > 10Y]",
    "lthLoss.subtitle": "Measures underwater long-term-holder positions as a share of active market cap, excluding dormant coins older than ten years.",
    "lthLoss.current": "Current Ratio",
    "lthLoss.threshold": "Bear Threshold",
    "lthLoss.distance": "Distance to 27%",
    "lthLoss.averages": "7D / 30D Average",
    "lthLoss.loading": "Syncing the LTH market-cap-in-loss history...",
    "lthLoss.waiting": "Waiting for public data",
    "lthLoss.signalLabel": "Long-Term Holder Loss Status",
    "lthLoss.signalPending": "After synchronization, the model will calculate distance to 27%, short-term trend, historical peak and current cycle state.",
    "lthLoss.historicalPeak": "Historical Peak",
    "lthLoss.dailyChange": "7D Daily Change",
    "lthLoss.thresholdStatus": "Threshold Status",
    "lthLoss.referencePrice": "BTC Reference Price",
    "lthLoss.explainTitle": "Loss exposure is rising but remains below historical LTH capitulation territory",
    "lthLoss.explainOne": "The public proxy divides the current-value market cap of LTH coins in loss by the active market cap of LTH coins held from 155 days to ten years. A rising ratio means more conviction holders are moving into unrealized loss.",
    "lthLoss.explainTwo": "Historical readings near 27% sat close to the 2015, 2018 and 2022 bear-market lows. This is an observation, not a fixed law: reaching the threshold indicates deep LTH stress but price structure, liquidity and spot demand still need to confirm a bottom.",
    "lthLoss.explainThree": "Distance to 27% shows how far the market remains from prior capitulation territory. A sustained rise signals spreading losses, while a decline indicates easing cost pressure. Trend speed matters as much as the static threshold.",
    "lthLoss.peak": "Peak",
    "lthLoss.btcPrice": "BTC Then",
    "lthLoss.currentCycle": "Current Cycle",
    "lthLoss.toThreshold": "to 27%",
    "lthLoss.disclaimer": "Rebuilt from public BGeometrics daily series: current-value market cap of LTH coins in loss divided by current-value market cap of LTH coins held 155 days to ten years. This auditable public proxy may differ from proprietary UTXO cost-basis datasets. Updated daily for cycle research only.",
    "supplyPl.title": "Bitcoin: Supply in Profit/Loss Ratio [Except > 7Y]",
    "supplyPl.subtitle": "Compare active supply in profit with supply in loss, exclude coins dormant for more than seven years, and smooth the ratio with a seven-day moving average.",
    "supplyPl.current": "Current Ratio (7D MA)",
    "supplyPl.distribution": "Profit / Loss Split",
    "supplyPl.averages": "7D / 30D Average",
    "supplyPl.referencePrice": "BTC Reference Price",
    "supplyPl.loading": "Syncing active supply profit/loss history...",
    "supplyPl.waiting": "Waiting for public data",
    "supplyPl.signalLabel": "Active Supply Profit/Loss Status",
    "supplyPl.signalPending": "After synchronization, the model will calculate the 1.0 threshold, short-term trend, supply split and current bottom-zone duration.",
    "supplyPl.trend": "7-Day Trend",
    "supplyPl.distance": "Distance to 1.0",
    "supplyPl.daysBelow": "Days Below 1.0",
    "supplyPl.asOf": "On-Chain Date",
    "supplyPl.explainTitle": "The active supply ratio measures market pain; readings below 1.0 mark extreme capitulation",
    "supplyPl.explainOne": "This public proxy subtracts the seven-to-ten-year and ten-year-plus dormant cohorts from total supply in profit, divides the result by supply in loss, and applies a seven-day moving average. Above 1.0, active profitable supply dominates; below 1.0, underwater supply dominates.",
    "supplyPl.explainTwo": "Sustained readings below 1.0 overlapped the deep 2014–2015, 2018–2019 and 2022–2023 bear-market base-building windows. The red zone reflects broad unrealized loss and capitulation, but a single threshold cross does not confirm an absolute bottom.",
    "supplyPl.explainThree": "Track duration below the threshold, ratio slope, spot demand and liquidity together. A sustained reclaim of 1.0 with a rising seven-day average is usually more informative than an intraday touch. Position sizing must still reflect individual risk tolerance.",
    "supplyPl.daysBelowLabel": "days below 1.0",
    "supplyPl.currentCycle": "Current Cycle",
    "supplyPl.disclaimer": "Rebuilt from public BGeometrics daily Supply Profit, Supply Loss and HODL Waves series: 7D average[(supply in profit − supply dormant >7 years) ÷ supply in loss]. Because public data does not directly classify age-excluded profit/loss, this is an auditable proxy. Updated daily for cycle research only.",
    "medianMvrv.title": "BTC: Median MVRV",
    "medianMvrv.subtitle": "Divide BTC spot price by Median Realized Price to track how far the typical holder sits from break-even.",
    "medianMvrv.current": "Current Median MVRV",
    "medianMvrv.median": "Median Realized Price",
    "medianMvrv.distance": "Distance to 1.0",
    "medianMvrv.averages": "7D / 30D Average",
    "medianMvrv.loading": "Syncing verified Median MVRV snapshots...",
    "medianMvrv.waiting": "Waiting for public data",
    "medianMvrv.signalLabel": "Typical Holder Break-Even Status",
    "medianMvrv.signalPending": "After synchronization, the model will calculate break-even distance, seven-day trend, rolling averages and public snapshot status.",
    "medianMvrv.trend": "7-Day Trend",
    "medianMvrv.referencePrice": "BTC Reference Price",
    "medianMvrv.dataMode": "Data Mode",
    "medianMvrv.asOf": "On-Chain Date",
    "medianMvrv.explainTitle": "Median MVRV near 1.0 means the typical holder is testing break-even",
    "medianMvrv.explainOne": "Median MVRV equals BTC spot price divided by Median Realized Price. The median is the middle last-moved price across all BTC and is less distorted by very large transfers than a traditional mean, making it a closer proxy for the typical participant's cost.",
    "medianMvrv.explainTwo": "Near 1.0, price is close to the typical holder's basis; below 1.0, more than half of active coins sit near or below break-even. Historical bear lows printed roughly 0.55, 0.75 and 1.0, but the threshold changes as the market matures and is not a fixed buy signal.",
    "medianMvrv.explainThree": "Watch whether the ratio can hold above 1.0, whether the seven-day average keeps rising, and whether spot demand and liquidity confirm. The break-even zone is a long-horizon valuation reference, not a standalone timing tool.",
    "medianMvrv.historicalReference": "Historical Research Reference",
    "medianMvrv.bearBottom": "Bear-Market Low",
    "medianMvrv.localLow": "Local Low",
    "medianMvrv.disclaimer": "The live reading is BTC spot price divided by Median Realized Price. Full history uses a public BGeometrics HODL Waves reconstruction calibrated to public median realized-price observations. Anchor dates are original observations; remaining dates are transparent estimates. Historical lows are cycle-research references only.",
    "mvrvBands.title": "BTC: Std-Adjusted MVRV Bands (4Y Rolling Windows)",
    "mvrvBands.subtitle": "Normalize MVRV with a four-year rolling mean and standard deviation to compare valuation pressure, support tests and bubbles across cycles.",
    "mvrvBands.current": "Current MVRV",
    "mvrvBands.zscore": "Z-Score",
    "mvrvBands.meanStd": "4Y Mean / Std",
    "mvrvBands.range": "-1σ / +1σ",
    "mvrvBands.loading": "Syncing standard-adjusted MVRV band history...",
    "mvrvBands.waiting": "Waiting for public data",
    "mvrvBands.signalLabel": "Normalized Valuation Status",
    "mvrvBands.signalPending": "After synchronization, the model will calculate four-year rolling bands, Z-score, short-term trend and minus-one-sigma support status.",
    "mvrvBands.price": "BTC Reference Price",
    "mvrvBands.averages": "7D / 30D Average",
    "mvrvBands.distance": "Distance to -1σ",
    "mvrvBands.asOf": "On-Chain Date",
    "mvrvBands.deepValue": "Extreme Undervaluation",
    "mvrvBands.lowerBand": "Undervaluation Watch",
    "mvrvBands.fairValue": "Cycle Mean",
    "mvrvBands.upperBand": "Overvaluation Watch",
    "mvrvBands.overvalued": "Overvaluation Warning",
    "mvrvBands.explainTitle": "Four-year rolling normalization puts BTC cycles of different maturity on one scale",
    "mvrvBands.explainOne": "The model computes the arithmetic mean and population standard deviation from the latest 1,460 daily MVRV observations. The Z-score measures how many standard deviations current MVRV sits from its own four-year mean, reducing the structural cross-cycle bias caused by declining MVRV peaks as market capitalization expands.",
    "mvrvBands.explainTwo": "When MVRV breaks below minus one sigma, valuation is statistically extreme versus its own four-year history. The 2015, 2018, 2020 and 2022 episodes included deep capitulation, multi-week stays or rapid V-shaped recoveries, but a band breach does not confirm an absolute bottom by itself.",
    "mvrvBands.explainThree": "A Z-score recovery into the minus-one to plus-one range usually means valuation pressure has eased back toward normal. Watch whether MVRV can reclaim the four-year mean and whether spot demand, liquidity and price structure improve at the same time.",
    "mvrvBands.generationBottom": "Generational Bottom",
    "mvrvBands.extendedStay": "Multi-Week Stay",
    "mvrvBands.vRecovery": "Rapid Recovery",
    "mvrvBands.multipleTests": "Multiple Tests",
    "mvrvBands.disclaimer": "Daily MVRV and BTC price come primarily from the Coin Metrics Community API with BGeometrics as fallback. welinkBTC calculates each band from a rolling 1,460-day window. Daily on-chain values and live spot have different timestamps; cycle research only, not investment advice.",
    "mvrvPriceBands.title": "BTC: Std-Adjusted MVRV Price Bands",
    "mvrvPriceBands.subtitle": "Convert four-year rolling MVRV statistics into dollar price targets for bear bottoms, accumulation, fair value and cycle-top regimes.",
    "mvrvPriceBands.price": "Live BTC Price",
    "mvrvPriceBands.currentMvrv": "Current MVRV",
    "mvrvPriceBands.realizedPrice": "Realized Price",
    "mvrvPriceBands.costBasis": "Aggregate Network Cost Basis",
    "mvrvPriceBands.trend": "7-Day Trend",
    "mvrvPriceBands.loading": "Syncing standard-adjusted MVRV dollar price bands...",
    "mvrvPriceBands.waiting": "Waiting for public data",
    "mvrvPriceBands.signalLabel": "Current Valuation Zone",
    "mvrvPriceBands.signalPending": "After synchronization, the model will locate live price within five statistical valuation bands and measure recovery potential.",
    "mvrvPriceBands.fromBottom": "Distance from -1σ Bottom",
    "mvrvPriceBands.toMean": "Distance to Mean Fair Value",
    "mvrvPriceBands.toTop": "Distance to +2σ Top",
    "mvrvPriceBands.asOf": "On-Chain Date",
    "mvrvPriceBands.explainTitle": "Converting MVRV deviations into price bands makes cycle valuation boundaries tangible",
    "mvrvPriceBands.explainOne": "MVRV compares market value with realized value. This model calculates the arithmetic mean and population standard deviation of the latest 1,460 daily observations, then multiplies those levels by daily Realized Price to convert -1, -0.5, 0, +1 and +2 sigma into dynamic dollar bands.",
    "mvrvPriceBands.explainTwo": "Deep bear markets have often touched or briefly pierced minus one sigma. The minus-half-sigma to mean channel is closer to accumulation and valuation repair, plus one sigma often acts as mid-cycle resistance, and plus two sigma is monitored for extreme bubble and cycle-top risk.",
    "mvrvPriceBands.explainThree": "Price between minus half sigma and the mean is below the four-year statistical center without reaching extreme capitulation. A durable accumulation window still needs confirmation from spot demand, liquidity, on-chain cost-basis changes and price structure.",
    "mvrvPriceBands.bearBottom": "Bear-Bottom Band",
    "mvrvPriceBands.accumulation": "Accumulation & Support",
    "mvrvPriceBands.fairValue": "Mean Fair Value",
    "mvrvPriceBands.resistance": "Bull-Market Resistance",
    "mvrvPriceBands.cycleTop": "Cycle-Top Boundary",
    "mvrvPriceBands.bearTest": "Bear-Bottom Test",
    "mvrvPriceBands.topTest": "Top Expansion",
    "mvrvPriceBands.disclaimer": "Daily MVRV and BTC history come primarily from the Coin Metrics Community API with BGeometrics as fallback; live spot comes from Binance. Realized Price is derived as price divided by MVRV, and welinkBTC calculates each price band from a rolling 1,460-day window. Timestamps may differ by one daily observation. Cycle research only, not investment advice.",
    "stockToFlow.title": "Stock-to-Flow Price Model",
    "stockToFlow.subtitle": "Measure Bitcoin scarcity with verifiable circulating stock and protocol issuance, then track spot-price deviation from the model and its confidence bands.",
    "stockToFlow.price": "Live BTC Price",
    "stockToFlow.ratio": "Current S2F",
    "stockToFlow.model": "S2F Model Price",
    "stockToFlow.deviation": "Log Deviation",
    "stockToFlow.loading": "Syncing stock, protocol flow and the S2F model series...",
    "stockToFlow.waiting": "Waiting for public data",
    "stockToFlow.signalLabel": "Model Deviation State",
    "stockToFlow.signalPending": "After synchronization, the model will locate spot price against the scarcity model and its plus/minus one- and two-sigma bands.",
    "stockToFlow.minusTwo": "-2σ Lower Band",
    "stockToFlow.minusOne": "-1σ Lower Band",
    "stockToFlow.spotDiscount": "Spot vs Model",
    "stockToFlow.asOf": "On-Chain Date",
    "stockToFlow.explainTitle": "S2F turns fixed supply policy into a long-term scarcity benchmark while exposing divergences between the model and real demand",
    "stockToFlow.formulaCopy": "S2F = circulating stock divided by annualized protocol issuance",
    "stockToFlow.explainOne": "The model uses daily circulating supply and Bitcoin's protocol halving schedule. Annual issuance is estimated from the active block subsidy and roughly 144 expected blocks per day. Each halving lowers flow and raises S2F, so the model advances in large steps.",
    "stockToFlow.explainTwo": "The dark-blue channel is plus/minus one sigma and the outer light-blue channel is plus/minus two sigma. A break below minus two sigma is statistically extreme relative to the scarcity model, but it can mean either undervaluation or weakening explanatory power in a supply-only model.",
    "stockToFlow.explainThree": "Actual price has usually lagged the model at halving dates, and convergence is neither guaranteed nor immediate. Treat S2F as a long-term scarcity scenario, not a standalone target; demand, liquidity, macro conditions, regulation and market structure all affect how long deviations persist.",
    "stockToFlow.disclaimer": "Daily BTC price and circulating supply come primarily from the Coin Metrics Community API, with Blockchain.com supply and BGeometrics price as fallback; live spot comes from Binance. Annual flow is estimated as block subsidy times 144 blocks/day times 365 days, excludes fees and is not actual daily block production. Cycle research only, not investment advice.",
    "cycleTiming.subtitle": "Compare Bitcoin cycle duration across five historical event anchors and extend the verified price timeline with projected next-cycle halving, top and bottom nodes.",
    "cycleTiming.modeHalvingTop": "Halving → Top",
    "cycleTiming.modeBottomTop": "Bottom → Top",
    "cycleTiming.modeHalvingBottom": "Halving → Bottom",
    "cycleTiming.modeTopTop": "Top → Top",
    "cycleTiming.modeBottomBottom": "Bottom → Bottom",
    "cycleTiming.price": "Live BTC Price",
    "cycleTiming.modelDays": "Model Duration",
    "cycleTiming.projectedDate": "Projected Window",
    "cycleTiming.windowStatus": "Window Status",
    "cycleTiming.loading": "Syncing BTC daily history and five cycle event models...",
    "cycleTiming.waiting": "Waiting for public data",
    "cycleTiming.signalLabel": "Current Cycle Window",
    "cycleTiming.signalPending": "After synchronization, the model compares historical durations, current progress and whether the projected window has passed.",
    "cycleTiming.elapsed": "Elapsed",
    "cycleTiming.remaining": "Remaining / Overdue",
    "cycleTiming.anchor": "Current Anchor",
    "cycleTiming.asOf": "Data Date",
    "cycleTiming.futureLabel": "Next-Cycle Forecast",
    "cycleTiming.futureNote": "Primary nodes + cross-cycle validation",
    "cycleTiming.methodTitle": "Five-Mode Method",
    "cycleTiming.methodCopy": "Halving-to-top tracks issuance shocks; bottom-to-top tracks full recovery; halving-to-next-bottom tracks cycle clearing; top-to-top and bottom-to-bottom track cross-cycle peak and trough intervals.",
    "cycleTiming.disclaimer": "Daily BTC prices come from the Coin Metrics Community API, with BGeometrics as fallback and live spot from Binance. The next halving is estimated from the live mempool.space tip height at ten minutes per block. Bull-top and bear-bottom primary nodes use halving models, with top-to-top and bottom-to-bottom cross-check windows. All dates are research scenarios, not confirmed turning points or investment advice.",
    "rhodl.title": "BTC: Realized HODL Ratio",
    "rhodl.subtitle": "Compare one-week and one-to-two-year realized capitalization to track speculative intensity, long-term-holder dominance and cycle overheating risk.",
    "rhodl.current": "Current RHODL",
    "rhodl.averages": "7D / 30D Average",
    "rhodl.price": "Live BTC Price",
    "rhodl.peak": "All-Time Peak",
    "rhodl.loading": "Syncing Realized HODL Ratio history...",
    "rhodl.waiting": "Waiting for public data",
    "rhodl.signalLabel": "Speculative Activity State",
    "rhodl.signalPending": "After synchronization, the model will classify long-term accumulation, normal activity, elevated speculation or extreme overheating.",
    "rhodl.change": "7-Day Change",
    "rhodl.monthly": "30-Day Average",
    "rhodl.asOf": "On-Chain Date",
    "rhodl.explainTitle": "RHODL tracks short-term speculation relative to long-held capital and still requires confirmation from price and demand",
    "rhodl.explainOne": "RHODL compares one-week realized capitalization with the one-to-two-year cohort and adjusts for Bitcoin network age. Higher readings mean recently moved coins dominate and speculation is more active; lower readings show stronger long-term-holder influence.",
    "rhodl.explainTwo": "Historical peaks have declined structurally as Bitcoin matured. A larger asset base, institutional participation and lower volatility can all compress later-cycle peaks, so early-cycle fixed thresholds should not be applied mechanically.",
    "rhodl.explainThree": "A low or normal reading means extreme short-term speculation is absent, not that price cannot fall further. Combine it with spot demand, liquidity, on-chain cost bases and price structure to judge whether accumulation is becoming a durable trend.",
    "rhodl.accumulation": "Long-Term Accumulation",
    "rhodl.accumulationCopy": "Long-held capital dominates and short-term activity is subdued",
    "rhodl.normal": "Normal Range",
    "rhodl.normalCopy": "Speculation and holding structure are relatively balanced",
    "rhodl.elevated": "Elevated Speculation",
    "rhodl.elevatedCopy": "Short-term capital activity is heating up",
    "rhodl.overheated": "Extreme Overheating",
    "rhodl.overheatedCopy": "Monitor cycle-top and distribution risk",
    "rhodl.disclaimer": "Daily RHODL and BTC history come from BGeometrics' public API, with live spot from Binance. On-chain readings update daily and use a different timestamp from live price; zones are welinkBTC research bands for cycle monitoring only, not investment advice.",
    "lthRpl.title": "BTC: Entity-Adjusted Long-Term Holder Realized Profit/Loss Ratio",
    "lthRpl.subtitle": "Compare realized profit with realized loss among long-term holders to track the 1.0 pivot, underwater capitulation and macro-cycle transitions.",
    "lthRpl.current": "Current LTH P/L Ratio",
    "lthRpl.averages": "7D / 30D Average",
    "lthRpl.price": "Live BTC Price",
    "lthRpl.distance": "Distance to 1.0 Pivot",
    "lthRpl.loading": "Syncing long-term-holder realized profit/loss history...",
    "lthRpl.waiting": "Waiting for public data",
    "lthRpl.signalLabel": "Long-Term Capital State",
    "lthRpl.signalPending": "After synchronization, the model will classify underwater capitulation, pivot recovery, profit dominance or elevated distribution.",
    "lthRpl.change": "7-Day Change",
    "lthRpl.underwaterSince": "Underwater Since",
    "lthRpl.underwaterDays": "Underwater Days",
    "lthRpl.asOf": "On-Chain Date",
    "lthRpl.explainTitle": "The long-term-holder profit/loss ratio is testing the 1.0 pivot, with underwater phases marking deep rotation and macro capitulation windows",
    "lthRpl.explainOne": "The ratio compares realized profit with realized loss for coins held roughly longer than 155 days. Above 1.0, profitable spending dominates; below 1.0, long-held capital is realizing losses; a recross of 1.0 is an important macro sentiment transition signal.",
    "lthRpl.explainTwo": "Historical underwater zones covered the deep bear phases of 2012, 2015, 2019 and 2022–2023. This is not a one-day bottom signal; it is better suited to identifying sustained capitulation and redistribution among long-held coins.",
    "lthRpl.explainThree": "A bottoming process below 1.0 followed by a recovery above the pivot provides stronger right-side evidence. Confirm it with spot demand, realized prices, liquidity and price structure rather than relying on one threshold.",
    "lthRpl.underwater": "Underwater Capitulation",
    "lthRpl.underwaterCopy": "Realized losses dominate long-held spending",
    "lthRpl.pivot": "Pivot Recovery",
    "lthRpl.pivotCopy": "Watch for a durable break-even recovery",
    "lthRpl.profit": "Profit Dominance",
    "lthRpl.profitCopy": "Long-term capital mostly realizes profits",
    "lthRpl.distribution": "Elevated Distribution",
    "lthRpl.distributionCopy": "Profit realization intensity is elevated",
    "lthRpl.disclaimer": "Public history uses BGeometrics' over-155-day UTXO-age proxy and does not reproduce Glassnode's proprietary entity-cluster adjustment. Live spot comes from Binance; on-chain values update daily and are for cycle research only, not investment advice.",
    "slrv.title": "BTC: Short to Long-Term Realized Value (SLRV) Ratio (7-Day Moving Average)",
    "slrv.subtitle": "Compare the 24-hour and six-month-to-one-year realized HODL waves to track speculation, long-term absorption and cycle extremes.",
    "slrv.current": "Current SLRV · 7D",
    "slrv.averages": "7D / 30D Average",
    "slrv.price": "Live BTC Price",
    "slrv.distance": "Distance to Low Zone",
    "slrv.loading": "Syncing complete SLRV history...",
    "slrv.waiting": "Waiting for public data",
    "slrv.signalLabel": "Short / Long-Term Capital State",
    "slrv.signalPending": "After synchronization, the model will classify deep accumulation, normal activity, elevated speculation or overheated distribution.",
    "slrv.change": "7-Day Change",
    "slrv.raw": "Raw Daily Ratio",
    "slrv.lowZones": "Historical Low Zones",
    "slrv.asOf": "On-Chain Date",
    "slrv.explainTitle": "SLRV tracks short-term velocity relative to medium-term capital, with extreme lows marking subdued speculation and supply absorption",
    "slrv.explainOne": "SLRV divides the 24-hour realized HODL wave by the six-month-to-one-year realized HODL wave, then applies a seven-day moving average. Higher values show recently moved capital becoming more active; lower values show short-term velocity contracting relative to older capital.",
    "slrv.explainTwo": "Historical lows are not one-day bottom calls. They describe a structural window in which speculative excess has been compressed. The accumulation signal is stronger when low SLRV is joined by improving spot demand, realized-price support and better liquidity.",
    "slrv.explainThree": "High SLRV means short-term capital is accelerating relative to medium-term holdings and is often monitored for late-bull speculation and distribution. Cycle peaks evolve as the market matures, so fixed upper thresholds should not be applied mechanically.",
    "slrv.bottom": "Historical Low Zone",
    "slrv.bottomCopy": "Speculation cools; monitor long-term accumulation",
    "slrv.normal": "Normal Range",
    "slrv.normalCopy": "Short and longer-term velocity is relatively balanced",
    "slrv.elevated": "Elevated Activity",
    "slrv.elevatedCopy": "Short-term capital activity is strengthening",
    "slrv.overheated": "Overheated Distribution",
    "slrv.overheatedCopy": "Monitor cycle-top and distribution risk",
    "slrv.disclaimer": "Complete history uses BGeometrics public realized-cap HODL waves. The recent exact Bitcoin Data extension is robustly calibrated over the overlap window, while live spot comes from Binance. This public reconstruction is not a proprietary entity-adjusted feed and is for cycle research only, not investment advice.",
    "realizedCapHodl.title": "BTC: Realized Cap HODL Waves",
    "realizedCapHodl.subtitle": "Split cost-weighted capital by last-moved age to track the locking, accumulation and cycle peaks of coins older than three months.",
    "realizedCapHodl.current": "Capital Older Than 3M",
    "realizedCapHodl.averages": "7D / 30D Average",
    "realizedCapHodl.price": "Live BTC Price",
    "realizedCapHodl.peak": "All-Time Peak",
    "realizedCapHodl.loading": "Syncing complete Realized Cap HODL Waves history...",
    "realizedCapHodl.waiting": "Waiting for public data",
    "realizedCapHodl.signalLabel": "Long-Term Capital Lock State",
    "realizedCapHodl.signalPending": "After synchronization, the model will classify active rotation, balance, accumulation or deep supply lock.",
    "realizedCapHodl.change": "7-Day Change",
    "realizedCapHodl.distance": "Distance to 84% Deep Lock",
    "realizedCapHodl.cyclePeak": "Current-Cycle Peak",
    "realizedCapHodl.asOf": "On-Chain Date",
    "realizedCapHodl.explainTitle": "A high share of cost-weighted capital older than three months points to contracting active supply and long-term capital absorption",
    "realizedCapHodl.explainOne": "Realized Cap HODL Waves weight every coin by the price at which it last moved on-chain and then split that cost basis by age. Unlike raw coin counts, this reveals how invested capital migrates between recent traders and longer-term holders.",
    "realizedCapHodl.explainTwo": "Historical highs often appear late in the accumulation process after deep bear-market rotation, but a high locked share does not guarantee an immediate rally. It describes supply conditions and should be confirmed with spot demand, global liquidity and realized profit/loss.",
    "realizedCapHodl.explainThree": "When the over-three-month share stays elevated, liquid supply is generally thinner and incremental demand can have a larger price impact. A rapid decline means older capital is becoming active again and may signal distribution or renewed rotation.",
    "realizedCapHodl.active": "Active Rotation",
    "realizedCapHodl.activeCopy": "Younger capital has a larger weight",
    "realizedCapHodl.balanced": "Balanced Structure",
    "realizedCapHodl.balancedCopy": "Capital locking and liquidity coexist",
    "realizedCapHodl.accumulation": "Long-Term Accumulation",
    "realizedCapHodl.accumulationCopy": "Active supply is contracting",
    "realizedCapHodl.deepLock": "Deep Supply Lock",
    "realizedCapHodl.deepLockCopy": "Monitor cycle bottoms and supply shocks",
    "realizedCapHodl.disclaimer": "Complete history uses BGeometrics public Realized Cap HODL Waves. Bitcoin Data public daily fine-age bands extend the latest period and are grouped into the common public taxonomy; live spot comes from Binance. This public model does not reproduce proprietary entity clustering and is for cycle research only, not investment advice.",
    "under3mHodl.title": "BTC: <3m Realized Cap HODL Waves",
    "under3mHodl.subtitle": "Measure the share of realized capital last moved within three months to track speculative cooling, bottom reversals and cycle overheating.",
    "under3mHodl.current": "Capital Younger Than 3M",
    "under3mHodl.averages": "7D / 30D Average",
    "under3mHodl.price": "Live BTC Price",
    "under3mHodl.recentLow": "180-Day Local Low",
    "under3mHodl.loading": "Syncing complete <3m Realized Cap HODL Waves history...",
    "under3mHodl.waiting": "Waiting for public data",
    "under3mHodl.signalLabel": "Short-Term Capital Structure",
    "under3mHodl.signalPending": "After synchronization, the model will classify historical-bottom, accumulation, balanced or speculative conditions.",
    "under3mHodl.change": "7-Day Change",
    "under3mHodl.distance": "Distance to 18% Bottom Line",
    "under3mHodl.vTurn": "Bottom V-Turn",
    "under3mHodl.asOf": "On-Chain Date",
    "under3mHodl.explainTitle": "A turn higher after the under-three-month share falls into 12%–18% has historically aligned with speculative cleansing and fresh capital returning",
    "under3mHodl.explainOne": "The under-three-month Realized Cap HODL Wave measures the share of cost-weighted realized capital last moved within three months. A rising share signals active new money and hot capital; a falling share shows capital aging into medium- and long-term cohorts.",
    "under3mHodl.deepBottom": "Historical Deep Bottom",
    "under3mHodl.deepBottomCopy": "Short-term speculation is largely flushed",
    "under3mHodl.bottom": "Bottom Zone",
    "under3mHodl.bottomCopy": "Watch for a V-turn and fresh inflows",
    "under3mHodl.accumulation": "Accumulation Transition",
    "under3mHodl.accumulationCopy": "Short-term capital is returning gradually",
    "under3mHodl.speculation": "Speculative Overheating",
    "under3mHodl.speculationCopy": "Watch for cycle-top distribution risk",
    "under3mHodl.explainTwo": "The 2011, 2015, 2019, 2022 and current-cycle lows all cluster around roughly 12%–18%. A low reading shows speculation has cooled; a sustained recovery from that low offers stronger evidence that short-term capital has shifted from net exit to net entry.",
    "under3mHodl.explainThree": "An extremely low young-capital share means most realized-cap weight has aged beyond three months and active supply is relatively tight. If spot demand recovers at the same time, small incremental inflows can have a larger price impact. High readings instead signal rapid rejuvenation, speculation and potential distribution.",
    "under3mHodl.disclaimer": "Complete history uses BGeometrics public Realized Cap HODL Waves, extended with Bitcoin Data public daily fine-age bands. The under-three-month share is calculated with the transparent identity 100% minus the over-three-month share; live spot comes from Binance. No paid API or proprietary entity clustering is used. For cycle research only, not investment advice.",
    "sth200dma.title": "BTC: Short-Term Holder Realized Price / 200DMA Golden Cross",
    "sth200dma.subtitle": "Track the STH realized price crossing above BTC's 200-day average to identify macro regime transitions and estimate long-cycle windows from public history.",
    "sth200dma.sth": "STH Cost Basis",
    "sth200dma.dma": "BTC 200DMA",
    "sth200dma.cross": "Latest Macro Golden Cross",
    "sth200dma.window": "Historical Average Window",
    "sth200dma.loading": "Syncing complete STH realized price and BTC 200DMA history...",
    "sth200dma.waiting": "Waiting for public data",
    "sth200dma.signalLabel": "Macro Structure",
    "sth200dma.signalPending": "After synchronization, the model will confirm the daily golden cross, closes above trend and historical cycle window.",
    "sth200dma.elapsed": "Time Since Cross",
    "sth200dma.closes": "Confirmation Closes",
    "sth200dma.projected": "Historical Projection",
    "sth200dma.asOf": "On-Chain Date",
    "sth200dma.explainTitle": "An STH cost-basis break above the 200DMA signals that short-term market cost has repaired and overtaken the long-term trend",
    "sth200dma.explainOne": "The red line is the average on-chain cost basis of coins younger than 155 days; the black line is the simple 200-day average of daily BTC price. A cross from below followed by consecutive closes above has historically marked a transition from bear-market repair toward macro expansion.",
    "sth200dma.explainTwo": "Across completed public-data samples, the interval from a macro golden cross to the subsequent cycle price peak has clustered near two and a half years. The interface calculates that statistic dynamically instead of hard-coding a promised date.",
    "sth200dma.explainThree": "A golden cross is a macro-structure signal, not a short-term trade instruction. Confirm it with spot demand, global liquidity, holder profit-taking and price trend, while accounting for small samples, data revisions and cycle failure.",
    "sth200dma.disclaimer": "STH realized price prefers BGeometrics' public daily endpoint and falls back to Bitbo's public daily snapshot when rate-limited. BTC 200DMA is transparently calculated from public daily BTC price and live spot comes from Binance. STH uses the under-155-day definition. For cycle research only, not investment advice.",
    "vddMedian.title": "BTC: VDD and Median Price Top-and-Bottom Model",
    "vddMedian.subtitle": "Combine long-holder activity in VDD with distance from Median Price to mark green bear bottoms, red bull-top bars and a rolling 687 / 678-day reference window.",
    "vddMedian.price": "Live BTC Price",
    "vddMedian.median": "Median Price",
    "vddMedian.vdd": "VDD Multiple",
    "vddMedian.window": "Historical Average Window",
    "vddMedian.loading": "Syncing complete VDD, Median Price and BTC daily history...",
    "vddMedian.waiting": "Waiting for public data",
    "vddMedian.signalLabel": "Composite Cycle Signal",
    "vddMedian.signalPending": "After synchronization, the model will confirm bottom zones, top-risk bars and the current projection from transparent VDD and Median Price thresholds.",
    "vddMedian.elapsed": "Time Since Bottom End",
    "vddMedian.ratio": "Price / Median",
    "vddMedian.projected": "Projected Top Midpoint",
    "vddMedian.asOf": "On-Chain Date",
    "vddMedian.explainTitle": "Low VDD plus a Median Price retest identifies bear bottoms; high VDD plus a rich median multiple identifies distribution risk",
    "vddMedian.explainOne": "A green zone requires VDD Multiple below 0.9 and BTC no more than 1.25 times Median Price, identifying a right-side bottom after old-coin activity and valuation cool. A red bar requires VDD at or above 1.5 and BTC / Median Price at or above 1.5, identifying old-coin distribution alongside valuation expansion.",
    "vddMedian.explainTwo": "The reference model uses two completed windows of 687 and 678 days, averaging about 683 days or 22.4 months. They remain visible as auditable calibration samples while the system rolls the current risk window from the first daily close after the latest green zone.",
    "vddMedian.explainThree": "The end of a green zone is only a candidate macro-cycle start and a red bar is only a risk warning. The sample is small, VDD and Median Price may be revised, and cycle duration can fail; confirm with spot demand, global liquidity and long-holder behavior.",
    "vddMedian.disclaimer": "VDD Multiple uses BGeometrics' public daily endpoint; price uses public BTC daily data and Binance Spot; Median Price is transparently reconstructed from public HODL Waves and verifiable anchors. No paid API is used. Historical windows are research references, not deterministic price or return forecasts, and this is not investment advice.",
    "ssr.title": "BTC: Stablecoin Supply Ratio with Bollinger Bands",
    "ssr.subtitle": "Divide BTC market capitalization by total stablecoin capitalization and apply a 200-day, two-standard-deviation channel to identify right-side upper-band breakouts after a bear bottom.",
    "ssr.price": "Live BTC Price",
    "ssr.current": "Current SSR",
    "ssr.upper": "Upper Bollinger Band",
    "ssr.lower": "Lower Bollinger Band",
    "ssr.loading": "Syncing complete BTC market-cap, stablecoin-supply and SSR daily history...",
    "ssr.waiting": "Waiting for public data",
    "ssr.signalLabel": "SSR Right-Side Trend State",
    "ssr.signalPending": "After synchronization, daily SSR upper-band crossings, confirmed closes and historical breakout samples will determine the right-side trend state.",
    "ssr.elapsed": "Time Since Breakout",
    "ssr.distance": "Distance to Upper Band",
    "ssr.closes": "Confirmed Closes",
    "ssr.projected": "Historical Follow-Through Window",
    "ssr.explainTitle": "SSR breaking above its 200-day upper band means BTC market-cap growth is materially outrunning the stablecoin purchasing-power pool",
    "ssr.explainOne": "SSR equals BTC market capitalization divided by total stablecoin capitalization. A lower ratio means more potential stablecoin purchasing power per unit of BTC market value. The model builds upper and lower bands from a 200-day mean plus or minus two population standard deviations and only records upward crossings from inside the channel.",
    "ssr.explainTwo": "The public series automatically recalculates the 2019 and 2023 right-side breakouts and their following 365-day price samples. The latest breakout, confirmation count and 180-to-365-day observation window roll forward daily; no date from the reference image is hard-coded as a live conclusion.",
    "ssr.explainThree": "An upper-band breakout is momentum evidence after a bear bottom, not a standalone buy instruction. Stablecoin supply, BTC market cap and historical data can be revised. A quick move back below the upper band should be treated as a potential false breakout and checked against spot demand, liquidity and holder structure.",
    "ssr.disclaimer": "BTC market cap comes from the Coin Metrics Community API. Stablecoin capitalization uses DefiLlama's public aggregate with the Coin Metrics core-stablecoin basket as an early-history floor so incomplete early aggregates do not understate supply. No paid API is used. For cycle research only, not investment advice.",
    "sthBands.title": "BTC: Short-Term Holder Cost Basis Model [4Y, 2011-] · Nine Bands",
    "sthBands.subtitle": "Use STH realized price as Line5, derive nine −2σ to +2σ rails from a rolling four-year price-cost dispersion, and track Line7 (+1σ) for right-side breakouts.",
    "sthBands.price": "Live BTC Price",
    "sthBands.line5": "Line5 · STH Cost Basis",
    "sthBands.line7": "Line7 · +1σ",
    "sthBands.zone": "Current Nine-Band Zone",
    "sthBands.loading": "Syncing complete BTC and STH cost-basis history and calculating the four-year nine-band model...",
    "sthBands.waiting": "Waiting for public data",
    "sthBands.signalLabel": "Line7 Right-Side Breakout State",
    "sthBands.signalPending": "After synchronization, BTC daily crossings above Line7, consecutive closes and the 2019/2023 samples will determine the right-side trend state.",
    "sthBands.elapsed": "Time Since Breakout",
    "sthBands.distance": "Distance to Line7",
    "sthBands.closes": "Confirmed Closes",
    "sthBands.projected": "Scenario Follow-Through Window",
    "sthBands.explainTitle": "BTC reaching Line7 (STH cost basis +1σ) means short-term purchasing power is decisively leaving the dense cost zone",
    "sthBands.explainOne": "Line5 directly uses the realized price of holders younger than 155 days. The service measures the population standard deviation of daily BTC price minus that cost basis over four years, then builds Line1 through Line9 in 0.5σ steps; Line7 is +1σ.",
    "sthBands.explainTwo": "The public history automatically detects the 2019 and 2023 Line7 breakouts, measures the following 365-day price path, and creates a rolling 180-to-365-day observation window from the latest valid event. Dotted extensions are scenarios based on a damped recent Line5 slope and mean-reverting dispersion, not price forecasts.",
    "sthBands.explainThree": "A Line7 touch is right-side trend evidence, not proof of a bull market or a standalone buy instruction. Public STH data, price history and volatility rails can be revised. A quick move back below Line7 still requires validation from spot demand, liquidity and long-term-holder behavior.",
    "sthBands.disclaimer": "Price and STH realized price come from public daily sources; live price comes from Binance Spot. All nine rails are calculated transparently by this system without a paid API, and do not claim to reproduce a proprietary CryptoChan series. For cycle research only, not investment advice.",
    "percentProfitEx10y.title": "BTC: Percent Supply in Profit [Ex >10y, 7DMA]",
    "percentProfitEx10y.subtitle": "Remove coins dormant for more than ten years from both profitable and total supply, then use a 7-day average to identify the 55%–60% deep-reset window near the end of bull-market recovery.",
    "percentProfitEx10y.current": "Active Profit Share · 7DMA",
    "percentProfitEx10y.price": "Live BTC Price",
    "percentProfitEx10y.dormant": "Excluded >10-Year Supply",
    "percentProfitEx10y.state": "Current Turnover State",
    "percentProfitEx10y.loading": "Syncing BTC, profitable supply and over-ten-year dormant supply from 2011 and calculating the 7-day average...",
    "percentProfitEx10y.signalLabel": "Late-Recovery Washout State",
    "percentProfitEx10y.waiting": "Waiting for public data",
    "percentProfitEx10y.signalPending": "After synchronization, the model uses the 55%–60% zone, recent low and seven-day change to assess the washout.",
    "percentProfitEx10y.change": "7-Day Change",
    "percentProfitEx10y.distance": "Distance to 55%",
    "percentProfitEx10y.activeProfit": "Active Profit Supply",
    "percentProfitEx10y.scenario": "Scenario Extension",
    "percentProfitEx10y.explainTitle": "An active profit share near 55%–60% often marks a deep profit-taking washout and cost-basis reset before late recovery turns into expansion",
    "percentProfitEx10y.explainOne": "The model starts with public profitable supply divided by public total supply, removes coins dormant for more than ten years from both numerator and denominator, and applies a 7-day average. Removing likely lost or deeply dormant early coins better focuses the cost structure of supply that can participate today.",
    "percentProfitEx10y.explainTwo": "The service recalculates the 2012, 2016, 2019 and 2023 windows daily: the first two use 60%, the latter two use 55%, and the 2019 sample stops before the March 2020 black swan. The dotted right-side extension only damps recent momentum toward the four-year median; it is not a price forecast.",
    "percentProfitEx10y.explainThree": "A low profit share can show that leverage and early profits were cleared, but cannot confirm a markup phase by itself. A prolonged stay below the threshold without price and liquidity recovery still requires validation from cost basis, spot demand and long-term-holder behavior.",
    "percentProfitEx10y.disclaimer": "This dashboard uses a transparent public-data proxy: over-ten-year dormant supply is assumed profitable and removed from both profit and total supply. It uses no paid API and does not claim to reproduce CryptoChan's proprietary entity-adjusted series. For cycle research only, not investment advice.",
    "sthMvrv.title": "BTC: Short Term Holder MVRV",
    "sthMvrv.subtitle": "Divide BTC market price by short-term-holder realized price to identify the first dip, rebound and second dip near the close of a recovery phase.",
    "sthMvrv.current": "Current STH-MVRV",
    "sthMvrv.price": "Live BTC Price",
    "sthMvrv.cost": "STH Cost Basis",
    "sthMvrv.state": "Current Double-Bottom State",
    "sthMvrv.loading": "Syncing BTC and short-term-holder realized price from 2011 and calculating the STH-MVRV double-bottom structure...",
    "sthMvrv.signalLabel": "Recovery Double-Bottom State",
    "sthMvrv.waiting": "Waiting for public data",
    "sthMvrv.signalPending": "After synchronization, the 1.0 breakeven line plus first dip, rebound and second dip determine the short-term-holder reset state.",
    "sthMvrv.change": "7-Day Change",
    "sthMvrv.distance": "Distance to 1.0",
    "sthMvrv.dips": "Current First / Second Dip",
    "sthMvrv.scenario": "Scenario Extension",
    "sthMvrv.explainTitle": "Two STH-MVRV breaks below 1.0 followed by a reclaim often show that late-recovery leverage and short-term float have been cleared twice",
    "sthMvrv.explainOne": "STH-MVRV is BTC market price divided by the realized price of coins held for less than 155 days. A value of 1.0 is aggregate short-term-holder breakeven; below 1.0 is aggregate unrealized loss and above 1.0 is cost recovery.",
    "sthMvrv.explainTwo": "The service detects the first dip, rebound and second dip in the 2019 and 2023 recovery windows and explicitly excludes the March 2020 external black swan. The dotted right-side path only damps recent momentum toward the four-year median for a rolling 365-day research scenario; it is not a price forecast.",
    "sthMvrv.explainThree": "A double dip and reclaim of 1.0 are cost-structure evidence, not proof of a markup phase. Another break below 1.0 or weak spot demand still requires confirmation from long-term holders, liquidity and other cost-basis models.",
    "sthMvrv.disclaimer": "This dashboard calculates a transparent proxy from public BTC daily price and public short-term-holder realized price. It uses no paid API and does not claim to reproduce CryptoChan's proprietary entity-adjusted series. For cycle research only, not investment advice.",
    "lthSpent.title": "BTC: LTH Spent Price Under-water",
    "lthSpent.subtitle": "Compare spot price with the average acquisition cost of coins actually spent by long-term holders to track loss realization, capitulation and reclaim windows.",
    "lthSpent.current": "LTH Spent Price",
    "lthSpent.price": "Live BTC Price",
    "lthSpent.ratio": "Price / LTH Spent Price",
    "lthSpent.days": "Current Under-water Days",
    "lthSpent.loading": "Syncing public LTH Spent Price history...",
    "lthSpent.signalLabel": "Long-Term Holder Spending State",
    "lthSpent.waiting": "Waiting for public data",
    "lthSpent.signalPending": "After synchronization, the model will classify above-cost spending, a reclaim test, under-water capitulation or deep under-water stress.",
    "lthSpent.change": "7-Day Spent-Price Change",
    "lthSpent.sopr": "LTH-SOPR",
    "lthSpent.start": "Latest Under-water Start",
    "lthSpent.publicStart": "Exact Public Series Start",
    "lthSpent.explainTitle": "A sustained price break below LTH Spent Price means long-term holders are moving coins below their acquisition cost",
    "lthSpent.explainOne": "LTH Spent Price is the weighted average acquisition cost of coins spent that day by holders aged at least 155 days. Under Glassnode's public definition it equals daily BTC price divided by LTH-SOPR. It describes the cost of coins spent that day, not the average cost of every long-term-holder coin.",
    "lthSpent.above": "Above Cost",
    "lthSpent.aboveCopy": "Long-term coins are predominantly spent in profit",
    "lthSpent.reclaim": "Reclaim Test",
    "lthSpent.reclaimCopy": "Price has just recovered above the cost line",
    "lthSpent.under": "Under-water Capitulation",
    "lthSpent.underCopy": "Long-term holders are realizing sustained losses",
    "lthSpent.deep": "Deep Under-water",
    "lthSpent.deepCopy": "Price is more than 10% below spent cost",
    "lthSpent.explainTwo": "Research windows show that price remaining below LTH spent cost for more than one hundred days has often appeared late in macro bear markets: roughly 124 days in 2014, 188 in 2018 and 193 in 2022. The 2026 research window records about 146 days into the $57.8K area.",
    "lthSpent.explainThree": "Loss realization by long-term holders shows even strong hands are being cleared, but it does not confirm an exact bottom alone. A more robust right-side signal is price reclaiming LTH Spent Price together with better spot demand, realized profit/loss and global liquidity.",
    "lthSpent.disclaimer": "Exact LTH Spent Price follows the public formula BTC Price divided by LTH-SOPR using BGeometrics public daily LTH-SOPR and BTC history; live spot comes from Binance. Before the public LTH-SOPR start, only labeled research windows are shown and no metric line is fabricated. For cycle research only, not investment advice.",
    "percentProfit.title": "BTC: Percent Supply in Profit",
    "percentProfit.subtitle": "Measure the share of circulating Bitcoin currently in unrealized profit to identify deep flushes, cycle recovery and crowded profit-taking zones.",
    "percentProfit.current": "Current Supply in Profit",
    "percentProfit.price": "Live BTC Price",
    "percentProfit.averages": "7D / 30D Average",
    "percentProfit.distance": "Distance to 50% Flush Line",
    "percentProfit.loading": "Syncing complete Percent Supply in Profit history...",
    "percentProfit.signalLabel": "Market-Wide Cost-Basis State",
    "percentProfit.waiting": "Waiting for public data",
    "percentProfit.signalPending": "After synchronization, the model will classify deep flush, recovery, normal profit or high-profit overheat conditions.",
    "percentProfit.change": "7-Day Change",
    "percentProfit.profitSupply": "Supply in Profit",
    "percentProfit.lossSupply": "Supply in Loss",
    "percentProfit.asOf": "On-Chain Date",
    "percentProfit.explainTitle": "A break below 50% means most supply is underwater, a condition historically associated with deep macro bear-market clearing",
    "percentProfit.explainOne": "Percent Supply in Profit measures circulating Bitcoin whose last on-chain transfer price is below the current market price. It directly describes market-wide unrealized profit: higher readings mean more crowded profits, while lower readings mean broader losses and capitulation pressure.",
    "percentProfit.flush": "Deep Flush Zone",
    "percentProfit.flushCopy": "Most supply is underwater; monitor capitulation",
    "percentProfit.recovery": "Recovery Zone",
    "percentProfit.recoveryCopy": "Supply is recovering from broad losses",
    "percentProfit.balanced": "Normal Profit Zone",
    "percentProfit.balancedCopy": "Most supply is profitable without an extreme",
    "percentProfit.overheated": "Top Overheat Zone",
    "percentProfit.overheatedCopy": "Crowded profits raise distribution risk",
    "percentProfit.explainTwo": "Research reference lows are approximately 36% in 2015, 39% in 2019, 45% in 2022–23 and 46% near $57.8K in the current cycle. These are comparative study markers; the cards below also show each window's actual low calculated from this public dataset.",
    "percentProfit.explainThree": "A rebound from below 50% shows that broad unrealized losses are easing, but it does not confirm an exact bottom alone. A stronger assessment combines spot demand, realized price, long-term-holder behavior and global liquidity.",
    "percentProfit.disclaimer": "Complete history uses BGeometrics public daily supply-in-profit and supply-in-loss series and calculates 100 × profit supply ÷ (profit supply + loss supply); live spot comes from Binance. The 50% and 95% levels are dashboard research zones, not deterministic trading signals. For cycle research only, not investment advice.",
    "lthExchangeLoss.title": "BTC: LTH Realized Loss to Exchanges (30D Moving Average)",
    "lthExchangeLoss.subtitle": "Build a reproducible public proxy from LTH/STH realized profit and loss to track strong-hand capitulation and cycle-bottom pressure.",
    "lthExchangeLoss.current": "Current 30D Proxy",
    "lthExchangeLoss.price": "Live BTC Price",
    "lthExchangeLoss.averages": "7D / 30D Average",
    "lthExchangeLoss.peak": "One-Year Peak",
    "lthExchangeLoss.loading": "Syncing the public LTH realized-loss proxy history...",
    "lthExchangeLoss.signalLabel": "Long-Term Holder Loss Pressure",
    "lthExchangeLoss.waiting": "Waiting for public data",
    "lthExchangeLoss.signalPending": "After synchronization, the model will classify quiet, normal, stress or capitulation conditions.",
    "lthExchangeLoss.change": "7-Day Change",
    "lthExchangeLoss.raw": "Daily Raw Share",
    "lthExchangeLoss.lossUsd": "LTH Realized Loss",
    "lthExchangeLoss.asOf": "On-Chain Date",
    "lthExchangeLoss.explainTitle": "A surge in long-term-holder loss share shows strong hands are being washed out; a confirmed peak and retreat often precede supply redistribution",
    "lthExchangeLoss.explainOne": "The exact realized loss sent to exchanges requires exchange-address labels and entity clustering. This public proxy divides LTH realized loss by all realized LTH/STH profit and loss, then applies a 30-day moving average for a transparent and reproducible view of capitulation intensity.",
    "lthExchangeLoss.quiet": "Quiet Zone",
    "lthExchangeLoss.quietCopy": "Long-term-holder loss activity is low",
    "lthExchangeLoss.normal": "Normal Zone",
    "lthExchangeLoss.normalCopy": "Loss realization remains within normal variation",
    "lthExchangeLoss.stress": "Stress Zone",
    "lthExchangeLoss.stressCopy": "Long-term-holder loss pressure is broadening",
    "lthExchangeLoss.capitulation": "Capitulation Zone",
    "lthExchangeLoss.capitulationCopy": "Strong-hand supply is undergoing a deep washout",
    "lthExchangeLoss.explainTwo": "The public proxy peaked near 56% in 2015, 55% in 2019 and 69% in 2022–23, broadly matching the reference structure. Proprietary exchange-labelled research places the current-cycle reference peak near 70%, but that is not a live observation from this public proxy.",
    "lthExchangeLoss.explainThree": "A rising peak means long-term holders are realizing more losses. Only a confirmed peak followed by a sustained decline more closely supports the view that the harshest selling pressure has passed. Confirm with spot demand, exchange netflows and price structure.",
    "lthExchangeLoss.disclaimer": "This chart is not an exchange-labelled source series. It uses BGeometrics public daily LTH/STH realized profit and loss, calculating LTH loss as a share of all realized profit and loss plus a 30-day average; live spot comes from Binance. Exact exchange-inflow metrics require proprietary address labels and entity clustering. For research only, not investment advice.",
    "twoWeekRsi.title": "BTC: 2-Week Relative Strength Index",
    "twoWeekRsi.subtitle": "Resample public BTC daily prices into biweekly closes, calculate Wilder RSI(14), and compare momentum with a long-term declining channel.",
    "twoWeekRsi.current": "Current 2W RSI",
    "twoWeekRsi.price": "Live BTC Price",
    "twoWeekRsi.channel": "Dynamic Lower / Upper",
    "twoWeekRsi.distance": "Distance to Lower Rail",
    "twoWeekRsi.loading": "Syncing BTC biweekly closes and calculating the long-term RSI channel...",
    "twoWeekRsi.signalLabel": "Macro Momentum State",
    "twoWeekRsi.waiting": "Waiting for public price data",
    "twoWeekRsi.signalPending": "After synchronization, the model will classify lower-rail confluence, macro oversold, neutral or overheated conditions.",
    "twoWeekRsi.change": "Period Change",
    "twoWeekRsi.previous": "Previous RSI",
    "twoWeekRsi.average": "6W / 12W Average",
    "twoWeekRsi.asOf": "Biweekly Observation",
    "twoWeekRsi.explainTitle": "A 2-week RSI near the long-term lower rail shows macro downside momentum is deeply spent; stabilization and recovery provide stronger right-side confirmation",
    "twoWeekRsi.explainOne": "The 2-week RSI applies Wilder smoothing to 14 biweekly closing periods, filtering daily and weekly noise to expose macro momentum. The upper and lower rails are regressions through historical cycle RSI extremes and decline gradually over time.",
    "twoWeekRsi.lowerTouch": "Lower-Rail Confluence",
    "twoWeekRsi.lowerTouchCopy": "Near historical bear-bottom momentum support",
    "twoWeekRsi.oversold": "Macro Oversold",
    "twoWeekRsi.oversoldCopy": "Downside momentum is substantially depleted",
    "twoWeekRsi.neutral": "Neutral Momentum",
    "twoWeekRsi.neutralCopy": "Waiting for a directional break",
    "twoWeekRsi.overheated": "Overheated",
    "twoWeekRsi.overheatedCopy": "Watch for momentum decay and distribution",
    "twoWeekRsi.explainTwo": "Historical windows show the 2015, 2019, 2022–23 and current-cycle 2-week RSI lows clustering near the dynamic lower rail. A touch improves long-term risk/reward, but bottom formation can still take weeks or months.",
    "twoWeekRsi.explainThree": "A more robust confirmation is RSI ceasing to make new lows and recovering away from the lower rail, supported by spot demand, long-term-holder cost bases and global liquidity. One rail touch is not a deterministic buy signal.",
    "twoWeekRsi.disclaimer": "Full history uses BGeometrics public daily BTC prices, sampling the final close of each 14-day period and calculating Wilder RSI(14); live spot comes from Binance. The long-term channel is a transparent regression of cycle extremes, not a raw on-chain field or proprietary Surf series. For cycle research only, not investment advice.",
    "vdd.title": "Bitcoin: Value Days Destroyed Multiple",
    "vdd.subtitle": "Compare daily value days destroyed with its trailing 365-day average to identify long-term-holder dormancy, accumulation and distribution.",
    "vdd.current": "Current VDD",
    "vdd.averages": "7D / 30D Average",
    "vdd.recentLow": "30-Day Local Low",
    "vdd.thresholds": "Accumulation / Distribution",
    "vdd.loading": "Syncing Value Days Destroyed Multiple history...",
    "vdd.waiting": "Waiting for public data",
    "vdd.signalLabel": "Long-Term Holder Activity",
    "vdd.signalPending": "After synchronization, the model will classify old-coin dormancy, normal activity or elevated distribution.",
    "vdd.price": "BTC Reference Price",
    "vdd.change": "7-Day Change",
    "vdd.peak": "All-Time Peak",
    "vdd.asOf": "On-Chain Date",
    "vdd.explainTitle": "Very low VDD means old coins are barely moving and long-term holders dominate supply absorption",
    "vdd.explainOne": "VDD Multiple divides daily value days destroyed by its trailing 365-day average. Older and more valuable coins create more value days when spent, so the metric tracks whether long-term holders are dormant and accumulating or actively spending and distributing.",
    "vdd.explainTwo": "Below 0.75, long-term coin spending is materially below its annual norm and has historically appeared during deep accumulation or before trend expansion. Above 2.9, old-coin activity is unusually high and is commonly monitored for cycle-top distribution pressure.",
    "vdd.explainThree": "Low VDD shows reluctance to sell but does not confirm a price bottom by itself. Read it with spot demand, exchange flows, liquidity and price structure; accumulation becomes more useful when demand improves after the low-VDD period.",
    "vdd.accumulation": "Deep Accumulation",
    "vdd.accumulationCopy": "Old coins move less while long-term holders remain dormant",
    "vdd.normal": "Normal Activity",
    "vdd.normalCopy": "Value-day destruction is near its historical norm",
    "vdd.distribution": "Elevated Distribution",
    "vdd.distributionCopy": "Old coins move aggressively; monitor cycle-top risk",
    "vdd.previousZoneOne": "Previous Low Zone I",
    "vdd.previousZoneTwo": "Previous Low Zone II",
    "vdd.currentZone": "Current Low Zone",
    "vdd.liveReading": "Latest Reading",
    "vdd.disclaimer": "Daily VDD Multiple and BTC history come from BGeometrics' public API, with live spot from Binance. Daily on-chain values and live price use different timestamps. Cycle research only, not investment advice.",
    "lthNupl.title": "BTC: Entity-Adjusted LTH-NUPL",
    "lthNupl.subtitle": "Track long-term-holder net unrealized profit and loss, sentiment phases and the pace of recovery during bear-market bottom formation.",
    "lthNupl.current": "Current LTH-NUPL",
    "lthNupl.averages": "7D / 30D Average",
    "lthNupl.recentLow": "30-Day Local Low",
    "lthNupl.stressDays": "Current Fear-Zone Days",
    "lthNupl.loading": "Syncing Long-Term Holder NUPL history...",
    "lthNupl.waiting": "Waiting for public data",
    "lthNupl.signalLabel": "Long-Term Holder Sentiment",
    "lthNupl.signalPending": "After synchronization, the model will classify capitulation, fear, hope, optimism or euphoria.",
    "lthNupl.price": "BTC Reference Price",
    "lthNupl.change": "7D / 30D Change",
    "lthNupl.distance": "Distance to 0.25 Hope",
    "lthNupl.asOf": "On-Chain Date",
    "lthNupl.explainTitle": "LTH-NUPL uses long-term-holder paper profit and loss to map capitulation, repair and cycle overheating",
    "lthNupl.explainOne": "LTH-NUPL measures net unrealized profit and loss for coins held longer than 155 days. Below zero indicates aggregate long-term-holder paper loss; zero to 0.25 is the Fear phase, while a rising reading indicates easing balance-sheet pressure.",
    "lthNupl.explainTwo": "When both seven- and thirty-day trends rise, long-term-holder profitability is typically repairing. A more reliable right-side confirmation requires a sustained move out of Fear alongside improving price structure and spot demand.",
    "lthNupl.explainThree": "Long-term-holder loss and fear help locate deep stress but cannot confirm a bottom alone. Read them with spot demand, liquidity, exchange flows and price structure rather than treating a single threshold as deterministic.",
    "lthNupl.capitulation": "Capitulation",
    "lthNupl.capitulationCopy": "Long-term holders are underwater in aggregate",
    "lthNupl.fear": "Fear",
    "lthNupl.fearCopy": "Bottom stress and repair window",
    "lthNupl.hope": "Hope",
    "lthNupl.hopeCopy": "Profitability begins to recover",
    "lthNupl.optimism": "Optimism",
    "lthNupl.optimismCopy": "Long-term-holder profit expands",
    "lthNupl.euphoria": "Euphoria",
    "lthNupl.euphoriaCopy": "Monitor elevated distribution pressure",
    "lthNupl.patternLabel": "Research Hypothesis · Historical Symmetry",
    "lthNupl.patternCopy": "The supplied research compares a 62-day 2014–15 left-side red-bar pattern with 63 days in 2022–23; the 2014–15 right side lasted 192 days. This is a research projection, not an automatic finding from the public proxy series.",
    "lthNupl.projectedLabel": "Reference Completion Window",
    "lthNupl.projectedCopy": "A timing observation only, not a price forecast",
    "lthNupl.stressOne": "Historical Stress I",
    "lthNupl.stressTwo": "Historical Stress II",
    "lthNupl.stressCurrent": "Latest Stress Period",
    "lthNupl.liveReading": "Latest Reading",
    "lthNupl.disclaimer": "The live public series uses BGeometrics' UTXO-age LTH-NUPL as a proxy for the entity-adjusted model, with Coin Metrics price history and Binance live spot. Glassnode's strict entity-cluster-adjusted methodology is paid and must not be treated as identical. Cycle research only, not investment advice.",
    "surf.open": "Open Surf model analysis",
    "surf.title": "Surf Data Model",
    "surf.loading": "Surf is analyzing the current metric...",
    "surf.refresh": "Analyze Again",
    "surf.copy": "Copy Insight",
    "surf.close": "Collapse",
    "surf.error": "Surf is temporarily unavailable. Please retry shortly.",
    "halving.title": "Fifth Halving Progress",
    "halving.height": "Current Height",
    "halving.target": "Target Height",
    "halving.blocks": "Blocks Left",
    "halving.reward": "Block Reward",
    "reference.title": "Metric Reference",
    "reference.action": "Click to collapse / expand",
    "radar.realtime": "Live assessment",
    "radar.score": "Cycle pressure",
    "radar.waiting": "Waiting for data",
    "radar.price": "Price trend",
    "radar.sentiment": "Sentiment",
    "radar.valuation": "Valuation",
    "radar.leverage": "Leverage",
    "radar.halving": "Halving cycle",
    "radar.noteTitle": "Current Watch",
    "radar.note": "A cycle observation appears after sync. Not investment advice.",
    "radar.sources": "Data Sources",
    "footer.label": "BTC On-chain Intelligence",
    "footer.home": "Back to home",
    days: "days",
    blocks: "blocks",
    updated: "Updated",
    source: "Source",
    modelEstimate: "Model estimate",
    accumulation: "Accumulation",
    bottomFishing: "Deep value",
    wait: "Wait",
    overheated: "Overheated",
    deepValue: "Deep value",
    neutral: "Neutral",
    warm: "Warm",
    pressureLow: "Low pressure",
    pressureMedium: "Medium pressure",
    pressureHigh: "High pressure",
    priceAboveWma: "Above long-term average",
    priceBelowWma: "Below long-term average",
    dataPending: "Historical series unavailable",
    syncing: "Syncing",
    authorized: "Authorization pending"
  }
};

const metricReferences = {
  zh: [
    ["BTC 实时价格", "聚合现货报价与 24 小时涨跌幅，用于确认当前市场方向。正式决策应结合多交易所 VWAP 与深度。"],
    ["恐惧 & 贪婪指数", "0-100 的情绪温度计：0-24 极度恐惧，25-44 恐惧，45-55 中性，56-74 贪婪，75-100 极度贪婪。"],
    ["AHR999", "结合现价、200 日定投成本线与幂律拟合价格。低于 0.45 常被视为深度价值区，0.45-1.2 更适合分批观察。"],
    ["MVRV Ratio", "市值除以已实现市值。低于 1 表示市场整体接近亏损，高位则说明未实现利润和获利了结压力增加。"],
    ["STH Cost Basis / TMMP", "STH Cost Basis 是 155 日内移动筹码的平均成本；TMMP 是投资者资本除以活跃供应。STH 向下跌破 TMMP 表示近期资金成本低于活跃市场均价，常用于观察深度洗盘后的底部构筑窗口。"],
    ["STH-RP / TMMP Ratio", "短期持有者实现价格除以真实市场平均价格。低于 1 代表短期成本弱于活跃市场均价；接近 0.75 时，历史上常进入周期级深度恐慌与底部观察窗口。"],
    ["LTH 实现价交叉", "比较 0–10 年综合实现价与 6 月–5 年、6 月–7 年、6 月–10 年持有者成本。基准线依次向下交叉三条长期成本线，可用于观察宏观底部附近的深度筹码换手。"],
    ["LTH/STH 成本基础比", "长期持有者实现价格除以短期持有者实现价格。低于 0.48 常对应熊市深度积累；向上收复后持续接近峰值，表示长短期成本差距缩小、市场进入成本重构阶段。"],
    ["标准调整 MVRV 波段", "以最近 1,460 个日观测计算 MVRV 的四年滚动均值和标准差。跌破 -1σ 表示相对自身四年历史进入统计极端低估区，收复均值则反映估值压力缓解。"],
    ["价值日销毁倍数", "每日价值日销毁量除以其 365 日均值。低于 0.75 表示老币活动低迷、长期持有者偏向休眠积累；高于 2.9 则提示老币花费和派发强度异常升高。"],
    ["实体调整 LTH-NUPL", "衡量长期持有者的净未实现利润与亏损。低于 0 为投降区，0–0.25 为恐惧区。公开看板使用 UTXO 币龄 LTH-NUPL 作为实时代理；严格实体聚类调整口径需使用 Glassnode 付费数据。"],
    ["LTH 已实现盈亏比", "长期持有者已实现利润除以已实现损失。低于 1.0 表示长期筹码亏损兑现占主导，重新向上收复 1.0 可用于观察宏观修复。公开看板采用 155 天以上 UTXO 年龄代理，并非专有实体聚类口径。"],
    ["MVRV Z-Score", "用市值与已实现市值的差异除以市值标准差，帮助比较不同周期的估值偏离。"],
    ["200 WMA", "200 周均线是长期成本锚。历史上价格跌至或短暂跌破该线时，通常处于周期压力较高阶段。"],
    ["Balanced Price", "已实现价格减去转移价格，用于观察市场持币成本与币龄消耗后的均衡估值。"],
    ["NUPL", "净未实现利润/亏损，映射投降、希望、乐观与狂热等周期阶段。"],
    ["SOPR", "花费产出利润率。大于 1 表示被转移筹码平均盈利，小于 1 表示平均亏损。"],
    ["Puell Multiple", "每日矿工收入相对其 365 日均值的倍数。低值对应矿工压力，高值可能对应收入过热。"],
    ["Funding Rate", "永续合约资金费率。持续正值代表多头拥挤，持续负值代表空头拥挤，需要与价格和 OI 联合判断。"],
    ["Open Interest", "未平仓合约总量。价格与 OI 同时上升通常意味着杠杆扩张，高位快速下降则可能是去杠杆。"],
    ["ETF Flow", "现货 ETF 净流入反映传统资金配置需求，建议同时观察每日流量、7 日累计和 BTC 价格。"],
    ["交易所流量", "净流入可能代表潜在卖压，净流出可能对应长期持有或冷存储需求，应结合交易所储备量。"],
    ["减半周期", "每 210,000 个区块奖励减半。倒计时以当前区块高度与平均十分钟出块估算，实际时间会随算力变化。"]
  ],
  en: [
    ["BTC Live Price", "Aggregated spot quote and 24-hour change for current direction. Use multi-exchange VWAP and depth for execution decisions."],
    ["Fear & Greed", "A 0-100 sentiment gauge: 0-24 extreme fear, 25-44 fear, 45-55 neutral, 56-74 greed, 75-100 extreme greed."],
    ["AHR999", "Combines spot, the 200-day accumulation cost and a power-law fitted price. Below 0.45 is commonly treated as deep value."],
    ["MVRV Ratio", "Market cap divided by realized cap. Below 1 implies broad unrealized loss; high values indicate richer profit-taking capacity."],
    ["STH Cost Basis / TMMP", "STH Cost Basis tracks the average acquisition price of coins moved within 155 days. TMMP divides investor capitalization by active supply. A downward STH cross below TMMP is used to study post-washout bottom-building windows."],
    ["STH-RP / TMMP Ratio", "Short-Term Holder Realized Price divided by True Market Mean Price. Below 1 signals a weaker short-term basis; readings near 0.75 have historically aligned with deep-fear cycle-bottom windows."],
    ["LTH Realized-Price Cross", "Compares the 0–10Y aggregate realized price with 6M–5Y, 6M–7Y and 6M–10Y holder cost bases. Sequential downward crosses are used to study deep supply turnover near macro bottoms."],
    ["LTH/STH Cost Basis Ratio", "Long-Term Holder Realized Price divided by Short-Term Holder Realized Price. Sub-0.48 readings have historically aligned with deep accumulation; a sustained recovery reflects narrowing holder-cost dispersion."],
    ["Std-Adjusted MVRV Bands", "Normalizes MVRV with a rolling 1,460-day mean and standard deviation. A break below minus one sigma is statistically extreme versus its own four-year history; reclaiming the mean signals easing valuation pressure."],
    ["Value Days Destroyed Multiple", "Daily value days destroyed divided by its 365-day average. Below 0.75 indicates old-coin dormancy and accumulation; above 2.9 flags unusually elevated long-term-holder spending and distribution."],
    ["Entity-Adjusted LTH-NUPL", "Measures long-term holders' net unrealized profit and loss. Below zero is Capitulation and 0–0.25 is Fear. The public dashboard uses UTXO-age LTH-NUPL as a live proxy; strict entity-cluster adjustment requires Glassnode's paid data."],
    ["LTH Realized Profit/Loss Ratio", "Realized profit divided by realized loss among long-held coins. Below 1.0 means loss realization dominates; a recovery above 1.0 helps track macro repair. The public dashboard uses an over-155-day UTXO-age proxy rather than proprietary entity clustering."],
    ["MVRV Z-Score", "Normalizes the gap between market and realized value to compare valuation deviation across cycles."],
    ["200 WMA", "A long-term cost anchor. Touches or brief breaks historically occurred during periods of elevated cycle stress."],
    ["Balanced Price", "Realized price minus transfer price, linking holder cost basis with coin-age consumption."],
    ["NUPL", "Net unrealized profit/loss mapping capitulation, hope, optimism and euphoria phases."],
    ["SOPR", "Spent output profit ratio. Above 1 means transferred coins realize profit on average; below 1 means loss."],
    ["Puell Multiple", "Daily miner revenue versus its 365-day average. Low values flag miner stress; high values can flag overheating."],
    ["Funding Rate", "Perpetual funding. Persistent positive values imply crowded longs; negative values imply crowded shorts."],
    ["Open Interest", "Outstanding derivatives contracts. Price and OI rising together signals leverage expansion; rapid OI drops indicate deleveraging."],
    ["ETF Flow", "Spot ETF net flow reflects traditional allocation demand. Read daily flow, seven-day cumulative flow and BTC price together."],
    ["Exchange Flow", "Net inflow can signal potential sell pressure; net outflow can reflect holding or cold-storage demand."],
    ["Halving Cycle", "Block rewards halve every 210,000 blocks. The clock uses current height and a ten-minute average; actual timing varies with hashrate."]
  ]
};

let currentLanguage = localStorage.getItem("welinkbtc-language") || "zh";
let currentTheme = localStorage.getItem("welinkbtc-theme") || "dark";
let costBasisSeries = [];
let costBasisSnapshot = null;
let costBasisSources = null;
let costBasisWindows = [];
let costBasisRange = "all";
let costBasisChartState = null;
let sthRatioSnapshot = null;
let sthRatioRange = "all";
let sthRatioChartState = null;
let lthRealizedSeries = [];
let lthRealizedSnapshot = null;
let lthRealizedSources = null;
let lthRealizedRange = "all";
let lthRealizedChartState = null;
let realizedProfitLossSeries = [];
let realizedProfitLossSnapshot = null;
let realizedProfitLossSources = null;
let realizedProfitLossRange = "all";
let realizedProfitLossChartState = null;
let medianRealizedSeries = [];
let medianRealizedSnapshot = null;
let medianRealizedSources = null;
let medianRealizedRange = "all";
let medianRealizedChartState = null;
let lthSthSeries = [];
let lthSthSnapshot = null;
let lthSthSources = null;
let lthSthRange = "all";
let lthSthChartState = null;
let lthLossSeries = [];
let lthLossSnapshot = null;
let lthLossSources = null;
let lthLossRange = "all";
let lthLossChartState = null;
let supplyProfitLossSeries = [];
let supplyProfitLossSnapshot = null;
let supplyProfitLossSources = null;
let supplyProfitLossRange = "all";
let supplyProfitLossChartState = null;
let medianMvrvSeries = [];
let medianMvrvSnapshot = null;
let medianMvrvSources = null;
let medianMvrvRange = "all";
let medianMvrvChartState = null;
let mvrvBandsSeries = [];
let mvrvBandsSnapshot = null;
let mvrvBandsSources = null;
let mvrvBandsBreaches = [];
let mvrvBandsRange = "all";
let mvrvBandsChartState = null;
let mvrvPriceBandsSeries = [];
let mvrvPriceBandsSnapshot = null;
let mvrvPriceBandsRange = "all";
let mvrvPriceBandsChartState = null;
let stockToFlowSeries = [];
let stockToFlowSnapshot = null;
let stockToFlowSources = null;
let stockToFlowHalvings = [];
let stockToFlowRange = "all";
let stockToFlowChartState = null;
let cycleTimingSeries = [];
let cycleTimingSnapshot = null;
let cycleTimingModes = {};
let cycleTimingSources = null;
let cycleTimingFutureCycle = null;
let cycleTimingMode = "halving-top";
let cycleTimingRange = "all";
let cycleTimingChartState = null;
let rhodlSeries = [];
let rhodlSnapshot = null;
let rhodlSources = null;
let rhodlCyclePeaks = [];
let rhodlRange = "all";
let rhodlChartState = null;
let lthRplSeries = [];
let lthRplSnapshot = null;
let lthRplSources = null;
let lthRplUnderwaterZones = [];
let lthRplRange = "all";
let lthRplChartState = null;
let slrvSeries = [];
let slrvSnapshot = null;
let slrvSources = null;
let slrvLowZones = [];
let slrvCalibration = null;
let slrvRange = "all";
let slrvChartState = null;
let realizedCapHodlSeries = [];
let realizedCapHodlSnapshot = null;
let realizedCapHodlSources = null;
let realizedCapHodlPeaks = [];
let realizedCapHodlBands = [];
let realizedCapHodlExtension = null;
let realizedCapHodlRange = "all";
let realizedCapHodlChartState = null;
let lthSpentSeries = [];
let lthSpentSnapshot = null;
let lthSpentSources = null;
let lthSpentResearchWindows = [];
let lthSpentUnderwaterZones = [];
let lthSpentExactStart = null;
let lthSpentRange = "all";
let lthSpentChartState = null;
let percentProfitSeries = [];
let percentProfitSnapshot = null;
let percentProfitSources = null;
let percentProfitHistoricalLows = [];
let percentProfitResearchWindows = [];
let percentProfitRange = "all";
let percentProfitChartState = null;
let lthExchangeLossSeries = [];
let lthExchangeLossSnapshot = null;
let lthExchangeLossSources = null;
let lthExchangeLossHistoricalPeaks = [];
let lthExchangeLossResearchWindows = [];
let lthExchangeLossRange = "all";
let lthExchangeLossChartState = null;
let twoWeekRsiSeries = [];
let twoWeekRsiSnapshot = null;
let twoWeekRsiSources = null;
let twoWeekRsiHistoricalLows = [];
let twoWeekRsiChannelAnchors = null;
let twoWeekRsiRange = "all";
let twoWeekRsiChartState = null;
let under3mHodlSeries = [];
let under3mHodlSnapshot = null;
let under3mHodlSources = null;
let under3mHodlLows = [];
let under3mHodlRange = "all";
let under3mHodlChartState = null;
let sth200dmaSeries = [];
let sth200dmaSnapshot = null;
let sth200dmaSources = null;
let sth200dmaMacroCrosses = [];
let sth200dmaHistoricalCycles = [];
let sth200dmaRange = "all";
let sth200dmaChartState = null;
let vddMedianSeries = [];
let vddMedianSnapshot = null;
let vddMedianSources = null;
let vddMedianBottomZones = [];
let vddMedianTopZones = [];
let vddMedianReferenceCycles = [];
let vddMedianRange = "all";
let vddMedianChartState = null;
let ssrSeries = [];
let ssrSnapshot = null;
let ssrSources = null;
let ssrMacroBreakouts = [];
let ssrReferenceBreakouts = [];
let ssrRange = "all";
let ssrChartState = null;
let sthBandsSeries = [];
let sthBandsProjection = [];
let sthBandsSnapshot = null;
let sthBandsSources = null;
let sthBandsMacroBreakouts = [];
let sthBandsReferenceBreakouts = [];
let sthBandsRange = "all";
let sthBandsChartState = null;
let percentProfitEx10ySeries = [];
let percentProfitEx10yProjection = [];
let percentProfitEx10ySnapshot = null;
let percentProfitEx10ySources = null;
let percentProfitEx10yReferenceCycles = [];
let percentProfitEx10yWashoutZones = [];
let percentProfitEx10yRange = "all";
let percentProfitEx10yChartState = null;
let sthMvrvSeries = [];
let sthMvrvProjection = [];
let sthMvrvSnapshot = null;
let sthMvrvSources = null;
let sthMvrvReferenceCycles = [];
let sthMvrvCurrentStructure = null;
let sthMvrvRange = "all";
let sthMvrvChartState = null;
let vddSeries = [];
let vddSnapshot = null;
let vddSources = null;
let vddLowZones = [];
let vddRange = "all";
let vddChartState = null;
let lthNuplSeries = [];
let lthNuplSnapshot = null;
let lthNuplSources = null;
let lthNuplStressZones = [];
let lthNuplReferencePattern = null;
let lthNuplRange = "all";
let lthNuplChartState = null;
let publicDataWarnings = [];
let resizeTimer;
const metricSnapshot = { price: null, wma: null, fng: null, mvrv: null, funding: null, halvingDays: null };
const API_BASE = window.WELINKBTC_DATA_API_BASE || "";
const OVERVIEW_CACHE_KEY = "welinkbtc-onchain-overview-v1";
const EXTENDED_CACHE_KEY = "welinkbtc-market-metrics-v1";
const COST_BASIS_CACHE_KEY = "welinkbtc-cost-basis-v1";
const LTH_REALIZED_CACHE_KEY = "welinkbtc-lth-realized-price-v1";
const REALIZED_PROFIT_LOSS_CACHE_KEY = "welinkbtc-realized-profit-loss-v1";
const MEDIAN_REALIZED_CACHE_KEY = "welinkbtc-median-realized-price-v1";
const LTH_STH_CACHE_KEY = "welinkbtc-lth-sth-ratio-v1";
const LTH_LOSS_CACHE_KEY = "welinkbtc-lth-market-cap-loss-v6";
const SUPPLY_PROFIT_LOSS_CACHE_KEY = "welinkbtc-supply-profit-loss-ratio-v1";
const MVRV_BANDS_CACHE_KEY = "welinkbtc-mvrv-bands-v1";
const STOCK_TO_FLOW_CACHE_KEY = "welinkbtc-stock-to-flow-v1";
const CYCLE_TIMING_CACHE_KEY = "welinkbtc-cycle-timing-v2";
const RHODL_CACHE_KEY = "welinkbtc-rhodl-ratio-v1";
const LTH_RPL_CACHE_KEY = "welinkbtc-lth-realized-profit-loss-v1";
const SLRV_CACHE_KEY = "welinkbtc-slrv-ratio-v1";
const REALIZED_CAP_HODL_CACHE_KEY = "welinkbtc-realized-cap-hodl-waves-v1";
const LTH_SPENT_CACHE_KEY = "welinkbtc-lth-spent-price-v1";
const PERCENT_PROFIT_CACHE_KEY = "welinkbtc-percent-supply-profit-v1";
const LTH_EXCHANGE_LOSS_CACHE_KEY = "welinkbtc-lth-exchange-loss-v1";
const TWO_WEEK_RSI_CACHE_KEY = "welinkbtc-two-week-rsi-v1";
const UNDER_3M_HODL_CACHE_KEY = "welinkbtc-under-3m-realized-cap-hodl-v1";
const STH_200DMA_CACHE_KEY = "welinkbtc-sth-200dma-v1";
const VDD_MEDIAN_CACHE_KEY = "welinkbtc-vdd-median-cycle-v1";
const SSR_CACHE_KEY = "welinkbtc-stablecoin-supply-ratio-v1";
const STH_BANDS_CACHE_KEY = "welinkbtc-sth-cost-basis-bands-v1";
const PERCENT_PROFIT_EX_10Y_CACHE_KEY = "welinkbtc-percent-supply-profit-ex-10y-v1";
const STH_MVRV_CACHE_KEY = "welinkbtc-sth-mvrv-v1";
const VDD_CACHE_KEY = "welinkbtc-vdd-multiple-v1";
const LTH_NUPL_CACHE_KEY = "welinkbtc-lth-nupl-v1";
const SURF_METRIC_CACHE_KEY = "welinkbtc-surf-metric-analysis-v1";
const SURF_METRIC_CACHE_MS = 30 * 60 * 1000;

const DASHBOARD_DATA_CACHE_KEYS = [
  OVERVIEW_CACHE_KEY,
  EXTENDED_CACHE_KEY,
  COST_BASIS_CACHE_KEY,
  LTH_REALIZED_CACHE_KEY,
  REALIZED_PROFIT_LOSS_CACHE_KEY,
  MEDIAN_REALIZED_CACHE_KEY,
  LTH_STH_CACHE_KEY,
  LTH_LOSS_CACHE_KEY,
  SUPPLY_PROFIT_LOSS_CACHE_KEY,
  MVRV_BANDS_CACHE_KEY,
  STOCK_TO_FLOW_CACHE_KEY,
  CYCLE_TIMING_CACHE_KEY,
  RHODL_CACHE_KEY,
  LTH_RPL_CACHE_KEY,
  SLRV_CACHE_KEY,
  REALIZED_CAP_HODL_CACHE_KEY,
  LTH_SPENT_CACHE_KEY,
  PERCENT_PROFIT_CACHE_KEY,
  LTH_EXCHANGE_LOSS_CACHE_KEY,
  TWO_WEEK_RSI_CACHE_KEY,
  UNDER_3M_HODL_CACHE_KEY,
  STH_200DMA_CACHE_KEY,
  VDD_MEDIAN_CACHE_KEY,
  SSR_CACHE_KEY,
  STH_BANDS_CACHE_KEY,
  PERCENT_PROFIT_EX_10Y_CACHE_KEY,
  STH_MVRV_CACHE_KEY,
  VDD_CACHE_KEY,
  LTH_NUPL_CACHE_KEY,
  SURF_METRIC_CACHE_KEY
];

const isStorageQuotaError = (error) => error?.name === "QuotaExceededError"
  || error?.name === "NS_ERROR_DOM_QUOTA_REACHED"
  || error?.code === 22
  || error?.code === 1014;

const compactDashboardCacheValue = (value, maxArrayItems = 720) => {
  if (Array.isArray(value)) {
    const source = value.length > maxArrayItems
      ? Array.from({ length: maxArrayItems }, (_, index) => {
        const sourceIndex = Math.round((index * (value.length - 1)) / (maxArrayItems - 1));
        return value[sourceIndex];
      })
      : value;
    return source.map((item) => compactDashboardCacheValue(item, maxArrayItems));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        compactDashboardCacheValue(entryValue, maxArrayItems)
      ])
    );
  }
  return value;
};

const getDashboardCacheAge = (key) => {
  try {
    const cached = JSON.parse(localStorage.getItem(key) || "null");
    return Number(cached?.savedAt || cached?.timestamp || 0);
  } catch {
    return 0;
  }
};

const writeResilientCacheItem = (key, value, label) => {
  const serialize = (maxArrayItems) => JSON.stringify(
    compactDashboardCacheValue(value, maxArrayItems)
  );
  const tryWrite = (serialized) => {
    try {
      localStorage.setItem(key, serialized);
      return true;
    } catch (error) {
      if (!isStorageQuotaError(error)) throw error;
      return false;
    }
  };

  try {
    let serialized = serialize(720);
    if (tryWrite(serialized)) return true;

    serialized = serialize(360);
    if (tryWrite(serialized)) return true;

    const evictionCandidates = DASHBOARD_DATA_CACHE_KEYS
      .filter((cacheKey) => cacheKey !== key && localStorage.getItem(cacheKey) !== null)
      .sort((left, right) => getDashboardCacheAge(left) - getDashboardCacheAge(right));

    for (const cacheKey of evictionCandidates) {
      localStorage.removeItem(cacheKey);
      if (tryWrite(serialized)) return true;
    }

    return tryWrite(serialize(180));
  } catch (error) {
    console.warn(`${label} cache write failed`, error);
    return false;
  }
};

const writeDashboardCache = (key, payload, label) => {
  writeResilientCacheItem(key, { savedAt: Date.now(), payload }, label);
};

const clearDashboardCache = (key, label) => {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.warn(`${label} cache removal failed`, error);
  }
};

const hideChartLoading = (selector) => {
  const loading = document.querySelector(selector);
  if (!loading) return;
  loading.classList.remove("is-error");
  loading.removeAttribute("role");
  loading.removeAttribute("tabindex");
  loading.hidden = true;
};

const preserveRenderedChart = (series, snapshot, loadingSelectors, warning) => {
  if (!Array.isArray(series) || series.length < 2 || !snapshot) return false;
  loadingSelectors.forEach(hideChartLoading);
  publicDataWarnings.push(warning);
  return true;
};

const getCopy = (key) => translations[currentLanguage][key] || translations.zh[key] || key;

const writeRuntimeText = (element, value) => {
  if (!element) return;
  element.textContent = value;
  element.dataset.runtimeText = "true";
};

const setText = (selector, value) => {
  const element = document.querySelector(selector);
  writeRuntimeText(element, value);
};

const formatUsd = (value) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

const formatNumber = (value, options = {}) =>
  new Intl.NumberFormat("en-US", options).format(value);

const compactNumber = (value) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value);

const compactUsd = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  const absolute = Math.abs(numeric);
  const formatted = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(absolute);
  return `${numeric < 0 ? "-" : ""}$${formatted}`;
};

const formatDateTime = (date = new Date()) =>
  new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai"
  }).format(date);

const fetchJson = async (url) => {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
};

const delay = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

const fetchJsonWithRetry = async (url, { attempts = 3, timeout = 12000 } = {}) => {
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await delay(450 * (attempt + 1));
    } finally {
      window.clearTimeout(timer);
    }
  }

  throw lastError;
};

const setupCanvas = (canvas) => {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const displayHeight = Number(canvas.getAttribute("height")) || 270;
  canvas.width = Math.max(rect.width, 1) * dpr;
  canvas.height = displayHeight * dpr;
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { context, width: Math.max(rect.width, 1), height: displayHeight };
};

const chartColors = () => {
  const styles = getComputedStyle(document.body);
  return {
    ink: styles.getPropertyValue("--ink").trim(),
    muted: styles.getPropertyValue("--muted").trim(),
    line: styles.getPropertyValue("--line").trim(),
    green: styles.getPropertyValue("--green").trim(),
    cyan: styles.getPropertyValue("--cyan").trim(),
    orange: styles.getPropertyValue("--orange").trim(),
    red: styles.getPropertyValue("--red").trim(),
    purple: styles.getPropertyValue("--purple").trim()
  };
};

const chartBrandWatermark = new Image();
chartBrandWatermark.decoding = "async";
chartBrandWatermark.loading = "eager";
chartBrandWatermark.fetchPriority = "high";
chartBrandWatermark.addEventListener("load", () => window.requestAnimationFrame(drawAllCharts));
chartBrandWatermark.src = "/welinkbtc-orbit-brand.webp";
chartBrandWatermark.decode().catch(() => {});

const drawBrandWatermark = (context, centerX, centerY, label = "welinkBTC") => {
  const fontSize = Number.parseFloat(context.font.match(/([\d.]+)px/)?.[1] || "42");
  const iconSize = Math.max(38, Math.min(fontSize * 1.22, 118));
  const gap = Math.max(10, fontSize * 0.2);
  const textWidth = context.measureText(label).width;
  const startX = centerX - (iconSize + gap + textWidth) / 2;
  const iconX = startX + iconSize / 2;
  const isDark = document.body.dataset.theme === "dark";
  const haloRadius = iconSize * 0.72;

  context.save();
  context.globalAlpha = isDark ? 0.2 : 0.16;
  const halo = context.createRadialGradient(iconX, centerY, iconSize * 0.2, iconX, centerY, haloRadius);
  halo.addColorStop(0, "rgba(255, 203, 92, 0.5)");
  halo.addColorStop(0.46, "rgba(94, 220, 255, 0.18)");
  halo.addColorStop(1, "rgba(255, 179, 56, 0)");
  context.fillStyle = halo;
  context.beginPath();
  context.arc(iconX, centerY, haloRadius, 0, Math.PI * 2);
  context.fill();
  context.restore();

  context.save();
  context.globalAlpha = isDark ? 0.34 : 0.28;
  context.shadowColor = isDark ? "rgba(255, 189, 70, 0.68)" : "rgba(121, 72, 0, 0.32)";
  context.shadowBlur = Math.max(8, iconSize * 0.2);
  context.beginPath();
  context.arc(iconX, centerY, iconSize / 2, 0, Math.PI * 2);
  context.clip();
  if (chartBrandWatermark.complete && chartBrandWatermark.naturalWidth > 0) {
    context.drawImage(chartBrandWatermark, startX, centerY - iconSize / 2, iconSize, iconSize);
  } else {
    context.fillStyle = "#f2a93b";
    context.fillRect(startX, centerY - iconSize / 2, iconSize, iconSize);
    context.fillStyle = "#11140f";
    context.font = `800 ${iconSize * 0.52}px Inter`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("B", iconX, centerY);
  }
  context.restore();

  context.save();
  context.globalAlpha = isDark ? 0.26 : 0.22;
  context.strokeStyle = isDark ? "#ffc966" : "#9a5b00";
  context.lineWidth = Math.max(1.2, fontSize * 0.026);
  context.beginPath();
  context.arc(iconX, centerY, iconSize * 0.51, 0, Math.PI * 2);
  context.stroke();
  context.restore();

  context.save();
  context.globalAlpha = isDark ? 0.09 : 0.075;
  context.shadowColor = isDark ? "rgba(136, 255, 190, 0.42)" : "rgba(0, 84, 49, 0.2)";
  context.shadowBlur = Math.max(3, fontSize * 0.1);
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillText(label, startX + iconSize + gap, centerY);
  context.restore();
};

const drawEmptyChart = (canvasId, label = getCopy("dataPending")) => {
  const canvas = document.querySelector(canvasId);
  if (!canvas) return;
  const { context, width, height } = setupCanvas(canvas);
  const colors = chartColors();
  context.clearRect(0, 0, width, height);
  context.strokeStyle = colors.line;
  context.setLineDash([5, 7]);
  context.strokeRect(18, 18, width - 36, height - 36);
  context.setLineDash([]);
  context.fillStyle = colors.muted;
  context.font = "700 11px JetBrains Mono";
  context.textAlign = "center";
  context.fillText(label.toUpperCase(), width / 2, height / 2);
};

const getCostBasisVisibleSeries = () => {
  if (!costBasisSeries.length || costBasisRange === "all") return costBasisSeries;
  const days = Number(costBasisRange);
  const end = costBasisSeries.at(-1).date.getTime();
  const start = end - Math.max(days - 1, 1) * 86_400_000;
  return costBasisSeries.filter((point) => point.date.getTime() >= start);
};

const getSthRatioVisibleSeries = () => {
  const ratioSeries = costBasisSeries
    .filter((point) => Number.isFinite(point.sth) && Number.isFinite(point.tmmp) && point.tmmp > 0)
    .map((point) => ({ ...point, ratio: point.sth / point.tmmp }));
  if (!ratioSeries.length || sthRatioRange === "all") return ratioSeries;
  const days = Number(sthRatioRange);
  const end = ratioSeries.at(-1).date.getTime();
  const start = end - Math.max(days - 1, 1) * 86_400_000;
  return ratioSeries.filter((point) => point.date.getTime() >= start);
};

const formatAxisUsd = (value) => {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)}K`;
  if (value >= 1) return `$${value.toFixed(value >= 100 ? 0 : 1)}`;
  return `$${value.toFixed(2)}`;
};

const drawCostBasisChart = () => {
  const canvas = document.querySelector("#cost-basis-chart");
  const stage = canvas?.closest(".cost-basis-stage");
  const series = getCostBasisVisibleSeries();
  if (!canvas || !stage || series.length < 2) {
    drawEmptyChart("#cost-basis-chart");
    costBasisChartState = null;
    return;
  }

  // CSS owns the displayed height so a fullscreen redraw cannot leak its
  // viewport-sized height back into the inline chart after fullscreen exits.
  canvas.style.removeProperty("height");
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height || stage.clientHeight || 470, 320);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = chartColors();
  const compact = width < 700;
  const padding = { top: 30, right: compact ? 16 : 24, bottom: 42, left: compact ? 58 : 74 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const values = series.flatMap((point) => [point.price, point.sth, point.tmmp]).filter((value) => Number.isFinite(value) && value > 0);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const logMin = Math.log10(rawMin) - 0.08;
  const logMax = Math.log10(rawMax) + 0.08;
  const startTime = series[0].date.getTime();
  const endTime = series.at(-1).date.getTime();
  const xFor = (date) => padding.left + ((date.getTime() - startTime) / Math.max(endTime - startTime, 1)) * chartWidth;
  const yFor = (value) => padding.top + (1 - (Math.log10(Math.max(value, 0.0001)) - logMin) / Math.max(logMax - logMin, 0.0001)) * chartHeight;

  context.clearRect(0, 0, width, height);
  context.font = "700 10px JetBrains Mono";
  context.lineWidth = 1;
  context.textBaseline = "middle";

  const yTicks = compact ? 5 : 6;
  for (let index = 0; index < yTicks; index += 1) {
    const ratio = index / Math.max(yTicks - 1, 1);
    const logValue = logMax - ratio * (logMax - logMin);
    const value = 10 ** logValue;
    const y = padding.top + ratio * chartHeight;
    context.strokeStyle = colors.line;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillStyle = colors.muted;
    context.textAlign = "right";
    context.fillText(formatAxisUsd(value), padding.left - 9, y);
  }

  const xTicks = compact ? 4 : 7;
  const dateFormatter = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", {
    year: costBasisRange === "7" || costBasisRange === "30" || costBasisRange === "90" ? undefined : "numeric",
    month: "short",
    day: costBasisRange === "7" || costBasisRange === "30" || costBasisRange === "90" ? "2-digit" : undefined
  });
  context.textBaseline = "alphabetic";
  for (let index = 0; index < xTicks; index += 1) {
    const ratio = index / Math.max(xTicks - 1, 1);
    const date = new Date(startTime + ratio * (endTime - startTime));
    const x = padding.left + ratio * chartWidth;
    context.fillStyle = colors.muted;
    context.textAlign = index === 0 ? "left" : index === xTicks - 1 ? "right" : "center";
    context.fillText(dateFormatter.format(date), x, height - 13);
  }

  context.save();
  context.fillStyle = colors.ink;
  context.globalAlpha = document.body.dataset.theme === "dark" ? 0.055 : 0.045;
  context.font = `800 ${Math.max(30, Math.min(width * 0.085, height * 0.16, 92))}px Inter`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  drawBrandWatermark(context, padding.left + chartWidth / 2, padding.top + chartHeight / 2);
  context.restore();

  const drawEventMarker = (dateValue, label, color, dash = [4, 6]) => {
    const date = new Date(`${dateValue}T00:00:00Z`);
    if (date < series[0].date || date > series.at(-1).date) return;
    const x = xFor(date);
    context.save();
    context.strokeStyle = color;
    context.globalAlpha = 0.62;
    context.setLineDash(dash);
    context.beginPath();
    context.moveTo(x, padding.top);
    context.lineTo(x, height - padding.bottom);
    context.stroke();
    context.setLineDash([]);
    context.translate(x + 5, padding.top + 8);
    context.rotate(Math.PI / 2);
    context.fillStyle = color;
    context.globalAlpha = 0.9;
    context.textAlign = "left";
    context.font = "800 9px JetBrains Mono";
    context.fillText(label, 0, 0);
    context.restore();
  };

  costBasisWindows.forEach((event) => drawEventMarker(event.bottomDate, `${event.cycle} · ${event.days}D`, colors.muted));
  if (costBasisSnapshot?.lastCrossDate) {
    drawEventMarker(costBasisSnapshot.lastCrossDate, currentLanguage === "zh" ? "STH / TMMP 死叉" : "STH / TMMP DEATH CROSS", colors.red, [7, 5]);
  }

  const drawSeries = (key, color, lineWidth, opacity = 1) => {
    context.save();
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.globalAlpha = opacity;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.beginPath();
    series.forEach((point, index) => {
      const x = xFor(point.date);
      const y = yFor(point[key]);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
    context.restore();
  };

  drawSeries("price", colors.muted, 1.45, 0.8);
  drawSeries("sth", colors.red, 2.25, 0.96);
  drawSeries("tmmp", colors.purple, 2.35, 0.98);

  const latest = series.at(-1);
  [["price", colors.muted], ["sth", colors.red], ["tmmp", colors.purple]].forEach(([key, color]) => {
    context.fillStyle = color;
    context.beginPath();
    context.arc(xFor(latest.date), yFor(latest[key]), key === "price" ? 3 : 4, 0, Math.PI * 2);
    context.fill();
  });

  costBasisChartState = { series, padding, chartWidth, chartHeight, width, height };
};

const showCostBasisTooltip = (event) => {
  const canvas = document.querySelector("#cost-basis-chart");
  const tooltip = document.querySelector("#cost-basis-tooltip");
  if (!canvas || !tooltip || !costBasisChartState) return;
  const { series, padding, chartWidth, width, height } = costBasisChartState;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * width;
  const ratio = Math.max(0, Math.min(1, (x - padding.left) / Math.max(chartWidth, 1)));
  const index = Math.round(ratio * (series.length - 1));
  const point = series[index];
  if (!point) return;
  const date = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", {
    year: "numeric", month: "2-digit", day: "2-digit"
  }).format(point.date);
  tooltip.innerHTML = `<strong>${date}</strong><span>BTC <i>${formatUsd(point.price)}</i></span><span>STH <i>${formatUsd(point.sth)}</i></span><span>TMMP <i>${formatUsd(point.tmmp)}</i></span><span>STH − TMMP <i>${formatUsd(point.sth - point.tmmp)}</i></span>`;
  tooltip.hidden = false;
  const stage = canvas.closest(".cost-basis-stage");
  const stageRect = stage.getBoundingClientRect();
  const localX = event.clientX - stageRect.left;
  const localY = event.clientY - stageRect.top;
  const tooltipWidth = 210;
  tooltip.style.left = `${Math.max(10, Math.min(stageRect.width - tooltipWidth - 10, localX + 14))}px`;
  tooltip.style.top = `${Math.max(10, Math.min(height - 130, localY - 30))}px`;
};

const hideCostBasisTooltip = () => {
  const tooltip = document.querySelector("#cost-basis-tooltip");
  if (tooltip) tooltip.hidden = true;
};

const drawSthRatioChart = () => {
  const canvas = document.querySelector("#sth-ratio-chart");
  const stage = canvas?.closest(".ratio-stage");
  const series = getSthRatioVisibleSeries();
  if (!canvas || !stage || series.length < 2) {
    drawEmptyChart("#sth-ratio-chart");
    sthRatioChartState = null;
    return;
  }

  canvas.style.removeProperty("height");
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height || stage.clientHeight || 620, 420);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = chartColors();
  const compact = width < 700;
  const padding = { top: 26, right: compact ? 16 : 24, bottom: 42, left: compact ? 58 : 74 };
  const chartWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const panelGap = compact ? 36 : 46;
  const upperHeight = Math.max(150, (plotHeight - panelGap) * 0.56);
  const ratioTop = padding.top + upperHeight + panelGap;
  const ratioHeight = Math.max(120, height - padding.bottom - ratioTop);
  const priceValues = series.flatMap((point) => [point.price, point.sth, point.tmmp]).filter((value) => Number.isFinite(value) && value > 0);
  const logMin = Math.log10(Math.min(...priceValues)) - 0.08;
  const logMax = Math.log10(Math.max(...priceValues)) + 0.08;
  const threshold = Number(sthRatioSnapshot?.threshold) || 0.75;
  const projectedRatio = Number(sthRatioSnapshot?.projected7d);
  const ratioValues = series.map((point) => point.ratio).filter(Number.isFinite);
  const ratioMin = sthRatioRange === "all"
    ? Math.min(0.5, Math.min(...ratioValues) - 0.06)
    : Math.min(0.7, Math.min(...ratioValues, threshold) - 0.05);
  const ratioMax = Math.max(
    sthRatioRange === "all" ? 1.6 : 1.05,
    Math.max(...ratioValues) + 0.06,
    Number.isFinite(projectedRatio) ? projectedRatio + 0.06 : 0
  );
  const startTime = series[0].date.getTime();
  const lastTime = series.at(-1).date.getTime();
  const projectionTime = lastTime + 7 * 86_400_000;
  const xFor = (date) => padding.left + ((date.getTime() - startTime) / Math.max(projectionTime - startTime, 1)) * chartWidth;
  const priceY = (value) => padding.top + (1 - (Math.log10(Math.max(value, 0.0001)) - logMin) / Math.max(logMax - logMin, 0.0001)) * upperHeight;
  const ratioY = (value) => ratioTop + (1 - (value - ratioMin) / Math.max(ratioMax - ratioMin, 0.0001)) * ratioHeight;

  context.clearRect(0, 0, width, height);
  context.font = "700 10px JetBrains Mono";
  context.lineWidth = 1;
  context.textBaseline = "middle";

  const priceTicks = compact ? 3 : 4;
  for (let index = 0; index < priceTicks; index += 1) {
    const ratio = index / Math.max(priceTicks - 1, 1);
    const value = 10 ** (logMax - ratio * (logMax - logMin));
    const y = padding.top + ratio * upperHeight;
    context.strokeStyle = colors.line;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillStyle = colors.muted;
    context.textAlign = "right";
    context.fillText(formatAxisUsd(value), padding.left - 9, y);
  }

  const ratioTicks = 5;
  for (let index = 0; index < ratioTicks; index += 1) {
    const tickRatio = index / Math.max(ratioTicks - 1, 1);
    const value = ratioMax - tickRatio * (ratioMax - ratioMin);
    const y = ratioTop + tickRatio * ratioHeight;
    context.strokeStyle = colors.line;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillStyle = colors.muted;
    context.textAlign = "right";
    context.fillText(value.toFixed(2), padding.left - 9, y);
  }

  context.save();
  context.fillStyle = colors.ink;
  context.globalAlpha = document.body.dataset.theme === "dark" ? 0.05 : 0.04;
  context.font = `800 ${Math.max(30, Math.min(width * 0.08, height * 0.12, 84))}px Inter`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  drawBrandWatermark(context, padding.left + chartWidth / 2, padding.top + plotHeight / 2);
  context.restore();

  const drawPriceSeries = (key, color, lineWidth, opacity = 1) => {
    context.save();
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.globalAlpha = opacity;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.beginPath();
    series.forEach((point, index) => {
      const x = xFor(point.date);
      const y = priceY(point[key]);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
    context.restore();
  };

  drawPriceSeries("price", colors.muted, 1.3, 0.72);
  drawPriceSeries("sth", colors.red, 1.85, 0.9);
  drawPriceSeries("tmmp", colors.purple, 1.95, 0.94);

  context.save();
  context.fillStyle = colors.red;
  context.globalAlpha = 0.08;
  for (let index = 1; index < series.length; index += 1) {
    const previous = series[index - 1];
    const current = series[index];
    if (previous.ratio >= threshold && current.ratio >= threshold) continue;
    context.beginPath();
    context.moveTo(xFor(previous.date), ratioY(previous.ratio));
    context.lineTo(xFor(current.date), ratioY(current.ratio));
    context.lineTo(xFor(current.date), ratioTop + ratioHeight);
    context.lineTo(xFor(previous.date), ratioTop + ratioHeight);
    context.closePath();
    context.fill();
  }
  context.restore();

  context.save();
  context.strokeStyle = colors.red;
  context.globalAlpha = 0.9;
  context.setLineDash([7, 5]);
  context.beginPath();
  context.moveTo(padding.left, ratioY(threshold));
  context.lineTo(width - padding.right, ratioY(threshold));
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = colors.red;
  context.textAlign = "left";
  context.textBaseline = "bottom";
  context.fillText("0.75", padding.left + 7, ratioY(threshold) - 5);
  context.restore();

  context.save();
  context.lineWidth = 2.1;
  context.lineJoin = "round";
  context.lineCap = "round";
  for (let index = 1; index < series.length; index += 1) {
    const previous = series[index - 1];
    const current = series[index];
    context.strokeStyle = previous.ratio < threshold || current.ratio < threshold ? colors.red : colors.green;
    context.beginPath();
    context.moveTo(xFor(previous.date), ratioY(previous.ratio));
    context.lineTo(xFor(current.date), ratioY(current.ratio));
    context.stroke();
  }
  context.restore();

  const latest = series.at(-1);
  if (Number.isFinite(projectedRatio)) {
    context.save();
    context.strokeStyle = colors.orange;
    context.lineWidth = 2;
    context.setLineDash([6, 5]);
    context.beginPath();
    context.moveTo(xFor(latest.date), ratioY(latest.ratio));
    context.lineTo(xFor(new Date(projectionTime)), ratioY(projectedRatio));
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = colors.orange;
    context.beginPath();
    context.arc(xFor(new Date(projectionTime)), ratioY(projectedRatio), 3.5, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  [["price", colors.muted], ["sth", colors.red], ["tmmp", colors.purple]].forEach(([key, color]) => {
    context.fillStyle = color;
    context.beginPath();
    context.arc(xFor(latest.date), priceY(latest[key]), key === "price" ? 2.5 : 3.5, 0, Math.PI * 2);
    context.fill();
  });
  context.fillStyle = latest.ratio < threshold ? colors.red : colors.green;
  context.beginPath();
  context.arc(xFor(latest.date), ratioY(latest.ratio), 4, 0, Math.PI * 2);
  context.fill();

  const xTicks = compact ? 4 : 7;
  const dateFormatter = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", {
    year: sthRatioRange === "7" || sthRatioRange === "30" || sthRatioRange === "90" ? undefined : "numeric",
    month: "short",
    day: sthRatioRange === "7" || sthRatioRange === "30" || sthRatioRange === "90" ? "2-digit" : undefined
  });
  context.fillStyle = colors.muted;
  context.textBaseline = "alphabetic";
  for (let index = 0; index < xTicks; index += 1) {
    const tickRatio = index / Math.max(xTicks - 1, 1);
    const date = new Date(startTime + tickRatio * (projectionTime - startTime));
    const x = padding.left + tickRatio * chartWidth;
    context.textAlign = index === 0 ? "left" : index === xTicks - 1 ? "right" : "center";
    context.fillText(dateFormatter.format(date), x, height - 13);
  }

  sthRatioChartState = {
    series,
    padding,
    chartWidth,
    width,
    height,
    startTime,
    lastTime,
    dataEndX: xFor(latest.date)
  };
};

const showSthRatioTooltip = (event) => {
  const canvas = document.querySelector("#sth-ratio-chart");
  const tooltip = document.querySelector("#sth-ratio-tooltip");
  if (!canvas || !tooltip || !sthRatioChartState) return;
  const { series, padding, dataEndX, width, height } = sthRatioChartState;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * width;
  const ratio = Math.max(0, Math.min(1, (x - padding.left) / Math.max(dataEndX - padding.left, 1)));
  const point = series[Math.round(ratio * (series.length - 1))];
  if (!point) return;
  const date = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", {
    year: "numeric", month: "2-digit", day: "2-digit"
  }).format(point.date);
  tooltip.innerHTML = `<strong>${date}</strong><span>Ratio <i>${point.ratio.toFixed(4)}</i></span><span>BTC <i>${formatUsd(point.price)}</i></span><span>STH-RP <i>${formatUsd(point.sth)}</i></span><span>TMMP <i>${formatUsd(point.tmmp)}</i></span>`;
  tooltip.hidden = false;
  const stage = canvas.closest(".ratio-stage");
  const stageRect = stage.getBoundingClientRect();
  const localX = event.clientX - stageRect.left;
  const localY = event.clientY - stageRect.top;
  const tooltipWidth = 210;
  tooltip.style.left = `${Math.max(10, Math.min(stageRect.width - tooltipWidth - 10, localX + 14))}px`;
  tooltip.style.top = `${Math.max(10, Math.min(height - 140, localY - 30))}px`;
};

const hideSthRatioTooltip = () => {
  const tooltip = document.querySelector("#sth-ratio-tooltip");
  if (tooltip) tooltip.hidden = true;
};

const getLthRealizedVisibleSeries = () => {
  if (!lthRealizedSeries.length || lthRealizedRange === "all") return lthRealizedSeries;
  const days = Number(lthRealizedRange);
  const end = lthRealizedSeries.at(-1).date.getTime();
  const start = end - Math.max(days - 1, 1) * 86_400_000;
  return lthRealizedSeries.filter((point) => point.date.getTime() >= start);
};

const drawLthRealizedChart = () => {
  const canvas = document.querySelector("#lth-rp-chart");
  const stage = canvas?.closest(".lth-rp-stage");
  const series = getLthRealizedVisibleSeries();
  if (!canvas || !stage || series.length < 2) {
    drawEmptyChart("#lth-rp-chart");
    lthRealizedChartState = null;
    return;
  }

  canvas.style.removeProperty("height");
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height || stage.clientHeight || 540, 360);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = chartColors();
  const palette = {
    price: colors.muted,
    rp0to10y: colors.ink,
    rp6m5y: colors.orange,
    rp6m7y: "#6f93ff",
    rp6m10y: "#73c47c"
  };
  const compact = width < 700;
  const padding = { top: 30, right: compact ? 16 : 24, bottom: 42, left: compact ? 58 : 74 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const keys = ["price", "rp0to10y", "rp6m5y", "rp6m7y", "rp6m10y"];
  const values = series.flatMap((point) => keys.map((key) => point[key])).filter((value) => Number.isFinite(value) && value > 0);
  const logMin = Math.log10(Math.min(...values)) - 0.08;
  const logMax = Math.log10(Math.max(...values)) + 0.08;
  const startTime = series[0].date.getTime();
  const endTime = series.at(-1).date.getTime();
  const xFor = (date) => padding.left + ((date.getTime() - startTime) / Math.max(endTime - startTime, 1)) * chartWidth;
  const yFor = (value) => padding.top + (1 - (Math.log10(Math.max(value, 0.0001)) - logMin) / Math.max(logMax - logMin, 0.0001)) * chartHeight;

  context.clearRect(0, 0, width, height);
  context.font = "700 10px JetBrains Mono";
  context.lineWidth = 1;
  context.textBaseline = "middle";

  const yTicks = compact ? 5 : 6;
  for (let index = 0; index < yTicks; index += 1) {
    const ratio = index / Math.max(yTicks - 1, 1);
    const value = 10 ** (logMax - ratio * (logMax - logMin));
    const y = padding.top + ratio * chartHeight;
    context.strokeStyle = colors.line;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillStyle = colors.muted;
    context.textAlign = "right";
    context.fillText(formatAxisUsd(value), padding.left - 9, y);
  }

  const xTicks = compact ? 4 : 7;
  const dateFormatter = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", {
    year: lthRealizedRange === "7" || lthRealizedRange === "30" || lthRealizedRange === "90" ? undefined : "numeric",
    month: "short",
    day: lthRealizedRange === "7" || lthRealizedRange === "30" || lthRealizedRange === "90" ? "2-digit" : undefined
  });
  context.textBaseline = "alphabetic";
  for (let index = 0; index < xTicks; index += 1) {
    const ratio = index / Math.max(xTicks - 1, 1);
    const date = new Date(startTime + ratio * (endTime - startTime));
    const x = padding.left + ratio * chartWidth;
    context.fillStyle = colors.muted;
    context.textAlign = index === 0 ? "left" : index === xTicks - 1 ? "right" : "center";
    context.fillText(dateFormatter.format(date), x, height - 13);
  }

  context.save();
  context.fillStyle = colors.ink;
  context.globalAlpha = document.body.dataset.theme === "dark" ? 0.052 : 0.04;
  context.font = `800 ${Math.max(30, Math.min(width * 0.08, height * 0.15, 88))}px Inter`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  drawBrandWatermark(context, padding.left + chartWidth / 2, padding.top + chartHeight / 2);
  context.restore();

  const drawSeries = (key, lineWidth, opacity) => {
    context.save();
    context.strokeStyle = palette[key];
    context.lineWidth = lineWidth;
    context.globalAlpha = opacity;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.beginPath();
    series.forEach((point, index) => {
      const x = xFor(point.date);
      const y = yFor(point[key]);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
    context.restore();
  };

  drawSeries("price", 1.35, 0.72);
  drawSeries("rp0to10y", 2.5, 0.96);
  drawSeries("rp6m5y", 2.2, 0.96);
  drawSeries("rp6m7y", 2.15, 0.96);
  drawSeries("rp6m10y", 2.15, 0.96);

  const latest = series.at(-1);
  keys.forEach((key) => {
    context.fillStyle = palette[key];
    context.beginPath();
    context.arc(xFor(latest.date), yFor(latest[key]), key === "price" ? 2.5 : 3.5, 0, Math.PI * 2);
    context.fill();
  });

  lthRealizedChartState = { series, padding, chartWidth, width, height };
};

const showLthRealizedTooltip = (event) => {
  const canvas = document.querySelector("#lth-rp-chart");
  const tooltip = document.querySelector("#lth-rp-tooltip");
  if (!canvas || !tooltip || !lthRealizedChartState) return;
  const { series, padding, chartWidth, width, height } = lthRealizedChartState;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * width;
  const ratio = Math.max(0, Math.min(1, (x - padding.left) / Math.max(chartWidth, 1)));
  const point = series[Math.round(ratio * (series.length - 1))];
  if (!point) return;
  const date = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", {
    year: "numeric", month: "2-digit", day: "2-digit"
  }).format(point.date);
  tooltip.innerHTML = `<strong>${date}</strong><span>BTC <i>${formatUsd(point.price)}</i></span><span>0–10Y RP <i>${formatUsd(point.rp0to10y)}</i></span><span>6M–5Y RP <i>${formatUsd(point.rp6m5y)}</i></span><span>6M–7Y RP <i>${formatUsd(point.rp6m7y)}</i></span><span>6M–10Y RP <i>${formatUsd(point.rp6m10y)}</i></span>`;
  tooltip.hidden = false;
  const stage = canvas.closest(".lth-rp-stage");
  const stageRect = stage.getBoundingClientRect();
  const localX = event.clientX - stageRect.left;
  const localY = event.clientY - stageRect.top;
  const tooltipWidth = 230;
  tooltip.style.left = `${Math.max(10, Math.min(stageRect.width - tooltipWidth - 10, localX + 14))}px`;
  tooltip.style.top = `${Math.max(10, Math.min(height - 180, localY - 45))}px`;
};

const hideLthRealizedTooltip = () => {
  const tooltip = document.querySelector("#lth-rp-tooltip");
  if (tooltip) tooltip.hidden = true;
};

const getRealizedProfitLossVisibleSeries = () => {
  if (!realizedProfitLossSeries.length || realizedProfitLossRange === "all") return realizedProfitLossSeries;
  const days = Number(realizedProfitLossRange);
  const end = realizedProfitLossSeries.at(-1).date.getTime();
  const start = end - Math.max(days - 1, 1) * 86_400_000;
  return realizedProfitLossSeries.filter((point) => point.date.getTime() >= start);
};

const drawRealizedProfitLossChart = () => {
  const canvas = document.querySelector("#rpl-chart");
  const stage = canvas?.closest(".rpl-stage");
  const series = getRealizedProfitLossVisibleSeries();
  if (!canvas || !stage || series.length < 2) {
    drawEmptyChart("#rpl-chart");
    realizedProfitLossChartState = null;
    return;
  }

  canvas.style.removeProperty("height");
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height || stage.clientHeight || 680, 500);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = chartColors();
  const compact = width < 700;
  const padding = { left: compact ? 58 : 76, right: compact ? 16 : 26, top: 24, bottom: 42 };
  const chartWidth = width - padding.left - padding.right;
  const usableHeight = height - padding.top - padding.bottom;
  const gap = compact ? 16 : 22;
  const panelHeight = (usableHeight - gap * 2) / 3;
  const panels = {
    price: { top: padding.top, height: panelHeight },
    amounts: { top: padding.top + panelHeight + gap, height: panelHeight },
    ratio: { top: padding.top + (panelHeight + gap) * 2, height: panelHeight }
  };
  const startTime = series[0].date.getTime();
  const endTime = series.at(-1).date.getTime();
  const xFor = (date) => padding.left + ((date.getTime() - startTime) / Math.max(endTime - startTime, 1)) * chartWidth;

  const priceValues = series.map((point) => point.price).filter((value) => Number.isFinite(value) && value > 0);
  const amountValues = series.flatMap((point) => [point.profit365SmaUsd, point.loss365SmaUsd]).filter((value) => Number.isFinite(value) && value > 0);
  const priceLogMin = Math.log10(Math.min(...priceValues)) - 0.08;
  const priceLogMax = Math.log10(Math.max(...priceValues)) + 0.08;
  const amountLogMin = amountValues.length ? Math.log10(Math.min(...amountValues)) - 0.08 : 6;
  const amountLogMax = amountValues.length ? Math.log10(Math.max(...amountValues)) + 0.08 : 10;
  const ratioObservedMax = Math.max(...series.map((point) => point.ratio).filter(Number.isFinite));
  const ratioMax = realizedProfitLossRange === "all" ? 8 : Math.max(3, Math.min(8, Math.ceil(ratioObservedMax * 1.12)));
  const logY = (value, panel, min, max) => panel.top + (1 - (Math.log10(Math.max(value, 0.0001)) - min) / Math.max(max - min, 0.0001)) * panel.height;
  const ratioY = (value) => panels.ratio.top + (1 - Math.min(Math.max(value, 0), ratioMax) / ratioMax) * panels.ratio.height;

  context.clearRect(0, 0, width, height);
  context.font = "700 10px JetBrains Mono";
  context.lineWidth = 1;
  context.textBaseline = "middle";

  const drawLogGrid = (panel, min, max, formatter) => {
    const ticks = compact ? 4 : 5;
    for (let index = 0; index < ticks; index += 1) {
      const ratio = index / Math.max(ticks - 1, 1);
      const value = 10 ** (max - ratio * (max - min));
      const y = panel.top + ratio * panel.height;
      context.strokeStyle = colors.line;
      context.beginPath();
      context.moveTo(padding.left, y);
      context.lineTo(width - padding.right, y);
      context.stroke();
      context.fillStyle = colors.muted;
      context.textAlign = "right";
      context.fillText(formatter(value), padding.left - 9, y);
    }
  };
  drawLogGrid(panels.price, priceLogMin, priceLogMax, formatAxisUsd);
  drawLogGrid(panels.amounts, amountLogMin, amountLogMax, formatAxisUsd);

  const ratioTicks = [0, 1, 2.2, 4, 6, 8].filter((value) => value <= ratioMax);
  ratioTicks.forEach((value) => {
    const y = ratioY(value);
    context.strokeStyle = value === 1 ? colors.red : value === 2.2 ? colors.orange : colors.line;
    context.setLineDash(value === 1 || value === 2.2 ? [5, 5] : []);
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = colors.muted;
    context.textAlign = "right";
    context.fillText(value.toFixed(value % 1 ? 1 : 0), padding.left - 9, y);
  });

  context.save();
  context.fillStyle = colors.red;
  context.globalAlpha = 0.055;
  context.fillRect(padding.left, ratioY(1), chartWidth, panels.ratio.top + panels.ratio.height - ratioY(1));
  context.restore();

  context.save();
  context.fillStyle = colors.ink;
  context.globalAlpha = document.body.dataset.theme === "dark" ? 0.05 : 0.038;
  context.font = `800 ${Math.max(28, Math.min(width * 0.075, height * 0.11, 82))}px Inter`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  drawBrandWatermark(context, padding.left + chartWidth / 2, padding.top + usableHeight / 2);
  context.restore();

  const drawLine = (key, yFor, color, lineWidth, opacity = 1) => {
    context.save();
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.globalAlpha = opacity;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.beginPath();
    let drawing = false;
    series.forEach((point) => {
      const value = point[key];
      if (!Number.isFinite(value) || value <= 0) {
        drawing = false;
        return;
      }
      const x = xFor(point.date);
      const y = yFor(value);
      if (!drawing) context.moveTo(x, y);
      else context.lineTo(x, y);
      drawing = true;
    });
    context.stroke();
    context.restore();
  };
  drawLine("price", (value) => logY(value, panels.price, priceLogMin, priceLogMax), colors.muted, 1.45, 0.82);
  drawLine("profit365SmaUsd", (value) => logY(value, panels.amounts, amountLogMin, amountLogMax), colors.orange, 2.15, 0.96);
  drawLine("loss365SmaUsd", (value) => logY(value, panels.amounts, amountLogMin, amountLogMax), "#6f93ff", 2.15, 0.96);

  context.save();
  context.lineWidth = 2.15;
  context.lineJoin = "round";
  context.lineCap = "round";
  for (let index = 1; index < series.length; index += 1) {
    const previous = series[index - 1];
    const point = series[index];
    context.strokeStyle = point.ratio < 1 || previous.ratio < 1 ? colors.red : colors.green;
    context.beginPath();
    context.moveTo(xFor(previous.date), ratioY(previous.ratio));
    context.lineTo(xFor(point.date), ratioY(point.ratio));
    context.stroke();
  }
  context.restore();

  const latest = series.at(-1);
  context.fillStyle = latest.ratio < 1 ? colors.red : colors.green;
  context.beginPath();
  context.arc(xFor(latest.date), ratioY(latest.ratio), 4, 0, Math.PI * 2);
  context.fill();

  context.font = "800 9px JetBrains Mono";
  context.textAlign = "right";
  context.fillStyle = colors.orange;
  context.fillText("2.2 WARNING", width - padding.right - 4, ratioY(2.2) - 9);
  context.fillStyle = colors.red;
  context.fillText("1.0 BOTTOM", width - padding.right - 4, ratioY(1) - 9);

  const xTicks = compact ? 4 : 7;
  const dateFormatter = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", {
    year: realizedProfitLossRange === "7" || realizedProfitLossRange === "30" || realizedProfitLossRange === "90" ? undefined : "numeric",
    month: "short",
    day: realizedProfitLossRange === "7" || realizedProfitLossRange === "30" || realizedProfitLossRange === "90" ? "2-digit" : undefined
  });
  context.textBaseline = "alphabetic";
  for (let index = 0; index < xTicks; index += 1) {
    const ratio = index / Math.max(xTicks - 1, 1);
    const date = new Date(startTime + ratio * (endTime - startTime));
    const x = padding.left + ratio * chartWidth;
    context.fillStyle = colors.muted;
    context.textAlign = index === 0 ? "left" : index === xTicks - 1 ? "right" : "center";
    context.fillText(dateFormatter.format(date), x, height - 13);
  }

  realizedProfitLossChartState = { series, padding, chartWidth, width, height };
};

const showRealizedProfitLossTooltip = (event) => {
  const canvas = document.querySelector("#rpl-chart");
  const tooltip = document.querySelector("#rpl-tooltip");
  if (!canvas || !tooltip || !realizedProfitLossChartState) return;
  const { series, padding, chartWidth, width, height } = realizedProfitLossChartState;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * width;
  const ratio = Math.max(0, Math.min(1, (x - padding.left) / Math.max(chartWidth, 1)));
  const point = series[Math.round(ratio * (series.length - 1))];
  if (!point) return;
  const date = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", {
    year: "numeric", month: "2-digit", day: "2-digit"
  }).format(point.date);
  const profit = Number.isFinite(point.profit365SmaUsd) ? compactUsd(point.profit365SmaUsd) : "--";
  const loss = Number.isFinite(point.loss365SmaUsd) ? compactUsd(point.loss365SmaUsd) : "--";
  tooltip.innerHTML = `<strong>${date}</strong><span>BTC <i>${formatUsd(point.price)}</i></span><span>Profit 365D <i>${profit}</i></span><span>Loss 365D <i>${loss}</i></span><span>Ratio <i>${point.ratio.toFixed(2)}</i></span>`;
  tooltip.hidden = false;
  const stageRect = canvas.closest(".rpl-stage").getBoundingClientRect();
  const localX = event.clientX - stageRect.left;
  const localY = event.clientY - stageRect.top;
  const tooltipWidth = 230;
  tooltip.style.left = `${Math.max(10, Math.min(stageRect.width - tooltipWidth - 10, localX + 14))}px`;
  tooltip.style.top = `${Math.max(10, Math.min(height - 180, localY - 45))}px`;
};

const hideRealizedProfitLossTooltip = () => {
  const tooltip = document.querySelector("#rpl-tooltip");
  if (tooltip) tooltip.hidden = true;
};

const getMedianRealizedVisibleSeries = () => {
  if (!medianRealizedSeries.length || medianRealizedRange === "all") return medianRealizedSeries;
  const days = Number(medianRealizedRange);
  const end = medianRealizedSeries.at(-1).date.getTime();
  const start = end - Math.max(days - 1, 1) * 86_400_000;
  return medianRealizedSeries.filter((point) => point.date.getTime() >= start);
};

const drawMedianRealizedChart = () => {
  const canvas = document.querySelector("#median-rp-chart");
  const stage = canvas?.closest(".median-rp-stage");
  const series = getMedianRealizedVisibleSeries();
  if (!canvas || !stage || series.length < 2) {
    drawEmptyChart("#median-rp-chart");
    medianRealizedChartState = null;
    return;
  }

  canvas.style.removeProperty("height");
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height || stage.clientHeight || 510, 320);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = chartColors();
  const compact = width < 700;
  const padding = { top: 30, right: compact ? 16 : 24, bottom: 42, left: compact ? 58 : 74 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const values = series
    .flatMap((point) => [point.price, point.median])
    .filter((value) => Number.isFinite(value) && value > 0);
  const logMin = Math.log10(Math.min(...values)) - 0.08;
  const logMax = Math.log10(Math.max(...values)) + 0.08;
  const startTime = series[0].date.getTime();
  const endTime = series.at(-1).date.getTime();
  const xFor = (date) => padding.left + ((date.getTime() - startTime) / Math.max(endTime - startTime, 1)) * chartWidth;
  const yFor = (value) => padding.top + (1 - (Math.log10(Math.max(value, 0.0001)) - logMin) / Math.max(logMax - logMin, 0.0001)) * chartHeight;

  context.clearRect(0, 0, width, height);
  context.font = "700 10px JetBrains Mono";
  context.lineWidth = 1;
  context.textBaseline = "middle";

  const yTicks = compact ? 5 : 6;
  for (let index = 0; index < yTicks; index += 1) {
    const ratio = index / Math.max(yTicks - 1, 1);
    const value = 10 ** (logMax - ratio * (logMax - logMin));
    const y = padding.top + ratio * chartHeight;
    context.strokeStyle = colors.line;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillStyle = colors.muted;
    context.textAlign = "right";
    context.fillText(formatAxisUsd(value), padding.left - 9, y);
  }

  const xTicks = compact ? 4 : 7;
  const shortRange = ["7", "30", "90"].includes(medianRealizedRange);
  const dateFormatter = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", {
    year: shortRange ? undefined : "numeric",
    month: "short",
    day: shortRange ? "2-digit" : undefined
  });
  context.textBaseline = "alphabetic";
  for (let index = 0; index < xTicks; index += 1) {
    const ratio = index / Math.max(xTicks - 1, 1);
    const date = new Date(startTime + ratio * (endTime - startTime));
    const x = padding.left + ratio * chartWidth;
    context.fillStyle = colors.muted;
    context.textAlign = index === 0 ? "left" : index === xTicks - 1 ? "right" : "center";
    context.fillText(dateFormatter.format(date), x, height - 13);
  }

  context.save();
  context.fillStyle = colors.ink;
  context.globalAlpha = document.body.dataset.theme === "dark" ? 0.055 : 0.045;
  context.font = `800 ${Math.max(30, Math.min(width * 0.085, height * 0.16, 92))}px Inter`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  drawBrandWatermark(context, padding.left + chartWidth / 2, padding.top + chartHeight / 2);
  context.restore();

  const drawSeries = (points, key, color, lineWidth, opacity = 1) => {
    context.save();
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.globalAlpha = opacity;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.beginPath();
    let started = false;
    points.forEach((point) => {
      if (!Number.isFinite(point[key]) || point[key] <= 0) return;
      const x = xFor(point.date);
      const y = yFor(point[key]);
      if (!started) {
        context.moveTo(x, y);
        started = true;
      } else context.lineTo(x, y);
    });
    context.stroke();
    context.restore();
  };

  drawSeries(series, "price", colors.muted, 1.45, 0.82);
  drawSeries(series, "median", colors.orange, 2.45, 0.98);

  const medianPoints = series.filter((point) => Number.isFinite(point.median));
  const latestMedian = medianPoints.at(-1);
  if (latestMedian && medianPoints.length < Math.max(30, series.length * 0.25)) {
    const y = yFor(latestMedian.median);
    context.save();
    context.strokeStyle = colors.orange;
    context.globalAlpha = 0.62;
    context.setLineDash([6, 6]);
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = colors.orange;
    context.globalAlpha = 0.9;
    context.font = "800 9px JetBrains Mono";
    context.textAlign = "right";
    context.fillText(currentLanguage === "zh" ? "最新已验证中位成本" : "LATEST VERIFIED MEDIAN", width - padding.right, y - 8);
    context.restore();
  }

  const latestPrice = series.at(-1);
  [[latestPrice, "price", colors.muted], [latestMedian, "median", colors.orange]].forEach(([point, key, color]) => {
    if (!point || !Number.isFinite(point[key])) return;
    context.fillStyle = color;
    context.beginPath();
    context.arc(xFor(point.date), yFor(point[key]), key === "price" ? 3 : 4, 0, Math.PI * 2);
    context.fill();
  });

  medianRealizedChartState = { series, padding, chartWidth, width, height };
};

const showMedianRealizedTooltip = (event) => {
  const canvas = document.querySelector("#median-rp-chart");
  const tooltip = document.querySelector("#median-rp-tooltip");
  if (!canvas || !tooltip || !medianRealizedChartState) return;
  const { series, padding, chartWidth, width, height } = medianRealizedChartState;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * width;
  const ratio = Math.max(0, Math.min(1, (x - padding.left) / Math.max(chartWidth, 1)));
  const point = series[Math.round(ratio * (series.length - 1))];
  if (!point) return;
  const date = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", {
    year: "numeric", month: "2-digit", day: "2-digit"
  }).format(point.date);
  const median = Number.isFinite(point.median) ? formatUsd(point.median) : "--";
  const pointRatio = Number.isFinite(point.median) ? (point.price / point.median).toFixed(4) : "--";
  tooltip.innerHTML = `<strong>${date}</strong><span>BTC <i>${formatUsd(point.price)}</i></span><span>Median RP <i>${median}</i></span><span>Price / Median <i>${pointRatio}</i></span>`;
  tooltip.hidden = false;
  const tooltipWidth = tooltip.offsetWidth || 190;
  const left = Math.max(8, Math.min(rect.width - tooltipWidth - 8, event.clientX - rect.left + 14));
  const top = Math.max(8, Math.min(height - 118, event.clientY - rect.top - 80));
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
};

const hideMedianRealizedTooltip = () => {
  const tooltip = document.querySelector("#median-rp-tooltip");
  if (tooltip) tooltip.hidden = true;
};

const buildMedianMvrvSeries = (rows, snapshot = null) => {
  let latestVerifiedMedian = null;
  const derived = rows.flatMap((point) => {
    const hasMedian = Number.isFinite(point.median) && point.median > 0;
    const verified = hasMedian && !point.estimated;
    if (hasMedian) latestVerifiedMedian = point.median;
    if (!Number.isFinite(latestVerifiedMedian) || latestVerifiedMedian <= 0) return [];
    return [{
      date: point.date,
      price: point.price,
      median: latestVerifiedMedian,
      ratio: point.price / latestVerifiedMedian,
      verified,
      estimated: Boolean(point.estimated)
    }];
  });

  const livePrice = Number(snapshot?.price);
  const liveMedian = Number(snapshot?.median);
  const liveDate = new Date(snapshot?.priceAsOf || snapshot?.medianAsOf || Date.now());
  if (Number.isFinite(livePrice) && livePrice > 0 && Number.isFinite(liveMedian) && liveMedian > 0 && !Number.isNaN(liveDate.getTime())) {
    const normalizedDate = new Date(Date.UTC(liveDate.getUTCFullYear(), liveDate.getUTCMonth(), liveDate.getUTCDate()));
    const estimated = Boolean(snapshot?.medianEstimated);
    const livePoint = { date: normalizedDate, price: livePrice, median: liveMedian, ratio: livePrice / liveMedian, verified: !estimated, estimated };
    const existingIndex = derived.findIndex((point) => point.date.toISOString().slice(0, 10) === normalizedDate.toISOString().slice(0, 10));
    if (existingIndex >= 0) derived[existingIndex] = livePoint;
    else derived.push(livePoint);
  }

  return derived.sort((a, b) => a.date - b.date);
};

const buildMedianMvrvSnapshot = (series, sourceSnapshot = null, completeHistory = false) => {
  const latest = series.at(-1);
  if (!latest) return null;
  const average = (days) => {
    const cutoff = latest.date.getTime() - Math.max(days - 1, 1) * 86_400_000;
    const window = series.filter((point) => point.date.getTime() >= cutoff);
    return window.reduce((sum, point) => sum + point.ratio, 0) / Math.max(window.length, 1);
  };
  const sevenDayStart = series.find((point) => point.date.getTime() >= latest.date.getTime() - 7 * 86_400_000) || series[0];
  const sevenDayChange = latest.ratio - sevenDayStart.ratio;
  const trend = sevenDayChange > 0.005 ? "rising" : sevenDayChange < -0.005 ? "falling" : "flat";
  const zone = latest.ratio < 0.9 ? "deep" : latest.ratio < 1 ? "below" : latest.ratio <= 1.15 ? "near" : latest.ratio <= 1.8 ? "balanced" : "extended";
  return {
    price: latest.price,
    priceAsOf: sourceSnapshot?.priceAsOf || latest.date.toISOString(),
    median: latest.median,
    medianAsOf: sourceSnapshot?.medianAsOf || latest.date.toISOString().slice(0, 10),
    ratio: latest.ratio,
    distanceToOne: latest.ratio - 1,
    average7: average(7),
    average30: average(30),
    sevenDayChange,
    trend,
    zone,
    completeHistory,
    observationCount: series.length,
    verifiedCount: series.filter((point) => point.verified).length
  };
};

const getMedianMvrvVisibleSeries = () => {
  if (!medianMvrvSeries.length || medianMvrvRange === "all") return medianMvrvSeries;
  const days = Number(medianMvrvRange);
  const end = medianMvrvSeries.at(-1).date.getTime();
  const start = end - Math.max(days - 1, 1) * 86_400_000;
  return medianMvrvSeries.filter((point) => point.date.getTime() >= start);
};

const drawMedianMvrvChart = () => {
  const canvas = document.querySelector("#median-mvrv-chart");
  const stage = canvas?.closest(".median-mvrv-stage");
  const series = getMedianMvrvVisibleSeries();
  if (!canvas || !stage || series.length < 2) {
    drawEmptyChart("#median-mvrv-chart");
    medianMvrvChartState = null;
    return;
  }

  canvas.style.removeProperty("height");
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height || stage.clientHeight || 620, 360);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = chartColors();
  const compact = width < 700;
  const padding = { top: 30, right: compact ? 58 : 78, bottom: 44, left: compact ? 54 : 66 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const prices = series.map((point) => point.price).filter((value) => Number.isFinite(value) && value > 0);
  const ratios = series.map((point) => point.ratio).filter(Number.isFinite);
  const priceLogMin = Math.log10(Math.min(...prices)) - 0.06;
  const priceLogMax = Math.log10(Math.max(...prices)) + 0.06;
  const ratioMin = Math.min(0.75, Math.min(...ratios) - 0.08);
  const ratioMax = Math.max(1.25, Math.max(...ratios) + 0.08);
  const startTime = series[0].date.getTime();
  const endTime = series.at(-1).date.getTime();
  const xFor = (date) => padding.left + ((date.getTime() - startTime) / Math.max(endTime - startTime, 1)) * chartWidth;
  const priceY = (value) => padding.top + (1 - (Math.log10(Math.max(value, 0.0001)) - priceLogMin) / Math.max(priceLogMax - priceLogMin, 0.0001)) * chartHeight;
  const ratioY = (value) => padding.top + (1 - (value - ratioMin) / Math.max(ratioMax - ratioMin, 0.0001)) * chartHeight;

  context.clearRect(0, 0, width, height);
  context.font = "700 10px JetBrains Mono";
  context.lineWidth = 1;
  context.textBaseline = "middle";

  const breakEvenY = ratioY(1);
  if (breakEvenY < padding.top + chartHeight) {
    context.fillStyle = colors.red;
    context.globalAlpha = document.body.dataset.theme === "dark" ? 0.075 : 0.055;
    context.fillRect(padding.left, Math.max(padding.top, breakEvenY), chartWidth, padding.top + chartHeight - Math.max(padding.top, breakEvenY));
    context.globalAlpha = 1;
  }

  const yTicks = compact ? 5 : 6;
  for (let index = 0; index < yTicks; index += 1) {
    const progress = index / Math.max(yTicks - 1, 1);
    const y = padding.top + progress * chartHeight;
    const ratioValue = ratioMax - progress * (ratioMax - ratioMin);
    const priceValue = 10 ** (priceLogMax - progress * (priceLogMax - priceLogMin));
    context.strokeStyle = colors.line;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillStyle = colors.orange;
    context.textAlign = "right";
    context.fillText(ratioValue.toFixed(ratioValue >= 10 ? 1 : 2), padding.left - 9, y);
    context.fillStyle = colors.muted;
    context.textAlign = "left";
    context.fillText(formatAxisUsd(priceValue), width - padding.right + 9, y);
  }

  context.save();
  context.strokeStyle = colors.red;
  context.globalAlpha = 0.9;
  context.setLineDash([7, 6]);
  context.beginPath();
  context.moveTo(padding.left, breakEvenY);
  context.lineTo(width - padding.right, breakEvenY);
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = colors.red;
  context.font = "800 9px JetBrains Mono";
  context.textAlign = "left";
  context.fillText("MVRV 1.0", padding.left + 7, breakEvenY - 10);
  context.restore();

  const drawLine = (key, yFor, color, lineWidth, opacity = 1) => {
    context.save();
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.globalAlpha = opacity;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.beginPath();
    series.forEach((point, index) => {
      const x = xFor(point.date);
      const y = yFor(point[key]);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
    context.restore();
  };

  drawLine("price", priceY, colors.ink, 1.55, 0.86);
  drawLine("ratio", ratioY, colors.orange, 2.55, 0.98);

  context.save();
  context.fillStyle = colors.ink;
  context.globalAlpha = document.body.dataset.theme === "dark" ? 0.055 : 0.045;
  context.font = `800 ${Math.max(30, Math.min(width * 0.085, height * 0.16, 92))}px Inter`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  drawBrandWatermark(context, padding.left + chartWidth / 2, padding.top + chartHeight / 2);
  context.restore();

  const latest = series.at(-1);
  [[priceY(latest.price), colors.ink, 3], [ratioY(latest.ratio), colors.orange, 4]].forEach(([y, color, radius]) => {
    context.fillStyle = color;
    context.beginPath();
    context.arc(xFor(latest.date), y, radius, 0, Math.PI * 2);
    context.fill();
  });

  const xTicks = compact ? 4 : 7;
  const shortRange = ["7", "30", "90"].includes(medianMvrvRange);
  const dateFormatter = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", {
    year: shortRange ? undefined : "numeric",
    month: "short",
    day: shortRange ? "2-digit" : undefined
  });
  context.textBaseline = "alphabetic";
  for (let index = 0; index < xTicks; index += 1) {
    const progress = index / Math.max(xTicks - 1, 1);
    const date = new Date(startTime + progress * (endTime - startTime));
    const x = padding.left + progress * chartWidth;
    context.fillStyle = colors.muted;
    context.textAlign = index === 0 ? "left" : index === xTicks - 1 ? "right" : "center";
    context.fillText(dateFormatter.format(date), x, height - 13);
  }

  medianMvrvChartState = { series, padding, chartWidth, width, height };
};

const showMedianMvrvTooltip = (event) => {
  const canvas = document.querySelector("#median-mvrv-chart");
  const tooltip = document.querySelector("#median-mvrv-tooltip");
  if (!canvas || !tooltip || !medianMvrvChartState) return;
  const { series, padding, chartWidth, width, height } = medianMvrvChartState;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * width;
  const progress = Math.max(0, Math.min(1, (x - padding.left) / Math.max(chartWidth, 1)));
  const point = series[Math.round(progress * (series.length - 1))];
  if (!point) return;
  const date = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "2-digit", day: "2-digit" }).format(point.date);
  tooltip.innerHTML = `<strong>${date}</strong><span>BTC <i>${formatUsd(point.price)}</i></span><span>Median RP <i>${formatUsd(point.median)}</i></span><span>Median MVRV <i>${point.ratio.toFixed(4)}</i></span><span>${point.verified ? "VERIFIED PUBLIC ANCHOR" : "PUBLIC HODL RECONSTRUCTION"}</span>`;
  tooltip.hidden = false;
  const tooltipWidth = tooltip.offsetWidth || 230;
  tooltip.style.left = `${Math.max(8, Math.min(rect.width - tooltipWidth - 8, event.clientX - rect.left + 14))}px`;
  tooltip.style.top = `${Math.max(8, Math.min(height - 142, event.clientY - rect.top - 72))}px`;
};

const hideMedianMvrvTooltip = () => {
  const tooltip = document.querySelector("#median-mvrv-tooltip");
  if (tooltip) tooltip.hidden = true;
};

const getMvrvBandsVisibleSeries = () => {
  if (!mvrvBandsSeries.length || mvrvBandsRange === "all") return mvrvBandsSeries;
  const days = Number(mvrvBandsRange);
  const end = mvrvBandsSeries.at(-1).date.getTime();
  const start = end - Math.max(days - 1, 1) * 86_400_000;
  return mvrvBandsSeries.filter((point) => point.date.getTime() >= start);
};

const drawMvrvBandsChart = () => {
  const canvas = document.querySelector("#mvrv-bands-chart");
  const stage = canvas?.closest(".mvrv-bands-stage");
  const series = getMvrvBandsVisibleSeries();
  if (!canvas || !stage || series.length < 2) {
    drawEmptyChart("#mvrv-bands-chart");
    mvrvBandsChartState = null;
    return;
  }

  canvas.style.removeProperty("height");
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height || stage.clientHeight || 620, 360);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = chartColors();
  const compact = width < 700;
  const padding = { top: 30, right: compact ? 58 : 78, bottom: 44, left: compact ? 54 : 66 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const prices = series.map((point) => point.price).filter((value) => Number.isFinite(value) && value > 0);
  const bandValues = series.flatMap((point) => [point.mvrv, point.minusOne, point.mean, point.plusOne]).filter(Number.isFinite);
  const sortedBands = [...bandValues].sort((left, right) => left - right);
  const percentileMax = sortedBands[Math.min(sortedBands.length - 1, Math.floor(sortedBands.length * 0.995))] || 3;
  const ratioMin = Math.max(0, Math.min(...bandValues) - 0.12);
  const ratioMax = Math.max(2, percentileMax + 0.25);
  const priceLogMin = Math.log10(Math.min(...prices)) - 0.06;
  const priceLogMax = Math.log10(Math.max(...prices)) + 0.06;
  const startTime = series[0].date.getTime();
  const endTime = series.at(-1).date.getTime();
  const xFor = (date) => padding.left + ((date.getTime() - startTime) / Math.max(endTime - startTime, 1)) * chartWidth;
  const priceY = (value) => padding.top + (1 - (Math.log10(Math.max(value, 0.0001)) - priceLogMin) / Math.max(priceLogMax - priceLogMin, 0.0001)) * chartHeight;
  const ratioY = (value) => padding.top + (1 - (Math.min(value, ratioMax) - ratioMin) / Math.max(ratioMax - ratioMin, 0.0001)) * chartHeight;

  context.clearRect(0, 0, width, height);
  context.font = "700 10px JetBrains Mono";
  context.lineWidth = 1;
  context.textBaseline = "middle";

  const yTicks = compact ? 5 : 6;
  for (let index = 0; index < yTicks; index += 1) {
    const progress = index / Math.max(yTicks - 1, 1);
    const y = padding.top + progress * chartHeight;
    const ratioValue = ratioMax - progress * (ratioMax - ratioMin);
    const priceValue = 10 ** (priceLogMax - progress * (priceLogMax - priceLogMin));
    context.strokeStyle = colors.line;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillStyle = colors.orange;
    context.textAlign = "right";
    context.fillText(ratioValue.toFixed(ratioValue >= 10 ? 1 : 2), padding.left - 9, y);
    context.fillStyle = colors.muted;
    context.textAlign = "left";
    context.fillText(formatAxisUsd(priceValue), width - padding.right + 9, y);
  }

  context.save();
  context.fillStyle = colors.red;
  context.globalAlpha = document.body.dataset.theme === "dark" ? 0.11 : 0.075;
  series.forEach((point, index) => {
    if (!Number.isFinite(point.minusOne) || point.mvrv >= point.minusOne) return;
    const next = series[Math.min(index + 1, series.length - 1)];
    const left = xFor(point.date);
    const right = Math.max(left + 1, xFor(next.date));
    context.fillRect(left, ratioY(point.minusOne), right - left, ratioY(point.mvrv) - ratioY(point.minusOne));
  });
  context.restore();

  const drawLine = (key, yFor, color, lineWidth, opacity = 1, dash = []) => {
    context.save();
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.globalAlpha = opacity;
    context.setLineDash(dash);
    context.lineJoin = "round";
    context.lineCap = "round";
    context.beginPath();
    let started = false;
    series.forEach((point) => {
      if (!Number.isFinite(point[key])) {
        started = false;
        return;
      }
      const x = xFor(point.date);
      const y = yFor(point[key]);
      if (!started) {
        context.moveTo(x, y);
        started = true;
      } else context.lineTo(x, y);
    });
    context.stroke();
    context.restore();
  };

  drawLine("price", priceY, colors.ink, 1.45, 0.78);
  drawLine("minusOne", ratioY, colors.red, 1.9, 0.9);
  drawLine("minusHalf", ratioY, colors.orange, 1.1, 0.48, [6, 6]);
  drawLine("mean", ratioY, colors.green, 1.9, 0.94);
  drawLine("plusHalf", ratioY, colors.cyan, 1.1, 0.48, [6, 6]);
  drawLine("plusOne", ratioY, "#6f93ff", 1.9, 0.9);
  drawLine("mvrv", ratioY, colors.orange, 2.35, 1);

  context.save();
  context.fillStyle = colors.ink;
  context.globalAlpha = document.body.dataset.theme === "dark" ? 0.055 : 0.045;
  context.font = `800 ${Math.max(30, Math.min(width * 0.085, height * 0.16, 92))}px Inter`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  drawBrandWatermark(context, padding.left + chartWidth / 2, padding.top + chartHeight / 2);
  context.restore();

  const latest = [...series].reverse().find((point) => Number.isFinite(point.mean)) || series.at(-1);
  [[priceY(latest.price), colors.ink, 3], [ratioY(latest.mvrv), colors.orange, 4]].forEach(([y, color, radius]) => {
    context.fillStyle = color;
    context.beginPath();
    context.arc(xFor(latest.date), y, radius, 0, Math.PI * 2);
    context.fill();
  });

  const xTicks = compact ? 4 : 7;
  const shortRange = ["7", "30", "90"].includes(mvrvBandsRange);
  const dateFormatter = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", {
    year: shortRange ? undefined : "numeric",
    month: "short",
    day: shortRange ? "2-digit" : undefined
  });
  context.textBaseline = "alphabetic";
  for (let index = 0; index < xTicks; index += 1) {
    const progress = index / Math.max(xTicks - 1, 1);
    const date = new Date(startTime + progress * (endTime - startTime));
    const x = padding.left + progress * chartWidth;
    context.fillStyle = colors.muted;
    context.textAlign = index === 0 ? "left" : index === xTicks - 1 ? "right" : "center";
    context.fillText(dateFormatter.format(date), x, height - 13);
  }

  mvrvBandsChartState = { series, padding, chartWidth, width, height };
};

const showMvrvBandsTooltip = (event) => {
  const canvas = document.querySelector("#mvrv-bands-chart");
  const tooltip = document.querySelector("#mvrv-bands-tooltip");
  if (!canvas || !tooltip || !mvrvBandsChartState) return;
  const { series, padding, chartWidth, width, height } = mvrvBandsChartState;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * width;
  const progress = Math.max(0, Math.min(1, (x - padding.left) / Math.max(chartWidth, 1)));
  const point = series[Math.round(progress * (series.length - 1))];
  if (!point) return;
  const date = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "2-digit", day: "2-digit" }).format(point.date);
  const band = (value) => Number.isFinite(value) ? value.toFixed(3) : "WARM-UP";
  tooltip.innerHTML = `<strong>${date}</strong><span>BTC <i>${formatUsd(point.price)}</i></span><span>MVRV <i>${point.mvrv.toFixed(3)}</i></span><span>-1σ / Mean / +1σ <i>${band(point.minusOne)} / ${band(point.mean)} / ${band(point.plusOne)}</i></span><span>Z-Score <i>${band(point.zscore)}</i></span>`;
  tooltip.hidden = false;
  const tooltipWidth = tooltip.offsetWidth || 250;
  tooltip.style.left = `${Math.max(8, Math.min(rect.width - tooltipWidth - 8, event.clientX - rect.left + 14))}px`;
  tooltip.style.top = `${Math.max(8, Math.min(height - 148, event.clientY - rect.top - 76))}px`;
};

const hideMvrvBandsTooltip = () => {
  const tooltip = document.querySelector("#mvrv-bands-tooltip");
  if (tooltip) tooltip.hidden = true;
};

const getMvrvPriceBandsVisibleSeries = () => {
  if (!mvrvPriceBandsSeries.length || mvrvPriceBandsRange === "all") return mvrvPriceBandsSeries;
  const days = Number(mvrvPriceBandsRange);
  const end = mvrvPriceBandsSeries.at(-1).date.getTime();
  const start = end - Math.max(days - 1, 1) * 86_400_000;
  return mvrvPriceBandsSeries.filter((point) => point.date.getTime() >= start);
};

const drawMvrvPriceBandsChart = () => {
  const canvas = document.querySelector("#mvrv-price-bands-chart");
  const stage = canvas?.closest(".mvrv-price-bands-stage");
  const series = getMvrvPriceBandsVisibleSeries();
  if (!canvas || !stage || series.length < 2) {
    drawEmptyChart("#mvrv-price-bands-chart");
    mvrvPriceBandsChartState = null;
    return;
  }

  canvas.style.removeProperty("height");
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height || stage.clientHeight || 620, 360);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = chartColors();
  const compact = width < 700;
  const padding = { top: 30, right: compact ? 24 : 34, bottom: 44, left: compact ? 58 : 72 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const valueKeys = ["price", "priceMinusOne", "priceMinusHalf", "priceMean", "pricePlusOne", "pricePlusTwo"];
  const values = series.flatMap((point) => valueKeys.map((key) => point[key])).filter((value) => Number.isFinite(value) && value > 0);
  if (!values.length) {
    drawEmptyChart("#mvrv-price-bands-chart");
    mvrvPriceBandsChartState = null;
    return;
  }
  const logMin = Math.log10(Math.min(...values)) - 0.08;
  const logMax = Math.log10(Math.max(...values)) + 0.08;
  const startTime = series[0].date.getTime();
  const endTime = series.at(-1).date.getTime();
  const xFor = (date) => padding.left + ((date.getTime() - startTime) / Math.max(endTime - startTime, 1)) * chartWidth;
  const yFor = (value) => padding.top + (1 - (Math.log10(Math.max(value, 0.0001)) - logMin) / Math.max(logMax - logMin, 0.0001)) * chartHeight;

  context.clearRect(0, 0, width, height);
  context.font = "700 10px JetBrains Mono";
  context.lineWidth = 1;
  context.textBaseline = "middle";
  const yTicks = compact ? 5 : 6;
  for (let index = 0; index < yTicks; index += 1) {
    const progress = index / Math.max(yTicks - 1, 1);
    const y = padding.top + progress * chartHeight;
    const value = 10 ** (logMax - progress * (logMax - logMin));
    context.strokeStyle = colors.line;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillStyle = colors.muted;
    context.textAlign = "right";
    context.fillText(formatAxisUsd(value), padding.left - 9, y);
  }

  context.save();
  context.fillStyle = colors.green;
  context.globalAlpha = document.body.dataset.theme === "dark" ? 0.075 : 0.055;
  context.beginPath();
  let topStarted = false;
  series.forEach((point) => {
    if (!Number.isFinite(point.priceMean)) return;
    const x = xFor(point.date);
    const y = yFor(point.priceMean);
    if (!topStarted) {
      context.moveTo(x, y);
      topStarted = true;
    } else context.lineTo(x, y);
  });
  [...series].reverse().forEach((point) => {
    if (Number.isFinite(point.priceMinusHalf)) context.lineTo(xFor(point.date), yFor(point.priceMinusHalf));
  });
  context.closePath();
  context.fill();
  context.restore();

  const drawLine = (key, color, lineWidth, opacity = 1, dash = []) => {
    context.save();
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.globalAlpha = opacity;
    context.setLineDash(dash);
    context.lineJoin = "round";
    context.lineCap = "round";
    context.beginPath();
    let started = false;
    series.forEach((point) => {
      if (!Number.isFinite(point[key]) || point[key] <= 0) {
        started = false;
        return;
      }
      const x = xFor(point.date);
      const y = yFor(point[key]);
      if (!started) {
        context.moveTo(x, y);
        started = true;
      } else context.lineTo(x, y);
    });
    context.stroke();
    context.restore();
  };

  drawLine("priceMinusOne", colors.green, 1.85, 0.85);
  drawLine("priceMinusHalf", "#72c98e", 1.65, 0.9);
  drawLine("priceMean", "#e4c158", 1.95, 0.95);
  drawLine("pricePlusOne", colors.orange, 1.75, 0.9);
  drawLine("pricePlusTwo", colors.red, 1.85, 0.88);
  drawLine("price", colors.ink, 2.25, 1);

  context.save();
  context.fillStyle = colors.ink;
  context.globalAlpha = document.body.dataset.theme === "dark" ? 0.055 : 0.045;
  context.font = `800 ${Math.max(30, Math.min(width * 0.085, height * 0.16, 92))}px Inter`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  drawBrandWatermark(context, padding.left + chartWidth / 2, padding.top + chartHeight / 2);
  context.restore();

  const latest = [...series].reverse().find((point) => Number.isFinite(point.priceMean)) || series.at(-1);
  context.fillStyle = colors.ink;
  context.beginPath();
  context.arc(xFor(latest.date), yFor(latest.price), 4, 0, Math.PI * 2);
  context.fill();

  const xTicks = compact ? 4 : 7;
  const shortRange = ["7", "30", "90"].includes(mvrvPriceBandsRange);
  const dateFormatter = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", {
    year: shortRange ? undefined : "numeric",
    month: "short",
    day: shortRange ? "2-digit" : undefined
  });
  context.textBaseline = "alphabetic";
  for (let index = 0; index < xTicks; index += 1) {
    const progress = index / Math.max(xTicks - 1, 1);
    const date = new Date(startTime + progress * (endTime - startTime));
    const x = padding.left + progress * chartWidth;
    context.fillStyle = colors.muted;
    context.textAlign = index === 0 ? "left" : index === xTicks - 1 ? "right" : "center";
    context.fillText(dateFormatter.format(date), x, height - 13);
  }

  mvrvPriceBandsChartState = { series, padding, chartWidth, width, height };
};

const showMvrvPriceBandsTooltip = (event) => {
  const canvas = document.querySelector("#mvrv-price-bands-chart");
  const tooltip = document.querySelector("#mvrv-price-bands-tooltip");
  if (!canvas || !tooltip || !mvrvPriceBandsChartState) return;
  const { series, padding, chartWidth, width, height } = mvrvPriceBandsChartState;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * width;
  const progress = Math.max(0, Math.min(1, (x - padding.left) / Math.max(chartWidth, 1)));
  const point = series[Math.round(progress * (series.length - 1))];
  if (!point) return;
  const date = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "2-digit", day: "2-digit" }).format(point.date);
  const band = (value) => Number.isFinite(value) ? formatUsd(value) : "WARM-UP";
  tooltip.innerHTML = `<strong>${date}</strong><span>BTC <i>${formatUsd(point.price)}</i></span><span>-1σ / -0.5σ <i>${band(point.priceMinusOne)} / ${band(point.priceMinusHalf)}</i></span><span>Mean / +1σ <i>${band(point.priceMean)} / ${band(point.pricePlusOne)}</i></span><span>+2σ <i>${band(point.pricePlusTwo)}</i></span>`;
  tooltip.hidden = false;
  const tooltipWidth = tooltip.offsetWidth || 270;
  tooltip.style.left = `${Math.max(8, Math.min(rect.width - tooltipWidth - 8, event.clientX - rect.left + 14))}px`;
  tooltip.style.top = `${Math.max(8, Math.min(height - 148, event.clientY - rect.top - 76))}px`;
};

const hideMvrvPriceBandsTooltip = () => {
  const tooltip = document.querySelector("#mvrv-price-bands-tooltip");
  if (tooltip) tooltip.hidden = true;
};

const getStockToFlowVisibleSeries = () => {
  if (!stockToFlowSeries.length || stockToFlowRange === "all") return stockToFlowSeries;
  const days = Number(stockToFlowRange);
  const end = stockToFlowSeries.at(-1).date.getTime();
  const start = end - Math.max(days - 1, 1) * 86_400_000;
  return stockToFlowSeries.filter((point) => point.date.getTime() >= start);
};

const drawStockToFlowChart = () => {
  const canvas = document.querySelector("#stock-to-flow-chart");
  const stage = canvas?.closest(".stock-to-flow-stage");
  const series = getStockToFlowVisibleSeries();
  if (!canvas || !stage || series.length < 2) {
    drawEmptyChart("#stock-to-flow-chart");
    stockToFlowChartState = null;
    return;
  }

  canvas.style.removeProperty("height");
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height || stage.clientHeight || 620, 360);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = chartColors();
  const compact = width < 700;
  const padding = { top: 30, right: compact ? 24 : 34, bottom: 44, left: compact ? 58 : 72 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const valueKeys = ["price", "minusTwo", "minusOne", "modelPrice", "plusOne", "plusTwo"];
  const values = series.flatMap((point) => valueKeys.map((key) => point[key])).filter((value) => Number.isFinite(value) && value > 0);
  if (!values.length) {
    drawEmptyChart("#stock-to-flow-chart");
    stockToFlowChartState = null;
    return;
  }

  const logMin = Math.log10(Math.min(...values)) - 0.08;
  const logMax = Math.log10(Math.max(...values)) + 0.08;
  const startTime = series[0].date.getTime();
  const endTime = series.at(-1).date.getTime();
  const xFor = (date) => padding.left + ((date.getTime() - startTime) / Math.max(endTime - startTime, 1)) * chartWidth;
  const yFor = (value) => padding.top + (1 - (Math.log10(Math.max(value, 0.0001)) - logMin) / Math.max(logMax - logMin, 0.0001)) * chartHeight;

  context.clearRect(0, 0, width, height);
  context.font = "700 10px JetBrains Mono";
  context.lineWidth = 1;
  context.textBaseline = "middle";
  const yTicks = compact ? 5 : 6;
  for (let index = 0; index < yTicks; index += 1) {
    const progress = index / Math.max(yTicks - 1, 1);
    const y = padding.top + progress * chartHeight;
    const value = 10 ** (logMax - progress * (logMax - logMin));
    context.strokeStyle = colors.line;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillStyle = colors.muted;
    context.textAlign = "right";
    context.fillText(formatAxisUsd(value), padding.left - 9, y);
  }

  const fillBand = (upperKey, lowerKey, color, alpha) => {
    context.save();
    context.fillStyle = color;
    context.globalAlpha = alpha;
    context.beginPath();
    series.forEach((point, index) => {
      const x = xFor(point.date);
      const y = yFor(point[upperKey]);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    [...series].reverse().forEach((point) => context.lineTo(xFor(point.date), yFor(point[lowerKey])));
    context.closePath();
    context.fill();
    context.restore();
  };

  fillBand("plusTwo", "minusTwo", "#526690", document.body.dataset.theme === "dark" ? 0.18 : 0.12);
  fillBand("plusOne", "minusOne", "#5d7edb", document.body.dataset.theme === "dark" ? 0.28 : 0.19);

  const drawLine = (key, color, lineWidth, opacity = 1, dash = []) => {
    context.save();
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.globalAlpha = opacity;
    context.setLineDash(dash);
    context.lineJoin = "round";
    context.lineCap = "round";
    context.beginPath();
    series.forEach((point, index) => {
      const x = xFor(point.date);
      const y = yFor(point[key]);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
    context.restore();
  };

  drawLine("minusTwo", "#394764", 1.1, 0.75);
  drawLine("minusOne", "#5d7edb", 1.35, 0.9);
  drawLine("plusOne", "#5d7edb", 1.35, 0.9);
  drawLine("plusTwo", "#394764", 1.1, 0.75);
  drawLine("modelPrice", "#86a7ff", 2.2, 1);
  drawLine("price", colors.orange, 2.2, 1);

  const visibleHalvings = stockToFlowHalvings.filter((halving) => {
    const timestamp = Date.parse(`${halving.date}T00:00:00Z`);
    return timestamp >= startTime && timestamp <= endTime;
  });
  visibleHalvings.forEach((halving) => {
    const date = new Date(`${halving.date}T00:00:00Z`);
    const x = xFor(date);
    context.save();
    context.strokeStyle = colors.muted;
    context.globalAlpha = 0.7;
    context.setLineDash([5, 5]);
    context.beginPath();
    context.moveTo(x, padding.top);
    context.lineTo(x, height - padding.bottom);
    context.stroke();
    context.translate(x - 7, height - padding.bottom - 8);
    context.rotate(-Math.PI / 2);
    context.fillStyle = colors.muted;
    context.textAlign = "left";
    context.fillText(`${halving.epoch || ""} HALVING`, 0, 0);
    context.restore();
  });

  context.save();
  context.fillStyle = colors.ink;
  context.globalAlpha = document.body.dataset.theme === "dark" ? 0.055 : 0.045;
  context.font = `800 ${Math.max(30, Math.min(width * 0.085, height * 0.16, 92))}px Inter`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  drawBrandWatermark(context, padding.left + chartWidth / 2, padding.top + chartHeight / 2);
  context.restore();

  const latest = series.at(-1);
  context.fillStyle = colors.orange;
  context.beginPath();
  context.arc(xFor(latest.date), yFor(latest.price), 4, 0, Math.PI * 2);
  context.fill();

  const xTicks = compact ? 4 : 7;
  const shortRange = ["7", "30", "90"].includes(stockToFlowRange);
  const dateFormatter = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", {
    year: shortRange ? undefined : "numeric",
    month: "short",
    day: shortRange ? "2-digit" : undefined
  });
  context.textBaseline = "alphabetic";
  for (let index = 0; index < xTicks; index += 1) {
    const progress = index / Math.max(xTicks - 1, 1);
    const date = new Date(startTime + progress * (endTime - startTime));
    const x = padding.left + progress * chartWidth;
    context.fillStyle = colors.muted;
    context.textAlign = index === 0 ? "left" : index === xTicks - 1 ? "right" : "center";
    context.fillText(dateFormatter.format(date), x, height - 13);
  }

  stockToFlowChartState = { series, padding, chartWidth, width, height };
};

const showStockToFlowTooltip = (event) => {
  const canvas = document.querySelector("#stock-to-flow-chart");
  const tooltip = document.querySelector("#stock-to-flow-tooltip");
  if (!canvas || !tooltip || !stockToFlowChartState) return;
  const { series, padding, chartWidth, width, height } = stockToFlowChartState;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * width;
  const progress = Math.max(0, Math.min(1, (x - padding.left) / Math.max(chartWidth, 1)));
  const point = series[Math.round(progress * (series.length - 1))];
  if (!point) return;
  const date = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "2-digit", day: "2-digit" }).format(point.date);
  tooltip.innerHTML = `<strong>${date}</strong><span>BTC <i>${formatUsd(point.price)}</i></span><span>S2F / MODEL <i>${point.stockToFlow.toFixed(2)} / ${formatUsd(point.modelPrice)}</i></span><span>-2σ / -1σ <i>${formatUsd(point.minusTwo)} / ${formatUsd(point.minusOne)}</i></span><span>LOG DEVIATION <i>${(point.logDeviation * 100).toFixed(1)}%</i></span>`;
  tooltip.hidden = false;
  const tooltipWidth = tooltip.offsetWidth || 275;
  tooltip.style.left = `${Math.max(8, Math.min(rect.width - tooltipWidth - 8, event.clientX - rect.left + 14))}px`;
  tooltip.style.top = `${Math.max(8, Math.min(height - 148, event.clientY - rect.top - 76))}px`;
};

const hideStockToFlowTooltip = () => {
  const tooltip = document.querySelector("#stock-to-flow-tooltip");
  if (tooltip) tooltip.hidden = true;
};

const getCycleTimingVisibleSeries = () => {
  if (!cycleTimingSeries.length || cycleTimingRange === "all") return cycleTimingSeries;
  const days = Number(cycleTimingRange);
  const end = cycleTimingSeries.at(-1).date.getTime();
  const start = end - Math.max(days - 1, 1) * 86_400_000;
  return cycleTimingSeries.filter((point) => point.date.getTime() >= start);
};

const getActiveCycleTimingMode = () => cycleTimingModes[cycleTimingMode] || null;

const drawCycleTimingChart = () => {
  const canvas = document.querySelector("#cycle-timing-chart");
  const stage = canvas?.closest(".cycle-timing-stage");
  const series = getCycleTimingVisibleSeries();
  const mode = getActiveCycleTimingMode();
  const futureNodes = Array.isArray(cycleTimingFutureCycle?.nodes) ? cycleTimingFutureCycle.nodes : [];
  if (!canvas || !stage || series.length < 2 || !mode) {
    drawEmptyChart("#cycle-timing-chart");
    cycleTimingChartState = null;
    return;
  }

  canvas.style.removeProperty("height");
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height || stage.clientHeight || 620, 360);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = chartColors();
  const compact = width < 700;
  const padding = { top: compact ? 42 : 72, right: compact ? 24 : 34, bottom: 44, left: compact ? 58 : 72 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const values = series.map((point) => point.price).filter((value) => Number.isFinite(value) && value > 0);
  const logMin = Math.log10(Math.min(...values)) - 0.1;
  const logMax = Math.log10(Math.max(...values)) + 0.1;
  const startTime = series[0].date.getTime();
  const projectionTime = Date.parse(`${mode.projection.projectedDate}T00:00:00Z`);
  const dataEndTime = series.at(-1).date.getTime();
  const futureEndTime = futureNodes.reduce((latest, node) => {
    const candidate = Date.parse(`${node.windowEnd || node.alternateDate || node.date}T00:00:00Z`);
    return Number.isFinite(candidate) ? Math.max(latest, candidate) : latest;
  }, dataEndTime);
  const endTime = cycleTimingRange === "all" ? Math.max(dataEndTime, projectionTime, futureEndTime) : dataEndTime;
  const xFor = (value) => padding.left + ((value.getTime() - startTime) / Math.max(endTime - startTime, 1)) * chartWidth;
  const yFor = (value) => padding.top + (1 - (Math.log10(Math.max(value, 0.0001)) - logMin) / Math.max(logMax - logMin, 0.0001)) * chartHeight;

  context.clearRect(0, 0, width, height);
  context.font = "700 10px JetBrains Mono";
  context.lineWidth = 1;
  context.textBaseline = "middle";
  const yTicks = compact ? 5 : 6;
  for (let index = 0; index < yTicks; index += 1) {
    const progress = index / Math.max(yTicks - 1, 1);
    const y = padding.top + progress * chartHeight;
    const value = 10 ** (logMax - progress * (logMax - logMin));
    context.strokeStyle = colors.line;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillStyle = colors.muted;
    context.textAlign = "right";
    context.fillText(formatAxisUsd(value), padding.left - 9, y);
  }

  context.save();
  context.strokeStyle = colors.ink;
  context.lineWidth = 2;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.beginPath();
  series.forEach((point, index) => {
    const x = xFor(point.date);
    const y = yFor(point.price);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();
  context.restore();

  const visibleStart = startTime;
  const visibleEnd = endTime;
  const events = mode.cycles.map((cycle) => ({ ...cycle, projection: false }));
  if (cycleTimingRange === "all") {
    events.push({
      label: currentLanguage === "zh" ? "当前推演" : "Current Projection",
      start: mode.projection.start,
      end: mode.projection.projectedDate,
      days: mode.projection.days,
      projection: true
    });
  }
  events.forEach((cycle, eventIndex) => {
    const startDate = new Date(`${cycle.start}T00:00:00Z`);
    const endDate = new Date(`${cycle.end}T00:00:00Z`);
    const startValue = startDate.getTime();
    const endValue = endDate.getTime();
    if (endValue < visibleStart || startValue > visibleEnd) return;
    const startX = xFor(startDate);
    const endX = xFor(endDate);
    const markerTop = padding.top;
    const markerBottom = height - padding.bottom;
    const drawMarker = (x, color, dash) => {
      context.save();
      context.strokeStyle = color;
      context.globalAlpha = cycle.projection ? 0.95 : 0.72;
      context.setLineDash(dash);
      context.beginPath();
      context.moveTo(x, markerTop);
      context.lineTo(x, markerBottom);
      context.stroke();
      context.restore();
    };
    drawMarker(startX, colors.red, [5, 5]);
    drawMarker(endX, cycle.projection ? colors.cyan : "#6f93ff", cycle.projection ? [3, 4] : [5, 5]);

    if (width > 560 && startX >= padding.left - 1 && endX <= width - padding.right + 1) {
      const arrowY = compact ? 23 + eventIndex * 8 : 28 + (eventIndex % 2) * 22;
      context.save();
      context.strokeStyle = cycle.projection ? colors.cyan : colors.ink;
      context.fillStyle = cycle.projection ? colors.cyan : colors.ink;
      context.globalAlpha = cycle.projection ? 1 : 0.8;
      context.lineWidth = 1.2;
      context.beginPath();
      context.moveTo(startX + 3, arrowY);
      context.lineTo(endX - 3, arrowY);
      context.stroke();
      context.beginPath();
      context.moveTo(startX + 3, arrowY);
      context.lineTo(startX + 9, arrowY - 4);
      context.lineTo(startX + 9, arrowY + 4);
      context.closePath();
      context.fill();
      context.beginPath();
      context.moveTo(endX - 3, arrowY);
      context.lineTo(endX - 9, arrowY - 4);
      context.lineTo(endX - 9, arrowY + 4);
      context.closePath();
      context.fill();
      context.textAlign = "center";
      context.font = "800 10px JetBrains Mono";
      context.fillText(`${cycle.days}D`, (startX + endX) / 2, arrowY - 10);
      context.restore();
    }
  });

  if (cycleTimingRange === "all") {
    const futureColors = { halving: colors.cyan, top: colors.orange, bottom: colors.red };
    futureNodes.forEach((node, nodeIndex) => {
      const primaryTime = Date.parse(`${node.date}T00:00:00Z`);
      const windowStartTime = Date.parse(`${node.windowStart || node.date}T00:00:00Z`);
      const windowEndTime = Date.parse(`${node.windowEnd || node.date}T00:00:00Z`);
      if (![primaryTime, windowStartTime, windowEndTime].every(Number.isFinite)) return;
      const color = futureColors[node.kind] || colors.cyan;
      const startX = xFor(new Date(windowStartTime));
      const endX = xFor(new Date(windowEndTime));
      const primaryX = xFor(new Date(primaryTime));

      if (windowEndTime > windowStartTime) {
        context.save();
        context.fillStyle = color;
        context.globalAlpha = document.body.dataset.theme === "dark" ? 0.075 : 0.055;
        context.fillRect(Math.min(startX, endX), padding.top, Math.max(2, Math.abs(endX - startX)), chartHeight);
        context.restore();
      }

      context.save();
      context.strokeStyle = color;
      context.lineWidth = 1.5;
      context.globalAlpha = 0.95;
      context.setLineDash(node.kind === "halving" ? [8, 5] : [4, 4]);
      context.beginPath();
      context.moveTo(primaryX, padding.top);
      context.lineTo(primaryX, height - padding.bottom);
      context.stroke();
      if (windowEndTime > windowStartTime && Math.abs(endX - primaryX) > 2) {
        context.globalAlpha = 0.5;
        context.beginPath();
        context.moveTo(endX, padding.top);
        context.lineTo(endX, height - padding.bottom);
        context.stroke();
      }

      const label = currentLanguage === "zh" ? node.labelZh : node.labelEn;
      const labelY = padding.top + 12 + nodeIndex * (compact ? 23 : 25);
      const labelX = Math.max(padding.left + 4, Math.min(width - padding.right - 4, primaryX + 7));
      context.fillStyle = color;
      context.globalAlpha = 1;
      context.font = `800 ${compact ? 8 : 9}px JetBrains Mono`;
      context.textAlign = labelX > width - padding.right - 130 ? "right" : "left";
      const renderedLabel = compact ? `${label} · ${node.date.slice(0, 7)}` : `${label} · ${node.date}`;
      context.fillText(renderedLabel, labelX, labelY);
      context.restore();
    });
  }

  context.save();
  context.fillStyle = colors.ink;
  context.globalAlpha = document.body.dataset.theme === "dark" ? 0.055 : 0.045;
  context.font = `800 ${Math.max(30, Math.min(width * 0.085, height * 0.16, 92))}px Inter`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  drawBrandWatermark(context, padding.left + chartWidth / 2, padding.top + chartHeight / 2);
  context.restore();

  const latest = series.at(-1);
  context.fillStyle = colors.green;
  context.beginPath();
  context.arc(xFor(latest.date), yFor(latest.price), 4, 0, Math.PI * 2);
  context.fill();

  const xTicks = compact ? 4 : 7;
  const shortRange = ["7", "30", "90"].includes(cycleTimingRange);
  const dateFormatter = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", {
    year: shortRange ? undefined : "numeric",
    month: "short",
    day: shortRange ? "2-digit" : undefined
  });
  context.textBaseline = "alphabetic";
  for (let index = 0; index < xTicks; index += 1) {
    const progress = index / Math.max(xTicks - 1, 1);
    const date = new Date(startTime + progress * (endTime - startTime));
    const x = padding.left + progress * chartWidth;
    context.fillStyle = colors.muted;
    context.textAlign = index === 0 ? "left" : index === xTicks - 1 ? "right" : "center";
    context.fillText(dateFormatter.format(date), x, height - 13);
  }

  cycleTimingChartState = { series, padding, chartWidth, width, height, startTime, endTime, dataEndTime };
};

const showCycleTimingTooltip = (event) => {
  const canvas = document.querySelector("#cycle-timing-chart");
  const tooltip = document.querySelector("#cycle-timing-tooltip");
  if (!canvas || !tooltip || !cycleTimingChartState) return;
  const { series, padding, chartWidth, width, height, startTime, endTime, dataEndTime } = cycleTimingChartState;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * width;
  const progress = Math.max(0, Math.min(1, (x - padding.left) / Math.max(chartWidth, 1)));
  const hoveredTime = startTime + progress * Math.max(endTime - startTime, 1);
  if (hoveredTime > dataEndTime + 86_400_000) {
    hideCycleTimingTooltip();
    return;
  }
  const dataProgress = Math.max(0, Math.min(1, (hoveredTime - startTime) / Math.max(dataEndTime - startTime, 1)));
  const point = series[Math.round(dataProgress * (series.length - 1))];
  const mode = getActiveCycleTimingMode();
  if (!point || !mode) return;
  const date = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "2-digit", day: "2-digit" }).format(point.date);
  tooltip.innerHTML = `<strong>${date}</strong><span>BTC <i>${formatUsd(point.price)}</i></span><span>${currentLanguage === "zh" ? mode.shortZh : mode.shortEn} <i>${mode.projection.days}D</i></span><span>${currentLanguage === "zh" ? "推演窗口" : "Projected Window"} <i>${mode.projection.projectedDate}</i></span>`;
  tooltip.hidden = false;
  const tooltipWidth = tooltip.offsetWidth || 260;
  tooltip.style.left = `${Math.max(8, Math.min(rect.width - tooltipWidth - 8, event.clientX - rect.left + 14))}px`;
  tooltip.style.top = `${Math.max(8, Math.min(height - 130, event.clientY - rect.top - 70))}px`;
};

const hideCycleTimingTooltip = () => {
  const tooltip = document.querySelector("#cycle-timing-tooltip");
  if (tooltip) tooltip.hidden = true;
};

const getRhodlVisibleSeries = () => {
  if (!rhodlSeries.length || rhodlRange === "all") return rhodlSeries;
  const days = Number(rhodlRange);
  const end = rhodlSeries.at(-1).date.getTime();
  const start = end - Math.max(days - 1, 1) * 86_400_000;
  return rhodlSeries.filter((point) => point.date.getTime() >= start);
};

const drawRhodlChart = () => {
  const canvas = document.querySelector("#rhodl-chart");
  const stage = canvas?.closest(".rhodl-stage");
  const series = getRhodlVisibleSeries();
  if (!canvas || !stage || series.length < 2) {
    drawEmptyChart("#rhodl-chart");
    rhodlChartState = null;
    return;
  }

  canvas.style.removeProperty("height");
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height || stage.clientHeight || 620, 360);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = chartColors();
  const compact = width < 700;
  const padding = { top: 30, right: compact ? 58 : 78, bottom: 44, left: compact ? 58 : 72 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const values = series.map((point) => point.rhodl).filter((value) => Number.isFinite(value) && value > 0);
  const prices = series.map((point) => point.price).filter((value) => Number.isFinite(value) && value > 0);
  const rhodlMin = Math.max(10, Math.min(...values, 350) * 0.72);
  const rhodlMax = Math.max(rhodlRange === "all" ? 10_000 : 1_000, Math.max(...values) * 1.18);
  const rhodlLogMin = Math.log10(rhodlMin);
  const rhodlLogMax = Math.log10(rhodlMax);
  const priceLogMin = Math.log10(Math.min(...prices)) - 0.06;
  const priceLogMax = Math.log10(Math.max(...prices)) + 0.06;
  const startTime = series[0].date.getTime();
  const endTime = series.at(-1).date.getTime();
  const xFor = (date) => padding.left + ((date.getTime() - startTime) / Math.max(endTime - startTime, 1)) * chartWidth;
  const rhodlY = (value) => padding.top + (1 - (Math.log10(Math.max(value, rhodlMin)) - rhodlLogMin) / Math.max(rhodlLogMax - rhodlLogMin, 0.0001)) * chartHeight;
  const priceY = (value) => padding.top + (1 - (Math.log10(Math.max(value, 0.0001)) - priceLogMin) / Math.max(priceLogMax - priceLogMin, 0.0001)) * chartHeight;

  context.clearRect(0, 0, width, height);
  context.font = "700 10px JetBrains Mono";
  context.lineWidth = 1;
  context.textBaseline = "middle";

  const accumulationY = rhodlY(350);
  context.save();
  context.fillStyle = colors.green;
  context.globalAlpha = document.body.dataset.theme === "dark" ? 0.08 : 0.055;
  context.fillRect(padding.left, Math.max(padding.top, accumulationY), chartWidth, Math.max(0, padding.top + chartHeight - accumulationY));
  context.restore();

  const yTicks = compact ? 5 : 7;
  for (let index = 0; index < yTicks; index += 1) {
    const progress = index / Math.max(yTicks - 1, 1);
    const y = padding.top + progress * chartHeight;
    const rhodlValue = 10 ** (rhodlLogMax - progress * (rhodlLogMax - rhodlLogMin));
    const priceValue = 10 ** (priceLogMax - progress * (priceLogMax - priceLogMin));
    context.strokeStyle = colors.line;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillStyle = colors.orange;
    context.textAlign = "right";
    context.fillText(rhodlValue >= 1000 ? `${(rhodlValue / 1000).toFixed(rhodlValue >= 10_000 ? 0 : 1)}K` : Math.round(rhodlValue).toLocaleString("en-US"), padding.left - 8, y);
    context.fillStyle = colors.muted;
    context.textAlign = "left";
    context.fillText(formatAxisUsd(priceValue), width - padding.right + 8, y);
  }

  const drawSeries = (valueFor, yFor, color, widthValue, dash = [], alpha = 1) => {
    context.save();
    context.strokeStyle = color;
    context.lineWidth = widthValue;
    context.globalAlpha = alpha;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.setLineDash(dash);
    context.beginPath();
    let started = false;
    series.forEach((point) => {
      const value = valueFor(point);
      if (!Number.isFinite(value) || value <= 0) return;
      const x = xFor(point.date);
      const y = yFor(value);
      if (!started) {
        context.moveTo(x, y);
        started = true;
      } else context.lineTo(x, y);
    });
    context.stroke();
    context.restore();
  };

  drawSeries((point) => point.price, priceY, colors.ink, 1.7, [], 0.84);
  drawSeries((point) => point.rhodl1m, rhodlY, colors.cyan, 1.3, [7, 5], 0.8);
  drawSeries((point) => point.rhodl, rhodlY, colors.orange, 2.1);

  context.save();
  context.strokeStyle = colors.green;
  context.lineWidth = 1.2;
  context.setLineDash([7, 6]);
  context.beginPath();
  context.moveTo(padding.left, accumulationY);
  context.lineTo(width - padding.right, accumulationY);
  context.stroke();
  context.fillStyle = colors.green;
  context.textAlign = "right";
  context.fillText("350 ACCUMULATION", width - padding.right - 5, accumulationY - 9);
  context.restore();

  context.save();
  context.fillStyle = colors.ink;
  context.globalAlpha = document.body.dataset.theme === "dark" ? 0.055 : 0.042;
  context.font = `800 ${Math.max(30, Math.min(width * 0.085, height * 0.16, 92))}px Inter`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  drawBrandWatermark(context, padding.left + chartWidth / 2, padding.top + chartHeight / 2);
  context.restore();

  const latest = series.at(-1);
  context.fillStyle = colors.orange;
  context.beginPath();
  context.arc(xFor(latest.date), rhodlY(latest.rhodl), 4.5, 0, Math.PI * 2);
  context.fill();

  const xTicks = compact ? 4 : 7;
  const shortRange = ["7", "30", "90"].includes(rhodlRange);
  const dateFormatter = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", {
    year: shortRange ? undefined : "numeric",
    month: "short",
    day: shortRange ? "2-digit" : undefined
  });
  context.textBaseline = "alphabetic";
  for (let index = 0; index < xTicks; index += 1) {
    const progress = index / Math.max(xTicks - 1, 1);
    const date = new Date(startTime + progress * (endTime - startTime));
    const x = padding.left + progress * chartWidth;
    context.fillStyle = colors.muted;
    context.textAlign = index === 0 ? "left" : index === xTicks - 1 ? "right" : "center";
    context.fillText(dateFormatter.format(date), x, height - 13);
  }

  rhodlChartState = { series, padding, chartWidth, width, height };
};

const showRhodlTooltip = (event) => {
  const canvas = document.querySelector("#rhodl-chart");
  const tooltip = document.querySelector("#rhodl-tooltip");
  if (!canvas || !tooltip || !rhodlChartState) return;
  const { series, padding, chartWidth, width, height } = rhodlChartState;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * width;
  const progress = Math.max(0, Math.min(1, (x - padding.left) / Math.max(chartWidth, 1)));
  const point = series[Math.round(progress * (series.length - 1))];
  if (!point) return;
  const date = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "2-digit", day: "2-digit" }).format(point.date);
  tooltip.innerHTML = `<strong>${date}</strong><span>BTC <i>${formatUsd(point.price)}</i></span><span>RHODL <i>${Math.round(point.rhodl).toLocaleString("en-US")}</i></span><span>30D MA <i>${Number(point.rhodl1m || 0).toFixed(0)}</i></span>`;
  tooltip.hidden = false;
  const tooltipWidth = tooltip.offsetWidth || 230;
  tooltip.style.left = `${Math.max(8, Math.min(rect.width - tooltipWidth - 8, event.clientX - rect.left + 14))}px`;
  tooltip.style.top = `${Math.max(8, Math.min(height - 126, event.clientY - rect.top - 72))}px`;
};

const hideRhodlTooltip = () => {
  const tooltip = document.querySelector("#rhodl-tooltip");
  if (tooltip) tooltip.hidden = true;
};

const getLthRplVisibleSeries = () => {
  if (!lthRplSeries.length || lthRplRange === "all") return lthRplSeries;
  const days = Number(lthRplRange);
  const end = lthRplSeries.at(-1).date.getTime();
  const start = end - Math.max(days - 1, 1) * 86_400_000;
  return lthRplSeries.filter((point) => point.date.getTime() >= start);
};

const drawLthRplChart = () => {
  const canvas = document.querySelector("#lth-rpl-chart");
  const stage = canvas?.closest(".lth-rpl-stage");
  const series = getLthRplVisibleSeries();
  if (!canvas || !stage || series.length < 2) {
    drawEmptyChart("#lth-rpl-chart");
    lthRplChartState = null;
    return;
  }

  canvas.style.removeProperty("height");
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height || stage.clientHeight || 620, 420);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = chartColors();
  const compact = width < 700;
  const padding = { top: 26, right: compact ? 60 : 78, bottom: 44, left: compact ? 58 : 74 };
  const chartWidth = width - padding.left - padding.right;
  const availableHeight = height - padding.top - padding.bottom;
  const gap = 28;
  const priceHeight = availableHeight * 0.42;
  const ratioTop = padding.top + priceHeight + gap;
  const ratioHeight = availableHeight - priceHeight - gap;
  const startTime = series[0].date.getTime();
  const endTime = series.at(-1).date.getTime();
  const xFor = (date) => padding.left + ((date.getTime() - startTime) / Math.max(endTime - startTime, 1)) * chartWidth;
  const prices = series.map((point) => point.price).filter((value) => Number.isFinite(value) && value > 0);
  const ratios = series.flatMap((point) => [point.rawRatio, point.ratio, point.average30]).filter((value) => Number.isFinite(value) && value > 0);
  const priceLogMin = Math.log10(Math.min(...prices)) - 0.06;
  const priceLogMax = Math.log10(Math.max(...prices)) + 0.06;
  const ratioMin = lthRplRange === "all" ? 0.1 : Math.max(0.05, Math.min(...ratios, 1) * 0.72);
  const ratioMax = lthRplRange === "all" ? 1_000_000_000 : Math.max(2, Math.max(...ratios) * 1.15);
  const ratioLogMin = Math.log10(ratioMin);
  const ratioLogMax = Math.log10(ratioMax);
  const priceY = (value) => padding.top + (1 - (Math.log10(Math.max(value, 0.0001)) - priceLogMin) / Math.max(priceLogMax - priceLogMin, 0.0001)) * priceHeight;
  const ratioY = (value) => {
    const bounded = Math.min(ratioMax, Math.max(value, ratioMin));
    return ratioTop + (1 - (Math.log10(bounded) - ratioLogMin) / Math.max(ratioLogMax - ratioLogMin, 0.0001)) * ratioHeight;
  };

  context.clearRect(0, 0, width, height);
  context.font = "700 10px JetBrains Mono";
  context.lineWidth = 1;
  context.textBaseline = "middle";

  let zoneStart = null;
  series.forEach((point, index) => {
    if (point.ratio < 1 && zoneStart === null) zoneStart = index;
    const closes = zoneStart !== null && (point.ratio >= 1 || index === series.length - 1);
    if (!closes) return;
    const endIndex = point.ratio >= 1 ? Math.max(zoneStart, index - 1) : index;
    const x = xFor(series[zoneStart].date);
    const zoneEndX = xFor(series[endIndex].date);
    context.save();
    context.fillStyle = colors.red;
    context.globalAlpha = document.body.dataset.theme === "dark" ? 0.13 : 0.09;
    context.fillRect(x, padding.top, Math.max(2, zoneEndX - x), availableHeight);
    context.restore();
    zoneStart = null;
  });

  const grid = (top, panelHeight, tickCount, valueFor, formatter, side = "left") => {
    for (let index = 0; index < tickCount; index += 1) {
      const progress = index / Math.max(tickCount - 1, 1);
      const y = top + progress * panelHeight;
      context.strokeStyle = colors.line;
      context.beginPath();
      context.moveTo(padding.left, y);
      context.lineTo(width - padding.right, y);
      context.stroke();
      context.fillStyle = colors.muted;
      context.textAlign = side === "left" ? "right" : "left";
      context.fillText(formatter(valueFor(progress)), side === "left" ? padding.left - 8 : width - padding.right + 8, y);
    }
  };
  grid(padding.top, priceHeight, compact ? 3 : 4, (progress) => 10 ** (priceLogMax - progress * (priceLogMax - priceLogMin)), formatAxisUsd, "right");
  grid(ratioTop, ratioHeight, compact ? 4 : 6, (progress) => 10 ** (ratioLogMax - progress * (ratioLogMax - ratioLogMin)), (value) => value >= 1_000_000 ? `${(value / 1_000_000).toFixed(0)}M` : value >= 1_000 ? `${(value / 1_000).toFixed(0)}K` : value >= 10 ? value.toFixed(0) : value.toFixed(value < 1 ? 2 : 1), "left");

  const drawSeries = (valueFor, yFor, color, lineWidth, dash = [], alpha = 1) => {
    context.save();
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.globalAlpha = alpha;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.setLineDash(dash);
    context.beginPath();
    let started = false;
    series.forEach((point) => {
      const value = valueFor(point);
      if (!Number.isFinite(value) || value <= 0) return;
      const x = xFor(point.date);
      const y = yFor(value);
      if (!started) { context.moveTo(x, y); started = true; } else context.lineTo(x, y);
    });
    context.stroke();
    context.restore();
  };

  drawSeries((point) => point.price, priceY, colors.ink, 1.8, [], 0.88);
  drawSeries((point) => point.rawRatio, ratioY, colors.orange, 1, [], 0.32);
  drawSeries((point) => point.ratio, ratioY, colors.orange, 2.05);
  drawSeries((point) => point.average30, ratioY, colors.cyan, 1.45, [7, 5], 0.88);

  const pivotY = ratioY(1);
  context.save();
  context.strokeStyle = colors.red;
  context.lineWidth = 1.2;
  context.setLineDash([7, 6]);
  context.beginPath();
  context.moveTo(padding.left, pivotY);
  context.lineTo(width - padding.right, pivotY);
  context.stroke();
  context.fillStyle = colors.red;
  context.textAlign = "right";
  context.fillText("1.0 PIVOT", width - padding.right - 5, pivotY - 9);
  context.restore();

  context.save();
  context.fillStyle = colors.ink;
  context.globalAlpha = document.body.dataset.theme === "dark" ? 0.055 : 0.04;
  context.font = `800 ${Math.max(30, Math.min(width * 0.08, height * 0.13, 84))}px Inter`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  drawBrandWatermark(context, padding.left + chartWidth / 2, padding.top + availableHeight / 2);
  context.restore();

  const latest = series.at(-1);
  context.fillStyle = colors.orange;
  context.beginPath();
  context.arc(xFor(latest.date), ratioY(latest.ratio), 4.5, 0, Math.PI * 2);
  context.fill();

  const xTicks = compact ? 4 : 7;
  const shortRange = ["7", "30", "90"].includes(lthRplRange);
  const dateFormatter = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", { year: shortRange ? undefined : "numeric", month: "short", day: shortRange ? "2-digit" : undefined });
  context.textBaseline = "alphabetic";
  for (let index = 0; index < xTicks; index += 1) {
    const progress = index / Math.max(xTicks - 1, 1);
    const date = new Date(startTime + progress * (endTime - startTime));
    const x = padding.left + progress * chartWidth;
    context.fillStyle = colors.muted;
    context.textAlign = index === 0 ? "left" : index === xTicks - 1 ? "right" : "center";
    context.fillText(dateFormatter.format(date), x, height - 13);
  }
  lthRplChartState = { series, padding, chartWidth, width, height };
};

const showLthRplTooltip = (event) => {
  const canvas = document.querySelector("#lth-rpl-chart");
  const tooltip = document.querySelector("#lth-rpl-tooltip");
  if (!canvas || !tooltip || !lthRplChartState) return;
  const { series, padding, chartWidth, width, height } = lthRplChartState;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * width;
  const progress = Math.max(0, Math.min(1, (x - padding.left) / Math.max(chartWidth, 1)));
  const point = series[Math.round(progress * (series.length - 1))];
  if (!point) return;
  const date = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "2-digit", day: "2-digit" }).format(point.date);
  tooltip.innerHTML = `<strong>${date}</strong><span>BTC <i>${formatUsd(point.price)}</i></span><span>LTH P/L · 7D <i>${point.ratio.toFixed(3)}</i></span><span>Raw / 30D <i>${point.rawRatio.toFixed(3)} / ${point.average30.toFixed(3)}</i></span>`;
  tooltip.hidden = false;
  const tooltipWidth = tooltip.offsetWidth || 240;
  tooltip.style.left = `${Math.max(8, Math.min(rect.width - tooltipWidth - 8, event.clientX - rect.left + 14))}px`;
  tooltip.style.top = `${Math.max(8, Math.min(height - 126, event.clientY - rect.top - 72))}px`;
};

const hideLthRplTooltip = () => {
  const tooltip = document.querySelector("#lth-rpl-tooltip");
  if (tooltip) tooltip.hidden = true;
};

const getSlrvVisibleSeries = () => {
  if (!slrvSeries.length || slrvRange === "all") return slrvSeries;
  const days = Number(slrvRange);
  const end = slrvSeries.at(-1).date.getTime();
  const start = end - Math.max(days - 1, 1) * 86_400_000;
  return slrvSeries.filter((point) => point.date.getTime() >= start);
};

const drawSlrvChart = () => {
  const canvas = document.querySelector("#slrv-chart");
  const stage = canvas?.closest(".slrv-stage");
  const series = getSlrvVisibleSeries();
  if (!canvas || !stage || series.length < 2) {
    drawEmptyChart("#slrv-chart");
    slrvChartState = null;
    return;
  }

  canvas.style.removeProperty("height");
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height || stage.clientHeight || 620, 360);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = chartColors();
  const compact = width < 700;
  const padding = { top: 30, right: compact ? 60 : 78, bottom: 44, left: compact ? 58 : 68 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const values = series.flatMap((point) => [point.slrv, point.average30]).filter((value) => Number.isFinite(value) && value > 0).sort((left, right) => left - right);
  const prices = series.map((point) => point.price).filter((value) => Number.isFinite(value) && value > 0);
  const percentile = values[Math.min(values.length - 1, Math.floor(values.length * 0.995))] || 3;
  const ratioMin = slrvRange === "all" ? 0.015 : Math.max(0.005, Math.min(...values) * 0.72);
  const ratioMax = slrvRange === "all" ? Math.max(3.5, Math.min(80, percentile * 1.2)) : Math.max(0.2, Math.max(...values) * 1.18);
  const ratioLogMin = Math.log10(ratioMin);
  const ratioLogMax = Math.log10(ratioMax);
  const priceLogMin = Math.log10(Math.min(...prices)) - 0.06;
  const priceLogMax = Math.log10(Math.max(...prices)) + 0.06;
  const startTime = series[0].date.getTime();
  const endTime = series.at(-1).date.getTime();
  const xFor = (date) => padding.left + ((date.getTime() - startTime) / Math.max(endTime - startTime, 1)) * chartWidth;
  const ratioY = (value) => padding.top + (1 - (Math.log10(Math.max(value, ratioMin)) - ratioLogMin) / Math.max(ratioLogMax - ratioLogMin, 0.0001)) * chartHeight;
  const priceY = (value) => padding.top + (1 - (Math.log10(Math.max(value, 0.0001)) - priceLogMin) / Math.max(priceLogMax - priceLogMin, 0.0001)) * chartHeight;

  context.clearRect(0, 0, width, height);
  context.font = "700 10px JetBrains Mono";
  context.lineWidth = 1;
  context.textBaseline = "middle";

  const lowTop = ratioY(0.05);
  context.save();
  context.fillStyle = "#ee7ba9";
  context.globalAlpha = document.body.dataset.theme === "dark" ? 0.12 : 0.09;
  context.fillRect(padding.left, Math.max(padding.top, lowTop), chartWidth, Math.max(0, padding.top + chartHeight - lowTop));
  context.restore();

  const yTicks = compact ? 5 : 7;
  for (let index = 0; index < yTicks; index += 1) {
    const progress = index / Math.max(yTicks - 1, 1);
    const y = padding.top + progress * chartHeight;
    const ratioValue = 10 ** (ratioLogMax - progress * (ratioLogMax - ratioLogMin));
    const priceValue = 10 ** (priceLogMax - progress * (priceLogMax - priceLogMin));
    context.strokeStyle = colors.line;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillStyle = colors.orange;
    context.textAlign = "right";
    context.fillText(ratioValue >= 10 ? ratioValue.toFixed(0) : ratioValue >= 1 ? ratioValue.toFixed(1) : ratioValue.toFixed(2), padding.left - 8, y);
    context.fillStyle = colors.muted;
    context.textAlign = "left";
    context.fillText(formatAxisUsd(priceValue), width - padding.right + 8, y);
  }

  const drawSeries = (valueFor, yFor, color, lineWidth, dash = [], alpha = 1) => {
    context.save();
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.globalAlpha = alpha;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.setLineDash(dash);
    context.beginPath();
    let started = false;
    series.forEach((point) => {
      const value = valueFor(point);
      if (!Number.isFinite(value) || value <= 0) return;
      const x = xFor(point.date);
      const y = yFor(value);
      if (!started) { context.moveTo(x, y); started = true; } else context.lineTo(x, y);
    });
    context.stroke();
    context.restore();
  };

  drawSeries((point) => point.price, priceY, colors.ink, 1.75, [], 0.88);
  drawSeries((point) => point.average30, ratioY, colors.cyan, 1.35, [7, 5], 0.82);
  drawSeries((point) => point.slrv, ratioY, colors.orange, 2.15);

  context.save();
  context.strokeStyle = "#ee7ba9";
  context.lineWidth = 1.2;
  context.setLineDash([7, 6]);
  context.beginPath();
  context.moveTo(padding.left, lowTop);
  context.lineTo(width - padding.right, lowTop);
  context.stroke();
  context.fillStyle = "#ee7ba9";
  context.textAlign = "right";
  context.fillText("0.05 BOTTOM ZONE", width - padding.right - 5, lowTop - 9);
  context.restore();

  context.save();
  context.fillStyle = colors.ink;
  context.globalAlpha = document.body.dataset.theme === "dark" ? 0.055 : 0.04;
  context.font = `800 ${Math.max(30, Math.min(width * 0.085, height * 0.16, 92))}px Inter`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  drawBrandWatermark(context, padding.left + chartWidth / 2, padding.top + chartHeight / 2);
  context.restore();

  const latest = series.at(-1);
  context.fillStyle = colors.orange;
  context.beginPath();
  context.arc(xFor(latest.date), ratioY(latest.slrv), 4.5, 0, Math.PI * 2);
  context.fill();

  const xTicks = compact ? 4 : 7;
  const shortRange = ["7", "30", "90"].includes(slrvRange);
  const dateFormatter = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", { year: shortRange ? undefined : "numeric", month: "short", day: shortRange ? "2-digit" : undefined });
  context.textBaseline = "alphabetic";
  for (let index = 0; index < xTicks; index += 1) {
    const progress = index / Math.max(xTicks - 1, 1);
    const date = new Date(startTime + progress * (endTime - startTime));
    const x = padding.left + progress * chartWidth;
    context.fillStyle = colors.muted;
    context.textAlign = index === 0 ? "left" : index === xTicks - 1 ? "right" : "center";
    context.fillText(dateFormatter.format(date), x, height - 13);
  }
  slrvChartState = { series, padding, chartWidth, width, height };
};

const showSlrvTooltip = (event) => {
  const canvas = document.querySelector("#slrv-chart");
  const tooltip = document.querySelector("#slrv-tooltip");
  if (!canvas || !tooltip || !slrvChartState) return;
  const { series, padding, chartWidth, width, height } = slrvChartState;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * width;
  const progress = Math.max(0, Math.min(1, (x - padding.left) / Math.max(chartWidth, 1)));
  const point = series[Math.round(progress * (series.length - 1))];
  if (!point) return;
  const date = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "2-digit", day: "2-digit" }).format(point.date);
  tooltip.innerHTML = `<strong>${date}</strong><span>BTC <i>${formatUsd(point.price)}</i></span><span>SLRV · 7D <i>${point.slrv.toFixed(4)}</i></span><span>Raw / 30D <i>${point.rawRatio.toFixed(4)} / ${point.average30.toFixed(4)}</i></span>`;
  tooltip.hidden = false;
  const tooltipWidth = tooltip.offsetWidth || 240;
  tooltip.style.left = `${Math.max(8, Math.min(rect.width - tooltipWidth - 8, event.clientX - rect.left + 14))}px`;
  tooltip.style.top = `${Math.max(8, Math.min(height - 126, event.clientY - rect.top - 72))}px`;
};

const hideSlrvTooltip = () => {
  const tooltip = document.querySelector("#slrv-tooltip");
  if (tooltip) tooltip.hidden = true;
};

const getRealizedCapHodlVisibleSeries = () => {
  if (!realizedCapHodlSeries.length || realizedCapHodlRange === "all") return realizedCapHodlSeries;
  const days = Number(realizedCapHodlRange);
  const end = realizedCapHodlSeries.at(-1).date.getTime();
  const start = end - Math.max(days - 1, 1) * 86_400_000;
  return realizedCapHodlSeries.filter((point) => point.date.getTime() >= start);
};

const drawRealizedCapHodlChart = () => {
  const canvas = document.querySelector("#realized-cap-hodl-chart");
  const stage = canvas?.closest(".realized-cap-hodl-stage");
  const series = getRealizedCapHodlVisibleSeries();
  if (!canvas || !stage || series.length < 2) {
    drawEmptyChart("#realized-cap-hodl-chart");
    realizedCapHodlChartState = null;
    return;
  }

  canvas.style.removeProperty("height");
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height || stage.clientHeight || 660, 420);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = chartColors();
  const compact = width < 700;
  const padding = { top: 28, right: compact ? 58 : 72, bottom: 44, left: compact ? 54 : 66 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const gap = compact ? 38 : 46;
  const priceHeight = chartHeight * 0.42;
  const waveTop = padding.top + priceHeight + gap;
  const waveHeight = chartHeight - priceHeight - gap;
  const startTime = series[0].date.getTime();
  const endTime = series.at(-1).date.getTime();
  const xFor = (date) => padding.left + ((date.getTime() - startTime) / Math.max(endTime - startTime, 1)) * chartWidth;
  const prices = series.map((point) => point.price).filter((value) => Number.isFinite(value) && value > 0);
  const priceLogMin = Math.log10(Math.min(...prices)) - 0.08;
  const priceLogMax = Math.log10(Math.max(...prices)) + 0.08;
  const priceY = (value) => padding.top + (1 - (Math.log10(Math.max(value, 0.0001)) - priceLogMin) / Math.max(priceLogMax - priceLogMin, 0.0001)) * priceHeight;
  const waveY = (value) => waveTop + (1 - Math.max(0, Math.min(1, value))) * waveHeight;
  const bandKeys = ["threeToSix", "sixToTwelve", "oneToTwo", "twoToThree", "threeToFour", "fourPlus"];
  const bandColors = ["#e4b25d", "#e5d67a", "#cbdc86", "#91c998", "#60aaa0", "#5e789e"];

  context.clearRect(0, 0, width, height);
  context.font = "700 10px JetBrains Mono";
  context.textBaseline = "middle";
  context.lineWidth = 1;

  for (let index = 0; index < 4; index += 1) {
    const progress = index / 3;
    const y = padding.top + progress * priceHeight;
    const value = 10 ** (priceLogMax - progress * (priceLogMax - priceLogMin));
    context.strokeStyle = colors.line;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillStyle = colors.muted;
    context.textAlign = "right";
    context.fillText(formatAxisUsd(value), padding.left - 8, y);
  }

  context.save();
  context.strokeStyle = colors.ink;
  context.lineWidth = 1.8;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.beginPath();
  series.forEach((point, index) => {
    const x = xFor(point.date);
    const y = priceY(point.price);
    if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
  });
  context.stroke();
  context.restore();

  [0, 0.25, 0.5, 0.75, 1].forEach((value) => {
    const y = waveY(value);
    context.strokeStyle = colors.line;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillStyle = colors.muted;
    context.textAlign = "right";
    context.fillText(`${Math.round(value * 100)}%`, padding.left - 8, y);
  });

  bandKeys.forEach((key, bandIndex) => {
    context.save();
    context.fillStyle = bandColors[bandIndex];
    context.globalAlpha = document.body.dataset.theme === "dark" ? 0.78 : 0.72;
    context.beginPath();
    series.forEach((point, index) => {
      const upper = bandKeys.slice(0, bandIndex + 1).reduce((sum, band) => sum + Number(point[band] || 0), 0);
      const x = xFor(point.date);
      const y = waveY(upper);
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    for (let index = series.length - 1; index >= 0; index -= 1) {
      const point = series[index];
      const lower = bandKeys.slice(0, bandIndex).reduce((sum, band) => sum + Number(point[band] || 0), 0);
      context.lineTo(xFor(point.date), waveY(lower));
    }
    context.closePath();
    context.fill();
    context.restore();
  });

  context.save();
  context.strokeStyle = colors.green;
  context.lineWidth = 1.8;
  context.beginPath();
  series.forEach((point, index) => {
    if (index === 0) context.moveTo(xFor(point.date), waveY(point.overThreeMonths));
    else context.lineTo(xFor(point.date), waveY(point.overThreeMonths));
  });
  context.stroke();
  const thresholdY = waveY(0.84);
  context.strokeStyle = colors.red;
  context.lineWidth = 1.1;
  context.setLineDash([7, 6]);
  context.beginPath();
  context.moveTo(padding.left, thresholdY);
  context.lineTo(width - padding.right, thresholdY);
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = colors.red;
  context.textAlign = "right";
  context.fillText("84% DEEP LOCK", width - padding.right - 5, thresholdY - 10);
  context.restore();

  if (realizedCapHodlRange === "all") {
    realizedCapHodlPeaks.forEach((peak) => {
      const date = new Date(`${peak.date}T00:00:00Z`);
      if (date < series[0].date || date > series.at(-1).date) return;
      const x = xFor(date);
      context.save();
      context.strokeStyle = colors.red;
      context.setLineDash([5, 6]);
      context.globalAlpha = 0.72;
      context.beginPath();
      context.moveTo(x, waveY(Number(peak.value)) - 5);
      context.lineTo(x, waveTop + waveHeight);
      context.stroke();
      context.restore();
      context.fillStyle = colors.red;
      context.textAlign = x > padding.left + chartWidth * 0.85 ? "right" : "center";
      context.fillText(`${(Number(peak.value) * 100).toFixed(1)}%`, x, waveY(Number(peak.value)) - 12);
    });
  }

  context.save();
  context.fillStyle = colors.ink;
  context.globalAlpha = document.body.dataset.theme === "dark" ? 0.055 : 0.04;
  context.font = `800 ${Math.max(30, Math.min(width * 0.08, height * 0.13, 88))}px Inter`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  drawBrandWatermark(context, padding.left + chartWidth / 2, padding.top + chartHeight / 2);
  context.restore();

  const latest = series.at(-1);
  context.fillStyle = colors.green;
  context.beginPath();
  context.arc(xFor(latest.date), waveY(latest.overThreeMonths), 4.5, 0, Math.PI * 2);
  context.fill();

  const xTicks = compact ? 4 : 7;
  const shortRange = ["7", "30", "90"].includes(realizedCapHodlRange);
  const dateFormatter = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", { year: shortRange ? undefined : "numeric", month: "short", day: shortRange ? "2-digit" : undefined });
  context.textBaseline = "alphabetic";
  for (let index = 0; index < xTicks; index += 1) {
    const progress = index / Math.max(xTicks - 1, 1);
    const date = new Date(startTime + progress * (endTime - startTime));
    const x = padding.left + progress * chartWidth;
    context.fillStyle = colors.muted;
    context.textAlign = index === 0 ? "left" : index === xTicks - 1 ? "right" : "center";
    context.fillText(dateFormatter.format(date), x, height - 13);
  }
  realizedCapHodlChartState = { series, padding, chartWidth, width, height };
};

const showRealizedCapHodlTooltip = (event) => {
  const canvas = document.querySelector("#realized-cap-hodl-chart");
  const tooltip = document.querySelector("#realized-cap-hodl-tooltip");
  if (!canvas || !tooltip || !realizedCapHodlChartState) return;
  const { series, padding, chartWidth, width, height } = realizedCapHodlChartState;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * width;
  const progress = Math.max(0, Math.min(1, (x - padding.left) / Math.max(chartWidth, 1)));
  const point = series[Math.round(progress * (series.length - 1))];
  if (!point) return;
  const percent = (value) => `${(Number(value) * 100).toFixed(1)}%`;
  const date = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "2-digit", day: "2-digit" }).format(point.date);
  tooltip.innerHTML = `<strong>${date}</strong><span>BTC <i>${formatUsd(point.price)}</i></span><span>&gt;3M <i>${percent(point.overThreeMonths)}</i></span><span>3M-1Y / 1Y-3Y <i>${percent(point.threeToSix + point.sixToTwelve)} / ${percent(point.oneToTwo + point.twoToThree)}</i></span><span>3Y-4Y / 4Y+ <i>${percent(point.threeToFour)} / ${percent(point.fourPlus)}</i></span>`;
  tooltip.hidden = false;
  const tooltipWidth = tooltip.offsetWidth || 250;
  tooltip.style.left = `${Math.max(8, Math.min(rect.width - tooltipWidth - 8, event.clientX - rect.left + 14))}px`;
  tooltip.style.top = `${Math.max(8, Math.min(height - 154, event.clientY - rect.top - 80))}px`;
};

const hideRealizedCapHodlTooltip = () => {
  const tooltip = document.querySelector("#realized-cap-hodl-tooltip");
  if (tooltip) tooltip.hidden = true;
};

const getLthSpentVisibleSeries = () => {
  if (!lthSpentSeries.length || lthSpentRange === "all") return lthSpentSeries;
  const days = Number(lthSpentRange);
  const end = lthSpentSeries.at(-1).date.getTime();
  const start = end - Math.max(days - 1, 1) * 86_400_000;
  return lthSpentSeries.filter((point) => point.date.getTime() >= start);
};

const drawLthSpentChart = () => {
  const canvas = document.querySelector("#lth-spent-chart");
  const stage = canvas?.closest(".lth-spent-stage");
  const series = getLthSpentVisibleSeries();
  if (!canvas || !stage || series.length < 2) {
    drawEmptyChart("#lth-spent-chart");
    lthSpentChartState = null;
    return;
  }

  canvas.style.removeProperty("height");
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height || stage.clientHeight || 560, 340);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = chartColors();
  const compact = width < 700;
  const padding = { top: 34, right: compact ? 18 : 28, bottom: 44, left: compact ? 58 : 74 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const values = series.flatMap((point) => [point.price, point.spentAverage7]).filter((value) => Number.isFinite(value) && value > 0);
  const logMin = Math.log10(Math.min(...values)) - 0.08;
  const logMax = Math.log10(Math.max(...values)) + 0.08;
  const startTime = series[0].date.getTime();
  const endTime = series.at(-1).date.getTime();
  const xFor = (date) => padding.left + ((date.getTime() - startTime) / Math.max(endTime - startTime, 1)) * chartWidth;
  const yFor = (value) => padding.top + (1 - (Math.log10(Math.max(value, 0.0001)) - logMin) / Math.max(logMax - logMin, 0.0001)) * chartHeight;

  context.clearRect(0, 0, width, height);
  context.font = "700 10px JetBrains Mono";
  context.lineWidth = 1;
  context.textBaseline = "middle";

  const yTicks = compact ? 5 : 6;
  for (let index = 0; index < yTicks; index += 1) {
    const progress = index / Math.max(yTicks - 1, 1);
    const value = 10 ** (logMax - progress * (logMax - logMin));
    const y = padding.top + progress * chartHeight;
    context.strokeStyle = colors.line;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillStyle = colors.muted;
    context.textAlign = "right";
    context.fillText(formatAxisUsd(value), padding.left - 9, y);
  }

  const drawWindow = (start, end, fill, alpha, label = "") => {
    const startDate = new Date(`${start}T00:00:00Z`);
    const endDate = new Date(`${end}T00:00:00Z`);
    if (endDate < series[0].date || startDate > series.at(-1).date) return;
    const left = xFor(startDate < series[0].date ? series[0].date : startDate);
    const right = xFor(endDate > series.at(-1).date ? series.at(-1).date : endDate);
    context.save();
    context.fillStyle = fill;
    context.globalAlpha = alpha;
    context.fillRect(left, padding.top, Math.max(1, right - left), chartHeight);
    context.restore();
    if (!label || right - left < 10) return;
    context.save();
    context.fillStyle = fill;
    context.font = "800 9px JetBrains Mono";
    context.textAlign = "center";
    context.textBaseline = "alphabetic";
    context.fillText(label, (left + right) / 2, padding.top - 10);
    context.restore();
  };

  if (lthSpentRange === "all") {
    lthSpentResearchWindows.forEach((windowItem) => drawWindow(windowItem.start, windowItem.end, colors.cyan, 0.08, `${windowItem.cycle} · ${windowItem.days}D`));
  }
  lthSpentUnderwaterZones.forEach((zone) => drawWindow(zone.start, zone.end, colors.cyan, 0.13));

  const xTicks = compact ? 4 : 7;
  const shortRange = ["7", "30", "90"].includes(lthSpentRange);
  const dateFormatter = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", {
    year: shortRange ? undefined : "numeric",
    month: "short",
    day: shortRange ? "2-digit" : undefined
  });
  context.textBaseline = "alphabetic";
  for (let index = 0; index < xTicks; index += 1) {
    const progress = index / Math.max(xTicks - 1, 1);
    const date = new Date(startTime + progress * (endTime - startTime));
    const x = padding.left + progress * chartWidth;
    context.fillStyle = colors.muted;
    context.textAlign = index === 0 ? "left" : index === xTicks - 1 ? "right" : "center";
    context.fillText(dateFormatter.format(date), x, height - 13);
  }

  context.save();
  context.fillStyle = colors.ink;
  context.globalAlpha = document.body.dataset.theme === "dark" ? 0.055 : 0.045;
  context.font = `800 ${Math.max(30, Math.min(width * 0.085, height * 0.16, 92))}px Inter`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  drawBrandWatermark(context, padding.left + chartWidth / 2, padding.top + chartHeight / 2);
  context.restore();

  const drawSeries = (key, color, lineWidth, opacity = 1) => {
    context.save();
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.globalAlpha = opacity;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.beginPath();
    let started = false;
    series.forEach((point) => {
      if (!Number.isFinite(point[key]) || point[key] <= 0) {
        started = false;
        return;
      }
      const x = xFor(point.date);
      const y = yFor(point[key]);
      if (!started) {
        context.moveTo(x, y);
        started = true;
      } else context.lineTo(x, y);
    });
    context.stroke();
    context.restore();
  };

  drawSeries("price", colors.muted, 1.5, 0.84);
  drawSeries("spentAverage7", "#35c98b", 2.35, 0.98);

  const latestPrice = series.at(-1);
  const latestSpent = [...series].reverse().find((point) => Number.isFinite(point.spentAverage7));
  [[latestPrice, "price", colors.muted], [latestSpent, "spentAverage7", "#35c98b"]].forEach(([point, key, color]) => {
    if (!point || !Number.isFinite(point[key])) return;
    context.fillStyle = color;
    context.beginPath();
    context.arc(xFor(point.date), yFor(point[key]), key === "price" ? 3.5 : 4.5, 0, Math.PI * 2);
    context.fill();
  });

  lthSpentChartState = { series, padding, chartWidth, width, height };
};

const showLthSpentTooltip = (event) => {
  const canvas = document.querySelector("#lth-spent-chart");
  const tooltip = document.querySelector("#lth-spent-tooltip");
  if (!canvas || !tooltip || !lthSpentChartState) return;
  const { series, padding, chartWidth, width, height } = lthSpentChartState;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * width;
  const progress = Math.max(0, Math.min(1, (x - padding.left) / Math.max(chartWidth, 1)));
  const point = series[Math.round(progress * (series.length - 1))];
  if (!point) return;
  const date = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "2-digit", day: "2-digit" }).format(point.date);
  const spent = Number.isFinite(point.spentAverage7) ? formatUsd(point.spentAverage7) : "--";
  const sopr = Number.isFinite(point.lthSopr) ? point.lthSopr.toFixed(4) : "--";
  const spread = Number.isFinite(point.spentAverage7) ? formatUsd(point.price - point.spentAverage7) : "--";
  tooltip.innerHTML = `<strong>${date}</strong><span>BTC <i>${formatUsd(point.price)}</i></span><span>LTH Spent · 7D <i>${spent}</i></span><span>LTH-SOPR <i>${sopr}</i></span><span>Price - Spent <i>${spread}</i></span>`;
  tooltip.hidden = false;
  const tooltipWidth = tooltip.offsetWidth || 230;
  tooltip.style.left = `${Math.max(8, Math.min(rect.width - tooltipWidth - 8, event.clientX - rect.left + 14))}px`;
  tooltip.style.top = `${Math.max(8, Math.min(height - 140, event.clientY - rect.top - 76))}px`;
};

const hideLthSpentTooltip = () => {
  const tooltip = document.querySelector("#lth-spent-tooltip");
  if (tooltip) tooltip.hidden = true;
};

const getPercentProfitVisibleSeries = () => {
  if (!percentProfitSeries.length || percentProfitRange === "all") return percentProfitSeries;
  const days = Number(percentProfitRange);
  const end = percentProfitSeries.at(-1).date.getTime();
  const start = end - Math.max(days - 1, 1) * 86_400_000;
  return percentProfitSeries.filter((point) => point.date.getTime() >= start);
};

const drawPercentProfitChart = () => {
  const canvas = document.querySelector("#percent-profit-chart");
  const stage = canvas?.closest(".percent-profit-stage");
  const series = getPercentProfitVisibleSeries();
  if (!canvas || !stage || series.length < 2) {
    drawEmptyChart("#percent-profit-chart");
    percentProfitChartState = null;
    return;
  }

  canvas.style.removeProperty("height");
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height || stage.clientHeight || 560, 340);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = chartColors();
  const compact = width < 700;
  const padding = { top: 30, right: compact ? 54 : 70, bottom: 46, left: compact ? 50 : 62 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const startTime = series[0].date.getTime();
  const endTime = series.at(-1).date.getTime();
  const xFor = (date) => padding.left + ((date.getTime() - startTime) / Math.max(endTime - startTime, 1)) * chartWidth;
  const percentY = (value) => padding.top + (1 - Math.max(0, Math.min(100, value)) / 100) * chartHeight;
  const prices = series.map((point) => point.price).filter((value) => Number.isFinite(value) && value > 0);
  const priceLogMin = Math.log10(Math.min(...prices)) - 0.08;
  const priceLogMax = Math.log10(Math.max(...prices)) + 0.08;
  const priceY = (value) => padding.top + (1 - (Math.log10(Math.max(value, 0.0001)) - priceLogMin) / Math.max(priceLogMax - priceLogMin, 0.0001)) * chartHeight;

  context.clearRect(0, 0, width, height);
  context.font = "700 10px JetBrains Mono";
  context.lineWidth = 1;
  context.textBaseline = "middle";

  context.save();
  context.fillStyle = "rgba(65, 210, 145, 0.09)";
  context.fillRect(padding.left, percentY(50), chartWidth, percentY(0) - percentY(50));
  context.fillStyle = "rgba(235, 99, 91, 0.08)";
  context.fillRect(padding.left, percentY(100), chartWidth, percentY(95) - percentY(100));
  context.restore();

  [0, 25, 50, 75, 95, 100].forEach((value) => {
    const y = percentY(value);
    context.strokeStyle = colors.line;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillStyle = value === 50 ? colors.green : value === 95 ? colors.red : colors.muted;
    context.textAlign = "right";
    context.fillText(`${value}%`, padding.left - 8, y);
  });

  const priceTicks = compact ? 4 : 5;
  for (let index = 0; index < priceTicks; index += 1) {
    const progress = index / Math.max(priceTicks - 1, 1);
    const value = 10 ** (priceLogMax - progress * (priceLogMax - priceLogMin));
    context.fillStyle = colors.muted;
    context.textAlign = "left";
    context.fillText(formatAxisUsd(value), width - padding.right + 8, padding.top + progress * chartHeight);
  }

  [{ value: 50, color: colors.green, label: "50% FLUSH" }, { value: 95, color: colors.red, label: "95% OVERHEAT" }].forEach((threshold) => {
    const y = percentY(threshold.value);
    context.save();
    context.strokeStyle = threshold.color;
    context.globalAlpha = 0.86;
    context.setLineDash([7, 6]);
    context.lineWidth = 1.35;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = threshold.color;
    context.font = "800 9px JetBrains Mono";
    context.textAlign = "right";
    context.fillText(threshold.label, width - padding.right - 4, y - 10);
    context.restore();
  });

  context.save();
  context.strokeStyle = colors.ink;
  context.globalAlpha = 0.76;
  context.lineWidth = 1.45;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.beginPath();
  series.forEach((point, index) => {
    const x = xFor(point.date);
    const y = priceY(point.price);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();
  context.restore();

  context.save();
  const percentFill = context.createLinearGradient(0, padding.top, 0, padding.top + chartHeight);
  percentFill.addColorStop(0, "rgba(240, 161, 61, 0.20)");
  percentFill.addColorStop(1, "rgba(240, 161, 61, 0.015)");
  context.fillStyle = percentFill;
  context.beginPath();
  series.forEach((point, index) => {
    const x = xFor(point.date);
    const y = percentY(point.percent);
    if (index === 0) context.moveTo(x, percentY(0));
    context.lineTo(x, y);
  });
  context.lineTo(xFor(series.at(-1).date), percentY(0));
  context.closePath();
  context.fill();
  context.strokeStyle = "#f0a13d";
  context.globalAlpha = 0.98;
  context.lineWidth = 2.15;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.beginPath();
  series.forEach((point, index) => {
    const x = xFor(point.date);
    const y = percentY(point.percent);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();
  context.restore();

  if (percentProfitRange === "all") {
    percentProfitHistoricalLows.forEach((low) => {
      const date = new Date(`${low.date}T00:00:00Z`);
      if (date < series[0].date || date > series.at(-1).date) return;
      const x = xFor(date);
      const y = percentY(Number(low.percent));
      context.save();
      context.fillStyle = Number(low.percent) < 50 ? colors.green : "#f0a13d";
      context.beginPath();
      context.arc(x, y, 4, 0, Math.PI * 2);
      context.fill();
      context.font = "800 9px JetBrains Mono";
      context.textAlign = "center";
      context.textBaseline = "alphabetic";
      context.fillText(`${low.label} · ${Number(low.percent).toFixed(1)}%`, x, Math.max(padding.top + 12, y - 12));
      context.restore();
    });
  }

  context.save();
  context.fillStyle = colors.ink;
  context.globalAlpha = document.body.dataset.theme === "dark" ? 0.07 : 0.055;
  context.font = `800 ${Math.max(30, Math.min(width * 0.078, chartHeight * 0.2, 88))}px Inter`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  drawBrandWatermark(context, padding.left + chartWidth / 2, padding.top + chartHeight / 2);
  context.restore();

  const latest = series.at(-1);
  [[priceY(latest.price), colors.ink, 3], [percentY(latest.percent), "#f0a13d", 4.5]].forEach(([y, color, radius]) => {
    context.fillStyle = color;
    context.beginPath();
    context.arc(xFor(latest.date), y, radius, 0, Math.PI * 2);
    context.fill();
  });

  const xTicks = compact ? 4 : 7;
  const shortRange = ["7", "30", "90"].includes(percentProfitRange);
  const dateFormatter = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", {
    year: shortRange ? undefined : "numeric",
    month: "short",
    day: shortRange ? "2-digit" : undefined
  });
  context.textBaseline = "alphabetic";
  for (let index = 0; index < xTicks; index += 1) {
    const progress = index / Math.max(xTicks - 1, 1);
    const date = new Date(startTime + progress * (endTime - startTime));
    const x = padding.left + progress * chartWidth;
    context.fillStyle = colors.muted;
    context.textAlign = index === 0 ? "left" : index === xTicks - 1 ? "right" : "center";
    context.fillText(dateFormatter.format(date), x, height - 13);
  }

  percentProfitChartState = { series, padding, chartWidth, width, height };
};

const showPercentProfitTooltip = (event) => {
  const canvas = document.querySelector("#percent-profit-chart");
  const tooltip = document.querySelector("#percent-profit-tooltip");
  if (!canvas || !tooltip || !percentProfitChartState) return;
  const { series, padding, chartWidth, width, height } = percentProfitChartState;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * width;
  const progress = Math.max(0, Math.min(1, (x - padding.left) / Math.max(chartWidth, 1)));
  const point = series[Math.round(progress * (series.length - 1))];
  if (!point) return;
  const date = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "2-digit", day: "2-digit" }).format(point.date);
  const supply = (value) => `${(Number(value) / 1_000_000).toFixed(2)}M BTC`;
  tooltip.innerHTML = `<strong>${date}</strong><span>BTC <i>${formatUsd(point.price)}</i></span><span>Supply in Profit <i>${point.percent.toFixed(2)}%</i></span><span>Profit Supply <i>${supply(point.profitSupply)}</i></span><span>Loss Supply <i>${supply(point.lossSupply)}</i></span>`;
  tooltip.hidden = false;
  const tooltipWidth = tooltip.offsetWidth || 240;
  tooltip.style.left = `${Math.max(8, Math.min(rect.width - tooltipWidth - 8, event.clientX - rect.left + 14))}px`;
  tooltip.style.top = `${Math.max(8, Math.min(height - 140, event.clientY - rect.top - 76))}px`;
};

const hidePercentProfitTooltip = () => {
  const tooltip = document.querySelector("#percent-profit-tooltip");
  if (tooltip) tooltip.hidden = true;
};

const getLthExchangeLossVisibleSeries = () => {
  if (!lthExchangeLossSeries.length || lthExchangeLossRange === "all") return lthExchangeLossSeries;
  const days = Number(lthExchangeLossRange);
  const end = lthExchangeLossSeries.at(-1).date.getTime();
  const start = end - Math.max(days - 1, 1) * 86_400_000;
  return lthExchangeLossSeries.filter((point) => point.date.getTime() >= start);
};

const drawLthExchangeLossChart = () => {
  const canvas = document.querySelector("#lth-exchange-loss-chart");
  const stage = canvas?.closest(".lth-exchange-loss-stage");
  const series = getLthExchangeLossVisibleSeries();
  if (!canvas || !stage || series.length < 2) {
    drawEmptyChart("#lth-exchange-loss-chart");
    lthExchangeLossChartState = null;
    return;
  }

  canvas.style.removeProperty("height");
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height || stage.clientHeight || 560, 360);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = chartColors();
  const compact = width < 700;
  const padding = { top: 28, right: compact ? 54 : 70, bottom: 46, left: compact ? 48 : 58 };
  const gap = 34;
  const availableHeight = height - padding.top - padding.bottom - gap;
  const priceHeight = availableHeight * 0.48;
  const ratioTop = padding.top + priceHeight + gap;
  const ratioHeight = availableHeight - priceHeight;
  const chartWidth = width - padding.left - padding.right;
  const startTime = series[0].date.getTime();
  const endTime = series.at(-1).date.getTime();
  const xFor = (date) => padding.left + ((date.getTime() - startTime) / Math.max(endTime - startTime, 1)) * chartWidth;
  const prices = series.map((point) => point.price).filter((value) => Number.isFinite(value) && value > 0);
  const priceLogMin = Math.log10(Math.min(...prices)) - 0.08;
  const priceLogMax = Math.log10(Math.max(...prices)) + 0.08;
  const priceY = (value) => padding.top + (1 - (Math.log10(Math.max(value, 0.0001)) - priceLogMin) / Math.max(priceLogMax - priceLogMin, 0.0001)) * priceHeight;
  const observedMax = Math.max(70, ...series.map((point) => point.percent).filter(Number.isFinite));
  const ratioMax = Math.min(100, Math.max(75, Math.ceil(observedMax / 10) * 10));
  const ratioY = (value) => ratioTop + (1 - Math.max(0, Math.min(ratioMax, value)) / ratioMax) * ratioHeight;

  context.clearRect(0, 0, width, height);
  context.font = "700 10px JetBrains Mono";
  context.lineWidth = 1;
  context.textBaseline = "middle";

  const drawGrid = (top, panelHeight, ticks, valueFor, formatter, side = "left") => {
    for (let index = 0; index < ticks; index += 1) {
      const progress = index / Math.max(ticks - 1, 1);
      const y = top + progress * panelHeight;
      context.strokeStyle = colors.line;
      context.beginPath();
      context.moveTo(padding.left, y);
      context.lineTo(width - padding.right, y);
      context.stroke();
      context.fillStyle = colors.muted;
      context.textAlign = side === "right" ? "left" : "right";
      context.fillText(formatter(valueFor(progress)), side === "right" ? width - padding.right + 8 : padding.left - 8, y);
    }
  };
  drawGrid(padding.top, priceHeight, compact ? 3 : 4, (progress) => 10 ** (priceLogMax - progress * (priceLogMax - priceLogMin)), formatAxisUsd, "right");
  drawGrid(ratioTop, ratioHeight, 4, (progress) => ratioMax * (1 - progress), (value) => `${Math.round(value)}%`);

  context.save();
  context.strokeStyle = colors.ink;
  context.globalAlpha = 0.82;
  context.lineWidth = 1.55;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.beginPath();
  series.forEach((point, index) => {
    const x = xFor(point.date);
    const y = priceY(point.price);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();
  context.restore();

  context.save();
  const fill = context.createLinearGradient(0, ratioTop, 0, ratioTop + ratioHeight);
  fill.addColorStop(0, "rgba(156, 174, 243, 0.62)");
  fill.addColorStop(1, "rgba(111, 130, 218, 0.08)");
  context.fillStyle = fill;
  context.beginPath();
  series.forEach((point, index) => {
    const x = xFor(point.date);
    if (index === 0) context.moveTo(x, ratioY(0));
    context.lineTo(x, ratioY(point.percent));
  });
  context.lineTo(xFor(series.at(-1).date), ratioY(0));
  context.closePath();
  context.fill();
  context.strokeStyle = "#9caef3";
  context.lineWidth = 2.1;
  context.lineJoin = "round";
  context.beginPath();
  series.forEach((point, index) => {
    const x = xFor(point.date);
    const y = ratioY(point.percent);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();
  context.restore();

  [{ value: 50, color: colors.red, label: "50% CAPITULATION" }, { value: 70, color: "#b7a8ff", label: "70% RESEARCH REF." }].forEach((threshold) => {
    if (threshold.value > ratioMax) return;
    const y = ratioY(threshold.value);
    context.save();
    context.strokeStyle = threshold.color;
    context.globalAlpha = 0.82;
    context.setLineDash([7, 6]);
    context.lineWidth = 1.3;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = threshold.color;
    context.font = "800 9px JetBrains Mono";
    context.textAlign = "right";
    context.fillText(threshold.label, width - padding.right - 4, y - 10);
    context.restore();
  });

  if (lthExchangeLossRange === "all") {
    lthExchangeLossHistoricalPeaks.forEach((peak) => {
      const date = new Date(`${peak.date}T00:00:00Z`);
      if (date < series[0].date || date > series.at(-1).date) return;
      const x = xFor(date);
      const y = ratioY(Number(peak.percent));
      context.save();
      context.fillStyle = Number(peak.percent) >= 50 ? colors.red : "#9caef3";
      context.beginPath();
      context.arc(x, y, 4, 0, Math.PI * 2);
      context.fill();
      context.font = "800 9px JetBrains Mono";
      context.textAlign = "center";
      context.textBaseline = "alphabetic";
      context.fillText(`${peak.label} · ${Number(peak.percent).toFixed(1)}%`, x, Math.max(ratioTop + 13, y - 11));
      context.restore();
    });
  }

  context.save();
  context.fillStyle = colors.ink;
  context.globalAlpha = document.body.dataset.theme === "dark" ? 0.07 : 0.055;
  context.font = `800 ${Math.max(30, Math.min(width * 0.078, availableHeight * 0.2, 88))}px Inter`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  drawBrandWatermark(context, padding.left + chartWidth / 2, padding.top + availableHeight / 2);
  context.restore();

  const latest = series.at(-1);
  [[priceY(latest.price), colors.ink, 3], [ratioY(latest.percent), "#9caef3", 4.5]].forEach(([y, color, radius]) => {
    context.fillStyle = color;
    context.beginPath();
    context.arc(xFor(latest.date), y, radius, 0, Math.PI * 2);
    context.fill();
  });

  const xTicks = compact ? 4 : 7;
  const shortRange = ["7", "30", "90"].includes(lthExchangeLossRange);
  const dateFormatter = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", {
    year: shortRange ? undefined : "numeric",
    month: "short",
    day: shortRange ? "2-digit" : undefined
  });
  context.textBaseline = "alphabetic";
  for (let index = 0; index < xTicks; index += 1) {
    const progress = index / Math.max(xTicks - 1, 1);
    const date = new Date(startTime + progress * (endTime - startTime));
    const x = padding.left + progress * chartWidth;
    context.fillStyle = colors.muted;
    context.textAlign = index === 0 ? "left" : index === xTicks - 1 ? "right" : "center";
    context.fillText(dateFormatter.format(date), x, height - 13);
  }

  lthExchangeLossChartState = { series, padding, chartWidth, width, height };
};

const showLthExchangeLossTooltip = (event) => {
  const canvas = document.querySelector("#lth-exchange-loss-chart");
  const tooltip = document.querySelector("#lth-exchange-loss-tooltip");
  if (!canvas || !tooltip || !lthExchangeLossChartState) return;
  const { series, padding, chartWidth, width, height } = lthExchangeLossChartState;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * width;
  const progress = Math.max(0, Math.min(1, (x - padding.left) / Math.max(chartWidth, 1)));
  const point = series[Math.round(progress * (series.length - 1))];
  if (!point) return;
  const date = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "2-digit", day: "2-digit" }).format(point.date);
  tooltip.innerHTML = `<strong>${date}</strong><span>BTC <i>${formatUsd(point.price)}</i></span><span>LTH Loss Share · 30D <i>${point.percent.toFixed(2)}%</i></span><span>Daily Raw Share <i>${point.rawPercent.toFixed(2)}%</i></span><span>LTH Realized Loss <i>${formatUsd(point.lthLossUsd)}</i></span>`;
  tooltip.hidden = false;
  const tooltipWidth = tooltip.offsetWidth || 250;
  tooltip.style.left = `${Math.max(8, Math.min(rect.width - tooltipWidth - 8, event.clientX - rect.left + 14))}px`;
  tooltip.style.top = `${Math.max(8, Math.min(height - 140, event.clientY - rect.top - 76))}px`;
};

const hideLthExchangeLossTooltip = () => {
  const tooltip = document.querySelector("#lth-exchange-loss-tooltip");
  if (tooltip) tooltip.hidden = true;
};

const getTwoWeekRsiVisibleSeries = () => {
  if (!twoWeekRsiSeries.length || twoWeekRsiRange === "all") return twoWeekRsiSeries;
  const days = Number(twoWeekRsiRange);
  const end = twoWeekRsiSeries.at(-1).date.getTime();
  const start = end - Math.max(days - 1, 1) * 86_400_000;
  const visible = twoWeekRsiSeries.filter((point) => point.date.getTime() >= start);
  return visible.length >= 2 ? visible : twoWeekRsiSeries.slice(-2);
};

const drawTwoWeekRsiChart = () => {
  const canvas = document.querySelector("#two-week-rsi-chart");
  const stage = canvas?.closest(".two-week-rsi-stage");
  const series = getTwoWeekRsiVisibleSeries();
  if (!canvas || !stage || series.length < 2) {
    drawEmptyChart("#two-week-rsi-chart");
    twoWeekRsiChartState = null;
    return;
  }

  canvas.style.removeProperty("height");
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height || stage.clientHeight || 560, 360);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = chartColors();
  const compact = width < 700;
  const padding = { top: 28, right: compact ? 48 : 62, bottom: 44, left: compact ? 54 : 68 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const startTime = series[0].date.getTime();
  const endTime = series.at(-1).date.getTime();
  const xFor = (date) => padding.left + ((date.getTime() - startTime) / Math.max(endTime - startTime, 1)) * chartWidth;
  const prices = series.map((point) => point.price).filter((value) => Number.isFinite(value) && value > 0);
  const priceLogMin = Math.log10(Math.min(...prices)) - 0.07;
  const priceLogMax = Math.log10(Math.max(...prices)) + 0.07;
  const priceY = (value) => padding.top + (1 - (Math.log10(Math.max(value, 0.0001)) - priceLogMin) / Math.max(priceLogMax - priceLogMin, 0.0001)) * chartHeight;
  const rsiY = (value) => padding.top + (1 - Math.max(0, Math.min(100, value)) / 100) * chartHeight;

  context.clearRect(0, 0, width, height);
  context.font = "700 10px JetBrains Mono";
  context.lineWidth = 1;
  context.textBaseline = "middle";

  [0, 20, 40, 60, 80, 100].forEach((rsi) => {
    const y = rsiY(rsi);
    const priceValue = 10 ** (priceLogMax - (y - padding.top) / Math.max(chartHeight, 1) * (priceLogMax - priceLogMin));
    context.strokeStyle = colors.line;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillStyle = colors.muted;
    context.textAlign = "right";
    context.fillText(formatAxisUsd(priceValue), padding.left - 8, y);
    context.fillStyle = "#bb63ff";
    context.textAlign = "left";
    context.fillText(String(rsi), width - padding.right + 8, y);
  });

  const drawRsiBand = (from, to, color, alpha) => {
    context.save();
    context.fillStyle = color;
    context.globalAlpha = alpha;
    const top = rsiY(to);
    const bottom = rsiY(from);
    context.fillRect(padding.left, top, chartWidth, Math.max(0, bottom - top));
    context.restore();
  };
  drawRsiBand(0, 30, colors.green, document.body.dataset.theme === "dark" ? 0.065 : 0.05);
  drawRsiBand(70, 100, colors.red, document.body.dataset.theme === "dark" ? 0.045 : 0.035);

  [30, 50, 70].forEach((value) => {
    const y = rsiY(value);
    context.save();
    context.strokeStyle = value === 50 ? colors.muted : value === 30 ? colors.green : colors.red;
    context.globalAlpha = value === 50 ? 0.45 : 0.75;
    context.setLineDash([6, 5]);
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.restore();
  });

  const drawSeriesLine = (key, color, lineWidth, alpha = 1) => {
    context.save();
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.globalAlpha = alpha;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.beginPath();
    series.forEach((point, index) => {
      const x = xFor(point.date);
      const y = key === "price" ? priceY(point.price) : rsiY(point[key]);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
    context.restore();
  };

  drawSeriesLine("upper", "#49d6a2", compact ? 1.4 : 1.8, 0.86);
  drawSeriesLine("lower", "#49d6a2", compact ? 1.4 : 1.8, 0.92);
  drawSeriesLine("price", colors.ink, compact ? 1.55 : 2, 0.9);
  drawSeriesLine("rsi", "#bb63ff", compact ? 2 : 2.55, 1);

  if (twoWeekRsiRange === "all") {
    const lowByDate = new Map(twoWeekRsiHistoricalLows.map((low) => [low.date, low]));
    series.forEach((point) => {
      const low = lowByDate.get(point.date.toISOString().slice(0, 10));
      if (!low) return;
      const x = xFor(point.date);
      const y = rsiY(point.rsi);
      context.save();
      context.strokeStyle = colors.red;
      context.fillStyle = colors.red;
      context.lineWidth = 1.4;
      context.beginPath();
      context.moveTo(x, Math.min(height - padding.bottom - 10, y + 30));
      context.lineTo(x, y + 8);
      context.stroke();
      context.beginPath();
      context.moveTo(x, y + 3);
      context.lineTo(x - 4, y + 11);
      context.lineTo(x + 4, y + 11);
      context.closePath();
      context.fill();
      context.font = compact ? "700 8px JetBrains Mono" : "700 9px JetBrains Mono";
      context.textAlign = "center";
      context.fillText(`${low.label} · ${Number(low.rsi).toFixed(1)}`, x, Math.min(height - padding.bottom - 2, y + 41));
      context.restore();
    });
  }

  context.save();
  context.fillStyle = colors.ink;
  context.globalAlpha = document.body.dataset.theme === "dark" ? 0.075 : 0.06;
  context.font = `800 ${Math.max(30, Math.min(width * 0.085, height * 0.15, 86))}px Inter`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  drawBrandWatermark(context, padding.left + chartWidth / 2, padding.top + chartHeight / 2);
  context.restore();

  const latest = series.at(-1);
  context.fillStyle = "#bb63ff";
  context.beginPath();
  context.arc(xFor(latest.date), rsiY(latest.rsi), 4.5, 0, Math.PI * 2);
  context.fill();

  const xTicks = compact ? 4 : 7;
  const shortRange = ["7", "30", "90"].includes(twoWeekRsiRange);
  const dateFormatter = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", {
    year: shortRange ? undefined : "numeric",
    month: "short",
    day: shortRange ? "2-digit" : undefined
  });
  context.textBaseline = "alphabetic";
  for (let index = 0; index < xTicks; index += 1) {
    const progress = index / Math.max(xTicks - 1, 1);
    const date = new Date(startTime + progress * (endTime - startTime));
    const x = padding.left + progress * chartWidth;
    context.fillStyle = colors.muted;
    context.textAlign = index === 0 ? "left" : index === xTicks - 1 ? "right" : "center";
    context.fillText(dateFormatter.format(date), x, height - 13);
  }

  twoWeekRsiChartState = { series, padding, chartWidth, width, height };
};

const showTwoWeekRsiTooltip = (event) => {
  const canvas = document.querySelector("#two-week-rsi-chart");
  const tooltip = document.querySelector("#two-week-rsi-tooltip");
  if (!canvas || !tooltip || !twoWeekRsiChartState) return;
  const { series, padding, chartWidth, width, height } = twoWeekRsiChartState;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * width;
  const progress = Math.max(0, Math.min(1, (x - padding.left) / Math.max(chartWidth, 1)));
  const point = series[Math.round(progress * (series.length - 1))];
  if (!point) return;
  const date = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "2-digit", day: "2-digit" }).format(point.date);
  tooltip.innerHTML = `<strong>${date}</strong><span>BTC <i>${formatUsd(point.price)}</i></span><span>2W RSI <i>${point.rsi.toFixed(2)}</i></span><span>${currentLanguage === "zh" ? "下轨 / 上轨" : "Lower / Upper"} <i>${point.lower.toFixed(2)} / ${point.upper.toFixed(2)}</i></span><span>${currentLanguage === "zh" ? "距下轨" : "Distance"} <i>${point.rsi - point.lower >= 0 ? "+" : ""}${(point.rsi - point.lower).toFixed(2)}</i></span>`;
  tooltip.hidden = false;
  const tooltipWidth = tooltip.offsetWidth || 230;
  tooltip.style.left = `${Math.max(8, Math.min(rect.width - tooltipWidth - 8, event.clientX - rect.left + 14))}px`;
  tooltip.style.top = `${Math.max(8, Math.min(height - 148, event.clientY - rect.top - 82))}px`;
};

const hideTwoWeekRsiTooltip = () => {
  const tooltip = document.querySelector("#two-week-rsi-tooltip");
  if (tooltip) tooltip.hidden = true;
};

const getUnder3mHodlVisibleSeries = () => {
  if (!under3mHodlSeries.length || under3mHodlRange === "all") return under3mHodlSeries;
  const days = Number(under3mHodlRange);
  const end = under3mHodlSeries.at(-1).date.getTime();
  const start = end - Math.max(days - 1, 1) * 86_400_000;
  const visible = under3mHodlSeries.filter((point) => point.date.getTime() >= start);
  return visible.length >= 2 ? visible : under3mHodlSeries.slice(-2);
};

const drawUnder3mHodlChart = () => {
  const canvas = document.querySelector("#under-3m-hodl-chart");
  const stage = canvas?.closest(".under-3m-hodl-stage");
  const series = getUnder3mHodlVisibleSeries();
  if (!canvas || !stage || series.length < 2) {
    drawEmptyChart("#under-3m-hodl-chart");
    under3mHodlChartState = null;
    return;
  }

  canvas.style.removeProperty("height");
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height || stage.clientHeight || 560, 360);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = chartColors();
  const compact = width < 700;
  const padding = { top: 24, right: compact ? 48 : 64, bottom: 44, left: compact ? 54 : 70 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const paneGap = compact ? 24 : 30;
  const priceHeight = chartHeight * 0.42;
  const shareTop = padding.top + priceHeight + paneGap;
  const shareHeight = chartHeight - priceHeight - paneGap;
  const startTime = series[0].date.getTime();
  const endTime = series.at(-1).date.getTime();
  const xFor = (date) => padding.left + ((date.getTime() - startTime) / Math.max(endTime - startTime, 1)) * chartWidth;
  const prices = series.map((point) => point.price).filter((value) => Number.isFinite(value) && value > 0);
  const priceLogMin = Math.log10(Math.min(...prices)) - 0.06;
  const priceLogMax = Math.log10(Math.max(...prices)) + 0.06;
  const priceY = (value) => padding.top + (1 - (Math.log10(Math.max(value, 0.0001)) - priceLogMin) / Math.max(priceLogMax - priceLogMin, 0.0001)) * priceHeight;
  const shareY = (value) => shareTop + (1 - Math.max(0, Math.min(1, value))) * shareHeight;

  context.clearRect(0, 0, width, height);
  context.font = "700 10px JetBrains Mono";
  context.lineWidth = 1;
  context.textBaseline = "middle";

  for (let index = 0; index < 4; index += 1) {
    const progress = index / 3;
    const y = padding.top + progress * priceHeight;
    const value = 10 ** (priceLogMax - progress * (priceLogMax - priceLogMin));
    context.strokeStyle = colors.line;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillStyle = colors.muted;
    context.textAlign = "right";
    context.fillText(formatAxisUsd(value), padding.left - 8, y);
  }

  const fillShareBand = (from, to, color, alpha) => {
    context.save();
    context.fillStyle = color;
    context.globalAlpha = alpha;
    const top = shareY(to);
    const bottom = shareY(from);
    context.fillRect(padding.left, top, chartWidth, Math.max(0, bottom - top));
    context.restore();
  };
  fillShareBand(0.12, 0.18, "#56d69a", document.body.dataset.theme === "dark" ? 0.11 : 0.08);
  fillShareBand(0.6, 1, colors.red, document.body.dataset.theme === "dark" ? 0.045 : 0.035);

  [0, 0.12, 0.18, 0.3, 0.6, 1].forEach((value) => {
    const y = shareY(value);
    context.strokeStyle = value === 0.12 || value === 0.18 ? "rgba(86,214,154,.65)" : colors.line;
    context.setLineDash(value === 0.12 || value === 0.18 ? [6, 5] : []);
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = value === 0.12 || value === 0.18 ? colors.green : colors.muted;
    context.textAlign = "right";
    context.fillText(`${Math.round(value * 100)}%`, padding.left - 8, y);
  });

  const drawLine = (key, color, lineWidth, yFor, alpha = 1) => {
    context.save();
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.globalAlpha = alpha;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.beginPath();
    series.forEach((point, index) => {
      const x = xFor(point.date);
      const y = yFor(point[key]);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
    context.restore();
  };

  drawLine("price", colors.ink, compact ? 1.5 : 1.9, priceY, 0.9);
  drawLine("underThreeMonths", "#f0a13d", compact ? 2 : 2.45, shareY, 1);
  drawLine("average30", "#63d5c4", compact ? 1.35 : 1.75, shareY, 0.9);

  if (under3mHodlRange === "all") {
    under3mHodlLows.forEach((low, index) => {
      const point = series.find((row) => row.date.toISOString().slice(0, 10) === low.date);
      if (!point) return;
      const x = xFor(point.date);
      const y = shareY(point.underThreeMonths);
      context.save();
      context.strokeStyle = colors.red;
      context.fillStyle = colors.red;
      context.lineWidth = 1.4;
      context.setLineDash([4, 4]);
      context.beginPath();
      context.moveTo(x, shareTop);
      context.lineTo(x, y - 6);
      context.stroke();
      context.setLineDash([]);
      context.beginPath();
      context.arc(x, y, compact ? 3.4 : 4.2, 0, Math.PI * 2);
      context.fill();
      context.font = compact ? "700 8px JetBrains Mono" : "700 9px JetBrains Mono";
      context.textAlign = index === 0 ? "left" : index === under3mHodlLows.length - 1 ? "right" : "center";
      context.fillText(`${low.date.slice(0, 4)} · ${(Number(low.value) * 100).toFixed(1)}%`, x, shareTop + 10);
      context.restore();
    });
  }

  context.save();
  context.fillStyle = colors.ink;
  context.globalAlpha = document.body.dataset.theme === "dark" ? 0.085 : 0.065;
  context.font = `800 ${Math.max(30, Math.min(width * 0.085, height * 0.15, 86))}px Inter`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  drawBrandWatermark(context, padding.left + chartWidth / 2, padding.top + chartHeight / 2);
  context.restore();

  const latest = series.at(-1);
  [[priceY(latest.price), colors.ink, 3], [shareY(latest.underThreeMonths), "#f0a13d", 4.5]].forEach(([y, color, radius]) => {
    context.fillStyle = color;
    context.beginPath();
    context.arc(xFor(latest.date), y, radius, 0, Math.PI * 2);
    context.fill();
  });

  const xTicks = compact ? 4 : 7;
  const shortRange = ["7", "30", "90"].includes(under3mHodlRange);
  const dateFormatter = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", {
    year: shortRange ? undefined : "numeric",
    month: "short",
    day: shortRange ? "2-digit" : undefined
  });
  context.textBaseline = "alphabetic";
  for (let index = 0; index < xTicks; index += 1) {
    const progress = index / Math.max(xTicks - 1, 1);
    const date = new Date(startTime + progress * (endTime - startTime));
    const x = padding.left + progress * chartWidth;
    context.fillStyle = colors.muted;
    context.textAlign = index === 0 ? "left" : index === xTicks - 1 ? "right" : "center";
    context.fillText(dateFormatter.format(date), x, height - 13);
  }

  under3mHodlChartState = { series, padding, chartWidth, width, height };
};

const showUnder3mHodlTooltip = (event) => {
  const canvas = document.querySelector("#under-3m-hodl-chart");
  const tooltip = document.querySelector("#under-3m-hodl-tooltip");
  if (!canvas || !tooltip || !under3mHodlChartState) return;
  const { series, padding, chartWidth, width, height } = under3mHodlChartState;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * width;
  const progress = Math.max(0, Math.min(1, (x - padding.left) / Math.max(chartWidth, 1)));
  const point = series[Math.round(progress * (series.length - 1))];
  if (!point) return;
  const date = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "2-digit", day: "2-digit" }).format(point.date);
  tooltip.innerHTML = `<strong>${date}</strong><span>BTC <i>${formatUsd(point.price)}</i></span><span>&lt;3M Realized Cap <i>${(point.underThreeMonths * 100).toFixed(2)}%</i></span><span>7D / 30D <i>${(point.average7 * 100).toFixed(2)}% / ${(point.average30 * 100).toFixed(2)}%</i></span>`;
  tooltip.hidden = false;
  const tooltipWidth = tooltip.offsetWidth || 240;
  tooltip.style.left = `${Math.max(8, Math.min(rect.width - tooltipWidth - 8, event.clientX - rect.left + 14))}px`;
  tooltip.style.top = `${Math.max(8, Math.min(height - 124, event.clientY - rect.top - 72))}px`;
};

const hideUnder3mHodlTooltip = () => {
  const tooltip = document.querySelector("#under-3m-hodl-tooltip");
  if (tooltip) tooltip.hidden = true;
};

const getSth200dmaVisibleSeries = () => {
  if (!sth200dmaSeries.length || sth200dmaRange === "all") return sth200dmaSeries;
  const days = Number(sth200dmaRange);
  const end = sth200dmaSeries.at(-1).date.getTime();
  const start = end - Math.max(days - 1, 1) * 86_400_000;
  const visible = sth200dmaSeries.filter((point) => point.date.getTime() >= start);
  return visible.length >= 2 ? visible : sth200dmaSeries.slice(-2);
};

const drawSth200dmaChart = () => {
  const canvas = document.querySelector("#sth-200dma-chart");
  const stage = canvas?.closest(".sth-200dma-stage");
  const series = getSth200dmaVisibleSeries();
  if (!canvas || !stage || series.length < 2) {
    drawEmptyChart("#sth-200dma-chart");
    sth200dmaChartState = null;
    return;
  }

  canvas.style.removeProperty("height");
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height || stage.clientHeight || 560, 360);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = chartColors();
  const compact = width < 700;
  const padding = { top: 30, right: compact ? 22 : 32, bottom: 44, left: compact ? 58 : 76 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const startTime = series[0].date.getTime();
  const endTime = series.at(-1).date.getTime();
  const xFor = (date) => padding.left + ((date.getTime() - startTime) / Math.max(endTime - startTime, 1)) * chartWidth;
  const values = series.flatMap((point) => [point.price, point.sth, point.dma200]).filter((value) => Number.isFinite(value) && value > 0);
  const logMin = Math.log10(Math.min(...values)) - 0.08;
  const logMax = Math.log10(Math.max(...values)) + 0.08;
  const yFor = (value) => padding.top + (1 - (Math.log10(Math.max(value, 0.0001)) - logMin) / Math.max(logMax - logMin, 0.0001)) * chartHeight;

  context.clearRect(0, 0, width, height);
  context.font = "700 10px JetBrains Mono";
  context.lineWidth = 1;
  context.textBaseline = "middle";
  for (let index = 0; index < 5; index += 1) {
    const progress = index / 4;
    const y = padding.top + progress * chartHeight;
    const value = 10 ** (logMax - progress * (logMax - logMin));
    context.strokeStyle = colors.line;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillStyle = colors.muted;
    context.textAlign = "right";
    context.fillText(formatAxisUsd(value), padding.left - 9, y);
  }

  const drawLine = (key, color, lineWidth, alpha = 1) => {
    context.save();
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.globalAlpha = alpha;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.beginPath();
    series.forEach((point, index) => {
      const x = xFor(point.date);
      const y = yFor(point[key]);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
    context.restore();
  };

  drawLine("price", "#8a97a2", compact ? 1.25 : 1.6, 0.75);
  drawLine("dma200", colors.ink, compact ? 2 : 2.4, 0.98);
  drawLine("sth", "#ef5a4f", compact ? 2.1 : 2.65, 1);

  const visibleCrosses = sth200dmaMacroCrosses.filter((cross) => {
    const timestamp = Date.parse(`${cross.date}T00:00:00Z`);
    return timestamp >= startTime && timestamp <= endTime;
  });
  visibleCrosses.forEach((cross, index) => {
    const x = xFor(new Date(`${cross.date}T00:00:00Z`));
    context.save();
    context.strokeStyle = "#34bde8";
    context.fillStyle = "#34bde8";
    context.lineWidth = 1.3;
    context.setLineDash([5, 5]);
    context.beginPath();
    context.moveTo(x, padding.top);
    context.lineTo(x, height - padding.bottom);
    context.stroke();
    context.setLineDash([]);
    context.font = compact ? "700 8px JetBrains Mono" : "700 9px JetBrains Mono";
    context.textAlign = index === visibleCrosses.length - 1 ? "right" : "left";
    context.fillText(`${cross.date.slice(0, 4)} GOLDEN CROSS`, x + (index === visibleCrosses.length - 1 ? -5 : 5), padding.top + 10);
    context.restore();
  });

  if (sth200dmaRange === "all") {
    sth200dmaHistoricalCycles.forEach((cycle, index) => {
      const start = new Date(`${cycle.crossDate}T00:00:00Z`);
      const end = new Date(`${cycle.peakDate}T00:00:00Z`);
      if (start.getTime() < startTime || end.getTime() > endTime) return;
      const x1 = xFor(start);
      const x2 = xFor(end);
      const y = padding.top + chartHeight * (0.28 + (index % 3) * 0.2);
      context.save();
      context.strokeStyle = "rgba(52,189,232,.78)";
      context.fillStyle = "#34bde8";
      context.lineWidth = 1.2;
      context.beginPath();
      context.moveTo(x1, y);
      context.lineTo(x2, y);
      context.stroke();
      context.beginPath();
      context.moveTo(x1, y);
      context.lineTo(x1 + 7, y - 4);
      context.lineTo(x1 + 7, y + 4);
      context.closePath();
      context.fill();
      context.beginPath();
      context.moveTo(x2, y);
      context.lineTo(x2 - 7, y - 4);
      context.lineTo(x2 - 7, y + 4);
      context.closePath();
      context.fill();
      context.font = compact ? "700 8px JetBrains Mono" : "800 10px JetBrains Mono";
      context.textAlign = "center";
      context.fillText(`≈ ${Number(cycle.monthsToPeak).toFixed(1)} MONTHS`, (x1 + x2) / 2, y - 10);
      context.restore();
    });
  }

  context.save();
  context.fillStyle = colors.ink;
  context.font = `800 ${Math.max(30, Math.min(width * 0.085, height * 0.15, 86))}px Inter`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  drawBrandWatermark(context, padding.left + chartWidth / 2, padding.top + chartHeight / 2);
  context.restore();

  const latest = series.at(-1);
  [[latest.sth, "#ef5a4f"], [latest.dma200, colors.ink]].forEach(([value, color]) => {
    context.fillStyle = color;
    context.beginPath();
    context.arc(xFor(latest.date), yFor(value), compact ? 3.2 : 4, 0, Math.PI * 2);
    context.fill();
  });

  const xTicks = compact ? 4 : 7;
  const shortRange = ["7", "30", "90"].includes(sth200dmaRange);
  const dateFormatter = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", {
    year: shortRange ? undefined : "numeric",
    month: "short",
    day: shortRange ? "2-digit" : undefined
  });
  context.textBaseline = "alphabetic";
  for (let index = 0; index < xTicks; index += 1) {
    const progress = index / Math.max(xTicks - 1, 1);
    const date = new Date(startTime + progress * (endTime - startTime));
    const x = padding.left + progress * chartWidth;
    context.fillStyle = colors.muted;
    context.textAlign = index === 0 ? "left" : index === xTicks - 1 ? "right" : "center";
    context.fillText(dateFormatter.format(date), x, height - 13);
  }
  sth200dmaChartState = { series, padding, chartWidth, width, height };
};

const showSth200dmaTooltip = (event) => {
  const canvas = document.querySelector("#sth-200dma-chart");
  const tooltip = document.querySelector("#sth-200dma-tooltip");
  if (!canvas || !tooltip || !sth200dmaChartState) return;
  const { series, padding, chartWidth, width, height } = sth200dmaChartState;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * width;
  const progress = Math.max(0, Math.min(1, (x - padding.left) / Math.max(chartWidth, 1)));
  const point = series[Math.round(progress * (series.length - 1))];
  if (!point) return;
  const date = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "2-digit", day: "2-digit" }).format(point.date);
  tooltip.innerHTML = `<strong>${date}</strong><span>BTC <i>${formatUsd(point.price)}</i></span><span>STH RP <i>${formatUsd(point.sth)}</i></span><span>200DMA <i>${formatUsd(point.dma200)}</i></span><span>SPREAD <i>${point.spreadPercent >= 0 ? "+" : ""}${point.spreadPercent.toFixed(2)}%</i></span>`;
  tooltip.hidden = false;
  const tooltipWidth = tooltip.offsetWidth || 240;
  tooltip.style.left = `${Math.max(8, Math.min(rect.width - tooltipWidth - 8, event.clientX - rect.left + 14))}px`;
  tooltip.style.top = `${Math.max(8, Math.min(height - 142, event.clientY - rect.top - 72))}px`;
};

const hideSth200dmaTooltip = () => {
  const tooltip = document.querySelector("#sth-200dma-tooltip");
  if (tooltip) tooltip.hidden = true;
};

const getVddMedianVisibleSeries = () => {
  if (!vddMedianSeries.length || vddMedianRange === "all") return vddMedianSeries;
  const days = Number(vddMedianRange);
  const end = vddMedianSeries.at(-1).date.getTime();
  const start = end - Math.max(days - 1, 1) * 86_400_000;
  const visible = vddMedianSeries.filter((point) => point.date.getTime() >= start);
  return visible.length >= 2 ? visible : vddMedianSeries.slice(-2);
};

const drawVddMedianCycleChart = () => {
  const canvas = document.querySelector("#vdd-median-chart");
  const stage = canvas?.closest(".vdd-median-stage");
  const series = getVddMedianVisibleSeries();
  if (!canvas || !stage || series.length < 2) {
    drawEmptyChart("#vdd-median-chart");
    vddMedianChartState = null;
    return;
  }

  canvas.style.removeProperty("height");
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height || stage.clientHeight || 590, 360);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = chartColors();
  const compact = width < 700;
  const padding = { top: 34, right: compact ? 52 : 70, bottom: 46, left: compact ? 58 : 76 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const startTime = series[0].date.getTime();
  const endTime = series.at(-1).date.getTime();
  const xFor = (date) => padding.left + ((date.getTime() - startTime) / Math.max(endTime - startTime, 1)) * chartWidth;
  const values = series.flatMap((point) => [point.price, point.median]).filter((value) => Number.isFinite(value) && value > 0);
  const logMin = Math.log10(Math.min(...values)) - 0.08;
  const logMax = Math.log10(Math.max(...values)) + 0.08;
  const yForPrice = (value) => padding.top + (1 - (Math.log10(Math.max(value, 0.0001)) - logMin) / Math.max(logMax - logMin, 0.0001)) * chartHeight;
  const vddMax = Math.max(3.1, ...series.map((point) => point.vdd).filter(Number.isFinite));
  const yForVdd = (value) => padding.top + (1 - Math.min(Math.max(value, 0), vddMax) / vddMax) * chartHeight;

  context.clearRect(0, 0, width, height);
  const dailyWidth = Math.max(1.5, chartWidth / Math.max(series.length - 1, 1));
  series.forEach((point) => {
    const x = xFor(point.date);
    if (point.bottomSignal) {
      context.fillStyle = "rgba(28,184,125,.13)";
      context.fillRect(x - dailyWidth / 2, padding.top, Math.max(dailyWidth, 1), chartHeight);
    }
    if (point.topSignal) {
      context.fillStyle = "rgba(239,90,79,.34)";
      context.fillRect(x - Math.max(dailyWidth, 2) / 2, padding.top, Math.max(dailyWidth, 2), chartHeight);
    }
  });

  context.font = "700 10px JetBrains Mono";
  context.lineWidth = 1;
  context.textBaseline = "middle";
  for (let index = 0; index < 5; index += 1) {
    const progress = index / 4;
    const y = padding.top + progress * chartHeight;
    const value = 10 ** (logMax - progress * (logMax - logMin));
    context.strokeStyle = colors.line;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillStyle = colors.muted;
    context.textAlign = "right";
    context.fillText(formatAxisUsd(value), padding.left - 9, y);
  }

  [0.9, 1.5, 2.9].forEach((value) => {
    const y = yForVdd(value);
    context.save();
    context.strokeStyle = value === 0.9 ? "rgba(28,184,125,.45)" : "rgba(239,90,79,.42)";
    context.setLineDash([4, 5]);
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = value === 0.9 ? "#1cb87d" : "#ef5a4f";
    context.textAlign = "left";
    context.fillText(`${value.toFixed(1)}x`, width - padding.right + 8, y);
    context.restore();
  });

  const drawLine = (key, yFor, color, lineWidth, alpha = 1) => {
    context.save();
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.globalAlpha = alpha;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.beginPath();
    series.forEach((point, index) => {
      const x = xFor(point.date);
      const y = yFor(point[key]);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
    context.restore();
  };

  drawLine("price", yForPrice, "#e77722", compact ? 1.5 : 1.9, 0.92);
  drawLine("median", yForPrice, colors.ink, compact ? 2 : 2.5, 0.98);
  drawLine("vdd", yForVdd, "#34aee8", compact ? 1.2 : 1.55, 0.9);

  if (vddMedianRange === "all") {
    vddMedianReferenceCycles.forEach((cycle, index) => {
      const start = new Date(`${cycle.bottomEnd}T00:00:00Z`);
      const end = new Date(`${cycle.topSignalDate}T00:00:00Z`);
      if (start.getTime() < startTime || end.getTime() > endTime) return;
      const x1 = xFor(start);
      const x2 = xFor(end);
      const y = padding.top + chartHeight * (0.12 + index * 0.11);
      context.save();
      context.strokeStyle = "rgba(239,90,79,.8)";
      context.fillStyle = "#ef5a4f";
      context.lineWidth = 1.3;
      context.beginPath();
      context.moveTo(x1, y);
      context.lineTo(x2, y);
      context.stroke();
      [[x1, 1], [x2, -1]].forEach(([x, direction]) => {
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + direction * 7, y - 4);
        context.lineTo(x + direction * 7, y + 4);
        context.closePath();
        context.fill();
      });
      context.font = compact ? "800 8px JetBrains Mono" : "800 11px JetBrains Mono";
      context.textAlign = "center";
      context.fillText(`${cycle.daysToTop}D`, (x1 + x2) / 2, y - 11);
      context.restore();
    });
  }

  context.save();
  context.fillStyle = colors.ink;
  context.font = `800 ${Math.max(30, Math.min(width * 0.085, height * 0.15, 86))}px Inter`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  drawBrandWatermark(context, padding.left + chartWidth / 2, padding.top + chartHeight / 2);
  context.restore();
  const latest = series.at(-1);
  [[latest.price, "#e77722"], [latest.median, colors.ink]].forEach(([value, color]) => {
    context.fillStyle = color;
    context.beginPath();
    context.arc(xFor(latest.date), yForPrice(value), compact ? 3.1 : 4, 0, Math.PI * 2);
    context.fill();
  });

  const xTicks = compact ? 4 : 7;
  const shortRange = ["7", "30", "90"].includes(vddMedianRange);
  const dateFormatter = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", {
    year: shortRange ? undefined : "numeric",
    month: "short",
    day: shortRange ? "2-digit" : undefined
  });
  context.textBaseline = "alphabetic";
  for (let index = 0; index < xTicks; index += 1) {
    const progress = index / Math.max(xTicks - 1, 1);
    const date = new Date(startTime + progress * (endTime - startTime));
    const x = padding.left + progress * chartWidth;
    context.fillStyle = colors.muted;
    context.textAlign = index === 0 ? "left" : index === xTicks - 1 ? "right" : "center";
    context.fillText(dateFormatter.format(date), x, height - 13);
  }
  vddMedianChartState = { series, padding, chartWidth, width, height };
};

const showVddMedianTooltip = (event) => {
  const canvas = document.querySelector("#vdd-median-chart");
  const tooltip = document.querySelector("#vdd-median-tooltip");
  if (!canvas || !tooltip || !vddMedianChartState) return;
  const { series, padding, chartWidth, width, height } = vddMedianChartState;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * width;
  const progress = Math.max(0, Math.min(1, (x - padding.left) / Math.max(chartWidth, 1)));
  const point = series[Math.round(progress * (series.length - 1))];
  if (!point) return;
  const date = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "2-digit", day: "2-digit" }).format(point.date);
  const signal = point.topSignal ? (currentLanguage === "zh" ? "逃顶风险柱" : "Top-risk bar") : point.bottomSignal ? (currentLanguage === "zh" ? "熊底抄底区" : "Bear-bottom zone") : (currentLanguage === "zh" ? "中性" : "Neutral");
  tooltip.innerHTML = `<strong>${date}</strong><span>BTC <i>${formatUsd(point.price)}</i></span><span>Median <i>${formatUsd(point.median)}</i></span><span>VDD <i>${point.vdd.toFixed(3)}x</i></span><span>BTC / Median <i>${point.medianRatio.toFixed(2)}x</i></span><span>SIGNAL <i>${signal}</i></span>`;
  tooltip.hidden = false;
  const tooltipWidth = tooltip.offsetWidth || 250;
  tooltip.style.left = `${Math.max(8, Math.min(rect.width - tooltipWidth - 8, event.clientX - rect.left + 14))}px`;
  tooltip.style.top = `${Math.max(8, Math.min(height - 164, event.clientY - rect.top - 84))}px`;
};

const hideVddMedianTooltip = () => {
  const tooltip = document.querySelector("#vdd-median-tooltip");
  if (tooltip) tooltip.hidden = true;
};

const getSsrVisibleSeries = () => {
  if (!ssrSeries.length || ssrRange === "all") return ssrSeries;
  const days = Number(ssrRange);
  const end = ssrSeries.at(-1).date.getTime();
  const start = end - Math.max(days - 1, 1) * 86_400_000;
  const visible = ssrSeries.filter((point) => point.date.getTime() >= start);
  return visible.length >= 2 ? visible : ssrSeries.slice(-2);
};

const drawSsrChart = () => {
  const canvas = document.querySelector("#ssr-chart");
  const stage = canvas?.closest(".ssr-stage");
  const series = getSsrVisibleSeries();
  if (!canvas || !stage || series.length < 2) {
    drawEmptyChart("#ssr-chart");
    ssrChartState = null;
    return;
  }

  canvas.style.removeProperty("height");
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height || stage.clientHeight || 590, 360);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = chartColors();
  const compact = width < 700;
  const padding = { top: 34, right: compact ? 56 : 74, bottom: 46, left: compact ? 60 : 78 };
  const chartWidth = width - padding.left - padding.right;
  const availableHeight = height - padding.top - padding.bottom;
  const panelGap = 30;
  const priceHeight = Math.max(130, availableHeight * 0.52);
  const ssrTop = padding.top + priceHeight + panelGap;
  const ssrHeight = Math.max(110, availableHeight - priceHeight - panelGap);
  const startTime = series[0].date.getTime();
  const endTime = series.at(-1).date.getTime();
  const xFor = (date) => padding.left + ((date.getTime() - startTime) / Math.max(endTime - startTime, 1)) * chartWidth;

  const priceValues = series.map((point) => point.price).filter((value) => Number.isFinite(value) && value > 0);
  const priceLogMin = Math.log10(Math.min(...priceValues)) - 0.08;
  const priceLogMax = Math.log10(Math.max(...priceValues)) + 0.08;
  const yForPrice = (value) => padding.top + (1 - (Math.log10(Math.max(value, 0.0001)) - priceLogMin) / Math.max(priceLogMax - priceLogMin, 0.0001)) * priceHeight;
  const ssrValues = series.flatMap((point) => [point.ssr, point.upper, point.lower]).filter((value) => Number.isFinite(value) && value > 0);
  const ssrLogMin = Math.log10(Math.min(...ssrValues)) - 0.08;
  const ssrLogMax = Math.log10(Math.max(...ssrValues)) + 0.08;
  const yForSsr = (value) => ssrTop + (1 - (Math.log10(Math.max(value, 0.0001)) - ssrLogMin) / Math.max(ssrLogMax - ssrLogMin, 0.0001)) * ssrHeight;

  context.clearRect(0, 0, width, height);
  context.font = "700 10px JetBrains Mono";
  context.lineWidth = 1;
  context.textBaseline = "middle";
  for (let index = 0; index < 4; index += 1) {
    const progress = index / 3;
    const priceY = padding.top + progress * priceHeight;
    const ssrY = ssrTop + progress * ssrHeight;
    context.strokeStyle = colors.line;
    context.beginPath();
    context.moveTo(padding.left, priceY);
    context.lineTo(width - padding.right, priceY);
    context.stroke();
    context.beginPath();
    context.moveTo(padding.left, ssrY);
    context.lineTo(width - padding.right, ssrY);
    context.stroke();
    context.fillStyle = colors.muted;
    context.textAlign = "right";
    context.fillText(formatAxisUsd(10 ** (priceLogMax - progress * (priceLogMax - priceLogMin))), padding.left - 9, priceY);
    context.fillText((10 ** (ssrLogMax - progress * (ssrLogMax - ssrLogMin))).toFixed(1), padding.left - 9, ssrY);
  }

  const band = series.filter((point) => Number.isFinite(point.upper) && Number.isFinite(point.lower) && point.upper > 0 && point.lower > 0);
  if (band.length > 1) {
    context.save();
    context.fillStyle = "rgba(113,108,224,.11)";
    context.beginPath();
    band.forEach((point, index) => {
      const x = xFor(point.date);
      const y = yForSsr(point.upper);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    [...band].reverse().forEach((point) => context.lineTo(xFor(point.date), yForSsr(point.lower)));
    context.closePath();
    context.fill();
    context.restore();
  }

  const drawLine = (key, color, lineWidth, yFor, alpha = 1) => {
    context.save();
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.globalAlpha = alpha;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.beginPath();
    let started = false;
    series.forEach((point) => {
      const value = Number(point[key]);
      if (!Number.isFinite(value) || value <= 0) {
        started = false;
        return;
      }
      const x = xFor(point.date);
      const y = yFor(value);
      if (!started) {
        context.moveTo(x, y);
        started = true;
      } else context.lineTo(x, y);
    });
    context.stroke();
    context.restore();
  };

  drawLine("price", colors.ink, compact ? 1.6 : 2.05, yForPrice, 0.96);
  drawLine("upper", "#716ce0", compact ? 1.2 : 1.55, yForSsr, 0.9);
  drawLine("lower", "#aaa6ee", compact ? 1.1 : 1.4, yForSsr, 0.82);
  drawLine("ssr", "#d99035", compact ? 1.7 : 2.2, yForSsr, 1);

  const visibleBreakouts = ssrMacroBreakouts.filter((event) => {
    const time = Date.parse(`${event.date}T00:00:00Z`);
    return time >= startTime && time <= endTime;
  });
  visibleBreakouts.forEach((event, index) => {
    const date = new Date(`${event.date}T00:00:00Z`);
    const x = xFor(date);
    context.save();
    context.strokeStyle = "rgba(239,90,79,.72)";
    context.fillStyle = "#ef5a4f";
    context.lineWidth = 1.2;
    context.setLineDash([5, 6]);
    context.beginPath();
    context.moveTo(x, padding.top);
    context.lineTo(x, ssrTop + ssrHeight);
    context.stroke();
    context.setLineDash([]);
    context.font = compact ? "800 8px JetBrains Mono" : "800 10px JetBrains Mono";
    context.textAlign = index === visibleBreakouts.length - 1 ? "right" : "left";
    context.fillText(event.date.slice(0, 7), x + (index === visibleBreakouts.length - 1 ? -6 : 6), padding.top + 12);
    context.restore();
  });

  context.save();
  context.font = `800 ${Math.max(30, Math.min(width * 0.078, priceHeight * 0.22, 88))}px Inter`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  drawBrandWatermark(context, padding.left + chartWidth / 2, padding.top + availableHeight / 2);
  context.restore();

  const latest = series.at(-1);
  [[latest.price, colors.ink, yForPrice], [latest.ssr, "#d99035", yForSsr], [latest.upper, "#716ce0", yForSsr]].forEach(([value, color, yFor]) => {
    if (!Number.isFinite(value)) return;
    context.fillStyle = color;
    context.beginPath();
    context.arc(xFor(latest.date), yFor(value), compact ? 3.1 : 4, 0, Math.PI * 2);
    context.fill();
  });

  const xTicks = compact ? 4 : 7;
  const shortRange = ["7", "30", "90"].includes(ssrRange);
  const dateFormatter = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", {
    year: shortRange ? undefined : "numeric",
    month: "short",
    day: shortRange ? "2-digit" : undefined
  });
  context.textBaseline = "alphabetic";
  for (let index = 0; index < xTicks; index += 1) {
    const progress = index / Math.max(xTicks - 1, 1);
    const date = new Date(startTime + progress * (endTime - startTime));
    const x = padding.left + progress * chartWidth;
    context.fillStyle = colors.muted;
    context.textAlign = index === 0 ? "left" : index === xTicks - 1 ? "right" : "center";
    context.fillText(dateFormatter.format(date), x, height - 13);
  }
  ssrChartState = { series, padding, chartWidth, width, height };
};

const showSsrTooltip = (event) => {
  const canvas = document.querySelector("#ssr-chart");
  const tooltip = document.querySelector("#ssr-tooltip");
  if (!canvas || !tooltip || !ssrChartState) return;
  const { series, padding, chartWidth, width, height } = ssrChartState;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * width;
  const progress = Math.max(0, Math.min(1, (x - padding.left) / Math.max(chartWidth, 1)));
  const point = series[Math.round(progress * (series.length - 1))];
  if (!point) return;
  const date = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "2-digit", day: "2-digit" }).format(point.date);
  const state = point.aboveUpper ? (currentLanguage === "zh" ? "上轨上方" : "Above upper") : point.belowLower ? (currentLanguage === "zh" ? "下轨下方" : "Below lower") : (currentLanguage === "zh" ? "通道内" : "Inside band");
  tooltip.innerHTML = `<strong>${date}</strong><span>BTC <i>${formatUsd(point.price)}</i></span><span>SSR <i>${point.ssr.toFixed(3)}</i></span><span>Upper BB <i>${Number.isFinite(point.upper) ? point.upper.toFixed(3) : "--"}</i></span><span>Lower BB <i>${Number.isFinite(point.lower) ? point.lower.toFixed(3) : "--"}</i></span><span>SIGNAL <i>${state}</i></span>`;
  tooltip.hidden = false;
  const tooltipWidth = tooltip.offsetWidth || 250;
  tooltip.style.left = `${Math.max(8, Math.min(rect.width - tooltipWidth - 8, event.clientX - rect.left + 14))}px`;
  tooltip.style.top = `${Math.max(8, Math.min(height - 164, event.clientY - rect.top - 84))}px`;
};

const hideSsrTooltip = () => {
  const tooltip = document.querySelector("#ssr-tooltip");
  if (tooltip) tooltip.hidden = true;
};

const getSthBandsVisibleSeries = () => {
  if (!sthBandsSeries.length || sthBandsRange === "all") return sthBandsSeries;
  const days = Number(sthBandsRange);
  const end = sthBandsSeries.at(-1).date.getTime();
  const start = end - Math.max(days - 1, 1) * 86_400_000;
  const visible = sthBandsSeries.filter((point) => point.date.getTime() >= start);
  return visible.length >= 2 ? visible : sthBandsSeries.slice(-2);
};

const drawSthBandsChart = () => {
  const canvas = document.querySelector("#sth-bands-chart");
  const stage = canvas?.closest(".sth-bands-stage");
  const series = getSthBandsVisibleSeries();
  if (!canvas || !stage || series.length < 2) {
    drawEmptyChart("#sth-bands-chart");
    sthBandsChartState = null;
    return;
  }

  canvas.style.removeProperty("height");
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height || stage.clientHeight || 590, 360);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = chartColors();
  const compact = width < 700;
  const padding = { top: 34, right: compact ? 58 : 82, bottom: 46, left: compact ? 64 : 82 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const projection = sthBandsRange === "all" ? sthBandsProjection : [];
  const startTime = series[0].date.getTime();
  const endTime = projection.length ? projection.at(-1).date.getTime() : series.at(-1).date.getTime();
  const xFor = (date) => padding.left + ((date.getTime() - startTime) / Math.max(endTime - startTime, 1)) * chartWidth;
  const keys = Array.from({ length: 9 }, (_, index) => `line${index + 1}`);
  const allRows = [...series, ...projection];
  const values = allRows.flatMap((point) => [point.price, ...keys.map((key) => point[key])])
    .filter((value) => Number.isFinite(value) && value > 0);
  const logMin = Math.log10(Math.min(...values)) - 0.08;
  const logMax = Math.log10(Math.max(...values)) + 0.08;
  const yFor = (value) => padding.top + (1 - (Math.log10(Math.max(value, 0.0001)) - logMin) / Math.max(logMax - logMin, 0.0001)) * chartHeight;
  const palette = ["#557bd0", "#648ec7", "#6ca493", "#82aaa0", "#9aa8a5", "#c4ad79", "#dd8f51", "#d57354", "#bc5548"];
  const fills = ["rgba(85,123,208,.11)", "rgba(100,142,199,.10)", "rgba(108,164,147,.10)", "rgba(130,170,160,.09)", "rgba(196,173,121,.09)", "rgba(221,143,81,.10)", "rgba(213,115,84,.10)", "rgba(188,85,72,.11)"];

  context.clearRect(0, 0, width, height);
  context.font = "700 10px JetBrains Mono";
  context.lineWidth = 1;
  context.textBaseline = "middle";
  for (let index = 0; index < 5; index += 1) {
    const progress = index / 4;
    const y = padding.top + progress * chartHeight;
    context.strokeStyle = colors.line;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillStyle = colors.muted;
    context.textAlign = "right";
    context.fillText(formatAxisUsd(10 ** (logMax - progress * (logMax - logMin))), padding.left - 10, y);
  }

  for (let bandIndex = 0; bandIndex < 8; bandIndex += 1) {
    context.save();
    context.fillStyle = fills[bandIndex];
    context.beginPath();
    series.forEach((point, index) => {
      const x = xFor(point.date);
      const y = yFor(point[`line${bandIndex + 2}`]);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    [...series].reverse().forEach((point) => context.lineTo(xFor(point.date), yFor(point[`line${bandIndex + 1}`])));
    context.closePath();
    context.fill();
    context.restore();
  }

  const drawLine = (rows, key, color, lineWidth, alpha = 1, dashed = false) => {
    context.save();
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.globalAlpha = alpha;
    context.lineJoin = "round";
    context.lineCap = "round";
    if (dashed) context.setLineDash([6, 6]);
    context.beginPath();
    let started = false;
    rows.forEach((point) => {
      const value = Number(point[key]);
      if (!Number.isFinite(value) || value <= 0) {
        started = false;
        return;
      }
      const x = xFor(point.date);
      const y = yFor(value);
      if (!started) {
        context.moveTo(x, y);
        started = true;
      } else context.lineTo(x, y);
    });
    context.stroke();
    context.restore();
  };

  keys.forEach((key, index) => drawLine(series, key, palette[index], index === 4 || index === 6 ? (compact ? 1.5 : 2.1) : (compact ? 0.95 : 1.3), index === 4 || index === 6 ? 1 : 0.84));
  drawLine(series, "price", colors.ink, compact ? 1.8 : 2.35, 1);

  if (projection.length) {
    const bridge = [{ ...series.at(-1), scenario: true }, ...projection];
    keys.forEach((key, index) => drawLine(bridge, key, palette[index], index === 4 || index === 6 ? 1.55 : 1, 0.68, true));
    const boundaryX = xFor(series.at(-1).date);
    context.save();
    context.strokeStyle = colors.cyan;
    context.fillStyle = colors.cyan;
    context.setLineDash([4, 5]);
    context.beginPath();
    context.moveTo(boundaryX, padding.top);
    context.lineTo(boundaryX, padding.top + chartHeight);
    context.stroke();
    context.setLineDash([]);
    context.font = compact ? "800 8px JetBrains Mono" : "800 10px JetBrains Mono";
    context.textAlign = "left";
    context.fillText(currentLanguage === "zh" ? "365D 情景延伸" : "365D SCENARIO", boundaryX + 6, padding.top + 12);
    context.restore();
  }

  const visibleBreakouts = sthBandsMacroBreakouts.filter((event) => {
    const time = Date.parse(`${event.date}T00:00:00Z`);
    return time >= startTime && time <= series.at(-1).date.getTime();
  });
  visibleBreakouts.forEach((event, index) => {
    const x = xFor(new Date(`${event.date}T00:00:00Z`));
    context.save();
    context.strokeStyle = "rgba(65,190,221,.74)";
    context.fillStyle = colors.cyan;
    context.lineWidth = 1.15;
    context.setLineDash([5, 6]);
    context.beginPath();
    context.moveTo(x, padding.top);
    context.lineTo(x, padding.top + chartHeight);
    context.stroke();
    context.setLineDash([]);
    context.font = compact ? "800 8px JetBrains Mono" : "800 10px JetBrains Mono";
    context.textAlign = index === visibleBreakouts.length - 1 ? "right" : "left";
    context.fillText(`${event.date.slice(0, 7)} L7`, x + (index === visibleBreakouts.length - 1 ? -6 : 6), padding.top + 12);
    context.restore();
  });

  context.save();
  context.fillStyle = colors.ink;
  context.font = `800 ${Math.max(30, Math.min(width * 0.085, height * 0.15, 86))}px Inter`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  drawBrandWatermark(context, padding.left + chartWidth / 2, padding.top + chartHeight / 2);
  context.restore();

  const latest = series.at(-1);
  [[latest.price, colors.ink], [latest.line7, palette[6]], [latest.line5, palette[4]]].forEach(([value, color]) => {
    context.fillStyle = color;
    context.beginPath();
    context.arc(xFor(latest.date), yFor(value), compact ? 3.1 : 4, 0, Math.PI * 2);
    context.fill();
  });

  const xTicks = compact ? 4 : 7;
  const shortRange = ["7", "30", "90"].includes(sthBandsRange);
  const dateFormatter = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", {
    year: shortRange ? undefined : "numeric",
    month: "short",
    day: shortRange ? "2-digit" : undefined
  });
  context.textBaseline = "alphabetic";
  for (let index = 0; index < xTicks; index += 1) {
    const progress = index / Math.max(xTicks - 1, 1);
    const date = new Date(startTime + progress * (endTime - startTime));
    const x = padding.left + progress * chartWidth;
    context.fillStyle = colors.muted;
    context.textAlign = index === 0 ? "left" : index === xTicks - 1 ? "right" : "center";
    context.fillText(dateFormatter.format(date), x, height - 13);
  }
  sthBandsChartState = { series, padding, chartWidth, width, height };
};

const showSthBandsTooltip = (event) => {
  const canvas = document.querySelector("#sth-bands-chart");
  const tooltip = document.querySelector("#sth-bands-tooltip");
  if (!canvas || !tooltip || !sthBandsChartState) return;
  const { series, padding, chartWidth, width, height } = sthBandsChartState;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * width;
  const progress = Math.max(0, Math.min(1, (x - padding.left) / Math.max(chartWidth, 1)));
  const point = series[Math.round(progress * (series.length - 1))];
  if (!point) return;
  const date = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "2-digit", day: "2-digit" }).format(point.date);
  const state = point.price >= point.line7 ? (currentLanguage === "zh" ? "Line7 上方" : "Above Line7") : point.price >= point.line5 ? (currentLanguage === "zh" ? "成本中枢上方" : "Above basis") : (currentLanguage === "zh" ? "成本中枢下方" : "Below basis");
  tooltip.innerHTML = `<strong>${date}</strong><span>BTC <i>${formatUsd(point.price)}</i></span><span>Line7 · +1σ <i>${formatUsd(point.line7)}</i></span><span>Line5 · Mean <i>${formatUsd(point.line5)}</i></span><span>σ <i>${formatUsd(point.sigma)}</i></span><span>SIGNAL <i>${state}</i></span>`;
  tooltip.hidden = false;
  const tooltipWidth = tooltip.offsetWidth || 250;
  tooltip.style.left = `${Math.max(8, Math.min(rect.width - tooltipWidth - 8, event.clientX - rect.left + 14))}px`;
  tooltip.style.top = `${Math.max(8, Math.min(height - 164, event.clientY - rect.top - 84))}px`;
};

const hideSthBandsTooltip = () => {
  const tooltip = document.querySelector("#sth-bands-tooltip");
  if (tooltip) tooltip.hidden = true;
};

const getPercentProfitEx10yVisibleSeries = () => {
  if (!percentProfitEx10ySeries.length || percentProfitEx10yRange === "all") return percentProfitEx10ySeries;
  const days = Number(percentProfitEx10yRange);
  const end = percentProfitEx10ySeries.at(-1).date.getTime();
  const start = end - Math.max(days - 1, 1) * 86_400_000;
  const visible = percentProfitEx10ySeries.filter((point) => point.date.getTime() >= start);
  return visible.length >= 2 ? visible : percentProfitEx10ySeries.slice(-2);
};

const drawPercentProfitEx10yChart = () => {
  const canvas = document.querySelector("#percent-profit-ex-10y-chart");
  const stage = canvas?.closest(".percent-profit-ex-10y-stage");
  const series = getPercentProfitEx10yVisibleSeries();
  if (!canvas || !stage || series.length < 2) {
    drawEmptyChart("#percent-profit-ex-10y-chart");
    percentProfitEx10yChartState = null;
    return;
  }

  canvas.style.removeProperty("height");
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height || stage.clientHeight || 590, 360);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = chartColors();
  const compact = width < 700;
  const padding = { top: 32, right: compact ? 56 : 76, bottom: 46, left: compact ? 58 : 72 };
  const gap = compact ? 26 : 34;
  const availableHeight = height - padding.top - padding.bottom - gap;
  const priceHeight = availableHeight * 0.48;
  const percentTop = padding.top + priceHeight + gap;
  const percentHeight = availableHeight - priceHeight;
  const chartWidth = width - padding.left - padding.right;
  const projection = percentProfitEx10yRange === "all" ? percentProfitEx10yProjection : [];
  const startTime = series[0].date.getTime();
  const historicalEndTime = series.at(-1).date.getTime();
  const endTime = projection.length ? projection.at(-1).date.getTime() : historicalEndTime;
  const xFor = (date) => padding.left + ((date.getTime() - startTime) / Math.max(endTime - startTime, 1)) * chartWidth;
  const prices = series.map((point) => point.price).filter((value) => Number.isFinite(value) && value > 0);
  const priceLogMin = Math.log10(Math.min(...prices)) - 0.08;
  const priceLogMax = Math.log10(Math.max(...prices)) + 0.08;
  const priceY = (value) => padding.top + (1 - (Math.log10(Math.max(value, 0.0001)) - priceLogMin) / Math.max(priceLogMax - priceLogMin, 0.0001)) * priceHeight;
  const percentY = (value) => percentTop + (1 - Math.max(35, Math.min(100, value)) / 65 + 35 / 65) * percentHeight;

  context.clearRect(0, 0, width, height);
  context.font = "700 10px JetBrains Mono";
  context.textBaseline = "middle";
  context.lineWidth = 1;

  const drawGrid = (top, panelHeight, values, yFor, formatter, side = "left") => {
    values.forEach((value) => {
      const y = yFor(value);
      context.strokeStyle = colors.line;
      context.beginPath();
      context.moveTo(padding.left, y);
      context.lineTo(width - padding.right, y);
      context.stroke();
      context.fillStyle = colors.muted;
      context.textAlign = side === "left" ? "right" : "left";
      context.fillText(formatter(value), side === "left" ? padding.left - 9 : width - padding.right + 9, y);
    });
    context.strokeStyle = colors.line;
    context.strokeRect(padding.left, top, chartWidth, panelHeight);
  };

  const priceTicks = Array.from({ length: compact ? 4 : 5 }, (_, index) => 10 ** (priceLogMax - index * (priceLogMax - priceLogMin) / (compact ? 3 : 4)));
  drawGrid(padding.top, priceHeight, priceTicks, priceY, formatAxisUsd, "left");
  drawGrid(percentTop, percentHeight, [40, 55, 60, 75, 90, 100], percentY, (value) => `${value}%`, "right");

  if (percentProfitEx10yRange === "all") {
    percentProfitEx10yReferenceCycles.forEach((cycle) => {
      if (!cycle.signalStart || !cycle.signalEnd) return;
      const start = new Date(`${cycle.signalStart}T00:00:00Z`);
      const end = new Date(`${cycle.signalEnd}T00:00:00Z`);
      if (end < series[0].date || start > series.at(-1).date) return;
      const left = xFor(start < series[0].date ? series[0].date : start);
      const right = xFor(end > series.at(-1).date ? series.at(-1).date : end);
      context.save();
      context.fillStyle = cycle.threshold === 55 ? "rgba(239,90,79,.18)" : "rgba(239,122,100,.13)";
      context.fillRect(left, padding.top, Math.max(2, right - left), priceHeight + gap + percentHeight);
      context.fillStyle = colors.red;
      context.font = compact ? "800 8px JetBrains Mono" : "800 10px JetBrains Mono";
      context.textAlign = "center";
      context.fillText(`${cycle.cycle} · <${cycle.threshold}%`, (left + right) / 2, padding.top + 13);
      context.restore();
    });
  }

  [{ value: 60, color: "#ef7a64", label: "60% LEGACY" }, { value: 55, color: colors.red, label: "55% MODERN" }].forEach((threshold) => {
    const y = percentY(threshold.value);
    context.save();
    context.strokeStyle = threshold.color;
    context.fillStyle = threshold.color;
    context.globalAlpha = 0.9;
    context.setLineDash([6, 6]);
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.setLineDash([]);
    context.textAlign = "left";
    context.font = compact ? "800 8px JetBrains Mono" : "800 9px JetBrains Mono";
    context.fillText(threshold.label, padding.left + 6, y - 9);
    context.restore();
  });

  const drawLine = (rows, key, color, widthValue, yFor, alpha = 1, dashed = false) => {
    context.save();
    context.strokeStyle = color;
    context.lineWidth = widthValue;
    context.globalAlpha = alpha;
    context.lineJoin = "round";
    context.lineCap = "round";
    if (dashed) context.setLineDash([7, 6]);
    context.beginPath();
    let started = false;
    rows.forEach((point) => {
      const value = Number(point[key]);
      if (!Number.isFinite(value)) {
        started = false;
        return;
      }
      const x = xFor(point.date);
      const y = yFor(value);
      if (!started) {
        context.moveTo(x, y);
        started = true;
      } else context.lineTo(x, y);
    });
    context.stroke();
    context.restore();
  };

  drawLine(series, "price", colors.ink, compact ? 1.6 : 2, priceY, 0.94);

  context.save();
  const fill = context.createLinearGradient(0, percentTop, 0, percentTop + percentHeight);
  fill.addColorStop(0, "rgba(228,154,53,.20)");
  fill.addColorStop(1, "rgba(228,154,53,.015)");
  context.fillStyle = fill;
  context.beginPath();
  series.forEach((point, index) => {
    const x = xFor(point.date);
    if (index === 0) context.moveTo(x, percentY(35));
    context.lineTo(x, percentY(point.percent7));
  });
  context.lineTo(xFor(series.at(-1).date), percentY(35));
  context.closePath();
  context.fill();
  context.restore();
  drawLine(series, "percentRaw", "#d9a45a", 1, percentY, 0.28);
  drawLine(series, "percent7", "#e49a35", compact ? 1.8 : 2.35, percentY, 1);

  if (projection.length) {
    const bridge = [{ date: series.at(-1).date, percent7: series.at(-1).percent7 }, ...projection];
    drawLine(bridge, "percent7", colors.cyan, compact ? 1.4 : 1.8, percentY, 0.9, true);
    const boundaryX = xFor(series.at(-1).date);
    context.save();
    context.strokeStyle = colors.cyan;
    context.setLineDash([4, 5]);
    context.beginPath();
    context.moveTo(boundaryX, padding.top);
    context.lineTo(boundaryX, percentTop + percentHeight);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = colors.cyan;
    context.font = compact ? "800 8px JetBrains Mono" : "800 10px JetBrains Mono";
    context.textAlign = "left";
    context.fillText(currentLanguage === "zh" ? "365D 情景" : "365D SCENARIO", boundaryX + 6, percentTop + 12);
    context.restore();
  }

  if (percentProfitEx10yRange === "all") {
    percentProfitEx10yReferenceCycles.forEach((cycle) => {
      if (!cycle.lowDate) return;
      const date = new Date(`${cycle.lowDate}T00:00:00Z`);
      const x = xFor(date);
      const y = percentY(Number(cycle.lowPercent));
      context.save();
      context.fillStyle = colors.red;
      context.beginPath();
      context.arc(x, y, compact ? 3 : 4, 0, Math.PI * 2);
      context.fill();
      context.font = compact ? "800 8px JetBrains Mono" : "800 10px JetBrains Mono";
      context.textAlign = "center";
      context.fillText(`${cycle.cycle} · ${Number(cycle.lowPercent).toFixed(1)}%`, x, Math.max(percentTop + 10, y - 13));
      context.restore();
    });
  }

  context.save();
  context.fillStyle = colors.ink;
  context.globalAlpha = document.body.dataset.theme === "dark" ? 0.075 : 0.06;
  context.font = `800 ${Math.max(34, Math.min(width * 0.09, availableHeight * 0.2, 96))}px Inter`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  drawBrandWatermark(context, padding.left + chartWidth / 2, padding.top + availableHeight / 2);
  context.restore();

  const latest = series.at(-1);
  [[priceY(latest.price), colors.ink, 3.5], [percentY(latest.percent7), "#e49a35", 4.5]].forEach(([y, color, radius]) => {
    context.fillStyle = color;
    context.beginPath();
    context.arc(xFor(latest.date), y, radius, 0, Math.PI * 2);
    context.fill();
  });

  const xTicks = compact ? 4 : 7;
  const shortRange = ["7", "30", "90"].includes(percentProfitEx10yRange);
  const dateFormatter = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", {
    year: shortRange ? undefined : "numeric",
    month: "short",
    day: shortRange ? "2-digit" : undefined
  });
  context.textBaseline = "alphabetic";
  for (let index = 0; index < xTicks; index += 1) {
    const progress = index / Math.max(xTicks - 1, 1);
    const date = new Date(startTime + progress * (endTime - startTime));
    const x = padding.left + progress * chartWidth;
    context.fillStyle = colors.muted;
    context.textAlign = index === 0 ? "left" : index === xTicks - 1 ? "right" : "center";
    context.fillText(dateFormatter.format(date), x, height - 13);
  }
  percentProfitEx10yChartState = { series, padding, chartWidth, width, height };
};

const showPercentProfitEx10yTooltip = (event) => {
  const canvas = document.querySelector("#percent-profit-ex-10y-chart");
  const tooltip = document.querySelector("#percent-profit-ex-10y-tooltip");
  if (!canvas || !tooltip || !percentProfitEx10yChartState) return;
  const { series, padding, chartWidth, width, height } = percentProfitEx10yChartState;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * width;
  const progress = Math.max(0, Math.min(1, (x - padding.left) / Math.max(chartWidth, 1)));
  const point = series[Math.round(progress * (series.length - 1))];
  if (!point) return;
  const date = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "2-digit", day: "2-digit" }).format(point.date);
  const supply = (value) => `${(Number(value) / 1_000_000).toFixed(2)}M BTC`;
  tooltip.innerHTML = `<strong>${date}</strong><span>BTC <i>${formatUsd(point.price)}</i></span><span>Profit · 7DMA <i>${point.percent7.toFixed(2)}%</i></span><span>Daily Proxy <i>${point.percentRaw.toFixed(2)}%</i></span><span>Excluded &gt;10Y <i>${supply(point.dormantOver10y)} · ${point.dormantShare.toFixed(2)}%</i></span><span>Active Profit <i>${supply(point.activeProfitSupply)}</i></span>`;
  tooltip.hidden = false;
  const tooltipWidth = tooltip.offsetWidth || 260;
  tooltip.style.left = `${Math.max(8, Math.min(rect.width - tooltipWidth - 8, event.clientX - rect.left + 14))}px`;
  tooltip.style.top = `${Math.max(8, Math.min(height - 170, event.clientY - rect.top - 88))}px`;
};

const hidePercentProfitEx10yTooltip = () => {
  const tooltip = document.querySelector("#percent-profit-ex-10y-tooltip");
  if (tooltip) tooltip.hidden = true;
};

const getSthMvrvVisibleSeries = () => {
  if (!sthMvrvSeries.length || sthMvrvRange === "all") return sthMvrvSeries;
  const days = Number(sthMvrvRange);
  const end = sthMvrvSeries.at(-1).date.getTime();
  const start = end - Math.max(days - 1, 1) * 86_400_000;
  const visible = sthMvrvSeries.filter((point) => point.date.getTime() >= start);
  return visible.length >= 2 ? visible : sthMvrvSeries.slice(-2);
};

const drawSthMvrvChart = () => {
  const canvas = document.querySelector("#sth-mvrv-chart");
  const stage = canvas?.closest(".sth-mvrv-stage");
  const series = getSthMvrvVisibleSeries();
  if (!canvas || !stage || series.length < 2) {
    drawEmptyChart("#sth-mvrv-chart");
    sthMvrvChartState = null;
    return;
  }

  canvas.style.removeProperty("height");
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height || stage.clientHeight || 590, 360);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = chartColors();
  const compact = width < 700;
  const padding = { top: 32, right: compact ? 56 : 76, bottom: 46, left: compact ? 58 : 72 };
  const gap = compact ? 26 : 34;
  const availableHeight = height - padding.top - padding.bottom - gap;
  const priceHeight = availableHeight * 0.5;
  const mvrvTop = padding.top + priceHeight + gap;
  const mvrvHeight = availableHeight - priceHeight;
  const chartWidth = width - padding.left - padding.right;
  const projection = sthMvrvRange === "all" ? sthMvrvProjection : [];
  const startTime = series[0].date.getTime();
  const historicalEndTime = series.at(-1).date.getTime();
  const endTime = projection.length ? projection.at(-1).date.getTime() : historicalEndTime;
  const xFor = (date) => padding.left + ((date.getTime() - startTime) / Math.max(endTime - startTime, 1)) * chartWidth;
  const prices = series.map((point) => point.price).filter((value) => Number.isFinite(value) && value > 0);
  const priceLogMin = Math.log10(Math.min(...prices)) - 0.08;
  const priceLogMax = Math.log10(Math.max(...prices)) + 0.08;
  const priceY = (value) => padding.top + (1 - (Math.log10(Math.max(value, 0.0001)) - priceLogMin) / Math.max(priceLogMax - priceLogMin, 0.0001)) * priceHeight;
  const allMvrv = [...series.map((point) => point.mvrv), ...projection.map((point) => point.mvrv)].filter(Number.isFinite);
  const mvrvMin = Math.max(0.45, Math.min(0.62, Math.min(...allMvrv) - 0.06));
  const mvrvMax = Math.min(2.2, Math.max(1.45, Math.max(...allMvrv) + 0.08));
  const mvrvY = (value) => mvrvTop + (1 - (Math.max(mvrvMin, Math.min(mvrvMax, value)) - mvrvMin) / Math.max(mvrvMax - mvrvMin, 0.001)) * mvrvHeight;

  context.clearRect(0, 0, width, height);
  context.font = "700 10px JetBrains Mono";
  context.textBaseline = "middle";
  context.lineWidth = 1;

  const drawPanelGrid = (top, panelHeight, values, yFor, formatter, side = "left") => {
    values.forEach((value) => {
      const y = yFor(value);
      context.strokeStyle = colors.line;
      context.beginPath();
      context.moveTo(padding.left, y);
      context.lineTo(width - padding.right, y);
      context.stroke();
      context.fillStyle = colors.muted;
      context.textAlign = side === "left" ? "right" : "left";
      context.fillText(formatter(value), side === "left" ? padding.left - 9 : width - padding.right + 9, y);
    });
    context.strokeStyle = colors.line;
    context.strokeRect(padding.left, top, chartWidth, panelHeight);
  };
  const priceTicks = Array.from({ length: compact ? 4 : 5 }, (_, index) => 10 ** (priceLogMax - index * (priceLogMax - priceLogMin) / (compact ? 3 : 4)));
  drawPanelGrid(padding.top, priceHeight, priceTicks, priceY, formatAxisUsd, "left");
  const mvrvTicks = [0.6, 0.8, 1, 1.2, 1.4, 1.6].filter((value) => value >= mvrvMin && value <= mvrvMax);
  drawPanelGrid(mvrvTop, mvrvHeight, mvrvTicks, mvrvY, (value) => value.toFixed(1), "right");

  const cycles = sthMvrvRange === "all"
    ? [...sthMvrvReferenceCycles, ...(sthMvrvCurrentStructure?.firstDip ? [{ ...sthMvrvCurrentStructure, cycle: currentLanguage === "zh" ? "本轮" : "CURRENT" }] : [])]
    : [];
  cycles.forEach((cycle) => {
    const first = cycle.firstDip;
    const second = cycle.secondDip;
    if (!first?.start || !second?.end) return;
    const leftDate = new Date(`${first.start}T00:00:00Z`);
    const rightDate = new Date(`${second.end}T00:00:00Z`);
    if (rightDate < series[0].date || leftDate > series.at(-1).date) return;
    const left = xFor(leftDate < series[0].date ? series[0].date : leftDate);
    const right = xFor(rightDate > series.at(-1).date ? series.at(-1).date : rightDate);
    context.save();
    context.fillStyle = "rgba(239,90,79,.14)";
    context.fillRect(left, padding.top, Math.max(2, right - left), priceHeight + gap + mvrvHeight);
    context.fillStyle = colors.red;
    context.font = compact ? "800 8px JetBrains Mono" : "800 10px JetBrains Mono";
    context.textAlign = "center";
    context.fillText(`${cycle.cycle} ${currentLanguage === "zh" ? "复苏期" : "RECOVERY"}`, (left + right) / 2, padding.top + 13);
    context.restore();
  });

  const breakevenY = mvrvY(1);
  context.save();
  context.strokeStyle = colors.muted;
  context.setLineDash([5, 5]);
  context.beginPath();
  context.moveTo(padding.left, breakevenY);
  context.lineTo(width - padding.right, breakevenY);
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = colors.muted;
  context.textAlign = "left";
  context.font = compact ? "800 8px JetBrains Mono" : "800 9px JetBrains Mono";
  context.fillText(currentLanguage === "zh" ? "1.0 · 短期筹码盈亏平衡" : "1.0 · STH BREAKEVEN", padding.left + 6, breakevenY - 9);
  context.restore();

  const drawLine = (rows, key, color, lineWidth, yFor, alpha = 1, dashed = false) => {
    context.save();
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.globalAlpha = alpha;
    context.lineJoin = "round";
    context.lineCap = "round";
    if (dashed) context.setLineDash([7, 6]);
    context.beginPath();
    let started = false;
    rows.forEach((point) => {
      const value = Number(point[key]);
      if (!Number.isFinite(value)) {
        started = false;
        return;
      }
      const x = xFor(point.date);
      const y = yFor(value);
      if (!started) {
        context.moveTo(x, y);
        started = true;
      } else context.lineTo(x, y);
    });
    context.stroke();
    context.restore();
  };
  drawLine(series, "price", colors.ink, compact ? 1.6 : 2, priceY, 0.95);
  drawLine(series, "mvrv", "#e49a35", compact ? 1.8 : 2.35, mvrvY, 1);

  if (projection.length) {
    const bridge = [{ date: series.at(-1).date, mvrv: series.at(-1).mvrv }, ...projection];
    drawLine(bridge, "mvrv", colors.cyan, compact ? 1.4 : 1.8, mvrvY, 0.9, true);
    const boundaryX = xFor(series.at(-1).date);
    context.save();
    context.strokeStyle = colors.cyan;
    context.setLineDash([4, 5]);
    context.beginPath();
    context.moveTo(boundaryX, padding.top);
    context.lineTo(boundaryX, mvrvTop + mvrvHeight);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = colors.cyan;
    context.textAlign = "left";
    context.font = compact ? "800 8px JetBrains Mono" : "800 10px JetBrains Mono";
    context.fillText(currentLanguage === "zh" ? "365D 情景" : "365D SCENARIO", boundaryX + 6, mvrvTop + 12);
    context.restore();
  }

  cycles.forEach((cycle) => {
    const labels = [
      { point: cycle.firstDip, label: currentLanguage === "zh" ? "首探" : "FIRST DIP", color: colors.green },
      { point: cycle.rebound && { lowDate: cycle.rebound.date, lowMvrv: cycle.rebound.mvrv }, label: currentLanguage === "zh" ? "反弹" : "REBOUND", color: colors.green },
      { point: cycle.secondDip, label: currentLanguage === "zh" ? "二探" : "SECOND DIP", color: colors.green }
    ];
    labels.forEach(({ point, label, color }) => {
      if (!point?.lowDate || !Number.isFinite(Number(point.lowMvrv))) return;
      const date = new Date(`${point.lowDate}T00:00:00Z`);
      if (date < series[0].date || date > series.at(-1).date) return;
      const x = xFor(date);
      const y = mvrvY(Number(point.lowMvrv));
      context.save();
      context.fillStyle = color;
      context.beginPath();
      context.arc(x, y, compact ? 3 : 4, 0, Math.PI * 2);
      context.fill();
      context.font = compact ? "800 7px JetBrains Mono" : "800 9px JetBrains Mono";
      context.textAlign = "center";
      context.fillText(label, x, Math.max(mvrvTop + 10, y - 13));
      context.restore();
    });
  });

  context.save();
  context.fillStyle = colors.ink;
  context.globalAlpha = document.body.dataset.theme === "dark" ? 0.075 : 0.06;
  context.font = `800 ${Math.max(34, Math.min(width * 0.09, availableHeight * 0.2, 96))}px Inter`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  drawBrandWatermark(context, padding.left + chartWidth / 2, padding.top + availableHeight / 2);
  context.restore();

  const latest = series.at(-1);
  [[priceY(latest.price), colors.ink, 3.5], [mvrvY(latest.mvrv), "#e49a35", 4.5]].forEach(([y, color, radius]) => {
    context.fillStyle = color;
    context.beginPath();
    context.arc(xFor(latest.date), y, radius, 0, Math.PI * 2);
    context.fill();
  });

  const xTicks = compact ? 4 : 7;
  const shortRange = ["7", "30", "90"].includes(sthMvrvRange);
  const dateFormatter = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", { year: shortRange ? undefined : "numeric", month: "short", day: shortRange ? "2-digit" : undefined });
  context.textBaseline = "alphabetic";
  for (let index = 0; index < xTicks; index += 1) {
    const progress = index / Math.max(xTicks - 1, 1);
    const date = new Date(startTime + progress * (endTime - startTime));
    const x = padding.left + progress * chartWidth;
    context.fillStyle = colors.muted;
    context.textAlign = index === 0 ? "left" : index === xTicks - 1 ? "right" : "center";
    context.fillText(dateFormatter.format(date), x, height - 13);
  }
  sthMvrvChartState = { series, padding, historicalWidth: xFor(series.at(-1).date) - padding.left, width, height };
};

const showSthMvrvTooltip = (event) => {
  const canvas = document.querySelector("#sth-mvrv-chart");
  const tooltip = document.querySelector("#sth-mvrv-tooltip");
  if (!canvas || !tooltip || !sthMvrvChartState) return;
  const { series, padding, historicalWidth, width, height } = sthMvrvChartState;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * width;
  const progress = Math.max(0, Math.min(1, (x - padding.left) / Math.max(historicalWidth, 1)));
  const point = series[Math.round(progress * (series.length - 1))];
  if (!point) return;
  const date = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "2-digit", day: "2-digit" }).format(point.date);
  const state = point.mvrv >= 1 ? (currentLanguage === "zh" ? "短期筹码整体浮盈" : "STH aggregate profit") : (currentLanguage === "zh" ? "短期筹码整体浮亏" : "STH aggregate loss");
  tooltip.innerHTML = `<strong>${date}</strong><span>BTC <i>${formatUsd(point.price)}</i></span><span>STH Cost <i>${formatUsd(point.sth)}</i></span><span>STH-MVRV <i>${point.mvrv.toFixed(4)}</i></span><span>P/L <i>${point.profitPercent >= 0 ? "+" : ""}${point.profitPercent.toFixed(2)}%</i></span><span>SIGNAL <i>${state}</i></span>`;
  tooltip.hidden = false;
  const tooltipWidth = tooltip.offsetWidth || 250;
  tooltip.style.left = `${Math.max(8, Math.min(rect.width - tooltipWidth - 8, event.clientX - rect.left + 14))}px`;
  tooltip.style.top = `${Math.max(8, Math.min(height - 164, event.clientY - rect.top - 84))}px`;
};

const hideSthMvrvTooltip = () => {
  const tooltip = document.querySelector("#sth-mvrv-tooltip");
  if (tooltip) tooltip.hidden = true;
};

const getVddVisibleSeries = () => {
  if (!vddSeries.length || vddRange === "all") return vddSeries;
  const days = Number(vddRange);
  const end = vddSeries.at(-1).date.getTime();
  const start = end - Math.max(days - 1, 1) * 86_400_000;
  return vddSeries.filter((point) => point.date.getTime() >= start);
};

const drawVddChart = () => {
  const canvas = document.querySelector("#vdd-chart");
  const stage = canvas?.closest(".vdd-stage");
  const series = getVddVisibleSeries();
  if (!canvas || !stage || series.length < 2) {
    drawEmptyChart("#vdd-chart");
    vddChartState = null;
    return;
  }

  canvas.style.removeProperty("height");
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height || stage.clientHeight || 620, 360);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = chartColors();
  const compact = width < 700;
  const padding = { top: 30, right: compact ? 58 : 78, bottom: 44, left: compact ? 50 : 62 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const prices = series.map((point) => point.price).filter((value) => Number.isFinite(value) && value > 0);
  const sortedVdd = series.map((point) => point.vdd).filter(Number.isFinite).sort((left, right) => left - right);
  const percentileMax = sortedVdd[Math.min(sortedVdd.length - 1, Math.floor(sortedVdd.length * 0.995))] || 3;
  const vddMax = Math.max(3.2, Math.min(22, percentileMax + Math.max(0.4, percentileMax * 0.08)));
  const priceLogMin = Math.log10(Math.min(...prices)) - 0.06;
  const priceLogMax = Math.log10(Math.max(...prices)) + 0.06;
  const startTime = series[0].date.getTime();
  const endTime = series.at(-1).date.getTime();
  const xFor = (date) => padding.left + ((date.getTime() - startTime) / Math.max(endTime - startTime, 1)) * chartWidth;
  const vddY = (value) => padding.top + (1 - Math.min(Math.max(value, 0), vddMax) / vddMax) * chartHeight;
  const priceY = (value) => padding.top + (1 - (Math.log10(Math.max(value, 0.0001)) - priceLogMin) / Math.max(priceLogMax - priceLogMin, 0.0001)) * chartHeight;

  context.clearRect(0, 0, width, height);
  context.font = "700 10px JetBrains Mono";
  context.lineWidth = 1;
  context.textBaseline = "middle";

  const lowY = vddY(0.75);
  const highY = vddY(2.9);
  context.save();
  context.fillStyle = colors.green;
  context.globalAlpha = document.body.dataset.theme === "dark" ? 0.08 : 0.06;
  context.fillRect(padding.left, lowY, chartWidth, padding.top + chartHeight - lowY);
  context.fillStyle = colors.red;
  context.globalAlpha = document.body.dataset.theme === "dark" ? 0.065 : 0.05;
  context.fillRect(padding.left, padding.top, chartWidth, Math.max(0, highY - padding.top));
  context.restore();

  const yTicks = compact ? 5 : 7;
  for (let index = 0; index < yTicks; index += 1) {
    const progress = index / Math.max(yTicks - 1, 1);
    const y = padding.top + progress * chartHeight;
    const vddValue = vddMax - progress * vddMax;
    const priceValue = 10 ** (priceLogMax - progress * (priceLogMax - priceLogMin));
    context.strokeStyle = colors.line;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillStyle = colors.orange;
    context.textAlign = "right";
    context.fillText(vddValue.toFixed(vddValue >= 10 ? 1 : 2), padding.left - 8, y);
    context.fillStyle = colors.muted;
    context.textAlign = "left";
    context.fillText(formatAxisUsd(priceValue), width - padding.right + 8, y);
  }

  const columnWidth = Math.max(0.7, chartWidth / Math.max(series.length - 1, 1) + 0.35);
  context.save();
  context.globalAlpha = document.body.dataset.theme === "dark" ? 0.42 : 0.35;
  series.forEach((point) => {
    const color = point.vdd < 0.75 ? colors.green : point.vdd > 2.9 ? colors.red : colors.orange;
    const x = xFor(point.date);
    const y = vddY(point.vdd);
    context.fillStyle = color;
    context.fillRect(x - columnWidth / 2, y, columnWidth, padding.top + chartHeight - y);
  });
  context.restore();

  const drawThreshold = (value, color, label) => {
    const y = vddY(value);
    context.save();
    context.strokeStyle = color;
    context.lineWidth = 1.25;
    context.setLineDash([7, 6]);
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillStyle = color;
    context.textAlign = "right";
    context.fillText(label, width - padding.right - 5, y - 9);
    context.restore();
  };
  drawThreshold(0.75, colors.green, "0.75 LOW");
  drawThreshold(2.9, colors.red, "2.90 HIGH");

  context.save();
  context.strokeStyle = colors.ink;
  context.lineWidth = 2;
  context.globalAlpha = 0.9;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.beginPath();
  series.forEach((point, index) => {
    const x = xFor(point.date);
    const y = priceY(point.price);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();
  context.restore();

  context.save();
  context.fillStyle = colors.ink;
  context.globalAlpha = document.body.dataset.theme === "dark" ? 0.055 : 0.045;
  context.font = `800 ${Math.max(30, Math.min(width * 0.085, height * 0.16, 92))}px Inter`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  drawBrandWatermark(context, padding.left + chartWidth / 2, padding.top + chartHeight / 2);
  context.restore();

  const latest = series.at(-1);
  context.fillStyle = latest.vdd < 0.75 ? colors.green : latest.vdd > 2.9 ? colors.red : colors.orange;
  context.beginPath();
  context.arc(xFor(latest.date), vddY(latest.vdd), 4, 0, Math.PI * 2);
  context.fill();

  const xTicks = compact ? 4 : 7;
  const shortRange = ["7", "30", "90"].includes(vddRange);
  const dateFormatter = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", {
    year: shortRange ? undefined : "numeric",
    month: "short",
    day: shortRange ? "2-digit" : undefined
  });
  context.textBaseline = "alphabetic";
  for (let index = 0; index < xTicks; index += 1) {
    const progress = index / Math.max(xTicks - 1, 1);
    const date = new Date(startTime + progress * (endTime - startTime));
    const x = padding.left + progress * chartWidth;
    context.fillStyle = colors.muted;
    context.textAlign = index === 0 ? "left" : index === xTicks - 1 ? "right" : "center";
    context.fillText(dateFormatter.format(date), x, height - 13);
  }

  vddChartState = { series, padding, chartWidth, width, height };
};

const showVddTooltip = (event) => {
  const canvas = document.querySelector("#vdd-chart");
  const tooltip = document.querySelector("#vdd-tooltip");
  if (!canvas || !tooltip || !vddChartState) return;
  const { series, padding, chartWidth, width, height } = vddChartState;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * width;
  const progress = Math.max(0, Math.min(1, (x - padding.left) / Math.max(chartWidth, 1)));
  const point = series[Math.round(progress * (series.length - 1))];
  if (!point) return;
  const date = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "2-digit", day: "2-digit" }).format(point.date);
  const zone = point.vdd < 0.75
    ? (currentLanguage === "zh" ? "积累区" : "Accumulation")
    : point.vdd > 2.9
      ? (currentLanguage === "zh" ? "派发区" : "Distribution")
      : (currentLanguage === "zh" ? "常态区" : "Normal");
  tooltip.innerHTML = `<strong>${date}</strong><span>BTC <i>${formatUsd(point.price)}</i></span><span>VDD Multiple <i>${point.vdd.toFixed(4)}</i></span><span>${currentLanguage === "zh" ? "状态" : "Zone"} <i>${zone}</i></span>`;
  tooltip.hidden = false;
  const tooltipWidth = tooltip.offsetWidth || 230;
  tooltip.style.left = `${Math.max(8, Math.min(rect.width - tooltipWidth - 8, event.clientX - rect.left + 14))}px`;
  tooltip.style.top = `${Math.max(8, Math.min(height - 126, event.clientY - rect.top - 72))}px`;
};

const hideVddTooltip = () => {
  const tooltip = document.querySelector("#vdd-tooltip");
  if (tooltip) tooltip.hidden = true;
};

const lthNuplZoneFor = (value) => {
  if (value < 0) return "capitulation";
  if (value < 0.25) return "fear";
  if (value < 0.5) return "hope";
  if (value < 0.75) return "optimism";
  return "euphoria";
};

const getLthNuplVisibleSeries = () => {
  if (!lthNuplSeries.length || lthNuplRange === "all") return lthNuplSeries;
  const days = Number(lthNuplRange);
  const end = lthNuplSeries.at(-1).date.getTime();
  const start = end - Math.max(days - 1, 1) * 86_400_000;
  return lthNuplSeries.filter((point) => point.date.getTime() >= start);
};

const drawLthNuplChart = () => {
  const canvas = document.querySelector("#lth-nupl-chart");
  const stage = canvas?.closest(".lth-nupl-stage");
  const series = getLthNuplVisibleSeries();
  if (!canvas || !stage || series.length < 2) {
    drawEmptyChart("#lth-nupl-chart");
    lthNuplChartState = null;
    return;
  }

  canvas.style.removeProperty("height");
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height || stage.clientHeight || 620, 430);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = chartColors();
  const compact = width < 700;
  const padding = { top: 28, right: compact ? 18 : 30, bottom: 42, left: compact ? 54 : 68 };
  const chartWidth = width - padding.left - padding.right;
  const availableHeight = height - padding.top - padding.bottom;
  const panelGap = compact ? 48 : 58;
  const priceHeight = Math.max(165, availableHeight * 0.43);
  const nuplTop = padding.top + priceHeight + panelGap;
  const nuplHeight = Math.max(145, height - padding.bottom - nuplTop);
  const startTime = series[0].date.getTime();
  const endTime = series.at(-1).date.getTime();
  const xFor = (date) => padding.left + ((date.getTime() - startTime) / Math.max(endTime - startTime, 1)) * chartWidth;
  const prices = series.map((point) => point.price).filter((value) => Number.isFinite(value) && value > 0);
  const priceLogMin = Math.log10(Math.min(...prices)) - 0.07;
  const priceLogMax = Math.log10(Math.max(...prices)) + 0.07;
  const priceY = (value) => padding.top + (1 - (Math.log10(Math.max(value, 0.0001)) - priceLogMin) / Math.max(priceLogMax - priceLogMin, 0.0001)) * priceHeight;
  const nuplValues = series.map((point) => point.nupl).filter(Number.isFinite);
  const nuplMin = Math.max(-1.5, Math.min(-0.25, Math.floor((Math.min(...nuplValues) - 0.08) * 4) / 4));
  const nuplMax = Math.min(1, Math.max(0.8, Math.ceil((Math.max(...nuplValues) + 0.08) * 4) / 4));
  const nuplY = (value) => nuplTop + (1 - (value - nuplMin) / Math.max(nuplMax - nuplMin, 0.0001)) * nuplHeight;
  const phaseColors = { capitulation: colors.red, fear: "#d96ea9", hope: "#6f93ff", optimism: colors.green, euphoria: "#b783dd" };

  context.clearRect(0, 0, width, height);
  context.font = "700 10px JetBrains Mono";
  context.lineWidth = 1;
  context.textBaseline = "middle";

  const priceTicks = compact ? 4 : 5;
  for (let index = 0; index < priceTicks; index += 1) {
    const progress = index / Math.max(priceTicks - 1, 1);
    const y = padding.top + progress * priceHeight;
    const value = 10 ** (priceLogMax - progress * (priceLogMax - priceLogMin));
    context.strokeStyle = colors.line;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillStyle = colors.muted;
    context.textAlign = "right";
    context.fillText(formatAxisUsd(value), padding.left - 8, y);
  }

  const phaseBands = [
    { from: nuplMin, to: 0, color: colors.red },
    { from: 0, to: 0.25, color: "#d96ea9" },
    { from: 0.25, to: 0.5, color: "#6f93ff" },
    { from: 0.5, to: 0.75, color: colors.green },
    { from: 0.75, to: nuplMax, color: "#b783dd" }
  ];
  context.save();
  context.globalAlpha = document.body.dataset.theme === "dark" ? 0.055 : 0.04;
  phaseBands.forEach((band) => {
    const top = nuplY(Math.min(band.to, nuplMax));
    const bottom = nuplY(Math.max(band.from, nuplMin));
    context.fillStyle = band.color;
    context.fillRect(padding.left, top, chartWidth, Math.max(0, bottom - top));
  });
  context.restore();

  const nuplTicks = compact ? 5 : 7;
  for (let index = 0; index < nuplTicks; index += 1) {
    const progress = index / Math.max(nuplTicks - 1, 1);
    const y = nuplTop + progress * nuplHeight;
    const value = nuplMax - progress * (nuplMax - nuplMin);
    context.strokeStyle = colors.line;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillStyle = colors.muted;
    context.textAlign = "right";
    context.fillText(value.toFixed(2).replace(/\.00$/, ""), padding.left - 8, y);
  }

  [0, 0.25, 0.5, 0.75].forEach((value) => {
    if (value < nuplMin || value > nuplMax) return;
    const y = nuplY(value);
    context.save();
    context.strokeStyle = value === 0 ? colors.red : value === 0.25 ? "#d96ea9" : value === 0.5 ? "#6f93ff" : colors.green;
    context.lineWidth = value === 0 ? 1.35 : 1;
    context.setLineDash([6, 5]);
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillStyle = context.strokeStyle;
    context.textAlign = "right";
    context.fillText(value.toFixed(2), width - padding.right - 5, y - 9);
    context.restore();
  });

  context.save();
  context.strokeStyle = colors.ink;
  context.lineWidth = 2;
  context.globalAlpha = 0.9;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.beginPath();
  series.forEach((point, index) => {
    const x = xFor(point.date);
    const y = priceY(point.price);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();
  context.restore();

  const zeroY = nuplY(0);
  const columnWidth = Math.max(0.65, chartWidth / Math.max(series.length - 1, 1) + 0.35);
  context.save();
  context.globalAlpha = document.body.dataset.theme === "dark" ? 0.48 : 0.38;
  series.forEach((point) => {
    if (point.nupl >= 0.25) return;
    const x = xFor(point.date);
    const y = nuplY(point.nupl);
    context.fillStyle = phaseColors[lthNuplZoneFor(point.nupl)];
    context.fillRect(x - columnWidth / 2, Math.min(y, zeroY), columnWidth, Math.abs(zeroY - y));
  });
  context.restore();

  context.save();
  context.strokeStyle = "#6f93ff";
  context.lineWidth = 2.2;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.beginPath();
  series.forEach((point, index) => {
    const x = xFor(point.date);
    const y = nuplY(point.nupl);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();
  context.restore();

  context.save();
  context.fillStyle = colors.ink;
  context.globalAlpha = document.body.dataset.theme === "dark" ? 0.055 : 0.045;
  context.font = `800 ${Math.max(30, Math.min(width * 0.085, height * 0.15, 84))}px Inter`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  drawBrandWatermark(context, padding.left + chartWidth / 2, padding.top + availableHeight / 2);
  context.restore();

  const latest = series.at(-1);
  context.fillStyle = phaseColors[lthNuplZoneFor(latest.nupl)];
  context.beginPath();
  context.arc(xFor(latest.date), nuplY(latest.nupl), 4.5, 0, Math.PI * 2);
  context.fill();

  const xTicks = compact ? 4 : 7;
  const shortRange = ["7", "30", "90"].includes(lthNuplRange);
  const dateFormatter = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", {
    year: shortRange ? undefined : "numeric",
    month: "short",
    day: shortRange ? "2-digit" : undefined
  });
  context.textBaseline = "alphabetic";
  for (let index = 0; index < xTicks; index += 1) {
    const progress = index / Math.max(xTicks - 1, 1);
    const date = new Date(startTime + progress * (endTime - startTime));
    const x = padding.left + progress * chartWidth;
    context.fillStyle = colors.muted;
    context.textAlign = index === 0 ? "left" : index === xTicks - 1 ? "right" : "center";
    context.fillText(dateFormatter.format(date), x, height - 13);
  }

  lthNuplChartState = { series, padding, chartWidth, width, height };
};

const showLthNuplTooltip = (event) => {
  const canvas = document.querySelector("#lth-nupl-chart");
  const tooltip = document.querySelector("#lth-nupl-tooltip");
  if (!canvas || !tooltip || !lthNuplChartState) return;
  const { series, padding, chartWidth, width, height } = lthNuplChartState;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * width;
  const progress = Math.max(0, Math.min(1, (x - padding.left) / Math.max(chartWidth, 1)));
  const point = series[Math.round(progress * (series.length - 1))];
  if (!point) return;
  const date = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "2-digit", day: "2-digit" }).format(point.date);
  const zoneLabels = currentLanguage === "zh"
    ? { capitulation: "投降", fear: "恐惧", hope: "希望", optimism: "乐观", euphoria: "狂热" }
    : { capitulation: "Capitulation", fear: "Fear", hope: "Hope", optimism: "Optimism", euphoria: "Euphoria" };
  tooltip.innerHTML = `<strong>${date}</strong><span>BTC <i>${formatUsd(point.price)}</i></span><span>LTH-NUPL <i>${point.nupl.toFixed(4)}</i></span><span>${currentLanguage === "zh" ? "阶段" : "Phase"} <i>${zoneLabels[lthNuplZoneFor(point.nupl)]}</i></span>`;
  tooltip.hidden = false;
  const tooltipWidth = tooltip.offsetWidth || 230;
  tooltip.style.left = `${Math.max(8, Math.min(rect.width - tooltipWidth - 8, event.clientX - rect.left + 14))}px`;
  tooltip.style.top = `${Math.max(8, Math.min(height - 126, event.clientY - rect.top - 72))}px`;
};

const hideLthNuplTooltip = () => {
  const tooltip = document.querySelector("#lth-nupl-tooltip");
  if (tooltip) tooltip.hidden = true;
};

const getLthSthVisibleSeries = () => {
  if (!lthSthSeries.length || lthSthRange === "all") return lthSthSeries;
  const days = Number(lthSthRange);
  const end = lthSthSeries.at(-1).date.getTime();
  const start = end - Math.max(days - 1, 1) * 86_400_000;
  return lthSthSeries.filter((point) => point.date.getTime() >= start);
};

const drawLthSthChart = () => {
  const canvas = document.querySelector("#lth-sth-chart");
  const stage = canvas?.closest(".lth-sth-stage");
  const series = getLthSthVisibleSeries();
  if (!canvas || !stage || series.length < 2) {
    drawEmptyChart("#lth-sth-chart");
    lthSthChartState = null;
    return;
  }

  canvas.style.removeProperty("height");
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height || stage.clientHeight || 620, 430);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = chartColors();
  const compact = width < 700;
  const padding = { top: 28, right: compact ? 16 : 26, bottom: 42, left: compact ? 58 : 74 };
  const chartWidth = width - padding.left - padding.right;
  const availableHeight = height - padding.top - padding.bottom;
  const panelGap = compact ? 48 : 58;
  const priceHeight = Math.max(190, availableHeight * 0.58);
  const ratioTop = padding.top + priceHeight + panelGap;
  const ratioHeight = Math.max(105, height - padding.bottom - ratioTop);
  const startTime = series[0].date.getTime();
  const endTime = series.at(-1).date.getTime();
  const xFor = (date) => padding.left + ((date.getTime() - startTime) / Math.max(endTime - startTime, 1)) * chartWidth;
  const priceValues = series.flatMap((point) => [point.price, point.lth, point.sth]).filter((value) => Number.isFinite(value) && value > 0);
  const priceLogMin = Math.log10(Math.min(...priceValues)) - 0.08;
  const priceLogMax = Math.log10(Math.max(...priceValues)) + 0.08;
  const priceY = (value) => padding.top + (1 - (Math.log10(Math.max(value, 0.0001)) - priceLogMin) / Math.max(priceLogMax - priceLogMin, 0.0001)) * priceHeight;
  const ratios = series.map((point) => point.ratio).filter(Number.isFinite);
  const ratioMin = Math.max(0, Math.min(0.42, ...ratios) - 0.06);
  const ratioMax = Math.max(1, Math.max(...ratios) + 0.12);
  const ratioY = (value) => ratioTop + (1 - (value - ratioMin) / Math.max(ratioMax - ratioMin, 0.0001)) * ratioHeight;

  context.clearRect(0, 0, width, height);
  context.font = "700 10px JetBrains Mono";
  context.lineWidth = 1;
  context.textBaseline = "middle";

  const priceTicks = compact ? 4 : 5;
  for (let index = 0; index < priceTicks; index += 1) {
    const progress = index / Math.max(priceTicks - 1, 1);
    const value = 10 ** (priceLogMax - progress * (priceLogMax - priceLogMin));
    const y = padding.top + progress * priceHeight;
    context.strokeStyle = colors.line;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillStyle = colors.muted;
    context.textAlign = "right";
    context.fillText(formatAxisUsd(value), padding.left - 9, y);
  }

  const ratioTicks = compact ? 4 : 5;
  for (let index = 0; index < ratioTicks; index += 1) {
    const progress = index / Math.max(ratioTicks - 1, 1);
    const value = ratioMax - progress * (ratioMax - ratioMin);
    const y = ratioTop + progress * ratioHeight;
    context.strokeStyle = colors.line;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillStyle = colors.muted;
    context.textAlign = "right";
    context.fillText(value.toFixed(2), padding.left - 9, y);
  }

  const thresholdY = ratioY(0.48);
  context.save();
  context.strokeStyle = colors.green;
  context.globalAlpha = 0.8;
  context.setLineDash([6, 6]);
  context.beginPath();
  context.moveTo(padding.left, thresholdY);
  context.lineTo(width - padding.right, thresholdY);
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = colors.green;
  context.font = "800 9px JetBrains Mono";
  context.textAlign = "right";
  context.fillText("0.48 RECOVERY", width - padding.right - 3, thresholdY - 9);
  context.restore();

  context.save();
  context.fillStyle = colors.ink;
  context.globalAlpha = document.body.dataset.theme === "dark" ? 0.055 : 0.045;
  context.font = `800 ${Math.max(30, Math.min(width * 0.078, priceHeight * 0.22, 88))}px Inter`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  drawBrandWatermark(context, padding.left + chartWidth / 2, padding.top + priceHeight / 2);
  context.restore();

  const drawLine = (key, color, lineWidth, yFor, opacity = 1) => {
    context.save();
    context.strokeStyle = color;
    context.globalAlpha = opacity;
    context.lineWidth = lineWidth;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.beginPath();
    let started = false;
    series.forEach((point) => {
      if (!Number.isFinite(point[key])) return;
      const x = xFor(point.date);
      const y = yFor(point[key]);
      if (!started) { context.moveTo(x, y); started = true; }
      else context.lineTo(x, y);
    });
    context.stroke();
    context.restore();
  };

  drawLine("price", colors.ink, 1.45, priceY, 0.75);
  drawLine("lth", colors.orange, 2.15, priceY, 0.98);
  drawLine("sth", colors.red, 2.15, priceY, 0.98);
  drawLine("ratio", "#6f93ff", 2.25, ratioY, 1);

  const latest = series.at(-1);
  [["price", colors.ink, priceY, 3], ["lth", colors.orange, priceY, 4], ["sth", colors.red, priceY, 4], ["ratio", "#6f93ff", ratioY, 4]].forEach(([key, color, yFor, radius]) => {
    context.fillStyle = color;
    context.beginPath();
    context.arc(xFor(latest.date), yFor(latest[key]), radius, 0, Math.PI * 2);
    context.fill();
  });

  const xTicks = compact ? 4 : 7;
  const shortRange = ["7", "30", "90"].includes(lthSthRange);
  const dateFormatter = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", {
    year: shortRange ? undefined : "numeric",
    month: "short",
    day: shortRange ? "2-digit" : undefined
  });
  context.textBaseline = "alphabetic";
  for (let index = 0; index < xTicks; index += 1) {
    const progress = index / Math.max(xTicks - 1, 1);
    const date = new Date(startTime + progress * (endTime - startTime));
    const x = padding.left + progress * chartWidth;
    context.fillStyle = colors.muted;
    context.textAlign = index === 0 ? "left" : index === xTicks - 1 ? "right" : "center";
    context.fillText(dateFormatter.format(date), x, height - 13);
  }

  lthSthChartState = { series, padding, chartWidth, width, height };
};

const showLthSthTooltip = (event) => {
  const canvas = document.querySelector("#lth-sth-chart");
  const tooltip = document.querySelector("#lth-sth-tooltip");
  if (!canvas || !tooltip || !lthSthChartState) return;
  const { series, padding, chartWidth, width, height } = lthSthChartState;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * width;
  const progress = Math.max(0, Math.min(1, (x - padding.left) / Math.max(chartWidth, 1)));
  const point = series[Math.round(progress * (series.length - 1))];
  if (!point) return;
  const date = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "2-digit", day: "2-digit" }).format(point.date);
  tooltip.innerHTML = `<strong>${date}</strong><span>BTC <i>${formatUsd(point.price)}</i></span><span>LTH RP <i>${formatUsd(point.lth)}</i></span><span>STH RP <i>${formatUsd(point.sth)}</i></span><span>LTH / STH <i>${point.ratio.toFixed(4)}</i></span>`;
  tooltip.hidden = false;
  const tooltipWidth = tooltip.offsetWidth || 210;
  tooltip.style.left = `${Math.max(8, Math.min(rect.width - tooltipWidth - 8, event.clientX - rect.left + 14))}px`;
  tooltip.style.top = `${Math.max(8, Math.min(height - 144, event.clientY - rect.top - 72))}px`;
};

const hideLthSthTooltip = () => {
  const tooltip = document.querySelector("#lth-sth-tooltip");
  if (tooltip) tooltip.hidden = true;
};

const getLthLossVisibleSeries = () => {
  if (!lthLossSeries.length || lthLossRange === "all") return lthLossSeries;
  const days = Number(lthLossRange);
  const end = lthLossSeries.at(-1).date.getTime();
  const start = end - Math.max(days - 1, 1) * 86_400_000;
  return lthLossSeries.filter((point) => point.date.getTime() >= start);
};

const drawLthLossChart = () => {
  const canvas = document.querySelector("#lth-loss-chart");
  const stage = canvas?.closest(".lth-loss-stage");
  const series = getLthLossVisibleSeries();
  if (!canvas || !stage || series.length < 2) {
    drawEmptyChart("#lth-loss-chart");
    lthLossChartState = null;
    return;
  }

  canvas.style.removeProperty("height");
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height || stage.clientHeight || 620, 430);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = chartColors();
  const compact = width < 700;
  const padding = { top: 28, right: compact ? 16 : 26, bottom: 42, left: compact ? 58 : 74 };
  const chartWidth = width - padding.left - padding.right;
  const availableHeight = height - padding.top - padding.bottom;
  const panelGap = compact ? 48 : 58;
  const priceHeight = Math.max(190, availableHeight * 0.52);
  const ratioTop = padding.top + priceHeight + panelGap;
  const ratioHeight = Math.max(105, height - padding.bottom - ratioTop);
  const startTime = series[0].date.getTime();
  const endTime = series.at(-1).date.getTime();
  const xFor = (date) => padding.left + ((date.getTime() - startTime) / Math.max(endTime - startTime, 1)) * chartWidth;
  const prices = series.map((point) => point.price).filter((value) => Number.isFinite(value) && value > 0);
  const priceLogMin = Math.log10(Math.min(...prices)) - 0.08;
  const priceLogMax = Math.log10(Math.max(...prices)) + 0.08;
  const priceY = (value) => padding.top + (1 - (Math.log10(Math.max(value, 0.0001)) - priceLogMin) / Math.max(priceLogMax - priceLogMin, 0.0001)) * priceHeight;
  const ratios = series.map((point) => point.ratio).filter(Number.isFinite);
  const ratioMax = Math.max(35, Math.ceil(Math.max(...ratios) / 5) * 5);
  const ratioY = (value) => ratioTop + (1 - value / Math.max(ratioMax, 1)) * ratioHeight;

  context.clearRect(0, 0, width, height);
  context.font = "700 10px JetBrains Mono";
  context.lineWidth = 1;
  context.textBaseline = "middle";

  const priceTicks = compact ? 4 : 5;
  for (let index = 0; index < priceTicks; index += 1) {
    const progress = index / Math.max(priceTicks - 1, 1);
    const value = 10 ** (priceLogMax - progress * (priceLogMax - priceLogMin));
    const y = padding.top + progress * priceHeight;
    context.strokeStyle = colors.line;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillStyle = colors.muted;
    context.textAlign = "right";
    context.fillText(formatAxisUsd(value), padding.left - 9, y);
  }

  const ratioTicks = compact ? 4 : 5;
  for (let index = 0; index < ratioTicks; index += 1) {
    const progress = index / Math.max(ratioTicks - 1, 1);
    const value = ratioMax - progress * ratioMax;
    const y = ratioTop + progress * ratioHeight;
    context.strokeStyle = colors.line;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillStyle = colors.muted;
    context.textAlign = "right";
    context.fillText(`${value.toFixed(0)}%`, padding.left - 9, y);
  }

  const thresholdY = ratioY(27);
  context.save();
  context.strokeStyle = colors.red;
  context.globalAlpha = 0.9;
  context.setLineDash([7, 6]);
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(padding.left, thresholdY);
  context.lineTo(width - padding.right, thresholdY);
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = colors.red;
  context.font = "800 9px JetBrains Mono";
  context.textAlign = "right";
  context.fillText("27% BEAR THRESHOLD", width - padding.right - 3, thresholdY - 9);
  context.restore();

  context.save();
  context.fillStyle = colors.ink;
  context.globalAlpha = document.body.dataset.theme === "dark" ? 0.055 : 0.045;
  context.font = `800 ${Math.max(30, Math.min(width * 0.078, priceHeight * 0.22, 88))}px Inter`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  drawBrandWatermark(context, padding.left + chartWidth / 2, padding.top + priceHeight / 2);
  context.restore();

  const drawLine = (key, color, lineWidth, yFor, opacity = 1) => {
    context.save();
    context.strokeStyle = color;
    context.globalAlpha = opacity;
    context.lineWidth = lineWidth;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.beginPath();
    series.forEach((point, index) => {
      const x = xFor(point.date);
      const y = yFor(point[key]);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
    context.restore();
  };

  drawLine("price", colors.ink, 1.5, priceY, 0.82);

  context.save();
  const fill = context.createLinearGradient(0, ratioTop, 0, ratioTop + ratioHeight);
  fill.addColorStop(0, "rgba(210, 168, 62, 0.34)");
  fill.addColorStop(1, "rgba(210, 168, 62, 0.025)");
  context.fillStyle = fill;
  context.beginPath();
  series.forEach((point, index) => {
    const x = xFor(point.date);
    const y = ratioY(point.ratio);
    if (index === 0) context.moveTo(x, ratioY(0));
    context.lineTo(x, y);
  });
  context.lineTo(xFor(series.at(-1).date), ratioY(0));
  context.closePath();
  context.fill();
  context.restore();
  drawLine("ratio", "#d2a83e", 2.1, ratioY, 1);

  const latest = series.at(-1);
  [["price", colors.ink, priceY, 3], ["ratio", "#d2a83e", ratioY, 4]].forEach(([key, color, yFor, radius]) => {
    context.fillStyle = color;
    context.beginPath();
    context.arc(xFor(latest.date), yFor(latest[key]), radius, 0, Math.PI * 2);
    context.fill();
  });

  const xTicks = compact ? 4 : 7;
  const shortRange = ["7", "30", "90"].includes(lthLossRange);
  const dateFormatter = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", {
    year: shortRange ? undefined : "numeric",
    month: "short",
    day: shortRange ? "2-digit" : undefined
  });
  context.textBaseline = "alphabetic";
  for (let index = 0; index < xTicks; index += 1) {
    const progress = index / Math.max(xTicks - 1, 1);
    const date = new Date(startTime + progress * (endTime - startTime));
    const x = padding.left + progress * chartWidth;
    context.fillStyle = colors.muted;
    context.textAlign = index === 0 ? "left" : index === xTicks - 1 ? "right" : "center";
    context.fillText(dateFormatter.format(date), x, height - 13);
  }

  lthLossChartState = { series, padding, chartWidth, width, height };
};

const showLthLossTooltip = (event) => {
  const canvas = document.querySelector("#lth-loss-chart");
  const tooltip = document.querySelector("#lth-loss-tooltip");
  if (!canvas || !tooltip || !lthLossChartState) return;
  const { series, padding, chartWidth, width, height } = lthLossChartState;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * width;
  const progress = Math.max(0, Math.min(1, (x - padding.left) / Math.max(chartWidth, 1)));
  const point = series[Math.round(progress * (series.length - 1))];
  if (!point) return;
  const date = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "2-digit", day: "2-digit" }).format(point.date);
  tooltip.innerHTML = `<strong>${date}</strong><span>BTC <i>${formatUsd(point.price)}</i></span><span>LTH Loss <i>${point.ratio.toFixed(2)}%</i></span><span>Distance to 27% <i>${(point.ratio - 27).toFixed(2)}%</i></span>`;
  tooltip.hidden = false;
  const tooltipWidth = tooltip.offsetWidth || 210;
  tooltip.style.left = `${Math.max(8, Math.min(rect.width - tooltipWidth - 8, event.clientX - rect.left + 14))}px`;
  tooltip.style.top = `${Math.max(8, Math.min(height - 124, event.clientY - rect.top - 72))}px`;
};

const hideLthLossTooltip = () => {
  const tooltip = document.querySelector("#lth-loss-tooltip");
  if (tooltip) tooltip.hidden = true;
};

const getSupplyProfitLossVisibleSeries = () => {
  if (!supplyProfitLossSeries.length || supplyProfitLossRange === "all") return supplyProfitLossSeries;
  const days = Number(supplyProfitLossRange);
  const end = supplyProfitLossSeries.at(-1).date.getTime();
  const start = end - Math.max(days - 1, 1) * 86_400_000;
  return supplyProfitLossSeries.filter((point) => point.date.getTime() >= start);
};

const drawSupplyProfitLossChart = () => {
  const canvas = document.querySelector("#supply-pl-chart");
  const stage = canvas?.closest(".supply-pl-stage");
  const series = getSupplyProfitLossVisibleSeries();
  if (!canvas || !stage || series.length < 2) {
    drawEmptyChart("#supply-pl-chart");
    supplyProfitLossChartState = null;
    return;
  }

  canvas.style.removeProperty("height");
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height || stage.clientHeight || 620, 430);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = chartColors();
  const compact = width < 700;
  const padding = { top: 30, right: compact ? 55 : 72, bottom: 46, left: compact ? 58 : 74 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const startTime = series[0].date.getTime();
  const endTime = series.at(-1).date.getTime();
  const xFor = (date) => padding.left + ((date.getTime() - startTime) / Math.max(endTime - startTime, 1)) * chartWidth;
  const prices = series.map((point) => point.price).filter((value) => Number.isFinite(value) && value > 0);
  const ratios = series.map((point) => point.ratio).filter((value) => Number.isFinite(value) && value > 0);
  const priceLogMin = Math.log10(Math.min(...prices)) - 0.08;
  const priceLogMax = Math.log10(Math.max(...prices)) + 0.08;
  const ratioLogMin = Math.log10(0.5);
  const observedRatioMax = Math.max(...ratios, 4);
  const ratioMax = Math.max(10, 10 ** Math.ceil(Math.log10(observedRatioMax * 1.05)));
  const ratioLogMax = Math.log10(ratioMax);
  const priceY = (value) => padding.top + (1 - (Math.log10(Math.max(value, 0.0001)) - priceLogMin) / Math.max(priceLogMax - priceLogMin, 0.0001)) * chartHeight;
  const ratioY = (value) => padding.top + (1 - (Math.log10(Math.max(value, 0.5)) - ratioLogMin) / Math.max(ratioLogMax - ratioLogMin, 0.0001)) * chartHeight;

  context.clearRect(0, 0, width, height);
  context.font = "700 10px JetBrains Mono";
  context.lineWidth = 1;
  context.textBaseline = "middle";

  const priceTicks = compact ? 4 : 5;
  for (let index = 0; index < priceTicks; index += 1) {
    const progress = index / Math.max(priceTicks - 1, 1);
    const value = 10 ** (priceLogMax - progress * (priceLogMax - priceLogMin));
    const y = padding.top + progress * chartHeight;
    context.strokeStyle = colors.line;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillStyle = colors.muted;
    context.textAlign = "right";
    context.fillText(formatAxisUsd(value), padding.left - 9, y);
  }

  const ratioTickValues = [0.5, 1, 10, 100, 1000, 10000].filter((value) => value <= ratioMax);
  ratioTickValues.forEach((value) => {
    const y = ratioY(value);
    context.fillStyle = colors.muted;
    context.textAlign = "left";
    context.fillText(value >= 1000 ? value.toLocaleString("en-US") : value.toFixed(value < 1 ? 1 : 0), width - padding.right + 9, y);
  });

  context.save();
  context.fillStyle = "rgba(235, 99, 91, 0.09)";
  let zoneStart = null;
  series.forEach((point, index) => {
    if (point.ratio < 1 && zoneStart === null) zoneStart = xFor(point.date);
    const isLast = index === series.length - 1;
    if (zoneStart !== null && (point.ratio >= 1 || isLast)) {
      const zoneEnd = xFor(point.date);
      context.fillRect(zoneStart, padding.top, Math.max(zoneEnd - zoneStart, 1), chartHeight);
      zoneStart = null;
    }
  });
  context.restore();

  const thresholdY = ratioY(1);
  context.save();
  context.strokeStyle = colors.red;
  context.globalAlpha = 0.9;
  context.setLineDash([7, 6]);
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(padding.left, thresholdY);
  context.lineTo(width - padding.right, thresholdY);
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = colors.red;
  context.font = "800 9px JetBrains Mono";
  context.textAlign = "right";
  context.fillText("1.0 BEAR THRESHOLD", width - padding.right - 3, thresholdY - 10);
  context.restore();

  context.save();
  const ratioFill = context.createLinearGradient(0, padding.top, 0, padding.top + chartHeight);
  ratioFill.addColorStop(0, "rgba(111, 147, 255, 0.24)");
  ratioFill.addColorStop(1, "rgba(111, 147, 255, 0.015)");
  context.fillStyle = ratioFill;
  context.beginPath();
  series.forEach((point, index) => {
    const x = xFor(point.date);
    const y = ratioY(point.ratio);
    if (index === 0) context.moveTo(x, ratioY(0.5));
    context.lineTo(x, y);
  });
  context.lineTo(xFor(series.at(-1).date), ratioY(0.5));
  context.closePath();
  context.fill();
  context.restore();

  context.save();
  context.strokeStyle = colors.ink;
  context.globalAlpha = 0.82;
  context.lineWidth = 1.55;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.beginPath();
  series.forEach((point, index) => {
    const x = xFor(point.date);
    const y = priceY(point.price);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();
  context.restore();

  context.save();
  context.lineWidth = 2.15;
  context.lineJoin = "round";
  context.lineCap = "round";
  for (let index = 1; index < series.length; index += 1) {
    const previous = series[index - 1];
    const point = series[index];
    context.strokeStyle = point.ratio < 1 ? colors.red : "#6f93ff";
    context.beginPath();
    context.moveTo(xFor(previous.date), ratioY(previous.ratio));
    context.lineTo(xFor(point.date), ratioY(point.ratio));
    context.stroke();
  }
  context.restore();

  context.save();
  context.fillStyle = colors.ink;
  context.globalAlpha = document.body.dataset.theme === "dark" ? 0.055 : 0.045;
  context.font = `800 ${Math.max(30, Math.min(width * 0.078, chartHeight * 0.2, 88))}px Inter`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  drawBrandWatermark(context, padding.left + chartWidth / 2, padding.top + chartHeight / 2);
  context.restore();

  const latest = series.at(-1);
  [[priceY(latest.price), colors.ink, 3], [ratioY(latest.ratio), latest.ratio < 1 ? colors.red : "#6f93ff", 4]].forEach(([y, color, radius]) => {
    context.fillStyle = color;
    context.beginPath();
    context.arc(xFor(latest.date), y, radius, 0, Math.PI * 2);
    context.fill();
  });

  const xTicks = compact ? 4 : 7;
  const shortRange = ["7", "30", "90"].includes(supplyProfitLossRange);
  const dateFormatter = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", {
    year: shortRange ? undefined : "numeric",
    month: "short",
    day: shortRange ? "2-digit" : undefined
  });
  context.textBaseline = "alphabetic";
  for (let index = 0; index < xTicks; index += 1) {
    const progress = index / Math.max(xTicks - 1, 1);
    const date = new Date(startTime + progress * (endTime - startTime));
    const x = padding.left + progress * chartWidth;
    context.fillStyle = colors.muted;
    context.textAlign = index === 0 ? "left" : index === xTicks - 1 ? "right" : "center";
    context.fillText(dateFormatter.format(date), x, height - 13);
  }

  supplyProfitLossChartState = { series, padding, chartWidth, width, height };
};

const showSupplyProfitLossTooltip = (event) => {
  const canvas = document.querySelector("#supply-pl-chart");
  const tooltip = document.querySelector("#supply-pl-tooltip");
  if (!canvas || !tooltip || !supplyProfitLossChartState) return;
  const { series, padding, chartWidth, width, height } = supplyProfitLossChartState;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * width;
  const progress = Math.max(0, Math.min(1, (x - padding.left) / Math.max(chartWidth, 1)));
  const point = series[Math.round(progress * (series.length - 1))];
  if (!point) return;
  const date = new Intl.DateTimeFormat(currentLanguage === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "2-digit", day: "2-digit" }).format(point.date);
  const profitShare = point.ratio / (1 + point.ratio) * 100;
  tooltip.innerHTML = `<strong>${date}</strong><span>BTC <i>${formatUsd(point.price)}</i></span><span>Ratio · 7D MA <i>${point.ratio.toFixed(2)}</i></span><span>Profit / Loss <i>${profitShare.toFixed(1)}% / ${(100 - profitShare).toFixed(1)}%</i></span>`;
  tooltip.hidden = false;
  const tooltipWidth = tooltip.offsetWidth || 230;
  tooltip.style.left = `${Math.max(8, Math.min(rect.width - tooltipWidth - 8, event.clientX - rect.left + 14))}px`;
  tooltip.style.top = `${Math.max(8, Math.min(height - 124, event.clientY - rect.top - 72))}px`;
};

const hideSupplyProfitLossTooltip = () => {
  const tooltip = document.querySelector("#supply-pl-tooltip");
  if (tooltip) tooltip.hidden = true;
};

const drawAllCharts = () => {
  drawCostBasisChart();
  drawSthRatioChart();
  drawLthRealizedChart();
  drawRealizedProfitLossChart();
  drawMedianRealizedChart();
  drawLthSthChart();
  drawLthLossChart();
  drawSupplyProfitLossChart();
  drawMedianMvrvChart();
  drawMvrvBandsChart();
  drawMvrvPriceBandsChart();
  drawStockToFlowChart();
  drawCycleTimingChart();
  drawRhodlChart();
  drawLthRplChart();
  drawSlrvChart();
  drawRealizedCapHodlChart();
  drawLthSpentChart();
  drawPercentProfitChart();
  drawLthExchangeLossChart();
  drawTwoWeekRsiChart();
  drawUnder3mHodlChart();
  drawSth200dmaChart();
  drawVddMedianCycleChart();
  drawSsrChart();
  drawSthBandsChart();
  drawPercentProfitEx10yChart();
  drawSthMvrvChart();
  drawVddChart();
  drawLthNuplChart();
};

const translateFearGreed = (label) => ({
  "Extreme Fear": "极度恐惧",
  Fear: "恐惧",
  Neutral: "中性",
  Greed: "贪婪",
  "Extreme Greed": "极度贪婪"
})[label] || label;

const clampScore = (value) => Math.max(0, Math.min(100, Number(value)));

const getCyclePressureAssessment = () => {
  const factors = [];
  const addFactor = (name, value, weight) => {
    if (Number.isFinite(value)) factors.push({ name, value: clampScore(value), weight });
  };

  addFactor("sentiment", metricSnapshot.fng, 0.3);
  addFactor(
    "valuation",
    Number.isFinite(metricSnapshot.mvrv) ? 50 + (metricSnapshot.mvrv - 1) * 30 : Number.NaN,
    0.25
  );

  if (Number.isFinite(metricSnapshot.price) && Number.isFinite(metricSnapshot.wma) && metricSnapshot.wma > 0) {
    addFactor("trend", 50 + (metricSnapshot.price / metricSnapshot.wma - 1) * 70, 0.25);
  }

  addFactor(
    "leverage",
    Number.isFinite(metricSnapshot.funding) ? 50 + metricSnapshot.funding * 1000 : Number.NaN,
    0.2
  );

  const totalWeight = factors.reduce((sum, factor) => sum + factor.weight, 0);
  if (!totalWeight) return { score: 50, coverage: 0, factorCount: 0, fallback: true };

  return {
    score: Math.round(factors.reduce((sum, factor) => sum + factor.value * factor.weight, 0) / totalWeight),
    coverage: Math.round(totalWeight * 100),
    factorCount: factors.length,
    fallback: false
  };
};

const getCyclePressureScore = () => getCyclePressureAssessment().score;

const cyclePressureProfile = (score) => {
  if (score < 25) return { tone: "low", zh: "深度投降", en: "Capitulation" };
  if (score < 45) return { tone: "low", zh: "低估 · 累积", en: "Low · Accumulation" };
  if (score < 56) return { tone: "neutral", zh: "中性平衡", en: "Neutral Balance" };
  if (score < 75) return { tone: "warm", zh: "偏热 · 扩张", en: "Warm · Expansion" };
  return { tone: "high", zh: "高热 · 狂热", en: "Hot · Euphoria" };
};

const fearGreedProfile = (score) => {
  if (score < 25) return { tone: "low", zh: "极度恐惧", en: "Extreme Fear" };
  if (score < 45) return { tone: "low", zh: "恐惧", en: "Fear" };
  if (score < 56) return { tone: "neutral", zh: "中性", en: "Neutral" };
  if (score < 75) return { tone: "warm", zh: "贪婪", en: "Greed" };
  return { tone: "high", zh: "极度贪婪", en: "Extreme Greed" };
};

const updateSentimentDial = (selector, score) => {
  const dial = document.querySelector(selector);
  if (!dial || !Number.isFinite(score)) return;
  dial.style.setProperty("--gauge-angle", `${clampScore(score) * 1.8}deg`);
};

const updateCyclePulseGauges = (cycleScore = getCyclePressureScore()) => {
  if (Number.isFinite(cycleScore)) {
    const profile = cyclePressureProfile(cycleScore);
    const label = currentLanguage === "zh" ? profile.zh : profile.en;
    setText("#cycle-pendulum-value", cycleScore);
    setText("#cycle-pendulum-state", label);
    setText("#cycle-pendulum-badge", label);
    const badge = document.querySelector("#cycle-pendulum-badge");
    if (badge) badge.dataset.tone = profile.tone;
    const copy = currentLanguage === "zh"
      ? `综合压力 ${cycleScore}/100。分数越低越接近投降与累积，越高越接近扩张与过热。`
      : `Composite pressure is ${cycleScore}/100. Lower readings favor capitulation and accumulation; higher readings favor expansion and overheating.`;
    setText("#cycle-pendulum-copy", copy);
    updateSentimentDial("#cycle-pendulum-dial", cycleScore);
  }

  if (Number.isFinite(metricSnapshot.fng)) {
    const score = Math.round(clampScore(metricSnapshot.fng));
    const profile = fearGreedProfile(score);
    const label = currentLanguage === "zh" ? profile.zh : profile.en;
    setText("#fear-greed-value", score);
    setText("#fear-greed-state", label);
    setText("#fear-greed-badge", label);
    const badge = document.querySelector("#fear-greed-badge");
    if (badge) badge.dataset.tone = profile.tone;
    setText("#fear-greed-copy", currentLanguage === "zh"
      ? `当前读数 ${score}/100，反映市场风险偏好与短期情绪温度。`
      : `The current reading is ${score}/100, reflecting market risk appetite and short-term sentiment.`);
    updateSentimentDial("#fear-greed-dial", score);
  }

  setText("#pulse-factor-fng", Number.isFinite(metricSnapshot.fng) ? Math.round(metricSnapshot.fng) : "--");
  setText("#pulse-factor-mvrv", Number.isFinite(metricSnapshot.mvrv) ? metricSnapshot.mvrv.toFixed(2) : "--");
  setText("#pulse-factor-wma", Number.isFinite(metricSnapshot.price) && Number.isFinite(metricSnapshot.wma)
    ? `${(metricSnapshot.price / metricSnapshot.wma).toFixed(2)}x`
    : "--");
  setText("#pulse-factor-funding", Number.isFinite(metricSnapshot.funding)
    ? `${metricSnapshot.funding >= 0 ? "+" : ""}${metricSnapshot.funding.toFixed(4)}%`
    : "--");
};

const updateCycleRadar = () => {
  const assessment = getCyclePressureAssessment();
  const { score } = assessment;
  updateCyclePulseGauges(score);
  const profile = cyclePressureProfile(score);
  const label = currentLanguage === "zh" ? profile.zh : profile.en;
  setText("#cycle-score-value", score);
  setText("#cycle-score-label", label);
  const spectrum = document.querySelector("#cycle-spectrum");
  if (spectrum) spectrum.style.transform = `translateX(${Math.max(0, Math.min(100, score)) * 2.72}px)`;
  const observation = assessment.fallback
    ? (currentLanguage === "zh"
      ? "公开数据源正在重试，当前显示中性基线 50/100。页面保留最近一次可用内容；仅供周期观察，不构成投资建议。"
      : "Public sources are retrying, so a neutral 50/100 baseline is shown. The latest available content remains accessible; this is cycle context, not investment advice.")
    : (currentLanguage === "zh"
      ? `当前周期压力为 ${score}/100，${label}；已覆盖 ${assessment.factorCount} 项核心因子（${assessment.coverage}% 权重）。重点观察价格相对 200WMA、MVRV、情绪与资金费率是否共振。仅供周期观察，不构成投资建议。`
      : `Current cycle pressure is ${score}/100 (${label}), based on ${assessment.factorCount} core factors covering ${assessment.coverage}% of the model weight. Watch price versus 200WMA, MVRV, sentiment and funding for confirmation. This is cycle context, not investment advice.`);
  setText("#radar-observation", observation);
};

const updateSignalLight = (selector, level = "normal") => {
  const row = document.querySelector(selector)?.closest("div");
  const light = row?.querySelector(".signal-light");
  if (!light) return;
  light.className = `signal-light${level === "normal" ? "" : ` ${level}`}`;
};

const overviewZoneLabel = (zone) => {
  const keyMap = {
    bottom: "bottomFishing",
    accumulation: "accumulation",
    wait: "wait",
    overheated: "overheated",
    "deep-value": "deepValue",
    neutral: "neutral",
    warm: "warm"
  };
  return getCopy(keyMap[zone] || "neutral");
};

const readOverviewCache = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(OVERVIEW_CACHE_KEY) || "null");
    if (!cached?.payload) return null;
    return cached.payload;
  } catch (error) {
    return null;
  }
};

const mergeOverviewWithCache = (payload, cached) => {
  if (!cached) return payload;
  const liveMetrics = payload?.metrics || {};
  const cachedMetrics = Object.fromEntries(
    Object.entries(cached.metrics || {}).map(([key, metric]) => [key, { ...metric, stale: true }])
  );
  return {
    ...cached,
    ...payload,
    stale: Boolean(payload?.stale || payload?.partial),
    metrics: { ...cachedMetrics, ...liveMetrics },
    series: {
      price: payload?.series?.price?.length ? payload.series.price : cached.series?.price || [],
      fearGreed: payload?.series?.fearGreed?.length ? payload.series.fearGreed : cached.series?.fearGreed || []
    }
  };
};

const applyOverviewPayload = (payload, cacheFallback = false) => {
  const metrics = payload.metrics || {};
  const staleSuffix = (metric) => metric?.stale || cacheFallback ? " · CACHE" : "";

  if (metrics.price) {
    const price = Number(metrics.price.value);
    const change = Number(metrics.price.change24h);
    metricSnapshot.price = price;
    setText("#btc-price", formatUsd(price));
    const changeElement = document.querySelector("#btc-change");
    if (changeElement) {
      changeElement.textContent = `${change >= 0 ? "+" : ""}${change.toFixed(2)}% · 24H`;
      changeElement.classList.toggle("negative", change < 0);
    }
    setText("#btc-price-time", `${metrics.price.source}${staleSuffix(metrics.price)} · ${formatDateTime(new Date(metrics.price.asOf))} CST`);
  }

  if (metrics.fearGreed) {
    const value = Number(metrics.fearGreed.value);
    const label = currentLanguage === "zh" ? translateFearGreed(metrics.fearGreed.classification) : metrics.fearGreed.classification;
    metricSnapshot.fng = value;
    setText("#fng-value", value);
    setText("#fng-label", label);
    setText("#fng-zone", value >= 75 ? "EXTREME" : value >= 56 ? "GREED" : value >= 45 ? "NEUTRAL" : value >= 25 ? "FEAR" : "EXTREME");
    setText("#fng-time", `${metrics.fearGreed.source}${staleSuffix(metrics.fearGreed)} · ${formatDateTime(new Date(metrics.fearGreed.asOf))} CST`);
    setText("#radar-fng", label);
    const meter = document.querySelector("#fng-meter");
    if (meter) meter.style.marginLeft = `calc(${Math.max(0, Math.min(100, value))}% - 2px)`;
    updateSignalLight("#radar-fng", value >= 75 ? "hot" : value >= 56 ? "warm" : "normal");
  }

  if (metrics.ahr999) {
    const value = Number(metrics.ahr999.value);
    setText("#ahr-value", value.toFixed(2));
    setText("#ahr-signal", `${overviewZoneLabel(metrics.ahr999.zone)} · ${getCopy("modelEstimate")}`);
    setText("#ahr-time", `${metrics.ahr999.source}${staleSuffix(metrics.ahr999)} · ${formatDateTime(new Date(metrics.ahr999.asOf))} CST`);
  }

  if (metrics.mvrv) {
    const value = Number(metrics.mvrv.value);
    const state = overviewZoneLabel(metrics.mvrv.zone);
    metricSnapshot.mvrv = value;
    setText("#mvrv-value", value.toFixed(2));
    setText("#mvrv-signal", state);
    setText("#mvrv-time", `${metrics.mvrv.source}${staleSuffix(metrics.mvrv)} · ${formatDateTime(new Date(metrics.mvrv.asOf))} CST`);
    setText("#radar-mvrv", state);
    updateSignalLight("#radar-mvrv", value > 3.5 ? "hot" : value > 2.5 ? "warm" : "normal");
  }

  if (metrics.wma200) {
    const value = Number(metrics.wma200.value);
    const ratio = Number(metrics.wma200.ratio);
    const distance = Number(metrics.wma200.distancePercent);
    metricSnapshot.wma = value;
    setText("#wma-value", formatUsd(value));
    setText("#wma-distance", `${ratio.toFixed(2)}x · ${distance >= 0 ? "+" : ""}${distance.toFixed(1)}%`);
    setText("#wma-time", `${metrics.wma200.source}${staleSuffix(metrics.wma200)} · ${formatDateTime(new Date(metrics.wma200.asOf))} CST`);
    setText("#radar-price", ratio >= 1 ? getCopy("priceAboveWma") : getCopy("priceBelowWma"));
    updateSignalLight("#radar-price", ratio >= 1.9 ? "warm" : ratio < 1 ? "hot" : "normal");
  }

  updateCycleRadar();
};

const loadOverviewMetrics = async () => {
  const cached = readOverviewCache();
  try {
    const livePayload = await fetchJsonWithRetry(`${API_BASE}/api/onchain-overview`);
    const payload = mergeOverviewWithCache(livePayload, cached);
    applyOverviewPayload(payload, false);
    writeDashboardCache(OVERVIEW_CACHE_KEY, payload, "Overview");
    if (payload.partial || payload.stale) publicDataWarnings.push("overview-partial");
  } catch (error) {
    if (!cached) {
      updateCycleRadar();
      publicDataWarnings.push("overview-public-retry");
      return;
    }
    applyOverviewPayload(cached, true);
    publicDataWarnings.push("overview-cache");
  }
};

const readCostBasisCache = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(COST_BASIS_CACHE_KEY) || "null");
    if (!cached?.payload) return null;
    return cached.payload;
  } catch {
    return null;
  }
};

const buildClientRatioSnapshot = (rows, threshold = 0.75) => {
  const ratioRows = rows
    .filter((row) => Number.isFinite(row.sth) && Number.isFinite(row.tmmp) && row.tmmp > 0)
    .map((row) => ({ ...row, ratio: row.sth / row.tmmp }));
  if (!ratioRows.length) return null;
  const latest = ratioRows.at(-1);
  const average = (days) => {
    const window = ratioRows.slice(-days);
    return window.reduce((sum, row) => sum + row.ratio, 0) / window.length;
  };
  const trendWindow = ratioRows.slice(-7);
  const dailySlope = trendWindow.length > 1
    ? (trendWindow.at(-1).ratio - trendWindow[0].ratio) / (trendWindow.length - 1)
    : 0;
  const average7 = average(7);
  const average30 = average(30);
  const hasFullThirtyDayWindow = ratioRows.length >= 30;
  const trend = latest.ratio < average7 && dailySlope < 0 && (!hasFullThirtyDayWindow || average7 < average30)
    ? "declining"
    : latest.ratio > average7 && dailySlope > 0 && (!hasFullThirtyDayWindow || average7 > average30)
      ? "rising"
      : "neutral";
  return {
    current: latest.ratio,
    average7,
    average30,
    dailySlope,
    projected7d: Math.max(0, latest.ratio + dailySlope * 7),
    threshold,
    distanceToThreshold: latest.ratio - threshold,
    distancePercent: ((latest.ratio / threshold) - 1) * 100,
    trend,
    priceBelowSth: latest.price < latest.sth,
    priceBelowTmmp: latest.price < latest.tmmp,
    onchainAsOf: latest.date.toISOString().slice(0, 10)
  };
};

const applySthRatioSnapshot = (snapshot, cacheFallback = false) => {
  if (!snapshot) return false;
  sthRatioSnapshot = snapshot;
  const current = Number(snapshot.current);
  const average7 = Number(snapshot.average7);
  const average30 = Number(snapshot.average30);
  const threshold = Number(snapshot.threshold) || 0.75;
  const distance = Number(snapshot.distanceToThreshold);
  const distancePercent = Number(snapshot.distancePercent);
  const projection = Number(snapshot.projected7d);
  const trendLabels = currentLanguage === "zh"
    ? { declining: "衰落", rising: "回升", neutral: "盘整" }
    : { declining: "Declining", rising: "Recovering", neutral: "Neutral" };
  const trendLabel = trendLabels[snapshot.trend] || trendLabels.neutral;
  const marketStage = current <= threshold
    ? (currentLanguage === "zh" ? "极端底部观察" : "Extreme bottom watch")
    : current < 1
      ? (currentLanguage === "zh" ? "均值回归" : "Mean reversion")
      : (currentLanguage === "zh" ? "成本扩张" : "Cost expansion");

  setText("#sth-ratio-current", Number.isFinite(current) ? current.toFixed(4) : "--");
  setText("#sth-ratio-avg7", Number.isFinite(average7) ? average7.toFixed(4) : "--");
  setText("#sth-ratio-avg30", Number.isFinite(average30) ? average30.toFixed(4) : "--");
  setText("#sth-ratio-trend", `${trendLabel} · ${snapshot.onchainAsOf || "--"}${cacheFallback ? " · CACHE" : ""}`);

  const distanceElement = document.querySelector("#sth-ratio-distance");
  const distancePercentElement = document.querySelector("#sth-ratio-distance-percent");
  if (distanceElement) {
    distanceElement.textContent = Number.isFinite(distance) ? `${distance >= 0 ? "+" : ""}${distance.toFixed(4)}` : "--";
    distanceElement.classList.toggle("negative", distance <= 0);
    distanceElement.classList.toggle("positive", distance > 0);
  }
  if (distancePercentElement) {
    distancePercentElement.textContent = Number.isFinite(distancePercent) ? `${distancePercent >= 0 ? "+" : ""}${distancePercent.toFixed(2)}%` : "--";
    distancePercentElement.classList.toggle("negative", distance <= 0);
    distancePercentElement.classList.toggle("positive", distance > 0);
  }

  const title = document.querySelector("#sth-ratio-signal-title");
  if (title) {
    title.textContent = current <= threshold
      ? (currentLanguage === "zh" ? "0.75 历史级底部信号已触发" : "The 0.75 cycle-bottom signal is active")
      : snapshot.trend === "declining"
        ? (currentLanguage === "zh" ? "均值回归阶段 · 趋势衰落" : "Mean-reversion phase · declining trend")
        : snapshot.trend === "rising"
          ? (currentLanguage === "zh" ? "短期成本正在回升" : "Short-term cost pressure is recovering")
          : (currentLanguage === "zh" ? "比例进入盘整观察" : "Ratio is consolidating");
    title.classList.toggle("is-extreme", current <= threshold);
    title.classList.toggle("is-declining", current > threshold && snapshot.trend === "declining");
    title.classList.toggle("is-stable", current > threshold && snapshot.trend !== "declining");
  }

  const pressureCopy = snapshot.priceBelowSth && snapshot.priceBelowTmmp
    ? (currentLanguage === "zh" ? "BTC 价格同时低于短期成本与真实市场均价，短期筹码整体承压。" : "BTC is below both the short-term basis and the true market mean, leaving recent supply under pressure.")
    : snapshot.priceBelowSth
      ? (currentLanguage === "zh" ? "BTC 价格低于短期持有者成本，近期筹码处于亏损边缘。" : "BTC is below the short-term holder basis, putting recent supply near an unrealized loss.")
      : (currentLanguage === "zh" ? "BTC 尚未同时跌破两条成本线，压力仍需继续确认。" : "BTC has not fallen below both cost lines, so pressure still needs confirmation.");
  const signalCopy = currentLanguage === "zh"
    ? `当前比例 ${current.toFixed(4)}，7 日均值 ${average7.toFixed(4)}，30 日均值 ${average30.toFixed(4)}，趋势为${trendLabel}。${pressureCopy}距离 0.75 历史信号线还有 ${Math.max(distance, 0).toFixed(4)}。`
    : `The ratio is ${current.toFixed(4)}, versus ${average7.toFixed(4)} for 7D and ${average30.toFixed(4)} for 30D, with a ${trendLabel.toLowerCase()} trend. ${pressureCopy} Distance to the 0.75 historical line is ${Math.max(distance, 0).toFixed(4)}.`;
  setText("#sth-ratio-signal-copy", signalCopy);
  setText("#sth-ratio-date", snapshot.onchainAsOf || "--");
  setText("#sth-ratio-projection", Number.isFinite(projection) ? projection.toFixed(4) : "--");
  setText("#sth-ratio-threshold-distance", Number.isFinite(distance) ? `${distance >= 0 ? "+" : ""}${distance.toFixed(4)}` : "--");
  setText("#sth-ratio-stage", marketStage);
  setText("#sth-ratio-source", `${costBasisSources?.sth || "STH"} · ${costBasisSources?.tmmp || "TMMP"} · DAILY${cacheFallback ? " · CACHE" : ""}`);

  const loading = document.querySelector("#sth-ratio-loading");
  if (loading) loading.hidden = true;
  drawSthRatioChart();
  return true;
};

const applyCostBasisPayload = (payload, cacheFallback = false) => {
  const rows = (payload?.series || [])
    .map((point) => ({
      date: new Date(`${point.date}T00:00:00Z`),
      price: Number(point.price),
      sth: Number(point.sth),
      tmmp: Number(point.tmmp)
    }))
    .filter((point) => !Number.isNaN(point.date.getTime()) && [point.price, point.sth, point.tmmp].every(Number.isFinite));
  if (rows.length < 2) return false;

  costBasisSeries = rows;
  costBasisSnapshot = payload.snapshot || null;
  costBasisSources = payload.sources || null;
  costBasisWindows = payload.historicalWindows || [];
  applySthRatioSnapshot(payload.ratioSnapshot || buildClientRatioSnapshot(rows), Boolean(payload.stale || cacheFallback));

  const snapshot = costBasisSnapshot;
  const isStale = Boolean(payload.stale || cacheFallback);
  const sourceSuffix = isStale ? " · CACHE" : "";
  setText("#cost-basis-price", formatUsd(Number(snapshot.price)));
  setText("#cost-basis-sth", formatUsd(Number(snapshot.sth)));
  setText("#cost-basis-tmmp", formatUsd(Number(snapshot.tmmp)));
  setText("#cost-basis-price-time", `${costBasisSources?.price || "BTC market"}${sourceSuffix} · ${formatDateTime(new Date(snapshot.priceAsOf))} CST`);

  const gap = Number(snapshot.gap);
  const gapPercent = Number(snapshot.gapPercent);
  const gapElement = document.querySelector("#cost-basis-gap");
  const gapState = document.querySelector("#cost-basis-gap-state");
  if (gapElement) {
    writeRuntimeText(gapElement, `${gap >= 0 ? "+" : ""}${formatUsd(gap)}`);
    gapElement.classList.toggle("negative", gap < 0);
    gapElement.classList.toggle("positive", gap >= 0);
  }
  if (gapState) {
    writeRuntimeText(gapState, `${gapPercent >= 0 ? "+" : ""}${gapPercent.toFixed(2)}% · ${snapshot.onchainAsOf}`);
    gapState.classList.toggle("negative", gap < 0);
    gapState.classList.toggle("positive", gap >= 0);
  }

  const signalTitle = document.querySelector("#cost-basis-signal-title");
  const convergence = snapshot.dailyConvergence === null || snapshot.dailyConvergence === undefined ? Number.NaN : Number(snapshot.dailyConvergence);
  const daysSince = snapshot.daysSinceCross === null || snapshot.daysSinceCross === undefined ? Number.NaN : Number(snapshot.daysSinceCross);
  const crossDate = snapshot.lastCrossDate;
  if (signalTitle) {
    writeRuntimeText(signalTitle, snapshot.deathCrossActive
      ? (currentLanguage === "zh" ? "STH / TMMP 死亡交叉已激活" : "STH / TMMP death cross is active")
      : (currentLanguage === "zh" ? "STH 成本线仍位于 TMMP 上方" : "STH cost basis remains above TMMP"));
    signalTitle.classList.toggle("is-active", Boolean(snapshot.deathCrossActive));
    signalTitle.classList.toggle("is-clear", !snapshot.deathCrossActive);
  }

  const direction = convergence > 0
    ? (currentLanguage === "zh" ? "收敛" : "converging")
    : (currentLanguage === "zh" ? "扩大" : "widening");
  const signalCopy = snapshot.deathCrossActive
    ? (currentLanguage === "zh"
      ? `当前 BTC 为 ${formatUsd(Number(snapshot.price))}，低于 STH 成本 ${formatUsd(Number(snapshot.sth))}；STH 比 TMMP 低 ${formatUsd(Math.abs(gap))}。过去 14 日两线平均每天${direction} ${formatUsd(Math.abs(convergence || 0))}。`
      : `BTC is ${formatUsd(Number(snapshot.price))}, below the STH basis at ${formatUsd(Number(snapshot.sth))}. STH is ${formatUsd(Math.abs(gap))} below TMMP, with the spread ${direction} by ${formatUsd(Math.abs(convergence || 0))} per day over 14 days.`)
    : (currentLanguage === "zh"
      ? `当前 STH 成本比 TMMP 高 ${formatUsd(Math.abs(gap))}，链上尚未处于 STH 向下跌破 TMMP 的死亡交叉状态。`
      : `STH cost basis is ${formatUsd(Math.abs(gap))} above TMMP, so the STH-under-TMMP death-cross condition is not active.`);
  setText("#cost-basis-signal-copy", signalCopy);
  setText("#cost-basis-cross-date", crossDate || "--");
  setText("#cost-basis-cross-days", Number.isFinite(daysSince) ? `${daysSince} ${getCopy("costBasis.days")}` : "--");
  setText("#cost-basis-convergence", Number.isFinite(convergence) ? `${convergence >= 0 ? "+" : "−"}${formatUsd(Math.abs(convergence))} / ${getCopy("costBasis.days")}` : "--");
  setText("#cost-basis-window", snapshot.deathCrossActive && Number.isFinite(Number(snapshot.daysToAverageBottom))
    ? (currentLanguage === "zh" ? `平均窗口剩余 ${snapshot.daysToAverageBottom} 天` : `${snapshot.daysToAverageBottom} days left in mean window`)
    : `157 ${getCopy("costBasis.days")}`);
  setText("#cost-basis-source", `${costBasisSources?.sth || "STH"} · ${costBasisSources?.tmmp || "TMMP"} · DAILY${sourceSuffix}`);

  const loading = document.querySelector("#cost-basis-loading");
  if (loading) loading.hidden = true;
  drawCostBasisChart();
  return true;
};

const loadCostBasisMetrics = async () => {
  const cached = readCostBasisCache();
  try {
    const payload = await fetchJsonWithRetry(`${API_BASE}/api/cost-basis`);
    if (!payload?.series?.length && cached?.series?.length && applyCostBasisPayload(cached, true)) {
      publicDataWarnings.push("cost-basis-cache");
      return;
    }
    if (!applyCostBasisPayload(payload, false)) throw new Error("Cost-basis payload is empty");
    writeDashboardCache(COST_BASIS_CACHE_KEY, payload, "Cost-basis");
    if (payload.stale) publicDataWarnings.push("cost-basis-stale");
  } catch (error) {
    if (preserveRenderedChart(costBasisSeries, costBasisSnapshot, ["#cost-basis-loading", "#sth-ratio-loading"], "cost-basis-refresh")) return;
    if (cached && applyCostBasisPayload(cached, true)) {
      publicDataWarnings.push("cost-basis-cache");
      return;
    }
    hideChartLoading("#cost-basis-loading");
    hideChartLoading("#sth-ratio-loading");
    writeRuntimeText(
      document.querySelector("#cost-basis-signal-title"),
      currentLanguage === "zh" ? "公开链上源正在重试" : "Public on-chain sources are retrying"
    );
    setText(
      "#cost-basis-signal-copy",
      currentLanguage === "zh"
        ? "暂时保留指标定义、历史规律与参考说明；公开数据恢复后将自动更新，不影响页面访问。"
        : "Metric definitions, historical context and references remain available while public data retries in the background."
    );
    publicDataWarnings.push("cost-basis-public-retry");
  }
};

const readLthRealizedCache = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(LTH_REALIZED_CACHE_KEY) || "null");
    if (!cached?.payload) return null;
    return cached.payload;
  } catch {
    return null;
  }
};

const buildClientLthSnapshot = (rows) => {
  const latest = rows.at(-1);
  if (!latest) return null;
  const price = latest.price;
  const crossStates = {
    below6m5y: latest.rp0to10y < latest.rp6m5y,
    below6m7y: latest.rp0to10y < latest.rp6m7y,
    below6m10y: latest.rp0to10y < latest.rp6m10y
  };
  const completedCrosses = Object.values(crossStates).filter(Boolean).length;
  const aboveCount = [latest.rp0to10y, latest.rp6m5y, latest.rp6m7y, latest.rp6m10y]
    .filter((basis) => price > basis).length;
  return {
    price,
    priceAsOf: latest.date.toISOString(),
    onchainAsOf: latest.date.toISOString().slice(0, 10),
    rp0to10y: latest.rp0to10y,
    rp6m5y: latest.rp6m5y,
    rp6m7y: latest.rp6m7y,
    rp6m10y: latest.rp6m10y,
    premiums: {
      rp0to10y: ((price / latest.rp0to10y) - 1) * 100,
      rp6m5y: ((price / latest.rp6m5y) - 1) * 100,
      rp6m7y: ((price / latest.rp6m7y) - 1) * 100,
      rp6m10y: ((price / latest.rp6m10y) - 1) * 100
    },
    crossStates,
    completedCrosses,
    risk: aboveCount === 4 ? "high" : aboveCount >= 2 ? "elevated" : "washout"
  };
};

const applyLthRealizedPayload = (payload, cacheFallback = false) => {
  const rows = (payload?.series || [])
    .map((point) => ({
      date: new Date(`${point.date}T00:00:00Z`),
      price: Number(point.price),
      rp0to10y: Number(point.rp0to10y),
      rp6m5y: Number(point.rp6m5y),
      rp6m7y: Number(point.rp6m7y),
      rp6m10y: Number(point.rp6m10y),
      estimated: Boolean(point.estimated)
    }))
    .filter((point) => !Number.isNaN(point.date.getTime())
      && [point.price, point.rp0to10y, point.rp6m5y, point.rp6m7y, point.rp6m10y].every((value) => Number.isFinite(value) && value > 0));
  if (rows.length < 2) return false;

  lthRealizedSeries = rows;
  lthRealizedSnapshot = payload.snapshot || buildClientLthSnapshot(rows);
  lthRealizedSources = payload.sources || null;
  const snapshot = lthRealizedSnapshot;
  if (!snapshot) return false;
  const isStale = Boolean(payload.stale || cacheFallback);
  const sourceSuffix = isStale ? " · CACHE" : "";

  setText("#lth-rp-price", formatUsd(Number(snapshot.price)));
  setText("#lth-rp-0-10", formatUsd(Number(snapshot.rp0to10y)));
  setText("#lth-rp-6m-5y", formatUsd(Number(snapshot.rp6m5y)));
  setText("#lth-rp-6m-7y", formatUsd(Number(snapshot.rp6m7y)));
  setText("#lth-rp-6m-10y", formatUsd(Number(snapshot.rp6m10y)));
  setText("#lth-rp-price-time", `${lthRealizedSources?.price || "BTC market"}${sourceSuffix} · ${formatDateTime(new Date(snapshot.priceAsOf))} CST`);

  const riskLabels = currentLanguage === "zh"
    ? { high: "高风险 · 利润兑现阶段", elevated: "偏高风险 · 成本回归", washout: "出清观察 · 底部构筑" }
    : { high: "High risk · profit realization", elevated: "Elevated risk · cost reversion", washout: "Washout watch · bottom building" };
  const title = document.querySelector("#lth-rp-signal-title");
  if (title) {
    title.textContent = riskLabels[snapshot.risk] || riskLabels.elevated;
    title.classList.toggle("is-high", snapshot.risk === "high");
    title.classList.toggle("is-elevated", snapshot.risk === "elevated");
    title.classList.toggle("is-washout", snapshot.risk === "washout");
  }

  const premiums = snapshot.premiums || {};
  const completed = Number(snapshot.completedCrosses) || 0;
  const aboveCount = [snapshot.rp0to10y, snapshot.rp6m5y, snapshot.rp6m7y, snapshot.rp6m10y]
    .filter((basis) => Number(snapshot.price) > Number(basis)).length;
  const signalCopy = currentLanguage === "zh"
    ? `当前 BTC 为 ${formatUsd(Number(snapshot.price))}，位于 ${aboveCount}/4 条年龄段成本线上方；0–10 年基准线已完成 ${completed}/3 次向下交叉。现价相对 6 月–5 年成本为 ${Number(premiums.rp6m5y).toFixed(1)}%。`
    : `BTC is ${formatUsd(Number(snapshot.price))}, above ${aboveCount}/4 age-band cost lines. The 0–10Y baseline has completed ${completed}/3 downward crosses. Price is ${Number(premiums.rp6m5y).toFixed(1)}% versus the 6M–5Y basis.`;
  setText("#lth-rp-signal-copy", signalCopy);
  setText("#lth-rp-date", snapshot.onchainAsOf || "--");
  setText("#lth-rp-cross-progress", `${completed} / 3`);
  setText("#lth-rp-premium", Number.isFinite(Number(premiums.rp6m5y)) ? `${Number(premiums.rp6m5y) >= 0 ? "+" : ""}${Number(premiums.rp6m5y).toFixed(1)}%` : "--");
  setText("#lth-rp-stage", riskLabels[snapshot.risk] || riskLabels.elevated);

  const states = snapshot.crossStates || {};
  document.querySelector("#lth-cross-5y")?.classList.toggle("is-complete", Boolean(states.below6m5y));
  document.querySelector("#lth-cross-7y")?.classList.toggle("is-complete", Boolean(states.below6m7y));
  document.querySelector("#lth-cross-10y")?.classList.toggle("is-complete", Boolean(states.below6m10y));
  const historyLabel = payload.reconstructedHistory
    ? currentLanguage === "zh" ? "公开历史重建" : "PUBLIC HISTORY RECONSTRUCTION"
    : "DAILY";
  setText("#lth-rp-source", `${lthRealizedSources?.supply || "BGeometrics"} · ${lthRealizedSources?.dailyPrice || "BGeometrics"} · ${historyLabel}${sourceSuffix}`);

  const loading = document.querySelector("#lth-rp-loading");
  if (loading) loading.hidden = true;
  drawLthRealizedChart();
  return true;
};

const loadLthRealizedMetrics = async () => {
  const cached = readLthRealizedCache();
  try {
    const response = await fetch(`${API_BASE}/api/lth-realized-price`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`LTH realized-price API ${response.status}`);
    const payload = await response.json();
    if (payload?.unavailable) {
      if (cached?.series?.length && applyLthRealizedPayload(cached, true)) {
        publicDataWarnings.push("lth-realized-cache");
        return;
      }
      if (preserveRenderedChart(lthRealizedSeries, lthRealizedSnapshot, ["#lth-rp-loading"], "lth-realized-refresh")) return;
      const authorizationRequired = payload.reason === "cryptoquant_authorization_required" || payload.reason === "cryptoquant_key_missing";
      const loading = document.querySelector("#lth-rp-loading");
      if (loading) {
        loading.hidden = false;
        loading.dataset.i18n = authorizationRequired ? "lth.authRequired" : "lth.unavailable";
        loading.textContent = getCopy(loading.dataset.i18n);
      }
      const signalTitle = document.querySelector("#lth-rp-signal-title");
      if (signalTitle) {
        signalTitle.dataset.i18n = authorizationRequired ? "lth.authTitle" : "lth.waiting";
        signalTitle.textContent = getCopy(signalTitle.dataset.i18n);
      }
      const signalCopy = document.querySelector("#lth-rp-signal-copy");
      if (signalCopy) {
        signalCopy.dataset.i18n = authorizationRequired ? "lth.authCopy" : "lth.signalPending";
        signalCopy.textContent = getCopy(signalCopy.dataset.i18n);
      }
      setText("#lth-rp-source", "CryptoQuant · AUTHORIZATION REQUIRED");
      publicDataWarnings.push("lth-realized-authorization");
      return;
    }
    if (!payload?.series?.length && cached?.series?.length && applyLthRealizedPayload(cached, true)) {
      publicDataWarnings.push("lth-realized-cache");
      return;
    }
    if (!applyLthRealizedPayload(payload, false)) throw new Error("LTH realized-price payload is empty");
    writeDashboardCache(LTH_REALIZED_CACHE_KEY, payload, "LTH realized-price");
    if (payload.stale) publicDataWarnings.push("lth-realized-stale");
  } catch (error) {
    if (preserveRenderedChart(lthRealizedSeries, lthRealizedSnapshot, ["#lth-rp-loading"], "lth-realized-refresh")) return;
    if (!cached || !applyLthRealizedPayload(cached, true)) throw error;
    publicDataWarnings.push("lth-realized-cache");
  }
};

const readRealizedProfitLossCache = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(REALIZED_PROFIT_LOSS_CACHE_KEY) || "null");
    if (!cached?.payload) return null;
    return cached.payload;
  } catch {
    return null;
  }
};

const buildClientRealizedProfitLossSnapshot = (rows) => {
  if (!rows.length) return null;
  const latest = rows.at(-1);
  const average = (days) => {
    const window = rows.slice(-days);
    return window.reduce((sum, row) => sum + row.ratio, 0) / Math.max(window.length, 1);
  };
  const trendWindow = rows.slice(-7);
  const dailySlope = trendWindow.length > 1
    ? (trendWindow.at(-1).ratio - trendWindow[0].ratio) / (trendWindow.length - 1)
    : 0;
  let crossedThresholdOn = null;
  let runningRatio = 0;
  let previousAverage = null;
  for (let index = 0; index < rows.length; index += 1) {
    runningRatio += rows[index].ratio;
    if (index >= 30) runningRatio -= rows[index - 30].ratio;
    const rollingAverage = runningRatio / Math.min(index + 1, 30);
    if (previousAverage !== null && previousAverage >= 2.2 && rollingAverage < 2.2) crossedThresholdOn = rows[index].date.toISOString().slice(0, 10);
    previousAverage = rollingAverage;
  }
  const daysSinceThreshold = crossedThresholdOn
    ? Math.max(0, Math.round((latest.date.getTime() - Date.parse(`${crossedThresholdOn}T00:00:00Z`)) / 86_400_000))
    : null;
  const amountRow = [...rows].reverse().find((row) => Number.isFinite(row.profit365SmaUsd) && Number.isFinite(row.loss365SmaUsd));
  return {
    current: latest.ratio,
    average7: average(7),
    average30: average(30),
    dailySlope,
    distanceToOne: latest.ratio - 1,
    crossedThresholdOn,
    daysSinceThreshold,
    trend: dailySlope > 0.002 ? "rising" : dailySlope < -0.002 ? "declining" : "flat",
    zone: latest.ratio < 1 ? "bottom" : latest.ratio < 2.2 ? "capitulation" : latest.ratio < 5 ? "cooling" : "expansion",
    price: latest.price,
    priceAsOf: latest.date.toISOString(),
    onchainAsOf: latest.date.toISOString().slice(0, 10),
    profit365SmaUsd: amountRow?.profit365SmaUsd ?? null,
    loss365SmaUsd: amountRow?.loss365SmaUsd ?? null,
    profitLossAsOf: amountRow?.profitLossAsOf || amountRow?.date.toISOString().slice(0, 10) || null
  };
};

const applyRealizedProfitLossPayload = (payload, cacheFallback = false) => {
  const rows = (payload?.series || [])
    .map((point) => ({
      date: new Date(`${point.date}T00:00:00Z`),
      price: Number(point.price),
      ratio: Number(point.ratio),
      profit365SmaUsd: point.profit365SmaUsd === null ? null : Number(point.profit365SmaUsd),
      loss365SmaUsd: point.loss365SmaUsd === null ? null : Number(point.loss365SmaUsd),
      profitLossAsOf: point.profitLossAsOf || null
    }))
    .filter((point) => !Number.isNaN(point.date.getTime()) && Number.isFinite(point.price) && point.price > 0 && Number.isFinite(point.ratio) && point.ratio >= 0);
  if (rows.length < 2) return false;

  realizedProfitLossSeries = rows;
  realizedProfitLossSnapshot = payload.snapshot || buildClientRealizedProfitLossSnapshot(rows);
  realizedProfitLossSources = payload.sources || null;
  const snapshot = realizedProfitLossSnapshot;
  if (!snapshot) return false;

  const current = Number(snapshot.current);
  const average7 = Number(snapshot.average7);
  const average30 = Number(snapshot.average30);
  const slope = Number(snapshot.dailySlope);
  const distance = Number(snapshot.distanceToOne);
  const daysSince = Number(snapshot.daysSinceThreshold);
  const sourceSuffix = payload.stale || cacheFallback ? " · CACHE" : "";
  const trendLabels = currentLanguage === "zh"
    ? { rising: "微弱上升", declining: "继续下降", flat: "低位横盘" }
    : { rising: "Rising", declining: "Declining", flat: "Flat" };
  const zoneLabels = currentLanguage === "zh"
    ? { bottom: "熊市底部区间", capitulation: "投降观察区", cooling: "周期降温区", expansion: "利润扩张区" }
    : { bottom: "Bear Bottom Zone", capitulation: "Capitulation Watch", cooling: "Cycle Cooling", expansion: "Profit Expansion" };

  setText("#rpl-current", current.toFixed(2));
  setText("#rpl-zone", `${current < 1 ? "BELOW 1.0" : current < 2.2 ? "BELOW 2.2" : "ABOVE 2.2"} · ${zoneLabels[snapshot.zone] || zoneLabels.cooling}`);
  setText("#rpl-trend", trendLabels[snapshot.trend] || trendLabels.flat);
  setText("#rpl-slope", `${slope >= 0 ? "+" : ""}${slope.toFixed(4)} / DAY`);
  setText("#rpl-averages", `${average7.toFixed(2)} / ${average30.toFixed(2)}`);
  setText("#rpl-distance", `${distance >= 0 ? "+" : ""}${distance.toFixed(2)}`);
  setText("#rpl-date", `${snapshot.onchainAsOf || "--"} · DAILY`);
  setText("#rpl-cross-date", snapshot.crossedThresholdOn || "--");
  setText("#rpl-days-since", Number.isFinite(daysSince) ? `${daysSince} ${currentLanguage === "zh" ? "天" : "days"}` : "--");
  setText("#rpl-current-days", Number.isFinite(daysSince) ? daysSince : "--");
  setText("#rpl-profit-sma", Number.isFinite(Number(snapshot.profit365SmaUsd)) ? compactUsd(Number(snapshot.profit365SmaUsd)) : "--");
  setText("#rpl-loss-sma", Number.isFinite(Number(snapshot.loss365SmaUsd)) ? compactUsd(Number(snapshot.loss365SmaUsd)) : "--");

  const title = document.querySelector("#rpl-signal-title");
  if (title) {
    title.textContent = zoneLabels[snapshot.zone] || zoneLabels.cooling;
    ["bottom", "capitulation", "cooling", "expansion"].forEach((zone) => title.classList.toggle(`is-${zone}`, snapshot.zone === zone));
  }
  const lossDominance = current > 0 ? Math.max(0, ((1 / current) - 1) * 100) : 100;
  const signalCopy = currentLanguage === "zh"
    ? current < 1
      ? `当前比率为 ${current.toFixed(2)}，已实现损失约比已实现利润高 ${lossDominance.toFixed(1)}%。自跌破 2.2 观察线后已过 ${Number.isFinite(daysSince) ? daysSince : "--"} 天，链上结构处于亏损兑现主导的投降观察区。`
      : `当前比率为 ${current.toFixed(2)}，市场仍由获利了结主导。7 日均值为 ${average7.toFixed(2)}，30 日均值为 ${average30.toFixed(2)}，继续观察是否向 1.0 平衡线收敛。`
    : current < 1
      ? `The ratio is ${current.toFixed(2)}. Realized losses are about ${lossDominance.toFixed(1)}% larger than realized profits. ${Number.isFinite(daysSince) ? daysSince : "--"} days have elapsed since the 2.2 warning cross.`
      : `The ratio is ${current.toFixed(2)}, so profit-taking still dominates. The 7-day average is ${average7.toFixed(2)} versus ${average30.toFixed(2)} for 30 days.`;
  setText("#rpl-signal-copy", signalCopy);
  setText("#rpl-source", `${realizedProfitLossSources?.history || "BGeometrics public chart files"}${sourceSuffix} · DAILY`);

  const currentElement = document.querySelector("#rpl-current");
  currentElement?.classList.toggle("negative", current < 1);
  currentElement?.classList.toggle("positive", current >= 1);
  const loading = document.querySelector("#rpl-loading");
  if (loading) loading.hidden = true;
  drawRealizedProfitLossChart();
  return true;
};

const loadRealizedProfitLossMetrics = async () => {
  const cached = readRealizedProfitLossCache();
  try {
    const response = await fetch(`${API_BASE}/api/realized-profit-loss`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Realized profit/loss API ${response.status}`);
    const payload = await response.json();
    if (!applyRealizedProfitLossPayload(payload, false)) throw new Error("Realized profit/loss payload is empty");
    writeDashboardCache(REALIZED_PROFIT_LOSS_CACHE_KEY, payload, "Realized profit/loss");
    if (payload.stale) publicDataWarnings.push("realized-profit-loss-stale");
  } catch (error) {
    if (preserveRenderedChart(realizedProfitLossSeries, realizedProfitLossSnapshot, ["#rpl-loading"], "realized-profit-loss-refresh")) return;
    if (!cached || !applyRealizedProfitLossPayload(cached, true)) throw error;
    publicDataWarnings.push("realized-profit-loss-cache");
  }
};

const readMedianRealizedCache = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(MEDIAN_REALIZED_CACHE_KEY) || "null");
    if (!cached?.payload) return null;
    return cached.payload;
  } catch {
    return null;
  }
};

const buildClientMedianRealizedSnapshot = (series) => {
  const medianRows = series.filter((point) => Number.isFinite(point.median));
  const latest = medianRows.at(-1);
  const latestPrice = series.at(-1);
  if (!latest || !latestPrice) return null;
  const ratio = latestPrice.price / latest.median;
  return {
    price: latestPrice.price,
    priceAsOf: latestPrice.date.toISOString(),
    median: latest.median,
    medianEstimated: Boolean(latest.estimated),
    medianAsOf: latest.date.toISOString().slice(0, 10),
    ratio,
    distanceUsd: latestPrice.price - latest.median,
    distancePercent: (ratio - 1) * 100,
    monthlyChange: null,
    monthlyPercent: null,
    monthlyTrend: "unavailable",
    oneYearAgo: null,
    fourYearsAgo: null,
    yoyGrowth: null,
    fourYearGrowth: null,
    zone: ratio < 0.95 ? "below" : ratio <= 1.15 ? "support" : ratio <= 1.8 ? "balanced" : "extended"
  };
};

const applyMedianMvrvPayload = (rows, payload, cacheFallback = false) => {
  const completeHistory = Boolean(payload?.completeHistory);
  const series = buildMedianMvrvSeries(rows, payload?.snapshot || null);
  const snapshot = buildMedianMvrvSnapshot(series, payload?.snapshot || null, completeHistory);
  if (series.length < 2 || !snapshot) return false;

  medianMvrvSeries = series;
  medianMvrvSnapshot = snapshot;
  medianMvrvSources = payload?.sources || null;
  const phaseLabels = currentLanguage === "zh"
    ? { deep: "深度投降区", below: "跌破盈亏平衡", near: "接近盈亏平衡", balanced: "温和盈利区", extended: "高位偏离区" }
    : { deep: "Deep Capitulation", below: "Below Break-Even", near: "Near Break-Even", balanced: "Moderate Profit", extended: "Extended Above Cost" };
  const trendLabels = currentLanguage === "zh"
    ? { rising: "回升", falling: "回落", flat: "平稳" }
    : { rising: "Rising", falling: "Falling", flat: "Flat" };
  const sourceMode = completeHistory
    ? (payload?.estimatedHistory
      ? (currentLanguage === "zh" ? "公开重建历史" : "PUBLIC RECONSTRUCTED HISTORY")
      : (currentLanguage === "zh" ? "完整历史" : "FULL HISTORY"))
    : (currentLanguage === "zh" ? `${snapshot.verifiedCount} 个公开日快照` : `${snapshot.verifiedCount} PUBLIC DAILY SNAPSHOTS`);
  const sourceSuffix = payload?.stale || cacheFallback ? " · CACHE" : "";
  const distance = snapshot.distanceToOne;

  setText("#median-mvrv-current", snapshot.ratio.toFixed(4));
  setText("#median-mvrv-phase", phaseLabels[snapshot.zone] || phaseLabels.near);
  setText("#median-mvrv-median", formatUsd(snapshot.median));
  setText("#median-mvrv-median-date", `${snapshot.medianAsOf || "--"} · DAILY`);
  setText("#median-mvrv-distance", `${distance >= 0 ? "+" : ""}${distance.toFixed(4)}`);
  setText("#median-mvrv-trend", `${trendLabels[snapshot.trend] || trendLabels.flat} · 7D ${snapshot.sevenDayChange >= 0 ? "+" : ""}${snapshot.sevenDayChange.toFixed(4)}`);
  setText("#median-mvrv-averages", `${snapshot.average7.toFixed(4)} / ${snapshot.average30.toFixed(4)}`);
  setText("#median-mvrv-date", `${snapshot.medianAsOf || "--"} · ${completeHistory ? "HISTORY" : "SNAPSHOT"}`);
  setText("#median-mvrv-analysis-trend", trendLabels[snapshot.trend] || trendLabels.flat);
  setText("#median-mvrv-price", formatUsd(snapshot.price));
  setText("#median-mvrv-source-mode", sourceMode);
  setText("#median-mvrv-as-of", snapshot.medianAsOf || "--");
  setText("#median-mvrv-source", `${medianMvrvSources?.median || "Public Median RP Snapshots"}${sourceSuffix} · LIVE SPOT`);

  const signalTitle = document.querySelector("#median-mvrv-signal-title");
  if (signalTitle) {
    signalTitle.textContent = phaseLabels[snapshot.zone] || phaseLabels.near;
    ["deep", "below", "near", "balanced", "extended"].forEach((zone) => signalTitle.classList.toggle(`is-${zone}`, snapshot.zone === zone));
  }
  const signalCopy = currentLanguage === "zh"
    ? snapshot.ratio < 1
      ? `当前中位数 MVRV 为 ${snapshot.ratio.toFixed(4)}，BTC ${formatUsd(snapshot.price)} 已低于中位成本 ${formatUsd(snapshot.median)}，典型持有者处于盈亏平衡线下方。`
      : snapshot.ratio <= 1.15
        ? `当前中位数 MVRV 为 ${snapshot.ratio.toFixed(4)}，仅高于 1.0 盈亏平衡线 ${(distance * 100).toFixed(2)}%，市场正测试典型持有者的核心成本区。`
        : `当前中位数 MVRV 为 ${snapshot.ratio.toFixed(4)}，典型持有者仍处于盈利状态；应继续观察比值是否向 1.0 收敛。`
    : snapshot.ratio < 1
      ? `Median MVRV is ${snapshot.ratio.toFixed(4)}. BTC at ${formatUsd(snapshot.price)} is below the ${formatUsd(snapshot.median)} median cost, placing the typical holder under break-even.`
      : snapshot.ratio <= 1.15
        ? `Median MVRV is ${snapshot.ratio.toFixed(4)}, only ${(distance * 100).toFixed(2)}% above the 1.0 break-even line. The market is testing the typical holder's core cost zone.`
        : `Median MVRV is ${snapshot.ratio.toFixed(4)}. Typical holders remain profitable while convergence toward 1.0 remains the key condition to watch.`;
  setText("#median-mvrv-signal-copy", signalCopy);

  const loading = document.querySelector("#median-mvrv-loading");
  if (loading) loading.hidden = true;
  drawMedianMvrvChart();
  return true;
};

const applyMedianRealizedPayload = (payload, cacheFallback = false) => {
  const rows = (payload?.series || [])
    .map((point) => ({
      date: new Date(`${point.date}T00:00:00Z`),
      price: Number(point.price),
      median: point.median === null ? null : Number(point.median),
      estimated: Boolean(point.medianEstimated)
    }))
    .filter((point) => !Number.isNaN(point.date.getTime()) && Number.isFinite(point.price) && point.price > 0);
  if (rows.length < 2 || !rows.some((point) => Number.isFinite(point.median))) return false;

  medianRealizedSeries = rows;
  medianRealizedSnapshot = payload.snapshot || buildClientMedianRealizedSnapshot(rows);
  medianRealizedSources = payload.sources || null;
  const snapshot = medianRealizedSnapshot;
  if (!snapshot) return false;

  const price = Number(snapshot.price);
  const median = Number(snapshot.median);
  const ratio = Number(snapshot.ratio);
  const distanceUsd = Number(snapshot.distanceUsd);
  const distancePercent = Number(snapshot.distancePercent);
  const monthlyChange = snapshot.monthlyChange == null ? null : Number(snapshot.monthlyChange);
  const monthlyPercent = snapshot.monthlyPercent == null ? null : Number(snapshot.monthlyPercent);
  const trendLabels = currentLanguage === "zh"
    ? { rising: "上升", falling: "下降", flat: "平稳", unavailable: "日快照累积中" }
    : { rising: "Rising", falling: "Falling", flat: "Flat", unavailable: "Building daily history" };
  const zoneLabels = currentLanguage === "zh"
    ? { below: "跌破典型成本", support: "接近中位支撑", balanced: "温和盈利区", extended: "高位偏离区" }
    : { below: "Below Typical Cost", support: "Near Median Support", balanced: "Moderate Profit", extended: "Extended Above Cost" };
  const sourceSuffix = payload.stale || cacheFallback ? " · CACHE" : "";
  const completeHistory = Boolean(payload.completeHistory);

  setText("#median-rp-price", formatUsd(price));
  setText("#median-rp-price-date", `${formatDateTime(new Date(snapshot.priceAsOf || Date.now()))} CST`);
  setText("#median-rp-current", formatUsd(median));
  setText("#median-rp-date", `${snapshot.medianAsOf || "--"} · DAILY`);
  setText("#median-rp-ratio", ratio.toFixed(4));
  setText("#median-rp-distance", `${distancePercent >= 0 ? "+" : ""}${distancePercent.toFixed(2)}% · ${formatUsd(distanceUsd)}`);
  setText("#median-rp-trend", trendLabels[snapshot.monthlyTrend] || trendLabels.unavailable);
  setText("#median-rp-monthly-change", Number.isFinite(monthlyPercent) && Number.isFinite(monthlyChange)
    ? `${monthlyPercent >= 0 ? "+" : ""}${monthlyPercent.toFixed(2)}% · ${formatUsd(monthlyChange)}`
    : (currentLanguage === "zh" ? "等待 30 天有效观测" : "Awaiting 30 verified observations"));
  setText("#median-rp-one-year", snapshot.oneYearAgo != null && Number.isFinite(Number(snapshot.oneYearAgo)) ? formatUsd(Number(snapshot.oneYearAgo)) : "--");
  setText("#median-rp-four-years", snapshot.fourYearsAgo != null && Number.isFinite(Number(snapshot.fourYearsAgo)) ? formatUsd(Number(snapshot.fourYearsAgo)) : "--");
  setText("#median-rp-yoy", snapshot.yoyGrowth != null && Number.isFinite(Number(snapshot.yoyGrowth)) ? `${Number(snapshot.yoyGrowth) >= 0 ? "+" : ""}${Number(snapshot.yoyGrowth).toFixed(1)}%` : "--");
  setText("#median-rp-four-year-growth", snapshot.fourYearGrowth != null && Number.isFinite(Number(snapshot.fourYearGrowth)) ? `${Number(snapshot.fourYearGrowth) >= 0 ? "+" : ""}${Number(snapshot.fourYearGrowth).toFixed(1)}%` : "--");
  setText("#median-rp-history-ratio", ratio.toFixed(4));
  setText("#median-rp-history-gap", formatUsd(distanceUsd));
  setText("#median-rp-source-mode", completeHistory
    ? (payload.estimatedHistory
      ? (currentLanguage === "zh" ? "公开重建历史" : "PUBLIC RECONSTRUCTED HISTORY")
      : (currentLanguage === "zh" ? "完整历史" : "FULL HISTORY"))
    : (currentLanguage === "zh" ? "公开快照" : "PUBLIC SNAPSHOTS"));
  setText("#median-rp-history-zone", zoneLabels[snapshot.zone] || zoneLabels.support);
  setText("#median-rp-source", `${medianRealizedSources?.median || "Public median realized price"}${sourceSuffix} · DAILY`);

  const title = document.querySelector("#median-rp-signal-title");
  if (title) {
    title.textContent = zoneLabels[snapshot.zone] || zoneLabels.support;
    ["below", "support", "balanced", "extended"].forEach((zone) => title.classList.toggle(`is-${zone}`, snapshot.zone === zone));
  }
  const signalCopy = currentLanguage === "zh"
    ? snapshot.zone === "below"
      ? `当前 BTC 为 ${formatUsd(price)}，低于中位实现价格 ${formatUsd(median)}，典型持有者成本线已转为上方阻力观察位。`
      : snapshot.zone === "support"
        ? `当前 BTC 为 ${formatUsd(price)}，较中位实现价格 ${formatUsd(median)} 偏离 ${distancePercent.toFixed(2)}%，市场正在测试典型持有者的核心盈亏平衡线。`
        : `当前 BTC 较中位实现价格高 ${distancePercent.toFixed(2)}%，典型持有者整体仍处于盈利状态，需结合价格结构判断偏离是否继续扩张。`
    : snapshot.zone === "below"
      ? `BTC at ${formatUsd(price)} is below the ${formatUsd(median)} median realized price, making the typical cost line an overhead resistance reference.`
      : snapshot.zone === "support"
        ? `BTC at ${formatUsd(price)} is ${distancePercent.toFixed(2)}% from the ${formatUsd(median)} median realized price and is testing the typical holder's break-even line.`
        : `BTC is ${distancePercent.toFixed(2)}% above the median realized price. Typical holders remain in profit while distance from cost continues to matter.`;
  setText("#median-rp-signal-copy", signalCopy);

  applyMedianMvrvPayload(rows, payload, cacheFallback);

  const loading = document.querySelector("#median-rp-loading");
  if (loading) loading.hidden = true;
  drawMedianRealizedChart();
  return true;
};

const loadMedianRealizedMetrics = async () => {
  const cached = readMedianRealizedCache();
  try {
    const response = await fetch(`${API_BASE}/api/median-realized-price`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Median realized price API ${response.status}`);
    const payload = await response.json();
    if (!applyMedianRealizedPayload(payload, false)) throw new Error("Median realized price payload is empty");
    writeDashboardCache(MEDIAN_REALIZED_CACHE_KEY, payload, "Median realized price");
    if (payload.stale || !payload.completeHistory) publicDataWarnings.push("median-realized-public-snapshots");
  } catch (error) {
    if (preserveRenderedChart(medianRealizedSeries, medianRealizedSnapshot, ["#median-rp-loading", "#median-mvrv-loading"], "median-realized-refresh")) return;
    if (!cached || !applyMedianRealizedPayload(cached, true)) throw error;
    publicDataWarnings.push("median-realized-cache");
  }
};

const readMvrvBandsCache = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(MVRV_BANDS_CACHE_KEY) || "null");
    if (!cached?.payload) return null;
    return cached.payload;
  } catch {
    return null;
  }
};

const applyMvrvBandsPayload = (payload, cacheFallback = false) => {
  const rows = (payload?.series || []).map((point) => ({
    date: new Date(`${point.date}T00:00:00Z`),
    price: Number(point.price),
    mvrv: Number(point.mvrv),
    mean: point.mean == null ? null : Number(point.mean),
    std: point.std == null ? null : Number(point.std),
    minusOne: point.minusOne == null ? null : Number(point.minusOne),
    minusHalf: point.minusHalf == null ? null : Number(point.minusHalf),
    plusHalf: point.plusHalf == null ? null : Number(point.plusHalf),
    plusOne: point.plusOne == null ? null : Number(point.plusOne),
    plusTwo: point.plusTwo == null ? (point.mean == null || point.std == null ? null : Number(point.mean) + Number(point.std) * 2) : Number(point.plusTwo),
    realizedPrice: point.realizedPrice == null ? Number(point.price) / Number(point.mvrv) : Number(point.realizedPrice),
    priceMinusOne: point.priceMinusOne == null || point.minusOne == null ? null : Number(point.priceMinusOne),
    priceMinusHalf: point.priceMinusHalf == null || point.minusHalf == null ? null : Number(point.priceMinusHalf),
    priceMean: point.priceMean == null || point.mean == null ? null : Number(point.priceMean),
    pricePlusOne: point.pricePlusOne == null || point.plusOne == null ? null : Number(point.pricePlusOne),
    pricePlusTwo: point.pricePlusTwo == null || (point.plusTwo == null && (point.mean == null || point.std == null)) ? null : Number(point.pricePlusTwo),
    zscore: point.zscore == null ? null : Number(point.zscore)
  })).map((point) => ({
    ...point,
    priceMinusOne: Number.isFinite(point.priceMinusOne) ? point.priceMinusOne : Number.isFinite(point.minusOne) ? point.realizedPrice * point.minusOne : null,
    priceMinusHalf: Number.isFinite(point.priceMinusHalf) ? point.priceMinusHalf : Number.isFinite(point.minusHalf) ? point.realizedPrice * point.minusHalf : null,
    priceMean: Number.isFinite(point.priceMean) ? point.priceMean : Number.isFinite(point.mean) ? point.realizedPrice * point.mean : null,
    pricePlusOne: Number.isFinite(point.pricePlusOne) ? point.pricePlusOne : Number.isFinite(point.plusOne) ? point.realizedPrice * point.plusOne : null,
    pricePlusTwo: Number.isFinite(point.pricePlusTwo) ? point.pricePlusTwo : Number.isFinite(point.plusTwo) ? point.realizedPrice * point.plusTwo : null
  })).filter((point) => !Number.isNaN(point.date.getTime()) && Number.isFinite(point.price) && point.price > 0 && Number.isFinite(point.mvrv) && point.mvrv > 0);
  const snapshot = payload?.snapshot;
  if (rows.length < 365 || !snapshot || !Number.isFinite(Number(snapshot.mean))) return false;

  mvrvBandsSeries = rows;
  mvrvBandsSnapshot = snapshot;
  mvrvBandsSources = payload.sources || null;
  mvrvBandsBreaches = Array.isArray(payload.breaches) ? payload.breaches : [];
  mvrvPriceBandsSeries = rows;
  mvrvPriceBandsSnapshot = snapshot;

  const mvrv = Number(snapshot.mvrv);
  const zscore = Number(snapshot.zscore);
  const mean = Number(snapshot.mean);
  const std = Number(snapshot.std);
  const minusOne = Number(snapshot.minusOne);
  const minusHalf = Number(snapshot.minusHalf);
  const plusHalf = Number(snapshot.plusHalf);
  const plusOne = Number(snapshot.plusOne);
  const average7 = Number(snapshot.average7);
  const average30 = Number(snapshot.average30);
  const sevenDayChange = Number(snapshot.sevenDayChange);
  const distance = mvrv - minusOne;
  const phaseLabels = currentLanguage === "zh"
    ? { capitulation: "低于 -1σ · 极端投降", undervalued: "低估观察区", normal: "正常范围内", elevated: "高估预警区", overheated: "过热泡沫区" }
    : { capitulation: "Below -1σ · Capitulation", undervalued: "Undervaluation Watch", normal: "Within Normal Range", elevated: "Overvaluation Watch", overheated: "Overheated Bubble" };
  const trendLabels = currentLanguage === "zh"
    ? { rising: "回升", falling: "回落", flat: "平稳" }
    : { rising: "Rising", falling: "Falling", flat: "Flat" };
  const sourceSuffix = payload.stale || cacheFallback ? " · CACHE" : "";

  setText("#mvrv-bands-current", mvrv.toFixed(3));
  setText("#mvrv-bands-phase", phaseLabels[snapshot.phase] || phaseLabels.normal);
  setText("#mvrv-bands-zscore", `${zscore >= 0 ? "+" : ""}${zscore.toFixed(2)}`);
  setText("#mvrv-bands-trend", `${trendLabels[snapshot.trend] || trendLabels.flat} · 7D ${sevenDayChange >= 0 ? "+" : ""}${sevenDayChange.toFixed(3)}`);
  setText("#mvrv-bands-mean-std", `${mean.toFixed(3)} / ${std.toFixed(3)}`);
  setText("#mvrv-bands-range", `${minusOne.toFixed(3)} / ${plusOne.toFixed(3)}`);
  setText("#mvrv-bands-date", `${snapshot.asOf || "--"} · 1,460D`);
  setText("#mvrv-bands-price", formatUsd(Number(snapshot.price)));
  setText("#mvrv-bands-averages", `${average7.toFixed(3)} / ${average30.toFixed(3)}`);
  setText("#mvrv-bands-distance", `${distance >= 0 ? "+" : ""}${distance.toFixed(3)} · ${zscore.toFixed(2)}σ`);
  setText("#mvrv-bands-as-of", snapshot.asOf || "--");
  setText("#mvrv-band-minus-one", minusOne.toFixed(3));
  setText("#mvrv-band-minus-half", minusHalf.toFixed(3));
  setText("#mvrv-band-mean", mean.toFixed(3));
  setText("#mvrv-band-plus-half", plusHalf.toFixed(3));
  setText("#mvrv-band-plus-one", plusOne.toFixed(3));
  setText("#mvrv-bands-source", `${mvrvBandsSources?.history || "Coin Metrics Community API"}${sourceSuffix} · 4Y ROLLING`);

  const title = document.querySelector("#mvrv-bands-signal-title");
  if (title) {
    title.textContent = phaseLabels[snapshot.phase] || phaseLabels.normal;
    ["capitulation", "undervalued", "normal", "elevated", "overheated"].forEach((phase) => title.classList.toggle(`is-${phase}`, snapshot.phase === phase));
  }
  const signalCopy = currentLanguage === "zh"
    ? snapshot.phase === "capitulation"
      ? `当前 MVRV 为 ${mvrv.toFixed(3)}，已低于 -1σ 波段 ${minusOne.toFixed(3)}，相对自身四年历史进入统计极端区。应继续确认现货需求与价格结构是否止跌。`
      : snapshot.phase === "undervalued"
        ? `当前 MVRV 为 ${mvrv.toFixed(3)}，Z 分数 ${zscore.toFixed(2)}，仍处于四年均值下方的低估观察区，距离 -1σ 支撑 ${Math.abs(distance).toFixed(3)}。`
        : snapshot.phase === "normal"
          ? `当前 MVRV 为 ${mvrv.toFixed(3)}，Z 分数 ${zscore.toFixed(2)}，位于 -1σ ${minusOne.toFixed(3)} 与 +1σ ${plusOne.toFixed(3)} 之间，估值处于正常范围。`
          : `当前 MVRV 为 ${mvrv.toFixed(3)}，已经高于四年均值 ${mean.toFixed(3)}，需观察是否继续向 +1σ ${plusOne.toFixed(3)} 扩张。`
    : snapshot.phase === "capitulation"
      ? `MVRV is ${mvrv.toFixed(3)}, below the ${minusOne.toFixed(3)} minus-one-sigma band and statistically extreme versus its own four-year history. Spot demand and price stabilization still need to confirm.`
      : snapshot.phase === "undervalued"
        ? `MVRV is ${mvrv.toFixed(3)} with a ${zscore.toFixed(2)} Z-score, inside the undervaluation watch zone and ${Math.abs(distance).toFixed(3)} from minus one sigma.`
        : snapshot.phase === "normal"
          ? `MVRV is ${mvrv.toFixed(3)} with a ${zscore.toFixed(2)} Z-score, between ${minusOne.toFixed(3)} minus one sigma and ${plusOne.toFixed(3)} plus one sigma.`
          : `MVRV is ${mvrv.toFixed(3)}, above the ${mean.toFixed(3)} four-year mean. Watch whether valuation expands toward ${plusOne.toFixed(3)} plus one sigma.`;
  setText("#mvrv-bands-signal-copy", signalCopy);

  const loading = document.querySelector("#mvrv-bands-loading");
  if (loading) loading.hidden = true;
  applyMvrvPriceBandsSnapshot(payload, cacheFallback);
  drawMvrvBandsChart();
  return true;
};

const applyMvrvPriceBandsSnapshot = (payload, cacheFallback = false) => {
  const snapshot = payload?.snapshot || mvrvPriceBandsSnapshot;
  const latest = [...mvrvPriceBandsSeries].reverse().find((point) => Number.isFinite(point.priceMean));
  if (!snapshot || !latest) return false;

  const price = Number(snapshot.price) || latest.price;
  const realizedPrice = Number(snapshot.realizedPrice) || latest.realizedPrice;
  const currentMvrv = Number(snapshot.currentMvrv) || price / realizedPrice;
  const priceBands = snapshot.priceBands || {
    minusOne: latest.priceMinusOne,
    minusHalf: latest.priceMinusHalf,
    mean: latest.priceMean,
    plusOne: latest.pricePlusOne,
    plusTwo: latest.pricePlusTwo
  };
  const zone = snapshot.priceZone || (price < priceBands.minusOne
    ? "bear-bottom"
    : price < priceBands.minusHalf
      ? "deep-value"
      : price < priceBands.mean
        ? "accumulation"
        : price < priceBands.plusOne
          ? "fair-value"
          : price < priceBands.plusTwo
            ? "elevated"
            : "cycle-top");
  const distanceFromBottom = Number.isFinite(Number(snapshot.distanceFromMinusOnePct))
    ? Number(snapshot.distanceFromMinusOnePct)
    : (price / priceBands.minusOne - 1) * 100;
  const distanceToMean = Number.isFinite(Number(snapshot.distanceToMeanPct))
    ? Number(snapshot.distanceToMeanPct)
    : (price / priceBands.mean - 1) * 100;
  const distanceToTop = Number.isFinite(Number(snapshot.distanceToPlusTwoPct))
    ? Number(snapshot.distanceToPlusTwoPct)
    : (price / priceBands.plusTwo - 1) * 100;
  const trendLabels = currentLanguage === "zh"
    ? { rising: "稳步上行", falling: "回落", flat: "平稳" }
    : { rising: "Rising", falling: "Falling", flat: "Flat" };
  const zoneLabels = currentLanguage === "zh"
    ? {
      "bear-bottom": "低于 -1σ · 熊底压力区",
      "deep-value": "-1σ 至 -0.5σ · 深度价值区",
      accumulation: "-0.5σ 至均值 · 吸筹区",
      "fair-value": "均值至 +1σ · 公允扩张区",
      elevated: "+1σ 至 +2σ · 高估预警区",
      "cycle-top": "高于 +2σ · 周期顶部区"
    }
    : {
      "bear-bottom": "Below -1σ · Bear-Bottom Stress",
      "deep-value": "-1σ to -0.5σ · Deep Value",
      accumulation: "-0.5σ to Mean · Accumulation",
      "fair-value": "Mean to +1σ · Fair-Value Expansion",
      elevated: "+1σ to +2σ · Elevated",
      "cycle-top": "Above +2σ · Cycle-Top Zone"
    };
  const sourceSuffix = payload?.stale || cacheFallback ? " · CACHE" : "";

  setText("#mvrv-price-bands-price", formatUsd(price));
  setText("#mvrv-price-bands-zone", zoneLabels[zone]);
  setText("#mvrv-price-bands-current", currentMvrv.toFixed(3));
  setText("#mvrv-price-bands-mvrv-state", currentMvrv < 1 ? (currentLanguage === "zh" ? "低于全网平均成本" : "Below Aggregate Cost Basis") : (currentLanguage === "zh" ? "高于全网平均成本" : "Above Aggregate Cost Basis"));
  setText("#mvrv-price-bands-realized", formatUsd(realizedPrice));
  setText("#mvrv-price-bands-trend", trendLabels[snapshot.trend] || trendLabels.flat);
  setText("#mvrv-price-bands-date", `${snapshot.asOf || latest.date.toISOString().slice(0, 10)} · 1,460D`);
  setText("#mvrv-price-bands-from-bottom", `${distanceFromBottom >= 0 ? "+" : ""}${distanceFromBottom.toFixed(1)}%`);
  setText("#mvrv-price-bands-to-mean", `${distanceToMean >= 0 ? "+" : ""}${distanceToMean.toFixed(1)}%`);
  setText("#mvrv-price-bands-to-top", `${distanceToTop >= 0 ? "+" : ""}${distanceToTop.toFixed(1)}%`);
  setText("#mvrv-price-bands-as-of", snapshot.asOf || latest.date.toISOString().slice(0, 10));
  setText("#mvrv-price-band-minus-one", formatUsd(priceBands.minusOne));
  setText("#mvrv-price-band-minus-half", formatUsd(priceBands.minusHalf));
  setText("#mvrv-price-band-mean", formatUsd(priceBands.mean));
  setText("#mvrv-price-band-plus-one", formatUsd(priceBands.plusOne));
  setText("#mvrv-price-band-plus-two", formatUsd(priceBands.plusTwo));
  setText("#mvrv-price-bands-source", `${mvrvBandsSources?.history || "Coin Metrics Community API"}${sourceSuffix} · 4Y ROLLING · LIVE SPOT`);

  const title = document.querySelector("#mvrv-price-bands-signal-title");
  if (title) {
    title.textContent = zoneLabels[zone];
    ["bear-bottom", "deep-value", "accumulation", "fair-value", "elevated", "cycle-top"].forEach((item) => title.classList.toggle(`is-${item}`, zone === item));
  }
  const signalCopy = currentLanguage === "zh"
    ? `BTC 实时价格 ${formatUsd(price)}，当前 MVRV ${currentMvrv.toFixed(3)}，位于 -1σ ${formatUsd(priceBands.minusOne)}、-0.5σ ${formatUsd(priceBands.minusHalf)} 与均值 ${formatUsd(priceBands.mean)} 构成的统计通道中。距离均值公允价 ${distanceToMean >= 0 ? "+" : ""}${distanceToMean.toFixed(1)}%。`
    : `Live BTC price is ${formatUsd(price)} with MVRV at ${currentMvrv.toFixed(3)}, positioned within the statistical channel defined by -1σ ${formatUsd(priceBands.minusOne)}, -0.5σ ${formatUsd(priceBands.minusHalf)} and the ${formatUsd(priceBands.mean)} mean. Distance to mean fair value is ${distanceToMean >= 0 ? "+" : ""}${distanceToMean.toFixed(1)}%.`;
  setText("#mvrv-price-bands-signal-copy", signalCopy);

  const loading = document.querySelector("#mvrv-price-bands-loading");
  if (loading) loading.hidden = true;
  drawMvrvPriceBandsChart();
  return true;
};

const loadMvrvBandsMetrics = async () => {
  const cached = readMvrvBandsCache();
  try {
    const response = await fetch(`${API_BASE}/api/mvrv-bands`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`MVRV bands API ${response.status}`);
    const payload = await response.json();
    if (!applyMvrvBandsPayload(payload, false)) throw new Error("MVRV bands payload is empty");
    writeDashboardCache(MVRV_BANDS_CACHE_KEY, payload, "MVRV bands");
    if (payload.stale) publicDataWarnings.push("mvrv-bands-stale");
  } catch (error) {
    if (preserveRenderedChart(mvrvBandsSeries, mvrvBandsSnapshot, ["#mvrv-bands-loading", "#mvrv-price-bands-loading"], "mvrv-bands-refresh")) return;
    if (!cached || !applyMvrvBandsPayload(cached, true)) throw error;
    publicDataWarnings.push("mvrv-bands-cache");
  }
};

const readStockToFlowCache = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(STOCK_TO_FLOW_CACHE_KEY) || "null");
    if (!cached?.payload) return null;
    return cached.payload;
  } catch {
    return null;
  }
};

const applyStockToFlowPayload = (payload, cacheFallback = false) => {
  const rows = (payload?.series || []).map((point) => ({
    date: new Date(`${point.date}T00:00:00Z`),
    price: Number(point.price),
    supply: Number(point.supply),
    subsidy: Number(point.subsidy),
    annualFlow: Number(point.annualFlow),
    stockToFlow: Number(point.stockToFlow),
    modelPrice: Number(point.modelPrice),
    minusTwo: Number(point.minusTwo),
    minusOne: Number(point.minusOne),
    plusOne: Number(point.plusOne),
    plusTwo: Number(point.plusTwo),
    logDeviation: Number(point.logDeviation),
    sigmaDeviation: Number(point.sigmaDeviation)
  })).filter((point) => !Number.isNaN(point.date.getTime())
    && Number.isFinite(point.price) && point.price > 0
    && Number.isFinite(point.stockToFlow) && point.stockToFlow > 0
    && Number.isFinite(point.modelPrice) && point.modelPrice > 0);
  const snapshot = payload?.snapshot;
  if (rows.length < 365 || !snapshot || !Number.isFinite(Number(snapshot.stockToFlow))) return false;

  stockToFlowSeries = rows;
  stockToFlowSnapshot = snapshot;
  stockToFlowSources = payload.sources || null;
  stockToFlowHalvings = Array.isArray(payload.halvings) ? payload.halvings : [];

  const price = Number(snapshot.price);
  const ratio = Number(snapshot.stockToFlow);
  const modelPrice = Number(snapshot.modelPrice);
  const deviationPct = Number(snapshot.deviationPct);
  const spotDiscountPct = Number(snapshot.spotDiscountPct);
  const sigmaDeviation = Number(snapshot.sigmaDeviation);
  const minusTwo = Number(snapshot.minusTwo);
  const minusOne = Number(snapshot.minusOne);
  const zoneLabels = currentLanguage === "zh"
    ? {
      "below-minus-two": "低于 -2σ · 极端偏离",
      "below-minus-one": "-2σ 至 -1σ · 深度折价",
      "model-range": "-1σ 至 +1σ · 模型区间",
      "above-plus-one": "+1σ 至 +2σ · 高估扩张",
      "above-plus-two": "高于 +2σ · 极端溢价"
    }
    : {
      "below-minus-two": "Below -2σ · Extreme Deviation",
      "below-minus-one": "-2σ to -1σ · Deep Discount",
      "model-range": "-1σ to +1σ · Model Range",
      "above-plus-one": "+1σ to +2σ · Elevated",
      "above-plus-two": "Above +2σ · Extreme Premium"
    };
  const trendLabels = currentLanguage === "zh"
    ? { converging: "向模型收敛", diverging: "继续背离", flat: "偏离稳定" }
    : { converging: "Converging", diverging: "Diverging", flat: "Stable Deviation" };
  const sourceSuffix = payload.stale || cacheFallback ? " · CACHE" : "";

  setText("#stock-to-flow-price", formatUsd(price));
  setText("#stock-to-flow-zone", zoneLabels[snapshot.zone] || zoneLabels["model-range"]);
  setText("#stock-to-flow-ratio", ratio.toFixed(1));
  setText("#stock-to-flow-supply", `${(Number(snapshot.supply) / 1_000_000).toFixed(3)}M BTC · ${Number(snapshot.subsidy).toFixed(3)} BTC/BLOCK`);
  setText("#stock-to-flow-model", formatUsd(modelPrice));
  setText("#stock-to-flow-deviation", `${deviationPct >= 0 ? "+" : ""}${deviationPct.toFixed(1)}%`);
  setText("#stock-to-flow-trend", `${trendLabels[snapshot.trend] || trendLabels.flat} · ${sigmaDeviation.toFixed(2)}σ`);
  setText("#stock-to-flow-minus-two", formatUsd(minusTwo));
  setText("#stock-to-flow-minus-one", formatUsd(minusOne));
  setText("#stock-to-flow-spot-discount", `${spotDiscountPct >= 0 ? "+" : ""}${spotDiscountPct.toFixed(1)}%`);
  setText("#stock-to-flow-as-of", snapshot.asOf || "--");
  setText("#stock-to-flow-source", `${stockToFlowSources?.history || "Coin Metrics Community API"}${sourceSuffix} · PROTOCOL ISSUANCE · LIVE SPOT`);

  const forwardTargets = Array.isArray(snapshot.forwardTargets) ? snapshot.forwardTargets : [];
  [90, 180, 365].forEach((days) => {
    const target = forwardTargets.find((item) => Number(item.days) === days);
    setText(`#stock-to-flow-target-${days}`, target ? formatUsd(Number(target.modelPrice)) : "--");
    setText(`#stock-to-flow-range-${days}`, target ? `${formatUsd(Number(target.minusOne))} → ${formatUsd(Number(target.plusOne))}` : "--");
  });

  const halvingTargets = ["one", "two", "three", "four"];
  halvingTargets.forEach((name, index) => {
    const halving = stockToFlowHalvings[index];
    const deviation = Number(halving?.deviationPct);
    setText(`#stock-to-flow-halving-${name}`, halving && Number.isFinite(deviation) ? `${deviation >= 0 ? "+" : ""}${deviation.toFixed(1)}%` : "--");
    setText(`#stock-to-flow-halving-${name}-copy`, halving ? `ACTUAL ${formatUsd(Number(halving.actualPrice))} · MODEL ${formatUsd(Number(halving.modelPrice))}` : "--");
  });

  const title = document.querySelector("#stock-to-flow-signal-title");
  if (title) {
    title.textContent = zoneLabels[snapshot.zone] || zoneLabels["model-range"];
    ["below-minus-two", "below-minus-one", "model-range", "above-plus-one", "above-plus-two"].forEach((zone) => title.classList.toggle(`is-${zone}`, snapshot.zone === zone));
  }
  const signalCopy = currentLanguage === "zh"
    ? snapshot.zone === "below-minus-two"
      ? `BTC 实时价格 ${formatUsd(price)}，低于 -2σ 下轨 ${formatUsd(minusTwo)}。相对模型 ${formatUsd(modelPrice)} 的现货折价为 ${Math.abs(spotDiscountPct).toFixed(1)}%，对数残差 ${deviationPct.toFixed(1)}%，属于极端偏离，但不能单独视为价格必然回归信号。`
      : `BTC 实时价格 ${formatUsd(price)}，S2F 为 ${ratio.toFixed(1)}，模型价格 ${formatUsd(modelPrice)}，当前位于 ${zoneLabels[snapshot.zone] || zoneLabels["model-range"]}。现货相对模型偏离 ${spotDiscountPct >= 0 ? "+" : ""}${spotDiscountPct.toFixed(1)}%。`
    : snapshot.zone === "below-minus-two"
      ? `Live BTC at ${formatUsd(price)} is below the ${formatUsd(minusTwo)} minus-two-sigma band. Spot trades ${Math.abs(spotDiscountPct).toFixed(1)}% below the ${formatUsd(modelPrice)} model with a ${deviationPct.toFixed(1)}% log residual. This is extreme but does not guarantee convergence.`
      : `Live BTC is ${formatUsd(price)} with S2F at ${ratio.toFixed(1)} and model price at ${formatUsd(modelPrice)}. Spot deviation is ${spotDiscountPct >= 0 ? "+" : ""}${spotDiscountPct.toFixed(1)}%.`;
  setText("#stock-to-flow-signal-copy", signalCopy);

  const loading = document.querySelector("#stock-to-flow-loading");
  if (loading) loading.hidden = true;
  drawStockToFlowChart();
  return true;
};

const loadStockToFlowMetrics = async () => {
  const cached = readStockToFlowCache();
  try {
    const response = await fetch(`${API_BASE}/api/stock-to-flow`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Stock-to-Flow API ${response.status}`);
    const payload = await response.json();
    if (!applyStockToFlowPayload(payload, false)) throw new Error("Stock-to-Flow payload is empty");
    writeDashboardCache(STOCK_TO_FLOW_CACHE_KEY, payload, "Stock-to-Flow");
    if (payload.stale) publicDataWarnings.push("stock-to-flow-stale");
  } catch (error) {
    if (preserveRenderedChart(stockToFlowSeries, stockToFlowSnapshot, ["#stock-to-flow-loading"], "stock-to-flow-refresh")) return;
    if (!cached || !applyStockToFlowPayload(cached, true)) {
      const loading = document.querySelector("#stock-to-flow-loading");
      if (loading) {
        loading.hidden = false;
        loading.classList.add("is-error");
        loading.setAttribute("role", "button");
        loading.setAttribute("tabindex", "0");
        loading.textContent = currentLanguage === "zh" ? "S2F 数据同步失败，点击重试" : "S2F sync failed. Click to retry.";
      }
      throw error;
    }
    publicDataWarnings.push("stock-to-flow-cache");
  }
};

const readCycleTimingCache = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(CYCLE_TIMING_CACHE_KEY) || "null");
    if (!cached?.payload) return null;
    return cached.payload;
  } catch {
    return null;
  }
};

const refreshCycleTimingMode = (cacheFallback = false) => {
  const mode = getActiveCycleTimingMode();
  if (!mode || !cycleTimingSnapshot) return false;
  const projection = mode.projection;
  const isZh = currentLanguage === "zh";
  const statusLabels = isZh
    ? { passed: "窗口已过", approaching: "临近模型窗口", tracking: "周期跟踪中" }
    : { passed: "Window Passed", approaching: "Approaching Window", tracking: "Tracking Cycle" };
  const statusCopy = statusLabels[projection.status] || statusLabels.tracking;
  const sampleDays = mode.cycles.map((cycle) => Number(cycle.days)).filter(Number.isFinite);
  const sampleRange = sampleDays.length ? `${Math.min(...sampleDays)}–${Math.max(...sampleDays)}D · ${sampleDays.length} ${isZh ? "组样本" : "samples"}` : "--";
  const sourceSuffix = cacheFallback ? " · CACHE" : "";

  setText("#cycle-timing-title", isZh ? mode.titleZh : mode.titleEn);
  setText("#cycle-timing-price", formatUsd(Number(cycleTimingSnapshot.price)));
  setText("#cycle-timing-price-as-of", `${cycleTimingSources?.price || "Binance Spot"}${sourceSuffix}`);
  setText("#cycle-timing-model-days", `${projection.days}D`);
  setText("#cycle-timing-sample-range", sampleRange);
  setText("#cycle-timing-projected-date", projection.projectedDate);
  setText("#cycle-timing-anchor-date", `${isZh ? "起点" : "START"} ${projection.start}`);
  setText("#cycle-timing-window-status", statusCopy);
  setText("#cycle-timing-progress-copy", `${Number(projection.progressPct).toFixed(1)}% · ${projection.elapsedDays}D / ${projection.days}D`);
  setText("#cycle-timing-elapsed", `${projection.elapsedDays} ${isZh ? "天" : "days"}`);
  setText("#cycle-timing-remaining", projection.status === "passed"
    ? `${isZh ? "超期" : "Overdue"} ${projection.overdueDays}D`
    : `${isZh ? "剩余" : "Remaining"} ${projection.remainingDays}D`);
  setText("#cycle-timing-anchor", `${isZh ? mode.startLabelZh : mode.startLabelEn} · ${projection.start}`);
  setText("#cycle-timing-as-of", cycleTimingSeries.at(-1)?.date.toISOString().slice(0, 10) || "--");
  setText("#cycle-timing-start-legend", isZh ? mode.startLabelZh : mode.startLabelEn);
  setText("#cycle-timing-end-legend", isZh ? mode.endLabelZh : mode.endLabelEn);
  setText("#cycle-timing-source", `${cycleTimingSources?.history || "Coin Metrics Community API"}${sourceSuffix} · BLOCK HEIGHT · EVENT ANCHORS · LIVE SPOT`);

  const statusElement = document.querySelector("#cycle-timing-window-status");
  const signalTitle = document.querySelector("#cycle-timing-signal-title");
  [statusElement, signalTitle].forEach((element) => {
    if (!element) return;
    ["passed", "approaching", "tracking"].forEach((status) => element.classList.toggle(`is-${status}`, projection.status === status));
  });
  if (signalTitle) signalTitle.textContent = statusCopy;
  const progress = document.querySelector("#cycle-timing-progress");
  if (progress) progress.style.width = `${Math.min(100, Math.max(0, Number(projection.progressPct) || 0))}%`;

  const signalCopy = isZh
    ? projection.status === "passed"
      ? `从 ${projection.start} 起已经历 ${projection.elapsedDays} 天，超过 ${projection.days} 天模型窗口 ${projection.overdueDays} 天。窗口已经过去，但这不等于链上确认了实际顶部或底部。`
      : `从 ${projection.start} 起已经历 ${projection.elapsedDays} 天，距离 ${projection.projectedDate} 的 ${projection.days} 天模型窗口还有 ${projection.remainingDays} 天。`
    : projection.status === "passed"
      ? `${projection.elapsedDays} days have elapsed since ${projection.start}, ${projection.overdueDays} days beyond the ${projection.days}-day model window. A passed window does not confirm an actual top or bottom.`
      : `${projection.elapsedDays} days have elapsed since ${projection.start}; ${projection.remainingDays} days remain until the ${projection.days}-day model window on ${projection.projectedDate}.`;
  setText("#cycle-timing-signal-copy", signalCopy);

  const explainTitles = isZh ? {
    "halving-top": "两组减半后牛顶样本高度重合，但 2024 周期的理论窗口已经过去",
    "bottom-top": "熊底到牛顶约跨越三年，当前投影同样指向已过去的 2025 年窗口",
    "halving-bottom": "减半到下一熊底逐轮拉长，当前平均模型指向 2026 年下半年的观察窗",
    "top-top": "历史牛顶间隔约四年，峰值节律可作坐标但不能替代价格确认",
    "bottom-bottom": "历史熊底间隔稳定在 1431 至 1437 天，当前 1434 天模型指向 2026 年 10 月"
  } : {
    "halving-top": "Two post-halving top samples overlap closely, but the 2024 cycle's theoretical window has passed",
    "bottom-top": "Bottom-to-top recoveries span roughly three years and the current projection also points to a passed 2025 window",
    "halving-bottom": "Halving-to-next-bottom durations have lengthened, placing the current average window in late 2026",
    "top-top": "Historical bull tops are roughly four years apart, a useful coordinate that cannot replace price confirmation",
    "bottom-bottom": "Historical bear bottoms are 1,431–1,437 days apart, placing the current 1,434-day model in October 2026"
  };
  setText("#cycle-timing-explain-title", explainTitles[cycleTimingMode]);
  setText("#cycle-timing-explain-one", isZh
    ? `${isZh ? mode.startLabelZh : mode.startLabelEn}到${isZh ? mode.endLabelZh : mode.endLabelEn}的已完成样本为 ${sampleDays.join("、")} 天，当前采用 ${projection.days} 天作为研究投影。图中红线表示起点、蓝线表示历史终点，青色虚线表示当前模型窗口。`
    : `Completed ${mode.startLabelEn}-to-${mode.endLabelEn} samples span ${sampleDays.join(" and ")} days. The current research projection uses ${projection.days} days. Red marks starts, blue marks historical ends and cyan marks the current model window.`);
  setText("#cycle-timing-explain-two", isZh
    ? `模型状态为“${statusCopy}”。现价与实时进度只用于说明当前时间位置；ETF、法币流动性、市场体量和宏观政策都可能让周期提前、延后或失效。`
    : `The model state is “${statusCopy}”. Live price and progress locate the current point in time only; ETFs, fiat liquidity, market size and macro policy can advance, delay or invalidate the cycle.`);

  const history = document.querySelector("#cycle-timing-history");
  if (history) {
    const cards = mode.cycles.map((cycle) => {
      const startPrice = Number(cycle.startPrice?.price);
      const endPrice = Number(cycle.endPrice?.price);
      return `<div><span>${cycle.label} · ${cycle.start} → ${cycle.end}</span><strong>${cycle.days}D</strong><em>${Number.isFinite(startPrice) ? formatUsd(startPrice) : "--"} → ${Number.isFinite(endPrice) ? formatUsd(endPrice) : "--"}</em></div>`;
    });
    cards.push(`<div class="projection"><span>${isZh ? "当前推演" : "CURRENT PROJECTION"} · ${projection.start} → ${projection.projectedDate}</span><strong>${projection.days}D</strong><em>${statusCopy} · ${Number(projection.progressPct).toFixed(1)}%</em></div>`);
    history.innerHTML = cards.join("");
  }

  const future = document.querySelector("#cycle-timing-future");
  if (future) {
    const nodes = Array.isArray(cycleTimingFutureCycle?.nodes) ? cycleTimingFutureCycle.nodes : [];
    future.innerHTML = nodes.map((node) => {
      const label = isZh ? node.labelZh : node.labelEn;
      const basis = isZh ? node.basisZh : node.basisEn;
      const isWindow = node.windowStart && node.windowEnd && node.windowStart !== node.windowEnd;
      const timing = isWindow
        ? `${isZh ? "验证区间" : "VALIDATION WINDOW"} · ${node.windowStart} → ${node.windowEnd}`
        : `${isZh ? "协议估算节点" : "PROTOCOL ESTIMATE"} · ${node.date}`;
      return `<article class="cycle-future-card ${node.kind}"><span>${label}</span><strong>${node.date}</strong><em>${timing}</em><p>${basis}</p></article>`;
    }).join("");
  }

  document.querySelectorAll("[data-cycle-mode]").forEach((button) => {
    const active = button.dataset.cycleMode === cycleTimingMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  hideCycleTimingTooltip();
  drawCycleTimingChart();
  return true;
};

const applyCycleTimingPayload = (payload, cacheFallback = false) => {
  const rows = (payload?.series || []).map((point) => ({
    date: new Date(`${point.date}T00:00:00Z`),
    price: Number(point.price)
  })).filter((point) => !Number.isNaN(point.date.getTime()) && Number.isFinite(point.price) && point.price > 0);
  if (rows.length < 1000 || !payload?.snapshot || !payload?.modes?.["halving-top"] || !payload?.modes?.["bottom-bottom"] || !Array.isArray(payload?.futureCycle?.nodes) || payload.futureCycle.nodes.length < 3) return false;
  cycleTimingSeries = rows;
  cycleTimingSnapshot = payload.snapshot;
  cycleTimingModes = payload.modes;
  cycleTimingSources = payload.sources || null;
  cycleTimingFutureCycle = payload.futureCycle;
  if (!cycleTimingModes[cycleTimingMode]) cycleTimingMode = payload.snapshot.defaultMode || "halving-top";
  const loading = document.querySelector("#cycle-timing-loading");
  if (loading) {
    loading.hidden = true;
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
  }
  return refreshCycleTimingMode(cacheFallback);
};

const loadCycleTimingMetrics = async () => {
  const cached = readCycleTimingCache();
  try {
    const response = await fetch(`${API_BASE}/api/cycle-timing`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Cycle Timing API ${response.status}`);
    const payload = await response.json();
    if (!applyCycleTimingPayload(payload, false)) throw new Error("Cycle timing payload is empty");
    writeDashboardCache(CYCLE_TIMING_CACHE_KEY, payload, "Cycle Timing");
    if (payload.stale) publicDataWarnings.push("cycle-timing-stale");
  } catch (error) {
    if (preserveRenderedChart(cycleTimingSeries, cycleTimingSnapshot, ["#cycle-timing-loading"], "cycle-timing-refresh")) return;
    if (!cached || !applyCycleTimingPayload(cached, true)) {
      const loading = document.querySelector("#cycle-timing-loading");
      if (loading) {
        loading.hidden = false;
        loading.classList.add("is-error");
        loading.setAttribute("role", "button");
        loading.setAttribute("tabindex", "0");
        loading.textContent = currentLanguage === "zh" ? "周期数据同步失败，点击重试" : "Cycle timing sync failed. Click to retry.";
      }
      throw error;
    }
    publicDataWarnings.push("cycle-timing-cache");
  }
};

const readRhodlCache = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(RHODL_CACHE_KEY) || "null");
    if (!cached?.payload) return null;
    return cached.payload;
  } catch {
    return null;
  }
};

const applyRhodlPayload = (payload, cacheFallback = false) => {
  const rows = (payload?.series || []).map((point) => ({
    date: new Date(`${point.date}T00:00:00Z`),
    price: Number(point.price),
    rhodl: Number(point.rhodl),
    rhodl1m: Number(point.rhodl1m)
  })).filter((point) => !Number.isNaN(point.date.getTime()) && Number.isFinite(point.price) && point.price > 0 && Number.isFinite(point.rhodl) && point.rhodl > 0);
  const snapshot = payload?.snapshot;
  if (rows.length < 365 || !snapshot || !Number.isFinite(Number(snapshot.rhodl))) return false;

  rhodlSeries = rows;
  rhodlSnapshot = snapshot;
  rhodlSources = payload.sources || null;
  rhodlCyclePeaks = Array.isArray(payload.cyclePeaks) ? payload.cyclePeaks : [];

  const rhodl = Number(snapshot.rhodl);
  const average7 = Number(snapshot.average7);
  const average30 = Number(snapshot.average30);
  const sevenDayChange = Number(snapshot.sevenDayChange);
  const allTimePeak = Number(snapshot.allTimePeak);
  const zoneLabels = currentLanguage === "zh"
    ? { accumulation: "长期积累区", normal: "正常范围", elevated: "活跃投机区", overheated: "极端过热区" }
    : { accumulation: "Long-Term Accumulation", normal: "Normal Range", elevated: "Elevated Speculation", overheated: "Extreme Overheating" };
  const trendLabels = currentLanguage === "zh"
    ? { rising: "回升", falling: "回落", flat: "平稳" }
    : { rising: "Rising", falling: "Falling", flat: "Flat" };
  const sourceSuffix = payload.stale || cacheFallback ? " · CACHE" : "";
  const integer = (value) => Math.round(value).toLocaleString("en-US");

  setText("#rhodl-current", integer(rhodl));
  setText("#rhodl-zone", zoneLabels[snapshot.zone] || zoneLabels.normal);
  setText("#rhodl-averages", `${integer(average7)} / ${integer(average30)}`);
  setText("#rhodl-trend", `${trendLabels[snapshot.trend] || trendLabels.flat} · 7D ${sevenDayChange >= 0 ? "+" : ""}${integer(sevenDayChange)}`);
  setText("#rhodl-price", formatUsd(Number(snapshot.price)));
  setText("#rhodl-price-as-of", `${rhodlSources?.price || "Live spot"}${sourceSuffix}`);
  setText("#rhodl-peak", integer(allTimePeak));
  setText("#rhodl-as-of", `${snapshot.allTimePeakDate || "--"} · ATH`);
  setText("#rhodl-change", `${sevenDayChange >= 0 ? "+" : ""}${integer(sevenDayChange)} · ${trendLabels[snapshot.trend] || trendLabels.flat}`);
  setText("#rhodl-monthly", integer(Number(snapshot.rhodl1m || average30)));
  setText("#rhodl-analysis-price", formatUsd(Number(snapshot.price)));
  setText("#rhodl-date", snapshot.asOf || "--");
  setText("#rhodl-source", `${rhodlSources?.history || "BGeometrics public daily API"}${sourceSuffix} · RHODL DAILY`);

  [2013, 2017, 2021, 2025].forEach((year) => {
    const peak = rhodlCyclePeaks.find((item) => Number(item.year) === year);
    setText(`#rhodl-peak-${year}`, peak?.value ? integer(Number(peak.value)) : "--");
    setText(`#rhodl-peak-${year}-date`, peak?.date || "--");
  });

  const title = document.querySelector("#rhodl-signal-title");
  if (title) {
    title.textContent = zoneLabels[snapshot.zone] || zoneLabels.normal;
    ["accumulation", "normal", "elevated", "overheated"].forEach((zone) => title.classList.toggle(`is-${zone}`, snapshot.zone === zone));
  }
  const signalCopy = currentLanguage === "zh"
    ? snapshot.zone === "accumulation"
      ? `当前 RHODL 为 ${integer(rhodl)}，短期筹码活动偏低，长期持有者对结构的影响更强。7 日均值 ${integer(average7)}，30 日均值 ${integer(average30)}。`
      : snapshot.zone === "elevated" || snapshot.zone === "overheated"
        ? `当前 RHODL 为 ${integer(rhodl)}，短期投机活动明显升温。应结合现货需求、价格强度和链上获利兑现观察周期过热风险。`
        : `当前 RHODL 为 ${integer(rhodl)}，处于正常范围；7 日均值 ${integer(average7)}，30 日均值 ${integer(average30)}，短期趋势为${trendLabels[snapshot.trend] || trendLabels.flat}。`
    : snapshot.zone === "accumulation"
      ? `RHODL is ${integer(rhodl)}. Short-term coin activity is subdued and long-held capital has greater structural influence. The 7D average is ${integer(average7)} versus ${integer(average30)} over 30 days.`
      : snapshot.zone === "elevated" || snapshot.zone === "overheated"
        ? `RHODL is ${integer(rhodl)}, showing elevated short-term speculation. Confirm overheating risk with spot demand, price strength and realized profit-taking.`
        : `RHODL is ${integer(rhodl)}, inside the normal range. The 7D average is ${integer(average7)} versus ${integer(average30)} over 30 days, with a ${trendLabels[snapshot.trend] || trendLabels.flat} short-term trend.`;
  setText("#rhodl-signal-copy", signalCopy);

  const loading = document.querySelector("#rhodl-loading");
  if (loading) {
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
    loading.hidden = true;
  }
  drawRhodlChart();
  return true;
};

const loadRhodlMetrics = async () => {
  const cached = readRhodlCache();
  const loading = document.querySelector("#rhodl-loading");
  if (loading) {
    loading.hidden = rhodlSeries.length >= 2 && Boolean(rhodlSnapshot);
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
    loading.textContent = getCopy("rhodl.loading");
  }
  try {
    const response = await fetch(`${API_BASE}/api/rhodl-ratio?schema=1`, {
      cache: "no-store",
      headers: { Accept: "application/json", "Cache-Control": "no-cache" }
    });
    if (!response.ok) throw new Error(`RHODL API ${response.status}`);
    const payload = await response.json();
    if (!applyRhodlPayload(payload, false)) throw new Error("RHODL payload is empty");
    writeDashboardCache(RHODL_CACHE_KEY, payload, "RHODL Ratio");
    if (payload.stale) publicDataWarnings.push("rhodl-ratio-stale");
  } catch (error) {
    if (preserveRenderedChart(rhodlSeries, rhodlSnapshot, ["#rhodl-loading"], "rhodl-refresh")) return;
    if (cached && applyRhodlPayload(cached, true)) {
      publicDataWarnings.push("rhodl-ratio-cache");
      return;
    }
    clearDashboardCache(RHODL_CACHE_KEY, "RHODL Ratio");
    if (loading) {
      loading.hidden = false;
      loading.classList.add("is-error");
      loading.setAttribute("role", "button");
      loading.setAttribute("tabindex", "0");
      loading.textContent = currentLanguage === "zh"
        ? "RHODL 数据同步失败，点击重试"
        : "RHODL data sync failed. Click to retry.";
    }
    throw error;
  }
};

const readLthRplCache = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(LTH_RPL_CACHE_KEY) || "null");
    if (!cached?.payload) return null;
    return cached.payload;
  } catch {
    return null;
  }
};

const applyLthRplPayload = (payload, cacheFallback = false) => {
  const rows = (payload?.series || []).map((point) => ({
    date: new Date(`${point.date}T00:00:00Z`),
    price: Number(point.price),
    ratio: Number(point.ratio),
    rawRatio: Number(point.rawRatio),
    average7: Number(point.average7),
    average30: Number(point.average30),
    profitUsd: Number(point.profitUsd),
    lossUsd: Number(point.lossUsd)
  })).filter((point) => !Number.isNaN(point.date.getTime()) && Number.isFinite(point.price) && point.price > 0 && Number.isFinite(point.ratio) && point.ratio > 0);
  const snapshot = payload?.snapshot;
  if (rows.length < 365 || !snapshot || !Number.isFinite(Number(snapshot.current))) return false;

  lthRplSeries = rows;
  lthRplSnapshot = snapshot;
  lthRplSources = payload.sources || null;
  lthRplUnderwaterZones = Array.isArray(payload.underwaterZones) ? payload.underwaterZones : [];
  const current = Number(snapshot.current);
  const average7 = Number(snapshot.average7);
  const average30 = Number(snapshot.average30);
  const change = Number(snapshot.sevenDayChange);
  const distance = Number(snapshot.distanceToOne);
  const zoneLabels = currentLanguage === "zh"
    ? { underwater: "水下区域", pivot: "枢纽修复", profit: "利润主导", distribution: "高位派发" }
    : { underwater: "Underwater", pivot: "Pivot Recovery", profit: "Profit Dominance", distribution: "Elevated Distribution" };
  const trendLabels = currentLanguage === "zh"
    ? { rising: "回升", falling: "回落", flat: "平稳" }
    : { rising: "Rising", falling: "Falling", flat: "Flat" };
  const sourceSuffix = payload.stale || cacheFallback ? " · CACHE" : "";
  const ratio = (value) => Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 3 });

  setText("#lth-rpl-current", ratio(current));
  setText("#lth-rpl-zone", zoneLabels[snapshot.zone] || zoneLabels.pivot);
  setText("#lth-rpl-averages", `${ratio(average7)} / ${ratio(average30)}`);
  setText("#lth-rpl-trend", `${trendLabels[snapshot.trend] || trendLabels.flat} · 7D ${change >= 0 ? "+" : ""}${ratio(change)}`);
  setText("#lth-rpl-price", formatUsd(Number(snapshot.price)));
  setText("#lth-rpl-price-as-of", `${lthRplSources?.price || "Live spot"}${sourceSuffix}`);
  setText("#lth-rpl-distance", `${distance >= 0 ? "+" : ""}${ratio(distance)}`);
  setText("#lth-rpl-as-of", `${snapshot.onchainAsOf || "--"} · DAILY`);
  setText("#lth-rpl-change", `${change >= 0 ? "+" : ""}${ratio(change)} · ${trendLabels[snapshot.trend] || trendLabels.flat}`);
  setText("#lth-rpl-underwater-since", snapshot.latestUnderwaterStart || "--");
  setText("#lth-rpl-underwater-days", snapshot.underwaterDays ? `${snapshot.underwaterDays} ${currentLanguage === "zh" ? "天" : "days"}` : "--");
  setText("#lth-rpl-date", snapshot.onchainAsOf || "--");
  setText("#lth-rpl-source", `${lthRplSources?.history || "BGeometrics public UTXO-age proxy"}${sourceSuffix} · DAILY`);

  const title = document.querySelector("#lth-rpl-signal-title");
  if (title) {
    title.textContent = zoneLabels[snapshot.zone] || zoneLabels.pivot;
    ["underwater", "pivot", "profit", "distribution"].forEach((zone) => title.classList.toggle(`is-${zone}`, snapshot.zone === zone));
  }
  const signalCopy = currentLanguage === "zh"
    ? snapshot.zone === "underwater"
      ? `当前 7 日平滑比率为 ${ratio(current)}，低于 1.0，长期筹码的亏损兑现占主导。${snapshot.underwaterDays ? `本轮水下状态已持续 ${snapshot.underwaterDays} 天，` : ""}7 日均值 ${ratio(average7)}，30 日均值 ${ratio(average30)}。`
      : `当前 7 日平滑比率为 ${ratio(current)}，处于${zoneLabels[snapshot.zone] || zoneLabels.pivot}；7 日均值 ${ratio(average7)}，30 日均值 ${ratio(average30)}，距离 1.0 为 ${distance >= 0 ? "+" : ""}${ratio(distance)}。`
    : snapshot.zone === "underwater"
      ? `The 7-day smoothed ratio is ${ratio(current)}, below 1.0, so realized losses dominate long-held spending. ${snapshot.underwaterDays ? `This underwater phase has lasted ${snapshot.underwaterDays} days. ` : ""}The 7D average is ${ratio(average7)} versus ${ratio(average30)} over 30 days.`
      : `The 7-day smoothed ratio is ${ratio(current)}, in ${zoneLabels[snapshot.zone] || zoneLabels.pivot}. The 7D average is ${ratio(average7)} versus ${ratio(average30)} over 30 days, ${distance >= 0 ? "+" : ""}${ratio(distance)} from the 1.0 pivot.`;
  setText("#lth-rpl-signal-copy", signalCopy);

  const history = document.querySelector("#lth-rpl-history");
  if (history) {
    const important = lthRplUnderwaterZones.filter((zone) => Number(zone.days) >= 14).slice(-4);
    history.innerHTML = important.map((zone) => `<div><span>${zone.start.slice(0, 4)}</span><strong>${Number(zone.minRatio).toFixed(2)}</strong><em>${zone.days}d · ${zone.start} → ${zone.end}</em></div>`).join("");
  }

  const loading = document.querySelector("#lth-rpl-loading");
  if (loading) {
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
    loading.hidden = true;
  }
  drawLthRplChart();
  return true;
};

const loadLthRplMetrics = async () => {
  const cached = readLthRplCache();
  const loading = document.querySelector("#lth-rpl-loading");
  if (loading) {
    loading.hidden = lthRplSeries.length >= 2 && Boolean(lthRplSnapshot);
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
    loading.textContent = getCopy("lthRpl.loading");
  }
  try {
    const response = await fetch(`${API_BASE}/api/lth-realized-profit-loss?schema=1`, { cache: "no-store", headers: { Accept: "application/json", "Cache-Control": "no-cache" } });
    if (!response.ok) throw new Error(`LTH realized profit/loss API ${response.status}`);
    const payload = await response.json();
    if (!applyLthRplPayload(payload, false)) throw new Error("LTH realized profit/loss payload is empty");
    writeDashboardCache(LTH_RPL_CACHE_KEY, payload, "LTH Realized Profit/Loss Ratio");
    if (payload.stale) publicDataWarnings.push("lth-rpl-stale");
  } catch (error) {
    if (preserveRenderedChart(lthRplSeries, lthRplSnapshot, ["#lth-rpl-loading"], "lth-rpl-refresh")) return;
    if (cached && applyLthRplPayload(cached, true)) {
      publicDataWarnings.push("lth-rpl-cache");
      return;
    }
    clearDashboardCache(LTH_RPL_CACHE_KEY, "LTH Realized Profit/Loss Ratio");
    if (loading) {
      loading.hidden = false;
      loading.classList.add("is-error");
      loading.setAttribute("role", "button");
      loading.setAttribute("tabindex", "0");
      loading.textContent = currentLanguage === "zh" ? "LTH 已实现盈亏比同步失败，点击重试" : "LTH realized P/L sync failed. Click to retry.";
    }
    throw error;
  }
};

const readSlrvCache = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(SLRV_CACHE_KEY) || "null");
    if (!cached?.payload) return null;
    return cached.payload;
  } catch {
    return null;
  }
};

const applySlrvPayload = (payload, cacheFallback = false) => {
  const rows = (payload?.series || []).map((point) => ({
    date: new Date(`${point.date}T00:00:00Z`),
    price: Number(point.price),
    rawRatio: Number(point.rawRatio),
    slrv: Number(point.slrv),
    average30: Number(point.average30),
    source: point.source || "bgeometrics"
  })).filter((point) => !Number.isNaN(point.date.getTime()) && Number.isFinite(point.price) && point.price > 0 && Number.isFinite(point.slrv) && point.slrv > 0);
  const snapshot = payload?.snapshot;
  if (rows.length < 1000 || !snapshot || !Number.isFinite(Number(snapshot.current))) return false;

  slrvSeries = rows;
  slrvSnapshot = snapshot;
  slrvSources = payload.sources || null;
  slrvLowZones = Array.isArray(payload.lowZones) ? payload.lowZones : [];
  slrvCalibration = payload.calibration || null;
  const current = Number(snapshot.current);
  const average30 = Number(snapshot.average30);
  const change = Number(snapshot.sevenDayChange);
  const distance = Number(snapshot.distanceToBottom);
  const zoneLabels = currentLanguage === "zh"
    ? { bottom: "历史极低吸筹区", normal: "常态区间", elevated: "活跃升温区", overheated: "过热派发区" }
    : { bottom: "Historical Accumulation Low", normal: "Normal Range", elevated: "Elevated Activity", overheated: "Overheated Distribution" };
  const trendLabels = currentLanguage === "zh"
    ? { rising: "回升", falling: "回落", flat: "平稳" }
    : { rising: "Rising", falling: "Falling", flat: "Flat" };
  const sourceSuffix = payload.stale || cacheFallback ? " · CACHE" : "";
  const number = (value) => Number(value).toFixed(4);

  setText("#slrv-current", number(current));
  setText("#slrv-zone", zoneLabels[snapshot.zone] || zoneLabels.normal);
  setText("#slrv-averages", `${number(snapshot.average7)} / ${number(average30)}`);
  setText("#slrv-trend", `${trendLabels[snapshot.trend] || trendLabels.flat} · 7D ${change >= 0 ? "+" : ""}${number(change)}`);
  setText("#slrv-price", formatUsd(Number(snapshot.price)));
  setText("#slrv-price-as-of", `${slrvSources?.price || "Live spot"}${sourceSuffix}`);
  setText("#slrv-distance", `${distance >= 0 ? "+" : ""}${number(distance)}`);
  setText("#slrv-as-of", `${snapshot.onchainAsOf || "--"} · DAILY`);
  setText("#slrv-change", `${change >= 0 ? "+" : ""}${number(change)} · ${trendLabels[snapshot.trend] || trendLabels.flat}`);
  setText("#slrv-raw", number(snapshot.rawCurrent));
  setText("#slrv-low-count", String(slrvLowZones.length));
  setText("#slrv-date", snapshot.onchainAsOf || "--");
  setText("#slrv-source", `${slrvSources?.history || "BGeometrics public realized HODL waves"}${sourceSuffix} · SLRV DAILY`);

  const signalTitle = document.querySelector("#slrv-signal-title");
  if (signalTitle) {
    signalTitle.textContent = zoneLabels[snapshot.zone] || zoneLabels.normal;
    ["bottom", "normal", "elevated", "overheated"].forEach((zone) => signalTitle.classList.toggle(`is-${zone}`, snapshot.zone === zone));
  }
  const copy = currentLanguage === "zh"
    ? snapshot.zone === "bottom"
      ? `当前 SLRV 7 日均值为 ${number(current)}，已进入 0.05 下方历史极低区。短期投机流动明显收缩，筹码结构更偏向沉淀；30 日均值为 ${number(average30)}。`
      : snapshot.zone === "elevated" || snapshot.zone === "overheated"
        ? `当前 SLRV 为 ${number(current)}，短期筹码相对 6 个月至 1 年资本明显活跃。应结合获利兑现、现货需求和价格强度观察派发风险。`
        : `当前 SLRV 为 ${number(current)}，处于常态区间；30 日均值为 ${number(average30)}，短期趋势为${trendLabels[snapshot.trend] || trendLabels.flat}。`
    : snapshot.zone === "bottom"
      ? `The 7D SLRV is ${number(current)}, inside the historical low zone below 0.05. Short-term velocity is compressed relative to six-to-twelve-month capital; the 30D average is ${number(average30)}.`
      : snapshot.zone === "elevated" || snapshot.zone === "overheated"
        ? `SLRV is ${number(current)}, showing elevated short-term activity relative to six-to-twelve-month capital. Confirm distribution risk with realized profits, spot demand and price strength.`
        : `SLRV is ${number(current)}, inside the normal range. The 30D average is ${number(average30)} with a ${trendLabels[snapshot.trend] || trendLabels.flat} short-term trend.`;
  setText("#slrv-signal-copy", copy);

  const history = document.querySelector("#slrv-history");
  if (history) {
    history.innerHTML = slrvLowZones.slice(-4).map((zone) => `<div><span>${zone.start} → ${zone.end}</span><strong>${Number(zone.min).toFixed(4)}</strong><em>${zone.days}${currentLanguage === "zh" ? " 天" : " days"}${zone.active ? ` · ${currentLanguage === "zh" ? "进行中" : "active"}` : ""}</em></div>`).join("");
  }
  const loading = document.querySelector("#slrv-loading");
  if (loading) {
    loading.hidden = true;
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
  }
  hideSlrvTooltip();
  drawSlrvChart();
  return true;
};

const loadSlrvMetrics = async () => {
  const cached = readSlrvCache();
  const loading = document.querySelector("#slrv-loading");
  if (loading) {
    loading.hidden = slrvSeries.length >= 2 && Boolean(slrvSnapshot);
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
    loading.textContent = getCopy("slrv.loading");
  }
  try {
    const response = await fetch(`${API_BASE}/api/slrv-ratio?schema=1`, { cache: "no-store", headers: { Accept: "application/json", "Cache-Control": "no-cache" } });
    if (!response.ok) throw new Error(`SLRV API ${response.status}`);
    const payload = await response.json();
    if (!applySlrvPayload(payload, false)) throw new Error("SLRV payload is empty");
    writeDashboardCache(SLRV_CACHE_KEY, payload, "SLRV Ratio");
    if (payload.stale) publicDataWarnings.push("slrv-ratio-stale");
  } catch (error) {
    if (preserveRenderedChart(slrvSeries, slrvSnapshot, ["#slrv-loading"], "slrv-refresh")) return;
    if (cached && applySlrvPayload(cached, true)) {
      publicDataWarnings.push("slrv-ratio-cache");
      return;
    }
    clearDashboardCache(SLRV_CACHE_KEY, "SLRV Ratio");
    if (loading) {
      loading.hidden = false;
      loading.classList.add("is-error");
      loading.setAttribute("role", "button");
      loading.setAttribute("tabindex", "0");
      loading.textContent = currentLanguage === "zh" ? "SLRV 数据同步失败，点击重试" : "SLRV sync failed. Click to retry.";
    }
    throw error;
  }
};

const readRealizedCapHodlCache = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(REALIZED_CAP_HODL_CACHE_KEY) || "null");
    if (!cached?.payload) return null;
    return cached.payload;
  } catch {
    return null;
  }
};

const applyRealizedCapHodlPayload = (payload, cacheFallback = false) => {
  const rows = (payload?.series || []).map((point) => ({
    date: new Date(`${point.date}T00:00:00Z`),
    price: Number(point.price),
    threeToSix: Number(point.threeToSix),
    sixToTwelve: Number(point.sixToTwelve),
    oneToTwo: Number(point.oneToTwo),
    twoToThree: Number(point.twoToThree),
    threeToFour: Number(point.threeToFour),
    fourPlus: Number(point.fourPlus),
    overThreeMonths: Number(point.overThreeMonths),
    average7: Number(point.average7),
    average30: Number(point.average30),
    source: point.source || "bgeometrics"
  })).filter((point) => !Number.isNaN(point.date.getTime())
    && Number.isFinite(point.price) && point.price > 0
    && Number.isFinite(point.overThreeMonths) && point.overThreeMonths > 0);
  const snapshot = payload?.snapshot;
  if (rows.length < 1000 || !snapshot || !Number.isFinite(Number(snapshot.current))) return false;

  realizedCapHodlSeries = rows;
  realizedCapHodlSnapshot = snapshot;
  realizedCapHodlSources = payload.sources || null;
  realizedCapHodlPeaks = Array.isArray(payload.peaks) ? payload.peaks : [];
  realizedCapHodlBands = Array.isArray(payload.bands) ? payload.bands : [];
  realizedCapHodlExtension = payload.extension || null;
  const current = Number(snapshot.current);
  const change = Number(snapshot.sevenDayChange);
  const distance = Number(snapshot.distanceToDeepLock);
  const percent = (value, signed = false) => `${signed && Number(value) >= 0 ? "+" : ""}${(Number(value) * 100).toFixed(2)}%`;
  const zoneLabels = currentLanguage === "zh"
    ? { "deep-lock": "深度锁定 · 历史高位", accumulation: "长期吸筹", balanced: "均衡结构", active: "活跃换手" }
    : { "deep-lock": "Deep Supply Lock", accumulation: "Long-Term Accumulation", balanced: "Balanced Structure", active: "Active Rotation" };
  const trendLabels = currentLanguage === "zh"
    ? { rising: "上升 · 锁定增强", falling: "回落 · 老币活跃", flat: "平稳" }
    : { rising: "Rising · lock strengthening", falling: "Falling · old capital active", flat: "Flat" };
  const sourceSuffix = payload.stale || cacheFallback ? " · CACHE" : "";
  const cyclePeak = realizedCapHodlPeaks.at(-1);

  setText("#realized-cap-hodl-current", percent(current));
  setText("#realized-cap-hodl-zone", zoneLabels[snapshot.zone] || zoneLabels.balanced);
  setText("#realized-cap-hodl-averages", `${percent(snapshot.average7)} / ${percent(snapshot.average30)}`);
  setText("#realized-cap-hodl-trend", trendLabels[snapshot.trend] || trendLabels.flat);
  setText("#realized-cap-hodl-price", formatUsd(Number(snapshot.price)));
  setText("#realized-cap-hodl-price-as-of", `${realizedCapHodlSources?.price || "Live spot"}${sourceSuffix}`);
  setText("#realized-cap-hodl-peak", percent(snapshot.allTimePeak));
  setText("#realized-cap-hodl-peak-date", snapshot.allTimePeakDate || "--");
  setText("#realized-cap-hodl-change", `${percent(change, true)} · ${trendLabels[snapshot.trend] || trendLabels.flat}`);
  setText("#realized-cap-hodl-distance", percent(distance, true));
  setText("#realized-cap-hodl-cycle-peak", cyclePeak ? `${percent(cyclePeak.value)} · ${cyclePeak.date}` : "--");
  setText("#realized-cap-hodl-date", snapshot.onchainAsOf || "--");
  const historySource = realizedCapHodlSources?.history || "BGeometrics public realized-cap HODL waves";
  const latestSource = realizedCapHodlSources?.exactExtension;
  setText(
    "#realized-cap-hodl-source",
    `${historySource}${latestSource ? ` + ${latestSource}` : ""}${sourceSuffix} · DAILY`
  );

  const signalTitle = document.querySelector("#realized-cap-hodl-signal-title");
  if (signalTitle) {
    signalTitle.textContent = zoneLabels[snapshot.zone] || zoneLabels.balanced;
    ["deep-lock", "accumulation", "balanced", "active"].forEach((zone) => signalTitle.classList.toggle(`is-${zone}`, snapshot.zone === zone));
  }
  const signalCopy = currentLanguage === "zh"
    ? `当前 3 个月以上成本加权筹码占比为 ${percent(current)}，7 日均值 ${percent(snapshot.average7)}，30 日均值 ${percent(snapshot.average30)}。距离 84% 深度锁定参考线${distance >= 0 ? "高出" : "仍差"} ${percent(Math.abs(distance))}，短期趋势为${trendLabels[snapshot.trend] || trendLabels.flat}。`
    : `Cost-weighted capital older than three months is ${percent(current)}, with a 7D average of ${percent(snapshot.average7)} and 30D average of ${percent(snapshot.average30)}. It is ${percent(Math.abs(distance))} ${distance >= 0 ? "above" : "below"} the 84% deep-lock reference.`;
  setText("#realized-cap-hodl-signal-copy", signalCopy);

  const history = document.querySelector("#realized-cap-hodl-history");
  if (history) {
    history.innerHTML = realizedCapHodlPeaks.map((peak) => `<div><span>${peak.date}</span><strong>${percent(peak.value)}</strong><em>BTC ${formatUsd(Number(peak.price))}</em></div>`).join("");
  }
  const loading = document.querySelector("#realized-cap-hodl-loading");
  if (loading) {
    loading.hidden = true;
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
  }
  hideRealizedCapHodlTooltip();
  drawRealizedCapHodlChart();
  return true;
};

const loadRealizedCapHodlMetrics = async () => {
  const cached = readRealizedCapHodlCache();
  const loading = document.querySelector("#realized-cap-hodl-loading");
  if (loading) {
    loading.hidden = realizedCapHodlSeries.length >= 2 && Boolean(realizedCapHodlSnapshot);
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
    loading.textContent = getCopy("realizedCapHodl.loading");
  }
  try {
    const response = await fetch(`${API_BASE}/api/realized-cap-hodl-waves?schema=1`, { cache: "no-store", headers: { Accept: "application/json", "Cache-Control": "no-cache" } });
    if (!response.ok) throw new Error(`Realized Cap HODL Waves API ${response.status}`);
    const payload = await response.json();
    if (!applyRealizedCapHodlPayload(payload, false)) throw new Error("Realized Cap HODL Waves payload is empty");
    writeDashboardCache(REALIZED_CAP_HODL_CACHE_KEY, payload, "Realized Cap HODL Waves");
    if (payload.stale) publicDataWarnings.push("realized-cap-hodl-waves-stale");
  } catch (error) {
    if (preserveRenderedChart(realizedCapHodlSeries, realizedCapHodlSnapshot, ["#realized-cap-hodl-loading"], "realized-cap-hodl-refresh")) return;
    if (cached && applyRealizedCapHodlPayload(cached, true)) {
      publicDataWarnings.push("realized-cap-hodl-waves-cache");
      return;
    }
    clearDashboardCache(REALIZED_CAP_HODL_CACHE_KEY, "Realized Cap HODL Waves");
    if (loading) {
      loading.hidden = false;
      loading.classList.add("is-error");
      loading.setAttribute("role", "button");
      loading.setAttribute("tabindex", "0");
      loading.textContent = currentLanguage === "zh" ? "HODL 波浪数据同步失败，点击重试" : "Realized Cap HODL Waves sync failed. Click to retry.";
    }
    throw error;
  }
};

const readLthSpentCache = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(LTH_SPENT_CACHE_KEY) || "null");
    if (!cached?.payload) return null;
    return cached.payload;
  } catch {
    return null;
  }
};

const applyLthSpentPayload = (payload, cacheFallback = false) => {
  const nullableNumber = (value) => value === null || value === undefined || value === "" ? null : Number(value);
  const rows = (payload?.series || []).map((point) => ({
    date: new Date(`${point.date}T00:00:00Z`),
    price: Number(point.price),
    lthSopr: nullableNumber(point.lthSopr),
    spentPrice: nullableNumber(point.spentPrice),
    spentAverage7: nullableNumber(point.spentAverage7),
    underwater: point.underwater === null || point.underwater === undefined ? null : Boolean(point.underwater),
    source: point.source || "BGeometrics public BTC price"
  })).filter((point) => !Number.isNaN(point.date.getTime()) && Number.isFinite(point.price) && point.price > 0);
  const snapshot = payload?.snapshot;
  const exactRows = rows.filter((point) => Number.isFinite(point.spentAverage7) && point.spentAverage7 > 0);
  if (
    rows.length < 1000
    || exactRows.length < 365
    || !snapshot
    || !Number.isFinite(Number(snapshot.current))
    || !Number.isFinite(Number(snapshot.price))
    || !Number.isFinite(Number(snapshot.priceToSpentRatio))
    || !Number.isFinite(Number(snapshot.spread))
  ) return false;

  lthSpentSeries = rows;
  lthSpentSnapshot = snapshot;
  lthSpentSources = payload.sources || null;
  lthSpentResearchWindows = Array.isArray(payload.researchWindows) ? payload.researchWindows : [];
  lthSpentUnderwaterZones = Array.isArray(payload.underwaterZones) ? payload.underwaterZones : [];
  lthSpentExactStart = payload.exactHistoryStarts || exactRows[0]?.date?.toISOString().slice(0, 10) || null;
  const current = Number(snapshot.current);
  const price = Number(snapshot.price);
  const ratio = Number(snapshot.priceToSpentRatio);
  const spread = Number(snapshot.spread);
  const change = Number(snapshot.sevenDayChange);
  const zoneLabels = currentLanguage === "zh"
    ? { "above-cost": "成本线上方", "reclaim-test": "回收测试", underwater: "水下投降", "deep-underwater": "深度水下", waiting: "等待数据" }
    : { "above-cost": "Above Cost", "reclaim-test": "Reclaim Test", underwater: "Under-water Capitulation", "deep-underwater": "Deep Under-water", waiting: "Waiting" };
  const sourceSuffix = payload.stale || cacheFallback ? " · CACHE" : "";
  const signedUsd = (value) => `${Number(value) >= 0 ? "+" : ""}${formatUsd(Number(value))}`;

  setText("#lth-spent-current", formatUsd(current));
  setText("#lth-spent-as-of", `${snapshot.onchainAsOf || "--"} · DAILY`);
  setText("#lth-spent-price", formatUsd(price));
  setText("#lth-spent-price-as-of", `${lthSpentSources?.livePrice || "Live spot"}${sourceSuffix}`);
  setText("#lth-spent-ratio", Number.isFinite(ratio) ? ratio.toFixed(4) : "--");
  setText("#lth-spent-spread", Number.isFinite(spread) ? signedUsd(spread) : "--");
  setText("#lth-spent-days", `${Number(snapshot.underwaterDays || 0)} ${currentLanguage === "zh" ? "天" : "days"}`);
  setText("#lth-spent-zone", zoneLabels[snapshot.zone] || zoneLabels.waiting);
  setText("#lth-spent-change", Number.isFinite(change) ? `${signedUsd(change)} / 7D` : "--");
  setText("#lth-spent-sopr", Number.isFinite(Number(snapshot.lthSopr)) ? Number(snapshot.lthSopr).toFixed(4) : "--");
  setText("#lth-spent-start", snapshot.activeUnderwaterStart || "--");
  setText("#lth-spent-public-start", lthSpentExactStart || "--");
  setText("#lth-spent-source", `${lthSpentSources?.lthSopr || "BGeometrics public LTH-SOPR"}${sourceSuffix} · DAILY`);

  const title = document.querySelector("#lth-spent-signal-title");
  if (title) {
    title.textContent = zoneLabels[snapshot.zone] || zoneLabels.waiting;
    ["above-cost", "reclaim-test", "underwater", "deep-underwater"].forEach((zone) => title.classList.toggle(`is-${zone}`, snapshot.zone === zone));
  }
  const signalCopy = currentLanguage === "zh"
    ? `当前 BTC 为 ${formatUsd(price)}，LTH 花费价格为 ${formatUsd(current)}，现价${spread >= 0 ? "高于" : "低于"}花费成本 ${formatUsd(Math.abs(spread))}，比率 ${ratio.toFixed(4)}。${snapshot.underwaterDays ? `最近水下阶段已延续 ${snapshot.underwaterDays} 天。` : "价格当前位于花费成本线上方。"}`
    : `BTC is ${formatUsd(price)} versus an LTH Spent Price of ${formatUsd(current)}, leaving price ${formatUsd(Math.abs(spread))} ${spread >= 0 ? "above" : "below"} spent cost at a ${ratio.toFixed(4)} ratio. ${snapshot.underwaterDays ? `The latest under-water phase has lasted ${snapshot.underwaterDays} days.` : "Price is currently above spent cost."}`;
  setText("#lth-spent-signal-copy", signalCopy);

  const history = document.querySelector("#lth-spent-history");
  if (history) {
    history.innerHTML = lthSpentResearchWindows.map((windowItem) => `<div><span>${windowItem.cycle}</span><strong>${windowItem.days} ${currentLanguage === "zh" ? "天" : "days"}</strong><em>${windowItem.start} → ${windowItem.end}${windowItem.bottomPrice ? ` · BTC ${formatUsd(Number(windowItem.bottomPrice))}` : ""}</em></div>`).join("");
  }

  const loading = document.querySelector("#lth-spent-loading");
  if (loading) {
    loading.hidden = true;
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
  }
  hideLthSpentTooltip();
  drawLthSpentChart();
  return true;
};

const loadLthSpentMetrics = async () => {
  const cached = readLthSpentCache();
  const loading = document.querySelector("#lth-spent-loading");
  if (loading) {
    loading.hidden = lthSpentSeries.length >= 2 && Boolean(lthSpentSnapshot);
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
    loading.textContent = getCopy("lthSpent.loading");
  }
  try {
    const response = await fetch(`${API_BASE}/api/lth-spent-price?schema=1`, { cache: "no-store", headers: { Accept: "application/json", "Cache-Control": "no-cache" } });
    if (!response.ok) throw new Error(`LTH Spent Price API ${response.status}`);
    const payload = await response.json();
    if (!applyLthSpentPayload(payload, false)) throw new Error("LTH Spent Price payload is empty");
    writeDashboardCache(LTH_SPENT_CACHE_KEY, payload, "LTH Spent Price");
    if (payload.stale) publicDataWarnings.push("lth-spent-price-stale");
  } catch (error) {
    if (preserveRenderedChart(lthSpentSeries, lthSpentSnapshot, ["#lth-spent-loading"], "lth-spent-refresh")) return;
    if (cached && applyLthSpentPayload(cached, true)) {
      publicDataWarnings.push("lth-spent-price-cache");
      return;
    }
    clearDashboardCache(LTH_SPENT_CACHE_KEY, "LTH Spent Price");
    if (loading) {
      loading.hidden = false;
      loading.classList.add("is-error");
      loading.setAttribute("role", "button");
      loading.setAttribute("tabindex", "0");
      loading.textContent = currentLanguage === "zh" ? "LTH 花费价格同步失败，点击重试" : "LTH Spent Price sync failed. Click to retry.";
    }
    throw error;
  }
};

const readPercentProfitCache = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(PERCENT_PROFIT_CACHE_KEY) || "null");
    if (!cached?.payload) return null;
    return cached.payload;
  } catch {
    return null;
  }
};

const applyPercentProfitPayload = (payload, cacheFallback = false) => {
  const rows = (payload?.series || []).map((point) => ({
    date: new Date(`${point.date}T00:00:00Z`),
    price: Number(point.price),
    percent: Number(point.percent),
    profitSupply: Number(point.profitSupply),
    lossSupply: Number(point.lossSupply),
    totalSupply: Number(point.totalSupply)
  })).filter((point) => !Number.isNaN(point.date.getTime())
    && Number.isFinite(point.price) && point.price > 0
    && Number.isFinite(point.percent) && point.percent >= 0 && point.percent <= 100
    && Number.isFinite(point.profitSupply) && Number.isFinite(point.lossSupply));
  const snapshot = payload?.snapshot;
  if (
    rows.length < 365
    || !snapshot
    || !Number.isFinite(Number(snapshot.percent))
    || !Number.isFinite(Number(snapshot.price))
    || !Number.isFinite(Number(snapshot.average7))
    || !Number.isFinite(Number(snapshot.average30))
  ) return false;

  percentProfitSeries = rows;
  percentProfitSnapshot = snapshot;
  percentProfitSources = payload.sources || null;
  percentProfitHistoricalLows = Array.isArray(payload.historicalLows) ? payload.historicalLows : [];
  percentProfitResearchWindows = Array.isArray(payload.researchWindows) ? payload.researchWindows : [];
  const current = Number(snapshot.percent);
  const price = Number(snapshot.price);
  const average7 = Number(snapshot.average7);
  const average30 = Number(snapshot.average30);
  const change = Number(snapshot.sevenDayChange);
  const distance = Number(snapshot.distanceToBottom);
  const sourceSuffix = payload.stale || cacheFallback ? " · CACHE" : "";
  const zoneLabels = currentLanguage === "zh"
    ? { flush: "底部出清区", recovery: "修复区", balanced: "常态盈利区", overheated: "顶部过热区" }
    : { flush: "Deep Flush Zone", recovery: "Recovery Zone", balanced: "Normal Profit Zone", overheated: "Top Overheat Zone" };
  const trendLabels = currentLanguage === "zh"
    ? { rising: "回升", falling: "回落", flat: "平稳" }
    : { rising: "Rising", falling: "Falling", flat: "Flat" };
  const formatSupply = (value) => Number.isFinite(Number(value)) ? `${(Number(value) / 1_000_000).toFixed(2)}M BTC` : "--";
  const signedPercent = (value, decimals = 2) => Number.isFinite(Number(value)) ? `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(decimals)}%` : "--";

  setText("#percent-profit-current", `${current.toFixed(2)}%`);
  setText("#percent-profit-as-of", `${snapshot.asOf || "--"} · DAILY`);
  setText("#percent-profit-price", formatUsd(price));
  setText("#percent-profit-price-as-of", `${percentProfitSources?.price || "Live spot"}${sourceSuffix}`);
  setText("#percent-profit-averages", `${average7.toFixed(2)}% / ${average30.toFixed(2)}%`);
  setText("#percent-profit-trend", `${trendLabels[snapshot.trend] || "--"} · 7D ${signedPercent(change)}`);
  setText("#percent-profit-distance", signedPercent(distance));
  setText("#percent-profit-zone", zoneLabels[snapshot.zone] || "--");
  setText("#percent-profit-change", signedPercent(change));
  setText("#percent-profit-supply", formatSupply(snapshot.profitSupply));
  setText("#percent-loss-supply", formatSupply(snapshot.lossSupply));
  setText("#percent-profit-date", snapshot.asOf || "--");
  setText("#percent-profit-source", `${percentProfitSources?.history || "BGeometrics public daily API"}${sourceSuffix} · DAILY`);

  const title = document.querySelector("#percent-profit-signal-title");
  if (title) {
    title.textContent = zoneLabels[snapshot.zone] || "--";
    ["flush", "recovery", "balanced", "overheated"].forEach((zone) => title.classList.toggle(`is-${zone}`, snapshot.zone === zone));
  }
  const signalCopy = currentLanguage === "zh"
    ? `当前 ${current.toFixed(2)}% 的流通供应处于盈利状态，7 日均值 ${average7.toFixed(2)}%，30 日均值 ${average30.toFixed(2)}%。现值较 50% 出清线${distance >= 0 ? "高" : "低"} ${Math.abs(distance).toFixed(2)} 个百分点。`
    : `${current.toFixed(2)}% of circulating supply is currently in profit, versus a 7-day average of ${average7.toFixed(2)}% and a 30-day average of ${average30.toFixed(2)}%. The reading is ${Math.abs(distance).toFixed(2)} percentage points ${distance >= 0 ? "above" : "below"} the 50% flush line.`;
  setText("#percent-profit-signal-copy", signalCopy);

  const history = document.querySelector("#percent-profit-history");
  if (history) {
    history.innerHTML = percentProfitHistoricalLows.map((low) => {
      const reference = Number.isFinite(Number(low.referencePercent))
        ? `${currentLanguage === "zh" ? "研究参考" : "Study reference"} ${Number(low.referencePercent).toFixed(0)}%`
        : "";
      return `<div><span>${low.label}</span><strong>${Number(low.percent).toFixed(1)}%</strong><em>${low.date} · BTC ${formatUsd(Number(low.price))}${reference ? ` · ${reference}` : ""}</em></div>`;
    }).join("");
  }

  const loading = document.querySelector("#percent-profit-loading");
  if (loading) {
    loading.hidden = true;
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
  }
  hidePercentProfitTooltip();
  drawPercentProfitChart();
  return true;
};

const loadPercentProfitMetrics = async () => {
  const cached = readPercentProfitCache();
  const loading = document.querySelector("#percent-profit-loading");
  if (loading) {
    loading.hidden = percentProfitSeries.length >= 2 && Boolean(percentProfitSnapshot);
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
    loading.textContent = getCopy("percentProfit.loading");
  }
  try {
    const response = await fetch(`${API_BASE}/api/percent-supply-profit?schema=1`, { cache: "no-store", headers: { Accept: "application/json", "Cache-Control": "no-cache" } });
    if (!response.ok) throw new Error(`Percent Supply in Profit API ${response.status}`);
    const payload = await response.json();
    if (!applyPercentProfitPayload(payload, false)) throw new Error("Percent Supply in Profit payload is empty");
    writeDashboardCache(PERCENT_PROFIT_CACHE_KEY, payload, "Percent Supply in Profit");
    if (payload.stale) publicDataWarnings.push("percent-supply-profit-stale");
  } catch (error) {
    if (preserveRenderedChart(percentProfitSeries, percentProfitSnapshot, ["#percent-profit-loading"], "percent-profit-refresh")) return;
    if (cached && applyPercentProfitPayload(cached, true)) {
      publicDataWarnings.push("percent-supply-profit-cache");
      return;
    }
    clearDashboardCache(PERCENT_PROFIT_CACHE_KEY, "Percent Supply in Profit");
    if (loading) {
      loading.hidden = false;
      loading.classList.add("is-error");
      loading.setAttribute("role", "button");
      loading.setAttribute("tabindex", "0");
      loading.textContent = currentLanguage === "zh" ? "盈利供应百分比同步失败，点击重试" : "Percent Supply in Profit sync failed. Click to retry.";
    }
    throw error;
  }
};

const readLthExchangeLossCache = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(LTH_EXCHANGE_LOSS_CACHE_KEY) || "null");
    if (!cached?.payload) return null;
    return cached.payload;
  } catch {
    return null;
  }
};

const applyLthExchangeLossPayload = (payload, cacheFallback = false) => {
  const rows = (payload?.series || []).map((point) => ({
    date: new Date(`${point.date}T00:00:00Z`),
    price: Number(point.price),
    percent: Number(point.percent),
    rawPercent: Number(point.rawPercent),
    lthLossUsd: Number(point.lthLossUsd),
    lthProfitUsd: Number(point.lthProfitUsd),
    sthLossUsd: Number(point.sthLossUsd),
    sthProfitUsd: Number(point.sthProfitUsd)
  })).filter((point) => !Number.isNaN(point.date.getTime())
    && Number.isFinite(point.price) && point.price > 0
    && Number.isFinite(point.percent) && point.percent >= 0 && point.percent <= 100
    && Number.isFinite(point.rawPercent));
  const snapshot = payload?.snapshot;
  if (
    rows.length < 365
    || !snapshot
    || !Number.isFinite(Number(snapshot.percent))
    || !Number.isFinite(Number(snapshot.price))
    || !Number.isFinite(Number(snapshot.average7))
    || !Number.isFinite(Number(snapshot.average30))
  ) return false;

  lthExchangeLossSeries = rows;
  lthExchangeLossSnapshot = snapshot;
  lthExchangeLossSources = payload.sources || null;
  lthExchangeLossHistoricalPeaks = Array.isArray(payload.historicalPeaks) ? payload.historicalPeaks : [];
  lthExchangeLossResearchWindows = Array.isArray(payload.researchWindows) ? payload.researchWindows : [];

  const current = Number(snapshot.percent);
  const price = Number(snapshot.price);
  const average7 = Number(snapshot.average7);
  const average30 = Number(snapshot.average30);
  const change = Number(snapshot.sevenDayChange);
  const rawPercent = Number(snapshot.rawPercent);
  const distance = Number(snapshot.distanceToCapitulation);
  const sourceSuffix = payload.stale || cacheFallback ? " · CACHE" : "";
  const zoneLabels = currentLanguage === "zh"
    ? { quiet: "安静区", normal: "常态区", stress: "压力区", capitulation: "投降区" }
    : { quiet: "Quiet Zone", normal: "Normal Zone", stress: "Stress Zone", capitulation: "Capitulation Zone" };
  const trendLabels = currentLanguage === "zh"
    ? { rising: "上升", falling: "回落", flat: "平稳" }
    : { rising: "Rising", falling: "Falling", flat: "Flat" };
  const signedPercent = (value, decimals = 2) => Number.isFinite(Number(value))
    ? `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(decimals)}%`
    : "--";

  setText("#lth-exchange-loss-current", `${current.toFixed(2)}%`);
  setText("#lth-exchange-loss-as-of", `${snapshot.asOf || "--"} · 30D SMA`);
  setText("#lth-exchange-loss-price", formatUsd(price));
  setText("#lth-exchange-loss-price-as-of", `${lthExchangeLossSources?.price || "Live spot"}${sourceSuffix}`);
  setText("#lth-exchange-loss-averages", `${average7.toFixed(2)}% / ${average30.toFixed(2)}%`);
  setText("#lth-exchange-loss-trend", `${trendLabels[snapshot.trend] || "--"} · 7D ${signedPercent(change)}`);
  setText("#lth-exchange-loss-peak", `${Number(snapshot.peak365).toFixed(2)}%`);
  setText("#lth-exchange-loss-distance", currentLanguage === "zh"
    ? `距 50% 投降线 ${signedPercent(distance)}`
    : `${signedPercent(distance)} vs 50% capitulation line`);
  setText("#lth-exchange-loss-change", signedPercent(change));
  setText("#lth-exchange-loss-raw", `${rawPercent.toFixed(2)}%`);
  setText("#lth-exchange-loss-usd", formatUsd(Number(snapshot.lthLossUsd)));
  setText("#lth-exchange-loss-date", snapshot.asOf || "--");
  setText("#lth-exchange-loss-source", `${lthExchangeLossSources?.history || "BGeometrics public daily API"}${sourceSuffix} · PUBLIC PROXY · NOT EXCHANGE-LABELLED`);

  const title = document.querySelector("#lth-exchange-loss-signal-title");
  if (title) {
    title.textContent = zoneLabels[snapshot.zone] || "--";
    ["quiet", "normal", "stress", "capitulation"].forEach((zone) => title.classList.toggle(`is-${zone}`, snapshot.zone === zone));
  }
  const signalCopy = currentLanguage === "zh"
    ? `公开代理 30 日均值为 ${current.toFixed(2)}%，7 日均值 ${average7.toFixed(2)}%，较 50% 投降线${distance >= 0 ? "高" : "低"} ${Math.abs(distance).toFixed(2)} 个百分点。该值反映全链 LTH 亏损占全部已实现盈亏的比例，不是交易所标签原始序列。`
    : `The public proxy is ${current.toFixed(2)}% on a 30-day basis, with a 7-day average of ${average7.toFixed(2)}%, or ${Math.abs(distance).toFixed(2)} percentage points ${distance >= 0 ? "above" : "below"} the 50% capitulation line. This is an all-chain LTH loss-share proxy, not an exchange-labelled source series.`;
  setText("#lth-exchange-loss-signal-copy", signalCopy);

  const researchByLabel = new Map(lthExchangeLossResearchWindows.map((window) => [window.label, window]));
  const history = document.querySelector("#lth-exchange-loss-history");
  if (history) {
    history.innerHTML = lthExchangeLossHistoricalPeaks.map((peak) => {
      const research = researchByLabel.get(peak.label);
      const reference = Number.isFinite(Number(research?.referencePercent ?? peak.referencePercent))
        ? `${currentLanguage === "zh" ? "交易所标签研究参考" : "Exchange-labelled study reference"} ${Number(research?.referencePercent ?? peak.referencePercent).toFixed(0)}%`
        : "";
      return `<div><span>${peak.label}</span><strong>${Number(peak.percent).toFixed(1)}%</strong><em>${peak.date} · BTC ${formatUsd(Number(peak.price))}${reference ? ` · ${reference}` : ""}</em></div>`;
    }).join("");
  }

  const loading = document.querySelector("#lth-exchange-loss-loading");
  if (loading) {
    loading.hidden = true;
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
  }
  hideLthExchangeLossTooltip();
  drawLthExchangeLossChart();
  return true;
};

const loadLthExchangeLossMetrics = async () => {
  const cached = readLthExchangeLossCache();
  const loading = document.querySelector("#lth-exchange-loss-loading");
  if (loading) {
    loading.hidden = lthExchangeLossSeries.length >= 2 && Boolean(lthExchangeLossSnapshot);
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
    loading.textContent = getCopy("lthExchangeLoss.loading");
  }
  try {
    const response = await fetch(`${API_BASE}/api/lth-exchange-loss?schema=1`, { cache: "no-store", headers: { Accept: "application/json", "Cache-Control": "no-cache" } });
    if (!response.ok) throw new Error(`LTH Exchange Loss API ${response.status}`);
    const payload = await response.json();
    if (!applyLthExchangeLossPayload(payload, false)) throw new Error("LTH exchange-loss proxy payload is empty");
    writeDashboardCache(LTH_EXCHANGE_LOSS_CACHE_KEY, payload, "LTH Exchange Loss Public Proxy");
    if (payload.stale) publicDataWarnings.push("lth-exchange-loss-stale");
  } catch (error) {
    if (preserveRenderedChart(lthExchangeLossSeries, lthExchangeLossSnapshot, ["#lth-exchange-loss-loading"], "lth-exchange-loss-refresh")) return;
    if (cached && applyLthExchangeLossPayload(cached, true)) {
      publicDataWarnings.push("lth-exchange-loss-cache");
      return;
    }
    clearDashboardCache(LTH_EXCHANGE_LOSS_CACHE_KEY, "LTH Exchange Loss Public Proxy");
    if (loading) {
      loading.hidden = false;
      loading.classList.add("is-error");
      loading.setAttribute("role", "button");
      loading.setAttribute("tabindex", "0");
      loading.textContent = currentLanguage === "zh" ? "长期持有者亏损代理同步失败，点击重试" : "LTH loss-share proxy sync failed. Click to retry.";
    }
    throw error;
  }
};

const readTwoWeekRsiCache = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(TWO_WEEK_RSI_CACHE_KEY) || "null");
    if (!cached?.payload) return null;
    return cached.payload;
  } catch {
    return null;
  }
};

const applyTwoWeekRsiPayload = (payload, cacheFallback = false) => {
  const rows = (payload?.series || []).map((point) => ({
    date: new Date(Number(point.timestamp) || `${point.date}T00:00:00Z`),
    observedAt: point.observedAt ? new Date(Number(point.observedAt)) : null,
    price: Number(point.price),
    rsi: Number(point.rsi),
    lower: Number(point.lower),
    upper: Number(point.upper)
  })).filter((point) => !Number.isNaN(point.date.getTime())
    && Number.isFinite(point.price) && point.price > 0
    && Number.isFinite(point.rsi) && point.rsi >= 0 && point.rsi <= 100
    && Number.isFinite(point.lower) && Number.isFinite(point.upper));
  const snapshot = payload?.snapshot;
  if (
    rows.length < 200
    || !snapshot
    || !Number.isFinite(Number(snapshot.rsi))
    || !Number.isFinite(Number(snapshot.price))
    || !Number.isFinite(Number(snapshot.lower))
    || !Number.isFinite(Number(snapshot.upper))
  ) return false;

  twoWeekRsiSeries = rows;
  twoWeekRsiSnapshot = snapshot;
  twoWeekRsiSources = payload.sources || null;
  twoWeekRsiHistoricalLows = Array.isArray(payload.historicalLows) ? payload.historicalLows : [];
  twoWeekRsiChannelAnchors = payload.channelAnchors || null;

  const rsi = Number(snapshot.rsi);
  const price = Number(snapshot.price);
  const lower = Number(snapshot.lower);
  const upper = Number(snapshot.upper);
  const change = Number(snapshot.change);
  const previous = Number(snapshot.previousRsi);
  const average6w = Number(snapshot.average6w);
  const average12w = Number(snapshot.average12w);
  const distance = Number(snapshot.distanceToLower);
  const sourceSuffix = payload.stale || cacheFallback ? " · CACHE" : "";
  const zoneLabels = currentLanguage === "zh"
    ? { "lower-touch": "下轨共振 · 周期底部观察", oversold: "宏观超卖", neutral: "中性动能", overheated: "高位过热" }
    : { "lower-touch": "Lower-Channel Confluence", oversold: "Macro Oversold", neutral: "Neutral Momentum", overheated: "Overheated" };
  const trendLabels = currentLanguage === "zh"
    ? { rising: "回升", falling: "回落", flat: "平稳" }
    : { rising: "Rising", falling: "Falling", flat: "Flat" };
  const signed = (value, decimals = 2) => Number.isFinite(Number(value))
    ? `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(decimals)}`
    : "--";

  setText("#two-week-rsi-current", rsi.toFixed(2));
  setText("#two-week-rsi-as-of", `${snapshot.asOf || "--"} · Wilder RSI(14)`);
  setText("#two-week-rsi-price", formatUsd(price));
  setText("#two-week-rsi-price-as-of", `${twoWeekRsiSources?.price || "Live spot"}${sourceSuffix}`);
  setText("#two-week-rsi-channel", `${lower.toFixed(2)} / ${upper.toFixed(2)}`);
  setText("#two-week-rsi-channel-copy", currentLanguage === "zh" ? "历史周期极值回归通道" : "Cycle-extreme regression channel");
  setText("#two-week-rsi-distance", signed(distance));
  setText("#two-week-rsi-trend", `${trendLabels[snapshot.trend] || "--"} · ${signed(change)}`);
  setText("#two-week-rsi-change", signed(change));
  setText("#two-week-rsi-previous", Number.isFinite(previous) ? previous.toFixed(2) : "--");
  setText("#two-week-rsi-average", `${average6w.toFixed(2)} / ${average12w.toFixed(2)}`);
  setText("#two-week-rsi-date", snapshot.asOf || "--");
  setText("#two-week-rsi-source", `${twoWeekRsiSources?.history || "BGeometrics public daily BTC price"}${sourceSuffix} · DERIVED 2W RSI`);

  const title = document.querySelector("#two-week-rsi-signal-title");
  if (title) {
    title.textContent = zoneLabels[snapshot.zone] || "--";
    ["lower-touch", "oversold", "neutral", "overheated"].forEach((zone) => title.classList.toggle(`is-${zone}`, snapshot.zone === zone));
  }
  const signalCopy = currentLanguage === "zh"
    ? `当前两周 RSI 为 ${rsi.toFixed(2)}，动态下轨为 ${lower.toFixed(2)}，相距 ${Math.abs(distance).toFixed(2)} 点；6 周与 12 周均值分别为 ${average6w.toFixed(2)} 和 ${average12w.toFixed(2)}。接近下轨说明宏观下行动能显著释放，真正的右侧确认仍需 RSI 企稳并持续回升。`
    : `The 2-week RSI is ${rsi.toFixed(2)}, versus a dynamic lower channel at ${lower.toFixed(2)}, a gap of ${Math.abs(distance).toFixed(2)} points. The 6-week and 12-week averages are ${average6w.toFixed(2)} and ${average12w.toFixed(2)}. A lower-channel test signals depleted macro downside momentum; a sustained RSI rebound remains the stronger right-side confirmation.`;
  setText("#two-week-rsi-signal-copy", signalCopy);

  const history = document.querySelector("#two-week-rsi-history");
  if (history) {
    history.innerHTML = twoWeekRsiHistoricalLows.map((low) => `<div><span>${low.label}</span><strong>${Number(low.rsi).toFixed(2)}</strong><em>${low.date} · ${currentLanguage === "zh" ? "下轨" : "lower"} ${Number(low.lower).toFixed(2)} · BTC ${formatUsd(Number(low.price))}</em></div>`).join("");
  }

  const loading = document.querySelector("#two-week-rsi-loading");
  if (loading) {
    loading.hidden = true;
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
  }
  hideTwoWeekRsiTooltip();
  drawTwoWeekRsiChart();
  return true;
};

const loadTwoWeekRsiMetrics = async () => {
  const cached = readTwoWeekRsiCache();
  const loading = document.querySelector("#two-week-rsi-loading");
  if (loading) {
    loading.hidden = twoWeekRsiSeries.length >= 2 && Boolean(twoWeekRsiSnapshot);
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
    loading.textContent = getCopy("twoWeekRsi.loading");
  }
  try {
    const response = await fetch(`${API_BASE}/api/two-week-rsi?schema=1`, { cache: "no-store", headers: { Accept: "application/json", "Cache-Control": "no-cache" } });
    if (!response.ok) throw new Error(`Two-Week RSI API ${response.status}`);
    const payload = await response.json();
    if (!applyTwoWeekRsiPayload(payload, false)) throw new Error("Two-week RSI payload is empty");
    writeDashboardCache(TWO_WEEK_RSI_CACHE_KEY, payload, "Two-Week RSI");
    if (payload.stale) publicDataWarnings.push("two-week-rsi-stale");
  } catch (error) {
    if (preserveRenderedChart(twoWeekRsiSeries, twoWeekRsiSnapshot, ["#two-week-rsi-loading"], "two-week-rsi-refresh")) return;
    if (cached && applyTwoWeekRsiPayload(cached, true)) {
      publicDataWarnings.push("two-week-rsi-cache");
      return;
    }
    clearDashboardCache(TWO_WEEK_RSI_CACHE_KEY, "Two-Week RSI");
    if (loading) {
      loading.hidden = false;
      loading.classList.add("is-error");
      loading.setAttribute("role", "button");
      loading.setAttribute("tabindex", "0");
      loading.textContent = currentLanguage === "zh" ? "两周 RSI 同步失败，点击重试" : "Two-week RSI sync failed. Click to retry.";
    }
    throw error;
  }
};

const readUnder3mHodlCache = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(UNDER_3M_HODL_CACHE_KEY) || "null");
    if (!cached?.payload) return null;
    return cached.payload;
  } catch {
    return null;
  }
};

const applyUnder3mHodlPayload = (payload, cacheFallback = false) => {
  const rows = (payload?.series || []).map((point) => ({
    date: new Date(`${point.date}T00:00:00Z`),
    price: Number(point.price),
    underThreeMonths: Number(point.underThreeMonths),
    average7: Number(point.average7),
    average30: Number(point.average30),
    source: point.source || "public"
  })).filter((point) => !Number.isNaN(point.date.getTime())
    && Number.isFinite(point.price) && point.price > 0
    && Number.isFinite(point.underThreeMonths) && point.underThreeMonths >= 0 && point.underThreeMonths <= 1
    && Number.isFinite(point.average7) && Number.isFinite(point.average30));
  const snapshot = payload?.snapshot;
  if (
    rows.length < 1000
    || !snapshot
    || !Number.isFinite(Number(snapshot.current))
    || !Number.isFinite(Number(snapshot.price))
    || !Number.isFinite(Number(snapshot.average7))
    || !Number.isFinite(Number(snapshot.average30))
  ) return false;

  under3mHodlSeries = rows;
  under3mHodlSnapshot = snapshot;
  under3mHodlSources = payload.sources || null;
  under3mHodlLows = Array.isArray(payload.lows) ? payload.lows : [];

  const current = Number(snapshot.current);
  const average7 = Number(snapshot.average7);
  const average30 = Number(snapshot.average30);
  const sevenDayChange = Number(snapshot.sevenDayChange);
  const distance = Number(snapshot.distanceToBottom);
  const recentLow = Number(snapshot.recentLow);
  const percent = (value, decimals = 2) => Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(decimals)}%` : "--";
  const signedPercent = (value, decimals = 2) => Number.isFinite(Number(value))
    ? `${Number(value) >= 0 ? "+" : ""}${(Number(value) * 100).toFixed(decimals)} pct`
    : "--";
  const zoneLabels = currentLanguage === "zh"
    ? { "deep-bottom": "历史深底", bottom: "底部区间", accumulation: "吸筹过渡", balanced: "均衡结构", speculation: "投机过热" }
    : { "deep-bottom": "Historic Deep Bottom", bottom: "Bottom Zone", accumulation: "Accumulation Transition", balanced: "Balanced Structure", speculation: "Speculative Overheat" };
  const trendLabels = currentLanguage === "zh"
    ? { rising: "回升", falling: "回落", flat: "平稳" }
    : { rising: "Rising", falling: "Falling", flat: "Flat" };
  const sourceSuffix = payload.stale || cacheFallback ? " · CACHE" : "";

  setText("#under-3m-hodl-current", percent(current));
  setText("#under-3m-hodl-zone", zoneLabels[snapshot.zone] || "--");
  setText("#under-3m-hodl-averages", `${percent(average7)} / ${percent(average30)}`);
  setText("#under-3m-hodl-trend", `${trendLabels[snapshot.trend] || "--"} · 7D ${signedPercent(sevenDayChange)}`);
  setText("#under-3m-hodl-price", formatUsd(Number(snapshot.price)));
  setText("#under-3m-hodl-price-as-of", `${under3mHodlSources?.price || "Live spot"}${sourceSuffix}`);
  setText("#under-3m-hodl-recent-low", percent(recentLow));
  setText("#under-3m-hodl-recent-low-date", snapshot.recentLowDate || "--");
  setText("#under-3m-hodl-change", signedPercent(sevenDayChange));
  setText("#under-3m-hodl-distance", signedPercent(distance));
  setText("#under-3m-hodl-v-turn", snapshot.vTurn ? (currentLanguage === "zh" ? "已确认" : "Confirmed") : (currentLanguage === "zh" ? "尚未确认" : "Not confirmed"));
  setText("#under-3m-hodl-date", snapshot.onchainAsOf || "--");
  setText("#under-3m-hodl-source", `${under3mHodlSources?.history || "BGeometrics public Realized Cap HODL Waves"}${sourceSuffix} · <3M = 100% - 3M+`);

  const signal = document.querySelector("#under-3m-hodl-signal");
  if (signal) {
    ["deep-bottom", "bottom", "accumulation", "balanced", "speculation"].forEach((zone) => signal.classList.toggle(`is-${zone}`, snapshot.zone === zone));
  }
  setText("#under-3m-hodl-signal-title", zoneLabels[snapshot.zone] || "--");
  const signalCopy = currentLanguage === "zh"
    ? `当前小于 3 个月短期资本占比为 ${percent(current)}，7 日与 30 日均值分别为 ${percent(average7)} 和 ${percent(average30)}。${snapshot.vTurn ? "指标已从近 180 日低点拐头，短线资金由净离场转向温和回流。" : "指标仍在底部结构中，需等待 7 日均线持续上穿 30 日均线以确认新资金回流。"}`
    : `The under-three-month share is ${percent(current)}, versus 7-day and 30-day averages of ${percent(average7)} and ${percent(average30)}. ${snapshot.vTurn ? "The series has turned up from its 180-day low, showing renewed short-term capital inflow." : "The series remains in a bottom structure; a sustained 7-day move above the 30-day average would provide stronger confirmation."}`;
  setText("#under-3m-hodl-signal-copy", signalCopy);

  const history = document.querySelector("#under-3m-hodl-history");
  if (history) {
    history.innerHTML = under3mHodlLows.map((low) => `<div><span>${low.date.slice(0, 4)}</span><strong>${percent(Number(low.value), 1)}</strong><em>${low.date} · BTC ${formatUsd(Number(low.price))}</em></div>`).join("");
  }

  const loading = document.querySelector("#under-3m-hodl-loading");
  if (loading) {
    loading.hidden = true;
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
  }
  hideUnder3mHodlTooltip();
  drawUnder3mHodlChart();
  return true;
};

const loadUnder3mHodlMetrics = async () => {
  const cached = readUnder3mHodlCache();
  const loading = document.querySelector("#under-3m-hodl-loading");
  if (loading) {
    loading.hidden = under3mHodlSeries.length >= 2 && Boolean(under3mHodlSnapshot);
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
    loading.textContent = getCopy("under3mHodl.loading");
  }
  try {
    const response = await fetch(`${API_BASE}/api/under-3m-realized-cap-hodl-waves?schema=1`, { cache: "no-store", headers: { Accept: "application/json", "Cache-Control": "no-cache" } });
    if (!response.ok) throw new Error(`Under-3m Realized Cap HODL Waves API ${response.status}`);
    const payload = await response.json();
    if (!applyUnder3mHodlPayload(payload, false)) throw new Error("Under-3m Realized Cap HODL Waves payload is empty");
    writeDashboardCache(UNDER_3M_HODL_CACHE_KEY, payload, "Under-3m Realized Cap HODL Waves");
    if (payload.stale) publicDataWarnings.push("under-3m-hodl-stale");
  } catch (error) {
    if (preserveRenderedChart(under3mHodlSeries, under3mHodlSnapshot, ["#under-3m-hodl-loading"], "under-3m-hodl-refresh")) return;
    if (cached && applyUnder3mHodlPayload(cached, true)) {
      publicDataWarnings.push("under-3m-hodl-cache");
      return;
    }
    clearDashboardCache(UNDER_3M_HODL_CACHE_KEY, "Under-3m Realized Cap HODL Waves");
    if (loading) {
      loading.hidden = false;
      loading.classList.add("is-error");
      loading.setAttribute("role", "button");
      loading.setAttribute("tabindex", "0");
      loading.textContent = currentLanguage === "zh" ? "小于 3 个月已实现市值年龄波同步失败，点击重试" : "Under-3m Realized Cap HODL Waves sync failed. Click to retry.";
    }
    throw error;
  }
};

const readSth200dmaCache = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(STH_200DMA_CACHE_KEY) || "null");
    return cached?.payload || null;
  } catch {
    return null;
  }
};

const applySth200dmaPayload = (payload, cacheFallback = false) => {
  const rows = (payload?.series || []).map((point) => ({
    date: new Date(`${point.date}T00:00:00Z`),
    price: Number(point.price),
    sth: Number(point.sth),
    dma200: Number(point.dma200),
    spread: Number(point.spread),
    spreadPercent: Number(point.spreadPercent)
  })).filter((point) => !Number.isNaN(point.date.getTime())
    && Number.isFinite(point.price) && point.price > 0
    && Number.isFinite(point.sth) && point.sth > 0
    && Number.isFinite(point.dma200) && point.dma200 > 0);
  const snapshot = payload?.snapshot;
  if (rows.length < 180 || !snapshot || !Number.isFinite(Number(snapshot.sth)) || !Number.isFinite(Number(snapshot.dma200))) return false;

  sth200dmaSeries = rows;
  sth200dmaSnapshot = snapshot;
  sth200dmaSources = payload.sources || null;
  sth200dmaMacroCrosses = Array.isArray(payload.macroCrosses) ? payload.macroCrosses : [];
  sth200dmaHistoricalCycles = Array.isArray(payload.historicalCycles) ? payload.historicalCycles : [];

  const spreadPercent = Number(snapshot.spreadPercent);
  const averageMonths = Number(snapshot.averageMonthsToPeak);
  const elapsedHours = Number(snapshot.elapsedHours);
  const confirmed = Boolean(snapshot.confirmed && snapshot.goldenCrossActive);
  const sourceSuffix = payload.stale || cacheFallback ? " · CACHE" : "";
  const signed = (value, decimals = 2) => Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}%` : "--";
  const elapsedText = Number.isFinite(elapsedHours)
    ? elapsedHours >= 48
      ? `${Math.floor(elapsedHours / 24)}${currentLanguage === "zh" ? " 天 " : "d "}${Math.floor(elapsedHours % 24)}${currentLanguage === "zh" ? " 小时" : "h"}`
      : `${Math.floor(elapsedHours)}${currentLanguage === "zh" ? " 小时" : "h"}`
    : "--";

  setText("#sth-200dma-sth", formatUsd(Number(snapshot.sth)));
  setText("#sth-200dma-state", confirmed ? (currentLanguage === "zh" ? "金叉已按日频确认" : "Daily golden cross confirmed") : (currentLanguage === "zh" ? "等待连续日线确认" : "Awaiting daily confirmation"));
  setText("#sth-200dma-value", formatUsd(Number(snapshot.dma200)));
  setText("#sth-200dma-spread", `${currentLanguage === "zh" ? "成本线相对均线" : "Cost basis vs DMA"} ${signed(spreadPercent)}`);
  setText("#sth-200dma-cross", snapshot.latestCrossDate || "--");
  setText("#sth-200dma-confirmation", `${Number(snapshot.confirmedCloses) || 0} ${currentLanguage === "zh" ? "个日线收盘" : "daily closes"}`);
  setText("#sth-200dma-window", Number.isFinite(averageMonths) ? `≈ ${averageMonths.toFixed(1)} ${currentLanguage === "zh" ? "个月" : "months"}` : "--");
  setText("#sth-200dma-projection", `${currentLanguage === "zh" ? "历史推演" : "Historical projection"} · ${snapshot.projectedPeakDate || "--"}`);
  setText("#sth-200dma-elapsed", elapsedText);
  setText("#sth-200dma-closes", `${Number(snapshot.confirmedCloses) || 0} / 2 ${currentLanguage === "zh" ? "日频" : "daily"}`);
  setText("#sth-200dma-projected", snapshot.projectedPeakDate || "--");
  setText("#sth-200dma-date", snapshot.asOf || "--");
  setText("#sth-200dma-source", `${sth200dmaSources?.history || "BGeometrics public daily API"}${sourceSuffix} · STH <155D · 200D SMA`);

  const signal = document.querySelector("#sth-200dma-signal");
  if (signal) {
    signal.classList.toggle("is-confirmed", confirmed);
    signal.classList.toggle("is-below", !snapshot.goldenCrossActive);
  }
  setText("#sth-200dma-signal-title", confirmed
    ? (currentLanguage === "zh" ? "宏观金叉已确认" : "Macro golden cross confirmed")
    : snapshot.goldenCrossActive
      ? (currentLanguage === "zh" ? "金叉形成，等待更多日线" : "Cross formed; awaiting more daily closes")
      : (currentLanguage === "zh" ? "STH 成本线仍低于 200DMA" : "STH cost basis remains below 200DMA"));
  setText("#sth-200dma-signal-copy", currentLanguage === "zh"
    ? `公开日频序列显示，STH 成本线为 ${formatUsd(Number(snapshot.sth))}，200DMA 为 ${formatUsd(Number(snapshot.dma200))}，相对差值 ${signed(spreadPercent)}。最近宏观金叉发生于 ${snapshot.latestCrossDate || "--"}，截至 ${snapshot.asOf || "--"} 已连续 ${Number(snapshot.confirmedCloses) || 0} 个日线观测保持在均线上方；历史 ${Number(snapshot.completedCycleCount) || 0} 个完整样本的平均见顶窗口约为 ${Number.isFinite(averageMonths) ? averageMonths.toFixed(1) : "--"} 个月。`
    : `The public daily series places STH cost basis at ${formatUsd(Number(snapshot.sth))} versus a ${formatUsd(Number(snapshot.dma200))} 200DMA, a ${signed(spreadPercent)} spread. The latest macro cross occurred on ${snapshot.latestCrossDate || "--"}; through ${snapshot.asOf || "--"}, ${Number(snapshot.confirmedCloses) || 0} daily observations remain above trend. ${Number(snapshot.completedCycleCount) || 0} completed historical samples average ${Number.isFinite(averageMonths) ? averageMonths.toFixed(1) : "--"} months to the subsequent price peak.`);

  const history = document.querySelector("#sth-200dma-history");
  if (history) {
    history.innerHTML = sth200dmaHistoricalCycles.map((cycle) => `<div><span>${cycle.crossDate.slice(0, 4)} CROSS</span><strong>${Number(cycle.monthsToPeak).toFixed(1)}M</strong><em>${cycle.crossDate} → ${cycle.peakDate} · ${Math.round(Number(cycle.daysToPeak))}D</em></div>`).join("");
  }

  const loading = document.querySelector("#sth-200dma-loading");
  if (loading) {
    loading.hidden = true;
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
  }
  hideSth200dmaTooltip();
  drawSth200dmaChart();
  return true;
};

const loadSth200dmaMetrics = async () => {
  const cached = readSth200dmaCache();
  const loading = document.querySelector("#sth-200dma-loading");
  if (loading) {
    loading.hidden = sth200dmaSeries.length >= 2 && Boolean(sth200dmaSnapshot);
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
    loading.textContent = getCopy("sth200dma.loading");
  }
  try {
    const response = await fetch(`${API_BASE}/api/sth-200dma?schema=1`, { cache: "no-store", headers: { Accept: "application/json", "Cache-Control": "no-cache" } });
    if (!response.ok) throw new Error(`STH / 200DMA API ${response.status}`);
    const payload = await response.json();
    if (!applySth200dmaPayload(payload, false)) throw new Error("STH / 200DMA payload is empty");
    writeDashboardCache(STH_200DMA_CACHE_KEY, payload, "STH / 200DMA");
    if (payload.stale) publicDataWarnings.push("sth-200dma-stale");
  } catch (error) {
    if (preserveRenderedChart(sth200dmaSeries, sth200dmaSnapshot, ["#sth-200dma-loading"], "sth-200dma-refresh")) return;
    if (cached && applySth200dmaPayload(cached, true)) {
      publicDataWarnings.push("sth-200dma-cache");
      return;
    }
    clearDashboardCache(STH_200DMA_CACHE_KEY, "STH / 200DMA");
    if (loading) {
      loading.hidden = false;
      loading.classList.add("is-error");
      loading.setAttribute("role", "button");
      loading.setAttribute("tabindex", "0");
      loading.textContent = currentLanguage === "zh" ? "STH 成本线 / 200DMA 同步失败，点击重试" : "STH cost basis / 200DMA sync failed. Click to retry.";
    }
    throw error;
  }
};

const readVddMedianCache = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(VDD_MEDIAN_CACHE_KEY) || "null");
    return cached?.payload || null;
  } catch {
    return null;
  }
};

const applyVddMedianPayload = (payload, cacheFallback = false) => {
  const rows = (payload?.series || []).map((point) => ({
    date: new Date(`${point.date}T00:00:00Z`),
    price: Number(point.price),
    median: Number(point.median),
    medianEstimated: Boolean(point.medianEstimated),
    vdd: Number(point.vdd),
    medianRatio: Number(point.medianRatio),
    bottomSignal: Boolean(point.bottomSignal),
    topSignal: Boolean(point.topSignal),
    topScore: Number(point.topScore)
  })).filter((point) => !Number.isNaN(point.date.getTime())
    && Number.isFinite(point.price) && point.price > 0
    && Number.isFinite(point.median) && point.median > 0
    && Number.isFinite(point.vdd) && point.vdd >= 0
    && Number.isFinite(point.medianRatio) && point.medianRatio > 0);
  const snapshot = payload?.snapshot;
  if (rows.length < 1_000 || !snapshot || !Number.isFinite(Number(snapshot.vdd)) || !Number.isFinite(Number(snapshot.median))) return false;

  vddMedianSeries = rows;
  vddMedianSnapshot = snapshot;
  vddMedianSources = payload.sources || null;
  vddMedianBottomZones = Array.isArray(payload.bottomZones) ? payload.bottomZones : [];
  vddMedianTopZones = Array.isArray(payload.topZones) ? payload.topZones : [];
  vddMedianReferenceCycles = Array.isArray(payload.referenceCycles) ? payload.referenceCycles : [];

  const elapsedHours = Number(snapshot.elapsedHours);
  const averageDays = Number(snapshot.averageDaysToTop);
  const averageMonths = Number(snapshot.averageMonthsToTop);
  const ratio = Number(snapshot.medianRatio);
  const vdd = Number(snapshot.vdd);
  const elapsedText = Number.isFinite(elapsedHours)
    ? `${Math.floor(elapsedHours / 24)}${currentLanguage === "zh" ? " 天 " : "d "}${Math.floor(elapsedHours % 24)}${currentLanguage === "zh" ? " 小时" : "h"}`
    : "--";
  const sourceSuffix = payload.stale || cacheFallback ? " · CACHE" : "";
  const zoneLabels = currentLanguage === "zh"
    ? { "top-risk": "逃顶风险柱已触发", bottom: "熊底绿色区仍在延续", "early-cycle": "熊底完结 · 新周期早段", neutral: "中性观察区" }
    : { "top-risk": "Top-risk bar is active", bottom: "Bear-bottom green zone remains active", "early-cycle": "Bottom completed · early cycle", neutral: "Neutral observation zone" };

  setText("#vdd-median-price", formatUsd(Number(snapshot.price)));
  setText("#vdd-median-price-date", `${currentLanguage === "zh" ? "现价时间" : "Spot as of"} · ${String(snapshot.priceAsOf || "--").slice(0, 16).replace("T", " ")}`);
  setText("#vdd-median-median", formatUsd(Number(snapshot.median)));
  setText("#vdd-median-median-state", snapshot.medianEstimated ? (currentLanguage === "zh" ? "公开 HODL 重建值" : "Public HODL reconstruction") : (currentLanguage === "zh" ? "公开观测值" : "Public observation"));
  setText("#vdd-median-vdd", Number.isFinite(vdd) ? `${vdd.toFixed(3)}x` : "--");
  setText("#vdd-median-vdd-state", vdd < 0.9 ? (currentLanguage === "zh" ? "低 VDD 积累区" : "Low-VDD accumulation") : vdd >= 1.5 ? (currentLanguage === "zh" ? "高 VDD 派发区" : "High-VDD distribution") : (currentLanguage === "zh" ? "常态流动区" : "Normal activity"));
  setText("#vdd-median-window", Number.isFinite(averageDays) ? `≈ ${Math.round(averageDays)}D` : "--");
  setText("#vdd-median-window-state", Number.isFinite(averageMonths) ? `${averageMonths.toFixed(1)} ${currentLanguage === "zh" ? "个月" : "months"} · ${snapshot.projectedRiskStart || "--"} → ${snapshot.projectedRiskEnd || "--"}` : "--");
  setText("#vdd-median-elapsed", elapsedText);
  setText("#vdd-median-ratio", Number.isFinite(ratio) ? `${ratio.toFixed(2)}x` : "--");
  setText("#vdd-median-projected", snapshot.projectedTopDate || "--");
  setText("#vdd-median-date", snapshot.asOf || "--");
  setText("#vdd-median-source", `${vddMedianSources?.vdd || "BGeometrics public daily API"}${sourceSuffix} · MEDIAN HODL RECONSTRUCTION · BINANCE SPOT`);

  const signal = document.querySelector("#vdd-median-signal");
  if (signal) {
    ["top-risk", "bottom", "early-cycle", "neutral"].forEach((zone) => signal.classList.toggle(`is-${zone}`, snapshot.zone === zone));
  }
  setText("#vdd-median-signal-title", zoneLabels[snapshot.zone] || "--");
  const signalCopy = currentLanguage === "zh"
    ? `最新日频 VDD 为 ${vdd.toFixed(3)}x，BTC / 中位数价格为 ${ratio.toFixed(2)}x。绿色区条件为 VDD < 0.9 且价格倍数 ≤ 1.25；红色柱条件为 VDD ≥ 1.5 且价格倍数 ≥ 1.5。${snapshot.latestBottomEnd ? `最近绿色区于 ${snapshot.latestBottomEnd} 完结，按两个参考样本均值推演的顶部风险中点为 ${snapshot.projectedTopDate}。` : "尚未识别到已完结的最新绿色区。"}`
    : `Latest daily VDD is ${vdd.toFixed(3)}x and BTC / Median is ${ratio.toFixed(2)}x. The green zone requires VDD < 0.9 and the price multiple ≤ 1.25; a red bar requires VDD ≥ 1.5 and the price multiple ≥ 1.5. ${snapshot.latestBottomEnd ? `The latest green zone completed on ${snapshot.latestBottomEnd}; the two-sample average projects a risk midpoint around ${snapshot.projectedTopDate}.` : "No completed latest green zone has been detected."}`;
  setText("#vdd-median-signal-copy", signalCopy);

  const history = document.querySelector("#vdd-median-history");
  if (history) {
    history.innerHTML = vddMedianReferenceCycles.map((cycle) => `<div><span>${cycle.cycle} CYCLE</span><strong>${Math.round(Number(cycle.daysToTop))}D</strong><em>${cycle.bottomEnd} → ${cycle.topSignalDate} · ${Number(cycle.monthsToTop).toFixed(1)}M</em></div>`).join("");
  }

  const loading = document.querySelector("#vdd-median-loading");
  if (loading) {
    loading.hidden = true;
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
  }
  hideVddMedianTooltip();
  drawVddMedianCycleChart();
  return true;
};

const loadVddMedianMetrics = async () => {
  const cached = readVddMedianCache();
  const loading = document.querySelector("#vdd-median-loading");
  if (loading) {
    loading.hidden = vddMedianSeries.length >= 2 && Boolean(vddMedianSnapshot);
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
    loading.textContent = getCopy("vddMedian.loading");
  }
  try {
    const response = await fetch(`${API_BASE}/api/vdd-median-cycle?schema=1`, { cache: "no-store", headers: { Accept: "application/json", "Cache-Control": "no-cache" } });
    if (!response.ok) throw new Error(`VDD / Median cycle API ${response.status}`);
    const payload = await response.json();
    if (!applyVddMedianPayload(payload, false)) throw new Error("VDD / Median cycle payload is empty");
    writeDashboardCache(VDD_MEDIAN_CACHE_KEY, payload, "VDD / Median cycle");
    if (payload.stale) publicDataWarnings.push("vdd-median-stale");
  } catch (error) {
    if (preserveRenderedChart(vddMedianSeries, vddMedianSnapshot, ["#vdd-median-loading"], "vdd-median-refresh")) return;
    if (cached && applyVddMedianPayload(cached, true)) {
      publicDataWarnings.push("vdd-median-cache");
      return;
    }
    clearDashboardCache(VDD_MEDIAN_CACHE_KEY, "VDD / Median cycle");
    if (loading) {
      loading.hidden = false;
      loading.classList.add("is-error");
      loading.setAttribute("role", "button");
      loading.setAttribute("tabindex", "0");
      loading.textContent = currentLanguage === "zh" ? "VDD / 中位数价格模型同步失败，点击重试" : "VDD / Median Price model sync failed. Click to retry.";
    }
    throw error;
  }
};

const readSsrCache = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(SSR_CACHE_KEY) || "null");
    return cached?.payload || null;
  } catch {
    return null;
  }
};

const applySsrPayload = (payload, cacheFallback = false) => {
  const rows = (payload?.series || []).map((point) => ({
    date: new Date(`${point.date}T00:00:00Z`),
    price: Number(point.price),
    btcMarketCap: Number(point.btcMarketCap),
    stablecoinMarketCap: Number(point.stablecoinMarketCap),
    stablecoinSource: point.stablecoinSource,
    ssr: Number(point.ssr),
    mean: point.mean == null ? null : Number(point.mean),
    upper: point.upper == null ? null : Number(point.upper),
    lower: point.lower == null ? null : Number(point.lower),
    aboveUpper: Boolean(point.aboveUpper),
    belowLower: Boolean(point.belowLower)
  })).filter((point) => !Number.isNaN(point.date.getTime())
    && Number.isFinite(point.price) && point.price > 0
    && Number.isFinite(point.ssr) && point.ssr > 0
    && Number.isFinite(point.stablecoinMarketCap) && point.stablecoinMarketCap > 0);
  const snapshot = payload?.snapshot;
  if (rows.length < 2_500 || !snapshot || !Number.isFinite(Number(snapshot.ssr)) || !Number.isFinite(Number(snapshot.upper))) return false;

  ssrSeries = rows;
  ssrSnapshot = snapshot;
  ssrSources = payload.sources || null;
  ssrMacroBreakouts = Array.isArray(payload.macroBreakouts) ? payload.macroBreakouts : [];
  ssrReferenceBreakouts = Array.isArray(payload.referenceBreakouts) ? payload.referenceBreakouts : [];

  const ssr = Number(snapshot.ssr);
  const upper = Number(snapshot.upper);
  const lower = Number(snapshot.lower);
  const mean = Number(snapshot.mean);
  const distance = Number(snapshot.distanceToUpperPct);
  const confirmedCloses = Number(snapshot.confirmedCloses) || 0;
  const elapsedHours = Number(snapshot.elapsedHours);
  const elapsedText = Number.isFinite(elapsedHours)
    ? `${Math.floor(elapsedHours / 24)}${currentLanguage === "zh" ? " 天 " : "d "}${Math.floor(elapsedHours % 24)}${currentLanguage === "zh" ? " 小时" : "h"}`
    : "--";
  const sourceSuffix = payload.stale || cacheFallback ? " · CACHE" : "";
  const zoneLabels = currentLanguage === "zh"
    ? { "breakout-confirmed": "上轨突破 · 右侧趋势已确认", "breakout-watch": "上轨突破 · 等待日线确认", "inside-band": "布林通道内 · 中性观察", "below-lower": "下轨下方 · 购买力沉淀" }
    : { "breakout-confirmed": "Upper breakout · right-side trend confirmed", "breakout-watch": "Upper breakout · awaiting daily confirmation", "inside-band": "Inside Bollinger channel · neutral", "below-lower": "Below lower band · purchasing power accumulating" };

  setText("#ssr-price", formatUsd(Number(snapshot.price)));
  setText("#ssr-price-date", `${currentLanguage === "zh" ? "现价时间" : "Spot as of"} · ${String(snapshot.priceAsOf || "--").slice(0, 16).replace("T", " ")}`);
  setText("#ssr-current", ssr.toFixed(3));
  setText("#ssr-current-state", snapshot.zone === "breakout-confirmed" && snapshot.liveAboveUpper === false
    ? (currentLanguage === "zh" ? "日线突破已确认 · 盘中回测" : "Daily breakout confirmed · intraday retest")
    : zoneLabels[snapshot.zone] || "--");
  setText("#ssr-upper", upper.toFixed(3));
  setText("#ssr-upper-state", `${currentLanguage === "zh" ? "SSR 相对上轨" : "SSR vs upper"} ${distance >= 0 ? "+" : ""}${distance.toFixed(2)}%`);
  setText("#ssr-lower", lower.toFixed(3));
  setText("#ssr-lower-state", `${currentLanguage === "zh" ? "200 日均值" : "200D mean"} ${mean.toFixed(3)}`);
  setText("#ssr-elapsed", elapsedText);
  setText("#ssr-distance", `${distance >= 0 ? "+" : ""}${distance.toFixed(2)}%`);
  setText("#ssr-closes", `${confirmedCloses} ${currentLanguage === "zh" ? "个日线收盘" : "daily closes"}`);
  setText("#ssr-projected", snapshot.followThroughWindowStart && snapshot.followThroughWindowEnd ? `${snapshot.followThroughWindowStart} → ${snapshot.followThroughWindowEnd}` : "--");
  setText("#ssr-source", `${ssrSources?.btcMarketCap || "Coin Metrics Community API"}${sourceSuffix} · DEFILLAMA · BB(200, 2)`);

  const signal = document.querySelector("#ssr-signal");
  if (signal) {
    ["breakout-confirmed", "breakout-watch", "inside-band", "below-lower"].forEach((zone) => signal.classList.toggle(`is-${zone}`, snapshot.zone === zone));
  }
  setText("#ssr-signal-title", zoneLabels[snapshot.zone] || "--");
  const stableBillions = Number(snapshot.stablecoinMarketCap) / 1_000_000_000;
  const signalCopy = currentLanguage === "zh"
    ? `当前实时 SSR 为 ${ssr.toFixed(3)}，200 日上轨 ${upper.toFixed(3)}、下轨 ${lower.toFixed(3)}，相对上轨 ${distance >= 0 ? "+" : ""}${distance.toFixed(2)}%。稳定币总市值约 $${stableBillions.toFixed(1)}B。${snapshot.latestBreakoutDate ? `最新宏观突破起点为 ${snapshot.latestBreakoutDate}，已连续确认 ${confirmedCloses} 个日线收盘。` : "尚未识别到有效宏观突破。"}`
    : `Live SSR is ${ssr.toFixed(3)} versus a ${upper.toFixed(3)} upper band and ${lower.toFixed(3)} lower band, placing it ${distance >= 0 ? "+" : ""}${distance.toFixed(2)}% from the upper boundary. Total stablecoin capitalization is about $${stableBillions.toFixed(1)}B. ${snapshot.latestBreakoutDate ? `The latest macro episode began on ${snapshot.latestBreakoutDate} with ${confirmedCloses} confirmed daily closes.` : "No valid macro breakout has been detected."}`;
  setText("#ssr-signal-copy", signalCopy);

  const history = document.querySelector("#ssr-history");
  if (history) {
    const cards = ssrReferenceBreakouts.map((event) => `<div><span>${event.cycle} BREAKOUT</span><strong>${event.date}</strong><em>SSR ${Number(event.ssr).toFixed(2)} · 365D MAX ${Number(event.maxReturn365Pct) >= 0 ? "+" : ""}${Number(event.maxReturn365Pct).toFixed(1)}%</em></div>`);
    if (snapshot.latestBreakoutDate) cards.push(`<div><span>${currentLanguage === "zh" ? "当前周期" : "CURRENT CYCLE"}</span><strong>${snapshot.latestBreakoutDate}</strong><em>${elapsedText} · ${confirmedCloses} ${currentLanguage === "zh" ? "个确认收盘" : "confirmed closes"}</em></div>`);
    history.innerHTML = cards.join("");
  }

  const loading = document.querySelector("#ssr-loading");
  if (loading) {
    loading.hidden = true;
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
  }
  hideSsrTooltip();
  drawSsrChart();
  return true;
};

const loadSsrMetrics = async () => {
  const cached = readSsrCache();
  const loading = document.querySelector("#ssr-loading");
  if (loading) {
    loading.hidden = ssrSeries.length >= 2 && Boolean(ssrSnapshot);
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
    loading.textContent = getCopy("ssr.loading");
  }
  try {
    const response = await fetch(`${API_BASE}/api/stablecoin-supply-ratio?schema=1`, { cache: "no-store", headers: { Accept: "application/json", "Cache-Control": "no-cache" } });
    if (!response.ok) throw new Error(`Stablecoin Supply Ratio API ${response.status}`);
    const payload = await response.json();
    if (!applySsrPayload(payload, false)) throw new Error("Stablecoin Supply Ratio payload is empty");
    writeDashboardCache(SSR_CACHE_KEY, payload, "Stablecoin Supply Ratio");
    if (payload.stale) publicDataWarnings.push("stablecoin-supply-ratio-stale");
  } catch (error) {
    if (preserveRenderedChart(ssrSeries, ssrSnapshot, ["#ssr-loading"], "stablecoin-supply-ratio-refresh")) return;
    if (cached && applySsrPayload(cached, true)) {
      publicDataWarnings.push("stablecoin-supply-ratio-cache");
      return;
    }
    clearDashboardCache(SSR_CACHE_KEY, "Stablecoin Supply Ratio");
    if (loading) {
      loading.hidden = false;
      loading.classList.add("is-error");
      loading.setAttribute("role", "button");
      loading.setAttribute("tabindex", "0");
      loading.textContent = currentLanguage === "zh" ? "SSR 稳定币供应比例同步失败，点击重试" : "Stablecoin Supply Ratio sync failed. Click to retry.";
    }
    throw error;
  }
};

const readSthBandsCache = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(STH_BANDS_CACHE_KEY) || "null");
    return cached?.payload || null;
  } catch {
    return null;
  }
};

const applySthBandsPayload = (payload, cacheFallback = false) => {
  const parseRow = (point) => ({
    date: new Date(`${point.date}T00:00:00Z`),
    price: point.price == null ? null : Number(point.price),
    sth: point.sth == null ? null : Number(point.sth),
    sigma: Number(point.sigma),
    observations: Number(point.observations),
    ...Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`line${index + 1}`, Number(point[`line${index + 1}`])]))
  });
  const rows = (payload?.series || []).map(parseRow).filter((point) => !Number.isNaN(point.date.getTime())
    && Number.isFinite(point.price) && point.price > 0
    && Number.isFinite(point.line1) && point.line1 > 0
    && Number.isFinite(point.line9) && point.line9 > point.line1);
  const projection = (payload?.projection || []).map(parseRow).filter((point) => !Number.isNaN(point.date.getTime())
    && Number.isFinite(point.line1) && point.line1 > 0
    && Number.isFinite(point.line9) && point.line9 > point.line1);
  const snapshot = payload?.snapshot;
  if (rows.length < 365 || !snapshot || !Number.isFinite(Number(snapshot.line7)) || !Number.isFinite(Number(snapshot.line5))) return false;

  sthBandsSeries = rows;
  sthBandsProjection = projection;
  sthBandsSnapshot = snapshot;
  sthBandsSources = payload.sources || null;
  sthBandsMacroBreakouts = Array.isArray(payload.macroBreakouts) ? payload.macroBreakouts : [];
  sthBandsReferenceBreakouts = Array.isArray(payload.referenceBreakouts) ? payload.referenceBreakouts : [];

  const price = Number(snapshot.price);
  const line5 = Number(snapshot.line5);
  const line7 = Number(snapshot.line7);
  const sigma = Number(snapshot.sigma);
  const distance = Number(snapshot.distanceToLine7Pct);
  const confirmedCloses = Number(snapshot.confirmedCloses) || 0;
  const elapsedHours = Number(snapshot.elapsedHours);
  const elapsedText = Number.isFinite(elapsedHours)
    ? `${Math.floor(elapsedHours / 24)}${currentLanguage === "zh" ? " 天 " : "d "}${Math.floor(elapsedHours % 24)}${currentLanguage === "zh" ? " 小时" : "h"}`
    : "--";
  const sourceSuffix = payload.stale || cacheFallback ? " · CACHE" : "";
  const lineMatch = String(snapshot.zone || "").match(/^line(\d)-line(\d)$/);
  const zoneLabel = snapshot.zone === "above-line9"
    ? (currentLanguage === "zh" ? "Line9 上方 · 极热" : "Above Line9 · Extremely hot")
    : snapshot.zone === "below-line1"
      ? (currentLanguage === "zh" ? "Line1 下方 · 深度冷却" : "Below Line1 · Deeply cooled")
      : lineMatch
        ? `Line${lineMatch[1]} — Line${lineMatch[2]}`
        : "--";
  const state = snapshot.liveAboveLine7
    ? confirmedCloses >= 2 ? "breakout-confirmed" : "breakout-watch"
    : "below-line7";
  const stateLabels = currentLanguage === "zh"
    ? { "breakout-confirmed": "Line7 突破 · 右侧趋势已确认", "breakout-watch": "Line7 触及 · 等待日线确认", "below-line7": "Line7 下方 · 等待右侧突破" }
    : { "breakout-confirmed": "Line7 breakout · right-side trend confirmed", "breakout-watch": "Line7 touched · awaiting daily confirmation", "below-line7": "Below Line7 · awaiting right-side breakout" };

  setText("#sth-bands-price", formatUsd(price));
  setText("#sth-bands-price-date", `${currentLanguage === "zh" ? "现价时间" : "Spot as of"} · ${String(snapshot.priceAsOf || "--").slice(0, 16).replace("T", " ")}`);
  setText("#sth-bands-line5", formatUsd(line5));
  setText("#sth-bands-line5-state", `${currentLanguage === "zh" ? "STH <155D · 四年窗口" : "STH <155D · four-year window"} · ${Number(snapshot.observations) || 0} obs`);
  setText("#sth-bands-line7", formatUsd(line7));
  setText("#sth-bands-line7-state", `${currentLanguage === "zh" ? "1σ 波动" : "1σ dispersion"} ${formatUsd(sigma)} · ${distance >= 0 ? "+" : ""}${distance.toFixed(2)}%`);
  setText("#sth-bands-zone", zoneLabel);
  setText("#sth-bands-zone-state", snapshot.liveAboveLine7 ? (currentLanguage === "zh" ? "实时价格已触及关键轨" : "Live price has reached the key rail") : (currentLanguage === "zh" ? "尚未触及关键轨" : "Key rail not yet reached"));
  setText("#sth-bands-elapsed", elapsedText);
  setText("#sth-bands-distance", `${distance >= 0 ? "+" : ""}${distance.toFixed(2)}%`);
  setText("#sth-bands-closes", `${confirmedCloses} ${currentLanguage === "zh" ? "个日线收盘" : "daily closes"}`);
  setText("#sth-bands-projected", snapshot.followThroughWindowStart && snapshot.followThroughWindowEnd ? `${snapshot.followThroughWindowStart} → ${snapshot.followThroughWindowEnd}` : "--");
  setText("#sth-bands-source", `${sthBandsSources?.history || "BGeometrics public daily API"}${sourceSuffix} · STH <155D · 4Y ±2σ`);

  const signal = document.querySelector("#sth-bands-signal");
  if (signal) ["breakout-confirmed", "breakout-watch", "below-line7"].forEach((name) => signal.classList.toggle(`is-${name}`, state === name));
  setText("#sth-bands-signal-title", stateLabels[state]);
  setText("#sth-bands-signal-copy", currentLanguage === "zh"
    ? `当前 BTC 实时价格 ${formatUsd(price)}，Line5 成本中枢 ${formatUsd(line5)}，Line7（+1σ）${formatUsd(line7)}，价格相对 Line7 ${distance >= 0 ? "+" : ""}${distance.toFixed(2)}%。${snapshot.latestBreakoutDate ? `最近一次宏观突破起点为 ${snapshot.latestBreakoutDate}，截至 ${snapshot.asOf} 连续 ${confirmedCloses} 个日线收盘位于 Line7 上方。` : "公开序列尚未识别到当前有效宏观突破。"}`
    : `Live BTC is ${formatUsd(price)}, Line5 cost basis is ${formatUsd(line5)}, and Line7 (+1σ) is ${formatUsd(line7)}, leaving price ${distance >= 0 ? "+" : ""}${distance.toFixed(2)}% from Line7. ${snapshot.latestBreakoutDate ? `The latest macro breakout began on ${snapshot.latestBreakoutDate}; through ${snapshot.asOf}, ${confirmedCloses} consecutive daily closes remain above Line7.` : "The public series has not identified a currently valid macro breakout."}`);

  const history = document.querySelector("#sth-bands-history");
  if (history) {
    const cards = sthBandsReferenceBreakouts.map((event) => `<div><span>${event.cycle} LINE7</span><strong>${event.breakoutDate}</strong><em>365D MAX ${Number(event.returnToMax365Pct) >= 0 ? "+" : ""}${Number(event.returnToMax365Pct).toFixed(1)}% · ${Number(event.daysToMax365) || 0}D</em></div>`);
    if (snapshot.latestBreakoutDate) cards.push(`<div><span>${currentLanguage === "zh" ? "当前周期" : "CURRENT CYCLE"}</span><strong>${snapshot.latestBreakoutDate}</strong><em>${elapsedText} · ${confirmedCloses} ${currentLanguage === "zh" ? "个确认收盘" : "confirmed closes"}</em></div>`);
    history.innerHTML = cards.join("");
  }

  const loading = document.querySelector("#sth-bands-loading");
  if (loading) {
    loading.hidden = true;
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
  }
  hideSthBandsTooltip();
  drawSthBandsChart();
  return true;
};

const loadSthBandsMetrics = async () => {
  const cached = readSthBandsCache();
  const loading = document.querySelector("#sth-bands-loading");
  if (loading) {
    loading.hidden = sthBandsSeries.length >= 2 && Boolean(sthBandsSnapshot);
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
    loading.textContent = getCopy("sthBands.loading");
  }
  try {
    const response = await fetch(`${API_BASE}/api/sth-cost-basis-bands?schema=1`, { cache: "no-store", headers: { Accept: "application/json", "Cache-Control": "no-cache" } });
    if (!response.ok) throw new Error(`STH cost basis bands API ${response.status}`);
    const payload = await response.json();
    if (!applySthBandsPayload(payload, false)) throw new Error("STH cost basis bands payload is empty");
    writeDashboardCache(STH_BANDS_CACHE_KEY, payload, "STH cost basis bands");
    if (payload.stale) publicDataWarnings.push("sth-cost-basis-bands-stale");
  } catch (error) {
    if (preserveRenderedChart(sthBandsSeries, sthBandsSnapshot, ["#sth-bands-loading"], "sth-cost-basis-bands-refresh")) return;
    if (cached && applySthBandsPayload(cached, true)) {
      publicDataWarnings.push("sth-cost-basis-bands-cache");
      return;
    }
    clearDashboardCache(STH_BANDS_CACHE_KEY, "STH cost basis bands");
    if (loading) {
      loading.hidden = false;
      loading.classList.add("is-error");
      loading.setAttribute("role", "button");
      loading.setAttribute("tabindex", "0");
      loading.textContent = currentLanguage === "zh" ? "STH 短期持有成本九彩轨道同步失败，点击重试" : "STH cost basis bands sync failed. Click to retry.";
    }
    throw error;
  }
};

const readPercentProfitEx10yCache = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(PERCENT_PROFIT_EX_10Y_CACHE_KEY) || "null");
    return cached?.payload || null;
  } catch {
    return null;
  }
};

const applyPercentProfitEx10yPayload = (payload, cacheFallback = false) => {
  const parseRow = (point) => ({
    date: new Date(`${point.date}T00:00:00Z`),
    price: point.price == null ? null : Number(point.price),
    percentRaw: point.percentRaw == null ? null : Number(point.percentRaw),
    percent7: Number(point.percent7),
    dormantOver10y: point.dormantOver10y == null ? null : Number(point.dormantOver10y),
    dormantShare: point.dormantShare == null ? null : Number(point.dormantShare),
    activeSupply: point.activeSupply == null ? null : Number(point.activeSupply),
    activeProfitSupply: point.activeProfitSupply == null ? null : Number(point.activeProfitSupply),
    lossSupply: point.lossSupply == null ? null : Number(point.lossSupply)
  });
  const rows = (payload?.series || []).map(parseRow).filter((point) => !Number.isNaN(point.date.getTime())
    && Number.isFinite(point.price) && point.price > 0
    && Number.isFinite(point.percent7) && point.percent7 >= 0 && point.percent7 <= 100);
  const projection = (payload?.projection || []).map((point) => ({
    date: new Date(`${point.date}T00:00:00Z`),
    percent7: Number(point.percent7),
    scenario: true
  })).filter((point) => !Number.isNaN(point.date.getTime()) && Number.isFinite(point.percent7));
  const snapshot = payload?.snapshot;
  if (rows.length < 1000 || !snapshot || !Number.isFinite(Number(snapshot.percent7))) return false;

  percentProfitEx10ySeries = rows;
  percentProfitEx10yProjection = projection;
  percentProfitEx10ySnapshot = snapshot;
  percentProfitEx10ySources = payload.sources || null;
  percentProfitEx10yReferenceCycles = Array.isArray(payload.referenceCycles) ? payload.referenceCycles : [];
  percentProfitEx10yWashoutZones = Array.isArray(payload.washoutZones) ? payload.washoutZones : [];

  const current = Number(snapshot.percent7);
  const change = Number(snapshot.sevenDayChange);
  const distance = Number(snapshot.distanceTo55);
  const dormant = Number(snapshot.dormantOver10y);
  const dormantShare = Number(snapshot.dormantShare);
  const sourceSuffix = payload.stale || cacheFallback ? " · CACHE" : "";
  const supply = (value) => Number.isFinite(Number(value)) ? `${(Number(value) / 1_000_000).toFixed(2)}M BTC` : "--";
  const signedPercent = (value) => Number.isFinite(Number(value)) ? `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(2)}%` : "--";
  const zoneLabels = currentLanguage === "zh"
    ? { washout: "55% 下方 · 深度换手", "deep-reset": "55%–60% · 洗盘窗口", recovery: "60%–75% · 修复", expansion: "75%–95% · 扩张", overheated: "95% 上方 · 浮盈拥挤" }
    : { washout: "Below 55% · Deep washout", "deep-reset": "55%–60% · Reset window", recovery: "60%–75% · Recovery", expansion: "75%–95% · Expansion", overheated: "Above 95% · Crowded profits" };
  const signalCopy = currentLanguage === "zh"
    ? `当前有效浮盈比例 7 日均线为 ${current.toFixed(2)}%，7 日变化 ${signedPercent(change)}，距离现代周期 55% 深度换手阈值 ${signedPercent(distance)}。本口径已从盈利供应与总供应同步剔除 ${supply(dormant)}（占全网 ${dormantShare.toFixed(2)}%）的十年以上未移动筹码。${snapshot.washoutCompleted ? `过去 365 日低点 ${Number(snapshot.recentLowPercent).toFixed(2)}% 已完成阈值下探，当前处于回升验证。` : `过去 365 日低点为 ${Number(snapshot.recentLowPercent).toFixed(2)}%，继续观察是否出现或完成深度换手。`}`
    : `The active profit-share 7DMA is ${current.toFixed(2)}%, changing ${signedPercent(change)} over seven days and standing ${signedPercent(distance)} from the modern 55% washout threshold. The proxy removes ${supply(dormant)} (${dormantShare.toFixed(2)}% of supply) dormant for more than ten years from both profit and total supply. ${snapshot.washoutCompleted ? `The 365-day low of ${Number(snapshot.recentLowPercent).toFixed(2)}% crossed the threshold and is now in rebound validation.` : `The 365-day low is ${Number(snapshot.recentLowPercent).toFixed(2)}%; monitor whether a deep reset begins or completes.`}`;

  setText("#percent-profit-ex-10y-current", `${current.toFixed(2)}%`);
  setText("#percent-profit-ex-10y-as-of", `${snapshot.asOf || "--"} · 7DMA`);
  setText("#percent-profit-ex-10y-price", formatUsd(Number(snapshot.price)));
  setText("#percent-profit-ex-10y-price-as-of", `${currentLanguage === "zh" ? "现价时间" : "Spot as of"} · ${String(snapshot.priceAsOf || "--").slice(0, 16).replace("T", " ")}`);
  setText("#percent-profit-ex-10y-dormant", supply(dormant));
  setText("#percent-profit-ex-10y-dormant-share", `${dormantShare.toFixed(2)}% ${currentLanguage === "zh" ? "全网供应" : "of total supply"}`);
  setText("#percent-profit-ex-10y-zone", zoneLabels[snapshot.zone] || "--");
  setText("#percent-profit-ex-10y-recent-low", `${currentLanguage === "zh" ? "365日低点" : "365D low"} ${Number(snapshot.recentLowPercent).toFixed(2)}% · ${snapshot.recentLowDate || "--"}`);
  setText("#percent-profit-ex-10y-change", signedPercent(change));
  setText("#percent-profit-ex-10y-distance", signedPercent(distance));
  setText("#percent-profit-ex-10y-active-profit", supply(snapshot.activeProfitSupply));
  setText("#percent-profit-ex-10y-scenario", projection.length ? `${snapshot.asOf} → ${projection.at(-1).date.toISOString().slice(0, 10)}` : "--");
  setText("#percent-profit-ex-10y-source", `${percentProfitEx10ySources?.profitLoss || "BGeometrics public profit / loss supply"}${sourceSuffix} · >10Y SUPPLY · 7DMA`);
  setText("#percent-profit-ex-10y-signal-title", zoneLabels[snapshot.zone] || "--");
  setText("#percent-profit-ex-10y-signal-copy", signalCopy);

  const signal = document.querySelector("#percent-profit-ex-10y-signal");
  if (signal) ["washout", "deep-reset", "recovery", "expansion", "overheated"].forEach((zone) => signal.classList.toggle(`is-${zone}`, snapshot.zone === zone));
  const history = document.querySelector("#percent-profit-ex-10y-history");
  if (history) history.innerHTML = percentProfitEx10yReferenceCycles.map((cycle) => `<div><span>${cycle.cycle} · &lt;${cycle.threshold}%</span><strong>${Number(cycle.lowPercent).toFixed(2)}%</strong><em>${cycle.lowDate} · BTC ${formatUsd(Number(cycle.priceAtLow))}${cycle.triggered ? " · TRIGGERED" : " · ABOVE LINE"}</em></div>`).join("");

  const loading = document.querySelector("#percent-profit-ex-10y-loading");
  if (loading) {
    loading.hidden = true;
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
  }
  hidePercentProfitEx10yTooltip();
  drawPercentProfitEx10yChart();
  return true;
};

const loadPercentProfitEx10yMetrics = async () => {
  const cached = readPercentProfitEx10yCache();
  const loading = document.querySelector("#percent-profit-ex-10y-loading");
  if (loading) {
    loading.hidden = percentProfitEx10ySeries.length >= 2 && Boolean(percentProfitEx10ySnapshot);
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
    loading.textContent = getCopy("percentProfitEx10y.loading");
  }
  try {
    const response = await fetch(`${API_BASE}/api/percent-supply-profit-ex-10y?schema=1`, { cache: "no-store", headers: { Accept: "application/json", "Cache-Control": "no-cache" } });
    if (!response.ok) throw new Error(`Percent Supply in Profit Ex >10y API ${response.status}`);
    const payload = await response.json();
    if (!applyPercentProfitEx10yPayload(payload, false)) throw new Error("Percent Supply in Profit Ex >10y payload is empty");
    writeDashboardCache(PERCENT_PROFIT_EX_10Y_CACHE_KEY, payload, "Percent Supply in Profit Ex >10y");
    if (payload.stale) publicDataWarnings.push("percent-supply-profit-ex-10y-stale");
  } catch (error) {
    if (preserveRenderedChart(percentProfitEx10ySeries, percentProfitEx10ySnapshot, ["#percent-profit-ex-10y-loading"], "percent-supply-profit-ex-10y-refresh")) return;
    if (cached && applyPercentProfitEx10yPayload(cached, true)) {
      publicDataWarnings.push("percent-supply-profit-ex-10y-cache");
      return;
    }
    clearDashboardCache(PERCENT_PROFIT_EX_10Y_CACHE_KEY, "Percent Supply in Profit Ex >10y");
    if (loading) {
      loading.hidden = false;
      loading.classList.add("is-error");
      loading.setAttribute("role", "button");
      loading.setAttribute("tabindex", "0");
      loading.textContent = currentLanguage === "zh" ? "有效筹码浮盈比例同步失败，点击重试" : "Active Percent Supply in Profit sync failed. Click to retry.";
    }
    throw error;
  }
};

const readSthMvrvCache = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(STH_MVRV_CACHE_KEY) || "null");
    return cached?.payload || null;
  } catch {
    return null;
  }
};

const applySthMvrvPayload = (payload, cacheFallback = false) => {
  const parseRow = (point) => ({
    date: new Date(`${point.date}T00:00:00Z`),
    price: Number(point.price),
    sth: Number(point.sth),
    mvrv: Number(point.mvrv),
    profitPercent: Number(point.profitPercent)
  });
  const rows = (payload?.series || []).map(parseRow).filter((point) => !Number.isNaN(point.date.getTime())
    && Number.isFinite(point.price) && point.price > 0
    && Number.isFinite(point.sth) && point.sth > 0
    && Number.isFinite(point.mvrv) && point.mvrv > 0);
  const projection = (payload?.projection || []).map((point) => ({
    date: new Date(`${point.date}T00:00:00Z`),
    mvrv: Number(point.mvrv),
    scenario: true
  })).filter((point) => !Number.isNaN(point.date.getTime()) && Number.isFinite(point.mvrv));
  const snapshot = payload?.snapshot;
  if (rows.length < 365 || !snapshot || !Number.isFinite(Number(snapshot.mvrv))) return false;

  sthMvrvSeries = rows;
  sthMvrvProjection = projection;
  sthMvrvSnapshot = snapshot;
  sthMvrvSources = payload.sources || null;
  sthMvrvReferenceCycles = Array.isArray(payload.referenceCycles) ? payload.referenceCycles : [];
  sthMvrvCurrentStructure = payload.currentStructure || null;

  const current = Number(snapshot.mvrv);
  const change = Number(snapshot.sevenDayChange);
  const distance = Number(snapshot.distanceToOnePct);
  const sourceSuffix = payload.stale || cacheFallback ? " · CACHE" : "";
  const signedRatio = (value) => Number.isFinite(Number(value)) ? `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(4)}` : "--";
  const signedPercent = (value) => Number.isFinite(Number(value)) ? `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(2)}%` : "--";
  const stateLabels = currentLanguage === "zh"
    ? {
      capitulation: "深度浮亏 · 去杠杆",
      underwater: "1.0 下方 · 二探观察",
      "double-bottom-reclaimed": "二探完成 · 已收复 1.0",
      recovery: "成本线之上 · 修复",
      profit: "短期浮盈 · 扩张",
      overheated: "短期浮盈拥挤"
    }
    : {
      capitulation: "Deep Loss · Deleveraging",
      underwater: "Below 1.0 · Second-Dip Watch",
      "double-bottom-reclaimed": "Double Bottom Complete · 1.0 Reclaimed",
      recovery: "Above Cost · Recovery",
      profit: "STH Profit · Expansion",
      overheated: "Crowded Short-Term Profits"
    };
  const structure = sthMvrvCurrentStructure;
  const firstValue = Number(structure?.firstDip?.lowMvrv);
  const secondValue = Number(structure?.secondDip?.lowMvrv);
  const signalCopy = currentLanguage === "zh"
    ? `当前 STH-MVRV 为 ${current.toFixed(4)}，较 1.0 盈亏平衡线 ${signedPercent(distance)}，7 日变化 ${signedRatio(change)}。本轮首探低点 ${Number.isFinite(firstValue) ? firstValue.toFixed(4) : "--"}（${structure?.firstDip?.lowDate || "--"}），反弹 ${Number(structure?.rebound?.mvrv || 0).toFixed(4)}，二探低点 ${Number.isFinite(secondValue) ? secondValue.toFixed(4) : "--"}（${structure?.secondDip?.lowDate || "--"}）。${snapshot.doubleBottomComplete ? `已于 ${snapshot.reclaimDate || "--"} 重新站回成本线，当前验证持续性。` : "结构尚未完成，继续观察是否二探并重新收复成本线。"}`
    : `Current STH-MVRV is ${current.toFixed(4)}, ${signedPercent(distance)} from the 1.0 breakeven line, with a seven-day change of ${signedRatio(change)}. This cycle's first low was ${Number.isFinite(firstValue) ? firstValue.toFixed(4) : "--"} (${structure?.firstDip?.lowDate || "--"}), the rebound reached ${Number(structure?.rebound?.mvrv || 0).toFixed(4)}, and the second low was ${Number.isFinite(secondValue) ? secondValue.toFixed(4) : "--"} (${structure?.secondDip?.lowDate || "--"}). ${snapshot.doubleBottomComplete ? `The cost line was reclaimed on ${snapshot.reclaimDate || "--"}; persistence is now being validated.` : "The structure is incomplete; monitor for a second test and reclaim."}`;

  setText("#sth-mvrv-current", current.toFixed(4));
  setText("#sth-mvrv-as-of", `${snapshot.asOf || "--"} · ${current >= 1 ? (currentLanguage === "zh" ? "整体浮盈" : "Aggregate profit") : (currentLanguage === "zh" ? "整体浮亏" : "Aggregate loss")}`);
  setText("#sth-mvrv-price", formatUsd(Number(snapshot.price)));
  setText("#sth-mvrv-price-as-of", `${currentLanguage === "zh" ? "现价时间" : "Spot as of"} · ${String(snapshot.priceAsOf || "--").slice(0, 16).replace("T", " ")}`);
  setText("#sth-mvrv-cost", formatUsd(Number(snapshot.sth)));
  setText("#sth-mvrv-distance", `${currentLanguage === "zh" ? "现价相对成本" : "Price vs cost"} ${signedPercent(distance)}`);
  setText("#sth-mvrv-zone", stateLabels[snapshot.state] || "--");
  setText("#sth-mvrv-reclaim", snapshot.reclaimDate ? `${currentLanguage === "zh" ? "收复" : "Reclaimed"} ${snapshot.reclaimDate} · ${snapshot.daysSinceReclaim ?? 0}D` : (currentLanguage === "zh" ? "等待收复 1.0" : "Waiting for 1.0 reclaim"));
  setText("#sth-mvrv-change", signedRatio(change));
  setText("#sth-mvrv-distance-signal", signedPercent(distance));
  setText("#sth-mvrv-dips", Number.isFinite(firstValue) && Number.isFinite(secondValue) ? `${firstValue.toFixed(3)} / ${secondValue.toFixed(3)}` : "--");
  setText("#sth-mvrv-scenario", projection.length ? `${snapshot.asOf} → ${projection.at(-1).date.toISOString().slice(0, 10)}` : "--");
  setText("#sth-mvrv-source", `${sthMvrvSources?.history || "BGeometrics + Bitbo public history"}${sourceSuffix} · PRICE / STH REALIZED PRICE`);
  setText("#sth-mvrv-signal-title", stateLabels[snapshot.state] || "--");
  setText("#sth-mvrv-signal-copy", signalCopy);

  const signal = document.querySelector("#sth-mvrv-signal");
  if (signal) ["capitulation", "underwater", "double-bottom-reclaimed", "recovery", "profit", "overheated"].forEach((state) => signal.classList.toggle(`is-${state}`, snapshot.state === state));
  const history = document.querySelector("#sth-mvrv-history");
  if (history) {
    const cards = [...sthMvrvReferenceCycles, ...(structure?.firstDip ? [{ ...structure, cycle: currentLanguage === "zh" ? "本轮" : "CURRENT" }] : [])];
    history.innerHTML = cards.map((cycle) => `<div><span>${cycle.cycle} · DOUBLE TEST</span><strong>${Number(cycle.firstDip?.lowMvrv).toFixed(3)} / ${Number(cycle.secondDip?.lowMvrv).toFixed(3)}</strong><em>${cycle.firstDip?.lowDate || "--"} → ${cycle.secondDip?.lowDate || "--"} · REBOUND ${Number(cycle.rebound?.mvrv).toFixed(3)}${cycle.completed ? " · COMPLETE" : " · WATCH"}</em></div>`).join("");
  }

  const loading = document.querySelector("#sth-mvrv-loading");
  if (loading) {
    loading.hidden = true;
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
  }
  hideSthMvrvTooltip();
  drawSthMvrvChart();
  return true;
};

const loadSthMvrvMetrics = async () => {
  const cached = readSthMvrvCache();
  const loading = document.querySelector("#sth-mvrv-loading");
  if (loading) {
    loading.hidden = sthMvrvSeries.length >= 2 && Boolean(sthMvrvSnapshot);
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
    loading.textContent = getCopy("sthMvrv.loading");
  }
  try {
    const response = await fetch(`${API_BASE}/api/sth-mvrv?schema=1`, { cache: "no-store", headers: { Accept: "application/json", "Cache-Control": "no-cache" } });
    if (!response.ok) throw new Error(`STH-MVRV API ${response.status}`);
    const payload = await response.json();
    if (!applySthMvrvPayload(payload, false)) throw new Error("STH-MVRV payload is empty");
    writeDashboardCache(STH_MVRV_CACHE_KEY, payload, "STH-MVRV");
    if (payload.stale) publicDataWarnings.push("sth-mvrv-stale");
  } catch (error) {
    if (preserveRenderedChart(sthMvrvSeries, sthMvrvSnapshot, ["#sth-mvrv-loading"], "sth-mvrv-refresh")) return;
    if (cached && applySthMvrvPayload(cached, true)) {
      publicDataWarnings.push("sth-mvrv-cache");
      return;
    }
    clearDashboardCache(STH_MVRV_CACHE_KEY, "STH-MVRV");
    if (loading) {
      loading.hidden = false;
      loading.classList.add("is-error");
      loading.setAttribute("role", "button");
      loading.setAttribute("tabindex", "0");
      loading.textContent = currentLanguage === "zh" ? "短期持有者 MVRV 同步失败，点击重试" : "Short Term Holder MVRV sync failed. Click to retry.";
    }
    throw error;
  }
};

const readVddCache = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(VDD_CACHE_KEY) || "null");
    if (!cached?.payload) return null;
    return cached.payload;
  } catch {
    return null;
  }
};

const applyVddPayload = (payload, cacheFallback = false) => {
  const rows = (payload?.series || []).map((point) => ({
    date: new Date(`${point.date}T00:00:00Z`),
    price: Number(point.price),
    vdd: Number(point.vdd)
  })).filter((point) => !Number.isNaN(point.date.getTime()) && Number.isFinite(point.price) && point.price > 0 && Number.isFinite(point.vdd) && point.vdd >= 0);
  const snapshot = payload?.snapshot;
  if (rows.length < 365 || !snapshot || !Number.isFinite(Number(snapshot.vdd))) return false;

  vddSeries = rows;
  vddSnapshot = snapshot;
  vddSources = payload.sources || null;
  vddLowZones = Array.isArray(payload.lowZones) ? payload.lowZones : [];

  const vdd = Number(snapshot.vdd);
  const average7 = Number(snapshot.average7);
  const average30 = Number(snapshot.average30);
  const sevenDayChange = Number(snapshot.sevenDayChange);
  const recentLow = Number(snapshot.recentLow);
  const allTimePeak = Number(snapshot.allTimePeak);
  const zoneLabels = currentLanguage === "zh"
    ? { accumulation: "低 VDD 区 · 深度积累", normal: "常态流动区", distribution: "高 VDD 区 · 筹码派发" }
    : { accumulation: "Low VDD · Deep Accumulation", normal: "Normal Activity", distribution: "High VDD · Distribution" };
  const trendLabels = currentLanguage === "zh"
    ? { rising: "回升", falling: "回落", flat: "平稳" }
    : { rising: "Rising", falling: "Falling", flat: "Flat" };
  const sourceSuffix = payload.stale || cacheFallback ? " · CACHE" : "";

  setText("#vdd-current", vdd.toFixed(4));
  setText("#vdd-zone", zoneLabels[snapshot.zone] || zoneLabels.normal);
  setText("#vdd-averages", `${average7.toFixed(2)} / ${average30.toFixed(2)}`);
  setText("#vdd-trend", `${trendLabels[snapshot.trend] || trendLabels.flat} · 7D ${sevenDayChange >= 0 ? "+" : ""}${sevenDayChange.toFixed(3)}`);
  setText("#vdd-recent-low", recentLow.toFixed(4));
  setText("#vdd-recent-low-date", snapshot.recentLowDate || "--");
  setText("#vdd-date", snapshot.asOf || "--");
  setText("#vdd-price", formatUsd(Number(snapshot.price)));
  setText("#vdd-change", `${sevenDayChange >= 0 ? "+" : ""}${sevenDayChange.toFixed(4)} · ${trendLabels[snapshot.trend] || trendLabels.flat}`);
  setText("#vdd-peak", `${allTimePeak.toFixed(2)} · ${snapshot.allTimePeakDate || "--"}`);
  setText("#vdd-as-of", snapshot.asOf || "--");
  setText("#vdd-history-current", vdd.toFixed(4));
  setText("#vdd-history-zone", zoneLabels[snapshot.zone] || zoneLabels.normal);
  setText("#vdd-source", `${vddSources?.history || "BGeometrics public daily API"}${sourceSuffix} · VDD / 365D AVG`);

  const recentZones = vddLowZones.slice(-3);
  const zoneTargets = [
    ["#vdd-low-one", "#vdd-low-one-date"],
    ["#vdd-low-two", "#vdd-low-two-date"],
    ["#vdd-low-current", "#vdd-low-current-date"]
  ];
  zoneTargets.forEach(([valueSelector, dateSelector], index) => {
    const zone = recentZones[index];
    setText(valueSelector, zone ? Number(zone.minVdd).toFixed(3) : "--");
    setText(dateSelector, zone ? `${zone.start} → ${zone.end} · ${zone.days}D` : "--");
  });

  const title = document.querySelector("#vdd-signal-title");
  if (title) {
    title.textContent = zoneLabels[snapshot.zone] || zoneLabels.normal;
    ["accumulation", "normal", "distribution"].forEach((zone) => title.classList.toggle(`is-${zone}`, snapshot.zone === zone));
  }
  const signalCopy = currentLanguage === "zh"
    ? snapshot.zone === "accumulation"
      ? `当前 VDD 为 ${vdd.toFixed(4)}，低于 0.75 积累阈值；7 日均值 ${average7.toFixed(2)}、30 日均值 ${average30.toFixed(2)}。老币花费强度偏低，长期持有者呈现休眠和筹码沉淀特征。`
      : snapshot.zone === "distribution"
        ? `当前 VDD 为 ${vdd.toFixed(4)}，高于 2.90 派发阈值。长期筹码移动显著活跃，应结合价格强度和现货需求观察高位派发风险。`
        : `当前 VDD 为 ${vdd.toFixed(4)}，位于 0.75 至 2.90 的常态流动区；7 日变化为 ${sevenDayChange >= 0 ? "+" : ""}${sevenDayChange.toFixed(3)}。`
    : snapshot.zone === "accumulation"
      ? `VDD is ${vdd.toFixed(4)}, below the 0.75 accumulation threshold. The 7D average is ${average7.toFixed(2)} versus ${average30.toFixed(2)} over 30 days, showing subdued old-coin spending and long-term-holder dormancy.`
      : snapshot.zone === "distribution"
        ? `VDD is ${vdd.toFixed(4)}, above the 2.90 distribution threshold. Old-coin spending is elevated; confirm with price strength and spot demand.`
        : `VDD is ${vdd.toFixed(4)}, inside the 0.75 to 2.90 normal activity zone with a ${sevenDayChange >= 0 ? "+" : ""}${sevenDayChange.toFixed(3)} seven-day change.`;
  setText("#vdd-signal-copy", signalCopy);

  const loading = document.querySelector("#vdd-loading");
  if (loading) {
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
    loading.hidden = true;
  }
  drawVddChart();
  return true;
};

const loadVddMetrics = async () => {
  const cached = readVddCache();
  const loading = document.querySelector("#vdd-loading");
  if (loading) {
    loading.hidden = vddSeries.length >= 2 && Boolean(vddSnapshot);
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
    loading.textContent = getCopy("vdd.loading");
  }
  try {
    const response = await fetch(`${API_BASE}/api/vdd-multiple?schema=1`, {
      cache: "no-store",
      headers: { Accept: "application/json", "Cache-Control": "no-cache" }
    });
    if (!response.ok) throw new Error(`VDD Multiple API ${response.status}`);
    const payload = await response.json();
    if (!applyVddPayload(payload, false)) throw new Error("VDD Multiple payload is empty");
    writeDashboardCache(VDD_CACHE_KEY, payload, "VDD Multiple");
    if (payload.stale) publicDataWarnings.push("vdd-multiple-stale");
  } catch (error) {
    if (preserveRenderedChart(vddSeries, vddSnapshot, ["#vdd-loading"], "vdd-multiple-refresh")) return;
    if (cached && applyVddPayload(cached, true)) {
      publicDataWarnings.push("vdd-multiple-cache");
      return;
    }
    clearDashboardCache(VDD_CACHE_KEY, "VDD Multiple");
    if (loading) {
      loading.hidden = false;
      loading.classList.add("is-error");
      loading.setAttribute("role", "button");
      loading.setAttribute("tabindex", "0");
      loading.textContent = currentLanguage === "zh"
        ? "VDD 数据同步失败，点击重试"
        : "VDD data sync failed. Click to retry.";
    }
    throw error;
  }
};

const readLthNuplCache = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(LTH_NUPL_CACHE_KEY) || "null");
    if (!cached?.payload) return null;
    return cached.payload;
  } catch {
    return null;
  }
};

const applyLthNuplPayload = (payload, cacheFallback = false) => {
  const rows = (payload?.series || []).map((point) => ({
    date: new Date(`${point.date}T00:00:00Z`),
    price: Number(point.price),
    nupl: Number(point.nupl)
  })).filter((point) => !Number.isNaN(point.date.getTime()) && Number.isFinite(point.price) && point.price > 0 && Number.isFinite(point.nupl));
  const snapshot = payload?.snapshot;
  if (rows.length < 365 || !snapshot || !Number.isFinite(Number(snapshot.nupl))) return false;

  lthNuplSeries = rows;
  lthNuplSnapshot = snapshot;
  lthNuplSources = payload.sources || null;
  lthNuplStressZones = Array.isArray(payload.stressZones) ? payload.stressZones : [];
  lthNuplReferencePattern = payload.referencePattern || null;

  const nupl = Number(snapshot.nupl);
  const average7 = Number(snapshot.average7);
  const average30 = Number(snapshot.average30);
  const sevenDayChange = Number(snapshot.sevenDayChange);
  const thirtyDayChange = Number(snapshot.thirtyDayChange);
  const recentLow = Number(snapshot.recentLow);
  const distanceToHope = Number(snapshot.distanceToHope);
  const zoneLabels = currentLanguage === "zh"
    ? { capitulation: "投降区", fear: "恐惧区", hope: "希望区", optimism: "乐观区", euphoria: "狂热区" }
    : { capitulation: "Capitulation", fear: "Fear", hope: "Hope", optimism: "Optimism", euphoria: "Euphoria" };
  const trendLabels = currentLanguage === "zh"
    ? { rising: "上升", falling: "回落", flat: "平稳" }
    : { rising: "Rising", falling: "Falling", flat: "Flat" };
  const sourceSuffix = payload.stale || cacheFallback ? " · CACHE" : "";
  const currentStressDays = Number(snapshot.currentStressDays || 0);

  setText("#lth-nupl-current", nupl.toFixed(4));
  setText("#lth-nupl-zone", zoneLabels[snapshot.zone] || zoneLabels.fear);
  setText("#lth-nupl-averages", `${average7.toFixed(4)} / ${average30.toFixed(4)}`);
  setText("#lth-nupl-trend", `7D ${trendLabels[snapshot.trend7] || trendLabels.flat} · 30D ${trendLabels[snapshot.trend30] || trendLabels.flat}`);
  setText("#lth-nupl-recent-low", recentLow.toFixed(4));
  setText("#lth-nupl-recent-low-date", snapshot.recentLowDate || "--");
  setText("#lth-nupl-stress-days", currentStressDays > 0 ? `${currentStressDays}D` : (currentLanguage === "zh" ? "区外" : "OUTSIDE"));
  setText("#lth-nupl-date", snapshot.asOf || "--");
  setText("#lth-nupl-price", formatUsd(Number(snapshot.price)));
  setText("#lth-nupl-change", `${sevenDayChange >= 0 ? "+" : ""}${sevenDayChange.toFixed(4)} / ${thirtyDayChange >= 0 ? "+" : ""}${thirtyDayChange.toFixed(4)}`);
  setText("#lth-nupl-distance", `${distanceToHope >= 0 ? "+" : ""}${distanceToHope.toFixed(4)}`);
  setText("#lth-nupl-as-of", snapshot.asOf || "--");
  setText("#lth-nupl-history-current", nupl.toFixed(4));
  setText("#lth-nupl-history-zone", zoneLabels[snapshot.zone] || zoneLabels.fear);
  setText("#lth-nupl-projected-date", lthNuplReferencePattern?.projectedCompletion || "2026-09-17");
  setText("#lth-nupl-source", `${lthNuplSources?.history || "BGeometrics public LTH-NUPL"}${sourceSuffix} · PUBLIC PROXY`);

  const recentZones = lthNuplStressZones.slice(-3);
  const zoneTargets = [
    ["#lth-nupl-stress-one", "#lth-nupl-stress-one-date"],
    ["#lth-nupl-stress-two", "#lth-nupl-stress-two-date"],
    ["#lth-nupl-stress-current", "#lth-nupl-stress-current-date"]
  ];
  zoneTargets.forEach(([valueSelector, dateSelector], index) => {
    const zone = recentZones[index];
    setText(valueSelector, zone ? Number(zone.minNupl).toFixed(3) : "--");
    setText(dateSelector, zone ? `${zone.start} → ${zone.end} · ${zone.days}D` : "--");
  });

  const title = document.querySelector("#lth-nupl-signal-title");
  if (title) {
    title.textContent = zoneLabels[snapshot.zone] || zoneLabels.fear;
    ["capitulation", "fear", "hope", "optimism", "euphoria"].forEach((zone) => title.classList.toggle(`is-${zone}`, snapshot.zone === zone));
  }

  const signalCopy = currentLanguage === "zh"
    ? snapshot.zone === "capitulation"
      ? `当前公开代理 LTH-NUPL 为 ${nupl.toFixed(4)}，低于 0，长期持有者整体处于账面浮亏的投降区。7 日变化 ${sevenDayChange >= 0 ? "+" : ""}${sevenDayChange.toFixed(4)}，30 日变化 ${thirtyDayChange >= 0 ? "+" : ""}${thirtyDayChange.toFixed(4)}。`
      : snapshot.zone === "fear"
        ? `当前公开代理 LTH-NUPL 为 ${nupl.toFixed(4)}，位于 0 至 0.25 的恐惧区。7 日均值 ${average7.toFixed(4)}、30 日均值 ${average30.toFixed(4)}；趋势用于判断长期筹码压力是否持续修复。`
        : `当前公开代理 LTH-NUPL 为 ${nupl.toFixed(4)}，处于${zoneLabels[snapshot.zone]}；距离 0.25 希望区边界 ${distanceToHope >= 0 ? "+" : ""}${distanceToHope.toFixed(4)}。`
    : snapshot.zone === "capitulation"
      ? `The public LTH-NUPL proxy is ${nupl.toFixed(4)}, below zero in Capitulation, with a ${sevenDayChange >= 0 ? "+" : ""}${sevenDayChange.toFixed(4)} seven-day and ${thirtyDayChange >= 0 ? "+" : ""}${thirtyDayChange.toFixed(4)} thirty-day change.`
      : snapshot.zone === "fear"
        ? `The public LTH-NUPL proxy is ${nupl.toFixed(4)} in the 0 to 0.25 Fear phase. Its 7D average is ${average7.toFixed(4)} versus ${average30.toFixed(4)} over 30 days; trend direction tracks whether holder stress is repairing.`
        : `The public LTH-NUPL proxy is ${nupl.toFixed(4)} in ${zoneLabels[snapshot.zone]}, ${distanceToHope >= 0 ? "+" : ""}${distanceToHope.toFixed(4)} from the 0.25 Hope boundary.`;
  setText("#lth-nupl-signal-copy", signalCopy);

  const loading = document.querySelector("#lth-nupl-loading");
  if (loading) {
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
    loading.hidden = true;
  }
  drawLthNuplChart();
  return true;
};

const loadLthNuplMetrics = async () => {
  const cached = readLthNuplCache();
  const loading = document.querySelector("#lth-nupl-loading");
  if (loading) {
    loading.hidden = lthNuplSeries.length >= 2 && Boolean(lthNuplSnapshot);
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
    loading.textContent = getCopy("lthNupl.loading");
  }
  try {
    const response = await fetch(`${API_BASE}/api/lth-nupl?schema=1`, {
      cache: "no-store",
      headers: { Accept: "application/json", "Cache-Control": "no-cache" }
    });
    if (!response.ok) throw new Error(`LTH-NUPL API ${response.status}`);
    const payload = await response.json();
    if (!applyLthNuplPayload(payload, false)) throw new Error("LTH-NUPL payload is empty");
    writeDashboardCache(LTH_NUPL_CACHE_KEY, payload, "LTH-NUPL");
    if (payload.stale) publicDataWarnings.push("lth-nupl-stale");
  } catch (error) {
    if (preserveRenderedChart(lthNuplSeries, lthNuplSnapshot, ["#lth-nupl-loading"], "lth-nupl-refresh")) return;
    if (cached && applyLthNuplPayload(cached, true)) {
      publicDataWarnings.push("lth-nupl-cache");
      return;
    }
    clearDashboardCache(LTH_NUPL_CACHE_KEY, "LTH-NUPL");
    if (loading) {
      loading.hidden = false;
      loading.classList.add("is-error");
      loading.setAttribute("role", "button");
      loading.setAttribute("tabindex", "0");
      loading.textContent = currentLanguage === "zh"
        ? "LTH-NUPL 数据同步失败，点击重试"
        : "LTH-NUPL data sync failed. Click to retry.";
    }
    throw error;
  }
};

const readLthSthCache = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(LTH_STH_CACHE_KEY) || "null");
    if (!cached?.payload) return null;
    return cached.payload;
  } catch {
    return null;
  }
};

const buildClientLthSthSnapshot = (rows) => {
  const latest = rows.at(-1);
  if (!latest) return null;
  const average = (days) => {
    const window = rows.slice(-days);
    return window.reduce((sum, row) => sum + row.ratio, 0) / Math.max(window.length, 1);
  };
  const start = rows.at(-Math.min(8, rows.length));
  const dailySlope = (latest.ratio - start.ratio) / Math.max(Math.min(7, rows.length - 1), 1);
  let latestCrossDate = null;
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index - 1].ratio < 0.48 && rows[index].ratio >= 0.48) latestCrossDate = rows[index].date.toISOString().slice(0, 10);
  }
  const daysSinceCross = latestCrossDate
    ? Math.max(0, Math.round((latest.date.getTime() - Date.parse(`${latestCrossDate}T00:00:00Z`)) / 86_400_000))
    : null;
  return {
    price: latest.price,
    priceAsOf: latest.date.toISOString(),
    asOf: latest.date.toISOString().slice(0, 10),
    lth: latest.lth,
    sth: latest.sth,
    ratio: latest.ratio,
    average7: average(7),
    average30: average(30),
    dailySlope,
    projected7d: latest.ratio + dailySlope * 7,
    trend: dailySlope > 0.00015 ? "rising" : dailySlope < -0.00015 ? "falling" : "flat",
    phase: latest.ratio < 0.48 ? "accumulation" : latest.ratio < 0.75 ? "recovery" : latest.ratio < 1 ? "convergence" : "reset",
    threshold: 0.48,
    distanceToThreshold: latest.ratio - 0.48,
    recentPeak: Math.max(...rows.slice(-365).map((row) => row.ratio)),
    latestCrossDate,
    daysSinceCross,
    costGapUsd: latest.sth - latest.lth,
    convergencePercent: latest.ratio * 100
  };
};

const applyLthSthPayload = (payload, cacheFallback = false) => {
  const rows = (payload?.series || []).map((point) => ({
    date: new Date(`${point.date}T00:00:00Z`),
    price: Number(point.price),
    lth: Number(point.lth),
    sth: Number(point.sth),
    ratio: Number(point.ratio)
  })).filter((point) => !Number.isNaN(point.date.getTime())
    && [point.price, point.lth, point.sth, point.ratio].every((value) => Number.isFinite(value) && value > 0));
  if (rows.length < 2) return false;

  lthSthSeries = rows;
  lthSthSnapshot = payload.snapshot || buildClientLthSthSnapshot(rows);
  lthSthSources = payload.sources || null;
  const snapshot = lthSthSnapshot;
  if (!snapshot) return false;

  const ratio = Number(snapshot.ratio);
  const average7 = Number(snapshot.average7);
  const average30 = Number(snapshot.average30);
  const slope = Number(snapshot.dailySlope);
  const recentPeak = Number(snapshot.recentPeak);
  const daysSince = snapshot.daysSinceCross == null ? Number.NaN : Number(snapshot.daysSinceCross);
  const trendLabels = currentLanguage === "zh"
    ? { rising: "上升 · 成本差距收敛", falling: "回落 · 收敛减速", flat: "平稳 · 等待方向" }
    : { rising: "Rising · cost gap narrowing", falling: "Falling · convergence slowing", flat: "Flat · awaiting direction" };
  const phaseLabels = currentLanguage === "zh"
    ? { accumulation: "深度积累区", recovery: "0.48 恢复阶段", convergence: "成本收敛阶段", reset: "长短期成本重置" }
    : { accumulation: "Deep Accumulation", recovery: "0.48 Recovery", convergence: "Cost Convergence", reset: "Holder-Cost Reset" };
  const sourceSuffix = payload.stale || cacheFallback ? " · CACHE" : "";

  setText("#lth-sth-current", ratio.toFixed(4));
  setText("#lth-sth-trend", trendLabels[snapshot.trend] || trendLabels.flat);
  setText("#lth-sth-lth", formatUsd(Number(snapshot.lth)));
  setText("#lth-sth-sth", formatUsd(Number(snapshot.sth)));
  setText("#lth-sth-averages", `${average7.toFixed(4)} / ${average30.toFixed(4)}`);
  setText("#lth-sth-date", `${snapshot.asOf || "--"} · DAILY`);
  setText("#lth-sth-cross-date", snapshot.latestCrossDate || "--");
  setText("#lth-sth-days-since", Number.isFinite(daysSince) ? `${daysSince} ${getCopy("costBasis.days")}` : "--");
  setText("#lth-sth-slope", `${slope >= 0 ? "+" : ""}${slope.toFixed(6)} / ${getCopy("costBasis.days")}`);
  setText("#lth-sth-peak", Number.isFinite(recentPeak) ? recentPeak.toFixed(4) : "--");
  setText("#lth-sth-current-days", Number.isFinite(daysSince) ? daysSince : "--");
  setText("#lth-sth-source", `${lthSthSources?.history || "BGeometrics public daily API"}${sourceSuffix} · DAILY`);

  const title = document.querySelector("#lth-sth-signal-title");
  if (title) {
    title.textContent = phaseLabels[snapshot.phase] || phaseLabels.recovery;
    ["accumulation", "recovery", "convergence", "reset"].forEach((phase) => title.classList.toggle(`is-${phase}`, snapshot.phase === phase));
  }
  const gap = Number(snapshot.costGapUsd);
  const signalCopy = currentLanguage === "zh"
    ? `当前比率 ${ratio.toFixed(4)}，LTH 成本 ${formatUsd(Number(snapshot.lth))}，STH 成本 ${formatUsd(Number(snapshot.sth))}，两者相差 ${formatUsd(Math.abs(gap))}。7 日均值 ${average7.toFixed(4)}，30 日均值 ${average30.toFixed(4)}，当前趋势为${trendLabels[snapshot.trend] || trendLabels.flat}。`
    : `The ratio is ${ratio.toFixed(4)} with LTH cost at ${formatUsd(Number(snapshot.lth))} and STH cost at ${formatUsd(Number(snapshot.sth))}, a ${formatUsd(Math.abs(gap))} gap. The 7D average is ${average7.toFixed(4)} versus ${average30.toFixed(4)} for 30D.`;
  setText("#lth-sth-signal-copy", signalCopy);

  const currentElement = document.querySelector("#lth-sth-current");
  currentElement?.classList.toggle("positive", snapshot.trend === "rising");
  currentElement?.classList.toggle("negative", snapshot.phase === "accumulation");
  const loading = document.querySelector("#lth-sth-loading");
  if (loading) {
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
    loading.hidden = true;
  }
  drawLthSthChart();
  return true;
};

const loadLthSthMetrics = async () => {
  const cached = readLthSthCache();
  const loading = document.querySelector("#lth-sth-loading");
  if (loading) {
    loading.hidden = lthSthSeries.length >= 2 && Boolean(lthSthSnapshot);
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
    loading.textContent = getCopy("lthSth.loading");
  }
  try {
    const request = (cacheBust = false) => fetch(
      `${API_BASE}/api/lth-sth-ratio?schema=2${cacheBust ? `&refresh=${Date.now()}` : ""}`,
      {
        cache: "no-store",
        headers: { Accept: "application/json", "Cache-Control": "no-cache" }
      }
    );
    let response = await request(false);
    if (response.status === 304) response = await request(true);
    if (!response.ok) throw new Error(`LTH/STH ratio API ${response.status}`);
    const responseText = await response.text();
    if (!responseText.trim()) throw new Error("LTH/STH ratio API returned an empty response");
    const payload = JSON.parse(responseText);
    if (!applyLthSthPayload(payload, false)) throw new Error("LTH/STH ratio payload is empty");
    writeDashboardCache(LTH_STH_CACHE_KEY, payload, "LTH/STH ratio");
    if (payload.stale) publicDataWarnings.push("lth-sth-ratio-stale");
  } catch (error) {
    if (preserveRenderedChart(lthSthSeries, lthSthSnapshot, ["#lth-sth-loading"], "lth-sth-ratio-refresh")) return;
    let restored = false;
    try {
      restored = Boolean(cached && applyLthSthPayload(cached, true));
    } catch {
      restored = false;
    }
    if (restored) {
      publicDataWarnings.push("lth-sth-ratio-cache");
      return;
    }
    clearDashboardCache(LTH_STH_CACHE_KEY, "LTH/STH ratio");
    if (loading) {
      loading.hidden = false;
      loading.classList.add("is-error");
      loading.setAttribute("role", "button");
      loading.setAttribute("tabindex", "0");
      loading.textContent = currentLanguage === "zh"
        ? "LTH/STH 数据同步失败，点击重试"
        : "LTH/STH sync failed. Click to retry.";
    }
    throw error;
  }
};

const readLthLossCache = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(LTH_LOSS_CACHE_KEY) || "null");
    if (!cached?.payload) return null;
    return cached.payload;
  } catch {
    return null;
  }
};

const buildClientLthLossSnapshot = (rows) => {
  const latest = rows.at(-1);
  if (!latest) return null;
  const average = (count) => {
    const selected = rows.slice(-count);
    return selected.reduce((sum, row) => sum + row.ratio, 0) / Math.max(selected.length, 1);
  };
  const sevenDayStart = rows.at(-Math.min(8, rows.length));
  const dailyChange = (latest.ratio - sevenDayStart.ratio) / Math.max(Math.min(7, rows.length - 1), 1);
  return {
    price: latest.price,
    priceAsOf: latest.date.toISOString(),
    asOf: latest.date.toISOString().slice(0, 10),
    ratio: latest.ratio,
    average7: average(7),
    average30: average(30),
    dailyChange,
    trend: dailyChange > 0.02 ? "rising" : dailyChange < -0.02 ? "falling" : "flat",
    phase: latest.ratio >= 27 ? "capitulation" : latest.ratio >= 15 ? "stressed" : latest.ratio >= 8 ? "elevated" : "normal",
    threshold: 27,
    distanceToThreshold: latest.ratio - 27,
    historicalPeak: Math.max(...rows.map((row) => row.ratio)),
    projected7d: Math.max(0, latest.ratio + dailyChange * 7)
  };
};

const applyLthLossPayload = (payload, cacheFallback = false) => {
  const rows = (payload?.series || []).map((point) => ({
    date: new Date(`${point.date}T00:00:00Z`),
    price: Number(point.price),
    ratio: Number(point.ratio)
  })).filter((point) => !Number.isNaN(point.date.getTime())
    && Number.isFinite(point.price) && point.price > 0
    && Number.isFinite(point.ratio) && point.ratio >= 0);
  if (rows.length < 2) return false;

  lthLossSeries = rows;
  lthLossSnapshot = payload.snapshot || buildClientLthLossSnapshot(rows);
  lthLossSources = payload.sources || null;
  const snapshot = lthLossSnapshot;
  if (!snapshot) return false;

  const ratio = Number(snapshot.ratio);
  const average7 = Number(snapshot.average7);
  const average30 = Number(snapshot.average30);
  const dailyChange = Number(snapshot.dailyChange);
  const distance = Number(snapshot.distanceToThreshold);
  const peak = Number(snapshot.historicalPeak);
  const trendLabels = currentLanguage === "zh"
    ? { rising: "上升 · 亏损扩散", falling: "回落 · 压力缓解", flat: "平稳 · 等待方向" }
    : { rising: "Rising · losses spreading", falling: "Falling · pressure easing", flat: "Flat · awaiting direction" };
  const phaseLabels = currentLanguage === "zh"
    ? { normal: "低位观察", elevated: "高架状态", stressed: "高压区", capitulation: "历史投降区" }
    : { normal: "Low Stress", elevated: "Elevated", stressed: "High Stress", capitulation: "Capitulation Zone" };
  const thresholdStatus = ratio >= 27
    ? (currentLanguage === "zh" ? "已触及 27%" : "27% reached")
    : (currentLanguage === "zh" ? `尚差 ${Math.abs(distance).toFixed(1)}%` : `${Math.abs(distance).toFixed(1)}% below`);
  const sourceSuffix = payload.stale || cacheFallback ? " · CACHE" : "";

  setText("#lth-loss-current", `${ratio.toFixed(1)}%`);
  setText("#lth-loss-trend", trendLabels[snapshot.trend] || trendLabels.flat);
  setText("#lth-loss-distance", `${distance >= 0 ? "+" : ""}${distance.toFixed(1)}%`);
  setText("#lth-loss-phase", phaseLabels[snapshot.phase] || phaseLabels.elevated);
  setText("#lth-loss-averages", `${average7.toFixed(1)}% / ${average30.toFixed(1)}%`);
  setText("#lth-loss-date", `${snapshot.asOf || "--"} · DAILY`);
  setText("#lth-loss-peak", Number.isFinite(peak) ? `${peak.toFixed(1)}%` : "--");
  setText("#lth-loss-change", `${dailyChange >= 0 ? "+" : ""}${dailyChange.toFixed(3)}% / ${getCopy("costBasis.days")}`);
  setText("#lth-loss-threshold-status", thresholdStatus);
  setText("#lth-loss-price", formatUsd(Number(snapshot.price)));
  setText("#lth-loss-current-cycle", `${Math.abs(distance).toFixed(1)}%`);
  setText("#lth-loss-source", `${lthLossSources?.history || "BGeometrics public daily API"}${sourceSuffix} · DAILY`);

  const title = document.querySelector("#lth-loss-signal-title");
  if (title) {
    title.textContent = phaseLabels[snapshot.phase] || phaseLabels.elevated;
    ["normal", "elevated", "stressed", "capitulation"].forEach((phase) => title.classList.toggle(`is-${phase}`, snapshot.phase === phase));
  }
  const signalCopy = currentLanguage === "zh"
    ? `当前长期持有者亏损市值占比为 ${ratio.toFixed(1)}%，距离 27% 历史投降阈值 ${Math.abs(distance).toFixed(1)} 个百分点。7 日均值 ${average7.toFixed(1)}%，30 日均值 ${average30.toFixed(1)}%，短期趋势为${trendLabels[snapshot.trend] || trendLabels.flat}。`
    : `LTH market cap in loss is ${ratio.toFixed(1)}%, ${Math.abs(distance).toFixed(1)} percentage points from the historical 27% capitulation threshold. The 7D average is ${average7.toFixed(1)}% versus ${average30.toFixed(1)}% for 30D.`;
  setText("#lth-loss-signal-copy", signalCopy);

  const currentElement = document.querySelector("#lth-loss-current");
  currentElement?.classList.toggle("is-rising", snapshot.trend === "rising");
  currentElement?.classList.toggle("negative", snapshot.phase === "capitulation");
  const loading = document.querySelector("#lth-loss-loading");
  if (loading) {
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
    loading.hidden = true;
  }
  drawLthLossChart();
  return true;
};

const loadLthLossMetrics = async () => {
  const cached = readLthLossCache();
  const loading = document.querySelector("#lth-loss-loading");
  if (loading) {
    loading.hidden = lthLossSeries.length >= 2 && Boolean(lthLossSnapshot);
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
    loading.textContent = getCopy("lthLoss.loading");
  }
  try {
    const request = (cacheBust = false) => fetch(
      `${API_BASE}/api/lth-market-cap-loss?schema=6${cacheBust ? `&refresh=${Date.now()}` : ""}`,
      { cache: "no-store", headers: { Accept: "application/json", "Cache-Control": "no-cache" } }
    );
    let response = await request(false);
    if (response.status === 304) response = await request(true);
    if (!response.ok) throw new Error(`LTH market cap in loss API ${response.status}`);
    const responseText = await response.text();
    if (!responseText.trim()) throw new Error("LTH market cap in loss API returned an empty response");
    const payload = JSON.parse(responseText);
    if (!applyLthLossPayload(payload, false)) throw new Error("LTH market cap in loss payload is empty");
    writeDashboardCache(LTH_LOSS_CACHE_KEY, payload, "LTH market cap in loss");
    if (payload.stale) publicDataWarnings.push("lth-market-cap-loss-stale");
  } catch (error) {
    if (preserveRenderedChart(lthLossSeries, lthLossSnapshot, ["#lth-loss-loading"], "lth-market-cap-loss-refresh")) return;
    let restored = false;
    try {
      restored = Boolean(cached && applyLthLossPayload(cached, true));
    } catch {
      restored = false;
    }
    if (restored) {
      publicDataWarnings.push("lth-market-cap-loss-cache");
      return;
    }
    clearDashboardCache(LTH_LOSS_CACHE_KEY, "LTH market cap in loss");
    if (loading) {
      loading.hidden = false;
      loading.classList.add("is-error");
      loading.setAttribute("role", "button");
      loading.setAttribute("tabindex", "0");
      loading.textContent = currentLanguage === "zh"
        ? "LTH 亏损市值数据同步失败，点击重试"
        : "LTH market-cap-in-loss sync failed. Click to retry.";
    }
    throw error;
  }
};

const readSupplyProfitLossCache = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(SUPPLY_PROFIT_LOSS_CACHE_KEY) || "null");
    if (!cached?.payload) return null;
    return cached.payload;
  } catch {
    return null;
  }
};

const buildClientSupplyProfitLossSnapshot = (rows) => {
  const latest = rows.at(-1);
  if (!latest) return null;
  const average = (count) => {
    const selected = rows.slice(-count);
    return selected.reduce((sum, row) => sum + row.ratio, 0) / Math.max(selected.length, 1);
  };
  const sevenDayStart = rows.at(-Math.min(8, rows.length));
  const dailyChange = (latest.ratio - sevenDayStart.ratio) / Math.max(Math.min(7, rows.length - 1), 1);
  const profitShare = latest.ratio / (1 + latest.ratio) * 100;
  const daysBelowIndex = [...rows].reverse().findIndex((row) => row.ratio >= 1);
  return {
    price: latest.price,
    priceAsOf: latest.date.toISOString(),
    asOf: latest.date.toISOString().slice(0, 10),
    ratio: latest.ratio,
    rawRatio: latest.ratioRaw,
    average7: average(7),
    average30: average(30),
    dailyChange,
    trend: dailyChange > 0.01 ? "rising" : dailyChange < -0.01 ? "falling" : "flat",
    phase: latest.ratio < 1 ? "bottom" : latest.ratio < 2 ? "recovery" : latest.ratio < 4 ? "balanced" : "healthy",
    threshold: 1,
    distanceToThreshold: latest.ratio - 1,
    profitShare,
    lossShare: 100 - profitShare,
    activeProfitSupply: latest.activeProfitSupply,
    lossSupply: latest.lossSupply,
    dormantOverSeven: latest.dormantOverSeven,
    daysBelowOne: daysBelowIndex < 0 ? rows.length : daysBelowIndex
  };
};

const applySupplyProfitLossPayload = (payload, cacheFallback = false) => {
  const rows = (payload?.series || []).map((point) => ({
    date: new Date(`${point.date}T00:00:00Z`),
    price: Number(point.price),
    ratio: Number(point.ratio),
    ratioRaw: Number(point.ratioRaw),
    activeProfitSupply: Number(point.activeProfitSupply),
    lossSupply: Number(point.lossSupply),
    dormantOverSeven: Number(point.dormantOverSeven)
  })).filter((point) => !Number.isNaN(point.date.getTime())
    && Number.isFinite(point.price) && point.price > 0
    && Number.isFinite(point.ratio) && point.ratio > 0);
  if (rows.length < 2) return false;

  supplyProfitLossSeries = rows;
  supplyProfitLossSnapshot = payload.snapshot || buildClientSupplyProfitLossSnapshot(rows);
  supplyProfitLossSources = payload.sources || null;
  const snapshot = supplyProfitLossSnapshot;
  if (!snapshot) return false;

  const ratio = Number(snapshot.ratio);
  const average7 = Number(snapshot.average7);
  const average30 = Number(snapshot.average30);
  const dailyChange = Number(snapshot.dailyChange);
  const distance = Number(snapshot.distanceToThreshold);
  const profitShare = Number(snapshot.profitShare);
  const lossShare = Number(snapshot.lossShare);
  const daysBelowOne = Number(snapshot.daysBelowOne);
  const trendLabels = currentLanguage === "zh"
    ? { rising: "上升 · 盈利扩张", falling: "下降 · 压力增加", flat: "平稳 · 等待方向" }
    : { rising: "Rising · profit expanding", falling: "Falling · pressure building", flat: "Flat · awaiting direction" };
  const phaseLabels = currentLanguage === "zh"
    ? { bottom: "熊市底部区", recovery: "修复区", balanced: "均衡区", healthy: "盈利主导" }
    : { bottom: "Bear Bottom Zone", recovery: "Recovery Zone", balanced: "Balanced", healthy: "Profit Dominant" };
  const sourceSuffix = payload.stale || cacheFallback ? " · CACHE" : "";
  const distribution = Number.isFinite(profitShare) && Number.isFinite(lossShare)
    ? `${profitShare.toFixed(1)}% / ${lossShare.toFixed(1)}%`
    : "-- / --";

  setText("#supply-pl-current", ratio.toFixed(2));
  setText("#supply-pl-trend", trendLabels[snapshot.trend] || trendLabels.flat);
  setText("#supply-pl-distribution", distribution);
  setText("#supply-pl-averages", `${average7.toFixed(2)} / ${average30.toFixed(2)}`);
  setText("#supply-pl-date", `${snapshot.asOf || "--"} · 7D MA`);
  setText("#supply-pl-price", formatUsd(Number(snapshot.price)));
  setText("#supply-pl-phase", phaseLabels[snapshot.phase] || phaseLabels.balanced);
  setText("#supply-pl-analysis-trend", trendLabels[snapshot.trend] || trendLabels.flat);
  setText("#supply-pl-distance", `${distance >= 0 ? "+" : ""}${distance.toFixed(2)}`);
  setText("#supply-pl-days-below", `${Math.max(0, daysBelowOne)} ${getCopy("costBasis.days")}`);
  setText("#supply-pl-as-of", snapshot.asOf || "--");
  setText("#supply-pl-current-days", Math.max(0, daysBelowOne));
  setText("#supply-pl-source", `${supplyProfitLossSources?.history || "BGeometrics public daily API"}${sourceSuffix} · PUBLIC PROXY · 7D MA`);

  const title = document.querySelector("#supply-pl-signal-title");
  if (title) {
    title.textContent = phaseLabels[snapshot.phase] || phaseLabels.balanced;
    ["bottom", "recovery", "balanced", "healthy"].forEach((phase) => title.classList.toggle(`is-${phase}`, snapshot.phase === phase));
  }
  const currentElement = document.querySelector("#supply-pl-current");
  currentElement?.classList.toggle("is-bottom", snapshot.phase === "bottom");
  const signalCopy = currentLanguage === "zh"
    ? `当前 7 日移动平均比率为 ${ratio.toFixed(2)}，活跃供应中约 ${profitShare.toFixed(1)}% 处于盈利、${lossShare.toFixed(1)}% 处于亏损。7 日均值 ${average7.toFixed(2)}，30 日均值 ${average30.toFixed(2)}；比率${distance < 0 ? "已低于" : "仍高于"} 1.0 阈值 ${Math.abs(distance).toFixed(2)}。`
    : `The current 7D moving-average ratio is ${ratio.toFixed(2)}. About ${profitShare.toFixed(1)}% of active supply is in profit versus ${lossShare.toFixed(1)}% in loss. The ratio is ${Math.abs(distance).toFixed(2)} ${distance < 0 ? "below" : "above"} the 1.0 threshold.`;
  setText("#supply-pl-signal-copy", signalCopy);

  const loading = document.querySelector("#supply-pl-loading");
  if (loading) {
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
    loading.hidden = true;
  }
  drawSupplyProfitLossChart();
  return true;
};

const loadSupplyProfitLossMetrics = async () => {
  const cached = readSupplyProfitLossCache();
  const loading = document.querySelector("#supply-pl-loading");
  if (loading) {
    loading.hidden = supplyProfitLossSeries.length >= 2 && Boolean(supplyProfitLossSnapshot);
    loading.classList.remove("is-error");
    loading.removeAttribute("role");
    loading.removeAttribute("tabindex");
    loading.textContent = getCopy("supplyPl.loading");
  }
  try {
    const request = (cacheBust = false) => fetch(
      `${API_BASE}/api/supply-profit-loss-ratio?schema=1${cacheBust ? `&refresh=${Date.now()}` : ""}`,
      { cache: "no-store", headers: { Accept: "application/json", "Cache-Control": "no-cache" } }
    );
    let response = await request(false);
    if (response.status === 304) response = await request(true);
    if (!response.ok) throw new Error(`Supply profit/loss ratio API ${response.status}`);
    const responseText = await response.text();
    if (!responseText.trim()) throw new Error("Supply profit/loss ratio API returned an empty response");
    const payload = JSON.parse(responseText);
    if (!applySupplyProfitLossPayload(payload, false)) throw new Error("Supply profit/loss ratio payload is empty");
    writeDashboardCache(SUPPLY_PROFIT_LOSS_CACHE_KEY, payload, "Supply profit/loss ratio");
    if (payload.stale) publicDataWarnings.push("supply-profit-loss-ratio-stale");
  } catch (error) {
    if (preserveRenderedChart(supplyProfitLossSeries, supplyProfitLossSnapshot, ["#supply-pl-loading"], "supply-profit-loss-ratio-refresh")) return;
    let restored = false;
    try {
      restored = Boolean(cached && applySupplyProfitLossPayload(cached, true));
    } catch {
      restored = false;
    }
    if (restored) {
      publicDataWarnings.push("supply-profit-loss-ratio-cache");
      return;
    }
    clearDashboardCache(SUPPLY_PROFIT_LOSS_CACHE_KEY, "Supply profit/loss ratio");
    if (loading) {
      loading.hidden = false;
      loading.classList.add("is-error");
      loading.setAttribute("role", "button");
      loading.setAttribute("tabindex", "0");
      loading.textContent = currentLanguage === "zh"
        ? "活跃盈亏供应比同步失败，点击重试"
        : "Active supply profit/loss sync failed. Click to retry.";
    }
    throw error;
  }
};

const readExtendedCache = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(EXTENDED_CACHE_KEY) || "null");
    if (!cached?.payload) return null;
    return cached.payload;
  } catch {
    return null;
  }
};

const mergeExtendedWithCache = (livePayload, cachedPayload) => {
  if (!cachedPayload) return livePayload;
  const cachedMetrics = Object.fromEntries(
    Object.entries(cachedPayload.metrics || {}).map(([key, metric]) => [key, { ...metric, stale: true }])
  );
  const liveMetrics = livePayload?.metrics || {};
  return {
    ...cachedPayload,
    ...livePayload,
    partial: Boolean(livePayload?.partial || Object.keys(liveMetrics).length < 11),
    metrics: { ...cachedMetrics, ...liveMetrics }
  };
};

const metricCadenceLabel = (cadence) => {
  const labels = currentLanguage === "zh"
    ? { realtime: "实时", daily: "日频", "rolling-24h": "滚动 24H" }
    : { realtime: "LIVE", daily: "DAILY", "rolling-24h": "ROLLING 24H" };
  return labels[cadence] || String(cadence || "LIVE").toUpperCase();
};

const applyExtendedPayload = (payload, cacheFallback = false) => {
  const metrics = payload?.metrics || {};
  const sourceLabel = (metric) => {
    const stale = metric?.stale || cacheFallback ? " · CACHE" : "";
    return `${metric?.source || "Data source"}${stale} · ${metricCadenceLabel(metric?.cadence)}`;
  };
  const update = (key, valueSelector, sourceSelector, formatter) => {
    const metric = metrics[key];
    const numeric = Number(metric?.value);
    if (!metric || !Number.isFinite(numeric)) return false;
    setText(valueSelector, formatter(numeric));
    if (sourceSelector) setText(sourceSelector, sourceLabel(metric));
    return true;
  };

  update("balancedPrice", "#balanced-price", "#balanced-source", formatUsd);
  update("mvrvZ", "#mvrv-z-value", "#mvrv-z-source", (value) => value.toFixed(3));
  if (update("nupl", "#nupl-value", "#nupl-source", (value) => value.toFixed(3))) {
    metricSnapshot.nupl = Number(metrics.nupl.value);
  }
  if (update("sopr", "#sopr-value", "#sopr-source", (value) => value.toFixed(4))) {
    metricSnapshot.sopr = Number(metrics.sopr.value);
  }
  if (update("puell", "#puell-value", "#puell-source", (value) => value.toFixed(3))) {
    metricSnapshot.puell = Number(metrics.puell.value);
  }
  update("profitSupply", "#profit-supply-value", "#profit-supply-source", (value) => `${value.toFixed(1)}%`);

  if (update("funding", "#funding-value", "#funding-source", (value) => `${value.toFixed(4)}%`)) {
    const value = Number(metrics.funding.value);
    metricSnapshot.funding = value;
    const state = Math.abs(value) < 0.01 ? getCopy("neutral") : value > 0 ? getCopy("warm") : getCopy("pressureLow");
    setText("#radar-funding", state);
    updateSignalLight("#radar-funding", Math.abs(value) > 0.03 ? "hot" : Math.abs(value) > 0.01 ? "warm" : "normal");
  }
  update("openInterest", "#oi-value", "#oi-source", compactUsd);
  update("optionsOi", "#options-oi-value", "#options-oi-source", compactUsd);
  update("etfFlow", "#etf-flow-value", "#etf-flow-source", compactUsd);
  update("liquidation", "#liquidation-value", "#liquidation-source", compactUsd);

  updateCycleRadar();
};

const loadExtendedMetrics = async () => {
  const cached = readExtendedCache();
  try {
    const response = await fetch(`${API_BASE}/api/market-metrics`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Extended metrics API ${response.status}`);
    const livePayload = await response.json();
    const payload = mergeExtendedWithCache(livePayload, cached);
    applyExtendedPayload(payload, false);
    writeDashboardCache(EXTENDED_CACHE_KEY, payload, "Extended metrics");
    if (payload.partial || payload.stale) publicDataWarnings.push("extended-partial");
  } catch (error) {
    if (!cached) throw error;
    applyExtendedPayload(cached, true);
    publicDataWarnings.push("extended-cache");
  }
};

const loadHalving = async () => {
  const response = await fetch("https://mempool.space/api/blocks/tip/height");
  if (!response.ok) throw new Error(`mempool height ${response.status}`);
  const height = Number(await response.text());
  const target = 1050000;
  const previous = 840000;
  const blocksLeft = Math.max(target - height, 0);
  const daysLeft = Math.ceil((blocksLeft * 10) / 60 / 24);
  const eta = new Date(Date.now() + blocksLeft * 10 * 60 * 1000);
  const progress = Math.max(0, Math.min(100, ((height - previous) / (target - previous)) * 100));
  metricSnapshot.halvingDays = daysLeft;
  setText("#halving-days", `${formatNumber(daysLeft)} ${getCopy("days")}`);
  setText("#halving-block", `${formatNumber(blocksLeft)} ${getCopy("blocks")} · mempool.space`);
  setText("#current-height", formatNumber(height));
  setText("#network-height", formatNumber(height));
  setText("#blocks-left", formatNumber(blocksLeft));
  setText("#halving-eta", `${formatDateTime(eta)} CST`);
  setText("#halving-progress-label", `${progress.toFixed(2)}%`);
  setText("#radar-halving", `${formatNumber(daysLeft)} ${getCopy("days")}`);
  const bar = document.querySelector("#halving-progress");
  if (bar) bar.style.width = `${progress}%`;
};

const loadNetwork = async () => {
  const results = await Promise.allSettled([
    fetchJson("https://mempool.space/api/v1/mining/hashrate/3d"),
    fetchJson("https://mempool.space/api/v1/fees/recommended"),
    fetchJson("https://mempool.space/api/v1/difficulty-adjustment")
  ]);
  const mining = results[0].status === "fulfilled" ? results[0].value : null;
  const fee = results[1].status === "fulfilled" ? results[1].value : null;
  const adjustment = results[2].status === "fulfilled" ? results[2].value : null;
  const hashrate = Number(mining?.currentHashrate || mining?.hashrates?.at(-1)?.avgHashrate);
  const difficulty = Number(mining?.currentDifficulty || mining?.difficulty?.at(-1)?.difficulty);
  if (Number.isFinite(hashrate)) setText("#hashrate-value", `${(hashrate / 1e18).toFixed(0)} EH/s`);
  if (Number.isFinite(difficulty)) setText("#difficulty-value", compactNumber(difficulty));
  if (Number.isFinite(fee?.halfHourFee)) setText("#fee-value", fee.halfHourFee);
  if (Number.isFinite(adjustment?.difficultyChange)) {
    const sign = adjustment.difficultyChange >= 0 ? "+" : "";
    setText("#difficulty-adjustment", `${sign}${adjustment.difficultyChange.toFixed(2)}%`);
  }
  if (results.some((result) => result.status === "rejected")) publicDataWarnings.push("network");
};

const renderReferences = () => {
  if (!referenceGrid) return;
  referenceGrid.innerHTML = metricReferences[currentLanguage]
    .map(([title, text], index) => `<article class="reference-card"><span>${String(index + 1).padStart(2, "0")}</span><h3>${title}</h3><p>${text}</p></article>`)
    .join("");
};

const downloadFile = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const saveCostBasisSnapshot = () => {
  const canvas = document.querySelector("#cost-basis-chart");
  if (!canvas || !costBasisSeries.length) return;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const context = exportCanvas.getContext("2d");
  context.fillStyle = getComputedStyle(document.body).getPropertyValue("--paper").trim() || "#0a0d0c";
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  context.drawImage(canvas, 0, 0);
  exportCanvas.toBlob((blob) => {
    if (blob) downloadFile(blob, `welinkbtc-cost-basis-${new Date().toISOString().slice(0, 10)}.png`);
  }, "image/png", 1);
};

const saveSthRatioSnapshot = () => {
  const canvas = document.querySelector("#sth-ratio-chart");
  if (!canvas || !costBasisSeries.length) return;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const context = exportCanvas.getContext("2d");
  context.fillStyle = getComputedStyle(document.body).getPropertyValue("--paper").trim() || "#0a0d0c";
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  context.drawImage(canvas, 0, 0);
  exportCanvas.toBlob((blob) => {
    if (blob) downloadFile(blob, `welinkbtc-sth-rp-tmmp-ratio-${new Date().toISOString().slice(0, 10)}.png`);
  }, "image/png", 1);
};

const saveLthRealizedSnapshot = () => {
  const canvas = document.querySelector("#lth-rp-chart");
  if (!canvas || !lthRealizedSeries.length) return;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const context = exportCanvas.getContext("2d");
  context.fillStyle = getComputedStyle(document.body).getPropertyValue("--paper").trim() || "#0a0d0c";
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  context.drawImage(canvas, 0, 0);
  exportCanvas.toBlob((blob) => {
    if (blob) downloadFile(blob, `welinkbtc-lth-realized-price-${new Date().toISOString().slice(0, 10)}.png`);
  }, "image/png", 1);
};

const saveRealizedProfitLossSnapshot = () => {
  const canvas = document.querySelector("#rpl-chart");
  if (!canvas || !realizedProfitLossSeries.length) return;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const context = exportCanvas.getContext("2d");
  context.fillStyle = getComputedStyle(document.body).getPropertyValue("--paper").trim() || "#0a0d0c";
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  context.drawImage(canvas, 0, 0);
  exportCanvas.toBlob((blob) => {
    if (blob) downloadFile(blob, `welinkbtc-realized-profit-loss-${new Date().toISOString().slice(0, 10)}.png`);
  }, "image/png", 1);
};

const saveMedianRealizedSnapshot = () => {
  const canvas = document.querySelector("#median-rp-chart");
  if (!canvas || !medianRealizedSeries.length) return;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const context = exportCanvas.getContext("2d");
  context.fillStyle = getComputedStyle(document.body).getPropertyValue("--paper").trim() || "#0a0d0c";
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  context.drawImage(canvas, 0, 0);
  exportCanvas.toBlob((blob) => {
    if (blob) downloadFile(blob, `welinkbtc-median-realized-price-${new Date().toISOString().slice(0, 10)}.png`);
  }, "image/png", 1);
};

const saveLthSthSnapshot = () => {
  const canvas = document.querySelector("#lth-sth-chart");
  if (!canvas || !lthSthSeries.length) return;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const context = exportCanvas.getContext("2d");
  context.fillStyle = getComputedStyle(document.body).getPropertyValue("--paper").trim() || "#0a0d0c";
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  context.drawImage(canvas, 0, 0);
  exportCanvas.toBlob((blob) => {
    if (blob) downloadFile(blob, `welinkbtc-lth-sth-cost-basis-ratio-${new Date().toISOString().slice(0, 10)}.png`);
  }, "image/png", 1);
};

const saveLthLossSnapshot = () => {
  const canvas = document.querySelector("#lth-loss-chart");
  if (!canvas || !lthLossSeries.length) return;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const context = exportCanvas.getContext("2d");
  context.fillStyle = getComputedStyle(document.body).getPropertyValue("--paper").trim() || "#0a0d0c";
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  context.drawImage(canvas, 0, 0);
  exportCanvas.toBlob((blob) => {
    if (blob) downloadFile(blob, `welinkbtc-lth-market-cap-in-loss-${new Date().toISOString().slice(0, 10)}.png`);
  }, "image/png", 1);
};

const saveSupplyProfitLossSnapshot = () => {
  const canvas = document.querySelector("#supply-pl-chart");
  if (!canvas || !supplyProfitLossSeries.length) return;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const context = exportCanvas.getContext("2d");
  context.fillStyle = getComputedStyle(document.body).getPropertyValue("--paper").trim() || "#0a0d0c";
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  context.drawImage(canvas, 0, 0);
  exportCanvas.toBlob((blob) => {
    if (blob) downloadFile(blob, `welinkbtc-supply-profit-loss-ratio-${new Date().toISOString().slice(0, 10)}.png`);
  }, "image/png", 1);
};

const saveMedianMvrvSnapshot = () => {
  const canvas = document.querySelector("#median-mvrv-chart");
  if (!canvas || !medianMvrvSeries.length) return;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const context = exportCanvas.getContext("2d");
  context.fillStyle = getComputedStyle(document.body).getPropertyValue("--paper").trim() || "#0a0d0c";
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  context.drawImage(canvas, 0, 0);
  exportCanvas.toBlob((blob) => {
    if (blob) downloadFile(blob, `welinkbtc-median-mvrv-${new Date().toISOString().slice(0, 10)}.png`);
  }, "image/png", 1);
};

const saveMvrvBandsSnapshot = () => {
  const canvas = document.querySelector("#mvrv-bands-chart");
  if (!canvas || !mvrvBandsSeries.length) return;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const context = exportCanvas.getContext("2d");
  context.fillStyle = getComputedStyle(document.body).getPropertyValue("--paper").trim() || "#0a0d0c";
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  context.drawImage(canvas, 0, 0);
  exportCanvas.toBlob((blob) => {
    if (blob) downloadFile(blob, `welinkbtc-std-adjusted-mvrv-bands-${new Date().toISOString().slice(0, 10)}.png`);
  }, "image/png", 1);
};

const saveMvrvPriceBandsSnapshot = () => {
  const canvas = document.querySelector("#mvrv-price-bands-chart");
  if (!canvas || !mvrvPriceBandsSeries.length) return;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const context = exportCanvas.getContext("2d");
  context.fillStyle = getComputedStyle(document.body).getPropertyValue("--paper").trim() || "#0a0d0c";
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  context.drawImage(canvas, 0, 0);
  exportCanvas.toBlob((blob) => {
    if (blob) downloadFile(blob, `welinkbtc-std-adjusted-mvrv-price-bands-${new Date().toISOString().slice(0, 10)}.png`);
  }, "image/png", 1);
};

const saveStockToFlowSnapshot = () => {
  const canvas = document.querySelector("#stock-to-flow-chart");
  if (!canvas || !stockToFlowSeries.length) return;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const context = exportCanvas.getContext("2d");
  context.fillStyle = getComputedStyle(document.body).getPropertyValue("--paper").trim() || "#0a0d0c";
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  context.drawImage(canvas, 0, 0);
  exportCanvas.toBlob((blob) => {
    if (blob) downloadFile(blob, `welinkbtc-stock-to-flow-${new Date().toISOString().slice(0, 10)}.png`);
  }, "image/png", 1);
};

const saveCycleTimingSnapshot = () => {
  const canvas = document.querySelector("#cycle-timing-chart");
  if (!canvas || !cycleTimingSeries.length) return;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const context = exportCanvas.getContext("2d");
  context.fillStyle = getComputedStyle(document.body).getPropertyValue("--paper").trim() || "#0a0d0c";
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  context.drawImage(canvas, 0, 0);
  exportCanvas.toBlob((blob) => {
    if (blob) downloadFile(blob, `welinkbtc-cycle-timing-${cycleTimingMode}-${new Date().toISOString().slice(0, 10)}.png`);
  }, "image/png", 1);
};

const saveRhodlSnapshot = () => {
  const canvas = document.querySelector("#rhodl-chart");
  if (!canvas || !rhodlSeries.length) return;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const context = exportCanvas.getContext("2d");
  context.fillStyle = getComputedStyle(document.body).getPropertyValue("--paper").trim() || "#0a0d0c";
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  context.drawImage(canvas, 0, 0);
  exportCanvas.toBlob((blob) => {
    if (blob) downloadFile(blob, `welinkbtc-realized-hodl-ratio-${new Date().toISOString().slice(0, 10)}.png`);
  }, "image/png", 1);
};

const saveLthRplSnapshot = () => {
  const canvas = document.querySelector("#lth-rpl-chart");
  if (!canvas || !lthRplSeries.length) return;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const context = exportCanvas.getContext("2d");
  context.fillStyle = getComputedStyle(document.body).getPropertyValue("--paper").trim() || "#0a0d0c";
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  context.drawImage(canvas, 0, 0);
  exportCanvas.toBlob((blob) => {
    if (blob) downloadFile(blob, `welinkbtc-lth-realized-profit-loss-${new Date().toISOString().slice(0, 10)}.png`);
  }, "image/png", 1);
};

const saveSlrvSnapshot = () => {
  const canvas = document.querySelector("#slrv-chart");
  if (!canvas || !slrvSeries.length) return;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const context = exportCanvas.getContext("2d");
  context.fillStyle = getComputedStyle(document.body).getPropertyValue("--paper").trim() || "#0a0d0c";
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  context.drawImage(canvas, 0, 0);
  exportCanvas.toBlob((blob) => {
    if (blob) downloadFile(blob, `welinkbtc-slrv-ratio-${new Date().toISOString().slice(0, 10)}.png`);
  }, "image/png", 1);
};

const saveRealizedCapHodlSnapshot = () => {
  const canvas = document.querySelector("#realized-cap-hodl-chart");
  if (!canvas || !realizedCapHodlSeries.length) return;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const context = exportCanvas.getContext("2d");
  context.fillStyle = getComputedStyle(document.body).getPropertyValue("--paper").trim() || "#0a0d0c";
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  context.drawImage(canvas, 0, 0);
  exportCanvas.toBlob((blob) => {
    if (blob) downloadFile(blob, `welinkbtc-realized-cap-hodl-waves-${new Date().toISOString().slice(0, 10)}.png`);
  }, "image/png", 1);
};

const saveLthSpentSnapshot = () => {
  const canvas = document.querySelector("#lth-spent-chart");
  if (!canvas || !lthSpentSeries.length) return;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const context = exportCanvas.getContext("2d");
  context.fillStyle = getComputedStyle(document.body).getPropertyValue("--paper").trim() || "#0a0d0c";
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  context.drawImage(canvas, 0, 0);
  exportCanvas.toBlob((blob) => {
    if (blob) downloadFile(blob, `welinkbtc-lth-spent-price-${new Date().toISOString().slice(0, 10)}.png`);
  }, "image/png", 1);
};

const savePercentProfitSnapshot = () => {
  const canvas = document.querySelector("#percent-profit-chart");
  if (!canvas || !percentProfitSeries.length) return;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const context = exportCanvas.getContext("2d");
  context.fillStyle = getComputedStyle(document.body).getPropertyValue("--paper").trim() || "#0a0d0c";
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  context.drawImage(canvas, 0, 0);
  exportCanvas.toBlob((blob) => {
    if (blob) downloadFile(blob, `welinkbtc-percent-supply-profit-${new Date().toISOString().slice(0, 10)}.png`);
  }, "image/png", 1);
};

const saveLthExchangeLossSnapshot = () => {
  const canvas = document.querySelector("#lth-exchange-loss-chart");
  if (!canvas || !lthExchangeLossSeries.length) return;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const context = exportCanvas.getContext("2d");
  context.fillStyle = getComputedStyle(document.body).getPropertyValue("--paper").trim() || "#0a0d0c";
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  context.drawImage(canvas, 0, 0);
  exportCanvas.toBlob((blob) => {
    if (blob) downloadFile(blob, `welinkbtc-lth-exchange-loss-proxy-${new Date().toISOString().slice(0, 10)}.png`);
  }, "image/png", 1);
};

const saveTwoWeekRsiSnapshot = () => {
  const canvas = document.querySelector("#two-week-rsi-chart");
  if (!canvas || !twoWeekRsiSeries.length) return;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const context = exportCanvas.getContext("2d");
  context.fillStyle = getComputedStyle(document.body).getPropertyValue("--paper").trim() || "#0a0d0c";
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  context.drawImage(canvas, 0, 0);
  exportCanvas.toBlob((blob) => {
    if (blob) downloadFile(blob, `welinkbtc-two-week-rsi-${new Date().toISOString().slice(0, 10)}.png`);
  }, "image/png", 1);
};

const saveUnder3mHodlSnapshot = () => {
  const canvas = document.querySelector("#under-3m-hodl-chart");
  if (!canvas || !under3mHodlSeries.length) return;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const context = exportCanvas.getContext("2d");
  context.fillStyle = getComputedStyle(document.body).getPropertyValue("--paper").trim() || "#0a0d0c";
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  context.drawImage(canvas, 0, 0);
  exportCanvas.toBlob((blob) => {
    if (blob) downloadFile(blob, `welinkbtc-under-3m-realized-cap-hodl-waves-${new Date().toISOString().slice(0, 10)}.png`);
  }, "image/png", 1);
};

const saveSth200dmaSnapshot = () => {
  const canvas = document.querySelector("#sth-200dma-chart");
  if (!canvas || !sth200dmaSeries.length) return;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const context = exportCanvas.getContext("2d");
  context.fillStyle = getComputedStyle(document.body).getPropertyValue("--paper").trim() || "#0a0d0c";
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  context.drawImage(canvas, 0, 0);
  exportCanvas.toBlob((blob) => {
    if (blob) downloadFile(blob, `welinkbtc-sth-200dma-${new Date().toISOString().slice(0, 10)}.png`);
  }, "image/png", 1);
};

const saveVddMedianSnapshot = () => {
  const canvas = document.querySelector("#vdd-median-chart");
  if (!canvas || !vddMedianSeries.length) return;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const context = exportCanvas.getContext("2d");
  context.fillStyle = getComputedStyle(document.body).getPropertyValue("--paper").trim() || "#0a0d0c";
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  context.drawImage(canvas, 0, 0);
  exportCanvas.toBlob((blob) => {
    if (blob) downloadFile(blob, `welinkbtc-vdd-median-cycle-${new Date().toISOString().slice(0, 10)}.png`);
  }, "image/png", 1);
};

const saveSsrSnapshot = () => {
  const canvas = document.querySelector("#ssr-chart");
  if (!canvas || !ssrSeries.length) return;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const context = exportCanvas.getContext("2d");
  context.fillStyle = getComputedStyle(document.body).getPropertyValue("--paper").trim() || "#0a0d0c";
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  context.drawImage(canvas, 0, 0);
  exportCanvas.toBlob((blob) => {
    if (blob) downloadFile(blob, `welinkbtc-stablecoin-supply-ratio-${new Date().toISOString().slice(0, 10)}.png`);
  }, "image/png", 1);
};

const saveSthBandsSnapshot = () => {
  const canvas = document.querySelector("#sth-bands-chart");
  if (!canvas || !sthBandsSeries.length) return;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const context = exportCanvas.getContext("2d");
  context.fillStyle = getComputedStyle(document.body).getPropertyValue("--paper").trim() || "#0a0d0c";
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  context.drawImage(canvas, 0, 0);
  exportCanvas.toBlob((blob) => {
    if (blob) downloadFile(blob, `welinkbtc-sth-cost-basis-bands-${new Date().toISOString().slice(0, 10)}.png`);
  }, "image/png", 1);
};

const savePercentProfitEx10ySnapshot = () => {
  const canvas = document.querySelector("#percent-profit-ex-10y-chart");
  if (!canvas || !percentProfitEx10ySeries.length) return;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const context = exportCanvas.getContext("2d");
  context.fillStyle = getComputedStyle(document.body).getPropertyValue("--paper").trim() || "#0a0d0c";
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  context.drawImage(canvas, 0, 0);
  exportCanvas.toBlob((blob) => {
    if (blob) downloadFile(blob, `welinkbtc-percent-supply-profit-ex-10y-${new Date().toISOString().slice(0, 10)}.png`);
  }, "image/png", 1);
};

const saveSthMvrvSnapshot = () => {
  const canvas = document.querySelector("#sth-mvrv-chart");
  if (!canvas || !sthMvrvSeries.length) return;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const context = exportCanvas.getContext("2d");
  context.fillStyle = getComputedStyle(document.body).getPropertyValue("--paper").trim() || "#0a0d0c";
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  context.drawImage(canvas, 0, 0);
  exportCanvas.toBlob((blob) => {
    if (blob) downloadFile(blob, `welinkbtc-sth-mvrv-${new Date().toISOString().slice(0, 10)}.png`);
  }, "image/png", 1);
};

const saveVddSnapshot = () => {
  const canvas = document.querySelector("#vdd-chart");
  if (!canvas || !vddSeries.length) return;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const context = exportCanvas.getContext("2d");
  context.fillStyle = getComputedStyle(document.body).getPropertyValue("--paper").trim() || "#0a0d0c";
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  context.drawImage(canvas, 0, 0);
  exportCanvas.toBlob((blob) => {
    if (blob) downloadFile(blob, `welinkbtc-value-days-destroyed-multiple-${new Date().toISOString().slice(0, 10)}.png`);
  }, "image/png", 1);
};

const saveLthNuplSnapshot = () => {
  const canvas = document.querySelector("#lth-nupl-chart");
  if (!canvas || !lthNuplSeries.length) return;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const context = exportCanvas.getContext("2d");
  context.fillStyle = getComputedStyle(document.body).getPropertyValue("--paper").trim() || "#0a0d0c";
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  context.drawImage(canvas, 0, 0);
  exportCanvas.toBlob((blob) => {
    if (blob) downloadFile(blob, `welinkbtc-entity-adjusted-lth-nupl-${new Date().toISOString().slice(0, 10)}.png`);
  }, "image/png", 1);
};

const downloadCostBasisCsv = () => {
  const series = getCostBasisVisibleSeries();
  if (!series.length) return;
  const header = "date,btc_price_usd,sth_cost_basis_usd,true_market_mean_usd,sth_tmmp_gap_usd";
  const lines = series.map((point) => [
    point.date.toISOString().slice(0, 10),
    point.price,
    point.sth,
    point.tmmp,
    point.sth - point.tmmp
  ].join(","));
  downloadFile(new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" }), `welinkbtc-cost-basis-${costBasisRange}.csv`);
};

const downloadSthRatioCsv = () => {
  const series = getSthRatioVisibleSeries();
  if (!series.length) return;
  const header = "date,btc_price_usd,sth_realized_price_usd,true_market_mean_usd,sth_rp_tmmp_ratio";
  const lines = series.map((point) => [
    point.date.toISOString().slice(0, 10),
    point.price,
    point.sth,
    point.tmmp,
    point.ratio
  ].join(","));
  downloadFile(new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" }), `welinkbtc-sth-rp-tmmp-ratio-${sthRatioRange}.csv`);
};

const downloadLthRealizedCsv = () => {
  const series = getLthRealizedVisibleSeries();
  if (!series.length) return;
  const header = "date,btc_price_usd,rp_0_10y_usd,rp_6m_5y_usd,rp_6m_7y_usd,rp_6m_10y_usd";
  const lines = series.map((point) => [
    point.date.toISOString().slice(0, 10),
    point.price,
    point.rp0to10y,
    point.rp6m5y,
    point.rp6m7y,
    point.rp6m10y
  ].join(","));
  downloadFile(new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" }), `welinkbtc-lth-realized-price-${lthRealizedRange}.csv`);
};

const downloadRealizedProfitLossCsv = () => {
  const series = getRealizedProfitLossVisibleSeries();
  if (!series.length) return;
  const header = "date,btc_price_usd,realized_profit_365d_sma_usd,realized_loss_365d_sma_usd,realized_profit_loss_ratio";
  const lines = series.map((point) => [
    point.date.toISOString().slice(0, 10),
    point.price,
    Number.isFinite(point.profit365SmaUsd) ? point.profit365SmaUsd : "",
    Number.isFinite(point.loss365SmaUsd) ? point.loss365SmaUsd : "",
    point.ratio
  ].join(","));
  downloadFile(new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" }), `welinkbtc-realized-profit-loss-${realizedProfitLossRange}.csv`);
};

const downloadMedianRealizedCsv = () => {
  const series = getMedianRealizedVisibleSeries();
  if (!series.length) return;
  const header = "date,btc_price_usd,median_realized_price_usd,price_median_ratio";
  const lines = series.map((point) => [
    point.date.toISOString().slice(0, 10),
    point.price,
    Number.isFinite(point.median) ? point.median : "",
    Number.isFinite(point.median) ? point.price / point.median : ""
  ].join(","));
  downloadFile(new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" }), `welinkbtc-median-realized-price-${medianRealizedRange}.csv`);
};

const downloadLthSthCsv = () => {
  const series = getLthSthVisibleSeries();
  if (!series.length) return;
  const header = "date,btc_price_usd,lth_realized_price_usd,sth_realized_price_usd,lth_sth_cost_basis_ratio";
  const lines = series.map((point) => [
    point.date.toISOString().slice(0, 10),
    point.price,
    point.lth,
    point.sth,
    point.ratio
  ].join(","));
  downloadFile(new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" }), `welinkbtc-lth-sth-cost-basis-ratio-${lthSthRange}.csv`);
};

const downloadLthLossCsv = () => {
  const series = getLthLossVisibleSeries();
  if (!series.length) return;
  const header = "date,btc_price_usd,lth_market_cap_in_loss_percent,distance_to_27_percent";
  const lines = series.map((point) => [
    point.date.toISOString().slice(0, 10),
    point.price,
    point.ratio,
    point.ratio - 27
  ].join(","));
  downloadFile(new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" }), `welinkbtc-lth-market-cap-in-loss-${lthLossRange}.csv`);
};

const downloadSupplyProfitLossCsv = () => {
  const series = getSupplyProfitLossVisibleSeries();
  if (!series.length) return;
  const header = "date,btc_price_usd,profit_loss_ratio_7d_ma,profit_loss_ratio_raw,active_profit_supply_btc,loss_supply_btc,dormant_over_7y_btc";
  const lines = series.map((point) => [
    point.date.toISOString().slice(0, 10),
    point.price,
    point.ratio,
    Number.isFinite(point.ratioRaw) ? point.ratioRaw : "",
    Number.isFinite(point.activeProfitSupply) ? point.activeProfitSupply : "",
    Number.isFinite(point.lossSupply) ? point.lossSupply : "",
    Number.isFinite(point.dormantOverSeven) ? point.dormantOverSeven : ""
  ].join(","));
  downloadFile(new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" }), `welinkbtc-supply-profit-loss-ratio-${supplyProfitLossRange}.csv`);
};

const downloadMedianMvrvCsv = () => {
  const series = getMedianMvrvVisibleSeries();
  if (!series.length) return;
  const header = "date,btc_price_usd,median_realized_price_usd,median_mvrv,verified_median_snapshot";
  const lines = series.map((point) => [
    point.date.toISOString().slice(0, 10),
    point.price,
    point.median,
    point.ratio,
    point.verified ? "true" : "false"
  ].join(","));
  downloadFile(new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" }), `welinkbtc-median-mvrv-${medianMvrvRange}.csv`);
};

const downloadMvrvBandsCsv = () => {
  const series = getMvrvBandsVisibleSeries();
  if (!series.length) return;
  const header = "date,btc_price_usd,mvrv,z_score,minus_1_sigma,minus_0_5_sigma,rolling_4y_mean,plus_0_5_sigma,plus_1_sigma,rolling_std";
  const lines = series.map((point) => [
    point.date.toISOString().slice(0, 10),
    point.price,
    point.mvrv,
    Number.isFinite(point.zscore) ? point.zscore : "",
    Number.isFinite(point.minusOne) ? point.minusOne : "",
    Number.isFinite(point.minusHalf) ? point.minusHalf : "",
    Number.isFinite(point.mean) ? point.mean : "",
    Number.isFinite(point.plusHalf) ? point.plusHalf : "",
    Number.isFinite(point.plusOne) ? point.plusOne : "",
    Number.isFinite(point.std) ? point.std : ""
  ].join(","));
  downloadFile(new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" }), `welinkbtc-std-adjusted-mvrv-bands-${mvrvBandsRange}.csv`);
};

const downloadMvrvPriceBandsCsv = () => {
  const series = getMvrvPriceBandsVisibleSeries();
  if (!series.length) return;
  const header = "date,btc_price_usd,realized_price_usd,current_mvrv,minus_1_sigma_usd,minus_0_5_sigma_usd,mean_usd,plus_1_sigma_usd,plus_2_sigma_usd";
  const lines = series.map((point) => [
    point.date.toISOString().slice(0, 10),
    point.price,
    point.realizedPrice,
    point.mvrv,
    Number.isFinite(point.priceMinusOne) ? point.priceMinusOne : "",
    Number.isFinite(point.priceMinusHalf) ? point.priceMinusHalf : "",
    Number.isFinite(point.priceMean) ? point.priceMean : "",
    Number.isFinite(point.pricePlusOne) ? point.pricePlusOne : "",
    Number.isFinite(point.pricePlusTwo) ? point.pricePlusTwo : ""
  ].join(","));
  downloadFile(new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" }), `welinkbtc-std-adjusted-mvrv-price-bands-${mvrvPriceBandsRange}.csv`);
};

const downloadStockToFlowCsv = () => {
  const series = getStockToFlowVisibleSeries();
  if (!series.length) return;
  const header = "date,btc_price_usd,circulating_supply_btc,block_subsidy_btc,annualized_flow_btc,stock_to_flow,model_price_usd,minus_2_sigma_usd,minus_1_sigma_usd,plus_1_sigma_usd,plus_2_sigma_usd,log_deviation,sigma_deviation";
  const lines = series.map((point) => [
    point.date.toISOString().slice(0, 10),
    point.price,
    point.supply,
    point.subsidy,
    point.annualFlow,
    point.stockToFlow,
    point.modelPrice,
    point.minusTwo,
    point.minusOne,
    point.plusOne,
    point.plusTwo,
    point.logDeviation,
    point.sigmaDeviation
  ].join(","));
  downloadFile(new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" }), `welinkbtc-stock-to-flow-${stockToFlowRange}.csv`);
};

const downloadCycleTimingCsv = () => {
  const series = getCycleTimingVisibleSeries();
  const mode = getActiveCycleTimingMode();
  if (!series.length || !mode) return;
  const futureNodes = Object.fromEntries((cycleTimingFutureCycle?.nodes || []).map((node) => [node.id, node]));
  const header = "date,btc_price_usd,cycle_mode,projected_window,model_days,next_halving,next_bull_top_primary,next_bull_top_window_end,next_bear_bottom_primary,next_bear_bottom_window_end";
  const lines = series.map((point) => [
    point.date.toISOString().slice(0, 10),
    point.price,
    cycleTimingMode,
    mode.projection.projectedDate,
    mode.projection.days,
    futureNodes["next-halving"]?.date || "",
    futureNodes["next-bull-top"]?.date || "",
    futureNodes["next-bull-top"]?.windowEnd || "",
    futureNodes["next-bear-bottom"]?.date || "",
    futureNodes["next-bear-bottom"]?.windowEnd || ""
  ].join(","));
  downloadFile(new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" }), `welinkbtc-cycle-timing-${cycleTimingMode}-${cycleTimingRange}.csv`);
};

const downloadRhodlCsv = () => {
  const series = getRhodlVisibleSeries();
  if (!series.length) return;
  const header = "date,btc_price_usd,rhodl_ratio,rhodl_30d_ma";
  const lines = series.map((point) => [
    point.date.toISOString().slice(0, 10),
    point.price,
    point.rhodl,
    Number.isFinite(point.rhodl1m) ? point.rhodl1m : ""
  ].join(","));
  downloadFile(new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" }), `welinkbtc-rhodl-ratio-${rhodlRange}.csv`);
};

const downloadLthRplCsv = () => {
  const series = getLthRplVisibleSeries();
  if (!series.length) return;
  const header = "date,btc_price_usd,lth_profit_loss_ratio_7d,lth_profit_loss_ratio_raw,lth_profit_loss_ratio_30d,underwater,public_methodology";
  const lines = series.map((point) => [
    point.date.toISOString().slice(0, 10),
    point.price,
    point.ratio,
    point.rawRatio,
    point.average30,
    point.ratio < 1,
    "utxo_age_over_155d_public_proxy"
  ].join(","));
  downloadFile(new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" }), `welinkbtc-lth-realized-profit-loss-${lthRplRange}.csv`);
};

const downloadSlrvCsv = () => {
  const series = getSlrvVisibleSeries();
  if (!series.length) return;
  const header = "date,btc_price_usd,slrv_7d_ma,slrv_raw,slrv_30d_ma,bottom_zone,source";
  const lines = series.map((point) => [
    point.date.toISOString().slice(0, 10),
    point.price,
    point.slrv,
    point.rawRatio,
    point.average30,
    point.slrv < 0.05,
    point.source
  ].join(","));
  downloadFile(new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" }), `welinkbtc-slrv-ratio-${slrvRange}.csv`);
};

const downloadRealizedCapHodlCsv = () => {
  const series = getRealizedCapHodlVisibleSeries();
  if (!series.length) return;
  const header = "date,btc_price_usd,over_3m_share,age_3m_6m,age_6m_1y,age_1y_2y,age_2y_3y,age_3y_4y,age_4y_plus,average_7d,average_30d,source";
  const lines = series.map((point) => [
    point.date.toISOString().slice(0, 10), point.price, point.overThreeMonths,
    point.threeToSix, point.sixToTwelve, point.oneToTwo, point.twoToThree,
    point.threeToFour, point.fourPlus, point.average7, point.average30, point.source
  ].join(","));
  downloadFile(new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" }), `welinkbtc-realized-cap-hodl-waves-${realizedCapHodlRange}.csv`);
};

const downloadLthSpentCsv = () => {
  const series = getLthSpentVisibleSeries();
  if (!series.length) return;
  const header = "date,btc_price_usd,lth_spent_price_usd,lth_spent_price_7d_usd,lth_sopr,underwater,source";
  const lines = series.map((point) => [
    point.date.toISOString().slice(0, 10),
    point.price,
    Number.isFinite(point.spentPrice) ? point.spentPrice : "",
    Number.isFinite(point.spentAverage7) ? point.spentAverage7 : "",
    Number.isFinite(point.lthSopr) ? point.lthSopr : "",
    point.underwater === null ? "" : point.underwater,
    point.source
  ].join(","));
  downloadFile(new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" }), `welinkbtc-lth-spent-price-${lthSpentRange}.csv`);
};

const downloadPercentProfitCsv = () => {
  const series = getPercentProfitVisibleSeries();
  if (!series.length) return;
  const header = "date,btc_price_usd,percent_supply_in_profit,supply_in_profit_btc,supply_in_loss_btc,total_supply_btc";
  const lines = series.map((point) => [
    point.date.toISOString().slice(0, 10),
    point.price,
    point.percent,
    point.profitSupply,
    point.lossSupply,
    point.totalSupply
  ].join(","));
  downloadFile(new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" }), `welinkbtc-percent-supply-profit-${percentProfitRange}.csv`);
};

const downloadLthExchangeLossCsv = () => {
  const series = getLthExchangeLossVisibleSeries();
  if (!series.length) return;
  const header = "date,btc_price_usd,lth_loss_share_proxy_30d_percent,lth_loss_share_raw_percent,lth_realized_loss_usd,lth_realized_profit_usd,sth_realized_loss_usd,sth_realized_profit_usd,data_methodology";
  const lines = series.map((point) => [
    point.date.toISOString().slice(0, 10),
    point.price,
    point.percent,
    point.rawPercent,
    point.lthLossUsd,
    point.lthProfitUsd,
    point.sthLossUsd,
    point.sthProfitUsd,
    "public_all_chain_proxy_not_exchange_labelled"
  ].join(","));
  downloadFile(new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" }), `welinkbtc-lth-exchange-loss-proxy-${lthExchangeLossRange}.csv`);
};

const downloadTwoWeekRsiCsv = () => {
  const series = getTwoWeekRsiVisibleSeries();
  if (!series.length) return;
  const header = "date,btc_price_usd,two_week_rsi,lower_channel,upper_channel,distance_to_lower";
  const lines = series.map((point) => [
    point.date.toISOString().slice(0, 10),
    point.price,
    point.rsi,
    point.lower,
    point.upper,
    point.rsi - point.lower
  ].join(","));
  downloadFile(new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" }), `welinkbtc-two-week-rsi-${twoWeekRsiRange}.csv`);
};

const downloadUnder3mHodlCsv = () => {
  const series = getUnder3mHodlVisibleSeries();
  if (!series.length) return;
  const header = "date,btc_price_usd,under_3m_realized_cap_share,seven_day_average,thirty_day_average,source";
  const lines = series.map((point) => [
    point.date.toISOString().slice(0, 10),
    point.price,
    point.underThreeMonths,
    point.average7,
    point.average30,
    "public_realized_cap_hodl_waves_complement"
  ].join(","));
  downloadFile(new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" }), `welinkbtc-under-3m-realized-cap-hodl-waves-${under3mHodlRange}.csv`);
};

const downloadSth200dmaCsv = () => {
  const series = getSth200dmaVisibleSeries();
  if (!series.length) return;
  const header = "date,btc_price_usd,sth_realized_price_usd,btc_200dma_usd,spread_usd,spread_percent";
  const lines = series.map((point) => [
    point.date.toISOString().slice(0, 10),
    point.price,
    point.sth,
    point.dma200,
    point.spread,
    point.spreadPercent
  ].join(","));
  downloadFile(new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" }), `welinkbtc-sth-200dma-${sth200dmaRange}.csv`);
};

const downloadVddMedianCsv = () => {
  const series = getVddMedianVisibleSeries();
  if (!series.length) return;
  const header = "date,btc_price_usd,median_price_usd,vdd_multiple,btc_to_median,bottom_signal,top_signal,median_estimated";
  const lines = series.map((point) => [
    point.date.toISOString().slice(0, 10),
    point.price,
    point.median,
    point.vdd,
    point.medianRatio,
    point.bottomSignal,
    point.topSignal,
    point.medianEstimated
  ].join(","));
  downloadFile(new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" }), `welinkbtc-vdd-median-cycle-${vddMedianRange}.csv`);
};

const downloadSsrCsv = () => {
  const series = getSsrVisibleSeries();
  if (!series.length) return;
  const header = "date,btc_price_usd,btc_market_cap_usd,stablecoin_market_cap_usd,ssr,bb_200_mean,bb_200_upper_2sd,bb_200_lower_2sd,above_upper,stablecoin_source";
  const lines = series.map((point) => [
    point.date.toISOString().slice(0, 10),
    point.price,
    point.btcMarketCap,
    point.stablecoinMarketCap,
    point.ssr,
    Number.isFinite(point.mean) ? point.mean : "",
    Number.isFinite(point.upper) ? point.upper : "",
    Number.isFinite(point.lower) ? point.lower : "",
    point.aboveUpper,
    point.stablecoinSource
  ].join(","));
  downloadFile(new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" }), `welinkbtc-stablecoin-supply-ratio-${ssrRange}.csv`);
};

const downloadSthBandsCsv = () => {
  const series = getSthBandsVisibleSeries();
  if (!series.length) return;
  const header = "date,btc_price_usd,sth_cost_basis_usd,rolling_4y_sigma_usd,line1_minus_2sd,line2_minus_1_5sd,line3_minus_1sd,line4_minus_0_5sd,line5_mean,line6_plus_0_5sd,line7_plus_1sd,line8_plus_1_5sd,line9_plus_2sd,observations";
  const lines = series.map((point) => [
    point.date.toISOString().slice(0, 10),
    point.price,
    point.sth,
    point.sigma,
    ...Array.from({ length: 9 }, (_, index) => point[`line${index + 1}`]),
    point.observations
  ].join(","));
  downloadFile(new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" }), `welinkbtc-sth-cost-basis-bands-${sthBandsRange}.csv`);
};

const downloadPercentProfitEx10yCsv = () => {
  const series = getPercentProfitEx10yVisibleSeries();
  if (!series.length) return;
  const header = "date,btc_price_usd,active_percent_supply_in_profit_raw,active_percent_supply_in_profit_7dma,dormant_over_10y_btc,dormant_over_10y_share,active_supply_btc,active_profit_supply_btc,loss_supply_btc";
  const lines = series.map((point) => [
    point.date.toISOString().slice(0, 10),
    point.price,
    point.percentRaw,
    point.percent7,
    point.dormantOver10y,
    point.dormantShare,
    point.activeSupply,
    point.activeProfitSupply,
    point.lossSupply
  ].join(","));
  downloadFile(new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" }), `welinkbtc-percent-supply-profit-ex-10y-${percentProfitEx10yRange}.csv`);
};

const downloadSthMvrvCsv = () => {
  const series = getSthMvrvVisibleSeries();
  if (!series.length) return;
  const header = "date,btc_price_usd,sth_realized_price_usd,sth_mvrv,sth_unrealized_profit_percent";
  const lines = series.map((point) => [
    point.date.toISOString().slice(0, 10),
    point.price,
    point.sth,
    point.mvrv,
    point.profitPercent
  ].join(","));
  downloadFile(new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" }), `welinkbtc-sth-mvrv-${sthMvrvRange}.csv`);
};

const downloadVddCsv = () => {
  const series = getVddVisibleSeries();
  if (!series.length) return;
  const header = "date,btc_price_usd,vdd_multiple,zone";
  const lines = series.map((point) => [
    point.date.toISOString().slice(0, 10),
    point.price,
    point.vdd,
    point.vdd < 0.75 ? "accumulation" : point.vdd > 2.9 ? "distribution" : "normal"
  ].join(","));
  downloadFile(new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" }), `welinkbtc-vdd-multiple-${vddRange}.csv`);
};

const downloadLthNuplCsv = () => {
  const series = getLthNuplVisibleSeries();
  if (!series.length) return;
  const header = "date,btc_price_usd,lth_nupl,market_phase,data_methodology";
  const lines = series.map((point) => [
    point.date.toISOString().slice(0, 10),
    point.price,
    point.nupl,
    lthNuplZoneFor(point.nupl),
    "public_utxo_age_proxy"
  ].join(","));
  downloadFile(new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" }), `welinkbtc-lth-nupl-${lthNuplRange}.csv`);
};

const toggleCostBasisFullscreen = async () => {
  const panel = document.querySelector("#cost-basis-panel");
  if (!panel) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (panel.requestFullscreen) await panel.requestFullscreen();
    else panel.classList.toggle("is-expanded");
  } catch {
    panel.classList.toggle("is-expanded");
  }
  window.setTimeout(() => {
    hideCostBasisTooltip();
    drawCostBasisChart();
  }, 80);
};

const toggleSthRatioFullscreen = async () => {
  const panel = document.querySelector("#sth-ratio-panel");
  if (!panel) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (panel.requestFullscreen) await panel.requestFullscreen();
    else panel.classList.toggle("is-expanded");
  } catch {
    panel.classList.toggle("is-expanded");
  }
  window.setTimeout(() => {
    hideSthRatioTooltip();
    drawSthRatioChart();
  }, 80);
};

const toggleLthRealizedFullscreen = async () => {
  const panel = document.querySelector("#lth-rp-panel");
  if (!panel) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (panel.requestFullscreen) await panel.requestFullscreen();
    else panel.classList.toggle("is-expanded");
  } catch {
    panel.classList.toggle("is-expanded");
  }
  window.setTimeout(() => {
    hideLthRealizedTooltip();
    drawLthRealizedChart();
  }, 80);
};

const toggleRealizedProfitLossFullscreen = async () => {
  const panel = document.querySelector("#rpl-panel");
  if (!panel) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (panel.requestFullscreen) await panel.requestFullscreen();
    else panel.classList.toggle("is-expanded");
  } catch {
    panel.classList.toggle("is-expanded");
  }
  window.setTimeout(() => {
    hideRealizedProfitLossTooltip();
    drawRealizedProfitLossChart();
  }, 80);
};

const toggleMedianRealizedFullscreen = async () => {
  const panel = document.querySelector("#median-rp-panel");
  if (!panel) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (panel.requestFullscreen) await panel.requestFullscreen();
    else panel.classList.toggle("is-expanded");
  } catch {
    panel.classList.toggle("is-expanded");
  }
  window.setTimeout(() => {
    hideMedianRealizedTooltip();
    drawMedianRealizedChart();
  }, 80);
};

const toggleLthSthFullscreen = async () => {
  const panel = document.querySelector("#lth-sth-panel");
  if (!panel) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (panel.requestFullscreen) await panel.requestFullscreen();
    else panel.classList.toggle("is-expanded");
  } catch {
    panel.classList.toggle("is-expanded");
  }
  window.setTimeout(() => {
    hideLthSthTooltip();
    drawLthSthChart();
  }, 80);
};

const toggleLthLossFullscreen = async () => {
  const panel = document.querySelector("#lth-loss-panel");
  if (!panel) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (panel.requestFullscreen) await panel.requestFullscreen();
    else panel.classList.toggle("is-expanded");
  } catch {
    panel.classList.toggle("is-expanded");
  }
  window.setTimeout(() => {
    hideLthLossTooltip();
    drawLthLossChart();
  }, 80);
};

const toggleSupplyProfitLossFullscreen = async () => {
  const panel = document.querySelector("#supply-pl-panel");
  if (!panel) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (panel.requestFullscreen) await panel.requestFullscreen();
    else panel.classList.toggle("is-expanded");
  } catch {
    panel.classList.toggle("is-expanded");
  }
  window.setTimeout(() => {
    hideSupplyProfitLossTooltip();
    drawSupplyProfitLossChart();
  }, 80);
};

const toggleMedianMvrvFullscreen = async () => {
  const panel = document.querySelector("#median-mvrv-panel");
  if (!panel) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (panel.requestFullscreen) await panel.requestFullscreen();
    else panel.classList.toggle("is-expanded");
  } catch {
    panel.classList.toggle("is-expanded");
  }
  window.setTimeout(() => {
    hideMedianMvrvTooltip();
    drawMedianMvrvChart();
  }, 80);
};

const toggleMvrvBandsFullscreen = async () => {
  const panel = document.querySelector("#mvrv-bands-panel");
  if (!panel) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (panel.requestFullscreen) await panel.requestFullscreen();
    else panel.classList.toggle("is-expanded");
  } catch {
    panel.classList.toggle("is-expanded");
  }
  window.setTimeout(() => {
    hideMvrvBandsTooltip();
    drawMvrvBandsChart();
  }, 80);
};

const toggleMvrvPriceBandsFullscreen = async () => {
  const panel = document.querySelector("#mvrv-price-bands-panel");
  if (!panel) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (panel.requestFullscreen) await panel.requestFullscreen();
    else panel.classList.toggle("is-expanded");
  } catch {
    panel.classList.toggle("is-expanded");
  }
  window.setTimeout(() => {
    hideMvrvPriceBandsTooltip();
    drawMvrvPriceBandsChart();
  }, 80);
};

const toggleStockToFlowFullscreen = async () => {
  const panel = document.querySelector("#stock-to-flow-panel");
  if (!panel) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (panel.requestFullscreen) await panel.requestFullscreen();
    else panel.classList.toggle("is-expanded");
  } catch {
    panel.classList.toggle("is-expanded");
  }
  window.setTimeout(() => {
    hideStockToFlowTooltip();
    drawStockToFlowChart();
  }, 80);
};

const toggleCycleTimingFullscreen = async () => {
  const panel = document.querySelector("#cycle-timing-panel");
  if (!panel) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (panel.requestFullscreen) await panel.requestFullscreen();
    else panel.classList.toggle("is-expanded");
  } catch {
    panel.classList.toggle("is-expanded");
  }
  window.setTimeout(() => {
    hideCycleTimingTooltip();
    drawCycleTimingChart();
  }, 80);
};

const toggleRhodlFullscreen = async () => {
  const panel = document.querySelector("#rhodl-panel");
  if (!panel) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (panel.requestFullscreen) await panel.requestFullscreen();
    else panel.classList.toggle("is-expanded");
  } catch {
    panel.classList.toggle("is-expanded");
  }
  window.setTimeout(() => {
    hideRhodlTooltip();
    drawRhodlChart();
  }, 80);
};

const toggleLthRplFullscreen = async () => {
  const panel = document.querySelector("#lth-rpl-panel");
  if (!panel) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (panel.requestFullscreen) await panel.requestFullscreen();
    else panel.classList.toggle("is-expanded");
  } catch {
    panel.classList.toggle("is-expanded");
  }
  window.setTimeout(() => {
    hideLthRplTooltip();
    drawLthRplChart();
  }, 80);
};

const toggleSlrvFullscreen = async () => {
  const panel = document.querySelector("#slrv-panel");
  if (!panel) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (panel.requestFullscreen) await panel.requestFullscreen();
    else panel.classList.toggle("is-expanded");
  } catch {
    panel.classList.toggle("is-expanded");
  }
  window.setTimeout(() => {
    hideSlrvTooltip();
    drawSlrvChart();
  }, 80);
};

const toggleRealizedCapHodlFullscreen = async () => {
  const panel = document.querySelector("#realized-cap-hodl-panel");
  if (!panel) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (panel.requestFullscreen) await panel.requestFullscreen();
    else panel.classList.toggle("is-expanded");
  } catch {
    panel.classList.toggle("is-expanded");
  }
  window.setTimeout(() => {
    hideRealizedCapHodlTooltip();
    drawRealizedCapHodlChart();
  }, 80);
};

const toggleLthSpentFullscreen = async () => {
  const panel = document.querySelector("#lth-spent-panel");
  if (!panel) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (panel.requestFullscreen) await panel.requestFullscreen();
    else panel.classList.toggle("is-expanded");
  } catch {
    panel.classList.toggle("is-expanded");
  }
  window.setTimeout(() => {
    hideLthSpentTooltip();
    drawLthSpentChart();
  }, 80);
};

const togglePercentProfitFullscreen = async () => {
  const panel = document.querySelector("#percent-profit-panel");
  if (!panel) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (panel.requestFullscreen) await panel.requestFullscreen();
    else panel.classList.toggle("is-expanded");
  } catch {
    panel.classList.toggle("is-expanded");
  }
  window.setTimeout(() => {
    hidePercentProfitTooltip();
    drawPercentProfitChart();
  }, 80);
};

const toggleLthExchangeLossFullscreen = async () => {
  const panel = document.querySelector("#lth-exchange-loss-panel");
  if (!panel) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (panel.requestFullscreen) await panel.requestFullscreen();
    else panel.classList.toggle("is-expanded");
  } catch {
    panel.classList.toggle("is-expanded");
  }
  window.setTimeout(() => {
    hideLthExchangeLossTooltip();
    drawLthExchangeLossChart();
  }, 80);
};

const toggleTwoWeekRsiFullscreen = async () => {
  const panel = document.querySelector("#two-week-rsi-panel");
  if (!panel) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (panel.requestFullscreen) await panel.requestFullscreen();
    else panel.classList.toggle("is-expanded");
  } catch {
    panel.classList.toggle("is-expanded");
  }
  window.setTimeout(() => {
    hideTwoWeekRsiTooltip();
    drawTwoWeekRsiChart();
  }, 80);
};

const toggleUnder3mHodlFullscreen = async () => {
  const panel = document.querySelector("#under-3m-hodl-panel");
  if (!panel) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (panel.requestFullscreen) await panel.requestFullscreen();
    else panel.classList.toggle("is-expanded");
  } catch {
    panel.classList.toggle("is-expanded");
  }
  window.setTimeout(() => {
    hideUnder3mHodlTooltip();
    drawUnder3mHodlChart();
  }, 80);
};

const toggleSth200dmaFullscreen = async () => {
  const panel = document.querySelector("#sth-200dma-panel");
  if (!panel) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (panel.requestFullscreen) await panel.requestFullscreen();
    else panel.classList.toggle("is-expanded");
  } catch {
    panel.classList.toggle("is-expanded");
  }
  window.setTimeout(() => {
    hideSth200dmaTooltip();
    drawSth200dmaChart();
  }, 80);
};

const toggleVddMedianFullscreen = async () => {
  const panel = document.querySelector("#vdd-median-panel");
  if (!panel) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (panel.requestFullscreen) await panel.requestFullscreen();
    else panel.classList.toggle("is-expanded");
  } catch {
    panel.classList.toggle("is-expanded");
  }
  window.setTimeout(() => {
    hideVddMedianTooltip();
    drawVddMedianCycleChart();
  }, 80);
};

const toggleSsrFullscreen = async () => {
  const panel = document.querySelector("#ssr-panel");
  if (!panel) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (panel.requestFullscreen) await panel.requestFullscreen();
    else panel.classList.toggle("is-expanded");
  } catch {
    panel.classList.toggle("is-expanded");
  }
  window.setTimeout(() => {
    hideSsrTooltip();
    drawSsrChart();
  }, 80);
};

const toggleSthBandsFullscreen = async () => {
  const panel = document.querySelector("#sth-bands-panel");
  if (!panel) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (panel.requestFullscreen) await panel.requestFullscreen();
    else panel.classList.toggle("is-expanded");
  } catch {
    panel.classList.toggle("is-expanded");
  }
  window.setTimeout(() => {
    hideSthBandsTooltip();
    drawSthBandsChart();
  }, 80);
};

const togglePercentProfitEx10yFullscreen = async () => {
  const panel = document.querySelector("#percent-profit-ex-10y-panel");
  if (!panel) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (panel.requestFullscreen) await panel.requestFullscreen();
    else panel.classList.toggle("is-expanded");
  } catch {
    panel.classList.toggle("is-expanded");
  }
  window.setTimeout(() => {
    hidePercentProfitEx10yTooltip();
    drawPercentProfitEx10yChart();
  }, 80);
};

const toggleSthMvrvFullscreen = async () => {
  const panel = document.querySelector("#sth-mvrv-panel");
  if (!panel) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (panel.requestFullscreen) await panel.requestFullscreen();
    else panel.classList.toggle("is-expanded");
  } catch {
    panel.classList.toggle("is-expanded");
  }
  window.setTimeout(() => {
    hideSthMvrvTooltip();
    drawSthMvrvChart();
  }, 80);
};

const toggleVddFullscreen = async () => {
  const panel = document.querySelector("#vdd-panel");
  if (!panel) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (panel.requestFullscreen) await panel.requestFullscreen();
    else panel.classList.toggle("is-expanded");
  } catch {
    panel.classList.toggle("is-expanded");
  }
  window.setTimeout(() => {
    hideVddTooltip();
    drawVddChart();
  }, 80);
};

const toggleLthNuplFullscreen = async () => {
  const panel = document.querySelector("#lth-nupl-panel");
  if (!panel) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (panel.requestFullscreen) await panel.requestFullscreen();
    else panel.classList.toggle("is-expanded");
  } catch {
    panel.classList.toggle("is-expanded");
  }
  window.setTimeout(() => {
    hideLthNuplTooltip();
    drawLthNuplChart();
  }, 80);
};

const surfMetricConfig = {
  "cost-basis": {
    name: "BTC Key Cost-Basis Pricing Models",
    snapshot: () => costBasisSnapshot
  },
  "sth-ratio": {
    name: "BTC STH-RP to TMMP Ratio",
    snapshot: () => sthRatioSnapshot
  },
  "lth-rp": {
    name: "BTC LTH Realized-Price Cross Analysis",
    snapshot: () => lthRealizedSnapshot
  },
  rpl: {
    name: "BTC Realized Profit to Realized Loss Ratio",
    snapshot: () => realizedProfitLossSnapshot
  },
  "median-rp": {
    name: "BTC Median Realized Price",
    snapshot: () => medianRealizedSnapshot
  },
  "lth-sth": {
    name: "BTC LTH/STH Cost Basis Ratio",
    snapshot: () => lthSthSnapshot
  },
  "lth-loss": {
    name: "BTC LTH Market Cap in Loss / Market Cap [Except > 10Y]",
    snapshot: () => lthLossSnapshot
  },
  "supply-pl": {
    name: "Bitcoin Supply in Profit/Loss Ratio [Except > 7Y]",
    snapshot: () => supplyProfitLossSnapshot
  },
  "median-mvrv": {
    name: "BTC Median MVRV",
    snapshot: () => medianMvrvSnapshot
  },
  "mvrv-bands": {
    name: "BTC Std-Adjusted MVRV Bands (4Y Rolling Windows)",
    snapshot: () => mvrvBandsSnapshot
  },
  "mvrv-price-bands": {
    name: "BTC Std-Adjusted MVRV Price Bands",
    snapshot: () => mvrvPriceBandsSnapshot
  },
  "stock-to-flow": {
    name: "Bitcoin Stock-to-Flow Price Model",
    snapshot: () => stockToFlowSnapshot
  },
  "cycle-timing": {
    name: "Bitcoin Four-Mode Cycle Timing Lab",
    snapshot: () => ({
      ...(cycleTimingSnapshot || {}),
      mode: cycleTimingMode,
      model: getActiveCycleTimingMode()
    })
  },
  rhodl: {
    name: "Bitcoin Realized HODL Ratio",
    snapshot: () => rhodlSnapshot
  },
  "lth-rpl": {
    name: "BTC Entity-Adjusted Long-Term Holder Realized Profit/Loss Ratio (Public Proxy)",
    snapshot: () => lthRplSnapshot
  },
  slrv: {
    name: "BTC Short to Long-Term Realized Value Ratio (7-Day Moving Average)",
    snapshot: () => ({ ...(slrvSnapshot || {}), calibration: slrvCalibration })
  },
  "realized-cap-hodl": {
    name: "BTC Realized Cap HODL Waves",
    snapshot: () => ({ ...(realizedCapHodlSnapshot || {}), extension: realizedCapHodlExtension })
  },
  "lth-spent": {
    name: "BTC LTH Spent Price Under-water",
    snapshot: () => ({
      ...(lthSpentSnapshot || {}),
      exactHistoryStarts: lthSpentExactStart,
      researchWindows: lthSpentResearchWindows
    })
  },
  "percent-profit": {
    name: "BTC Percent Supply in Profit",
    snapshot: () => ({
      ...(percentProfitSnapshot || {}),
      historicalLows: percentProfitHistoricalLows,
      researchWindows: percentProfitResearchWindows
    })
  },
  "lth-exchange-loss": {
    name: "BTC LTH Realized Loss to Exchanges · Public Proxy",
    snapshot: () => ({
      ...(lthExchangeLossSnapshot || {}),
      dataMode: "public-proxy",
      exchangeLabelled: false,
      methodology: "30d_sma_of_lth_realized_loss_share_across_lth_sth_realized_profit_and_loss",
      historicalPeaks: lthExchangeLossHistoricalPeaks,
      researchWindows: lthExchangeLossResearchWindows
    })
  },
  "two-week-rsi": {
    name: "BTC 2-Week RSI Long-Term Channel",
    snapshot: () => ({
      ...(twoWeekRsiSnapshot || {}),
      methodology: "14_period_wilder_rsi_on_14_day_btc_closes_with_extreme_point_channel_regression",
      historicalLows: twoWeekRsiHistoricalLows,
      channelAnchors: twoWeekRsiChannelAnchors
    })
  },
  "under-3m-hodl": {
    name: "BTC <3m Realized Cap HODL Waves",
    snapshot: () => ({
      ...(under3mHodlSnapshot || {}),
      methodology: "under_3m_equals_one_minus_over_3m_realized_cap_share",
      historicalLows: under3mHodlLows
    })
  },
  "sth-200dma": {
    name: "BTC Short-Term Holder Realized Price / 200DMA Golden Cross",
    snapshot: () => ({
      ...(sth200dmaSnapshot || {}),
      methodology: "public_sth_realized_price_versus_transparent_200_day_btc_sma",
      macroCrosses: sth200dmaMacroCrosses,
      historicalCycles: sth200dmaHistoricalCycles
    })
  },
  "vdd-median": {
    name: "BTC VDD / Median Price Top-and-Bottom Model",
    snapshot: () => ({
      ...(vddMedianSnapshot || {}),
      methodology: "bottom_vdd_below_0_9_and_price_to_median_at_or_below_1_25__top_vdd_at_or_above_1_5_and_price_to_median_at_or_above_1_5",
      thresholds: { bottomVdd: 0.9, bottomMedianRatio: 1.25, topVdd: 1.5, topMedianRatio: 1.5 },
      referenceCycles: vddMedianReferenceCycles,
      bottomZones: vddMedianBottomZones,
      topZones: vddMedianTopZones
    })
  },
  ssr: {
    name: "BTC Stablecoin Supply Ratio / Bollinger Bands (200, 2)",
    snapshot: () => ({
      ...(ssrSnapshot || {}),
      methodology: "btc_market_cap_divided_by_public_stablecoin_market_cap_with_200_day_2_sigma_bollinger_bands",
      macroBreakouts: ssrMacroBreakouts,
      referenceBreakouts: ssrReferenceBreakouts,
      sources: ssrSources
    })
  },
  "sth-bands": {
    name: "BTC Short-Term Holder Cost Basis Model [4Y, 2011-] · Nine Bands",
    snapshot: () => ({
      ...(sthBandsSnapshot || {}),
      methodology: "line5_public_sth_realized_price__nine_rails_from_trailing_four_year_population_standard_deviation_of_btc_minus_sth_cost",
      levels: [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2],
      line7: "+1_standard_deviation",
      macroBreakouts: sthBandsMacroBreakouts,
      referenceBreakouts: sthBandsReferenceBreakouts,
      sources: sthBandsSources
    })
  },
  "percent-profit-ex-10y": {
    name: "BTC Percent Supply in Profit [Ex >10y, 7DMA]",
    snapshot: () => ({
      ...(percentProfitEx10ySnapshot || {}),
      methodology: "public_profit_supply_minus_over_10y_dormant_supply_divided_by_public_total_supply_minus_over_10y_dormant_supply__7dma",
      thresholds: { legacy: 60, modern: 55 },
      referenceCycles: percentProfitEx10yReferenceCycles,
      recentWashoutZones: percentProfitEx10yWashoutZones.slice(-8),
      sources: percentProfitEx10ySources
    })
  },
  "sth-mvrv": {
    name: "BTC Short Term Holder MVRV",
    snapshot: () => ({
      ...(sthMvrvSnapshot || {}),
      methodology: "public_daily_btc_price_divided_by_public_short_term_holder_realized_price_under_155_days",
      breakeven: 1,
      referenceCycles: sthMvrvReferenceCycles,
      currentStructure: sthMvrvCurrentStructure,
      sources: sthMvrvSources
    })
  },
  vdd: {
    name: "Bitcoin Value Days Destroyed Multiple",
    snapshot: () => vddSnapshot
  },
  "lth-nupl": {
    name: "BTC Entity-Adjusted LTH-NUPL (Public Proxy)",
    snapshot: () => lthNuplSnapshot
  }
};

const readSurfMetricCache = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(SURF_METRIC_CACHE_KEY) || "{}");
    return cached && typeof cached === "object" ? cached : {};
  } catch {
    return {};
  }
};

const writeSurfMetricCache = (cache) => {
  writeResilientCacheItem(SURF_METRIC_CACHE_KEY, cache, "Surf metric");
};

const buildSurfMetricQuery = (metricId) => {
  const config = surfMetricConfig[metricId];
  const snapshot = config?.snapshot?.() || {};
  const data = Object.fromEntries(Object.entries(snapshot).filter(([, value]) => {
    return value === null || ["string", "number", "boolean"].includes(typeof value);
  }));
  const language = currentLanguage === "zh" ? "简体中文" : "English";
  return `请用${language}分析 ${config?.name || metricId}。当前已验证数据快照：${JSON.stringify(data)}。请结合公开链上研究解释：1）当前周期状态；2）关键阈值和历史可比窗口；3）未来需要验证的条件；4）数据限制与风险。重点给出可执行的观察清单，不预测确定收益，不把模型当作单独买卖信号。`;
};

const updateSurfPanelLabels = (panel) => {
  if (!panel) return;
  const title = panel.querySelector("[data-surf-title]");
  const refresh = panel.querySelector("[data-surf-refresh]");
  const copy = panel.querySelector("[data-surf-copy]");
  const close = panel.querySelector("[data-surf-close]");
  if (title) title.textContent = getCopy("surf.title");
  if (refresh) refresh.textContent = getCopy("surf.refresh");
  if (copy) copy.textContent = getCopy("surf.copy");
  if (close) close.setAttribute("aria-label", getCopy("surf.close"));
};

const renderSurfMetricAnswer = (panel, answer, provider = "surf") => {
  const body = panel?.querySelector("[data-surf-answer]");
  const status = panel?.querySelector("[data-surf-status]");
  if (body) body.textContent = answer;
  if (status) status.textContent = String(provider || "surf").toUpperCase();
  panel?.classList.remove("is-loading", "is-error");
};

const requestSurfMetricAnalysis = async (button, force = false) => {
  const metricId = button?.dataset.surfModel;
  const config = surfMetricConfig[metricId];
  const panel = button?.closest(".cost-basis-panel")?.querySelector(".surf-model-panel");
  if (!config || !panel) return;
  const answer = panel.querySelector("[data-surf-answer]");
  const status = panel.querySelector("[data-surf-status]");
  const cacheKey = `${metricId}:${currentLanguage}`;
  const cache = readSurfMetricCache();
  const cached = cache[cacheKey];
  if (!force && cached?.answer && Date.now() - Number(cached.savedAt) < SURF_METRIC_CACHE_MS) {
    renderSurfMetricAnswer(panel, cached.answer, cached.provider);
    return;
  }

  panel.classList.add("is-loading");
  panel.classList.remove("is-error");
  if (answer) answer.textContent = getCopy("surf.loading");
  if (status) status.textContent = "SURF · LIVE";
  try {
    const response = await fetch(`${API_BASE}/api/surf-research`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: buildSurfMetricQuery(metricId),
        platformId: `onchain-${metricId}`,
        platformName: config.name,
        effort: "medium",
        language: currentLanguage
      })
    });
    if (!response.ok) throw new Error(`Surf research API ${response.status}`);
    const payload = await response.json();
    if (!payload?.answer) throw new Error("Surf returned an empty analysis");
    cache[cacheKey] = { savedAt: Date.now(), answer: payload.answer, provider: payload.provider || "surf" };
    writeSurfMetricCache(cache);
    renderSurfMetricAnswer(panel, payload.answer, payload.provider);
  } catch (error) {
    panel.classList.remove("is-loading");
    panel.classList.add("is-error");
    if (answer) answer.textContent = getCopy("surf.error");
    if (status) status.textContent = "SURF · ERROR";
    console.warn("Surf metric analysis failed", error);
  }
};

const ensureSurfMetricPanel = (button) => {
  const chartPanel = button.closest(".cost-basis-panel");
  if (!chartPanel) return null;
  let panel = chartPanel.querySelector(".surf-model-panel");
  if (panel) return panel;
  panel = document.createElement("section");
  panel.className = "surf-model-panel";
  panel.hidden = true;
  panel.setAttribute("aria-live", "polite");
  panel.innerHTML = `
    <div class="surf-model-head">
      <span><i aria-hidden="true"></i><strong data-surf-title></strong></span>
      <em data-surf-status>SURF · READY</em>
      <div class="surf-model-actions">
        <button type="button" data-surf-refresh></button>
        <button type="button" data-surf-copy></button>
        <button type="button" class="surf-model-close" data-surf-close aria-label=""><span aria-hidden="true">×</span></button>
      </div>
    </div>
    <div class="surf-model-answer" data-surf-answer></div>`;
  const snapshot = chartPanel.querySelector(".cost-basis-snapshot");
  snapshot?.insertAdjacentElement("afterend", panel);
  updateSurfPanelLabels(panel);
  panel.querySelector("[data-surf-refresh]")?.addEventListener("click", () => requestSurfMetricAnalysis(button, true));
  panel.querySelector("[data-surf-copy]")?.addEventListener("click", async () => {
    const text = panel.querySelector("[data-surf-answer]")?.textContent || "";
    if (!text) return;
    try { await navigator.clipboard.writeText(text); } catch { /* Clipboard permission is optional. */ }
  });
  panel.querySelector("[data-surf-close]")?.addEventListener("click", () => {
    panel.hidden = true;
    button.setAttribute("aria-pressed", "false");
    button.classList.remove("active");
  });
  return panel;
};

const toggleSurfMetricPanel = (button) => {
  const panel = ensureSurfMetricPanel(button);
  if (!panel) return;
  const opening = panel.hidden;
  panel.hidden = !opening;
  button.setAttribute("aria-pressed", String(opening));
  button.classList.toggle("active", opening);
  if (opening) requestSurfMetricAnalysis(button, false);
};

const applyTheme = () => {
  document.body.dataset.theme = currentTheme;
  const labelKey = currentTheme === "dark" ? "tools.theme" : "tools.themeLight";
  themeButtons.forEach((button) => { button.textContent = getCopy(labelKey); });
  drawAllCharts();
};

let trendNavigationLock = null;
let trendScrollFrame = 0;
let trendNavigationStabilizer = null;

const syncTrendNavigatorLayout = () => {
  const header = document.querySelector(".site-header");
  const subnav = document.querySelector(".dashboard-subnav");
  if (!header || !subnav) return;
  const stickyTop = Math.ceil(header.getBoundingClientRect().height + subnav.getBoundingClientRect().height);
  document.documentElement.style.setProperty("--trend-index-sticky-top", `${stickyTop}px`);
};

const syncTrendNavigatorLabels = () => {
  if (!trendIndexList) return;
  document.querySelectorAll("#charts > .chart-panel[id]").forEach((panel, index) => {
    const label = panel.querySelector(".cost-basis-heading h2")?.textContent?.trim()
      || panel.querySelector("h2, h3")?.textContent?.trim()
      || panel.id;
    const link = trendIndexList.querySelector(`[data-trend-target="${panel.id}"]`);
    if (!link) return;
    const number = link.querySelector("span:first-child");
    const text = link.querySelector("span:last-child");
    if (number) number.textContent = String(index + 1).padStart(2, "0");
    if (text) text.textContent = label.replace(/^BTC[：:]\s*/i, "");
    link.title = label;
  });
};

const getTrendScrollOffset = () => {
  const headerHeight = document.querySelector(".site-header")?.getBoundingClientRect().height || 0;
  const subnavHeight = document.querySelector(".dashboard-subnav")?.getBoundingClientRect().height || 0;
  const baseOffset = headerHeight + subnavHeight + 14;
  const trendIndex = document.querySelector("#trend-index");
  const horizontalIndex = trendIndex && trendIndexList && getComputedStyle(trendIndexList).display === "flex";
  if (!horizontalIndex) return Math.round(baseOffset);
  const stickyTop = Number.parseFloat(getComputedStyle(trendIndex).top) || baseOffset;
  return Math.round(Math.max(baseOffset, stickyTop + trendIndex.getBoundingClientRect().height + 10));
};

const keepTrendLinkVisible = (link) => {
  if (!trendIndexList || !link) return;
  const listRect = trendIndexList.getBoundingClientRect();
  const linkRect = link.getBoundingClientRect();
  const horizontal = trendIndexList.scrollWidth > trendIndexList.clientWidth + 4;
  if (horizontal) {
    if (linkRect.left < listRect.left) trendIndexList.scrollLeft -= listRect.left - linkRect.left + 8;
    if (linkRect.right > listRect.right) trendIndexList.scrollLeft += linkRect.right - listRect.right + 8;
    return;
  }
  if (linkRect.top < listRect.top) trendIndexList.scrollTop -= listRect.top - linkRect.top + 6;
  if (linkRect.bottom > listRect.bottom) trendIndexList.scrollTop += linkRect.bottom - listRect.bottom + 6;
};

const expandTrendAnalysis = (panel, firstPanel) => {
  const disclosure = panel?.querySelector(".cost-basis-analysis-disclosure");
  if (disclosure) disclosure.open = true;
  const firstDisclosure = firstPanel?.querySelector(".cost-basis-analysis-disclosure");
  if (firstDisclosure) firstDisclosure.open = true;
};

const setActiveTrendPanel = (panel, panels, { expand = true } = {}) => {
  if (!panel || !trendIndexList) return;
  const activeLink = trendIndexList.querySelector(`[data-trend-target="${panel.id}"]`);
  trendIndexList.querySelectorAll(".trend-index-link").forEach((link) => {
    link.classList.toggle("active", link === activeLink);
  });
  panels.forEach((item) => item.classList.toggle("is-trend-current", item === panel));
  if (expand) expandTrendAnalysis(panel, panels[0]);
  keepTrendLinkVisible(activeLink);
};

const jumpToTrendPanel = (panel) => {
  const root = document.documentElement;
  const previousScrollBehavior = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  const top = panel.getBoundingClientRect().top + window.scrollY - getTrendScrollOffset();
  window.scrollTo(0, Math.max(0, top));
  root.style.scrollBehavior = previousScrollBehavior;
};

const stopTrendNavigationStabilizer = () => {
  if (!trendNavigationStabilizer) return;
  trendNavigationStabilizer.stop();
  trendNavigationStabilizer = null;
};

const stabilizeTrendPanel = (panel, panels) => {
  stopTrendNavigationStabilizer();
  const charts = document.querySelector("#charts");
  let stopped = false;
  let frame = 0;
  let releaseTimer = 0;
  let observer = null;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (frame) window.cancelAnimationFrame(frame);
    window.clearTimeout(releaseTimer);
    observer?.disconnect();
    ["wheel", "touchstart", "pointerdown", "keydown"].forEach((eventName) => {
      window.removeEventListener(eventName, stop);
    });
    if (trendNavigationLock === panel.id) trendNavigationLock = null;
  };
  const correctPosition = () => {
    if (stopped || frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      jumpToTrendPanel(panel);
      setActiveTrendPanel(panel, panels);
    });
  };

  if (charts && "ResizeObserver" in window) {
    observer = new ResizeObserver(correctPosition);
    observer.observe(charts);
  }
  ["wheel", "touchstart", "pointerdown", "keydown"].forEach((eventName) => {
    window.addEventListener(eventName, stop, { passive: true });
  });
  releaseTimer = window.setTimeout(stop, 8000);
  trendNavigationStabilizer = { stop };
  correctPosition();
};

const scrollToTrendPanel = (panel, panels) => {
  trendNavigationLock = panel.id;
  setActiveTrendPanel(panel, panels);
  window.history.replaceState(null, "", `#${panel.id}`);
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      jumpToTrendPanel(panel);
      window.setTimeout(() => {
        jumpToTrendPanel(panel);
        setActiveTrendPanel(panel, panels);
        stabilizeTrendPanel(panel, panels);
      }, 80);
    });
  });
};

const setupTrendNavigator = () => {
  if (!trendIndexList) return;
  syncTrendNavigatorLayout();
  const panels = [...document.querySelectorAll("#charts > .chart-panel[id]")];
  const trendIndexKicker = document.querySelector(".trend-index-kicker");
  if (trendIndexKicker) trendIndexKicker.textContent = `INDEX / ${panels.length}`;
  panels.forEach((panel, index) => {
    const disclosure = panel.querySelector(".cost-basis-analysis-disclosure");
    if (disclosure) disclosure.open = index === 0;
  });
  const firstDisclosure = panels[0]?.querySelector(".cost-basis-analysis-disclosure");
  firstDisclosure?.addEventListener("toggle", () => {
    if (!firstDisclosure.open) window.requestAnimationFrame(() => { firstDisclosure.open = true; });
  });
  trendIndexList.replaceChildren(...panels.map((panel, index) => {
    const link = document.createElement("a");
    link.className = "trend-index-link";
    link.href = `#${panel.id}`;
    link.dataset.trendTarget = panel.id;
    const number = document.createElement("span");
    number.textContent = String(index + 1).padStart(2, "0");
    const label = document.createElement("span");
    link.append(number, label);
    link.addEventListener("click", (event) => {
      event.preventDefault();
      scrollToTrendPanel(panel, panels);
    });
    return link;
  }));
  syncTrendNavigatorLabels();

  const syncActivePanelFromScroll = () => {
    trendScrollFrame = 0;
    if (trendNavigationLock) return;
    const marker = getTrendScrollOffset() + 24;
    let current = panels[0];
    panels.forEach((panel) => {
      if (panel.getBoundingClientRect().top <= marker) current = panel;
    });
    setActiveTrendPanel(current, panels);
  };
  const requestTrendSync = () => {
    if (trendScrollFrame) return;
    trendScrollFrame = window.requestAnimationFrame(syncActivePanelFromScroll);
  };
  window.addEventListener("scroll", requestTrendSync, { passive: true });
  window.addEventListener("resize", () => {
    syncTrendNavigatorLayout();
    requestTrendSync();
  });
  window.visualViewport?.addEventListener("resize", syncTrendNavigatorLayout);
  syncActivePanelFromScroll();

  const headingObserver = new MutationObserver(syncTrendNavigatorLabels);
  panels.forEach((panel) => {
    const heading = panel.querySelector(".cost-basis-heading h2");
    if (heading) headingObserver.observe(heading, { childList: true, characterData: true, subtree: true });
  });

  const hashPanel = panels.find((panel) => `#${panel.id}` === window.location.hash);
  if (hashPanel && hashPanel !== panels[0]) window.setTimeout(() => scrollToTrendPanel(hashPanel, panels), 80);
};

const applyLanguage = () => {
  document.documentElement.lang = currentLanguage === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n;
    const currentText = element.textContent.trim();
    const staticZh = String(translations.zh[key] || "").trim();
    const staticEn = String(translations.en[key] || "").trim();
    const hasRuntimeText = element.dataset.runtimeText === "true"
      || (currentText && currentText !== staticZh && currentText !== staticEn);
    if (!hasRuntimeText) element.textContent = getCopy(key);
  });
  langButtons.forEach((button) => { button.textContent = currentLanguage === "zh" ? "EN" : "中"; });
  onchainSupportOpenButton?.setAttribute("aria-label", getCopy("support.open"));
  onchainSupportCloseButton?.setAttribute("aria-label", currentLanguage === "zh" ? "关闭链上支持" : "Close on-chain support");
  document.querySelectorAll("[data-surf-model]").forEach((button) => {
    button.setAttribute("title", getCopy("surf.open"));
    button.setAttribute("aria-label", getCopy("surf.open"));
  });
  document.querySelectorAll(".surf-model-panel").forEach(updateSurfPanelLabels);
  syncTrendNavigatorLabels();
  updateCycleRadar();
  renderReferences();
  if (cycleTimingSnapshot) refreshCycleTimingMode();
  applyTheme();
  window.updateProductDashboardLanguage?.();
};

window.updateDashboardLanguage = applyLanguage;

const updateClock = () => setText("#global-clock", `${formatDateTime()} CST`);

const stabilizePendingAnalysisStates = () => {
  const fallbackTitle = currentLanguage === "zh"
    ? "公开源暂时波动，模型说明保持可用"
    : "Public source retrying; model notes remain available";
  const fallbackMeta = currentLanguage === "zh"
    ? "公开源重试中 · 说明可用"
    : "Public source retrying · notes available";

  document.querySelectorAll('#charts [data-i18n$=".waiting"]').forEach((element) => {
    const key = element.dataset.i18n;
    const currentText = element.textContent.trim();
    const waitingZh = String(translations.zh[key] || "").trim();
    const waitingEn = String(translations.en[key] || "").trim();
    const isPending = !currentText
      || currentText === waitingZh
      || currentText === waitingEn
      || /等待.*(?:同步|数据)|waiting/i.test(currentText);

    if (isPending) {
      writeRuntimeText(element, element.tagName === "STRONG" ? fallbackTitle : fallbackMeta);
    }
  });
};

let syncInFlight = null;
let analysisSyncInFlight = null;
let analysisSyncStarted = false;
let analysisObserver = null;

const analysisLoaders = [
  loadCostBasisMetrics,
  loadLthRealizedMetrics,
  loadRealizedProfitLossMetrics,
  loadMedianRealizedMetrics,
  loadLthSthMetrics,
  loadLthLossMetrics,
  loadSupplyProfitLossMetrics,
  loadMvrvBandsMetrics,
  loadStockToFlowMetrics,
  loadCycleTimingMetrics,
  loadRhodlMetrics,
  loadLthRplMetrics,
  loadSlrvMetrics,
  loadRealizedCapHodlMetrics,
  loadLthSpentMetrics,
  loadPercentProfitMetrics,
  loadLthExchangeLossMetrics,
  loadTwoWeekRsiMetrics,
  loadUnder3mHodlMetrics,
  loadSth200dmaMetrics,
  loadVddMedianMetrics,
  loadSsrMetrics,
  loadSthBandsMetrics,
  loadPercentProfitEx10yMetrics,
  loadSthMvrvMetrics,
  loadVddMetrics,
  loadLthNuplMetrics
];

const runLoaderPool = async (loaders, concurrency = 4) => {
  const results = new Array(loaders.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, loaders.length) }, async () => {
    while (cursor < loaders.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = { status: "fulfilled", value: await loaders[index]() };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
  });
  await Promise.all(workers);
  return results;
};

const syncAnalysisData = async () => {
  if (analysisSyncInFlight || document.hidden) return analysisSyncInFlight;
  analysisSyncStarted = true;
  analysisObserver?.disconnect();
  analysisObserver = null;
  analysisSyncInFlight = runLoaderPool(analysisLoaders, 4);
  try {
    return await analysisSyncInFlight;
  } finally {
    analysisSyncInFlight = null;
    stabilizePendingAnalysisStates();
  }
};

const scheduleAnalysisSync = () => {
  if (analysisSyncStarted || analysisSyncInFlight) return;
  const charts = document.querySelector("#charts");
  if (!charts || !("IntersectionObserver" in window)) {
    window.setTimeout(() => void syncAnalysisData(), 800);
    return;
  }
  if (window.location.hash === "#charts") {
    void syncAnalysisData();
    return;
  }
  analysisObserver?.disconnect();
  analysisObserver = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) void syncAnalysisData();
  }, { rootMargin: "1200px 0px", threshold: 0.01 });
  analysisObserver.observe(charts);
};

const syncData = async () => {
  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    if (refreshButton) refreshButton.disabled = true;
    setText("#source-status", getCopy("status.loading"));
    publicDataWarnings = [];

    try {
      const results = await Promise.allSettled([
        loadOverviewMetrics(),
        loadExtendedMetrics(),
        loadHalving(),
        loadNetwork()
      ]);
      const failed = results.filter((result) => result.status === "rejected");
      if (failed.length === results.length) setText("#source-status", getCopy("status.error"));
      else if (failed.length || publicDataWarnings.length) setText("#source-status", getCopy("status.partial"));
      else setText("#source-status", getCopy("status.ready"));
      if (failed.length) console.warn("Dashboard partial sync", failed.map((item) => item.reason));
      if (analysisSyncStarted) void syncAnalysisData();
      else scheduleAnalysisSync();
      return results;
    } finally {
      updateCycleRadar();
      stabilizePendingAnalysisStates();
      if (refreshButton) refreshButton.disabled = false;
    }
  })();

  try {
    return await syncInFlight;
  } finally {
    syncInFlight = null;
  }
};

themeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentTheme = currentTheme === "dark" ? "light" : "dark";
    localStorage.setItem("welinkbtc-theme", currentTheme);
    applyTheme();
  });
});

langButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentLanguage = currentLanguage === "zh" ? "en" : "zh";
    localStorage.setItem("welinkbtc-language", currentLanguage);
    applyLanguage();
    syncData();
  });
});

menuButton?.addEventListener("click", () => {
  const open = mobileMenu?.classList.toggle("is-open");
  menuButton.setAttribute("aria-expanded", String(Boolean(open)));
});

mobileMenu?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    mobileMenu.classList.remove("is-open");
    menuButton?.setAttribute("aria-expanded", "false");
  });
});

refreshButton?.addEventListener("click", syncData);

const openOnchainSupport = () => {
  if (!onchainSupportDrawer || !onchainSupportBackdrop) return;
  if (onchainSupportFrame && !onchainSupportFrame.src) {
    onchainSupportFrame.src = onchainSupportFrame.dataset.src || "https://fuckbtc.com/";
  }
  onchainSupportDrawer.classList.add("is-open");
  onchainSupportBackdrop.classList.add("is-open");
  onchainSupportDrawer.setAttribute("aria-hidden", "false");
  onchainSupportBackdrop.setAttribute("aria-hidden", "false");
  onchainSupportOpenButton?.setAttribute("aria-expanded", "true");
  document.body.classList.add("support-drawer-open");
  window.setTimeout(() => onchainSupportCloseButton?.focus({ preventScroll: true }), 180);
};

const closeOnchainSupport = () => {
  if (!onchainSupportDrawer || !onchainSupportBackdrop) return;
  onchainSupportDrawer.classList.remove("is-open");
  onchainSupportBackdrop.classList.remove("is-open");
  onchainSupportDrawer.setAttribute("aria-hidden", "true");
  onchainSupportBackdrop.setAttribute("aria-hidden", "true");
  onchainSupportOpenButton?.setAttribute("aria-expanded", "false");
  document.body.classList.remove("support-drawer-open");
  onchainSupportOpenButton?.focus({ preventScroll: true });
};

onchainSupportOpenButton?.addEventListener("click", openOnchainSupport);
onchainSupportCloseButton?.addEventListener("click", closeOnchainSupport);
onchainSupportBackdrop?.addEventListener("click", closeOnchainSupport);
onchainSupportFrame?.addEventListener("load", () => onchainSupportLoading?.classList.add("is-loaded"));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && onchainSupportDrawer?.classList.contains("is-open")) closeOnchainSupport();
});

document.querySelectorAll("[data-chart-tabs='cost-basis'] button").forEach((button) => {
  button.addEventListener("click", () => {
    costBasisRange = button.dataset.range || "all";
    document.querySelectorAll("[data-chart-tabs='cost-basis'] button").forEach((item) => item.classList.toggle("active", item === button));
    hideCostBasisTooltip();
    drawCostBasisChart();
  });
});

document.querySelectorAll("[data-chart-tabs='sth-ratio'] button").forEach((button) => {
  button.addEventListener("click", () => {
    sthRatioRange = button.dataset.range || "all";
    document.querySelectorAll("[data-chart-tabs='sth-ratio'] button").forEach((item) => item.classList.toggle("active", item === button));
    hideSthRatioTooltip();
    drawSthRatioChart();
  });
});

document.querySelectorAll("[data-chart-tabs='lth-rp'] button").forEach((button) => {
  button.addEventListener("click", () => {
    lthRealizedRange = button.dataset.range || "all";
    document.querySelectorAll("[data-chart-tabs='lth-rp'] button").forEach((item) => item.classList.toggle("active", item === button));
    hideLthRealizedTooltip();
    drawLthRealizedChart();
  });
});

document.querySelectorAll("[data-chart-tabs='rpl'] button").forEach((button) => {
  button.addEventListener("click", () => {
    realizedProfitLossRange = button.dataset.range || "all";
    document.querySelectorAll("[data-chart-tabs='rpl'] button").forEach((item) => item.classList.toggle("active", item === button));
    hideRealizedProfitLossTooltip();
    drawRealizedProfitLossChart();
  });
});

document.querySelectorAll("[data-chart-tabs='median-rp'] button").forEach((button) => {
  button.addEventListener("click", () => {
    medianRealizedRange = button.dataset.range || "all";
    document.querySelectorAll("[data-chart-tabs='median-rp'] button").forEach((item) => item.classList.toggle("active", item === button));
    hideMedianRealizedTooltip();
    drawMedianRealizedChart();
  });
});

document.querySelectorAll("[data-chart-tabs='lth-sth'] button").forEach((button) => {
  button.addEventListener("click", () => {
    lthSthRange = button.dataset.range || "all";
    document.querySelectorAll("[data-chart-tabs='lth-sth'] button").forEach((item) => item.classList.toggle("active", item === button));
    hideLthSthTooltip();
    drawLthSthChart();
  });
});

document.querySelectorAll("[data-chart-tabs='lth-loss'] button").forEach((button) => {
  button.addEventListener("click", () => {
    lthLossRange = button.dataset.range || "all";
    document.querySelectorAll("[data-chart-tabs='lth-loss'] button").forEach((item) => item.classList.toggle("active", item === button));
    hideLthLossTooltip();
    drawLthLossChart();
  });
});

document.querySelectorAll("[data-chart-tabs='supply-pl'] button").forEach((button) => {
  button.addEventListener("click", () => {
    supplyProfitLossRange = button.dataset.range || "all";
    document.querySelectorAll("[data-chart-tabs='supply-pl'] button").forEach((item) => item.classList.toggle("active", item === button));
    hideSupplyProfitLossTooltip();
    drawSupplyProfitLossChart();
  });
});

document.querySelectorAll("[data-chart-tabs='median-mvrv'] button").forEach((button) => {
  button.addEventListener("click", () => {
    medianMvrvRange = button.dataset.range || "all";
    document.querySelectorAll("[data-chart-tabs='median-mvrv'] button").forEach((item) => item.classList.toggle("active", item === button));
    hideMedianMvrvTooltip();
    drawMedianMvrvChart();
  });
});

document.querySelectorAll("[data-chart-tabs='mvrv-bands'] button").forEach((button) => {
  button.addEventListener("click", () => {
    mvrvBandsRange = button.dataset.range || "all";
    document.querySelectorAll("[data-chart-tabs='mvrv-bands'] button").forEach((item) => item.classList.toggle("active", item === button));
    hideMvrvBandsTooltip();
    drawMvrvBandsChart();
  });
});

document.querySelectorAll("[data-chart-tabs='mvrv-price-bands'] button").forEach((button) => {
  button.addEventListener("click", () => {
    mvrvPriceBandsRange = button.dataset.range || "all";
    document.querySelectorAll("[data-chart-tabs='mvrv-price-bands'] button").forEach((item) => item.classList.toggle("active", item === button));
    hideMvrvPriceBandsTooltip();
    drawMvrvPriceBandsChart();
  });
});

document.querySelectorAll("[data-chart-tabs='stock-to-flow'] button").forEach((button) => {
  button.addEventListener("click", () => {
    stockToFlowRange = button.dataset.range || "all";
    document.querySelectorAll("[data-chart-tabs='stock-to-flow'] button").forEach((item) => item.classList.toggle("active", item === button));
    hideStockToFlowTooltip();
    drawStockToFlowChart();
  });
});

document.querySelectorAll("[data-chart-tabs='cycle-timing'] button").forEach((button) => {
  button.addEventListener("click", () => {
    cycleTimingRange = button.dataset.range || "all";
    document.querySelectorAll("[data-chart-tabs='cycle-timing'] button").forEach((item) => item.classList.toggle("active", item === button));
    hideCycleTimingTooltip();
    drawCycleTimingChart();
  });
});

document.querySelectorAll("[data-cycle-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    const nextMode = button.dataset.cycleMode;
    if (!nextMode || !cycleTimingModes[nextMode]) return;
    cycleTimingMode = nextMode;
    refreshCycleTimingMode();
  });
});

document.querySelectorAll("[data-chart-tabs='rhodl'] button").forEach((button) => {
  button.addEventListener("click", () => {
    rhodlRange = button.dataset.range || "all";
    document.querySelectorAll("[data-chart-tabs='rhodl'] button").forEach((item) => item.classList.toggle("active", item === button));
    hideRhodlTooltip();
    drawRhodlChart();
  });
});

document.querySelectorAll("[data-chart-tabs='lth-rpl'] button").forEach((button) => {
  button.addEventListener("click", () => {
    lthRplRange = button.dataset.range || "all";
    document.querySelectorAll("[data-chart-tabs='lth-rpl'] button").forEach((item) => item.classList.toggle("active", item === button));
    hideLthRplTooltip();
    drawLthRplChart();
  });
});

document.querySelectorAll("[data-chart-tabs='slrv'] button").forEach((button) => {
  button.addEventListener("click", () => {
    slrvRange = button.dataset.range || "all";
    document.querySelectorAll("[data-chart-tabs='slrv'] button").forEach((item) => item.classList.toggle("active", item === button));
    hideSlrvTooltip();
    drawSlrvChart();
  });
});

document.querySelectorAll("[data-chart-tabs='realized-cap-hodl'] button").forEach((button) => {
  button.addEventListener("click", () => {
    realizedCapHodlRange = button.dataset.range || "all";
    document.querySelectorAll("[data-chart-tabs='realized-cap-hodl'] button").forEach((item) => item.classList.toggle("active", item === button));
    hideRealizedCapHodlTooltip();
    drawRealizedCapHodlChart();
  });
});

document.querySelectorAll("[data-chart-tabs='lth-spent'] button").forEach((button) => {
  button.addEventListener("click", () => {
    lthSpentRange = button.dataset.range || "all";
    document.querySelectorAll("[data-chart-tabs='lth-spent'] button").forEach((item) => item.classList.toggle("active", item === button));
    hideLthSpentTooltip();
    drawLthSpentChart();
  });
});

document.querySelectorAll("[data-chart-tabs='percent-profit'] button").forEach((button) => {
  button.addEventListener("click", () => {
    percentProfitRange = button.dataset.range || "all";
    document.querySelectorAll("[data-chart-tabs='percent-profit'] button").forEach((item) => item.classList.toggle("active", item === button));
    hidePercentProfitTooltip();
    drawPercentProfitChart();
  });
});

document.querySelectorAll("[data-chart-tabs='lth-exchange-loss'] button").forEach((button) => {
  button.addEventListener("click", () => {
    lthExchangeLossRange = button.dataset.range || "all";
    document.querySelectorAll("[data-chart-tabs='lth-exchange-loss'] button").forEach((item) => item.classList.toggle("active", item === button));
    hideLthExchangeLossTooltip();
    drawLthExchangeLossChart();
  });
});

document.querySelectorAll("[data-chart-tabs='two-week-rsi'] button").forEach((button) => {
  button.addEventListener("click", () => {
    twoWeekRsiRange = button.dataset.range || "all";
    document.querySelectorAll("[data-chart-tabs='two-week-rsi'] button").forEach((item) => item.classList.toggle("active", item === button));
    hideTwoWeekRsiTooltip();
    drawTwoWeekRsiChart();
  });
});

document.querySelectorAll("[data-chart-tabs='under-3m-hodl'] button").forEach((button) => {
  button.addEventListener("click", () => {
    under3mHodlRange = button.dataset.range || "all";
    document.querySelectorAll("[data-chart-tabs='under-3m-hodl'] button").forEach((item) => item.classList.toggle("active", item === button));
    hideUnder3mHodlTooltip();
    drawUnder3mHodlChart();
  });
});

document.querySelectorAll("[data-chart-tabs='sth-200dma'] button").forEach((button) => {
  button.addEventListener("click", () => {
    sth200dmaRange = button.dataset.range || "all";
    document.querySelectorAll("[data-chart-tabs='sth-200dma'] button").forEach((item) => item.classList.toggle("active", item === button));
    hideSth200dmaTooltip();
    drawSth200dmaChart();
  });
});

document.querySelectorAll("[data-chart-tabs='vdd-median'] button").forEach((button) => {
  button.addEventListener("click", () => {
    vddMedianRange = button.dataset.range || "all";
    document.querySelectorAll("[data-chart-tabs='vdd-median'] button").forEach((item) => item.classList.toggle("active", item === button));
    hideVddMedianTooltip();
    drawVddMedianCycleChart();
  });
});

document.querySelectorAll("[data-chart-tabs='ssr'] button").forEach((button) => {
  button.addEventListener("click", () => {
    ssrRange = button.dataset.range || "all";
    document.querySelectorAll("[data-chart-tabs='ssr'] button").forEach((item) => item.classList.toggle("active", item === button));
    hideSsrTooltip();
    drawSsrChart();
  });
});

document.querySelectorAll("[data-chart-tabs='sth-bands'] button").forEach((button) => {
  button.addEventListener("click", () => {
    sthBandsRange = button.dataset.range || "all";
    document.querySelectorAll("[data-chart-tabs='sth-bands'] button").forEach((item) => item.classList.toggle("active", item === button));
    hideSthBandsTooltip();
    drawSthBandsChart();
  });
});

document.querySelectorAll("[data-chart-tabs='percent-profit-ex-10y'] button").forEach((button) => {
  button.addEventListener("click", () => {
    percentProfitEx10yRange = button.dataset.range || "all";
    document.querySelectorAll("[data-chart-tabs='percent-profit-ex-10y'] button").forEach((item) => item.classList.toggle("active", item === button));
    hidePercentProfitEx10yTooltip();
    drawPercentProfitEx10yChart();
  });
});

document.querySelectorAll("[data-chart-tabs='sth-mvrv'] button").forEach((button) => {
  button.addEventListener("click", () => {
    sthMvrvRange = button.dataset.range || "all";
    document.querySelectorAll("[data-chart-tabs='sth-mvrv'] button").forEach((item) => item.classList.toggle("active", item === button));
    hideSthMvrvTooltip();
    drawSthMvrvChart();
  });
});

document.querySelectorAll("[data-chart-tabs='vdd'] button").forEach((button) => {
  button.addEventListener("click", () => {
    vddRange = button.dataset.range || "all";
    document.querySelectorAll("[data-chart-tabs='vdd'] button").forEach((item) => item.classList.toggle("active", item === button));
    hideVddTooltip();
    drawVddChart();
  });
});

document.querySelectorAll("[data-chart-tabs='lth-nupl'] button").forEach((button) => {
  button.addEventListener("click", () => {
    lthNuplRange = button.dataset.range || "all";
    document.querySelectorAll("[data-chart-tabs='lth-nupl'] button").forEach((item) => item.classList.toggle("active", item === button));
    hideLthNuplTooltip();
    drawLthNuplChart();
  });
});

document.querySelectorAll("[data-surf-model]").forEach((button) => {
  button.addEventListener("click", () => toggleSurfMetricPanel(button));
});

document.querySelector("#cost-basis-snapshot")?.addEventListener("click", saveCostBasisSnapshot);
document.querySelector("#cost-basis-download")?.addEventListener("click", downloadCostBasisCsv);
document.querySelector("#cost-basis-fullscreen")?.addEventListener("click", toggleCostBasisFullscreen);
document.querySelector("#cost-basis-chart")?.addEventListener("pointermove", showCostBasisTooltip);
document.querySelector("#cost-basis-chart")?.addEventListener("pointerleave", hideCostBasisTooltip);
document.querySelector("#sth-ratio-snapshot")?.addEventListener("click", saveSthRatioSnapshot);
document.querySelector("#sth-ratio-download")?.addEventListener("click", downloadSthRatioCsv);
document.querySelector("#sth-ratio-fullscreen")?.addEventListener("click", toggleSthRatioFullscreen);
document.querySelector("#sth-ratio-chart")?.addEventListener("pointermove", showSthRatioTooltip);
document.querySelector("#sth-ratio-chart")?.addEventListener("pointerleave", hideSthRatioTooltip);
document.querySelector("#lth-rp-snapshot")?.addEventListener("click", saveLthRealizedSnapshot);
document.querySelector("#lth-rp-download")?.addEventListener("click", downloadLthRealizedCsv);
document.querySelector("#lth-rp-fullscreen")?.addEventListener("click", toggleLthRealizedFullscreen);
document.querySelector("#lth-rp-chart")?.addEventListener("pointermove", showLthRealizedTooltip);
document.querySelector("#lth-rp-chart")?.addEventListener("pointerleave", hideLthRealizedTooltip);
document.querySelector("#rpl-snapshot")?.addEventListener("click", saveRealizedProfitLossSnapshot);
document.querySelector("#rpl-download")?.addEventListener("click", downloadRealizedProfitLossCsv);
document.querySelector("#rpl-fullscreen")?.addEventListener("click", toggleRealizedProfitLossFullscreen);
document.querySelector("#rpl-chart")?.addEventListener("pointermove", showRealizedProfitLossTooltip);
document.querySelector("#rpl-chart")?.addEventListener("pointerleave", hideRealizedProfitLossTooltip);
document.querySelector("#median-rp-snapshot")?.addEventListener("click", saveMedianRealizedSnapshot);
document.querySelector("#median-rp-download")?.addEventListener("click", downloadMedianRealizedCsv);
document.querySelector("#median-rp-fullscreen")?.addEventListener("click", toggleMedianRealizedFullscreen);
document.querySelector("#median-rp-chart")?.addEventListener("pointermove", showMedianRealizedTooltip);
document.querySelector("#median-rp-chart")?.addEventListener("pointerleave", hideMedianRealizedTooltip);
document.querySelector("#lth-sth-snapshot")?.addEventListener("click", saveLthSthSnapshot);
document.querySelector("#lth-sth-download")?.addEventListener("click", downloadLthSthCsv);
document.querySelector("#lth-sth-fullscreen")?.addEventListener("click", toggleLthSthFullscreen);
document.querySelector("#lth-sth-chart")?.addEventListener("pointermove", showLthSthTooltip);
document.querySelector("#lth-sth-chart")?.addEventListener("pointerleave", hideLthSthTooltip);
document.querySelector("#lth-loss-snapshot")?.addEventListener("click", saveLthLossSnapshot);
document.querySelector("#lth-loss-download")?.addEventListener("click", downloadLthLossCsv);
document.querySelector("#lth-loss-fullscreen")?.addEventListener("click", toggleLthLossFullscreen);
document.querySelector("#lth-loss-chart")?.addEventListener("pointermove", showLthLossTooltip);
document.querySelector("#lth-loss-chart")?.addEventListener("pointerleave", hideLthLossTooltip);
document.querySelector("#supply-pl-snapshot")?.addEventListener("click", saveSupplyProfitLossSnapshot);
document.querySelector("#supply-pl-download")?.addEventListener("click", downloadSupplyProfitLossCsv);
document.querySelector("#supply-pl-fullscreen")?.addEventListener("click", toggleSupplyProfitLossFullscreen);
document.querySelector("#supply-pl-chart")?.addEventListener("pointermove", showSupplyProfitLossTooltip);
document.querySelector("#supply-pl-chart")?.addEventListener("pointerleave", hideSupplyProfitLossTooltip);
document.querySelector("#median-mvrv-snapshot")?.addEventListener("click", saveMedianMvrvSnapshot);
document.querySelector("#median-mvrv-download")?.addEventListener("click", downloadMedianMvrvCsv);
document.querySelector("#median-mvrv-fullscreen")?.addEventListener("click", toggleMedianMvrvFullscreen);
document.querySelector("#median-mvrv-chart")?.addEventListener("pointermove", showMedianMvrvTooltip);
document.querySelector("#median-mvrv-chart")?.addEventListener("pointerleave", hideMedianMvrvTooltip);
document.querySelector("#mvrv-bands-snapshot")?.addEventListener("click", saveMvrvBandsSnapshot);
document.querySelector("#mvrv-bands-download")?.addEventListener("click", downloadMvrvBandsCsv);
document.querySelector("#mvrv-bands-fullscreen")?.addEventListener("click", toggleMvrvBandsFullscreen);
document.querySelector("#mvrv-bands-chart")?.addEventListener("pointermove", showMvrvBandsTooltip);
document.querySelector("#mvrv-bands-chart")?.addEventListener("pointerleave", hideMvrvBandsTooltip);
document.querySelector("#mvrv-price-bands-snapshot")?.addEventListener("click", saveMvrvPriceBandsSnapshot);
document.querySelector("#mvrv-price-bands-download")?.addEventListener("click", downloadMvrvPriceBandsCsv);
document.querySelector("#mvrv-price-bands-fullscreen")?.addEventListener("click", toggleMvrvPriceBandsFullscreen);
document.querySelector("#mvrv-price-bands-chart")?.addEventListener("pointermove", showMvrvPriceBandsTooltip);
document.querySelector("#mvrv-price-bands-chart")?.addEventListener("pointerleave", hideMvrvPriceBandsTooltip);
document.querySelector("#stock-to-flow-snapshot")?.addEventListener("click", saveStockToFlowSnapshot);
document.querySelector("#stock-to-flow-download")?.addEventListener("click", downloadStockToFlowCsv);
document.querySelector("#stock-to-flow-fullscreen")?.addEventListener("click", toggleStockToFlowFullscreen);
document.querySelector("#stock-to-flow-chart")?.addEventListener("pointermove", showStockToFlowTooltip);
document.querySelector("#stock-to-flow-chart")?.addEventListener("pointerleave", hideStockToFlowTooltip);
document.querySelector("#cycle-timing-snapshot")?.addEventListener("click", saveCycleTimingSnapshot);
document.querySelector("#cycle-timing-download")?.addEventListener("click", downloadCycleTimingCsv);
document.querySelector("#cycle-timing-fullscreen")?.addEventListener("click", toggleCycleTimingFullscreen);
document.querySelector("#cycle-timing-chart")?.addEventListener("pointermove", showCycleTimingTooltip);
document.querySelector("#cycle-timing-chart")?.addEventListener("pointerleave", hideCycleTimingTooltip);
document.querySelector("#rhodl-snapshot")?.addEventListener("click", saveRhodlSnapshot);
document.querySelector("#rhodl-download")?.addEventListener("click", downloadRhodlCsv);
document.querySelector("#rhodl-fullscreen")?.addEventListener("click", toggleRhodlFullscreen);
document.querySelector("#rhodl-chart")?.addEventListener("pointermove", showRhodlTooltip);
document.querySelector("#rhodl-chart")?.addEventListener("pointerleave", hideRhodlTooltip);
document.querySelector("#lth-rpl-snapshot")?.addEventListener("click", saveLthRplSnapshot);
document.querySelector("#lth-rpl-download")?.addEventListener("click", downloadLthRplCsv);
document.querySelector("#lth-rpl-fullscreen")?.addEventListener("click", toggleLthRplFullscreen);
document.querySelector("#lth-rpl-chart")?.addEventListener("pointermove", showLthRplTooltip);
document.querySelector("#lth-rpl-chart")?.addEventListener("pointerleave", hideLthRplTooltip);
document.querySelector("#slrv-snapshot")?.addEventListener("click", saveSlrvSnapshot);
document.querySelector("#slrv-download")?.addEventListener("click", downloadSlrvCsv);
document.querySelector("#slrv-fullscreen")?.addEventListener("click", toggleSlrvFullscreen);
document.querySelector("#slrv-chart")?.addEventListener("pointermove", showSlrvTooltip);
document.querySelector("#slrv-chart")?.addEventListener("pointerleave", hideSlrvTooltip);
document.querySelector("#realized-cap-hodl-snapshot")?.addEventListener("click", saveRealizedCapHodlSnapshot);
document.querySelector("#realized-cap-hodl-download")?.addEventListener("click", downloadRealizedCapHodlCsv);
document.querySelector("#realized-cap-hodl-fullscreen")?.addEventListener("click", toggleRealizedCapHodlFullscreen);
document.querySelector("#realized-cap-hodl-chart")?.addEventListener("pointermove", showRealizedCapHodlTooltip);
document.querySelector("#realized-cap-hodl-chart")?.addEventListener("pointerleave", hideRealizedCapHodlTooltip);
document.querySelector("#lth-spent-snapshot")?.addEventListener("click", saveLthSpentSnapshot);
document.querySelector("#lth-spent-download")?.addEventListener("click", downloadLthSpentCsv);
document.querySelector("#lth-spent-fullscreen")?.addEventListener("click", toggleLthSpentFullscreen);
document.querySelector("#lth-spent-chart")?.addEventListener("pointermove", showLthSpentTooltip);
document.querySelector("#lth-spent-chart")?.addEventListener("pointerleave", hideLthSpentTooltip);
document.querySelector("#percent-profit-snapshot")?.addEventListener("click", savePercentProfitSnapshot);
document.querySelector("#percent-profit-download")?.addEventListener("click", downloadPercentProfitCsv);
document.querySelector("#percent-profit-fullscreen")?.addEventListener("click", togglePercentProfitFullscreen);
document.querySelector("#percent-profit-chart")?.addEventListener("pointermove", showPercentProfitTooltip);
document.querySelector("#percent-profit-chart")?.addEventListener("pointerleave", hidePercentProfitTooltip);
document.querySelector("#lth-exchange-loss-snapshot")?.addEventListener("click", saveLthExchangeLossSnapshot);
document.querySelector("#lth-exchange-loss-download")?.addEventListener("click", downloadLthExchangeLossCsv);
document.querySelector("#lth-exchange-loss-fullscreen")?.addEventListener("click", toggleLthExchangeLossFullscreen);
document.querySelector("#lth-exchange-loss-chart")?.addEventListener("pointermove", showLthExchangeLossTooltip);
document.querySelector("#lth-exchange-loss-chart")?.addEventListener("pointerleave", hideLthExchangeLossTooltip);
document.querySelector("#two-week-rsi-snapshot")?.addEventListener("click", saveTwoWeekRsiSnapshot);
document.querySelector("#two-week-rsi-download")?.addEventListener("click", downloadTwoWeekRsiCsv);
document.querySelector("#two-week-rsi-fullscreen")?.addEventListener("click", toggleTwoWeekRsiFullscreen);
document.querySelector("#two-week-rsi-chart")?.addEventListener("pointermove", showTwoWeekRsiTooltip);
document.querySelector("#two-week-rsi-chart")?.addEventListener("pointerleave", hideTwoWeekRsiTooltip);
document.querySelector("#under-3m-hodl-snapshot")?.addEventListener("click", saveUnder3mHodlSnapshot);
document.querySelector("#under-3m-hodl-download")?.addEventListener("click", downloadUnder3mHodlCsv);
document.querySelector("#under-3m-hodl-fullscreen")?.addEventListener("click", toggleUnder3mHodlFullscreen);
document.querySelector("#under-3m-hodl-chart")?.addEventListener("pointermove", showUnder3mHodlTooltip);
document.querySelector("#under-3m-hodl-chart")?.addEventListener("pointerleave", hideUnder3mHodlTooltip);
document.querySelector("#sth-200dma-snapshot")?.addEventListener("click", saveSth200dmaSnapshot);
document.querySelector("#sth-200dma-download")?.addEventListener("click", downloadSth200dmaCsv);
document.querySelector("#sth-200dma-fullscreen")?.addEventListener("click", toggleSth200dmaFullscreen);
document.querySelector("#sth-200dma-chart")?.addEventListener("pointermove", showSth200dmaTooltip);
document.querySelector("#sth-200dma-chart")?.addEventListener("pointerleave", hideSth200dmaTooltip);
document.querySelector("#vdd-median-snapshot")?.addEventListener("click", saveVddMedianSnapshot);
document.querySelector("#vdd-median-download")?.addEventListener("click", downloadVddMedianCsv);
document.querySelector("#vdd-median-fullscreen")?.addEventListener("click", toggleVddMedianFullscreen);
document.querySelector("#vdd-median-chart")?.addEventListener("pointermove", showVddMedianTooltip);
document.querySelector("#vdd-median-chart")?.addEventListener("pointerleave", hideVddMedianTooltip);
document.querySelector("#ssr-snapshot")?.addEventListener("click", saveSsrSnapshot);
document.querySelector("#ssr-download")?.addEventListener("click", downloadSsrCsv);
document.querySelector("#ssr-fullscreen")?.addEventListener("click", toggleSsrFullscreen);
document.querySelector("#ssr-chart")?.addEventListener("pointermove", showSsrTooltip);
document.querySelector("#ssr-chart")?.addEventListener("pointerleave", hideSsrTooltip);
document.querySelector("#sth-bands-snapshot")?.addEventListener("click", saveSthBandsSnapshot);
document.querySelector("#sth-bands-download")?.addEventListener("click", downloadSthBandsCsv);
document.querySelector("#sth-bands-fullscreen")?.addEventListener("click", toggleSthBandsFullscreen);
document.querySelector("#sth-bands-chart")?.addEventListener("pointermove", showSthBandsTooltip);
document.querySelector("#sth-bands-chart")?.addEventListener("pointerleave", hideSthBandsTooltip);
document.querySelector("#percent-profit-ex-10y-snapshot")?.addEventListener("click", savePercentProfitEx10ySnapshot);
document.querySelector("#percent-profit-ex-10y-download")?.addEventListener("click", downloadPercentProfitEx10yCsv);
document.querySelector("#percent-profit-ex-10y-fullscreen")?.addEventListener("click", togglePercentProfitEx10yFullscreen);
document.querySelector("#percent-profit-ex-10y-chart")?.addEventListener("pointermove", showPercentProfitEx10yTooltip);
document.querySelector("#percent-profit-ex-10y-chart")?.addEventListener("pointerleave", hidePercentProfitEx10yTooltip);
document.querySelector("#sth-mvrv-snapshot")?.addEventListener("click", saveSthMvrvSnapshot);
document.querySelector("#sth-mvrv-download")?.addEventListener("click", downloadSthMvrvCsv);
document.querySelector("#sth-mvrv-fullscreen")?.addEventListener("click", toggleSthMvrvFullscreen);
document.querySelector("#sth-mvrv-chart")?.addEventListener("pointermove", showSthMvrvTooltip);
document.querySelector("#sth-mvrv-chart")?.addEventListener("pointerleave", hideSthMvrvTooltip);
document.querySelector("#vdd-snapshot")?.addEventListener("click", saveVddSnapshot);
document.querySelector("#vdd-download")?.addEventListener("click", downloadVddCsv);
document.querySelector("#vdd-fullscreen")?.addEventListener("click", toggleVddFullscreen);
document.querySelector("#vdd-chart")?.addEventListener("pointermove", showVddTooltip);
document.querySelector("#vdd-chart")?.addEventListener("pointerleave", hideVddTooltip);
document.querySelector("#lth-nupl-snapshot")?.addEventListener("click", saveLthNuplSnapshot);
document.querySelector("#lth-nupl-download")?.addEventListener("click", downloadLthNuplCsv);
document.querySelector("#lth-nupl-fullscreen")?.addEventListener("click", toggleLthNuplFullscreen);
document.querySelector("#lth-nupl-chart")?.addEventListener("pointermove", showLthNuplTooltip);
document.querySelector("#lth-nupl-chart")?.addEventListener("pointerleave", hideLthNuplTooltip);
const retryLthSthLoading = (event) => {
  const loading = event.currentTarget;
  if (!loading.classList.contains("is-error")) return;
  if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  loadLthSthMetrics().catch((error) => console.warn("LTH/STH ratio retry failed", error));
};
document.querySelector("#lth-sth-loading")?.addEventListener("click", retryLthSthLoading);
document.querySelector("#lth-sth-loading")?.addEventListener("keydown", retryLthSthLoading);
const retryLthLossLoading = (event) => {
  const loading = event.currentTarget;
  if (!loading.classList.contains("is-error")) return;
  if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  loadLthLossMetrics().catch((error) => console.warn("LTH market cap in loss retry failed", error));
};
document.querySelector("#lth-loss-loading")?.addEventListener("click", retryLthLossLoading);
document.querySelector("#lth-loss-loading")?.addEventListener("keydown", retryLthLossLoading);
const retrySupplyProfitLossLoading = (event) => {
  const loading = event.currentTarget;
  if (!loading.classList.contains("is-error")) return;
  if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  loadSupplyProfitLossMetrics().catch((error) => console.warn("Supply profit/loss ratio retry failed", error));
};
document.querySelector("#supply-pl-loading")?.addEventListener("click", retrySupplyProfitLossLoading);
document.querySelector("#supply-pl-loading")?.addEventListener("keydown", retrySupplyProfitLossLoading);
const retryMedianMvrvLoading = (event) => {
  const loading = event.currentTarget;
  if (!loading.classList.contains("is-error")) return;
  if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  loadMedianRealizedMetrics().catch((error) => console.warn("Median MVRV retry failed", error));
};
document.querySelector("#median-mvrv-loading")?.addEventListener("click", retryMedianMvrvLoading);
document.querySelector("#median-mvrv-loading")?.addEventListener("keydown", retryMedianMvrvLoading);
const retryMvrvBandsLoading = (event) => {
  const loading = event.currentTarget;
  if (!loading.classList.contains("is-error")) return;
  if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  loadMvrvBandsMetrics().catch((error) => console.warn("MVRV bands retry failed", error));
};
document.querySelector("#mvrv-bands-loading")?.addEventListener("click", retryMvrvBandsLoading);
document.querySelector("#mvrv-bands-loading")?.addEventListener("keydown", retryMvrvBandsLoading);
document.querySelector("#mvrv-price-bands-loading")?.addEventListener("click", retryMvrvBandsLoading);
document.querySelector("#mvrv-price-bands-loading")?.addEventListener("keydown", retryMvrvBandsLoading);
const retryStockToFlowLoading = (event) => {
  const loading = event.currentTarget;
  if (!loading.classList.contains("is-error")) return;
  if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  loadStockToFlowMetrics().catch((error) => console.warn("Stock-to-Flow retry failed", error));
};
document.querySelector("#stock-to-flow-loading")?.addEventListener("click", retryStockToFlowLoading);
document.querySelector("#stock-to-flow-loading")?.addEventListener("keydown", retryStockToFlowLoading);
const retryCycleTimingLoading = (event) => {
  const loading = event.currentTarget;
  if (!loading.classList.contains("is-error")) return;
  if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  loadCycleTimingMetrics().catch((error) => console.warn("Cycle timing retry failed", error));
};
document.querySelector("#cycle-timing-loading")?.addEventListener("click", retryCycleTimingLoading);
document.querySelector("#cycle-timing-loading")?.addEventListener("keydown", retryCycleTimingLoading);
const retryRhodlLoading = (event) => {
  const loading = event.currentTarget;
  if (!loading.classList.contains("is-error")) return;
  if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  loadRhodlMetrics().catch((error) => console.warn("RHODL retry failed", error));
};
document.querySelector("#rhodl-loading")?.addEventListener("click", retryRhodlLoading);
document.querySelector("#rhodl-loading")?.addEventListener("keydown", retryRhodlLoading);
const retryLthRplLoading = (event) => {
  const loading = event.currentTarget;
  if (!loading.classList.contains("is-error")) return;
  if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  loadLthRplMetrics().catch((error) => console.warn("LTH realized profit/loss retry failed", error));
};
document.querySelector("#lth-rpl-loading")?.addEventListener("click", retryLthRplLoading);
document.querySelector("#lth-rpl-loading")?.addEventListener("keydown", retryLthRplLoading);
const retrySlrvLoading = (event) => {
  const loading = event.currentTarget;
  if (!loading.classList.contains("is-error")) return;
  if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  loadSlrvMetrics().catch((error) => console.warn("SLRV retry failed", error));
};
document.querySelector("#slrv-loading")?.addEventListener("click", retrySlrvLoading);
document.querySelector("#slrv-loading")?.addEventListener("keydown", retrySlrvLoading);
const retryRealizedCapHodlLoading = (event) => {
  const loading = event.currentTarget;
  if (!loading.classList.contains("is-error")) return;
  if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  loadRealizedCapHodlMetrics().catch((error) => console.warn("Realized Cap HODL waves retry failed", error));
};
document.querySelector("#realized-cap-hodl-loading")?.addEventListener("click", retryRealizedCapHodlLoading);
document.querySelector("#realized-cap-hodl-loading")?.addEventListener("keydown", retryRealizedCapHodlLoading);
const retryLthSpentLoading = (event) => {
  const loading = event.currentTarget;
  if (!loading.classList.contains("is-error")) return;
  if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  loadLthSpentMetrics().catch((error) => console.warn("LTH Spent Price retry failed", error));
};
document.querySelector("#lth-spent-loading")?.addEventListener("click", retryLthSpentLoading);
document.querySelector("#lth-spent-loading")?.addEventListener("keydown", retryLthSpentLoading);
const retryPercentProfitLoading = (event) => {
  const loading = event.currentTarget;
  if (!loading.classList.contains("is-error")) return;
  if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  loadPercentProfitMetrics().catch((error) => console.warn("Percent Supply in Profit retry failed", error));
};
document.querySelector("#percent-profit-loading")?.addEventListener("click", retryPercentProfitLoading);
document.querySelector("#percent-profit-loading")?.addEventListener("keydown", retryPercentProfitLoading);
const retryLthExchangeLossLoading = (event) => {
  const loading = event.currentTarget;
  if (!loading.classList.contains("is-error")) return;
  if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  loadLthExchangeLossMetrics().catch((error) => console.warn("LTH exchange-loss proxy retry failed", error));
};
document.querySelector("#lth-exchange-loss-loading")?.addEventListener("click", retryLthExchangeLossLoading);
document.querySelector("#lth-exchange-loss-loading")?.addEventListener("keydown", retryLthExchangeLossLoading);
const retryTwoWeekRsiLoading = (event) => {
  const loading = event.currentTarget;
  if (!loading.classList.contains("is-error")) return;
  if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  loadTwoWeekRsiMetrics().catch((error) => console.warn("Two-week RSI retry failed", error));
};
document.querySelector("#two-week-rsi-loading")?.addEventListener("click", retryTwoWeekRsiLoading);
document.querySelector("#two-week-rsi-loading")?.addEventListener("keydown", retryTwoWeekRsiLoading);
const retryUnder3mHodlLoading = (event) => {
  const loading = event.currentTarget;
  if (!loading.classList.contains("is-error")) return;
  if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  loadUnder3mHodlMetrics().catch((error) => console.warn("Under-3m Realized Cap HODL Waves retry failed", error));
};
document.querySelector("#under-3m-hodl-loading")?.addEventListener("click", retryUnder3mHodlLoading);
document.querySelector("#under-3m-hodl-loading")?.addEventListener("keydown", retryUnder3mHodlLoading);
const retrySth200dmaLoading = (event) => {
  const loading = event.currentTarget;
  if (!loading.classList.contains("is-error")) return;
  if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  loadSth200dmaMetrics().catch((error) => console.warn("STH / 200DMA retry failed", error));
};
document.querySelector("#sth-200dma-loading")?.addEventListener("click", retrySth200dmaLoading);
document.querySelector("#sth-200dma-loading")?.addEventListener("keydown", retrySth200dmaLoading);
const retryVddMedianLoading = (event) => {
  const loading = event.currentTarget;
  if (!loading.classList.contains("is-error")) return;
  if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  loadVddMedianMetrics().catch((error) => console.warn("VDD / Median cycle retry failed", error));
};
document.querySelector("#vdd-median-loading")?.addEventListener("click", retryVddMedianLoading);
document.querySelector("#vdd-median-loading")?.addEventListener("keydown", retryVddMedianLoading);
const retrySsrLoading = (event) => {
  const loading = event.currentTarget;
  if (!loading.classList.contains("is-error")) return;
  if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  loadSsrMetrics().catch((error) => console.warn("Stablecoin Supply Ratio retry failed", error));
};
document.querySelector("#ssr-loading")?.addEventListener("click", retrySsrLoading);
document.querySelector("#ssr-loading")?.addEventListener("keydown", retrySsrLoading);
const retrySthBandsLoading = (event) => {
  const loading = event.currentTarget;
  if (!loading.classList.contains("is-error")) return;
  if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  loadSthBandsMetrics().catch((error) => console.warn("STH cost basis bands retry failed", error));
};
document.querySelector("#sth-bands-loading")?.addEventListener("click", retrySthBandsLoading);
document.querySelector("#sth-bands-loading")?.addEventListener("keydown", retrySthBandsLoading);
const retryPercentProfitEx10yLoading = (event) => {
  const loading = event.currentTarget;
  if (!loading.classList.contains("is-error")) return;
  if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  loadPercentProfitEx10yMetrics().catch((error) => console.warn("Percent Supply in Profit Ex >10y retry failed", error));
};
document.querySelector("#percent-profit-ex-10y-loading")?.addEventListener("click", retryPercentProfitEx10yLoading);
document.querySelector("#percent-profit-ex-10y-loading")?.addEventListener("keydown", retryPercentProfitEx10yLoading);
const retrySthMvrvLoading = (event) => {
  const loading = event.currentTarget;
  if (!loading.classList.contains("is-error")) return;
  if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  loadSthMvrvMetrics().catch((error) => console.warn("STH-MVRV retry failed", error));
};
document.querySelector("#sth-mvrv-loading")?.addEventListener("click", retrySthMvrvLoading);
document.querySelector("#sth-mvrv-loading")?.addEventListener("keydown", retrySthMvrvLoading);
const retryVddLoading = (event) => {
  const loading = event.currentTarget;
  if (!loading.classList.contains("is-error")) return;
  if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  loadVddMetrics().catch((error) => console.warn("VDD Multiple retry failed", error));
};
document.querySelector("#vdd-loading")?.addEventListener("click", retryVddLoading);
document.querySelector("#vdd-loading")?.addEventListener("keydown", retryVddLoading);
const retryLthNuplLoading = (event) => {
  const loading = event.currentTarget;
  if (!loading.classList.contains("is-error")) return;
  if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  loadLthNuplMetrics().catch((error) => console.warn("LTH-NUPL retry failed", error));
};
document.querySelector("#lth-nupl-loading")?.addEventListener("click", retryLthNuplLoading);
document.querySelector("#lth-nupl-loading")?.addEventListener("keydown", retryLthNuplLoading);
document.addEventListener("fullscreenchange", () => window.setTimeout(() => {
  hideCostBasisTooltip();
  hideSthRatioTooltip();
  hideLthRealizedTooltip();
  hideRealizedProfitLossTooltip();
  hideMedianRealizedTooltip();
  hideLthSthTooltip();
  hideLthLossTooltip();
  hideSupplyProfitLossTooltip();
  hideMedianMvrvTooltip();
  hideMvrvBandsTooltip();
  hideMvrvPriceBandsTooltip();
  hideStockToFlowTooltip();
  hideCycleTimingTooltip();
  hideRhodlTooltip();
  hideLthRplTooltip();
  hideSlrvTooltip();
  hideRealizedCapHodlTooltip();
  hideLthSpentTooltip();
  hidePercentProfitTooltip();
  hideLthExchangeLossTooltip();
  hideTwoWeekRsiTooltip();
  hideUnder3mHodlTooltip();
  hideSth200dmaTooltip();
  hideVddMedianTooltip();
  hideSsrTooltip();
  hideSthBandsTooltip();
  hidePercentProfitEx10yTooltip();
  hideVddTooltip();
  hideLthNuplTooltip();
  drawCostBasisChart();
  drawSthRatioChart();
  drawLthRealizedChart();
  drawRealizedProfitLossChart();
  drawMedianRealizedChart();
  drawLthSthChart();
  drawLthLossChart();
  drawSupplyProfitLossChart();
  drawMedianMvrvChart();
  drawMvrvBandsChart();
  drawMvrvPriceBandsChart();
  drawStockToFlowChart();
  drawCycleTimingChart();
  drawRhodlChart();
  drawLthRplChart();
  drawSlrvChart();
  drawRealizedCapHodlChart();
  drawLthSpentChart();
  drawPercentProfitChart();
  drawLthExchangeLossChart();
  drawTwoWeekRsiChart();
  drawUnder3mHodlChart();
  drawSth200dmaChart();
  drawVddMedianCycleChart();
  drawSsrChart();
  drawSthBandsChart();
  drawPercentProfitEx10yChart();
  drawSthMvrvChart();
  drawVddChart();
  drawLthNuplChart();
}, 80));

document.querySelectorAll("[data-metric-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    const filter = button.dataset.metricFilter;
    document.querySelectorAll("[data-metric-filter]").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelectorAll("[data-metric-group]").forEach((card) => {
      card.classList.toggle("is-filtered", filter !== "all" && card.dataset.metricGroup !== filter);
    });
  });
});

document.querySelector("#electricity-input")?.addEventListener("input", (event) => {
  setText("#electricity-value", `$${Number(event.target.value).toFixed(3)}/kWh`);
});

const sectionObserver = new IntersectionObserver((entries) => {
  const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (!visible) return;
  document.querySelectorAll("[data-section-link]").forEach((link) => {
    link.classList.toggle("active", link.dataset.sectionLink === visible.target.id);
  });
}, { rootMargin: "-28% 0px -62%", threshold: [0, 0.1, 0.35] });

document.querySelectorAll("#overview, #onchain-carousel, #valuation, #network, #charts, #reference").forEach((section) => sectionObserver.observe(section));

const watermarkStages = document.querySelectorAll(".cost-basis-stage");
if ("IntersectionObserver" in window) {
  const watermarkObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => entry.target.classList.toggle("is-watermark-visible", entry.isIntersecting));
  }, { rootMargin: "140px 0px", threshold: 0.02 });
  watermarkStages.forEach((stage) => watermarkObserver.observe(stage));
} else {
  watermarkStages.forEach((stage) => stage.classList.add("is-watermark-visible"));
}

window.addEventListener("resize", () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(drawAllCharts, 120);
});

let clockTimer = null;
const scheduleClock = () => {
  window.clearTimeout(clockTimer);
  if (document.hidden) return;
  updateClock();
  clockTimer = window.setTimeout(scheduleClock, 1000 - (Date.now() % 1000));
};
document.addEventListener("visibilitychange", () => {
  scheduleClock();
  if (!document.hidden) {
    if (analysisSyncStarted) void syncAnalysisData();
    else scheduleAnalysisSync();
  }
});
window.setInterval(() => {
  if (document.visibilityState === "visible") syncData();
}, 30 * 60 * 1000);
setupTrendNavigator();
applyLanguage();
scheduleClock();
syncData();
