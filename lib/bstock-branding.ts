import { BSTOCK_REGISTRY_BASELINE_ASSETS } from "@/lib/bstock-eligible-snapshot";
import localization from "@/data/bstock-localization.json";

const FMP_LOGO_BASE_URL = "https://financialmodelingprep.com/image-stock";
const GOOGLE_FAVICON_BASE_URL = "https://www.google.com/s2/favicons";

/**
 * Symbols whose market ticker either has no FMP logo or can resolve to the
 * wrong public instrument. These domains are the corresponding issuer or
 * company sites, and are deliberately keyed by the Binance bStock symbol.
 */
export const BSTOCK_OFFICIAL_BRAND_DOMAINS: Readonly<Record<string, string>> = Object.freeze({
  AAOIB: "ao-inc.com",
  AAPLB: "apple.com",
  ALABB: "asteralabs.com",
  AMATB: "appliedmaterials.com",
  AMDB: "amd.com",
  AMZNB: "amazon.com",
  ARMB: "arm.com",
  ASMLB: "asml.com",
  ASTSB: "ast-science.com",
  AVGOB: "broadcom.com",
  AXTIB: "axt.com",
  BABAB: "alibabagroup.com",
  BEB: "bloomenergy.com",
  BMNRB: "bitminetech.io",
  CBRSB: "cerebras.ai",
  COHRB: "coherent.com",
  COINB: "coinbase.com",
  CRCLB: "circle.com",
  CRDOB: "credosemi.com",
  CRWVB: "coreweave.com",
  DELLB: "dell.com",
  DRAMB: "roundhillinvestments.com",
  EWYB: "ishares.com",
  FLNCB: "fluenceenergy.com",
  GLWB: "corning.com",
  GMEB: "gamestop.com",
  GOOGLB: "abc.xyz",
  GSB: "goldmansachs.com",
  HOODB: "robinhood.com",
  IBMB: "ibm.com",
  INTCB: "intel.com",
  INTWB: "graniteshares.com",
  IRENB: "iren.com",
  KORUB: "direxion.com",
  LITEB: "lumentum.com",
  METAB: "meta.com",
  MRVLB: "marvell.com",
  MSFTB: "microsoft.com",
  MSTRB: "strategy.com",
  MUB: "micron.com",
  MUUB: "direxion.com",
  MVLLB: "graniteshares.com",
  NBISB: "nebius.com",
  NFLXB: "netflix.com",
  NOKB: "nokia.com",
  NVDAB: "nvidia.com",
  ORCLB: "oracle.com",
  PLTRB: "palantir.com",
  PYPLB: "paypal.com",
  QCOMB: "qualcomm.com",
  QNTB: "quantinuum.com",
  QQQB: "invesco.com",
  RKLBB: "rocketlabusa.com",
  SKHYB: "skhynix.com",
  SMCIB: "supermicro.com",
  SMHB: "vaneck.com",
  SNDKB: "sandisk.com",
  SNXXB: "tradretfs.com",
  SOXLB: "direxion.com",
  SOXSB: "direxion.com",
  SPCXB: "spacex.com",
  SPYB: "ssga.com",
  TQQQB: "proshares.com",
  TSLAB: "tesla.com",
  TSMB: "tsmc.com",
  USARB: "usarareearth.com",
  WDCB: "westerndigital.com",
  ADBEB: "adobe.com",
  AGPUB: "axecompute.com",
  AMCB: "amctheatres.com",
  BBB: "blackberry.com",
  BNCB: "bnbstandard.com",
  BOTB: "robostrategy.co",
  BRKBB: "berkshirehathaway.com",
  CRMB: "salesforce.com",
  CRWDB: "crowdstrike.com",
  CYPHB: "cypherpunk.com",
  DJTB: "tmtgcorp.com",
  FWDIB: "forwardindustries.com",
  GPROB: "gopro.com",
  HIMSB: "hims.com",
  HPEB: "hpe.com",
  JPMB: "jpmorganchase.com",
  KSTRB: "kraneshares.com",
  LLYB: "lilly.com",
  MDBB: "mongodb.com",
  MRNAB: "modernatx.com",
  PDDB: "pddholdings.com",
  PENGB: "penguinsolutions.com",
  RDDTB: "redditinc.com",
  SECZB: "securitize.io",
  SHAZB: "sharonai.com",
  SQQQB: "proshares.com",
  STXB: "seagate.com",
  TMFB: "direxion.com",
  USDEB: "stablecoinx.com",
  UVXYB: "proshares.com",
  VSTB: "vistracorp.com",
  WENB: "wendys.com",
  ZMB: "zoom.com",
  BSPB: "bendingspoons.com",
  SKDDB: "graniteshares.com",
  SKUUB: "graniteshares.com",
  GEVB: "gevernova.com",
  APPB: "applovin.com",
  EWZSB: "ishares.com",
  NUB: "nubank.com.br",
  MELIB: "mercadolibre.com",
  EWTB: "ishares.com",
  EWJB: "ishares.com",
  IWMB: "ishares.com",
  EWZB: "ishares.com",
  ANTB: "anthropic.com"
});

