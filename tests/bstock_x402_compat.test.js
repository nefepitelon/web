const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { privateKeyToAccount } = require('viem/accounts');
const { decodeFunctionData, erc20Abi } = require('viem');
const { decodePaymentSignatureHeader } = require('@x402/core/http');
function load(file, imports = {}) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  vm.runInNewContext(source, { exports, require: name => name in imports ? imports[name] : require(name),
    Buffer, Date, Error, BigInt, console, setTimeout, clearTimeout }, { filename: file });
  return exports;
}
const wire = load('lib/bstock-x402.ts');
const agent = load('lib/bstock-agentic-wallet-x402.ts', { './bstock-x402': wire });
const options = load('lib/bstock-agent-x402-options.ts', { './bstock-agentic-wallet-x402': agent });
const permit = load('lib/bstock-x402-permit2.ts');
// Public disposable fixture key. No RPC, installed wallet, funds or merchant calls.
const account = privateKeyToAccount('0x' + '01'.repeat(32));
const resource = 'https://stock-agent.bnbchain.org/x402/analyze/async';
const requirement = { scheme: 'exact', network: 'eip155:56', amount: '100000000000000000',
  asset: '0x55d398326f99059fF775485246999027B3197955', payTo: '0xd10bddc20e4dc42a1a19a9653e994991e25b8153', maxTimeoutSeconds: 600,
  extra: { name: 'Tether USD', version: '1', assetTransferMethod: 'permit2-exact',
    signerAddress: '0x34F7a661160780Ce1346e6D7B96D2bE244590899', spenderAddress: '0x3038f7ac3b4D1a3fe886BdCB5cD01e9f6BDd8633' } };

test('external preview preserves guest 401 and clears a terminal expired wallet session', async () => {
  class WalletError extends Error {
    constructor(terminal) { super('请重新连接钱包'); this.status = 401; this.code = terminal ? 'SESSION_EXPIRED' : 'NO_AGENT_SESSION'; this.terminal = terminal; }
  }
  for (const terminal of [false, true]) {
    const cleared = [];
    let externalCalls = 0;
    const route = load('app/api/bstock-alpha/research/external/preview/route.ts', {
      'next/server': { NextResponse: { json: (body, options) => ({ body, ...options, cookies: { set: (...args) => cleared.push(args) } }) } },
      '@/lib/bstock-agentic-wallet-auth': { AGENT_SESSION_COOKIE: 'agent-session', clearAgentSessionCookieOptions: () => ({ maxAge: 0 }), isSameOrigin: () => true, noStoreHeaders: () => ({ 'Cache-Control': 'no-store' }) },
      '@/lib/bstock-agentic-wallet-client': { AgenticWalletRequestError: WalletError, connectedAgentSession: () => { throw new WalletError(terminal); } },
      '@/lib/bstock-alpha-live': { decodeResearchIntent: () => { throw new Error('must not decode guest intent'); } },
      '@/lib/bstock-agent-x402-external': { previewExternalResearch: () => { externalCalls++; } }
    });
    const response = await route.POST({ json: async () => ({ intent: 'untrusted-intent-value', selectedIndex: 1 }) });
    assert.equal(response.status, 401);
    assert.equal(response.body.code, terminal ? 'SESSION_EXPIRED' : 'NO_AGENT_SESSION');
    assert.equal(externalCalls, 0);
    assert.equal(cleared.length, terminal ? 1 : 0);
    if (terminal) assert.deepEqual(cleared[0], ['agent-session', '', { maxAge: 0 }]);
  }
});

