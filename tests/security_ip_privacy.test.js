const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function load(relative, mocks) {
  const filename = path.resolve(__dirname, "..", relative);
  const loaded = new Module(filename, module);
  loaded.filename = filename; loaded.paths = module.paths;
  loaded.require = name => Object.hasOwn(mocks, name) ? mocks[name] : module.require(name);
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, filename);
  return loaded.exports;
}

test("forwarding headers cannot rotate identities without an explicitly trusted edge", async () => {
  const previous = { VERCEL: process.env.VERCEL, TRUST_PROXY_HEADERS: process.env.TRUST_PROXY_HEADERS };
  const security = load("lib/request-security.ts", { "next/headers": {} });
  const keys = [];
  const route = load("app/api/research/[id]/view/route.ts", {
    "@/lib/request-security": security,
    "@/lib/rate-limit": { checkRateLimit: async key => { keys.push(key); return { allowed: true }; } },
    "@/lib/prisma": { prisma: { researchArticle: { updateMany: async () => ({ count: 1 }) } } }
  });
  try {
    delete process.env.VERCEL; delete process.env.TRUST_PROXY_HEADERS;
    for (const ip of ["192.0.2.1", "198.51.100.22"]) {
      const req = new Request("https://example.test/api/research/article/view", {
        method: "POST", headers: { "x-forwarded-for": ip, "x-real-ip": ip }
      });
      assert.equal(security.trustedRequestIp(req.headers), null);
      assert.equal((await route.POST(req, { params: Promise.resolve({ id: "article" }) })).status, 200);
    }
    assert.equal(keys[0], keys[1]);
    process.env.VERCEL = "1";
    const trusted = new Request("https://example.test/api/research/article/view", {
      method: "POST", headers: { "x-vercel-forwarded-for": "203.0.113.55", "x-forwarded-for": "198.51.100.33" }
    });
    assert.equal(security.trustedRequestIp(trusted.headers), "203.0.113.55");
    await route.POST(trusted, { params: Promise.resolve({ id: "article" }) });
    assert.notEqual(keys[0], keys[2]);
    assert.match(keys[2], /^research:view:article:[a-f0-9]{32}$/);
    assert.doesNotMatch(JSON.stringify(keys), /192\.0\.2|198\.51\.100|203\.0\.113/);
    assert.equal(security.trustedRequestIp(new Headers({ "x-vercel-forwarded-for": "garbage" })), null);
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});
