# Perpdex Box reference coverage, version 1.6.2

Verified on 2026-11-07 against [PerpDexList exchanges](https://perpdexlist.com/exchanges).

## Coverage

The catalog contains **53 rows**: **47 independent DEX / onchain venues**, **5 HIP-3 children**, and **1 CEX**. All **47** venue keys in the reference site's current live aggregate response are represented. The six existing entries absent from that reference response remain available: Backpack, Orderly, Jupiter Perps, Aevo, Ostium, and Velocity (originally Drift).

The 21 added entries are 01, Aftermath, Avantis, Boros, Bulk, Bullet, Meridian, Gains Network, Hello, Hibachi, Hotstuff, HYENA, Kalshi Perps, Katana Perps, Lighter RH, Papertrade, Perpl, Phoenix, Polymarket Perps, Popdex, and Rho.

Catalog `referenceId` values explicitly map display names and legacy IDs to provider keys. Existing API mappings remain intact. New DefiLlama mappings only use the corresponding perpetual / interest-rate / dedicated bridge records. Prediction-market TVL and OI, unrelated products sharing a name, and partial-chain gTrade CoinGecko records are not substituted for venue totals.

## Public API evidence

- [Live exchange aggregate JSON](https://perpdexlist.com/api/markets): HTTP 200 without authentication, discovered from the page's public JavaScript fetch call. Top-level fields include `venues`, `totals`, `venue_count`, `with_data`, `pending_count`, and `generated_at`.
- Each aggregate row has `exchange`, `name`, `open_interest`, `volume_24h`, `observed_at`, `age_seconds`, `pending`, and `error`. Optional `synthetic` / `wash_trading` flags describe provider classifications. Amounts are USD; null is unknown, not zero. Individual observation time must be checked separately from response generation time.
- [Source methodology](https://perpdexlist.com/about): venue aggregates originate in exchange-published public endpoints. Perpdex Box identifies this as an aggregator source and preserves its observation timestamp.
- [Public venue registry](https://perpdexlist.com/api/venues) has URLs, often affiliate links. Catalog trading URLs use direct official destinations and do not copy referral codes.
- The page also links a scoped market feed, e.g. `/api/dashboard/markets-v2?exchange=aftermath`. It returns an array of normalized markets. An unfiltered request returned about 8.9 MB, including CEX entries, so it is unsuitable as an extra full-feed request merely to fill a few missing market-count cells. Market counts are never hardcoded from a research snapshot.

## Classification and duplicate handling

- **Lighter RH** is an independent deployment. [Robinhood Chain documentation](https://docs.robinhood.com/chain/lighter-domains/) states that the deployment has separate contracts, sequencing and liquidity from Lighter Core. It therefore remains a separate DEX row and is not a Hyperliquid child.
- **HYENA** is an HIP-3 child of Hyperliquid. Its [official sunset guide](https://docs.hyena.trade/) gives the August / September 2026 market closure. A fresh public Hyperliquid `metaAndAssetCtxs` request with `dex: "hyna"` returned 25 delisted instruments and zero active instruments. It remains in the catalog for reference alignment, labeled closed, with a documentation link instead of an active trading destination. It is excluded from independent-venue totals as a child.
- **Papertrade** is a real onchain synthetic-perpetual product, not a simulated-money dashboard. Its [official docs](https://docs.papertrade.xyz/) describe LP-counterparty synthetic positions on HyperEVM, priced using Hyperliquid's oracle state without placing Hyperliquid perpetual trades. It is an independent DEX row labeled synthetic perpetuals, with `allowSynthetic: true`; it has no Hyperliquid `parentId`. Published 1000× leverage is documented; conventional maker/taker fees are left unknown because its PnL haircuts do not fit those fee columns.
- **Polymarket Perps** is specifically the perpetual product documented in [Polymarket's official perpetual overview](https://docs.polymarket.com/perps/overview). It is not the binary prediction-market product. Only CoinGecko `polymarket-perps` and DefiLlama `polymarket-perps` are mapped. Prediction-market records such as `polymarket-international` and `polymarket-us` are excluded.
- **Kalshi Perps** is a current perpetual product shown on [Kalshi's official perpetual page](https://kalshi.com/perps). It is labeled CEX and can be filtered separately. Page totals cover independent DEX and CEX venues, with HIP-3 children excluded to avoid counting their parent twice. The CoinGecko derivatives record explicitly describes perpetual futures and reports `number_of_perpetual_pairs` with zero expiry-futures pairs. DefiLlama's generic `kalshi` prediction-market record is deliberately not mapped.
- **Boros / Rho** are labeled for interest-rate / perpetual products. [Rho's official site](https://rho.trading/) separates rates, perpetuals, and RWA trading; the catalog does not treat generic Rho vaults as its venue liquidity.
- **Meridian** uses the provider's legacy `ethereal` key. Its current official [application](https://app.meridian.xyz) and [documentation](https://docs.meridian.xyz/) describe the venue on Robinhood Chain. The catalog uses the current application for trading and `meridian-perps` for the fresh public DefiLlama fallback; it does not send users to the old Ethereal application.
- **Aftermath TVL** maps to its afLP market-making vault. [Official perpetual docs](https://docs.aftermath.finance/perpetuals/aftermath-perpetuals) and [official perpetual vaults page](https://aftermath.finance/perpetuals/vaults) establish that this vault provides liquidity to the perpetual book. Spot AMM and liquid-staking values are not used.

## Fees, leverage and icons

New unverified fee and leverage values remain null. The catalog does not silently copy reference-site fee estimates as exchange-certified current rules. Existing dated metadata is retained. Live market statistics come from public APIs, never the static catalog.

All 53 catalog IDs have local brand icons; 21 new mappings include reuse of the existing Lighter icon. Public URLs, discovery sources and shipped-file hashes are recorded in [perpdex-box-icons.md](./perpdex-box-icons.md). Imported vector / raster assets are decoded into static raster output before shipping. No third-party logo request is needed in the user's browser.

Research evidence is stored under `artifacts/perpdex-reference-*-v162.*`, `artifacts/perpdex-hyna-v162.json`, and `artifacts/perpdex-v162-icons.json`. These snapshots are validation evidence only and are never imported into the product.
