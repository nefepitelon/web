const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");

function loader(options = {}) {
  const cache = new Map();
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText;
    vm.runInNewContext(source, { module, exports: module.exports, Buffer, Uint8Array, Error, Date,
      URL, URLSearchParams, Response, Request, AbortSignal, TextEncoder, TextDecoder,
      process: { env: { TRADING_CREDENTIALS_ENCRYPTION_KEY: "synthetic-master-for-test-purposes-only-0000", ...options.env } },
      fetch: options.fetch, console,
      require(name) {
        if (name === "server-only") return {};
        if (name === "@/lib/prisma") return { prisma: options.prisma || {} };
        if (name === "@/lib/membership") return {};
        if (name.startsWith("@/")) return load(name.slice(2) + ".ts");
        if (name.startsWith(".")) return load(path.relative(root, path.resolve(path.dirname(filename), name + ".ts")));
        return require(name);
      },
    }, { filename });
    return module.exports;
  }
  return load;
}

const secrets = loader()("lib/secret-redaction.ts");
const apiKey = "synthetic-test-key-0001";
const apiSecret = "synthetic-test-secret-0002";

test("diagnostics redact quoted JSON, auth headers, proxy credentials and private key encodings", () => {
  const privateKey = "ab".repeat(32);
  const inputs = [
    `upstream {"BINANCE_API_KEY":"${apiKey}","apiSecret":"${apiSecret}"}`,
    `Authorization: Bearer ${apiKey}`,
    `agentSessionId=${apiKey}; other=value`,
    `failed proxy https://user:${apiSecret}@proxy.example.com:8080/path`,
    `private_key="${privateKey}"`,
    `unlabelled 0x${privateKey}`,
    `-----BEGIN PRIVATE KEY-----\n${apiSecret}\n-----END PRIVATE KEY-----`,
    `echoed ${apiKey} and ${encodeURIComponent(apiSecret)}`,
  ];
  for (const input of inputs) {
    const result = secrets.redactSecretText(input, [apiKey, apiSecret]);
    for (const value of [apiKey, apiSecret, privateKey]) assert.ok(!result.includes(value), "sensitive diagnostic must be removed");
    assert.match(result, /\[redacted\]/);
  }
  assert.equal(secrets.redactSecretText("order rejected: insufficient balance"), "order rejected: insufficient balance");
  assert.ok(secrets.redactSecretText("x".repeat(10000)).length <= 2000);
});

test("recursive audit sanitization keeps public transaction identifiers and never mutates input", () => {
  const txHash = "0x" + "cd".repeat(32);
  const input = { privateKey: apiSecret, nested: [{ authorization: apiKey, message: `token=${apiKey}` }],
    txHash, apiKeyHint: "test••••hint", apiKeyConfigured: true, amount: 42 };
  const output = secrets.redactSecretData(input);
  assert.equal(output.privateKey, "[redacted]");
  assert.equal(output.nested[0].authorization, "[redacted]");
  assert.ok(!JSON.stringify(output).includes(apiKey));
  assert.equal(output.txHash, txHash);
  const mislabeledSecret = "ab".repeat(32);
  assert.ok(!secrets.redactSecretData({ txHash: "0x" + mislabeledSecret }, [mislabeledSecret]).txHash.includes(mislabeledSecret));
  assert.equal(output.apiKeyHint, input.apiKeyHint);
  assert.equal(output.amount, 42);
  assert.equal(input.privateKey, apiSecret);
  const cyclic = {}; cyclic.self = cyclic;
  assert.equal(secrets.redactSecretData(cyclic).self, "[circular]");
});

