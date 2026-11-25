const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const http = require('@x402/core/http');
const { z } = require('zod');
const root = path.resolve(__dirname, '..');
const compiled = new Map();
function load(file, imports = {}, globals = {}) {
  if (!compiled.has(file)) compiled.set(file, ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText);
  const exports = {};
  vm.runInNewContext(compiled.get(file), { exports, require: name => name in imports ? imports[name] : require(name),
    Buffer, Date, BigInt, Error, Response, AbortSignal, setTimeout, clearTimeout, console, ...globals }, { filename: file });
  return exports;
}
const x402 = load('lib/bstock-x402.ts');
const agent = load('lib/bstock-agentic-wallet-x402.ts', { './bstock-x402': x402 });
const rejection = load('lib/bstock-research-payment-response.ts');
const payer = '0x2222222222222222222222222222222222222222';
const merchantUrl = 'https://stock-agent.bnbchain.org/x402/analyze/async';
const requirement = { scheme: 'exact', network: 'eip155:56', amount: '100000000000000000',
  asset: '0x55d398326f99059fF775485246999027B3197955', payTo: '0xd10bddc20e4dc42a1a19a9653e994991e25b8153', maxTimeoutSeconds: 600,
  extra: { name: 'Tether USD', version: '1', assetTransferMethod: 'permit2-exact',
    signerAddress: '0x34F7a661160780Ce1346e6D7B96D2bE244590899', spenderAddress: '0x3038f7ac3b4D1a3fe886BdCB5cD01e9f6BDd8633' } };
