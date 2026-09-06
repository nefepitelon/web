export type ClassicGridMode = "paper" | "live";

export type EnvironmentChoice = {
  label: string;
  value: string;
};

export type EnvironmentField = {
  key: string;
  label: string;
  help: string;
  source: string;
  defaultValue?: string;
  placeholder?: string;
  kind?: "text" | "password" | "number" | "select" | "textarea";
  choices?: EnvironmentChoice[];
  required?: boolean;
  requiredForLive?: boolean;
  runtime?: boolean;
  readOnly?: boolean;
  wide?: boolean;
  min?: number;
  max?: number;
  step?: number;
};

export type EnvironmentGroup = {
  id: string;
  title: string;
  description: string;
  sourceUrl?: string;
  sourceLabel?: string;
  venue?: string;
  fields: EnvironmentField[];
};

export const CLASSIC_GRID_VENUE_OPTIONS = [
  { value: "extended", label: "Extended" },
  { value: "risex", label: "RISEx" },
  { value: "decibel", label: "Decibel" },
  { value: "n1", label: "N1" },
  { value: "phoenix", label: "Phoenix" },
  { value: "phoenix2", label: "Phoenix2" },
  { value: "nado", label: "Nado" },
  { value: "popdex", label: "PopDEX" }
] as const;

const DEFAULT_VENUES = CLASSIC_GRID_VENUE_OPTIONS.map((venue) => venue.value).join(",");

const binaryChoices: EnvironmentChoice[] = [
  { label: "启用（1）", value: "1" },
  { label: "关闭（0）", value: "0" }
];

const booleanChoices: EnvironmentChoice[] = [
  { label: "启用（true）", value: "true" },
  { label: "关闭（false）", value: "false" }
];

