# 页面与平台索引

本项目由一个 Next.js 应用统一承载，各平台共享登录、会员权限、数据库和公共组件。保留现有目录结构，在同一个 GitHub 仓库维护和部署。

| 页面 / 平台 | 路由 | 主要源码 |
| --- | --- | --- |
| 首页 | `/` | `app/page.tsx`、`index.html`、`home-*.js` |
| 链上数据 Dashboard | `/dashboard` | `app/dashboard/`、`dashboard*`、`api/` |
| AlphaOps | `/alphaops` | `app/alphaops/`、`alphaops.html` |
| Alpha Radar | `/alpha-radar` | `app/alpha-radar/`、`alpha-radar.html`、`alpha-scanner*` |
| AI 内容运营 | `/ai-ops` | `app/ai-ops/`、`ai-ops*`、`api/ai-ops-*` |
| BStock Alpha | `/bstock-alpha` | `app/bstock-alpha/`、`bstock-*`、`lib/bstock-*` |
| AI 网格交易 Ops | `/grid-ops` | `app/grid-ops/`、`grid-ops/` |
| AIClassic 网格 | `/classic-grid` | `app/classic-grid/`、`classic-grid/`、`lib/classic-grid/` |
| TideSight 量化与 MACD | `/tidesight-quant`、`/tidesight-quant/macd` | `app/tidesight-quant/`、`lib/tidesight/` |
| 量化交易集（六引擎） | `/quant-suite`、`/quant-suite/[engine]` | `components/quant-suite-surface.tsx`、`lib/quant-suite/`、`quant-runtime/` |
| 研究档案 | `/research` | `app/research/`、`lib/research-*` |
| 排行榜 | `/rankings` | `app/rankings/`、`lib/binance-square-*` |
| 工具箱 | `/toolbox` | `app/toolbox/`、`lib/toolbox*` |
| 交易节奏 | `/trading-beats` | `app/trading-beats/` |
| 顶级交易员雷达 | `/top-trader-radar` | `app/top-trader-radar/` |
| 加密百晓生 | `/crypto-baixiaosheng` | `app/crypto-baixiaosheng/` |
| 合约交易助手 | `/contract-trading-assistant` | `app/contract-trading-assistant/` |
| 多交易所套利 | `/multi-exchange-arbitrage` | `app/multi-exchange-arbitrage/` |
| 登录与个人中心 | `/login`、`/account/*` | `app/login/`、`app/account/`、`app/auth/` |
| 管理后台 | `/admin/*` | `app/admin/`、`app/actions/admin*` |
| 浏览器扩展 | 浏览器安装入口 | `chrome-extension/` |

公共 UI 位于 `components/`，服务端接口位于 `app/api/` 和 `api/`，数据库结构及迁移位于 `prisma/` 和 `db/migrations/`，验证用例位于 `tests/` 及两个网格模块的 `test/`。

## GitHub 与 Vercel

- GitHub 仓库：`nefepitelon/web`。
- Vercel 项目：`welinkbtc-main`，根目录为仓库根目录，生产分支为 `main`。
- 推送 `main` 后由现有 Git 集成触发部署；构建命令使用 `package.json` 中的 `npm run build`。
- 构建会生成网格引擎下载包、生成 Prisma Client，并在 Vercel 生产环境执行数据库迁移。生产构建需要已配置的数据库环境变量。
- `classic-grid/` 的源码直接纳入主仓库，不依赖子模块拉取。

## 私密配置边界

真实配置只保留在本地环境文件或 Vercel Environment Variables 中。`.env*`、`.vercel/`、私钥文件、交易运行状态、账户数据、日志、本地截图和历史备份均由 `.gitignore` 排除。不要使用 `git add -f` 绕过这些规则。

仓库保留构建所需的 `next.config.ts`、`vercel.json`、依赖清单和数据库结构；这些文件不包含真实凭据。`grid-ops/env.example` 仅提供无密钥的模拟盘默认值，用于生成首次启动配置。

本地已有 `.env.example` 可继续作为私人参考；GitHub 副本不包含 `.env*` 文件。部署时沿用 Vercel 已配置的环境变量，勿将其复制进源码。

验证命令：`npm run typecheck`、`npm test`、`npm run grid:test`、`npm run classic-grid:test`。
