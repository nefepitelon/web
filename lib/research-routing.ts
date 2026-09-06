const FALLBACK_PREFIX = "research";

export function normalizeResearchSlug(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function fallbackResearchSlug() {
  return `${FALLBACK_PREFIX}-${Date.now().toString(36)}`;
}

export function researchArticlePath(slug: string) {
  return `/research/${encodeURIComponent(slug)}`;
}

export function researchSharePath(slug: string) {
  return `${researchArticlePath(slug)}/share`;
}

export function absoluteResearchShareUrl(slug: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.welinkbtc-onchainmain.xyz";
  return new URL(researchSharePath(slug), baseUrl).toString();
}

export function researchSlugCandidates(value: string) {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // A malformed legacy slug should still be queried verbatim.
  }

  return Array.from(new Set([
    value,
    decoded,
    decoded.normalize("NFC"),
    decoded.normalize("NFKC")
  ])).filter(Boolean);
}