export const CLASSIC_GRID_ENVIRONMENT_GROUPS: EnvironmentGroup[] = [
  {
    id: "global",
    title: "全局运行与策略",
    description: "决定模拟/实盘模式、启用的交易场所、轮询频率，以及全部场所共用的网格参数。",
    fields: [
      { key: "DRY_RUN", label: "运行模式", defaultValue: "1", kind: "select", choices: binaryChoices, required: true, runtime: false, readOnly: true, help: "由上方“模拟盘 / 生产实盘”选项自动控制。1 仅模拟，0 会真实下单。", source: "无需获取；在本界面选择运行模式。" },
      { key: "LIVE_CONFIRM", label: "实盘总开关", defaultValue: "", readOnly: true, runtime: false, help: "实盘启动时由系统在完成双重验证和风险确认后自动设置为 YES。", source: "无需填写；由 WELINKBTC 安全门禁生成。" },
      { key: "VENUES", label: "启用交易场所", defaultValue: DEFAULT_VENUES, required: true, wide: true, help: "通过复选框选择，系统会按固定顺序自动生成 VENUES，不能手动输入。", source: "按你已经开通并准备使用的交易所选择；模拟盘可保留全部。" },
      { key: "MARKETS", label: "交易市场", defaultValue: "BTC", required: true, help: "用英文逗号分隔，当前策略以 BTC 为默认和主要验证市场。", source: "交易所合约市场代码，例如 BTC。" },
      { key: "TICK_MS", label: "策略轮询间隔", defaultValue: "15000", kind: "number", required: true, min: 5000, max: 900000, step: 1000, help: "每轮读取行情和调整订单的间隔，单位毫秒；服务器最低允许 5000。", source: "策略参数；一般保留默认 15000。" },
      { key: "GRID_LEVERAGE", label: "默认杠杆", defaultValue: "30", kind: "number", required: true, min: 1, max: 100, step: 1, help: "未设置交易所专属杠杆时使用。高杠杆会显著增加爆仓风险。", source: "依据账户风险承受能力设置。" },
      { key: "GRID_MARGIN_FRAC", label: "网格保证金比例", defaultValue: "0.7", kind: "number", required: true, min: 0.05, max: 1, step: 0.05, help: "可用权益中允许网格占用的比例，0.7 表示 70%。", source: "策略参数；建议先用模拟盘验证。" },
      { key: "GRID_HALF_BAND", label: "默认半带宽", defaultValue: "3000", kind: "number", required: true, min: 100, max: 1000000, step: 100, help: "以中间价为中心，网格单侧覆盖的价格距离。", source: "根据 BTC 波动率和期望网格范围设置。" },
      { key: "DASHBOARD_PORT", label: "原版看板端口", defaultValue: "8088", kind: "number", runtime: false, readOnly: true, help: "仅供原项目本地部署参考。WELINKBTC 云端看板由站内路由提供，不开放独立端口。", source: "固定参考值 8088；云端不会读取。" },
      { key: "GRID_SKIP_LEVERAGE", label: "跳过杠杆设置", defaultValue: "0", kind: "select", choices: binaryChoices, help: "设为 1 时不主动调用交易所杠杆设置接口。", source: "交易所账户已预先设置好杠杆时可启用。" },
      { key: "SOFT_RESUME", label: "软恢复", defaultValue: "1", kind: "select", choices: binaryChoices, help: "重启后尽量沿用已有网格状态，减少重复下单。", source: "建议保持启用。" }
    ]
  },
  {
    id: "extended",
    venue: "extended",
    title: "Extended",
    description: "Starknet 永续合约账户和代理配置。实盘至少需要 API Key 与 Stark 私钥。",
    sourceUrl: "https://app.extended.exchange/",
    sourceLabel: "打开 Extended",
    fields: [
      { key: "EXTENDED_API_KEY", label: "API Key", kind: "password", requiredForLive: true, help: "用于访问 Extended 交易接口；请只开交易权限并关闭提现。", source: "Extended → Account / API Management 创建。" },
      { key: "EXTENDED_STARK_PRIVATE_KEY", label: "Stark 私钥", kind: "password", requiredForLive: true, help: "用于签署订单，属于最高敏感信息。", source: "Extended API 凭据创建流程或账户导出结果。" },
      { key: "EXTENDED_STARK_PUBLIC_KEY", label: "Stark 公钥", kind: "password", help: "部分账户配置会要求显式提供；留空时由 SDK 按账户信息处理。", source: "与 Stark 私钥同一份 Extended API 凭据。" },
      { key: "EXTENDED_VAULT_ID", label: "Vault ID", placeholder: "例如 12345", help: "Extended 账户金库编号；与 EXTENDED_VAULT 二选一。", source: "Extended API 页面或账户接口返回的 vault id。" },
      { key: "EXTENDED_VAULT", label: "Vault", placeholder: "与 Vault ID 二选一", help: "Vault ID 的兼容字段；两个都填写时优先使用 EXTENDED_VAULT。", source: "Extended 账户/API 信息。" },
      { key: "EXTENDED_API_URL", label: "API 地址", defaultValue: "https://api.starknet.extended.exchange", required: true, wide: true, help: "仅允许 Extended 官方域名，防止交易请求被导向内网或仿冒服务。", source: "Extended 官方接口文档。" },
      { key: "EXTENDED_USE_PROXY", label: "启用专用代理", defaultValue: "0", kind: "select", choices: binaryChoices, help: "仅影响 Extended；代理地址仍会经过私网和协议安全检查。", source: "网络无法直连 Extended 时由你的可信代理服务商提供。" },
      { key: "EXTENDED_PROXY", label: "代理地址", kind: "password", placeholder: "http://user:pass@host:port", help: "可选 HTTP/HTTPS/SOCKS 代理；不要使用来源不明的公共代理。", source: "可信代理服务商控制台。" },
      { key: "EXTENDED_LEVERAGE", label: "专属杠杆", kind: "number", min: 1, max: 100, step: 1, help: "留空则使用 GRID_LEVERAGE。", source: "按 Extended 账户风险设置。" },
      { key: "EXTENDED_ORDER_GAP_MS", label: "下单间隔", kind: "number", min: 0, max: 120000, step: 100, placeholder: "400", help: "连续订单之间的等待毫秒数；留空使用引擎默认值 400。", source: "遇到限频时适当调大。" }
    ]
  },
  {
    id: "risex",
    venue: "risex",
    title: "RISEx",
    description: "Rise Trade 账户、签名密钥和专属网格参数。",
    sourceUrl: "https://rise.trade/",
    sourceLabel: "打开 Rise Trade",
    fields: [
      { key: "RISEX_ACCOUNT", label: "账户地址", requiredForLive: true, placeholder: "0x…", help: "用于识别交易账户的链上地址。", source: "Rise Trade 账户页或已连接钱包地址。" },
      { key: "RISEX_SIGNER_KEY", label: "签名私钥", kind: "password", requiredForLive: true, help: "用于签署 RISEx 订单；请勿使用含有多余资产的钱包。", source: "Rise Trade 授权交易钱包或专用 signer。" },
      { key: "RISEX_API_URL", label: "REST API 地址", defaultValue: "https://api.rise.trade", required: true, help: "只允许 rise.trade 官方域名。", source: "Rise Trade 官方接口文档。" },
      { key: "RISEX_WS_URL", label: "WebSocket 地址", defaultValue: "wss://ws.rise.trade/ws", required: true, help: "实时行情 WebSocket，只允许加密的 wss 官方地址。", source: "Rise Trade 官方接口文档。" },
      { key: "RISE_ORDER_GAP_MS", label: "下单间隔", defaultValue: "10500", kind: "number", min: 0, max: 120000, step: 100, help: "RISEx 限频较严格，建议保留 10500 毫秒。", source: "原项目稳定默认值。" },
      { key: "RISE_SKIP_LEVERAGE", label: "跳过 RISEx 杠杆设置", defaultValue: "0", kind: "select", choices: binaryChoices, help: "仅跳过 RISEx 的杠杆设置调用。", source: "账户已手动设置杠杆时可启用。" },
      { key: "RISEX_LEVERAGE", label: "专属杠杆", kind: "number", min: 1, max: 100, step: 1, help: "留空则使用 GRID_LEVERAGE。", source: "按 RISEx 账户风险设置。" },
      { key: "RISEX_HALF_BAND", label: "专属半带宽", kind: "number", min: 100, max: 1000000, step: 100, help: "留空则使用全局半带宽。", source: "根据 RISEx 市场深度和波动率设置。" }
    ]
  },
  {
    id: "decibel",
    venue: "decibel",
    title: "Decibel",
    description: "Decibel 账户私钥、API Key、子账户与 Gas Station 配置。",
    sourceUrl: "https://app.decibel.trade/",
    sourceLabel: "打开 Decibel",
    fields: [
      { key: "DECIBEL_ACCOUNT_PRIVATE_KEY", label: "账户私钥", kind: "password", requiredForLive: true, help: "用于订单签名，请使用专门的交易账户。", source: "Decibel 连接的交易钱包。" },
      { key: "DECIBEL_API_KEY", label: "API Key", kind: "password", requiredForLive: true, help: "用于访问 Decibel 交易 API。", source: "Decibel 账户/API 管理页面。" },
      { key: "DECIBEL_SUBACCOUNT", label: "子账户", placeholder: "可留空使用默认子账户", help: "指定交易使用的 Decibel 子账户。", source: "Decibel 账户页面。" },
      { key: "DECIBEL_GAS_STATION_API_KEY", label: "Gas Station API Key", kind: "password", help: "推荐填写。必须是 Geomi 的 Gas Station 资源 Key，不能填写 Decibel API Key 或 Node API Key。填写后由 Gas Station 代付；不填则 Decibel API Wallet 必须持有 APT。若提示 API Key 不存在，请在 Geomi 重新复制或生成 Mainnet Key。", source: "geomi.dev → Project → Gas Station，导入 Decibel Mainnet 模板并创建资源后，从该 Gas Station 详情复制 API Key。" },
      { key: "DECIBEL_LEVERAGE", label: "专属杠杆", kind: "number", min: 1, max: 100, step: 1, help: "留空则使用 GRID_LEVERAGE。", source: "按账户风险设置。" },
      { key: "DECIBEL_EQUITY_USD", label: "模拟权益", kind: "number", min: 1, max: 100000000, step: 1, help: "主要用于模拟盘或接口无法取得权益时的估算。", source: "输入希望用于策略计算的美元权益。" },
      { key: "DECIBEL_HALF_BAND", label: "专属半带宽", kind: "number", min: 100, max: 1000000, step: 100, help: "留空则使用全局或引擎默认值。", source: "根据 Decibel 市场波动率设置。" }
    ]
  },
  {
    id: "n1",
    venue: "n1",
    title: "N1",
    description: "N1 使用 Solana 格式 keypair。云端无法读取你电脑上的文件，实盘需粘贴 keypair JSON 内容。",
    sourceUrl: "https://app.n1.xyz/",
    sourceLabel: "打开 N1",
    fields: [
      { key: "N1_KEYPAIR_PATH", label: "本地 Keypair 路径", defaultValue: "secrets/id.json", runtime: false, help: "仅用于原项目自行部署时参考；WELINKBTC 云端不能读取用户电脑路径。", source: "本机 Solana keypair 文件路径；云端实盘请使用下方密钥内容。" },
      { key: "N1_KEYPAIR_JSON", label: "Keypair JSON 内容", kind: "password", requiredForLive: true, wide: true, placeholder: "[12,34,…]", help: "将 id.json 中由 32–128 个 0–255 整数组成的数组完整粘贴到这里。", source: "读取你为 N1 准备的 secrets/id.json 文件内容。" },
      { key: "N1_APP_PUBLIC_KEY", label: "App Public Key", placeholder: "留空使用 N1 默认应用公钥", help: "只有使用自定义 N1 应用身份时才需要修改。", source: "N1 开发者/API 配置。" },
      { key: "N1_API_URL", label: "API 地址", defaultValue: "https://zo-mainnet.n1.xyz", required: true, help: "只允许 n1.xyz 官方域名。", source: "N1 官方接口文档。" },
      { key: "N1_SOLANA_RPC", label: "Solana RPC", defaultValue: "https://api.mainnet-beta.solana.com", required: true, help: "仅允许 Solana 官方域名，避免密钥和交易被导向未知节点。", source: "Solana 官方 Mainnet RPC。" },
      { key: "N1_TRADING_ARMED", label: "N1 实盘解锁", defaultValue: "NO", kind: "select", choices: [{ label: "未解锁（NO）", value: "NO" }, { label: "允许实盘（YES）", value: "YES" }], help: "即使选择生产实盘，N1 仍要求该项为 YES。", source: "确认理解 N1 真实下单风险后手动选择。" },
      { key: "N1_LEVERAGE", label: "专属杠杆", kind: "number", min: 1, max: 100, step: 1, help: "留空则使用 GRID_LEVERAGE。", source: "按 N1 账户风险设置。" },
      { key: "N1_EQUITY_USD", label: "模拟权益", kind: "number", min: 1, max: 100000000, step: 1, help: "模拟盘或权益接口不可用时使用。", source: "输入用于策略计算的美元权益。" },
      { key: "N1_HALF_BAND", label: "专属半带宽", kind: "number", min: 100, max: 1000000, step: 100, help: "留空则使用全局或引擎默认值。", source: "根据 N1 市场波动率设置。" }
    ]
  },
  {
    id: "phoenix",
    venue: "phoenix",
    title: "Phoenix / Phoenix2",
    description: "两个独立 Phoenix 网格实例，可分别使用不同私钥、API/RPC 和策略参数。",
    sourceUrl: "https://phoenix.trade/",
    sourceLabel: "打开 Phoenix",
    fields: [
      { key: "PHOENIX_PRIVATE_KEY", label: "Phoenix 私钥", kind: "password", requiredForLive: true, help: "支持引擎接受的 Solana 私钥格式。", source: "Phoenix 专用交易钱包。" },
      { key: "PHOENIX_KEYPAIR_PATH", label: "Phoenix 本地 Keypair 路径", defaultValue: "secrets/phoenix.key", runtime: false, help: "仅供自行部署参考；云端不能读取用户电脑文件。", source: "原项目本机 secrets 目录。" },
      { key: "PHOENIX_API_URL", label: "Phoenix API 地址", defaultValue: "https://perp-api.phoenix.trade", required: true, help: "仅允许 phoenix.trade 官方域名。", source: "Phoenix 官方接口。" },
      { key: "PHOENIX_SOLANA_RPC", label: "Phoenix Solana RPC", defaultValue: "https://api.mainnet-beta.solana.com", required: true, help: "仅允许 Solana 官方 RPC。", source: "Solana 官方 Mainnet RPC。" },
      { key: "PHOENIX_ORDER_GAP_MS", label: "下单间隔", defaultValue: "1200", kind: "number", min: 0, max: 120000, step: 100, help: "连续订单间隔，单位毫秒；引擎会自动对 Phoenix API 与 Solana RPC 限速退避。", source: "安全默认 1200，降低公共 RPC 的 429 风险。" },
      { key: "PHOENIX_CU_LIMIT", label: "Compute Unit 上限", kind: "number", min: 100000, max: 1400000, step: 10000, placeholder: "600000", help: "Solana 交易计算单元限制；留空使用引擎默认。", source: "交易复杂或 CU 不足时按链上错误调整。" },
      { key: "PHOENIX_LEVERAGE", label: "Phoenix 专属杠杆", kind: "number", min: 1, max: 100, step: 1, help: "留空则使用全局杠杆。", source: "按账户风险设置。" },
      { key: "PHOENIX_HALF_BAND", label: "Phoenix 半带宽", kind: "number", min: 100, max: 1000000, step: 100, help: "留空使用全局值。", source: "根据 Phoenix 市场波动率设置。" },
      { key: "PHOENIX2_PRIVATE_KEY", label: "Phoenix2 私钥", kind: "password", requiredForLive: true, help: "第二个独立 Phoenix 实例的交易私钥。", source: "Phoenix2 专用交易钱包。" },
      { key: "PHOENIX2_KEYPAIR_PATH", label: "Phoenix2 本地 Keypair 路径", defaultValue: "secrets/phoenix2.key", runtime: false, help: "仅供自行部署参考；云端不能读取。", source: "原项目本机 secrets 目录。" },
      { key: "PHOENIX2_API_URL", label: "Phoenix2 API 地址", placeholder: "留空继承 Phoenix API", help: "如填写，只允许 phoenix.trade 官方域名。", source: "Phoenix 官方接口。" },
      { key: "PHOENIX2_SOLANA_RPC", label: "Phoenix2 Solana RPC", placeholder: "留空继承 Phoenix RPC", help: "如填写，只允许 Solana 官方域名。", source: "Solana 官方 Mainnet RPC。" },
      { key: "PHOENIX2_LEVERAGE", label: "Phoenix2 专属杠杆", kind: "number", min: 1, max: 100, step: 1, help: "留空继承 Phoenix 或全局值。", source: "按第二账户风险设置。" },
      { key: "PHOENIX2_HALF_BAND", label: "Phoenix2 半带宽", kind: "number", min: 100, max: 1000000, step: 100, help: "留空继承 Phoenix 或全局值。", source: "根据第二实例的策略设置。" }
    ]
  },
  {
    id: "nado",
    venue: "nado",
    title: "Nado",
    description: "Ink 链账户、子账户、BTC 产品和 RPC 配置。",
    sourceUrl: "https://nado.xyz/",
    sourceLabel: "打开 Nado",
    fields: [
      { key: "NADO_PRIVATE_KEY", label: "私钥", kind: "password", requiredForLive: true, placeholder: "0x…", help: "用于 Nado 订单签名，建议使用独立交易钱包。", source: "Nado 连接的 Ink 链钱包。" },
      { key: "NADO_KEY_PATH", label: "本地私钥路径", defaultValue: "secrets/nado.key", runtime: false, help: "仅供自行部署参考；云端不能读取本机文件。", source: "原项目本机 secrets 目录。" },
      { key: "NADO_ADDRESS", label: "账户地址", placeholder: "0x…", help: "可选；留空时通常从私钥推导。", source: "Nado 连接钱包地址。" },
      { key: "NADO_SUBACCOUNT", label: "子账户", placeholder: "default", help: "留空使用 default。", source: "Nado 账户页面。" },
      { key: "NADO_BTC_PRODUCT_ID", label: "BTC Product ID", defaultValue: "2", kind: "number", min: 1, max: 100000, step: 1, help: "BTC-PERP 产品编号，默认 2。", source: "Nado 产品/API 元数据。" },
      { key: "NADO_INK_RPC", label: "Ink RPC", defaultValue: "https://rpc-gel.inkonchain.com", help: "仅允许 inkonchain.com 官方 RPC 域名。", source: "Ink 官方 RPC。" },
      { key: "NADO_ORDER_GAP_MS", label: "下单间隔", defaultValue: "200", kind: "number", min: 0, max: 120000, step: 100, help: "连续订单间隔，单位毫秒。", source: "原项目默认 200。" },
      { key: "NADO_LEVERAGE", label: "专属杠杆", kind: "number", min: 1, max: 100, step: 1, help: "留空使用全局杠杆。", source: "按账户风险设置。" },
      { key: "NADO_HALF_BAND", label: "专属半带宽", kind: "number", min: 100, max: 1000000, step: 100, help: "留空使用全局值。", source: "根据 Nado 市场波动率设置。" }
    ]
  },
  {
    id: "popdex",
    venue: "popdex",
    title: "PopDEX",
    description: "Morph Tachyon 账户、交易符号和 PopDEX 专属网格参数。",
    sourceUrl: "https://app.popdex.xyz/",
    sourceLabel: "打开 PopDEX",
    fields: [
      { key: "POPDEX_PRIVATE_KEY", label: "私钥", kind: "password", requiredForLive: true, placeholder: "0x…", help: "用于 PopDEX 订单签名，建议使用独立交易钱包。", source: "PopDEX 连接的 Morph 钱包。" },
      { key: "POPDEX_KEY_PATH", label: "本地私钥路径", defaultValue: "secrets/popdex.key", runtime: false, help: "仅供自行部署参考；云端不能读取本机文件。", source: "原项目本机 secrets 目录。" },
      { key: "POPDEX_ADDRESS", label: "账户地址", placeholder: "0x…", help: "可选；留空时从私钥推导。", source: "PopDEX 连接钱包地址。" },
      { key: "POPDEX_SYMBOL", label: "交易符号", defaultValue: "BTCUSDT", help: "PopDEX 使用的合约符号。", source: "PopDEX 市场页面/API 元数据。" },
      { key: "POPDEX_EQUITY_USD", label: "策略权益", defaultValue: "800", kind: "number", min: 1, max: 100000000, step: 1, help: "用于网格规模计算的美元权益。", source: "根据计划投入资金填写。" },
      { key: "POPDEX_GRID_COUNT", label: "网格数量", defaultValue: "80", kind: "number", min: 2, max: 500, step: 1, help: "价格区间内的网格层数。", source: "根据订单最小值、资金和预期密度设置。" },
      { key: "POPDEX_LEVERAGE", label: "专属杠杆", defaultValue: "30", kind: "number", min: 1, max: 100, step: 1, help: "PopDEX 使用的杠杆倍数。", source: "按账户风险设置。" },
      { key: "POPDEX_HALF_BAND", label: "专属半带宽", kind: "number", min: 100, max: 1000000, step: 100, help: "留空使用 Phoenix 或全局策略值。", source: "根据 PopDEX 市场波动率设置。" },
      { key: "POPDEX_ORDER_GAP_MS", label: "下单间隔", defaultValue: "200", kind: "number", min: 0, max: 120000, step: 100, help: "连续订单间隔，单位毫秒。", source: "原项目默认 200。" }
    ]
  },
  {
    id: "telegram",
    title: "Telegram 通知（可选）",
    description: "开启后推送开仓、平仓、错误和整点总览。Bot Token 与 Chat ID 只在启用时需要。",
    sourceUrl: "https://t.me/BotFather",
    sourceLabel: "打开 BotFather",
    fields: [
      { key: "TELEGRAM_ENABLED", label: "启用 Telegram", defaultValue: "false", kind: "select", choices: booleanChoices, help: "设为 true 后，运行任务会尝试发送通知。", source: "完成下方 Bot Token 与 Chat ID 后再启用。" },
      { key: "TELEGRAM_BOT_TOKEN", label: "Bot Token", kind: "password", placeholder: "123456:ABC…", help: "Telegram 机器人访问令牌。", source: "在 Telegram 中向 @BotFather 创建 bot 后获取。" },
      { key: "TELEGRAM_CHAT_IDS", label: "Chat ID", placeholder: "123456789,987654321", help: "多个接收者用英文逗号分隔。", source: "先给 bot 发消息，再调用 getUpdates 查看 message.chat.id。" }
    ]
  }
];