const OFFICIAL_DOMAIN_FIRST = new Set([
  "AAOIB", "ARMB", "BABAB", "BEB", "CBRSB", "COINB", "PLTRB", "QNTB", "SKHYB", "SPCXB",
  "AGPUB", "BNCB", "BOTB", "CYPHB", "FWDIB", "SECZB", "SHAZB", "USDEB", "BRKBB"
]);
// Private-company tickers can collide with unrelated public-market symbols.
const OFFICIAL_DOMAIN_ONLY = new Set(["BSPB", "ANTB"]);

const tickerByBstock: ReadonlyMap<string, string> = new Map<string, string>(
  [...BSTOCK_REGISTRY_BASELINE_ASSETS.map(([ticker, symbol]) => [symbol, ticker] as const),
    ...Object.entries(localization.instruments).map(([symbol, instrument]) => [symbol, instrument.ticker] as const)]
);

export function bstockBrandIconPath(symbol: string) {
  return `/api/bstock-alpha/brand-icon?symbol=${encodeURIComponent(symbol.toUpperCase())}&v=20261124`;
}

export function bstockBrandIconSources(symbol: string) {
  const normalized = symbol.toUpperCase();
  const ticker = tickerByBstock.get(normalized);
  if (!ticker) return [];
  const fmpLogo = `${FMP_LOGO_BASE_URL}/${encodeURIComponent(ticker)}.png`;
  const domain = BSTOCK_OFFICIAL_BRAND_DOMAINS[normalized];
  const officialIcon = (localization.officialIcons as Record<string, string>)[normalized];
  // Only audited Binance image paths are accepted; never turn catalog metadata
  // into an arbitrary URL-fetching proxy.
  const officialSources = officialIcon && /^\/images\/web3-data\/public\/token\/logos\/[a-f0-9]{32}\.png$/.test(officialIcon)
    ? [`https://bin.bnbstatic.com${officialIcon}`]
    : [];
  if (!domain) return [...officialSources, fmpLogo];
  const officialDomainFavicon = `${GOOGLE_FAVICON_BASE_URL}?domain=${encodeURIComponent(domain)}&sz=128`;
  if (OFFICIAL_DOMAIN_ONLY.has(normalized)) return [...officialSources, officialDomainFavicon];
  return OFFICIAL_DOMAIN_FIRST.has(normalized)
    ? [...officialSources, officialDomainFavicon, fmpLogo]
    : [...officialSources, fmpLogo, officialDomainFavicon];
}

export function bstockBrandFallbackSvg(symbol: string) {
  const normalized = symbol.toUpperCase();
  const ticker = tickerByBstock.get(normalized) || normalized.replace(/B$/, "").slice(0, 4);
  const initials = ticker.slice(0, 2);
  const safeInitials = initials.replace(/[^A-Z0-9]/g, "");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" role="img" aria-label="${safeInitials}">
  <rect width="96" height="96" rx="20" fill="#263140"/>
  <text x="48" y="57" text-anchor="middle" fill="#f4f7fb" font-family="Arial, sans-serif" font-size="30" font-weight="700">${safeInitials}</text>
</svg>`;
}

export const BSTOCK_BRAND_ICON_SYMBOLS = Object.freeze([...tickerByBstock.keys()].sort());
