# Market heatmap asset daily report

Opening a heatmap tile retains its compact quote popover. “完整日报” opens an on-demand report; hovering never starts research. The report and exported PNG carry the welinkBTC brand and a compact market, evidence, trend and event overview.

## Public observations

- `GET /api/asset-daily-report?asset=SOL` accepts the heatmap's known asset IDs, including `xyz:NVDA`. The server resolves an allowlisted asset and uses fixed upstream endpoints. Clients cannot submit upstream URLs or report evidence.
- [Hyperliquid Info API](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint) supplies public perpetual mark price, 24-hour change, volume, current OI and hourly funding. Quotes are checked on demand with a 60-second cache. These are perpetual quotes, including HIP-3 markets, rather than exchange-listed stock spot quotes.
- Public daily trade candles supply actual price history. Their base volume is not mislabeled as USD volume. Open daily candles are provisional, with observation times capped at collection time.
- [DefiLlama public API](https://api-docs.defillama.com/) supplies supported chain/protocol TVL and fee/revenue series. BTC can additionally use [mempool.space](https://mempool.space/docs/api/rest) network observations. Sources without an asset-specific mapping are unavailable or not applicable; missing values and history are never reconstructed from unrelated series.
- Chinese news and X posts retain publication timestamps and links. When the site's existing X bearer configuration is available, the server queries official recent search for up to ten Chinese originals from the last 72 hours, retaining original authors. Reads coalesce and cache for ten minutes, with a per-instance twelve-query budget per five minutes. Public feeds supplement this with explicitly labeled secondary X references; those do not independently verify original full text. General news is not counted as an X post. The Chinese X section is displayed only when records exist; no firehose or complete-network coverage is claimed.
- Report components use a five-minute on-demand cache with bounded, dated fallback. Each source retains its own observation time; report generation time does not overwrite it. The four-hour heatmap cache remains independent.

## Evidence interpretation

The initial report contains a labeled rules-based summary. The report then requests `POST /api/asset-daily-report` with only `{ "asset": "SOL" }`. The server retrieves its own validated observations and asks the existing configured Surf service for a constrained Chinese interpretation. If Surf fails, the site's existing OpenAI configuration can interpret the same evidence through the [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create), without search or other tools. No new provider subscription, paid data API, trading call, or social publication is introduced.

Model input consists of bounded observations and news snippets treated as untrusted data. Returned evidence IDs must exist in the supplied input. AI output is distinguished from source facts. If configuration, validation or the request fails, the report retains the rules summary with a clear status. AI work has a 45-second deadline, three concurrent calls, a per-instance budget of 48 new generations per rolling fifteen minutes, and a fifteen-minute per-asset cache; cached interpretation retains its original evidence and generation times.

## Sharing and checks

The desktop report groups market, evidence and trend cards in the main column, with a separate right-hand event timeline. The timeline can scroll independently and expand original event details; narrower screens stack the sections for normal reading. Subtle compositor-friendly highlights run only while the report is visible and respect reduced-motion preferences. Per-signal reference footers, interpretation-method prose, per-metric source/explanation footers and the source-coverage section are omitted from the presentation; the underlying observations and provenance remain in the API response. A short status still distinguishes AI interpretation from rules-based fallback.

The browser renders a compact variable-height 1080-pixel PNG directly from the same report data, using the local brand asset and system CJK fonts. It follows the same content omissions and uses event headlines with publication times. Export has no third-party screenshot service or cross-origin image requirement. Saving downloads the file; native sharing, where available, opens the browser/OS share UI.

Focused tests cover source parsing, stale fallback, strict asset matching, evidence validation and cache isolation. Browser acceptance should check compact popover → report, keyboard close/focus restoration, mobile overflow, async asset switching, real report fields, conditional X visibility, expandable events, requested content omissions, and the saved PNG's compact text and brand rendering.
