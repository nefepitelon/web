// Exchange manifest: the single source of truth for backend registration,
// dashboard generation, .env fields and future exchange onboarding.
// Adding an exchange should normally require: one manifest entry + one adapter factory.

export const EXCHANGE_ADAPTER_CONTRACT = [
  'init', 'getMarkets', 'getCandles', 'getPrice', 'placeLimitOrder',
  'cancelOrder', 'cancelAll', 'fetchOpenOrders', 'getPosition', 'closePosition',
];

// A hedge leg needs a stricter subset than an ordinary read-only dashboard.
// Declaring it here makes capability gaps visible before a cycle can risk one-
// sided exposure, while keeping the existing Grid Ops adapter contract stable.
export const HEDGE_ADAPTER_CONTRACT = [
  'getMarkets', 'getPrice', 'setLeverage', 'placeLimitOrder',
  'cancelAll', 'fetchOpenOrders', 'getPosition', 'closePosition',
];

export const EXCHANGE_MANIFEST = [
  {
    key: 'de', shortCode: 'DE', name: 'Decibel', chain: 'Aptos', color: '#f59e0b',
    modeEnv: 'DE_MODE', networkEnv: 'DE_NETWORK', proxyEnv: 'DECIBEL_PROXY',
    healthPath: '', supportsDirectProxy: true,
    capabilities: ['公开行情', '模拟网格', '实盘限价单', '杠杆', '独立代理'],
    defaults: {
      mainnet: { apiUrl: 'https://api.mainnet.aptoslabs.com/decibel' },
      testnet: { apiUrl: 'https://api.testnet.aptoslabs.com/decibel' },
    },
    fields: [
      { env: 'DECIBEL_API_KEY', prop: 'apiKey', label: 'API Key', secret: true, requiredLive: true, placeholder: '留空表示不修改' },
      { env: 'DECIBEL_PRIVATE_KEY', prop: 'privateKey', label: 'API 钱包私钥', secret: true, requiredLive: true, placeholder: '留空表示不修改' },
      { env: 'DECIBEL_SUBACCOUNT', prop: 'subaccount', label: 'Trading Account 地址', requiredLive: true, placeholder: '0x...' },
      { env: 'DECIBEL_ORDER_GAP_MS', prop: 'orderGapMs', label: '连续链上写入间隔（毫秒）', type: 'integer', default: '500', min: 200, max: 30000, step: 100 },
      { env: 'DECIBEL_API_URL', prop: 'apiUrl', label: '自定义 API 地址（可留空）', type: 'url', placeholder: 'https://...' },
    ],
    liveGuide: {
      url: 'https://app.decibel.trade/api',
      summary: '实盘模式：API 密钥获取与配置（详细说明）',
      steps: [
        '到 geomi.dev 注册项目并创建 API Key，填入 DECIBEL_API_KEY。',
        '打开 Decibel API 页面，连接钱包后创建专用 API Wallet；只填写该 Ed25519 私钥，不要填写主钱包私钥。',
        '从交易界面复制 Trading Account 地址，填入 DECIBEL_SUBACCOUNT，并确保该账户有 USDC 保证金。',
        'API Wallet 需保留少量 APT 支付链上交易 gas。',
      ],
      warning: '只使用专用 API 钱包私钥；不要填写主钱包助记词或主钱包私钥。',
    },
  },
  {
    key: 'ex', shortCode: 'EX', name: 'Extended', chain: 'Starknet', color: '#3b82f6',
    modeEnv: 'EX_MODE', networkEnv: 'EX_NETWORK', proxyEnv: 'EXTENDED_PROXY',
    healthPath: '', supportsDirectProxy: true,
    capabilities: ['公开行情', '模拟网格', '实盘限价单', '杠杆', '独立代理'],
    defaults: {
      mainnet: { apiUrl: 'https://api.starknet.extended.exchange' },
      testnet: { apiUrl: 'https://api.starknet.sepolia.extended.exchange' },
    },
    fields: [
      { env: 'EXTENDED_API_KEY', prop: 'apiKey', label: 'API Key', secret: true, requiredLive: true, placeholder: '留空表示不修改' },
      // Vault/position identifiers are decimal strings. Keeping them as text
      // avoids IEEE-754 precision loss when Extended returns a 64-bit value.
      { env: 'EXTENDED_VAULT', prop: 'vault', label: 'Vault ID', requiredLive: true, type: 'integer', preserveString: true, placeholder: '数字 ID' },
      { env: 'EXTENDED_STARK_PRIVATE_KEY', prop: 'starkPrivateKey', label: 'Stark 私钥', secret: true, requiredLive: true, placeholder: '留空表示不修改' },
      { env: 'EXTENDED_STARK_PUBLIC_KEY', prop: 'starkPublicKey', label: 'Stark 公钥', requiredLive: true, placeholder: '0x...' },
      { env: 'EXTENDED_MAX_FEE', prop: 'feeRate', label: '手续费安全上限（实际费率自动读取）', type: 'number', default: '0.0005', min: 0.000001, max: 0.05, step: 0.000001 },
      { env: 'EXTENDED_ORDER_GAP_MS', prop: 'orderGapMs', label: '连续下单间隔（毫秒）', type: 'integer', default: '400', min: 200, max: 30000, step: 100 },
      { env: 'EXTENDED_API_URL', prop: 'apiUrl', label: '自定义 API 地址（可留空）', type: 'url', placeholder: 'https://...' },
    ],
    liveGuide: {
      url: 'https://app.extended.exchange',
      summary: '实盘模式：API 密钥获取与配置（详细说明）',
      steps: [
        '连接钱包并完成开户，然后进入账户设置里的 API Management。',
        '创建 API Key，并立即保存 API Key、Vault 数字 ID、Stark Private Key、Stark Public Key。',
        '四个值分别填入对应字段；私钥通常只显示一次。',
        '确认账户内已有 USDC 保证金；机器人会从 /api/v1/user/fees 自动读取该子账户与市场的 maker/taker 实际费率。',
        'EXTENDED_MAX_FEE 仅作为安全上限，一般保留默认值；实际费率超过上限时机器人会停止下单并提示确认。',
      ],
      warning: 'Stark 私钥只保存在本机 .env；不要截图、发送或上传到云端。',
    },
  },
  {
    key: 'rs', shortCode: 'RS', name: 'RISEx', chain: '', color: '#22c55e',
    modeEnv: 'RS_MODE', networkEnv: 'RS_NETWORK', proxyEnv: 'RISEX_PROXY',
    healthPath: '', supportsDirectProxy: true,
    capabilities: ['公开行情', '模拟网格', '实盘限价单', '杠杆', '独立代理'],
    defaults: {
      mainnet: { apiUrl: 'https://api.rise.trade', wsUrl: 'wss://ws.rise.trade/ws' },
      testnet: { apiUrl: 'https://api.testnet.rise.trade', wsUrl: 'wss://api.testnet.rise.trade/ws/' },
    },
    fields: [
      { env: 'ACCOUNT_ADDRESS', prop: 'account', label: '账户地址', requiredLive: true, placeholder: '0x...' },
      { env: 'SIGNER_PRIVATE_KEY', prop: 'signerKey', label: '签名私钥', secret: true, requiredLive: true, placeholder: '留空表示不修改' },
      { env: 'RISEX_ORDER_GAP_MS', prop: 'orderGapMs', label: '连续链上写入间隔（毫秒）', type: 'integer', default: '300', min: 200, max: 30000, step: 100 },
      { env: 'RISEX_API_URL', prop: 'apiUrl', label: '自定义 API 地址（可留空）', type: 'url', placeholder: 'https://...' },
      { env: 'RISEX_WS_URL', prop: 'wsUrl', label: '自定义 WebSocket 地址（可留空）', type: 'wsurl', placeholder: 'wss://...' },
    ],
    liveGuide: {
      url: 'https://risex.trade',
      summary: '实盘模式：API 密钥获取与配置（详细说明）',
      steps: [
        '打开 RISEx 交易应用，连接钱包并完成开户。',
        '在账户或 API 设置中复制账户地址，并创建或导出仅用于下单的 Signer 私钥。',
        '填入两个字段，确认账户有保证金；API 与 WebSocket 地址一般留空。',
      ],
      warning: '仅填写 RISEx 下单所需的 Signer 私钥，不要填写主钱包助记词。',
    },
  },
  {
    key: 'bn', shortCode: 'BN', name: 'Binance', chain: 'USDⓈ-M Futures', color: '#f3ba2f', defaultNetwork: 'testnet',
    modeEnv: 'BN_MODE', networkEnv: 'BN_NETWORK', proxyEnv: 'BINANCE_PROXY',
    healthPath: '/fapi/v1/time', supportsDirectProxy: true,
    capabilities: ['公开行情', '模拟网格', '实盘 HMAC', '杠杆', '超时订单对账', '独立代理'],
    defaults: {
      mainnet: { apiUrl: 'https://fapi.binance.com' },
      testnet: { apiUrl: 'https://demo-fapi.binance.com' },
    },
    fields: [
      { env: 'BINANCE_API_KEY', prop: 'apiKey', label: 'Futures API Key', secret: true, requiredLive: true, placeholder: '留空表示不修改' },
      { env: 'BINANCE_API_SECRET', prop: 'apiSecret', label: 'Futures Secret Key', secret: true, requiredLive: true, placeholder: '留空表示不修改' },
      { env: 'BINANCE_RECV_WINDOW', prop: 'recvWindow', label: '签名有效窗口（毫秒）', type: 'integer', default: '5000', min: 1000, max: 60000, step: 1000 },
      { env: 'BINANCE_ORDER_GAP_MS', prop: 'orderGapMs', label: '连续下单间隔（毫秒）', type: 'integer', default: '200', min: 100, max: 30000, step: 100 },
      { env: 'BINANCE_API_URL', prop: 'apiUrl', label: '自定义 Futures API 地址（可留空）', type: 'url', placeholder: 'https://...' },
    ],
    liveGuide: {
      url: 'https://www.binance.com/en/my/settings/api-management',
      summary: '实盘模式：API 密钥获取与配置（详细说明）',
      steps: [
        '先在 Binance 开通 USDⓈ-M Futures；建议先选择 testnet 验证完整流程。',
        '在 API Management 创建专用 API Key，启用 Futures 读取与交易权限，不要启用提现权限。',
        '复制 API Key 与 Secret Key；Secret 通常只显示一次。建议绑定固定出口 IP。',
        '本机器人使用单向持仓（One-way Mode）；若账户开启 Hedge Mode，请先在没有持仓和挂单时切回单向模式。',
        '确认 Futures 钱包有 USDT 保证金，再将模式切换为 live。',
      ],
      warning: '实盘 Key 不应具备提现权限。首次使用请用小额、低杠杆，并先在 testnet 完成验证。',
    },
  },
  {
    key: 'op', shortCode: 'OP', name: 'Ondo Perps', chain: 'Stocks · ETFs · Crypto', color: '#8b5cf6', defaultNetwork: 'testnet',
    modeEnv: 'ONDO_MODE', networkEnv: 'ONDO_NETWORK', proxyEnv: 'ONDO_PROXY',
    healthPath: '/status', supportsDirectProxy: true,
    docsUrl: 'https://docs.ondoperps.xyz/api-reference/integration_guide',
    capabilities: ['公开标记价格', '模拟网格', '实盘 HMAC', '杠杆', '超时订单对账', '独立代理'],
    defaults: {
      mainnet: { apiUrl: 'https://api.ondoperps.xyz', wsUrl: 'wss://api.ondoperps.xyz/ws' },
      testnet: { apiUrl: 'https://api.ondoperps-sandbox.xyz', wsUrl: 'wss://api.ondoperps-sandbox.xyz/ws' },
    },
    networkLabels: { mainnet: 'mainnet 主网', testnet: 'sandbox 沙盒' },
    fields: [
      { env: 'ONDO_KEY_ID', prop: 'keyId', label: 'API Key ID', secret: true, requiredLive: true, placeholder: 'ondoKeyId_...' },
      { env: 'ONDO_API_SECRET', prop: 'apiSecret', label: 'API Secret', secret: true, requiredLive: true, placeholder: 'ondoApiSecret_...' },
      { env: 'ONDO_POLL_MS', prop: 'pollMs', label: '轮询间隔（毫秒）', type: 'integer', default: '3000', min: 1500, max: 30000, step: 500 },
      { env: 'ONDO_ORDER_GAP_MS', prop: 'orderGapMs', label: '批次/写请求间隔（毫秒）', type: 'integer', default: '1200', min: 250, max: 30000, step: 100 },
      { env: 'ONDO_API_URL', prop: 'apiUrl', label: '自定义 REST API 地址（可留空）', type: 'url', placeholder: 'https://...' },
      { env: 'ONDO_WS_URL', prop: 'wsUrl', label: '自定义 WebSocket 地址（可留空）', type: 'wsurl', placeholder: 'wss://...' },
    ],
    liveGuide: {
      url: 'https://app.ondoperps.xyz',
      summary: '实盘模式：API 密钥获取与配置（详细说明）',
      steps: [
        '先确认你所在国家或地区符合 Ondo Perps 的服务资格；受限制地区请勿启用 live。',
        '登录 Ondo Perps，点击右上角账户地址，进入 API Keys，选择 Add New API Key。',
        '创建只具备读取与交易权限的专用 Key，立即保存完整的 ONDO_KEY_ID（ondoKeyId_ 开头）和 ONDO_API_SECRET（ondoApiSecret_ 开头）。',
        '建议填写本机固定 IPv4 出口白名单；代理出口变化时要同步更新，否则接口会返回 ip_not_permitted。',
        '先选择 sandbox 沙盒完成下单、撤单、重启对账和市价平仓验证，再切 mainnet，并确保账户有 USDC 保证金。',
      ],
      warning: 'API Secret 只写入本机 .env，不上传云端。请勿填写钱包助记词或钱包私钥；首次实盘使用小额、低杠杆。',
    },
  },
  {
    key: 'ph', shortCode: 'PH', name: 'Phoenix', chain: 'Solana Perpetuals', color: '#38bdf8', defaultNetwork: 'mainnet',
    modeEnv: 'PHOENIX_MODE', networkEnv: 'PHOENIX_NETWORK', proxyEnv: 'PHOENIX_PROXY',
    healthPath: '/v1/view/exchange/status', additionalHealthProps: ['rpcUrl'], supportsDirectProxy: true,
    docsUrl: 'https://docs.phoenix.trade/',
    capabilities: ['官方实时行情', '模拟网格', 'Solana 本机签名实盘', 'Post-Only', '精确撤单', '独立代理'],
    defaults: {
      mainnet: { apiUrl: 'https://perp-api.phoenix.trade', rpcUrl: 'https://api.mainnet-beta.solana.com' },
    },
    networkLabels: { mainnet: 'mainnet Solana 主网' },
    requiredLiveAnyOf: [['PHOENIX_PRIVATE_KEY', 'PHOENIX_KEYPAIR_PATH']],
    fields: [
      { env: 'PHOENIX_PRIVATE_KEY', prop: 'privateKey', label: 'Phoenix 私钥', secret: true, allowWhitespace: true, placeholder: 'Base58 / Base64 / Hex / 64 字节 JSON；留空表示不修改' },
      { env: 'PHOENIX_KEYPAIR_PATH', prop: 'keypairPath', label: 'Phoenix 本地 Keypair 路径', default: 'secrets/phoenix.key', placeholder: 'secrets/phoenix.key' },
      { env: 'PHOENIX_API_URL', prop: 'apiUrl', label: 'Phoenix API 地址', type: 'url', default: 'https://perp-api.phoenix.trade' },
      { env: 'PHOENIX_SOLANA_RPC', prop: 'rpcUrl', label: 'Phoenix Solana RPC', type: 'url', default: 'https://api.mainnet-beta.solana.com' },
      { env: 'PHOENIX_ORDER_GAP_MS', prop: 'orderGapMs', label: '连续下单间隔（毫秒）', type: 'integer', default: '1200', min: 200, max: 30000, step: 100 },
      { env: 'PHOENIX_CU_LIMIT', prop: 'computeUnitLimit', label: 'Compute Unit 上限', type: 'integer', default: '600000', min: 200000, max: 1400000, step: 10000 },
      { env: 'PHOENIX_LEVERAGE', prop: 'leverage', label: 'Phoenix 专属杠杆（可留空）', type: 'number', min: 1, max: 100, step: 1, placeholder: '留空使用策略杠杆' },
      { env: 'PHOENIX_HALF_BAND', prop: 'halfBand', label: 'Phoenix 半带宽（可留空）', type: 'number', min: 0, max: 1, step: 0.001, placeholder: '例：0.1 表示现价上下 10%' },
    ],
    liveGuide: {
      url: 'https://phoenix.trade',
      summary: '实盘模式：Phoenix 专用钱包与 Solana RPC 配置（详细说明）',
      steps: [
        'Phoenix 当前为受限访问产品；先确认所在地区符合服务资格并完成 Phoenix 开户。',
        '创建只用于 Phoenix 的 Solana 专用交易钱包。PHOENIX_PRIVATE_KEY 与 PHOENIX_KEYPAIR_PATH 二选一，不要使用存放大额资产的主钱包。',
        '私钥支持 Solana CLI 64 字节 JSON、Base58、Base64 或 Hex；Keypair 路径默认相对本地引擎目录读取 secrets/phoenix.key。',
        'PHOENIX_API_URL 使用官方 https://perp-api.phoenix.trade；PHOENIX_SOLANA_RPC 可使用官方主网 RPC，实盘高频网格建议更换为稳定的专用 RPC。',
        '钱包需在 Phoenix 内有 USDC 保证金，并保留少量 SOL 支付每次挂单、撤单与平仓的链上手续费。',
        '先在 paper 完成参数与断线恢复验证，再切 live；实盘网格使用 Post-Only 指令并在本机签名，私钥不会上传到 welinkBTC。',
      ],
      warning: 'Phoenix 官方明确建议集成使用专用/嵌入式钱包。私钥仅保存在本机 .env 或本地 keypair 文件，切勿上传、截图或复用主钱包。',
    },
  },
  {
    key: 'nd', shortCode: 'ND', name: 'Nado', chain: 'Ink L2 · Perpetuals', color: '#7dd3fc', defaultNetwork: 'mainnet',
    modeEnv: 'NADO_MODE', networkEnv: 'NADO_NETWORK', proxyEnv: 'NADO_PROXY',
    healthPath: '/query', additionalHealthProps: ['rpcUrl'], supportsDirectProxy: true,
    docsUrl: 'https://docs.nado.xyz/developer-resources/typescript-sdk',
    capabilities: ['官方实时行情', '模拟网格', 'EIP-712 本机签名实盘', 'Linked Signer', 'Post-Only', '精确撤单', '独立代理'],
    defaults: {
      mainnet: { apiUrl: 'https://gateway.prod.nado.xyz/v1', rpcUrl: 'https://rpc-gel.inkonchain.com' },
      testnet: { apiUrl: 'https://gateway.test.nado.xyz/v1', rpcUrl: 'https://rpc-gel-sepolia.inkonchain.com' },
    },
    networkLabels: { mainnet: 'mainnet Ink 主网', testnet: 'testnet Ink 测试网' },
    requiredLiveAnyOf: [['NADO_PRIVATE_KEY', 'NADO_KEY_PATH']],
    fields: [
      { env: 'NADO_PRIVATE_KEY', prop: 'privateKey', label: 'Nado 私钥', secret: true, placeholder: '32 字节 Hex；留空表示不修改' },
      { env: 'NADO_KEY_PATH', prop: 'keyPath', label: 'Nado 本地私钥路径', default: 'secrets/nado.key', placeholder: 'secrets/nado.key' },
      { env: 'NADO_ADDRESS', prop: 'address', label: 'Nado 账户地址（可留空）', placeholder: '0x...；留空从私钥推导' },
      { env: 'NADO_SUBACCOUNT', prop: 'subaccount', label: 'Nado 子账户', default: 'default', placeholder: 'default' },
      { env: 'NADO_BTC_PRODUCT_ID', prop: 'btcProductId', label: 'BTC Product ID', type: 'integer', default: '2', min: 1, max: 100000, step: 1 },
      { env: 'NADO_INK_RPC', prop: 'rpcUrl', label: 'Nado Ink RPC', type: 'url', default: 'https://rpc-gel.inkonchain.com' },
      { env: 'NADO_ORDER_GAP_MS', prop: 'orderGapMs', label: '连续下单间隔（毫秒）', type: 'integer', default: '200', min: 200, max: 30000, step: 100 },
      { env: 'NADO_LEVERAGE', prop: 'leverage', label: 'Nado 专属杠杆（可留空）', type: 'number', min: 1, max: 100, step: 1, placeholder: '留空使用策略杠杆' },
    ],
    liveGuide: {
      url: 'https://app.nado.xyz',
      summary: '实盘模式：Nado Ink 账户与 Linked Signer 配置（详细说明）',
      steps: [
        '先确认所在国家或地区符合 Nado 服务资格，在 app.nado.xyz 连接 Ink 钱包、完成开户并存入 USDT0 保证金。',
        '推荐在 Nado 的 Linked Signers 页面创建专用交易签名钱包；只把该 32 字节 Hex 私钥写入 NADO_PRIVATE_KEY 或本机 secrets/nado.key，不要填写主钱包助记词。',
        '如果私钥是 linked signer，必须把主账户地址填入 NADO_ADDRESS；如果私钥本身就是账户钱包，可留空由程序自动推导。NADO_SUBACCOUNT 默认使用 default。',
        'BTC-PERP 官方产品号默认是 2；程序会从官方 symbols 接口动态加载全部永续市场及价格/数量步进，不需要手工维护交易对。',
        '主网 RPC 默认 https://rpc-gel.inkonchain.com；网络检测会同时验证 Nado Gateway 与 Ink RPC，并按直连、Nado 独立代理、全局代理自动选路。',
        '先在 paper 验证网格参数与断线恢复，再切 live。实盘挂单使用 Post-Only，撤单使用订单 digest 精确签名；所有私钥与签名只在本机处理。',
      ],
      warning: 'Linked signer 是推荐的最小权限方案。不要把主钱包助记词或大额资产钱包私钥写入配置；首次实盘请使用小额与低杠杆。',
    },
  },
  {
    key: 'ok', shortCode: 'OK', name: 'OKX', chain: 'USDⓈ 永续合约', color: '#f8fafc', defaultNetwork: 'testnet',
    modeEnv: 'OKX_MODE', networkEnv: 'OKX_NETWORK', proxyEnv: 'OKX_PROXY',
    healthPath: '/api/v5/public/time', supportsDirectProxy: true, docsUrl: 'https://www.okx.com/docs-v5/en/',
    capabilities: ['官方公开行情', '模拟网格', '实盘 HMAC', '批量挂撤单', '杠杆', '强平价', '独立代理'],
    defaults: {
      mainnet: { apiUrl: 'https://www.okx.com', simulatedTrading: false },
      testnet: { apiUrl: 'https://www.okx.com', simulatedTrading: true },
    },
    networkLabels: { mainnet: 'mainnet 实盘', testnet: 'demo 模拟交易环境' },
    fields: [
      { env: 'OKX_API_KEY', prop: 'apiKey', label: 'OKX API Key', secret: true, requiredLive: true, placeholder: '留空表示不修改' },
      { env: 'OKX_API_SECRET', prop: 'apiSecret', label: 'OKX Secret Key', secret: true, requiredLive: true, placeholder: '留空表示不修改' },
      { env: 'OKX_PASSPHRASE', prop: 'passphrase', label: 'OKX Passphrase', secret: true, requiredLive: true, placeholder: '创建 API Key 时设置的口令' },
      { env: 'OKX_ORDER_GAP_MS', prop: 'orderGapMs', label: '批量/连续下单间隔（毫秒）', type: 'integer', default: '200', min: 100, max: 30000, step: 100 },
      { env: 'OKX_POLL_MS', prop: 'pollMs', label: '账户与订单轮询间隔（毫秒）', type: 'integer', default: '3000', min: 1500, max: 30000, step: 500 },
      { env: 'OKX_API_URL', prop: 'apiUrl', label: 'OKX REST API 地址', type: 'url', default: 'https://www.okx.com' },
    ],
    liveGuide: {
      url: 'https://www.okx.com/account/my-api', summary: '实盘模式：OKX API Key、Secret 与 Passphrase 配置',
      steps: [
        '在 OKX 的 API 页面创建专用 API Key，权限仅勾选 Read 与 Trade，严禁开启 Withdraw。',
        '创建时会得到 API Key、Secret Key，并由你设置 Passphrase；三项缺一不可，Secret 通常只显示一次。',
        '建议绑定当前固定出口 IP，并先选择 demo/testnet 验证行情、挂单、撤单、恢复对账与平仓。',
          '本适配器使用 SWAP 永续与 cross 全仓，并在连接时自动读取 OKX 的 net 单向或 long/short 双向持仓模式；无需手动切换。',
        '切换 mainnet/live 前确认永续账户已有 USDT/USDC 保证金，并从小额低杠杆开始。',
      ], warning: 'API Key 不应具备提现权限；Passphrase 不是登录密码，三项凭据仅保存在本机 .env。',
    },
  },
  {
    key: 'gv', shortCode: 'GV', name: 'GRVT', chain: 'GRVT L2 · Perpetuals', color: '#f97316', defaultNetwork: 'testnet',
    modeEnv: 'GRVT_MODE', networkEnv: 'GRVT_NETWORK', proxyEnv: 'GRVT_PROXY',
    healthPath: '', additionalHealthProps: ['tradeUrl', 'authUrl'], supportsDirectProxy: true,
    docsUrl: 'https://api-docs.grvt.io/',
    capabilities: ['官方公开行情', '模拟网格', 'API Key 会话', 'EIP-712 本机签名', '杠杆', '强平价', '独立代理'],
    defaults: {
      mainnet: { apiUrl: 'https://market-data.grvt.io', marketUrl: 'https://market-data.grvt.io', tradeUrl: 'https://trades.grvt.io', authUrl: 'https://edge.grvt.io' },
      testnet: { apiUrl: 'https://market-data.testnet.grvt.io', marketUrl: 'https://market-data.testnet.grvt.io', tradeUrl: 'https://trades.testnet.grvt.io', authUrl: 'https://edge.testnet.grvt.io' },
    },
    networkLabels: { mainnet: 'mainnet GRVT 主网', testnet: 'testnet GRVT 测试网' },
    fields: [
      { env: 'GRVT_API_KEY', prop: 'apiKey', label: 'GRVT Trade API Key', secret: true, requiredLive: true, placeholder: '留空表示不修改' },
      { env: 'GRVT_PRIVATE_KEY', prop: 'privateKey', label: 'GRVT EIP-712 交易签名私钥', secret: true, requiredLive: true, placeholder: '0x...；仅专用交易签名 Key' },
      { env: 'GRVT_SUB_ACCOUNT_ID', prop: 'subaccount', label: 'GRVT Sub Account ID', requiredLive: true, placeholder: '数字子账户 ID' },
      { env: 'GRVT_ORDER_GAP_MS', prop: 'orderGapMs', label: '连续签名下单间隔（毫秒）', type: 'integer', default: '250', min: 100, max: 30000, step: 50 },
      { env: 'GRVT_POLL_MS', prop: 'pollMs', label: '账户与订单轮询间隔（毫秒）', type: 'integer', default: '4000', min: 2000, max: 30000, step: 500 },
      { env: 'GRVT_MARKET_URL', prop: 'marketUrl', label: 'GRVT Market Data API', type: 'url', placeholder: '留空使用当前网络官方地址' },
      { env: 'GRVT_TRADE_URL', prop: 'tradeUrl', label: 'GRVT Trade API', type: 'url', placeholder: '留空使用当前网络官方地址' },
      { env: 'GRVT_AUTH_URL', prop: 'authUrl', label: 'GRVT Auth API', type: 'url', placeholder: '留空使用当前网络官方地址' },
    ],
    liveGuide: {
      url: 'https://api-docs.grvt.io/api_setup/', summary: '实盘模式：GRVT Trade API Key 与 EIP-712 签名配置',
      steps: [
        '先在 GRVT 创建 Trading Account / Sub Account，并在账户设置生成 Trade API Key。',
        'API Key 用于登录 gravity 会话；程序会读取会话 Cookie 与 X-Grvt-Account-Id，约一天后自动重新登录。',
        '创建并绑定只用于该 Trading Account 的交易签名 Key，将其 0x 私钥填入 GRVT_PRIVATE_KEY；订单按官方 EIP-712 结构在本机签名。',
        '填入数字 GRVT_SUB_ACCOUNT_ID。主网签名 chainId 325，测试网为 326，程序会随网络自动选择。',
        '先在 testnet 完成挂单、撤单、杠杆、重启对账和减仓验证，再切 mainnet/live。',
      ], warning: 'GRVT_PRIVATE_KEY 只应是专用交易签名 Key，不要填写主钱包助记词；API Key 和签名私钥均不上传云端。',
    },
  },
  {
    key: 'ar', shortCode: 'AR', name: 'Arcus', chain: 'Robinhood Chain · Perpetuals', color: '#a78bfa', defaultNetwork: 'testnet',
    modeEnv: 'AR_MODE', networkEnv: 'AR_NETWORK', proxyEnv: 'ARCUS_PROXY',
    healthPath: '/health', additionalHealthProps: ['wsUrl'], supportsDirectProxy: true,
    docsUrl: 'https://docs.arcus.xyz/',
    capabilities: ['官方实时行情', '模拟网格', 'Ed25519 本机签名实盘', 'ALO Post-Only', '分层 Tick', '精确撤单', '独立代理'],
    defaults: {
      mainnet: { apiUrl: 'https://api.arcus.xyz', wsUrl: 'wss://api.arcus.xyz/v1/ws' },
      testnet: { apiUrl: 'https://api.testnet.arcus.xyz', wsUrl: 'wss://api.testnet.arcus.xyz/v1/ws' },
    },
    networkLabels: { mainnet: 'mainnet Arcus 主网', testnet: 'testnet Arcus 测试网' },
    requiredLiveAnyOf: [['ARCUS_API_PRIVATE_KEY', 'ARCUS_API_PRIVATE_KEY_FILE']],
    fields: [
      { env: 'ARCUS_ADDRESS', prop: 'address', label: 'Arcus 主钱包公开地址', requiredLive: true, placeholder: '0x...；只填公开地址，绝不填主钱包私钥' },
      { env: 'ARCUS_ACCOUNT_INDEX', prop: 'accountIndex', label: 'Arcus Subaccount Index', type: 'integer', default: '0', min: 0, max: 9, step: 1 },
      { env: 'ARCUS_API_KEY', prop: 'apiKey', label: 'Arcus Ed25519 API 公钥', secret: true, requiredLive: true, placeholder: '64 位 Hex；留空表示不修改' },
      { env: 'ARCUS_API_PRIVATE_KEY', prop: 'apiPrivateKey', label: 'Arcus API 签名私钥', secret: true, placeholder: '64 位 seed Hex / PKCS#8；留空表示不修改' },
      { env: 'ARCUS_API_PRIVATE_KEY_FILE', prop: 'apiPrivateKeyFile', label: 'Arcus API 私钥文件', default: 'secrets/arcus-private.pem', placeholder: '与直接私钥二选一' },
      { env: 'ARCUS_GOOD_TIL_DAYS', prop: 'goodTilDays', label: '挂单有效天数', type: 'integer', default: '40', min: 32, max: 180, step: 1 },
      { env: 'ARCUS_FEE_RATE', prop: 'feeRate', label: 'Maker Fee 保守回退值', type: 'number', default: '0.0005', min: 0, max: 0.05, step: 0.000001 },
      { env: 'ARCUS_ORDER_GAP_MS', prop: 'orderGapMs', label: '连续下单间隔（毫秒）', type: 'integer', default: '250', min: 100, max: 30000, step: 50 },
      { env: 'ARCUS_POLL_MS', prop: 'pollMs', label: '账户与订单轮询间隔（毫秒）', type: 'integer', default: '4000', min: 2000, max: 30000, step: 500 },
      { env: 'ARCUS_API_URL', prop: 'apiUrl', label: 'Arcus REST API', type: 'url', placeholder: '留空使用当前网络官方地址' },
      { env: 'ARCUS_WS_URL', prop: 'wsUrl', label: 'Arcus WebSocket API', type: 'wsurl', placeholder: '留空使用当前网络官方地址' },
    ],
    liveGuide: {
      url: 'https://app.arcus.xyz', summary: '实盘模式：Arcus Perps Beta 与 Ed25519 API Key 配置',
      steps: [
        '先确认 Arcus Perps Beta 已向你的账户开放，并确认所在地区符合服务资格；未获交易权限时只使用 paper。',
        '在 Arcus Web App 为目标主钱包注册专用 Ed25519 API key；只复制 API 公钥与一次性显示的 API 签名私钥，绝不填写主钱包私钥或助记词。',
        'ARCUS_ADDRESS 填已绑定 API key 的主钱包公开地址；ARCUS_ACCOUNT_INDEX 填创建 key 时选择的 0-9 子账户。',
        '私钥可直接填写或保存为项目内 secrets/arcus-private.pem；程序会在本机推导公钥并与 ARCUS_API_KEY 比对，不一致即拒绝实盘。',
        '程序每次从 /v1/markets 动态读取 ONLINE 市场、tickSize、stepSize、tickTiers 和最小名义金额，ALO 挂单在本机签名。',
        '先在 testnet 完成挂单、撤单、杠杆、断线对账和平仓验证，再切换 mainnet；测试网账户需要先从 Arcus 页面充值测试保证金。',
      ],
      warning: 'Arcus Perps 仍处于分批开放阶段。API 私钥仅保存在本机 .env/文件；不要填写或上传 Ethereum 主钱包私钥。',
    },
  },
  {
    key: 'en', shortCode: 'ET', name: 'Entropy', chain: 'Hyperliquid HIP-3 · io', color: '#14b8a6', defaultNetwork: 'mainnet',
    modeEnv: 'ENTROPY_MODE', networkEnv: 'ENTROPY_NETWORK', proxyEnv: 'ENTROPY_PROXY',
    healthPath: '/info', supportsDirectProxy: true, liveAvailable: false,
    liveUnavailableReason: '本版本已接入 Entropy 官方 HIP-3 实时行情与 PAPER 网格；LIVE 将在 Hyperliquid agent-wallet、nonce、EIP-712、isolated collateral 完成端到端验收后开放。',
    docsUrl: 'https://docs.entropy.io/',
    capabilities: ['Hyperliquid 官方实时行情', 'Entropy io 市场', '模拟网格', '动态 Asset ID', '自动过滤退市', 'LIVE 安全禁用'],
    defaults: { mainnet: { apiUrl: 'https://api.hyperliquid.xyz', dex: 'io' } },
    networkLabels: { mainnet: 'mainnet Hyperliquid 主网' },
    fields: [
      { env: 'ENTROPY_DEX', prop: 'dex', label: 'Entropy HIP-3 DEX 标识', default: 'io', placeholder: '固定为 io' },
      { env: 'ENTROPY_API_URL', prop: 'apiUrl', label: 'Hyperliquid 官方 API', type: 'url', default: 'https://api.hyperliquid.xyz' },
    ],
    liveGuide: {
      url: 'https://entropy.io', summary: '当前版本仅开放真实行情驱动的 PAPER 网格',
      steps: [
        'Entropy 是 Hyperliquid HIP-3 deployer，接口不是虚构的 api.entropy.io；程序通过 Hyperliquid 官方 /info 读取 dex=io。',
        '市场、szDecimals、杠杆、退市状态和 Asset ID 均在启动时动态解析，不硬编码 deployer 地址或资产编号。',
        '当前 Entropy 市场要求 isolated margin；在 agent/API wallet 签名、nonce 与抵押金路径完整验收前，界面会禁用 LIVE。',
        'PAPER 使用 Entropy 官方实时标记价格和 K 线，但订单、余额与盈亏均为本地模拟，不会发送到交易所。',
      ],
      warning: 'LIVE 被刻意 fail-closed；任何 PAPER 订单都不会显示成实盘成交。',
    },
  },
  {
    key: 'lr', shortCode: 'LR', name: 'RHC Lighter', chain: 'Robinhood Chain · Lighter', color: '#2dd4bf', defaultNetwork: 'mainnet',
    modeEnv: 'LR_MODE', networkEnv: 'LR_NETWORK', proxyEnv: 'LIGHTER_PROXY',
    healthPath: '/api/v1/orderBookDetails?filter=perp', supportsDirectProxy: true,
    docsUrl: 'https://apidocs.rh.lighter.xyz/',
    capabilities: ['官方实时行情', '模拟网格', '官方 Python signer', '批量挂单', '杠杆', '强平价', '独立代理'],
    defaults: { mainnet: { apiUrl: 'https://api.rh.lighter.xyz', wsUrl: 'wss://api.rh.lighter.xyz/stream', chainId: 466324 } },
    networkLabels: { mainnet: 'mainnet RHC 官方主网' },
    requiredLiveAnyOf: [['LIGHTER_API_PRIVATE_KEY', 'LIGHTER_API_PRIVATE_KEY_FILE']],
    fields: [
      { env: 'LIGHTER_ACCOUNT_INDEX', prop: 'accountIndex', label: 'RHC Lighter Account Index', type: 'integer', requiredLive: true, min: 0, max: 2147483647, placeholder: '非负整数，不是钱包地址' },
      { env: 'LIGHTER_API_KEY_INDEX', prop: 'apiKeyIndex', label: 'Lighter API Key Index', type: 'integer', requiredLive: true, min: 4, max: 254, placeholder: '4–254，并与私钥索引一致' },
      { env: 'LIGHTER_API_PRIVATE_KEY', prop: 'apiPrivateKey', label: 'Lighter API 签名私钥', secret: true, placeholder: '留空表示不修改；不是 Ethereum 主钱包私钥' },
      { env: 'LIGHTER_API_PRIVATE_KEY_FILE', prop: 'apiPrivateKeyFile', label: 'Lighter API 私钥文件', default: 'secrets/lighter-api-private-key.txt', placeholder: '与直接私钥二选一' },
      { env: 'LIGHTER_PYTHON', prop: 'pythonPath', label: '64 位 Python 3.12 路径（可留空）', placeholder: '留空由一键启动准备项目内运行时' },
      { env: 'LIGHTER_FEE_RATE', prop: 'feeRate', label: 'Maker Fee 保守回退值', type: 'number', default: '0.0005', min: 0, max: 0.05, step: 0.000001 },
      { env: 'LIGHTER_ORDER_GAP_MS', prop: 'orderGapMs', label: '连续签名批次间隔（毫秒）', type: 'integer', default: '300', min: 100, max: 30000, step: 100 },
    ],
    liveGuide: {
      url: 'https://robinhoodchain.lighter.xyz/?referral=WELINKBTC', summary: '实盘模式：RHC Lighter Account / API Key Index 与官方 signer 配置',
      steps: [
        '在 RHC Lighter 应用创建账户与专用 API Key，复制非负整数 LIGHTER_ACCOUNT_INDEX。',
        'LIGHTER_API_KEY_INDEX 使用 4–254，并必须和所创建 API 签名私钥的索引完全一致。',
        'LIGHTER_API_PRIVATE_KEY 与私钥文件二选一；推荐把单行 API 私钥保存到 secrets/lighter-api-private-key.txt。它不是 Ethereum 主钱包私钥。',
        '一键启动会准备兼容的 64 位 Python 3.12 和固定版本官方 lighter-sdk；自定义解释器时填写 LIGHTER_PYTHON。',
        '实盘预检固定验证 RHC 官方端点、签名 chain ID 466324、API Key 鉴权、账户编号和权益快照，任何关键检查失败都会让该交易所保持离线。',
      ], warning: '程序不提供提现、转账或 API Key 变更功能；官方 signer 只在本机进程中使用专用 API 私钥。',
    },
  },
];