const allFields = CLASSIC_GRID_ENVIRONMENT_GROUPS.flatMap((group) => group.fields);
const allowedKeys = new Set(allFields.map((field) => field.key));

export function defaultClassicGridEnvironment() {
  return Object.fromEntries(allFields.map((field) => [field.key, field.defaultValue || ""]));
}

export function normalizeClassicGridEnvironment(value: unknown) {
  const defaults = defaultClassicGridEnvironment();
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (allowedKeys.has(key) && typeof raw === "string") defaults[key] = raw.slice(0, 4096);
  }
  defaults.VENUES = orderedClassicGridVenueValue(defaults.VENUES) || DEFAULT_VENUES;
  return defaults;
}

export function serializeClassicGridEnvironment(values: Record<string, string>) {
  const lines: string[] = [];
  for (const group of CLASSIC_GRID_ENVIRONMENT_GROUPS) {
    const runtimeFields = group.fields.filter((field) => field.runtime !== false && field.key !== "DRY_RUN" && field.key !== "LIVE_CONFIRM");
    const entries = runtimeFields
      .map((field) => {
        const raw = String(values[field.key] ?? field.defaultValue ?? "").trim();
        return [field.key, field.key === "VENUES" ? orderedClassicGridVenueValue(raw) || DEFAULT_VENUES : raw] as const;
      })
      .filter(([, value]) => value !== "");
    if (!entries.length) continue;
    lines.push(`# ---- ${group.title} ----`);
    for (const [key, value] of entries) lines.push(`${key}=${value}`);
    lines.push("");
  }
  return lines.join("\n").trim();
}

export function selectedClassicGridVenues(values: Record<string, string>) {
  return new Set(orderedClassicGridVenueValue(values.VENUES).split(",").filter(Boolean));
}

export function orderedClassicGridVenueValue(value: unknown) {
  const requested = new Set(String(value || "").split(",").map((venue) => venue.trim().toLowerCase()).filter(Boolean));
  return CLASSIC_GRID_VENUE_OPTIONS.filter((venue) => requested.has(venue.value)).map((venue) => venue.value).join(",");
}
