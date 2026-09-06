import { BSTOCK_REGISTRY_BASELINE_ASSETS } from "@/lib/bstock-eligible-snapshot";

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
  WDCB: "westerndigital.com"
});

const OFFICIAL_DOMAIN_FIRST = new Set([
  "AAOIB", "ARMB", "BABAB", "BEB", "CBRSB", "COINB", "PLTRB", "QNTB", "SKHYB", "SPCXB"
]);

const tickerByBstock: ReadonlyMap<string, string> = new Map<string, string>(
  BSTOCK_REGISTRY_BASELINE_ASSETS.map(([ticker, symbol]) => [symbol, ticker] as const)
);

export function bstockBrandIconPath(symbol: string) {
  return `/api/bstock-alpha/brand-icon?symbol=${encodeURIComponent(symbol.toUpperCase())}`;
}

export function bstockBrandIconSources(symbol: string) {
  const normalized = symbol.toUpperCase();
  const ticker = tickerByBstock.get(normalized);
  if (!ticker) return [];
  const fmpLogo = `${FMP_LOGO_BASE_URL}/${encodeURIComponent(ticker)}.png`;
  const domain = BSTOCK_OFFICIAL_BRAND_DOMAINS[normalized];
  if (!domain) return [fmpLogo];
  const officialDomainFavicon = `${GOOGLE_FAVICON_BASE_URL}?domain=${encodeURIComponent(domain)}&sz=128`;
  return OFFICIAL_DOMAIN_FIRST.has(normalized)
    ? [officialDomainFavicon, fmpLogo]
    : [fmpLogo, officialDomainFavicon];
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
