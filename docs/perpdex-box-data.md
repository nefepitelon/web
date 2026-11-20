# Perpdex Box public-data contract

The service is a read-only market directory. It does not use the local engine, account environment files, exchange API keys, private wallets, task state, trading proxies, or order endpoints. The browser calls the site's public route; `lib/perpdex-box-data.ts` calls only the fixed public endpoints below. Selecting this page does not start, stop or reload a trading worker.

## Coverage and calculations

The directory aligns all 47 venues exposed by the user's [PerpDexList reference](https://perpdexlist.com/exchanges) on 2026-11-07 and preserves six additional existing venues: 53 rows in total (47 DEX, one CEX and five Hyperliquid HIP-3 children). Catalog entries contain names, links, source mappings and dated fee/leverage reference metadata, **never fixed OI, volume, TVL or market-count amounts**. See `docs/perpdex-box-reference-alignment.md` for identity and classification evidence.

| Metric | Public endpoint and calculation |
| --- | --- |
| Exchange OI and 24h volume | `https://api.coingecko.com/api/v3/derivatives/exchanges?per_page=100&page=1`; convert `open_interest_btc` and `trade_volume_24h_btc` to USD using the public Bitcoin USD quote. |
| BTC/USD conversion | `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_last_updated_at=true`; keep the provider's quote time when published. Reject a quote more than 30 minutes old or over five minutes in the future. |
| Perpetual market count | CoinGecko `number_of_perpetual_pairs`. GMX aggregates its three explicitly mapped Solana, Arbitrum and Avalanche V2 exchange records; all components must be present. |
| Additional OI coverage | `https://api.llama.fi/overview/open-interest?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`; `protocols[].total24h` for Jupiter, TxFlow, Ostium and Reya, following this endpoint's OI adapter meaning. This is the source's latest reported OI observation, not an extra OI daily sum. |
| Expanded directory and missing USD metrics | Public, unauthenticated `https://perpdexlist.com/api/markets`; exact `venues[].exchange` mappings, `open_interest` and `volume_24h` already in USD. Use venue aggregates, never sum unrelated market rows or copy the provider's total. Known current CoinGecko/Hyperliquid metrics take priority; healthy reference data can fill a missing value or replace a stale value. Exact DefiLlama OI aliases remain independent fallbacks. |
| TVL | `https://api.llama.fi/protocols`; only the catalog's exact protocol slugs. No 28-request per-protocol fan-out. Bridge collateral is explicitly mapped where applicable. GMX combines EVM and Solana pools; Drift uses `drift-trade` and deliberately excludes liquid-staking TVL. |
| HIP-3 OI | Public `POST https://api.hyperliquid.xyz/info`, body `{ "type": "metaAndAssetCtxs", "dex": "xyz" }`, with catalog-driven `xyz`, `io`, `para`, **`mkts`**, and `hyna`. Sum `openInterest * markPx` across non-delisted markets. `km` is a legacy empty market and must not be substituted for Markets by Kinetiq. HYENA has stopped trading; a valid universe with no active markets reports zero active OI/volume/count. |
| HIP-3 24h volume/count/leverage | Sum `dayNtlVlm`; count non-delisted universe entries; take the largest reported `maxLeverage` among those entries. Universe/context length must match. |

An unknown, absent, malformed, negative, non-finite or overflowed value remains `null` and is displayed as `—`. A real reported numeric zero remains zero. Missing any component of a grouped amount leaves the grouped amount unknown; partial sums are not represented as complete figures.

Hyperliquid's CoinGecko parent is marked as including HIP-3 markets. Child rows remain visible and sortable, but summary totals and market shares count only the parent. The five displayed child rows are a directory selection, not all HIP-3 deployers. Their values are never added again to parent totals or subtracted to fabricate a native-only parent. Different providers/observations can disagree; if the selected children exceed the parent, the response flags the discrepancy and preserves original values.

## Data provenance and freshness

Each source reports `status`, `fetchedAt` (our last successful retrieval), and `updatedAt` (the upstream measurement time, **only when published**). Each exchange's `updatedAt` is its primary source's last successful retrieval. It must not be described as an upstream measurement timestamp. `generatedAt` is the response assembly time, not proof that every metric was just measured. `fieldSources` and `fieldStatus` retain individual metric provenance, including independent TVL failures.