export function getExchangeDefinition(key) {
  return EXCHANGE_MANIFEST.find((item) => item.key === key);
}

export function publicExchangeManifest(definitions = EXCHANGE_MANIFEST) {
  return definitions.map(({ defaults, fields, liveGuide, ...item }) => ({
    ...item,
    fields: fields.map(({ prop, ...field }) => field),
    liveGuide,
    networks: Object.keys(defaults),
  }));
}

export function exchangeOnboardingTemplate() {
  return {
    schemaVersion: 1,
    note: '复制后修改清单字段，并实现同 key 的 adapter factory；仪表盘、环境设置、代理检测与路由会自动生成。',
    adapterContract: EXCHANGE_ADAPTER_CONTRACT,
    manifest: {
      key: 'next', shortCode: 'NX', name: 'Next Exchange', chain: 'Network', color: '#14b8a6', defaultNetwork: 'testnet',
      modeEnv: 'NEXT_MODE', networkEnv: 'NEXT_NETWORK', proxyEnv: 'NEXT_PROXY',
      healthPath: '/status', supportsDirectProxy: true,
      capabilities: ['公开行情', '模拟网格', '实盘签名', '杠杆', '独立代理'],
      defaults: {
        mainnet: { apiUrl: 'https://api.exchange.example' },
        testnet: { apiUrl: 'https://sandbox-api.exchange.example' },
      },
      fields: [
        { env: 'NEXT_API_KEY', prop: 'apiKey', label: 'API Key', secret: true, requiredLive: true },
        { env: 'NEXT_API_SECRET', prop: 'apiSecret', label: 'API Secret', secret: true, requiredLive: true },
      ],
      liveGuide: { url: 'https://exchange.example/api-keys', summary: '实盘模式配置说明', steps: [], warning: '' },
    },
  };
}