function payment() {
  return { x402Version: 2, accepted: { ...requirement, asset: requirement.asset.toLowerCase(), payTo: requirement.payTo.toUpperCase().replace('0X', '0x') },
    payload: { signature: '0x' + '11'.repeat(65), unsignedWalletMetadata: 'not-part-of-the-payment', permit2Authorization: {
      from: payer, permitted: { token: requirement.asset, amount: requirement.amount }, spender: requirement.extra.spenderAddress,
      nonce: '0x1234', deadline: String(Math.floor(Date.now() / 1000) + 600), witness: { to: requirement.payTo, validAfter: 0 }
    } } };
}
function fixture(options = {}) {
  const calls = { sign: 0, external: 0, fetch: [], jobs: [], logs: [], claims: [] };
  const state = { walletAddress: payer };
  class AgenticWalletRequestError extends Error {}
  const logger = Object.fromEntries(['info', 'warn', 'error'].map(level => [level, (...args) => calls.logs.push(args.join(' '))]));
  const imports = {
    'next/server': { NextResponse: { json: (data, init) => new Response(JSON.stringify(data), init) } },
    zod: { z }, '@/lib/alpha-execution/credentials': { encryptTradingSecret: () => 'encrypted-job-token' },
    '@/lib/bstock-agentic-wallet-auth': { isSameOrigin: () => options.sameOrigin !== false, noStoreHeaders: () => ({ 'Cache-Control': 'no-store' }) },
    '@/lib/bstock-agentic-wallet-client': { AgenticWalletRequestError, connectedAgentSession: () => state,
      agentSessionKey: () => 'session-key', persistAgentSession: r => r,
      agentWalletRequest: async () => { calls.sign++; return { state, data: {
        paymentHeaderName: 'PAYMENT-SIGNATURE', paymentHeaderValue: Buffer.from(JSON.stringify(options.payment || payment())).toString('base64url'),
        binanceChainId: null, approveTxHash: null, signatureExpiresAt: Math.floor(Date.now() / 1000) + 600
      } }; } },
    '@/lib/bstock-alpha-live': { decodeResearchIntent: () => ({ agentKey: 'session-key', createdAt: Date.now(), provider: 'studio',
      symbol: 'AAOIB', ticker: 'AAOI', contractAddress: requirement.asset, paymentId: 'preview-id', requestId: 'request-id',
      resourceUrl: merchantUrl, allowedIndices: [1], allowedOptions: [{ index: 1, binanceChainId: '56', requirement, signingMode: options.external ? 'external' : 'native' }] }),
      fetchOfficialBstockMarket: async () => ({ assets: [{ symbol: 'AAOIB', ticker: 'AAOI', contractAddress: requirement.asset, campaignEligibility: 'CONFIRMED' }] }) },
    '@/lib/bstock-agent-studio': { resolveResearchOwner: async () => ({ state, ownerKey: 'owner:fixture' }),
      findRecentOwnedStudioJob: async () => null, isStudioReportComplete: () => false, isStudioJobPending: () => false, isStudioJobTerminalFailure: () => false },
    '@/lib/prisma': { prisma: { bstockResearchJob: { upsert: async input => { calls.jobs.push(input); return {}; } } } },
    '@/lib/bstock-evm': { evmNetworkLabel: () => 'BNB Smart Chain' },
    '@/lib/bstock-agentic-wallet-x402': agent,
    '@/lib/bstock-research-claim': { claimResearchOperation: async (key, id, step) => {
      if (calls.claims.includes(step)) throw new Error('already submitted');
      calls.claims.push(step);
    } },
    '@/lib/bstock-agent-x402-external': {
      decodeBoundExternalReview: () => ({ kind: 'APPROVAL' }),
      executeExternalResearch: async () => { calls.external++; return { state, body: { status: 'APPROVAL_SUBMITTED' } }; }
    },
    '@/lib/bstock-research-payment-response': rejection
  };
  const route = load('app/api/bstock-alpha/research/execute/route.ts', imports, { console: logger,
    fetch: async (url, init) => { calls.fetch.push({ url, init });
      if (options.timeout) throw new DOMException('fixture timeout', 'TimeoutError');
      return new Response(JSON.stringify(options.body || { jobId: 'job-fixture', jobToken: 'private-fixture-token', status: 'settling' }), {
        status: options.status || 202, headers: options.headers || {}
      });
    } });
  return { calls, run: (input = {}) => route.POST({ json: async () => ({ intent: 'i'.repeat(30), selectedIndex: 1, confirmation: '确认付费研究', acknowledged: true, ...input }) }) };
}
test('Agent Studio forwards the exact reviewed merchant requirement and canonical wire, preserving authorization values', async () => {
  const app = fixture();
  const response = await app.run();
  const result = await response.json();
  assert.equal(response.status, 202, JSON.stringify(result));
  assert.equal(app.calls.sign, 1);
  assert.equal(app.calls.fetch.length, 1);
  const sent = app.calls.fetch[0];
  assert.equal(sent.url, merchantUrl);
  assert.equal(sent.init.redirect, 'error');
  assert.deepEqual(JSON.parse(sent.init.body), { symbols: ['AAOI'], analysis_type: 'comprehensive' });
  const value = sent.init.headers['PAYMENT-SIGNATURE'];
  assert.equal(Buffer.from(value, 'base64').toString('base64'), value, 'merchant requires strict padded base64');
  const decoded = JSON.parse(Buffer.from(value, 'base64').toString());
  assert.deepEqual(decoded.accepted, requirement, 'upstream exact-dict check must pass, including case and metadata');
  assert.equal(decoded.resource.url, merchantUrl);
  assert.equal(decoded.payload.signature, payment().payload.signature);
  const auth = decoded.payload.permit2Authorization;
  assert.equal(auth.nonce, '4660');
  assert.equal(auth.witness.validAfter, '0');
  assert.equal(auth.spender, requirement.extra.spenderAddress.toLowerCase());
  assert.equal(auth.permitted.amount, requirement.amount);
  assert.deepEqual(Object.keys(decoded.payload).sort(), ['permit2Authorization', 'signature']);
  assert.equal(app.calls.jobs.length, 1);
  assert.equal(result.jobId, 'job-fixture');
  assert.ok(!JSON.stringify(result).includes('private-fixture-token'));
  assert.ok(!app.calls.logs.join('').includes(payment().payload.signature));
});
test('a repeated Agent payment intent cannot sign or submit twice', async () => {
  const app = fixture();
  assert.equal((await app.run()).status, 202);
  assert.equal((await app.run()).status, 502);
  assert.equal(app.calls.sign, 1);
  assert.equal(app.calls.fetch.length, 1);
  assert.deepEqual(app.calls.claims, ['signature', 'merchant_replay']);
});
test('external approval cannot use ordinary payment confirmation or bypass its separate reviewed step', async () => {
  for (const input of [{}, { externalReview: 'r'.repeat(30) }, { externalReview: 'r'.repeat(30), externalConfirmation: '确认外部付款签名' }]) {
    const app = fixture({ external: true });
    assert.equal((await app.run(input)).status, 409);
    assert.equal(app.calls.external, 0); assert.equal(app.calls.sign, 0); assert.equal(app.calls.fetch.length, 0);
  }
  const app = fixture({ external: true });
  const response = await app.run({ externalReview: 'r'.repeat(30), externalConfirmation: '确认有限额度授权' });
  assert.equal(response.status, 202);
  assert.equal((await response.json()).status, 'APPROVAL_SUBMITTED');
  assert.equal(app.calls.external, 1); assert.equal(app.calls.sign, 0); assert.equal(app.calls.fetch.length, 0);
});
test('Studio errorCode payment_rejected reaches the UI without another sign or replay', async () => {
  const app = fixture({ status: 402, body: { errorCode: 'payment_rejected' } });
  const response = await app.run();
  const result = await response.json();
  assert.equal(response.status, 402);
  assert.equal(result.code, 'X402_PAYMENT_REJECTED');
  assert.equal(result.upstreamCode, 'payment_rejected');
  assert.equal(result.requiresNewPreview, true);
  assert.equal(result.retryable, false);
  assert.equal(app.calls.sign, 1);
  assert.equal(app.calls.fetch.length, 1);
  assert.equal(app.calls.jobs.length, 0);
});
test('402 with settlement evidence cannot invite a new payment or claim the charge failed', async () => {
  const hash = '0x' + 'aa'.repeat(32);
  const app = fixture({ status: 402, body: { errorCode: 'payment_rejected' }, headers: {
    'payment-response': Buffer.from(JSON.stringify({ success: true, transaction: hash, network: 'eip155:56' })).toString('base64')
  } });
  const response = await app.run();
  const result = await response.json();
  assert.equal(response.status, 502);
  assert.equal(result.code, 'X402_SETTLEMENT_STATUS_UNKNOWN');
  assert.equal(result.paymentTxHash, hash);
  assert.equal(result.requiresNewPreview, false);
  assert.equal(app.calls.fetch.length, 1);
});
test('official Studio success:false receipt is a rejected settlement, not an unknown or successful charge', async () => {
  const receipt = { success: false, transaction: '', network: 'eip155:56', errorReason: 'payment_rejected' };
  const app = fixture({ status: 402, body: { errorCode: 'payment_rejected' }, headers: {
    'payment-response': Buffer.from(JSON.stringify(receipt)).toString('base64')
  } });
  const response = await app.run(); const result = await response.json();
  assert.equal(response.status, 402);
  assert.equal(result.paymentStatus, 'REJECTED');
  assert.equal(result.settlementSuccess, false);
  assert.equal(result.paymentTxHash, null);
  assert.equal(app.calls.sign, 1); assert.equal(app.calls.fetch.length, 1); assert.equal(app.calls.jobs.length, 0);
});

