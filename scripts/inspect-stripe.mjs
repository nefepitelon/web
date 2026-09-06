import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is missing");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-02-25.clover",
});

const [account, products, prices, endpoints, portalConfigurations] = await Promise.all([
  stripe.accounts.retrieve(),
  stripe.products.list({ active: true, limit: 100 }),
  stripe.prices.list({ active: true, type: "recurring", limit: 100 }),
  stripe.webhookEndpoints.list({ limit: 100 }),
  stripe.billingPortal.configurations.list({ limit: 100 }),
]);

console.log(
  JSON.stringify({
    account: {
      id: account.id,
      country: account.country,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
    },
    products: products.data.map((product) => ({
      id: product.id,
      name: product.name,
      active: product.active,
      managed: product.metadata.welinkbtcManaged === "true",
    })),
    prices: prices.data.map((price) => ({
      id: price.id,
      product: typeof price.product === "string" ? price.product : price.product.id,
      lookupKey: price.lookup_key,
      unitAmount: price.unit_amount,
      currency: price.currency,
      interval: price.recurring?.interval,
    })),
    webhooks: endpoints.data.map((endpoint) => ({
      id: endpoint.id,
      url: endpoint.url,
      status: endpoint.status,
      events: endpoint.enabled_events,
    })),
    portalConfigurations: portalConfigurations.data.map((configuration) => ({
      id: configuration.id,
      active: configuration.active,
      isDefault: configuration.is_default,
      paymentMethodUpdate: configuration.features.payment_method_update.enabled,
      invoiceHistory: configuration.features.invoice_history.enabled,
      subscriptionCancel: configuration.features.subscription_cancel.enabled,
      subscriptionUpdate: configuration.features.subscription_update.enabled,
    })),
  }),
);
