const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("bStockAlpha follows α-RadarTP in the requested shared navigation order", () => {
  const header = read("components/platform-header.tsx");
  const dashboardIndex = header.indexOf('href: "/dashboard"');
  const alphaOpsIndex = header.indexOf('href: "/alphaops"');
  const radarIndex = header.indexOf('href: "/alpha-radar"');
  const bstockIndex = header.indexOf('href: "/bstock-alpha"');
  assert.ok(dashboardIndex >= 0 && alphaOpsIndex > dashboardIndex && radarIndex > alphaOpsIndex && bstockIndex > radarIndex);
});

test("bStockAlpha exposes the controlled research-to-realized-PnL loop", () => {
  const html = read("bstock-alpha.html");
  const script = read("bstock-alpha.js");

  for (const marker of ["CMC AI", "Agent Studio", "DETERMINISTIC STRATEGY", "AGENTIC WALLET", "REALIZED PNL", "FIFO", "CONFIRMED"]) {
    assert.match(html, new RegExp(marker));
  }
  assert.match(html, /REAL DATA ONLY/);
  assert.doesNotMatch(html, /UI DEMO SNAPSHOT|REALIZED PNL · DEMO|\+\$1,284\.62/);
  assert.match(script, /\/api\/bstock-alpha\/market-snapshot/);
  assert.match(script, /\/api\/bstock-alpha\/market-history/);
  assert.match(html, /只有 <strong>FINISHED \/ CONFIRMED<\/strong> 成交才会进入持仓与 PnL 账本/);
  assert.match(script, /wallet_switchEthereumChain/);
  assert.match(script, /chainId: "0x38"/);
  assert.match(script, /\/api\/wallets\/challenge/);
  assert.match(script, /let executionMode = "policy"/);
  assert.match(script, /mode && mode !== "policy"/);
  assert.equal((html.match(/data-mode="policy"/g) || []).length, 1);
  assert.doesNotMatch(html, /data-mode="(?:shadow|canary)"/);
});