test('native wallet balance, policy and network failures are preserved and cannot enter external signing', () => {
  for (const reason of ['INSUFFICIENT_BALANCE', 'BLOCKED_BY_SECURITY_CHECK', 'BLOCKED_DAILY_LIMIT_REACHED', 'UNSUPPORTED_NETWORK', 'INVALID_ACCEPT_STRUCTURE', 'NO_WALLET_ON_CHAIN']) {
    const option = { index: 1, status: 'NOT_SIGNABLE', binanceChainId: '56', reasons: [reason] };
    assert.equal(options.selectableNativeAgentOption(option), false);
    assert.equal(options.externalPermit2Candidate(option, requirement), false);
    assert.ok(options.agentPaymentReasonText([reason]));
  }
  const native = { index: 1, status: 'READY_TO_SIGN', binanceChainId: '8453', reasons: [] };
  assert.equal(options.selectableNativeAgentOption(native), true);
  assert.equal(options.selectableNativeAgentOption({ ...native, reasons: ['INSUFFICIENT_BALANCE'] }), false);
  const missingMethod = { index: 2, status: 'NOT_SIGNABLE', reasons: ['UNSUPPORTED_METHOD'] };
  assert.equal(options.externalPermit2Candidate(missingMethod, requirement), true);
  assert.equal(options.externalPermit2Candidate({ ...missingMethod, reasons: ['UNSUPPORTED_METHOD', 'BLOCKED_BY_SECURITY_CHECK'] }, requirement), false);
  assert.equal(options.externalPermit2Candidate(missingMethod, { ...requirement, network: 'eip155:8453' }), false);
});

test('real B402 SDK builds exact short-lived typed data and recovers the actual disposable signer offline', async () => {
  const unsigned = await permit.buildUnsignedAgentPermit2(requirement, account.address, resource);
  const typed = unsigned.typedData;
  assert.equal(typed.domain.name, 'Permit2');
  assert.equal(typed.domain.chainId, 56);
  assert.equal(typed.domain.verifyingContract, permit.B402_PERMIT2_ADDRESS);
  assert.equal(typed.domain.version, undefined);
  assert.equal(typed.message.permitted.amount, requirement.amount);
  assert.equal(typed.message.permitted.token, requirement.asset);
  assert.equal(typed.message.spender, requirement.extra.spenderAddress);
  assert.equal(typed.message.witness.to, requirement.payTo);
  assert.ok(BigInt(typed.message.deadline) <= BigInt(Math.floor(Date.now() / 1000) + 180));
  const signature = await account.signTypedData(typed);
  const normalized = permit.normalizeAgentMessageSignature(signature.slice(0, 130), signature.slice(130));
  const signed = await permit.bindAgentPermit2Signature(unsigned.payment, normalized, account.address);
  assert.equal(signed.accepted.amount, requirement.amount);
  assert.equal(signed.resource.url, resource);
  for (const mutate of [p => p.payload.permit2Authorization.nonce = '7', p => p.payload.permit2Authorization.witness.to = account.address,
    p => p.payload.permit2Authorization.permitted.amount = '9', p => p.accepted.payTo = account.address]) {
    const changed = JSON.parse(JSON.stringify(unsigned.payment)); mutate(changed);
    await assert.rejects(permit.bindAgentPermit2Signature(changed, normalized, account.address));
  }
  assert.throws(() => agent.validateAgentX402Signature({ paymentHeaderName: 'PAYMENT-SIGNATURE',
    paymentHeaderValue: require('@x402/core/http').encodePaymentSignatureHeader(signed), signatureExpiresAt: unsigned.deadline },
    { index: 1, binanceChainId: '56', requirement, signingMode: 'external' }, 'https://other.example/report'), /研究服务不一致/);
  for (const changed of [{ ...requirement, amount: '1000000000000000001' }, { ...requirement, network: 'eip155:8453' },
    { ...requirement, asset: account.address }, { ...requirement, extra: { ...requirement.extra, spenderAddress: account.address } }]) {
    await assert.rejects(permit.buildUnsignedAgentPermit2(changed, account.address, resource));
  }
});

