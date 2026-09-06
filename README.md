# welinkBTC Membership Platform

页面、平台源码目录与 GitHub / Vercel 发布说明见 [项目平台索引](docs/PROJECT-PLATFORMS.md)。真实环境配置、API Key、私钥和账户运行数据不纳入仓库。

welinkBTC 已从静态展示站升级为带服务端身份、权限、订阅、推荐与运营后台的会员平台。现有首页、AlphaOps、Alpha Radar、Dashboard、AI 网格交易 Ops 和 AI Ops 继续保留原视觉与数据能力，并通过 Next.js App Router 统一提供干净路由与会员 Gate。

## 已实现范围（Phase 0–7）

- **Phase 0 — App 迁移**：`/`、`/alphaops`、`/alpha-radar`、`/dashboard`、`/ai-ops` 均由 Next.js 路由承载，现有静态资产通过受限 legacy route 兼容运行。
- **Phase 1 — 身份认证**：仅邮箱魔法链接与 Google OAuth；使用 Supabase Auth 服务端 Cookie 会话，不提供密码或钱包登录。
- **Phase 2 — 个人中心**：账户总览、个人资料、严格的 `{handle}.welinkBTC` 用户名、推荐码与邀请归因。
- **Phase 3 — 权限 Gate**：Guest、Free、Pro、Max、Admin 五种展示状态；受保护 member API 在服务端校验 entitlement。
- **Phase 4 — 订阅**：Stripe Checkout、Customer Portal、签名 Webhook、幂等事件、订阅过期降级和返佣流水。
- **Phase 5 — 连接**：X/Twitter OAuth、Discord OAuth、EVM 钱包签名绑定、Solana 接口预留、Privy adapter 与字段预留。
- **Phase 6 — 安全**：Supabase TOTP、一次性备份码摘要、AAL2 会话、邮箱频率限制、OAuth state、同源检查。
- **Phase 7 — 后台**：用户、角色、订阅、推荐返佣、内容 Gate、系统规则与只读审计日志；管理员强制 2FA。

## 核心路由

```text
/login                       邮箱 / Google 登录
/onboarding/username         首次用户名设置
/account                     个人中心总览
/account/profile             个人资料
/account/connections         X、Discord、Web3 钱包绑定
/account/security            TOTP 2FA 与备份码
/account/subscription        Free / Pro / Max 订阅
/account/api-keys            Max API Key
/research                    分层研究档案
/grid-ops                    AI 网格交易 Ops（本地引擎 / 线上服务器托管可选）
/classic-grid                AIClassic 网格（服务器托管八所经典网格）
/admin                       管理后台（Admin + 2FA）
```

## AI 网格交易 Ops

进入顶部导航“AI网格交易Ops”后可先选择运行方式：本地交易引擎，或无需下载且关闭网页后仍持续运行的线上服务器托管。选择保存在当前浏览器，并可在控制台顶部随时切换。

本地模式下，`npm install` 会一并安装网格交易模块所需依赖；`npm run dev` 和 `npm start` 会同时启动 welinkBTC 与只监听本机的网格服务。可使用 Decibel、Extended、RISEx、Binance USDⓈ-M Futures、Ondo Perps、Phoenix、Nado、OKX、GRVT 与 RHC Lighter 总览、独立网格控制台、AI 助手和代理配置。线上托管模式复用平台的 Durable Workflow AIClassic 八所网格基础设施，配置经 AES-256-GCM 加密后由服务器持久运行。

默认全部使用 `paper` 模拟盘和 10,000 USDC 虚拟余额，不需要 API 密钥。切换实盘前，复制 `grid-ops/.env.example` 为 `grid-ops/.env`，只把需要实盘的交易所改为 `live` 并补齐对应凭据。私钥只保存在该本地文件中；请先在模拟盘或测试网完整验证策略。

网格模块可单独验证：

```powershell
npm run grid:test
npm run grid:smoke
```

## 技术结构

- Next.js 16 App Router + React 19 + TypeScript
- Supabase Auth（邮箱 Magic Link + Google）
- PostgreSQL + Prisma
- Stripe Billing
- Supabase MFA TOTP
- EVM personal-sign + viem 验签

敏感权限不依赖前端遮罩。公开预览仅负责体验；完整研究、Max 信号与 API 响应都在服务端重新检查当前用户、订阅和 2FA 状态。

## 环境配置

复制 `.env.example` 为 `.env.local`，不要提交真实密钥。

最小登录配置：

```text
NEXT_PUBLIC_APP_URL=https://your-domain.example
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
DATABASE_URL=
DIRECT_URL=
TWO_FACTOR_SIGNING_KEY=至少32位随机字符串
OAUTH_STATE_SIGNING_KEY=至少32位随机字符串
ADMIN_EMAILS=admin@example.com
```

Supabase 中需要：

1. 打开 Email Magic Link；关闭密码作为产品入口。
2. 配置 Google provider。
3. 将 `https://your-domain.example/auth/callback` 加入允许的 Redirect URL。
4. 启用 TOTP MFA。
5. 使用 Supabase Postgres 的 pooled URL 作为 `DATABASE_URL`，direct URL 作为 `DIRECT_URL`。

Stripe 订阅配置：

```text
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRO_PRICE_ID=
STRIPE_MAX_PRICE_ID=
```

Webhook 地址：

```text
POST https://your-domain.example/api/billing/webhook
```

至少订阅以下事件：

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.payment_succeeded
invoice.payment_failed
```

X / Twitter 绑定使用 Supabase Auth 的 `X / Twitter (OAuth 2.0)` Provider，并需在 Supabase Auth 设置中开启 Manual Linking；X 密钥无需重复写入 Vercel 环境变量。

Discord 社交绑定为可选配置：

```text
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
```

对应回调：

```text
https://<SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback
/api/connections/discord/callback
```

Privy 默认关闭：

```text
ENABLE_PRIVY_EMBEDDED_WALLET=false
PRIVY_APP_ID=
PRIVY_APP_SECRET=
```

## 数据库初始化

```powershell
npm run db:migrate
npm run db:seed
```

Migration 会创建用户、资料、角色、订阅、社交账户、钱包、2FA、推荐、返佣、内容 Gate、API Key、Webhook 幂等记录和审计日志等表。Seed 会建立 Free / Pro / Max 方案、默认 entitlement 与返佣规则。

`ADMIN_EMAILS` 中的邮箱首次登录时会自动获得 admin role，但在启用 2FA 前无法访问 `/admin`。

## 本地验证

```powershell
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

没有真实 Supabase、Postgres 或 Stripe 凭证时，公开页面和构建仍可运行；登录、持久化与付款入口会明确显示“等待配置”，不会回退为前端伪登录。

## 现有数据接口

原有 CryptoQuant、Coinglass、Telegram 信号、SURF 研究与 AI Ops 接口继续保留在 `/api`。相关环境变量仍列在 `.env.example`。新增的会员敏感载荷统一位于 `/api/member/*`，并在服务端执行订阅校验。