test('malformed/conflicting receipt stays unknown and never invites repayment', async () => {
  for (const value of ['invalid receipt', ...[
    { success: false, transaction: '0x' + 'aa'.repeat(32), network: 'eip155:56' },
    { success: false, transaction: 'non-hash-settlement-reference', network: 'eip155:56' },
    { success: false, transaction: '', network: 'eip155:8453' }
  ].map(receipt => Buffer.from(JSON.stringify(receipt)).toString('base64'))]) {
    const app = fixture({ status: 402, body: { errorCode: 'payment_rejected' }, headers: { 'payment-response': value } });
    const result = await (await app.run()).json();
    assert.equal(result.paymentStatus, 'UNKNOWN'); assert.equal(result.requiresNewPreview, false);
    assert.equal(app.calls.fetch.length, 1);
  }
});

test('modified authorization or merchant requirement is rejected before replay', async () => {
  for (const mutate of [p => p.accepted.amount = '999', p => p.payload.permit2Authorization.permitted.amount = '999',
    p => p.payload.permit2Authorization.spender = payer, p => p.payload.permit2Authorization.witness.to = payer,
    p => p.payload.permit2Authorization.nonce = Number.MAX_SAFE_INTEGER + 1]) {
    const proof = payment(); mutate(proof);
    const app = fixture({ payment: proof });
    assert.equal((await app.run()).status, 502);
    assert.equal(app.calls.fetch.length, 0);
    assert.equal(app.calls.jobs.length, 0);
  }
});
test('wrong origin and merchant timeout never trigger retries or save a false job', async () => {
  const origin = fixture({ sameOrigin: false });
  assert.equal((await origin.run()).status, 403);
  assert.equal(origin.calls.sign, 0);
  const timeout = fixture({ timeout: true });
  assert.equal((await timeout.run()).status, 502);
  assert.equal(timeout.calls.sign, 1);
  assert.equal(timeout.calls.fetch.length, 1);
  assert.equal(timeout.calls.jobs.length, 0);
});

test('wire canonicalization preserves a real SDK typed-data signature offline', async () => {
  const { privateKeyToAccount } = require('viem/accounts');
  const { buildPermit2ExactPayment, recoverPermit2ExactPayer } = require('@bnb-chain/b402');
  // Public disposable test key only; no RPC, wallet, funds or merchant request.
  const account = privateKeyToAccount('0x' + '01'.repeat(32));
  const signed = await buildPermit2ExactPayment({ account, requirements: requirement,
    trustedSpenders: [requirement.extra.spenderAddress], resourceUrl: merchantUrl, nonce: '4660' });
  const wire = JSON.parse(JSON.stringify(signed));
  wire.accepted.asset = wire.accepted.asset.toLowerCase();
  wire.payload.permit2Authorization.nonce = '0x1234';
  wire.payload.permit2Authorization.witness.validAfter = Number(wire.payload.permit2Authorization.witness.validAfter);
  const canonical = x402.canonicalizeReviewedX402Payment(wire, requirement, merchantUrl);
  assert.equal(await recoverPermit2ExactPayer(canonical), account.address);
  assert.equal(canonical.payload.signature, signed.payload.signature);
  assert.deepEqual(JSON.parse(JSON.stringify(canonical.accepted)), requirement);
});