test("Alpha and TideSight preserve legacy v1 envelopes and reject malformed or tampered credentials", () => {
  const master = "synthetic-master-for-test-purposes-only-0000";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", crypto.createHash("sha256").update(master).digest(), iv);
  const ciphertext = Buffer.concat([cipher.update(apiSecret, "utf8"), cipher.final()]);
  const oldEnvelope = ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(":");
  for (const file of ["lib/alpha-execution/credentials.ts", "lib/tidesight/execution/credentials.ts"]) {
    const credentials = loader()(file);
    assert.equal(credentials.decryptTradingSecret(oldEnvelope), apiSecret);
    const first = credentials.encryptTradingSecret(apiSecret), second = credentials.encryptTradingSecret(apiSecret);
    assert.notEqual(first, second);
    assert.equal(credentials.decryptTradingSecret(first), apiSecret);
    const parts = first.split(":");
    const badTag = [...parts]; badTag[2] = Buffer.alloc(16).toString("base64url");
    for (const invalid of [first + ":extra", first + "=", badTag.join(":"), `v1:AA:${parts[2]}:${parts[3]}`]) {
      assert.throws(() => credentials.decryptTradingSecret(invalid), /payload is invalid/);
    }
    const wrongKey = loader({ env: { TRADING_CREDENTIALS_ENCRYPTION_KEY: "different-synthetic-master-for-tests-only" } })(file);
    assert.throws(() => wrongKey.decryptTradingSecret(first), /payload is invalid/);
    const masked = credentials.maskProxy(`https://user:${apiSecret}@8.8.8.8:8080/?token=${apiKey}#fragment`);
    assert.ok(!masked.includes(apiSecret) && !masked.includes(apiKey) && !masked.includes("user"));
  }
});

test("binary secret envelopes authenticate purpose and invoice owner, enforce size and reject tampering", () => {
  const binary = loader()("lib/secret-encryption.ts");
  const bytes = Buffer.alloc(5 * 1024 * 1024, 0x34);
  const context = "payment-proof:invoice-test:owner-test";
  const ciphertext = binary.encryptSecretBytes(bytes, context);
  assert.ok(ciphertext.startsWith("b1:"));
  assert.ok(binary.decryptSecretBytes(ciphertext, context, bytes.length).equals(bytes));
  assert.throws(() => binary.decryptSecretBytes(ciphertext, "payment-proof:invoice-test:other-owner"), /payload is invalid/);
  assert.throws(() => binary.decryptSecretBytes(ciphertext, context, bytes.length - 1), /payload is invalid/);
  assert.throws(() => binary.decryptSecretBytes(ciphertext + ":extra", context), /payload is invalid/);
  const parts = ciphertext.split(":"); parts[2] = Buffer.alloc(16).toString("base64url");
  assert.throws(() => binary.decryptSecretBytes(parts.join(":"), context), /payload is invalid/);
  assert.throws(() => binary.encryptSecretBytes(Buffer.alloc(8 * 1024 * 1024 + 1), context), /size is invalid/);
});

test("both Binance clients remove even unlabelled upstream echoes of their active credentials", async () => {
  for (const [file, name] of [["lib/alpha-execution/binance.ts", "AlphaBinanceClient"], ["lib/tidesight/execution/binance.ts", "TideSightBinanceClient"]]) {
    for (const networkError of [false, true]) {
      const load = loader({ fetch: async () => {
        if (networkError) throw new Error(`connection failed with ${apiKey} and ${apiSecret}`);
        return Response.json({ code: -1000, msg: `provider echoed ${apiKey} and ${apiSecret}` }, { status: 400 });
      } });
      const { [name]: Client } = load(file);
      const client = new Client({ environment: "testnet", market: "futures", apiKey, apiSecret });
      await assert.rejects(client.syncTime(), (error) => {
        assert.ok(!error.message.includes(apiKey) && !error.message.includes(apiSecret));
        assert.equal(error.status, networkError ? 503 : 400);
        return true;
      });
    }
  }
});

test("execution API errors and audit exports sanitize credentials without losing execution uncertainty", async () => {
  for (const [file, name] of [["lib/alpha-execution/access.ts", "alphaExecutionErrorResponse"], ["lib/tidesight/execution/access.ts", "tideSightExecutionErrorResponse"]]) {
    const access = loader()(file);
    const error = Object.assign(new Error(`rejected {"apiKey":"${apiKey}"}`), { code: -1007, statusUnknown: true });
    const payload = await access[name](error).json();
    assert.ok(!JSON.stringify(payload).includes(apiKey));
    assert.equal(payload.exchangeCode, -1007);
    assert.equal(payload.executionStatusUnknown, true);
    assert.equal(payload.retriable, false);
  }
  const audit = loader()("lib/alpha-execution/audit-export.ts");
  const result = audit.publicAuditRow({ id: "a", createdAt: new Date(), state: "FAILED", status: "ERROR",
    message: `apiKey=${apiKey}`, metadata: { agentSessionId: apiSecret }, intent: null, plan: null, order: null });
  assert.ok(!JSON.stringify(result).includes(apiKey) && !JSON.stringify(result).includes(apiSecret));
});
