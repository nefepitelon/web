const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

test("Agent x402 separates nullable approval-chain metadata from reviewed payment requirements", () => {
  const source = `
    import assert from 'node:assert/strict';
    import { encodePaymentSignatureHeader } from '@x402/core/http';
    import { validateAgentX402Signature, reviewedAgentX402OptionSchema } from './lib/bstock-agentic-wallet-x402.ts';
    const now = 1700000000000;
    const url = 'https://mcp.coinmarketcap.com/x402/mcp';
    const requirement = {
      scheme: 'exact', network: 'eip155:56', amount: '10000000000000000',
      asset: '0x55d398326f99059fF775485246999027B3197955',
      payTo: '0x1111111111111111111111111111111111111111',
      maxTimeoutSeconds: 60, extra: { name: 'Tether USD', version: '1', assetTransferMethod: 'eip3009' }
    };
    const reviewed = { index: 1, binanceChainId: '56', requirement };
    const payment = { x402Version: 2, resource: { url }, accepted: requirement, payload: { signature: '0x' + '11'.repeat(65), authorization: {} } };
    const signature = { paymentHeaderName: 'PAYMENT-SIGNATURE', paymentHeaderValue: encodePaymentSignatureHeader(payment), approveTxHash: null, binanceChainId: null, signatureExpiresAt: now / 1000 + 60 };
    const run = (s = signature, r = reviewed) => validateAgentX402Signature(s, r, url, now);
    assert.equal(run().network, 'eip155:56'); // Official sign response with no approval.
    const cmcResource = 'X402_get_global_metrics_latest';
    assert.equal(validateAgentX402Signature({ ...signature, paymentHeaderValue: encodePaymentSignatureHeader({ ...payment, resource: { url: cmcResource } }) }, reviewed, cmcResource, now).network, 'eip155:56');
    assert.equal(run({ ...signature, binanceChainId: undefined }).network, 'eip155:56');
    const permit2 = { ...requirement, extra: { assetTransferMethod: 'permit2' } };
    assert.equal(run({ ...signature, paymentHeaderValue: encodePaymentSignatureHeader({ ...payment, accepted: permit2 }) }, { ...reviewed, requirement: permit2 }).network, 'eip155:56');
    const base = { ...requirement, network: 'eip155:8453' };
    assert.equal(run({ ...signature, paymentHeaderValue: encodePaymentSignatureHeader({ ...payment, accepted: base }) }, { ...reviewed, binanceChainId: '8453', requirement: base }).network, 'eip155:8453');
    const approval = { ...signature, approveTxHash: '0x' + 'ab'.repeat(32), binanceChainId: '56' };
    assert.equal(run(approval).network, 'eip155:56');
    for (const chain of [null, undefined, '8453']) {
      assert.throws(() => run({ ...approval, binanceChainId: chain }), { code: 'X402_APPROVAL_NETWORK_MISMATCH' });
    }
    assert.throws(() => run({ ...signature, binanceChainId: '8453' }), { code: 'X402_APPROVAL_METADATA_MISMATCH' });
    for (const changed of [
      { network: 'eip155:8453' }, { asset: requirement.payTo }, { payTo: requirement.asset },
      { amount: '999999999999999999' }, { scheme: 'upto' }, { maxTimeoutSeconds: 600 },
      { extra: { ...requirement.extra, assetTransferMethod: 'permit2' } }
    ]) {
      assert.throws(() => run({ ...signature, paymentHeaderValue: encodePaymentSignatureHeader({ ...payment, accepted: { ...requirement, ...changed } }) }), { code: 'X402_REVIEW_MISMATCH' });
    }
    assert.throws(() => run({ ...signature, paymentHeaderValue: 'not-json' }), { code: 'X402_PAYLOAD_INVALID' });
    assert.throws(() => run({ ...signature, paymentHeaderValue: Buffer.from('null').toString('base64') }), { code: 'X402_REVIEW_MISMATCH' });
    assert.throws(() => run({ ...signature, paymentHeaderName: 'X-PAYMENT' }), { code: 'X402_HEADER_INVALID' });
    assert.throws(() => run({ ...signature, paymentHeaderValue: encodePaymentSignatureHeader({ ...payment, resource: { url: 'https://other.example' } }) }), { code: 'X402_RESOURCE_MISMATCH' });
    for (const expires of [NaN, 0, now / 1000 + 1]) assert.throws(() => run({ ...signature, signatureExpiresAt: expires }), { code: 'X402_SIGNATURE_EXPIRED' });
    assert.equal(reviewedAgentX402OptionSchema.safeParse(reviewed).success, true);
    assert.equal(reviewedAgentX402OptionSchema.safeParse({ ...reviewed, requirement: undefined }).success, false);
    assert.equal(reviewedAgentX402OptionSchema.safeParse({ ...reviewed, binanceChainId: '8453' }).success, false);
  `;
  const root = path.resolve(__dirname, "..");
  const result = spawnSync(process.execPath, [path.join(root, "node_modules/tsx/dist/cli.mjs"), "--eval", source], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});