test("bStockAlpha keeps deterministic qualification and risk controls", () => {
  const html = read("bstock-alpha.html");
  const script = read("bstock-alpha.js");
  const css = read("bstock-alpha.css");
  const eligibility = read("lib/bstock-eligible-snapshot.ts");
  const riskPolicy = read("lib/bstock-risk-policy.ts");
  const quoteRoute = read("app/api/bstock-alpha/trading/quote/route.ts");
  const executeRoute = read("app/api/bstock-alpha/trading/execute/route.ts");

  assert.equal((eligibility.match(/^    \["/gm) || []).length, 67);
  for (const filter of ["all", "weekly", "stock", "etf", "recommended", "watchlist"]) assert.match(html, new RegExp(`data-universe-filter="${filter}"`));
  assert.match(script, /function createUniverseRow\(asset\)/);
  assert.match(script, /score >= 70/);
  assert.match(script, /bstock-alpha-watchlist/);
  assert.match(html, /“周机会”采用 Binance 官方合格清单快照并长期展示/);
  assert.match(html, /id="restore-weekly-opportunities"/);
  assert.match(script, /bstock-alpha-hidden-weekly-opportunities/);
  assert.match(script, /从周机会移除/);
  assert.match(script, /仍保留在全部列表/);
  assert.match(css, /\.token-row\[hidden\] \{ display: none; \}/);
  assert.match(script, /if \(score >= 78\)/);
  assert.match(script, /if \(score >= 70\)/);
  assert.match(script, /if \(score >= 55\)/);
  assert.match(script, /const MAX_POSITION_PCT = 50/);
  assert.match(script, /positionPct < MAX_POSITION_PCT/);
  assert.match(html, /单标的仓位 &lt; 50%/);
  assert.match(html, /单标的仓位必须严格低于 50%/);
  assert.match(riskPolicy, /BSTOCK_MAX_POSITION_PCT = 50/);
  assert.match(riskPolicy, /postTradeExposureUsd < limitUsd/);
  assert.match(quoteRoute, /isBstockPositionWithinLimit\(postTradeExposureUsd, walletDto\.totalWalletValueUsd\)/);
  assert.match(executeRoute, /isBstockPositionWithinLimit\(\(bstockBalance\?\.valueUsd \|\| 0\) \+ notionalUsd, walletDto\.totalWalletValueUsd\)/);
  assert.match(script, /slippage <= \.5/);
  assert.match(html, /杠杆 \/ 反向 ETF 仍会展示并标注高风险/);
});

test("bStock opportunity pool exposes complete persistent Chinese names", () => {
  const snapshot = read("lib/bstock-eligible-snapshot.ts");
  const localization = JSON.parse(read("data/bstock-localization.json"));
  const live = read("lib/bstock-alpha-live.ts");
  const html = read("bstock-alpha.html");
  const script = read("bstock-alpha.js");
  const css = read("bstock-alpha.css");
  const symbols = [...snapshot.matchAll(/^\s+\["[A-Z0-9]+",\s*"([A-Z0-9]+B)",/gm)].map((match) => match[1]);

  assert.equal(symbols.length, 67);
  assert.equal(Object.keys(localization.names).length, symbols.length);
  assert.deepEqual([...Object.keys(localization.names)].sort(), [...symbols].sort());
  for (const name of Object.values(localization.names)) assert.match(name, /[\u3400-\u9fff]/);
  assert.match(live, /nameZh: BSTOCK_CHINESE_NAMES\[item\.symbol\] \|\| null/);
  assert.match(script, /\/legacy\/data\/bstock-localization\.json/);
  assert.match(script, /chineseName\.className = "token-name-zh"/);
  assert.match(script, /nameZh: live\.nameZh \|\| asset\.nameZh \|\| null/);
  assert.match(css, /\.token-name-zh/);
  assert.match(html, /ui-translations\.js\?v=20260904-bstock-ui-v2/);
  assert.match(html, /bstock-alpha-storage\.js\?v=20260902-dual-wallet-v4/);
  assert.match(html, /bstock-alpha\.js\?v=20260904-ui-system-v1/);
});

test("bStock opportunity pool renders controlled company and ETF brand icons", () => {
  const snapshot = read("lib/bstock-eligible-snapshot.ts");
  const branding = read("lib/bstock-branding.ts");
  const route = read("app/api/bstock-alpha/brand-icon/route.ts");
  const proxy = read("proxy.ts");
  const live = read("lib/bstock-alpha-live.ts");
  const script = read("bstock-alpha.js");
  const css = read("bstock-alpha.css");
  const symbols = [...snapshot.matchAll(/^\s+\["[A-Z0-9]+",\s*"([A-Z0-9]+B)",/gm)].map((match) => match[1]);
  const brandedSymbols = [...branding.matchAll(/^\s{2}([A-Z0-9]+B):\s*"/gm)].map((match) => match[1]);

  assert.equal(symbols.length, 67);
  assert.equal(brandedSymbols.length, symbols.length);
  assert.deepEqual([...brandedSymbols].sort(), [...symbols].sort());
  assert.match(branding, /financialmodelingprep\.com\/image-stock/);
  assert.match(branding, /google\.com\/s2\/favicons/);
  for (const symbol of ["AAOIB", "ARMB", "BABAB", "BEB", "CBRSB", "COINB", "PLTRB", "QNTB", "SKHYB", "SPCXB"]) {
    assert.match(branding, new RegExp(`${symbol}:`));
  }
  assert.match(route, /MAX_BRAND_ICON_BYTES = 256 \* 1024/);
  assert.match(route, /contentType\.startsWith\("image\/"\)/);
  assert.match(route, /bstockBrandFallbackSvg/);
  assert.match(proxy, /api\/bstock-alpha\/brand-icon/);
  assert.match(live, /brandIconUrl: bstockBrandIconPath\(item\.symbol\)/);
  assert.match(script, /image\.loading = eager \? "eager" : "lazy"/);
  assert.match(script, /image\.addEventListener\("error"/);
  assert.match(script, /updateAvatar\(avatar, asset, false\)/);
  assert.match(css, /\.token-brand-icon/);
  assert.match(css, /\.token-avatar\.has-brand-icon/);
});

test("bStock public data keeps a durable official weekly opportunity catalog and degrades without destructive clearing", () => {
  const snapshot = read("lib/bstock-eligible-snapshot.ts");
  const live = read("lib/bstock-alpha-live.ts");
  const cache = read("lib/bstock-public-data-cache.ts");
  const script = read("bstock-alpha.js");
  const browserStorage = read("bstock-alpha-storage.js");

  assert.match(snapshot, /effectiveUntil: null/);
  assert.match(snapshot, /persistenceMode: "DURABLE_WEEKLY_OPPORTUNITY_CATALOG"/);
  assert.match(snapshot, /function eligibilitySnapshotIsCurrent/);
  assert.match(snapshot, /BSTOCK_REGISTRY_BASELINE_ASSETS/);
  assert.match(live, /bstock\.public\.registry\.v1/);
  assert.match(live, /staleForMs: Number\.MAX_SAFE_INTEGER/);
  assert.match(live, /entriesBySymbol = new Map\(persistentBaseline/);
  assert.match(live, /campaignEligibility: eligibility\.available/);
  assert.match(live, /PERSISTENT_OFFICIAL_WEEKLY_CATALOG/);
  assert.match(cache, /stale-while-revalidate/);
  assert.match(cache, /prisma\.systemSetting\.upsert/);
  assert.match(browserStorage, /bstock-alpha-public-data-v2/);
  assert.match(script, /bstockStorage\.writePublicDataCache\(payload\)/);
  assert.match(script, /weekly: visibleConfirmed\.length/);
  assert.match(script, /activeFilter === "weekly" && row\.dataset\.weekly === "true"/);
  assert.doesNotMatch(script, /if \(!confirmed\.has\(symbol\)\) delete assets\[symbol\]/);
  assert.match(script, /保留最近成功快照/);

  const source = [
    "import { eligibilitySnapshotIsCurrent } from './lib/bstock-eligible-snapshot.ts';",
    "process.stdout.write(JSON.stringify({ midday: eligibilitySnapshotIsCurrent(Date.parse('2026-08-20T12:00:00.000Z')), nextDay: eligibilitySnapshotIsCurrent(Date.parse('2026-08-21T00:00:00.000Z')) }));"
  ].join("\n");
  const result = spawnSync(process.execPath, [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), "--eval", source], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { midday: true, nextDay: true });
});

test("bStockAlpha automatically requests a safe Agentic Wallet QR login", () => {
  const html = read("bstock-alpha.html");
  const script = read("bstock-alpha.js");
  const loginRoute = read("app/api/bstock-alpha/agent-login/route.ts");
  const verifyRoute = read("app/api/bstock-alpha/agent-login/verify/route.ts");
  const authHelper = read("lib/bstock-agentic-wallet-auth.ts");
  const qrRoute = read("app/api/bstock-alpha/agent-login-qr/route.ts");
  const legacyRoute = read("lib/legacy-route.ts");

  assert.match(html, /Agent 扫码登录/);
  assert.match(html, /id="request-agent-login"[^>]*>生成登录链接/);
  assert.match(html, /id="agent-login-url"[^>]*readonly/);
  assert.match(html, /id="agent-pairing-code"[^>]*readonly/);
  assert.match(html, /id="agent-login-countdown"/);
  assert.match(html, /我已核对 Binance App 中的配对码完全一致/);
  assert.match(html, /我不会向任何人提供助记词、私钥、验证码或会话令牌/);
  assert.match(script, /app\.binance\.com/);
  assert.match(script, /web3\.binance\.com/);
  assert.match(script, /\/api\/bstock-alpha\/agent-login"/);
  assert.match(script, /\/api\/bstock-alpha\/agent-login-qr/);
  assert.match(script, /\/api\/bstock-alpha\/agent-login\/verify/);
  assert.match(script, /startAgentLoginCountdown/);
  assert.match(script, /scheduleAgentLoginPoll\(delay = 2000\)/);
  assert.match(script, /payload\.status === "CONNECTED"[\s\S]*renderConnectedAgentSession\(\)/);
  assert.doesNotMatch(script, /function renderAgentSession\(/);
  assert.match(loginRoute, /createECDH\("secp256k1"\)/);
  assert.match(authHelper, /wallet-direct\/agent-wallet\/login/);
  assert.match(loginRoute, /isSameOrigin\(request\)/);
  assert.match(loginRoute, /extractAgentSessionId\(response\.headers\)/);
  assert.match(loginRoute, /result\.cookies\.set\(AGENT_SESSION_COOKIE, encodeAgentSession\(state\)/);
  assert.match(loginRoute, /urlForWeb: qrInfo\.qrCodeUrl,[\s\S]*pairingCode,[\s\S]*expireAt/);
  assert.doesNotMatch(loginRoute, /urlForWeb: qrInfo\.qrCodeUrl,[\s\S]{0,120}qrCodeId/);
  assert.doesNotMatch(loginRoute, /urlForWeb: qrInfo\.qrCodeUrl,[\s\S]{0,180}agentSessionId/);
  assert.match(authHelper, /Cache-Control": "no-store/);
  assert.match(authHelper, /httpOnly: true/);
  assert.match(authHelper, /sameSite: "strict"/);
  assert.match(authHelper, /encryptTradingSecret/);
  assert.match(verifyRoute, /BINANCE_CONFIRM_ENDPOINT/);
  assert.match(verifyRoute, /BINANCE_QUERY_ENDPOINT/);
  assert.match(verifyRoute, /qrCodeId: state\.qrCodeId/);
  assert.match(verifyRoute, /connectionStatus === "CONNECTED" && data\.data\.walletCreateStatus === "CREATED"/);
  assert.match(verifyRoute, /isSameOrigin\(request\)/);
  assert.match(verifyRoute, /noStoreHeaders\(\)/);
  assert.match(qrRoute, /allowedHosts = new Set\(\["app\.binance\.com", "web3\.binance\.com"\]\)/);
  assert.match(qrRoute, /Cache-Control": "no-store/);
  assert.match(html, /后台每 2 秒自动完成 Agent 端确认/);
  assert.match(html, /bstock-alpha\.js\?v=20260904-ui-system-v1/);
  assert.match(legacyRoute, /\["\.html", "\.js"\]\.includes\(extension\)[\s\S]*no-store, max-age=0/);
});

test("bStockAlpha supports reviewed multi-chain x402 while settling bStock trades on BNB Chain", () => {
  const page = read("app/bstock-alpha/page.tsx");
  const bridge = read("components/bstock-browser-wallet-bridge.tsx");
  const browserWallet = read("lib/bstock-browser-wallet.ts");
  const evmNetworks = read("lib/bstock-evm.ts");
  const x402Safety = read("lib/bstock-x402.ts");
  const verify = read("app/api/wallets/verify/route.ts");
  const preview = read("app/api/bstock-alpha/browser-wallet/research/preview/route.ts");
  const execute = read("app/api/bstock-alpha/browser-wallet/research/execute/route.ts");
  const quote = read("app/api/bstock-alpha/browser-wallet/trading/quote/route.ts");
  const submit = read("app/api/bstock-alpha/browser-wallet/trading/submit/route.ts");
  const status = read("app/api/bstock-alpha/browser-wallet/trading/order-status/route.ts");
  const script = read("bstock-alpha.js");

  assert.match(page, /BstockBrowserWalletBridge/);
  assert.match(bridge, /B402ExactClientScheme/);
  assert.match(bridge, /CURATED_B402_SPENDERS/);
  assert.match(bridge, /normalizeBrowserSignature/);
  assert.match(bridge, /serializeSignature\(parseSignature\(signature\)\)/);
  assert.match(bridge, /compactSignatureToSignature\(parseCompactSignature\(signature\)\)/);
  assert.match(bridge, /recoverPermit2ExactPayer\(paymentPayload\)/);
  assert.match(bridge, /paymentProtocolVersion: BROWSER_X402_PROTOCOL_VERSION/);
  assert.match(bridge, /locallyVerifyCreatedPayment\(paymentPayload, transferMethod, expectedAddress\)/);
  assert.match(bridge, /x402Client\.fromConfig/);
  assert.match(bridge, /allowedAssets:/);
  assert.match(bridge, /maxAmountPerPayment: String\(requirement\.amount\)/);
  assert.doesNotMatch(bridge, /spendControls:\s*false/);
  assert.match(bridge, /switchEvmNetwork\(provider, chainId\)/);
  assert.match(bridge, /const chain = viemChain\(chainId\)/);
  assert.match(bridge, /createWalletClient\(\{ account: expectedAddress, chain, transport: custom\(provider\) \}\)/);
  assert.match(bridge, /walletClient\.writeContract\(\{[\s\S]*?chain,/);
  assert.doesNotMatch(bridge, /chain:\s*undefined/);
  assert.match(bridge, /sameX402Requirement\(paymentPayload\.accepted, requirement\)/);
  assert.doesNotMatch(bridge, /assetTransferMethod: "permit2"/);
  assert.doesNotMatch(bridge, /merchantPaymentPayload/);
  assert.match(bridge, /paymentPayload\.x402Version !== 2/);
  assert.match(browserWallet, /requireBoundEvmBrowserWallet/);
  assert.match(evmNetworks, /\^eip155:\(\\d\+\)\$/);
  assert.match(evmNetworks, /8453:/);
  assert.match(x402Safety, /Object\.keys\(record\)\.sort\(\)/);
  assert.match(x402Safety, /canonicalJson\(left\.extra \|\| \{\}\) === canonicalJson\(candidate\.extra \|\| \{\}\)/);
  assert.match(verify, /tx\.wallet\.upsert/);
  assert.match(verify, /belongs to another user|已绑定到其他账户/);
  assert.match(preview, /isV2EvmRequirement/);
  assert.match(preview, /fetchUnpaidResearchChallenge\(merchant, trace\)/);
  assert.match(preview, /ResearchPreviewTimeoutError/);
  assert.match(preview, /isEvmCaip2Network\(requirement\.network\)/);
  assert.doesNotMatch(preview, /BSC_X402_UNAVAILABLE/);
  assert.match(execute, /sameX402Requirement\(paymentPayload\.accepted, requirement\)/);
  assert.match(execute, /accepted: requirement/);
  assert.match(execute, /encodePaymentSignatureHeader\(verifiedPayment\.paymentPayload as PaymentPayload\)/);
  assert.match(execute, /paymentProtocolVersion: z\.literal\(BROWSER_X402_PROTOCOL_VERSION\)/);
  assert.match(execute, /paymentHeaderName: z\.literal\("PAYMENT-SIGNATURE"\)/);
  assert.match(execute, /"PAYMENT-SIGNATURE": canonicalPaymentHeaderValue/);
  assert.match(execute, /verifyBrowserPaymentSignature/);
  assert.match(execute, /recoverPermit2ExactPayer\(canonicalPaymentPayload\)/);
  assert.match(execute, /settlementSuccess === true \|\| paymentTxHash/);
  assert.match(execute, /payment_rejected/);
  assert.match(execute, /X402_PAYMENT_REJECTED/);
  assert.match(execute, /X402_SETTLEMENT_STATUS_UNKNOWN/);
  assert.doesNotMatch(execute, /AbortSignal\.timeout\(20_000\)/);
  assert.match(quote, /isBstockPositionWithinLimit/);
  assert.match(quote, /SMART_ROUTER_ADDRESSES\[ChainId\.BSC\]/);
  assert.match(quote, /router\.toLowerCase\(\) !== PANCAKE_SMART_ROUTER\.toLowerCase\(\)/);
  assert.match(submit, /intent\.mode !== "policy"/);
  assert.match(status, /getTransactionReceipt/);
  assert.match(script, /wallet_switchEthereumChain/);
  assert.match(script, /ensureBrowserWalletContext\(true\)/);
  assert.match(script, /\^eip155:\\d\+\$/);
  assert.match(script, /\/api\/bstock-alpha\/browser-wallet\/research\/preview/);
  assert.match(script, /\/api\/bstock-alpha\/browser-wallet\/trading\/quote/);
  assert.match(script, /eth_sendTransaction/);
});

test("browser EIP-712 signatures normalize yParity bytes to canonical RPC v bytes", () => {
  const { parseSignature, serializeSignature } = require("viem");
  const base = `${"11".repeat(32)}${"22".repeat(32)}`;
  assert.equal(serializeSignature(parseSignature(`0x${base}00`)).slice(-2), "1b");
  assert.equal(serializeSignature(parseSignature(`0x${base}01`)).slice(-2), "1c");
  assert.equal(serializeSignature(parseSignature(`0x${base}1b`)).slice(-2), "1b");
  assert.equal(serializeSignature(parseSignature(`0x${base}1c`)).slice(-2), "1c");
});

test("BNB Chain B402 permit2-exact keeps the reviewed spender and rejects untrusted spenders", async () => {
  const { x402Client } = require("@x402/core/client");
  const { B402ExactClientScheme, B402_PERMIT2_ADDRESS, CURATED_B402_SPENDERS } = require("@bnb-chain/b402/client");
  const payer = "0x07BEE6AfAc8049f8383F0C8e1925ab1Bc893fF2F";
  const spender = CURATED_B402_SPENDERS["eip155:56"].exact;
  const requirement = {
    scheme: "exact",
    network: "eip155:56",
    amount: "100000",
    asset: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    payTo: "0x19598a0000000000000000000000000000e89078",
    maxTimeoutSeconds: 60,
    extra: {
      name: "USD Coin",
      version: "1",
      assetTransferMethod: "permit2-exact",
      signerAddress: "0x34F7000000000000000000000000000000000899",
      spenderAddress: spender
    }
  };
  let signedTypedData = null;
  let allowanceQuery = null;
  const scheme = new B402ExactClientScheme({
    account: {
      address: payer,
      signTypedData: async (parameters) => {
        signedTypedData = parameters;
        return `0x${"11".repeat(65)}`;
      }
    },
    methods: ["permit2-exact"],
    permit2Allowance: async (query) => {
      allowanceQuery = query;
      return 100000n;
    },
    trustedSpenders: { "eip155:56": [spender] }
  });
  const client = x402Client.fromConfig({
    schemes: [{ network: requirement.network, client: scheme }],
    spendControls: {
      allowedAssets: [{ network: requirement.network, asset: requirement.asset, maxAmountPerPayment: requirement.amount }]
    }
  });
  const payment = await client.createPaymentPayload({
    x402Version: 2,
    resource: { url: "https://example.com/b402", description: "test", mimeType: "application/json" },
    accepts: [requirement]
  });

  const { encodePaymentSignatureHeader, decodePaymentSignatureHeader } = require("@x402/core/http");
  const { isPermit2PaymentPayload } = require("@bnb-chain/b402");
  assert.equal(isPermit2PaymentPayload(payment), true);
  assert.equal(isPermit2PaymentPayload(decodePaymentSignatureHeader(encodePaymentSignatureHeader(payment))), true);

  assert.deepEqual(payment.accepted, requirement);
  assert.equal(payment.payload.permit2Authorization.spender.toLowerCase(), spender.toLowerCase());
  assert.equal(signedTypedData.message.spender.toLowerCase(), spender.toLowerCase());
  assert.equal(allowanceQuery.spender.toLowerCase(), B402_PERMIT2_ADDRESS.toLowerCase());

  const hostile = { ...requirement, extra: { ...requirement.extra, spenderAddress: "0x9999999999999999999999999999999999999999" } };
  await assert.rejects(
    () => client.createPaymentPayload({
      x402Version: 2,
      resource: { url: "https://example.com/b402", description: "test", mimeType: "application/json" },
      accepts: [hostile]
    }),
    /not in trustedSpenders/
  );
});

test("x402 exact non-default assets pass only the reviewed atomic spend cap", async () => {
  const { x402Client } = require("@x402/core/client");
  const requirement = {
    scheme: "exact",
    network: "eip155:56",
    amount: "100000000000000000",
    asset: "0xcE24439F2D9C6a2289F741120FE202248B666666",
    payTo: "0x3C5f3a6cE224BB89D72f5EB4232ecC27F67B3eeA",
    maxTimeoutSeconds: 60,
    extra: {}
  };
  const scheme = {
    scheme: "exact",
    findDefaultAsset: () => undefined,
    createPaymentPayload: async () => ({ payload: { authorization: { from: "0x0000000000000000000000000000000000000001" } } })
  };
  const paymentRequired = {
    x402Version: 2,
    resource: { url: "https://example.com/research", description: "test", mimeType: "application/json" },
    accepts: [requirement]
  };
  const client = x402Client.fromConfig({
    schemes: [{ network: requirement.network, client: scheme }],
    spendControls: { allowedAssets: [{ network: requirement.network, asset: requirement.asset, maxAmountPerPayment: requirement.amount }] }
  });
  const payload = await client.createPaymentPayload(paymentRequired);
  assert.equal(payload.accepted.asset.toLowerCase(), requirement.asset.toLowerCase());
  assert.equal(payload.accepted.amount, requirement.amount);

  const capped = x402Client.fromConfig({
    schemes: [{ network: requirement.network, client: scheme }],
    spendControls: { allowedAssets: [{ network: requirement.network, asset: requirement.asset, maxAmountPerPayment: "99999999999999999" }] }
  });
  await assert.rejects(() => capped.createPaymentPayload(paymentRequired), /allowedAssets maxAmountPerPayment/);
});

test("bStockAlpha gates real research payment and live trading behind explicit confirmation", () => {
  const html = read("bstock-alpha.html");
  const script = read("bstock-alpha.js");
  const preview = read("app/api/bstock-alpha/research/preview/route.ts");
  const researchExecute = read("app/api/bstock-alpha/research/execute/route.ts");
  const researchJob = read("app/api/bstock-alpha/research/job/route.ts");
  const researchRecover = read("app/api/bstock-alpha/research/recover/route.ts");
  const studioHelper = read("lib/bstock-agent-studio.ts");
  const schema = read("prisma/schema.prisma");
  const quote = read("app/api/bstock-alpha/trading/quote/route.ts");
  const tradeExecute = read("app/api/bstock-alpha/trading/execute/route.ts");
  const status = read("app/api/bstock-alpha/trading/order-status/route.ts");
  const statusHelper = read("lib/bstock-agentic-wallet-order-status.ts");

  assert.match(html, /id="cmc-paid-research"/);
  assert.match(html, /id="studio-paid-research"/);
  assert.match(html, /id="studio-recover-research"/);
  assert.match(html, /id="research-approval-check"/);
  assert.match(script, /confirmation: "确认付费研究"/);
  assert.match(script, /confirmation: "确认实盘交易"/);
  assert.match(preview, /x402-payment\/preview/);
  assert.doesNotMatch(preview, /x402-payment\/sign/);
  assert.match(researchExecute, /z\.literal\("确认付费研究"\)/);
  assert.match(researchExecute, /x402-payment\/sign/);
  assert.match(preview, /selectable: allowedIndices.includes\(option.index\)/);
  assert.match(researchExecute, /waitForEvmApproval/);
  assert.match(researchExecute, /getTransactionReceipt/);
  assert.match(researchExecute, /validateAgentX402Signature\(signature, reviewedOption, intent.resourceUrl\)/);
  assert.match(preview, /parse\(merchantChallenge.resource\?\.url\)/);
  assert.match(preview, /sameX402Requirement\(requirement, option.originalAccept\)/);
  assert.doesNotMatch(researchExecute, /if \(signature\.binanceChainId !== reviewedOption\.binanceChainId\)/);
  assert.doesNotMatch(researchExecute, /请改选 U \/ USD1/);
  assert.match(researchExecute, /symbols: \[asset\.ticker\]/);
  assert.match(researchExecute, /X-BStock-Symbol/);
  assert.match(preview, /status: "REUSED"/);
  assert.match(preview, /status: "RECOVERING"/);
  assert.match(researchExecute, /findRecentOwnedStudioJob/);
  assert.match(researchExecute, /ownerKey: studioOwner\.ownerKey/);
  assert.doesNotMatch(researchExecute, /recoveryJobToken/);
  assert.match(researchJob, /status: "finalizing"/);
  assert.match(researchJob, /if \(record\.status === "succeeded" && record\.reportMarkdown\)/);
  assert.match(researchJob, /\/resume/);
  assert.match(researchJob, /resumeCount: \{ increment: 1 \}/);
  assert.match(researchJob, /retryable/);
  assert.match(researchRecover, /STUDIO_RECOVERY_LOOKBACK_MS/);
  assert.match(researchRecover, /reclaimLegacyStudioJob/);
  assert.match(studioHelper, /STUDIO_REPORT_REUSE_MS = 30 \* 60_000/);
  assert.match(studioHelper, /paymentBelongsToWallet/);
  assert.match(script, /payload\.reportMarkdown/);
  assert.match(script, /if \(bstockSymbol\) \{[\s\S]*studioReports\[bstockSymbol\]/);
  assert.doesNotMatch(script, /if \(bstockSymbol && score != null\)/);
  assert.match(script, /attempt >= 120/);
  assert.match(script, /\/api\/bstock-alpha\/research\/recover/);
  assert.match(schema, /ownerKey\s+String\?/);
  assert.match(schema, /resumeCount\s+Int/);
  assert.match(quote, /fetchCmcLiveSnapshot/);
  assert.match(quote, /RISK_OFF/);
  assert.match(tradeExecute, /z\.literal\("确认实盘交易"\)/);
  assert.match(tradeExecute, /place-order/);
  assert.match(status, /batch-query-market-orders/);
  assert.match(status, /pageSize: 50, sort: "DESC"/);
  assert.match(status, /normalizeAgenticWalletOrderStatus/);
  assert.match(statusHelper, /"SUCCESS", "SUCCEEDED", "COMPLETED", "CONFIRMED", "FILLED"/);
  assert.match(statusHelper, /hasSettlementEvidence/);
});

test("bStockAlpha follows the campaign Realized PnL gas treatment", () => {
  const html = read("bstock-alpha.html");
  assert.match(html, /Realized PnL = 实际卖出收入 − FIFO 实际买入成本（Gas 不计排名）/);
  assert.doesNotMatch(html, /Realized PnL = 卖出收入 − FIFO 成本 − Gas/);
});

test("Agent Studio markdown tables hydrate rating and target price for the decision engine", () => {
  const markdown = [
    "# EQUITY RESEARCH – PORTFOLIO ANALYSIS REPORT",
    "## INVESTMENT SUMMARY",
    "| Symbol | Company | Rating | Price Target | Current Price | Upside / Downside | Risk |",
    "|---|---|---|---|---|---|---|",
    "| **NVDA** | NVIDIA Corporation | **BUY** | $302.83 | $219.74 | +37.8% | High |",
    "## KEY RISKS",
    "- Valuation and supply-chain concentration."
  ].join("\n");
  const source = [
    "import { extractAgentStudioReportSummary, agentStudioRatingScore } from './lib/bstock-agent-studio-report.ts';",
    "const markdown = Buffer.from(process.env.BSTOCK_REPORT_FIXTURE_B64, 'base64').toString('utf8');",
    "const summary = extractAgentStudioReportSummary(markdown);",
    "process.stdout.write(JSON.stringify({ summary, score: agentStudioRatingScore(summary.rating) }));"
  ].join("\n");
  const result = spawnSync(process.execPath, [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), "--eval", source], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, BSTOCK_REPORT_FIXTURE_B64: Buffer.from(markdown).toString("base64") }
  });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.summary.rating, "BUY");
  assert.equal(parsed.summary.targetPrice, 302.83);
  assert.equal(parsed.score, 82);
});

test("Agent Studio structured JSON reports hydrate rating, target price and risks", () => {
  const report = JSON.stringify({
    executive_summary: "Applied Optoelectronics receives a Buy rating.",
    analyses: [{
      symbol: "AAOI",
      rating: "Buy",
      price_target: 163.4,
      principal_risks: ["High beta", "Elevated insider selling"]
    }]
  });
  const source = [
    "import { extractAgentStudioReportSummary, agentStudioRatingScore } from './lib/bstock-agent-studio-report.ts';",
    "const report = Buffer.from(process.env.BSTOCK_REPORT_FIXTURE_B64, 'base64').toString('utf8');",
    "const summary = extractAgentStudioReportSummary(report);",
    "process.stdout.write(JSON.stringify({ summary, score: agentStudioRatingScore(summary.rating) }));"
  ].join("\n");
  const result = spawnSync(process.execPath, [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), "--eval", source], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, BSTOCK_REPORT_FIXTURE_B64: Buffer.from(report).toString("base64") }
  });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.summary.rating, "Buy");
  assert.equal(parsed.summary.targetPrice, 163.4);
  assert.match(parsed.summary.risks, /High beta/);
  assert.equal(parsed.score, 82);
});

test("Agent Studio report reading parser turns structured JSON and Markdown into readable modules", () => {
  const structured = JSON.stringify({
    title: "MSTR Equity Research",
    executive_summary: "Macro conditions are neutral. The company keeps material Bitcoin sensitivity.",
    analyses: [{
      symbol: "MSTR",
      company: "Strategy",
      rating: "Buy",
      price_target: 229.07,
      current_price: 121.96,
      fundamental_analysis: "Revenue remains stable while treasury exposure amplifies equity volatility.",
      valuation_analysis: { method: "Forward valuation", assessment: "Premium valuation" },
      principal_risks: ["Bitcoin drawdown", "Refinancing pressure"],
      conclusion: "Maintain Buy while sizing the position for very high volatility."
    }]
  });
  const markdown = [
    "# NVIDIA Equity Research",
    "## Executive Summary",
    "NVIDIA retains strong AI demand, but valuation leaves less room for execution misses.",
    "## Fundamental Analysis",
    "Data-center growth remains the primary earnings driver.",
    "## Key Risks",
    "- Export restrictions",
    "- Customer concentration",
    "## Conclusion",
    "Rating: BUY. Target Price: $302.83."
  ].join("\n");
  const source = [
    "import { buildAgentStudioReadableReport } from './lib/bstock-agent-studio-report.ts';",
    "const structured = Buffer.from(process.env.BSTOCK_STRUCTURED_B64, 'base64').toString('utf8');",
    "const markdown = Buffer.from(process.env.BSTOCK_MARKDOWN_B64, 'base64').toString('utf8');",
    "process.stdout.write(JSON.stringify({ structured: buildAgentStudioReadableReport(structured), markdown: buildAgentStudioReadableReport(markdown) }));"
  ].join("\n");
  const result = spawnSync(process.execPath, [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), "--eval", source], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      BSTOCK_STRUCTURED_B64: Buffer.from(structured).toString("base64"),
      BSTOCK_MARKDOWN_B64: Buffer.from(markdown).toString("base64")
    }
  });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.structured.sourceFormat, "structured-json");
  assert.match(parsed.structured.title, /MSTR Equity Research/);
  assert.ok(parsed.structured.executiveSummary.length > 0);
  assert.ok(parsed.structured.sections.some((section) => section.title === "基本面分析"));
  assert.ok(parsed.structured.sections.some((section) => section.title === "主要风险"));
  assert.match(parsed.structured.conclusion.join(" "), /Maintain Buy/);
  assert.equal(parsed.markdown.sourceFormat, "markdown");
  assert.match(parsed.markdown.title, /NVIDIA Equity Research/);
  assert.ok(parsed.markdown.executiveSummary.length > 0);
  assert.ok(parsed.markdown.sections.some((section) => /Fundamental Analysis/.test(section.title)));
  assert.match(parsed.markdown.conclusion.join(" "), /BUY/);
});

test("Agent Studio report metrics are partitioned into readable tables without losing narrative", () => {
  const source = [
    "import { partitionReportMetricContent } from './lib/bstock-report-tables.ts';",
    "const macro = partitionReportMetricContent(['宏观环境整体保持中性。', '指标：VIX；水平：15.52；信号：中性', '指标：美联储利率；水平：3.71%；信号：中性'], 'zh');",
    "const facts = partitionReportMetricContent(['代码：AAPL；公司：Apple Inc.；评级：持有；目标价：$324.45；当前价格：$309.68'], 'zh');",
    "const technical = partitionReportMetricContent(['Metric: RSI-14; Reading: 48.6; Signal: Neutral', 'Metric: MA-200; Reading: $281.44; Signal: Price above'], 'en');",
    "process.stdout.write(JSON.stringify({ macro, facts, technical }));"
  ].join("\n");
  const result = spawnSync(process.execPath, [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), "--eval", source], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.deepEqual(parsed.macro.remaining, ["宏观环境整体保持中性。"]);
  assert.equal(parsed.macro.tables[0].title, "关键指标");
  assert.equal(parsed.macro.tables[0].rows.length, 2);
  assert.equal(parsed.facts.tables[0].kind, "facts");
  assert.ok(parsed.facts.tables[0].rows.some((row) => row[0] === "目标价" && row[1] === "$324.45"));
  assert.equal(parsed.technical.tables[0].title, "Key metrics");
  assert.deepEqual(parsed.technical.tables[0].columns, ["Metric", "Reading", "Signal"]);
});

test("bStockAlpha exposes a safe latest-report appreciation dialog", () => {
  const html = read("bstock-alpha.html");
  const script = read("bstock-alpha.js");
  const css = read("bstock-alpha.css");
  const recover = read("app/api/bstock-alpha/research/recover/route.ts");
  const preview = read("app/api/bstock-alpha/research/preview/route.ts");
  const execute = read("app/api/bstock-alpha/research/execute/route.ts");
  const job = read("app/api/bstock-alpha/research/job/route.ts");

  assert.match(html, /id="studio-report-appreciation"[^>]*>AI 研报赏析/);
  assert.match(html, /id="report-reader-dialog"/);
  assert.match(html, /id="report-reader-summary"/);
  assert.match(html, /id="report-reader-sections"/);
  assert.match(html, /id="report-reader-conclusion"/);
  assert.match(html, /data-report-language="zh"/);
  assert.match(html, /data-report-language="en"/);
  assert.match(html, /id="share-studio-report"/);
  assert.match(script, /function renderStudioReportReader\(report, asset = selected\)/);
  assert.match(script, /\/api\/bstock-alpha\/research\/reading/);
  assert.match(script, /\/api\/bstock-alpha\/research\/share/);
  assert.match(script, /item\.textContent = String\(bullet\)/);
  assert.match(script, /function partitionReportMetricContent\(values, language\)/);
  assert.match(script, /document\.createElement\("table"\)/);
  assert.match(script, /byId\("report-reader-raw"\)\.textContent/);
  assert.doesNotMatch(script, /report-reader[^\n]*innerHTML/);
  for (const route of [recover, preview, execute, job]) {
    assert.match(route, /reportReading: buildAgentStudioReadableReport\(/);
  }
  assert.match(css, /\.report-reader-dialog \{[^}]*width: min\(900px/);
  assert.match(css, /\.ai-live-action\.appreciation \{[^}]*linear-gradient/);
  assert.match(html, /bstock-alpha\.css\?v=20260826-ledger-reports-v3/);
  assert.match(html, /bstock-alpha\.js\?v=20260904-ui-system-v1/);
});

test("bStockAlpha localizes report readings and creates sanitized branded share snapshots", () => {
  const localization = read("lib/bstock-agent-studio-localization.ts");
  const readingRoute = read("app/api/bstock-alpha/research/reading/route.ts");
  const shareRoute = read("app/api/bstock-alpha/research/share/route.ts");
  const sharePage = read("app/bstock-alpha/report/[shareKey]/page.tsx");
  const shareData = read("lib/bstock-report-share.ts");

  assert.match(localization, /text: \{ format: \{ type: "json_schema"/);
  assert.match(localization, /bstockResearchTranslation\.upsert/);
  assert.match(readingRoute, /language: z\.enum\(\["zh", "en"\]\)/);
  assert.match(shareRoute, /bstockResearchShare\.upsert/);
  assert.match(shareRoute, /randomBytes\(24\)\.toString\("base64url"\)/);
  assert.match(shareData, /SHARE_KEY_PATTERN = \/\^\[A-Za-z0-9_-\]\{32\}\$\//);
  assert.match(sharePage, /WELINKBTC · bStockAlpha/);
  assert.match(sharePage, /partitionReportMetricContent/);
  assert.match(sharePage, /bstock-report-data-table/);
  assert.match(sharePage, /不包含钱包地址、支付凭据或交易会话/);
  assert.doesNotMatch(shareRoute, /create:\s*\{[\s\S]{0,800}walletAddress:/);
  assert.doesNotMatch(shareRoute, /shareUrl:[\s\S]{0,300}walletAddress/);
  assert.doesNotMatch(shareRoute, /paymentTxHash:/);
});

test("Agentic Wallet quote normalization accepts nullable and numeric live response fields", () => {
  const source = [
    "import { normalizeAgenticWalletQuote, resolveBstockQuoteOutput } from './lib/bstock-agentic-wallet-quote.ts';",
    "const multiplyDecimals = (left, right) => String(Number(left) * Number(right));",
    "const quote = normalizeAgenticWalletQuote({ quoteId: 9137001, uniQuoteId: null, fromCoinSymbol: 'USDT', fromCoinAmount: 5, toCoinSymbol: 'NVDAB', toCoinAmount: '0.00023', toTokenShare: '0.023', toMultiplier: 100, slippage: null, feeDetail: { ratePercent: null, rateFiatValue: 0.0025 }, gasDetails: null });",
    "process.stdout.write(JSON.stringify({ quote, output: resolveBstockQuoteOutput(quote, 'buy', '100', multiplyDecimals) }));"
  ].join("\n");
  const result = spawnSync(process.execPath, [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), "--eval", source], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.quote.quoteId, "9137001");
  assert.equal(parsed.quote.fromCoinAmount, "5");
  assert.equal(parsed.quote.feeDetail.rateFiatValue, "0.0025");
  assert.equal(parsed.output, "0.023");
});

test("Agentic Wallet order normalization accepts nullable live response fields", () => {
  const source = [
    "import { normalizeAgenticWalletOrder } from './lib/bstock-agentic-wallet-order.ts';",
    "const order = normalizeAgenticWalletOrder({ code: null, message: null, orderId: 9137001, clientOrderId: null, orderExpireTime: null, status: null });",
    "process.stdout.write(JSON.stringify(order));"
  ].join("\n");
  const result = spawnSync(process.execPath, [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), "--eval", source], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.orderId, "9137001");
  assert.equal(parsed.clientOrderId, undefined);
  assert.equal(parsed.status, undefined);
});

test("Agentic Wallet order status reconciliation handles history shape drift and terminal aliases", () => {
  const source = [
    "import { matchAgenticWalletMarketOrder, normalizeAgenticWalletMarketOrders, normalizeAgenticWalletOrderStatus } from './lib/bstock-agentic-wallet-order-status.ts';",
    "const nested = normalizeAgenticWalletMarketOrders({ data: { list: [{ orderNo: 9137001, orderStatus: 'SUCCESS', fromTokenSymbol: 'GOOGLB', toTokenSymbol: 'USDT', actualFromAmount: 0.01, actualToAmount: 3.44117, transactionHash: '0xabc', createTime: '2026-08-25T01:02:00.000Z' }, { orderNo: 9137002, orderStatus: 'SUCCESS', fromTokenSymbol: 'NVDAB', toTokenSymbol: 'USDT', actualFromAmount: 0.02, actualToAmount: 4.2, transactionHash: '0x999', createTime: '2026-08-25T01:02:10.000Z' }] } });",
    "const evidence = normalizeAgenticWalletOrderStatus({ orderId: '2', status: 'PENDING', toAmount: '3.44', txHash: '0xdef' });",
    "const correlated = matchAgenticWalletMarketOrder(nested.rows, { orderId: 'parent-260825', fromSymbol: 'GOOGLB', toSymbol: 'USDT', fromAmount: '0.01', submittedAt: Date.parse('2026-08-25T01:00:00.000Z') });",
    "process.stdout.write(JSON.stringify({ nested, terminal: normalizeAgenticWalletOrderStatus(nested.rows[0]), evidence, correlated }));"
  ].join("\n");
  const result = spawnSync(process.execPath, [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), "--eval", source], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.nested.responseShape, "data.list");
  assert.equal(parsed.nested.rows[0].orderId, "9137001");
  assert.equal(parsed.terminal.status, "FINISHED");
  assert.equal(parsed.terminal.successful, true);
  assert.equal(parsed.evidence.status, "FINISHED");
  assert.equal(parsed.evidence.settledByEvidence, true);
  assert.equal(parsed.correlated.strategy, "CORRELATED");
  assert.equal(parsed.correlated.order.orderId, "9137001");
});

test("bStockAlpha keeps narrow-screen controls readable and execution layout compact", () => {
  const html = read("bstock-alpha.html");
  const css = read("bstock-alpha.css");

  assert.match(html, /bstock-alpha\.css\?v=20260826-ledger-reports-v3/);
  assert.match(css, /\.command-actions \{[^}]*margin-left: auto/);
  assert.match(css, /grid-template-columns: minmax\(350px, 390px\) minmax\(0,1fr\)/);
  assert.match(css, /grid-template-areas:"execution-head execution-head"/);
  assert.match(css, /\.order-panel \.risk-checks \{ grid-area:execution-risk/);
  assert.doesNotMatch(css, /\.order-panel \.execution-notice \{ float:left/);
  assert.match(css, /\.ai-live-action \{[^}]*linear-gradient[^}]*box-shadow/);
  assert.match(css, /\.ai-live-action\.secondary \{[^}]*rgba\(172,140,255/);
  assert.match(css, /@media \(min-width: 901px\) and \(max-width: 1180px\)/);
  assert.match(css, /\.token-row \{ grid-template-columns:36px minmax\(120px,1fr\)/);
});

test("bStock FIFO ledger rebuilds average cost only from complete FINISHED wallet history", () => {
  const source = [
    "import { buildBstockTradingLedger } from './lib/bstock-trade-ledger.ts';",
    "const asset = { symbol: 'NVDAB', ticker: 'NVDA', contractAddress: '0x1111111111111111111111111111111111111111', multiplier: '100', price: 220 };",
    "const orders = [",
    "{ orderId: 'buy-1', status: 'FINISHED', fromToken: '0x55d398326f99059fF775485246999027B3197955', toToken: asset.contractAddress, fromSymbol: 'USDT', toSymbol: 'NVDAB', fromAmount: '4', toAmount: '0.0002', txHash: '0x' + 'a'.repeat(64), createdAt: '2026-08-20T01:00:00.000Z' },",
    "{ orderId: 'sell-1', status: 'FINISHED', fromToken: asset.contractAddress, toToken: '0x55d398326f99059fF775485246999027B3197955', fromSymbol: 'NVDAB', toSymbol: 'USDT', fromAmount: '0.00005', toAmount: '1.25', txHash: '0x' + 'b'.repeat(64), createdAt: '2026-08-20T02:00:00.000Z' }",
    "];",
    "const wallet = [{ symbol: 'NVDAB', address: asset.contractAddress, balance: 0.015, balanceExact: '0.015', price: 220, valueUsd: 3.3 }];",
    "const complete = buildBstockTradingLedger({ orders, totalOrders: 2, assets: [asset], walletPositions: wallet });",
    "const mismatched = buildBstockTradingLedger({ orders, totalOrders: 2, assets: [asset], walletPositions: [{ ...wallet[0], balance: 0.016, balanceExact: '0.016' }] });",
    "process.stdout.write(JSON.stringify({ complete, mismatched }));"
  ].join("\n");
  const result = spawnSync(process.execPath, [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), "--eval", source], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.complete.positions[0].averageCostUsd, 200);
  assert.ok(Math.abs(parsed.complete.positions[0].unrealizedPnlUsd - 0.3) < 1e-10);
  assert.ok(Math.abs(parsed.complete.realized[0].realizedPnlUsd - 0.25) < 1e-10);
  assert.ok(Math.abs(parsed.complete.summary.realizedPnlUsd - 0.25) < 1e-10);
  assert.equal(parsed.complete.summary.realizedTradeCount, 1);
  assert.equal(parsed.complete.summary.winningTradeCount, 1);
  assert.equal(parsed.complete.summary.losingTradeCount, 0);
  assert.equal(parsed.complete.summary.winRatePct, 100);
  assert.equal(parsed.complete.summary.profitFactor, null);
  assert.equal(parsed.complete.summary.profitFactorInfinite, true);
  assert.ok(Math.abs(parsed.complete.summary.realizedReturnPct - 25) < 1e-10);
  assert.equal(parsed.complete.orders[0].side, "sell");
  assert.equal(parsed.mismatched.positions[0].averageCostUsd, null);
  assert.match(parsed.mismatched.positions[0].costBasisReason, /余额不一致/);
});

test("bStockAlpha persists buy and sell intents and exposes a durable order-record tab", () => {
  const html = read("bstock-alpha.html");
  const script = read("bstock-alpha.js");
  const schema = read("prisma/schema.prisma");
  const quote = read("app/api/bstock-alpha/trading/quote/route.ts");
  const execute = read("app/api/bstock-alpha/trading/execute/route.ts");
  const status = read("app/api/bstock-alpha/trading/order-status/route.ts");
  const snapshot = read("app/api/bstock-alpha/live-snapshot/route.ts");

  assert.match(html, /data-ledger-tab="orders">订单记录/);
  assert.match(html, /id="order-records-body"/);
  assert.match(script, /function renderOrderRecords\(ledger\)/);
  assert.match(script, /平台意图/);
  assert.match(script, /Agentic Wallet 历史/);
  assert.match(schema, /model BstockTradeRecord/);
  assert.match(schema, /side\s+String/);
  assert.match(quote, /bstockTradeRecord\.upsert/);
  assert.match(quote, /status: "INTENT_CREATED"/);
  assert.match(execute, /status: "SUBMITTING"/);
  assert.match(execute, /submittedAt: new Date\(\)/);
  assert.match(status, /bstockTradeRecord\.updateMany/);
  assert.match(snapshot, /pageSize: 100, sort: "DESC"/);
  assert.match(snapshot, /buildBstockTradingLedger/);
  assert.match(snapshot, /mergeBstockOrderRecords/);
});

test("bStockAlpha derives all four performance metrics and exposes persistent report history", () => {
  const html = read("bstock-alpha.html");
  const script = read("bstock-alpha.js");
  const ledger = read("lib/bstock-trade-ledger.ts");
  const snapshot = read("app/api/bstock-alpha/live-snapshot/route.ts");
  const reading = read("app/api/bstock-alpha/research/reading/route.ts");
  const share = read("app/api/bstock-alpha/research/share/route.ts");
  const studio = read("lib/bstock-agent-studio.ts");

  assert.match(ledger, /winRatePct: number \| null/);
  assert.match(ledger, /profitFactorInfinite: boolean/);
  assert.match(ledger, /winningTradeCount \/ realized\.length \* 100/);
  assert.match(script, /function renderPerformanceMetrics\(ledger, wallet\)/);
  assert.match(script, /setPerformanceMetric\("realized-pnl"/);
  assert.match(script, /setPerformanceMetric\("win-rate"/);
  assert.match(script, /setPerformanceMetric\("profit-factor"/);
  assert.match(script, /PNL RECONCILED ✓/);
  assert.match(html, /data-ledger-tab="reports">研报历史/);
  assert.match(html, /id="report-history-body"/);
  assert.match(snapshot, /studioReportHistory/);
  assert.match(snapshot, /take: 100/);
  assert.match(script, /function renderReportHistory\(history\)/);
  assert.match(script, /function openHistoricalStudioReport\(historyEntry, button\)/);
  assert.match(script, /reportId: historyEntry\.reportId/);
  assert.match(reading, /reportId: z\.string\(\)/);
  assert.match(share, /reportId: z\.string\(\)/);
  assert.match(studio, /findOwnedCompletedStudioJobByRecordId/);
});

test("portfolio positions, order records and realized ledger render localized asset names", () => {
  const html = read("bstock-alpha.html");
  const script = read("bstock-alpha.js");
  const css = read("bstock-alpha.css");

  assert.match(html, /data-ledger-tab="positions">开放仓位/);
  assert.match(html, /data-ledger-tab="orders">订单记录/);
  assert.match(html, /data-ledger-tab="realized">已实现账本/);
  assert.match(script, /function localizedAsset\(symbol\)/);
  assert.match(script, /function appendLocalizedAssetCell\(row, symbol\)/);
  assert.match(script, /appendLocalizedAssetCell\(row, position\.symbol \|\| "bStock"\)/);
  assert.match(script, /appendLocalizedAssetCell\(row, order\.symbol\)/);
  assert.match(script, /appendLocalizedAssetCell\(row, entry\.symbol\)/);
  assert.match(script, /renderWalletPositions\(liveSnapshot\.wallet, liveSnapshot\.tradingLedger\)/);
  assert.match(script, /renderOrderRecords\(liveSnapshot\.tradingLedger\)/);
  assert.match(script, /renderRealizedLedger\(liveSnapshot\.tradingLedger\)/);
  assert.match(css, /\.ledger-asset-identity small/);
});

test("bStock sell controls use held-token quantities and exit-specific review semantics", () => {
  const html = read("bstock-alpha.html");
  const script = read("bstock-alpha.js");
  assert.match(html, /id="order-input-unit"/);
  assert.match(html, /id="pay-token-role">支付币种/);
  assert.match(html, /data-sell-ratio="25"/);
  assert.match(html, /data-sell-ratio="100"/);
  assert.match(script, /decimalRatio\(exactHeldAmount\(\), Number\(button\.dataset\.sellRatio\)\)/);
  assert.match(script, /EXIT · 主动减仓/);
  assert.match(script, /EXIT 不要求/);
  assert.match(script, /tradeQuoteIntent = "";[\s\S]*pollOrderStatus/);
  assert.doesNotMatch(script, /data-close-symbol[\s\S]{0,300}NVDAB" \? "7\.368" : "1"/);
});

test("bStock live quote separates invalid request input from upstream response drift", () => {
  const quoteRoute = read("app/api/bstock-alpha/trading/quote/route.ts");
  assert.match(quoteRoute, /INVALID_TRADE_QUOTE_INPUT/);
  assert.match(quoteRoute, /INVALID_AGENTIC_WALLET_QUOTE/);
  assert.match(quoteRoute, /normalizeAgenticWalletQuote\(quoted\.data\)/);
  assert.match(quoteRoute, /\[bstock:quote\] invalid_upstream_response/);
  assert.match(quoteRoute, /known && error\.status < 500 \? console\.warn : console\.error/);
  assert.match(quoteRoute, /fromTokenShare: input\.side === "sell" \? input\.amount : null/);
  assert.match(quoteRoute, /fromMultiplier: input\.side === "sell" \? asset\.multiplier : null/);
  assert.match(quoteRoute, /amount: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(100\)\.regex\(\/\^\\d\+\(\?:\\\.\\d\+\)\?\$\/\)/);
  assert.match(quoteRoute, /resolveBstockSellRawAmount\(input\.amount, asset\.multiplier, rawBstockToken!\.balance, rawTokenDecimals\)/);
  assert.doesNotMatch(quoteRoute, /\? "交易报价参数无效。"/);
  const executeRoute = read("app/api/bstock-alpha/trading/execute/route.ts");
  assert.match(executeRoute, /tokenShare: intent\.side === "sell" \? intent\.amount : null/);
  assert.match(executeRoute, /multiplier: intent\.side === "sell" \? asset\.multiplier : null/);
  assert.match(executeRoute, /INVALID_TRADE_EXECUTION_INPUT/);
  assert.match(executeRoute, /normalizeAgenticWalletOrder\(submitted\.data\)/);
  assert.match(executeRoute, /ORDER_SUBMISSION_STATUS_UNKNOWN/);
  assert.match(executeRoute, /\[bstock:execute\] invalid_upstream_response/);
  assert.match(executeRoute, /resolveBstockSellRawAmount\(intent\.amount, asset\.multiplier, rawBstockToken!\.balance, rawTokenDecimals\)/);
  assert.doesNotMatch(executeRoute, /\? "实盘确认参数无效。"/);
  const script = read("bstock-alpha.js");
  assert.match(script, /状态待核验，请勿重试/);
});

test("bStock full-position sells preserve high-precision shares and cap raw units to the wallet balance", () => {
  const source = [
    "import { multiplyDecimals, divideDecimalsRoundUp, resolveBstockSellRawAmount } from './lib/bstock-decimals.ts';",
    "const rawBalance = '0.1';",
    "const multiplier = '0.333333333333333333';",
    "const shares = multiplyDecimals(rawBalance, multiplier);",
    "const roundedShare = '0.0333333333333333334';",
    "process.stdout.write(JSON.stringify({ shares, rounded: divideDecimalsRoundUp(roundedShare, multiplier), resolved: resolveBstockSellRawAmount(roundedShare, multiplier, rawBalance) }));"
  ].join("\n");
  const result = spawnSync(process.execPath, [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), "--eval", source], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.ok(parsed.shares.split(".")[1].length > 18);
  assert.notEqual(parsed.rounded, parsed.resolved);
  assert.equal(parsed.resolved, "0.1");
});

test("bStock live snapshot refresh preserves the active Agentic Wallet trade quote", () => {
  const html = read("bstock-alpha.html");
  const script = read("bstock-alpha.js");

  assert.match(script, /const previousSymbol = selected\?\.symbol;[\s\S]*selected = asset;[\s\S]*if \(previousSymbol !== asset\.symbol\) resetTradeQuote\(\);/);
  assert.doesNotMatch(script, /selected = asset;\s*resetTradeQuote\(\);/);
  assert.match(script, /tradeQuoteIntent = payload\.intent;[\s\S]*updateTradeApprovalButton\(\);[\s\S]*refreshLiveSnapshot\(\{ silent: true \}\);/);
  assert.match(script, /byId\("approval-check"\)\.addEventListener\("change", updateTradeApprovalButton\)/);
  assert.match(script, /byId\("eligibility-approval-check"\)\.addEventListener\("change", updateTradeApprovalButton\)/);
  assert.match(html, /bstock-alpha\.js\?v=20260904-ui-system-v1/);
});
