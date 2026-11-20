# RPLR-M public reconstruction

The 35th dashboard indicator uses public BGeometrics daily realized profit/loss ratios and BTC prices, with an independently hosted public mirror and a dated, compressed local archive. Binance spot quotes are separate from the daily observation date. The primary history begins on 2012-01-01; plotted momentum begins after the annual warm-up, on 2012-12-30. Sources and hashes are recorded in `data/rplrm-provenance.json`.

## Reproducible definition

- `RPLR = realized profit / abs(realized loss)` across all UTXO ages.
- `M = mean(RPLR, trailing 7 calendar days) / mean(RPLR, trailing 365 calendar days)`.
- Green view: `max(M - 1, 0)`.
- Red view: `min(1 - 1/M, 0)`. At zero M the reciprocal is undefined and is omitted, while the dated state remains -1.
- Composite state: `S = (M - 1) / (M + 1)`.

The two colored curves are asymmetric transformations of the same relative ratio, displayed on independent axes. They are not separate dollar-denominated profit and loss measurements. Price uses a logarithmic axis. The supplied reference image does not publish its complete calculation. This implementation does not claim to reproduce that formula or Glassnode's proprietary entity clustering.

Calendar windows use actual observations only: at least 5/7 and 330/365 observations, following a full annual warm-up. Missing dates are not interpolated. Older archived cycles are merged by date with incoming data, so a short upstream refresh cannot replace full history. More than three days of observation age is marked stale. A live quote never changes the chain observation date.

## Phase and scenario rules

A/B classification uses the sign of the trailing 90-calendar-day mean of log M, with 30 observations of confirmation. Confirmation dates are not backdated. Missing days reset pending confirmation; a gap over seven days interrupts phase tracking. An A interval is not synonymous with a price-defined bear market.

The supplied 2017–2019 / 2021–2023 / 2025–2026 spans of 14/13/11 months appear separately as illustration labels. Computed phase durations and the live phase can disagree with those labels. Closed A phases of at least 90 days form the displayed duration sample; no near-certain bottom probability is inferred.

The 365-day conditional extension blends damped recent log-momentum with observations from already-completed historical phases of the same type. The last observed value is the projection origin. All historical analogues predate the current phase. Shading represents illustrative sensitivity, not a calibrated confidence interval. The extension does not produce future BTC prices and never enters observed-history exports.

## Integration and verification

- GET `/api/rplr-m`: public daily history, freshness, phase samples, reference labels, scenarios and live spot.
- Dashboard: all five ranges, independent axes, keyboard/pointer inspection, full-history CSV, PNG snapshot, fullscreen, refresh, Chinese/English and dark/light themes.
- Small ⇄ button uses the existing `/api/surf-research` contract with the verified snapshot, formula and explicit source limitations. Surf is requested on user action; routine data refreshes do not call it.
- Homepage and the dashboard's shared 2D/3D loop both include model 35. The compact shared view plots M and BTC price; the full dashboard panel supplies the independent red/green axes and composite strip.
- `tests/rplrm.test.js` covers numeric transforms, zero/null input, gaps, annual coverage, causal phase labeling, historical retention, forecast continuity, lack of future price values and history-cache expiry.

Reference context: [Glassnode's description of realized profit/loss ratios](https://research.glassnode.com/assessing-risk-in-a-bitcoin-bull/). The article does not define this reconstruction's momentum formula.
