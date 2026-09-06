import { spawnSync } from "node:child_process";
import { join } from "node:path";
import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is missing");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-02-25.clover",
});

const products = await stripe.products.list({ active: true, limit: 100 });
const legacyMembershipProduct = products.data.find(
  (product) =>
    product.metadata.welinkbtcManaged === "true" && !product.metadata.planKey,
);

async function ensureProduct({ planKey, name, description }) {
  const existing = products.data.find(
    (product) =>
      product.metadata.welinkbtcManaged === "true" &&
      product.metadata.planKey === planKey,
  );
  if (existing) return existing;
  return stripe.products.create({
    name,
    description,
    metadata: { welinkbtcManaged: "true", planKey },
  });
}

async function ensurePrice({ product, lookupKey, nickname, unitAmount, planKey }) {
  const matches = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 10 });
  const existing = matches.data.find(
    (price) =>
      price.active &&
      (typeof price.product === "string" ? price.product : price.product.id) === product.id &&
      price.currency === "usd" &&
      price.unit_amount === unitAmount &&
      price.recurring?.interval === "month",
  );
  if (existing) return existing;

  return stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: unitAmount,
    recurring: { interval: "month" },
    lookup_key: lookupKey,
    nickname,
    metadata: { welinkbtcManaged: "true", planKey },
  });
}

const [proProduct, maxProduct] = await Promise.all([
  ensureProduct({
    planKey: "pro",
    name: "welinkBTC Pro",
    description: "Advanced dashboard, Alpha Radar, research and export access",
  }),
  ensureProduct({
    planKey: "max",
    name: "welinkBTC Max",
    description: "Full research, API access, premium Alpha signals and priority quotas",
  }),
]);

const [proPrice, maxPrice] = await Promise.all([
  ensurePrice({
    product: proProduct,
    lookupKey: "welinkbtc_pro_monthly_2026",
    nickname: "Pro",
    unitAmount: 2900,
    planKey: "pro",
  }),
  ensurePrice({
    product: maxProduct,
    lookupKey: "welinkbtc_max_monthly_2026",
    nickname: "Max",
    unitAmount: 9900,
    planKey: "max",
  }),
]);

if (legacyMembershipProduct) {
  const legacyPrices = await stripe.prices.list({
    product: legacyMembershipProduct.id,
    active: true,
    limit: 100,
  });
  await Promise.all(
    legacyPrices.data.map((price) => stripe.prices.update(price.id, { active: false })),
  );
  await stripe.products.update(legacyMembershipProduct.id, { active: false });
}

const portalFeatures = {
  invoice_history: { enabled: true },
  payment_method_update: { enabled: true },
  subscription_cancel: {
    enabled: true,
    mode: "at_period_end",
    cancellation_reason: {
      enabled: true,
      options: ["too_expensive", "missing_features", "switched_service", "unused", "other"],
    },
  },
  subscription_update: {
    enabled: true,
    default_allowed_updates: ["price"],
    proration_behavior: "create_prorations",
    products: [
      {
        product: proProduct.id,
        prices: [proPrice.id],
      },
      {
        product: maxProduct.id,
        prices: [maxPrice.id],
      },
    ],
  },
};

const portalConfigurations = await stripe.billingPortal.configurations.list({ limit: 100 });
const portalConfiguration = portalConfigurations.data.find((configuration) => configuration.is_default)
  ?? portalConfigurations.data.find((configuration) => configuration.active);

if (portalConfiguration) {
  await stripe.billingPortal.configurations.update(portalConfiguration.id, {
    active: true,
    features: portalFeatures,
  });
} else {
  await stripe.billingPortal.configurations.create({
    business_profile: { headline: "Manage your welinkBTC membership" },
    features: portalFeatures,
  });
}

const vercelCli = join(
  process.env.APPDATA,
  "npm",
  "node_modules",
  "vercel",
  "dist",
  "vc.js",
);

function runVercel(args) {
  return spawnSync(process.execPath, [vercelCli, ...args], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    windowsHide: true,
  });
}

function configureEnvironmentVariable(name, value, target, isSensitive) {
  const updateArgs = ["env", "update", name, target, "--yes", "--value", value];
  if (isSensitive) updateArgs.push("--sensitive");
  let result = runVercel(updateArgs);

  if (result.status !== 0) {
    const addArgs = [
      "env",
      "add",
      name,
      target,
      "--yes",
      "--value",
      value,
      isSensitive ? "--sensitive" : "--no-sensitive",
    ];
    result = runVercel(addArgs);
  }

  if (result.status !== 0) {
    throw new Error(
      `Failed to configure ${name} for ${target}: ${result.error?.message || result.stderr || result.stdout || `exit ${result.status}`}`,
    );
  }
}

for (const target of ["production", "preview", "development"]) {
  configureEnvironmentVariable("STRIPE_PRO_PRICE_ID", proPrice.id, target, false);
  configureEnvironmentVariable("STRIPE_MAX_PRICE_ID", maxPrice.id, target, false);
}

const webhookUrl = "https://www.welinkbtc-onchainmain.xyz/api/billing/webhook";
const enabledEvents = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
];

const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
let webhookEndpoint = endpoints.data.find((endpoint) => endpoint.url === webhookUrl)
  ?? endpoints.data.find(
    (endpoint) => endpoint.description === "welinkBTC production membership synchronization",
  );
let webhookConfigured = Boolean(webhookEndpoint);

if (!webhookEndpoint) {
  webhookEndpoint = await stripe.webhookEndpoints.create({
    url: webhookUrl,
    description: "welinkBTC production membership synchronization",
    enabled_events: enabledEvents,
    api_version: "2026-02-25.clover",
  });

  try {
    configureEnvironmentVariable(
      "STRIPE_WEBHOOK_SECRET",
      webhookEndpoint.secret,
      "production",
      true,
    );
    webhookConfigured = true;
  } catch (error) {
    await stripe.webhookEndpoints.del(webhookEndpoint.id);
    throw error;
  }
} else {
  await stripe.webhookEndpoints.update(webhookEndpoint.id, {
    url: webhookUrl,
    enabled_events: enabledEvents,
    description: "welinkBTC production membership synchronization",
  });
}

console.log(
  JSON.stringify({
    mode: process.env.STRIPE_SECRET_KEY.startsWith("sk_live_") ? "live" : "test",
    productIds: { pro: proProduct.id, max: maxProduct.id },
    proPriceId: proPrice.id,
    maxPriceId: maxPrice.id,
    webhookId: webhookEndpoint.id,
    webhookConfigured,
  }),
);