Ten independent sources are requested in parallel. Each read has a nine-second deadline covering connection, body decoding and validation. Each source has its own 60-second in-process cache and in-flight request deduplication. Failures also wait 60 seconds before retrying. A previous successful source response may be retained for at most one hour, marked `stale` with its original timestamps and the current read error; afterward values become unknown. Cold starts cannot invent retained data. No private storage is used.

PerpDexList's `generated_at` is retained as the source generation time and validated against the server clock (maximum 30 minutes old or five minutes ahead). Each venue's independent `observed_at` is checked separately: observations older than ten minutes are stale, older than one hour or over five minutes in the future are rejected. Error/pending rows never become valid numeric values. `observedAt` preserves an upstream venue observation; `updatedAt` remains retrieval time. The explicit Papertrade mapping allows genuine on-chain synthetic perps; an unexpected synthetic flag on another venue is rejected. The 9 MB all-market endpoint is deliberately not polled just to count markets.

The UI refreshes every 60 seconds without reinitializing the trading workspaces. This is a public API refresh cadence, not a claim that CoinGecko or DefiLlama measure every underlying market each second. Source failures do not suppress healthy independent sources.

The free DefiLlama `/overview/derivatives` endpoint returned a paid-plan requirement during verification, so it is **not queried** and no paid key is required. Reference coverage can fill some DefiLlama OI-only rows' volume, while unsupported metrics remain unknown. Velocity/Drift currently has TVL coverage but no supported directory OI/volume record. The page preserves these gaps.

## Fees, leverage and methodology

Existing non-HIP-3 maximum leverage and maker/taker fees are **dated public reference metadata**, sourced from the user-provided [PerpBox directory](https://zuoye.si/perpbox), which states its manual check date as **2026-10-19**. New unverified fee/leverage fields remain null; separately verified product rules, such as Papertrade's published leverage, retain their own catalog evidence. These fields are not represented as live API values or as a newly completed verification of every platform's fee schedule. Each row links to the platform's public website. Account tiers, promotions and instrument limits can differ. Ondo's published reference promotion retains its baseline fees and unspecified expiry in `feePromotion`; an unspecified expiry is not an assertion that the promotion is permanent. HIP-3 maximum leverage is replaced by current official public market metadata; HIP-3 fees remain dated reference values.

CoinGecko announced a [single-sided OI standardization effective 2026-11-10](https://status.coingecko.com/info_notices/409074). Formerly double-sided exchanges may show a methodology-driven drop of about half. This service preserves source values, never guesses a factor of two, and exposes the dated notice. Mixed providers before that transition are not assumed to use identical OI conventions.

Primary API documentation:

- [CoinGecko derivatives exchanges](https://docs.coingecko.com/reference/derivatives-exchanges)
- [CoinGecko simple price](https://docs.coingecko.com/reference/simple-price)
- [DefiLlama free and paid API documentation](https://api-docs.defillama.com/)
- [DefiLlama open-interest adapter implementations](https://github.com/DefiLlama/dimension-adapters/tree/master/open-interest)
- [Hyperliquid public perpetual info endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/perpetuals)

## Verification evidence, 2026-11-07

Version 1.6.2 evidence in `artifacts/perpdex-v162-live-report.json` and `artifacts/perpdex-v162-live-snapshot.json` records all ten public sources live, 53 directory rows, 50 OI amounts, 47 24h volume amounts, 34 TVL amounts and 34 market counts. The measured read completed in about 3.2 seconds. All 47 reference venue keys are represented; unknown fields remain null. These observations describe the verification time, not fixed future coverage guarantees.

The initial 1.6.0 verification is retained below for history:

`artifacts/perpdex-public-live-report.json` and `artifacts/perpdex-public-live-snapshot.json` record a successful real public-data smoke test: eight sources live, 32 directory rows, 31 OI amounts, 27 24h volume amounts, 22 TVL amounts and 27 market counts. The measured request completed in about 1.7 seconds. The four HIP-3 records came from current official endpoint responses, including `mkts` with one active market.

The Windows workstation's native DNS resolved the CoinGecko hostname incorrectly while its configured system HTTP proxy fetched the public endpoint successfully. The evidence smoke test injects that public transport **only in the test process**. Production service code does not embed a localhost proxy or alter global DNS/proxy settings; production endpoint reachability is verified separately during deployment. No task configuration or order was changed by these checks.