function fixture(config = {}) {
  const calls = [], claims = new Set();
  const state = { walletAddress: account.address };
  const intent = { createdAt: Date.now(), agentKey: 'agent-key', requestId: 'request-id', resourceUrl: resource, provider: 'studio',
    allowedOptions: [{ index: 3, binanceChainId: '56', signingMode: 'external', requirement }] };
  const database = { rateLimitBucket: { create: async input => {
    const key = input.data.key;
    if (claims.has(key)) throw { code: 'P2002' };
    claims.add(key); return {};
  } } };
  const claim = load('lib/bstock-research-claim.ts', { 'server-only': {}, '@/lib/prisma': { prisma: database } });
  const helper = load('lib/bstock-agent-x402-external.ts', {
    'server-only': {}, '@/lib/alpha-execution/credentials': {
      encryptTradingSecret: value => Buffer.from(value).toString('base64'), decryptTradingSecret: value => Buffer.from(value, 'base64').toString()
    }, '@/lib/bstock-agentic-wallet-auth': {},
    '@/lib/bstock-agentic-wallet-client': { agentSessionKey: () => 'agent-key', agentWalletRequest: async (s, endpoint, request) => {
      calls.push({ endpoint, request });
      if (endpoint.endsWith('/settings/query')) return { state, data: { devMode: { enabled: config.enabled !== false, expiresAt: Math.floor(Date.now()/1000) + 1000 } } };
      if (endpoint.endsWith('/preview')) return { state, data: { requestId: 'review-request-id', expiresAt: Date.now() + 90000,
        parsedMessage: { message: request.body.message }, parsedTx: { recipient: requirement.asset }, risks: { riskDetails: [] } } };
      if (endpoint.endsWith('contract-call/execute')) return { state, data: config.approvalStatus
        ? { status: config.approvalStatus } : { status: 'BROADCASTED', txHash: '0x' + 'ab'.repeat(32) } };
      if (endpoint.endsWith('sign-message/execute') && config.pending) return { state, data: { status: 'PENDING_CONFIRMATION', orderId: 'message-order' } };
      const previewCall = calls.find(c => c.endpoint.endsWith('sign-message/preview'));
      const wrapper = JSON.parse(previewCall.request.body.message);
      const signature = await account.signTypedData(JSON.parse(wrapper.params[1]));
      return { state, data: { status: 'COMPLETED', orderId: 'message-order', signature: signature.slice(2, 130), signatureRecovery: signature.slice(130) } };
    } },
    '@/lib/bstock-agent-studio': { resolveResearchOwner: async () => ({ state, walletAddress: account.address }) },
    '@/lib/bstock-evm': { getEvmPublicClientByChainId: () => ({
      readContract: async input => ({ balanceOf: config.empty ? 0n : 10n ** 18n, allowance: config.approval ? 0n : 10n ** 18n, decimals: 18, symbol: 'USDT' })[input.functionName],
      getBalance: async () => 1n
    }) }, '@/lib/bstock-research-claim': claim, '@/lib/bstock-x402-permit2': permit
  });
  return { helper, calls, claims, state, intent, token: 'bound-base-intent', claim };
}

test('disabled Developer Mode and insufficient tokens never reach a sign/approval preview or execution', async () => {
  for (const config of [{ enabled: false }, { empty: true }]) {
    const f = fixture(config);
    await assert.rejects(f.helper.previewExternalResearch(f.state, f.token, f.intent, 3));
    assert.ok(f.calls.every(call => call.endpoint.endsWith('settings/query')));
    assert.equal(f.claims.size, 0);
  }
});

test('insufficient allowance previews and independently executes only exact approval; never a payment signature', async () => {
  const f = fixture({ approval: true });
  const preview = await f.helper.previewExternalResearch(f.state, f.token, f.intent, 3);
  assert.equal(preview.body.kind, 'APPROVAL');
  const call = f.calls.find(call => call.endpoint.endsWith('contract-call/preview'));
  const tx = call.request.body;
  assert.equal(tx.to.toLowerCase(), requirement.asset.toLowerCase());
  assert.equal(tx.value, '0');
  const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.inputData });
  assert.equal(decoded.functionName, 'approve');
  assert.equal(decoded.args[0], permit.B402_PERMIT2_ADDRESS);
  assert.equal(decoded.args[1], BigInt(requirement.amount));
  const review = f.helper.decodeBoundExternalReview(preview.body.externalReview, f.token, f.intent, 3, f.state);
  assert.throws(() => f.helper.decodeBoundExternalReview(preview.body.externalReview, 'different intent', f.intent, 3, f.state));
  assert.throws(() => f.helper.decodeBoundExternalReview(preview.body.externalReview, f.token, f.intent, 4, f.state));
  const result = await f.helper.executeExternalResearch(f.state, review, f.intent);
  assert.equal(result.body.status, 'APPROVAL_SUBMITTED');
  assert.equal(result.signature, undefined);
  await assert.rejects(f.helper.executeExternalResearch(f.state, review, f.intent), /已经提交/);
  assert.equal(f.calls.filter(call => call.endpoint.endsWith('/execute')).length, 1);
  assert.ok(!f.calls.some(call => call.endpoint.includes('sign-message')));
});

test('rejected, failed and expired approvals report their exact terminal state and never sign or pay', async () => {
  for (const status of ['REJECTED', 'FAILED', 'EXPIRED']) {
    const f = fixture({ approval: true, approvalStatus: status });
    const preview = await f.helper.previewExternalResearch(f.state, f.token, f.intent, 3);
    const review = f.helper.decodeBoundExternalReview(preview.body.externalReview, f.token, f.intent, 3, f.state);
    const result = await f.helper.executeExternalResearch(f.state, review, f.intent);
    assert.equal(result.body.status, `APPROVAL_${status}`);
    assert.equal(result.body.approvalStatus, status);
    assert.equal(result.body.approveTxHash, null);
    assert.equal(result.signature, undefined);
    assert.match(result.body.message, /未执行研报付款签名、未提交研报付款/);
    assert.doesNotMatch(result.body.message, /授权已提交/);
    await assert.rejects(f.helper.executeExternalResearch(f.state, review, f.intent), /已经提交/);
    assert.equal(f.calls.filter(call => call.endpoint.endsWith('/execute')).length, 1);
    assert.ok(!f.calls.some(call => call.endpoint.includes('sign-message')));
  }
});

test('pending App confirmation queries the same order without re-executing and returns a bound real signature', async () => {
  const f = fixture({ pending: true });
  const preview = await f.helper.previewExternalResearch(f.state, f.token, f.intent, 3);
  assert.equal(preview.body.kind, 'PAYMENT');
  const review = f.helper.decodeBoundExternalReview(preview.body.externalReview, f.token, f.intent, 3, f.state);
  const pending = await f.helper.executeExternalResearch(f.state, review, f.intent);
  assert.equal(pending.body.status, 'SIGNATURE_PENDING');
  const continuation = f.helper.decodeBoundExternalReview(pending.body.externalReview, f.token, f.intent, 3, f.state);
  const completed = await f.helper.executeExternalResearch(f.state, continuation, f.intent);
  const payment = decodePaymentSignatureHeader(completed.signature.paymentHeaderValue);
  assert.equal(payment.accepted.amount, requirement.amount);
  assert.equal(payment.resource.url, resource);
  assert.equal(payment.payload.permit2Authorization.from, account.address);
  assert.equal(f.calls.filter(call => call.endpoint.endsWith('sign-message/execute')).length, 1);
  const query = f.calls.find(call => call.endpoint.endsWith('sign-message/result'));
  assert.deepEqual(JSON.parse(JSON.stringify(query.request.body)), { orderId: 'message-order' });
  await assert.rejects(f.helper.executeExternalResearch(f.state, review, f.intent), /已经提交/);
  await f.claim.claimResearchOperation('agent-key', 'request-id', 'merchant_replay');
  await assert.rejects(f.claim.claimResearchOperation('agent-key', 'request-id', 'merchant_replay'), /已经提交/);
});
