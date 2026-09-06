import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const source = JSON.parse(await fs.readFile(path.join(root, "data", "toolbox-sheet-data.json"), "utf8"));
const outputPath = path.join(root, "data", "toolbox-web-research.json");
const excludedHandles = new Set([
  "home", "intent", "share", "search", "explore", "hashtag", "i", "login", "signup", "compose",
  "settings", "notifications", "messages", "tos", "privacy", "welinkbtc", "welinkbnb"
]);

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function metaContent(html, names) {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']*)["']`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${escaped}["']`, "i")
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return decodeHtml(match[1]);
    }
  }
  return "";
}

function pageTitle(html) {
  return decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
}

function extractHandles(html) {
  const normalized = html
    .replaceAll("\\u002F", "/")
    .replaceAll("\\/", "/")
    .replaceAll("&amp;", "&");
  const handles = new Set();
  for (const match of normalized.matchAll(/(?:https?:)?\/\/(?:www\.)?(?:x\.com|twitter\.com)\/(?:#!\/)?([A-Za-z0-9_]{1,15})(?=[/?#"'&<\s]|$)/gi)) {
    const handle = match[1];
    if (!excludedHandles.has(handle.toLowerCase())) handles.add(handle);
  }
  for (const key of ["twitter:site", "twitter:creator"]) {
    const handle = metaContent(normalized, [key]).replace(/^@/, "");
    if (/^[A-Za-z0-9_]{1,15}$/.test(handle) && !excludedHandles.has(handle.toLowerCase())) handles.add(handle);
  }
  return [...handles];
}

function candidateScore(handle, item) {
  const lower = handle.toLowerCase();
  const name = item.name.toLowerCase().replace(/[^a-z0-9]/g, "");
  let domain = "";
  try { domain = new URL(item.officialUrl).hostname.replace(/^www\./, "").split(".")[0].toLowerCase().replace(/[^a-z0-9]/g, ""); } catch { /* Ignore invalid source URLs. */ }
  let score = 0;
  if (name && (lower.includes(name) || name.includes(lower))) score += 8;
  if (domain && (lower.includes(domain) || domain.includes(lower))) score += 6;
  if (/official|labs|protocol|finance|network|app|xyz/.test(lower)) score += 1;
  return score;
}

async function fetchPage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/127 Safari/537.36",
        accept: "text/html,application/xhtml+xml"
      }
    });
    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/html") && !type.includes("application/xhtml")) {
      return { url, finalUrl: response.url, status: response.status, html: "", error: `unsupported ${type}` };
    }
    const html = (await response.text()).slice(0, 1_500_000);
    return { url, finalUrl: response.url, status: response.status, html, error: null };
  } catch (error) {
    return { url, finalUrl: url, status: 0, html: "", error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

async function researchItem(item) {
  const urls = [];
  if (item.officialUrl) {
    urls.push(item.officialUrl);
    try {
      const origin = new URL(item.officialUrl).origin;
      if (origin !== item.officialUrl.replace(/\/$/, "")) urls.push(origin);
    } catch { /* Source data already validates URLs. */ }
  }
  const pages = [];
  for (const url of [...new Set(urls)]) pages.push(await fetchPage(url));
  const htmlPages = pages.filter((page) => page.html);
  const handles = [...new Set(htmlPages.flatMap((page) => extractHandles(page.html)))];
  const ranked = handles
    .map((handle) => ({ handle, score: candidateScore(handle, item) }))
    .sort((left, right) => right.score - left.score || left.handle.localeCompare(right.handle));
  const description = htmlPages.map((page) => metaContent(page.html, ["description", "og:description", "twitter:description"])).find(Boolean) || "";
  const title = htmlPages.map((page) => pageTitle(page.html)).find(Boolean) || "";
  return {
    id: item.id,
    sourceRow: item.sourceRow,
    name: item.name,
    categoryId: item.categoryId,
    officialUrl: item.officialUrl,
    suggestedX: ranked[0]?.handle ? `@${ranked[0].handle}` : null,
    xCandidates: ranked,
    metaDescription: description,
    pageTitle: title,
    pages: pages.map(({ html: _html, ...page }) => page)
  };
}

const results = new Array(source.items.length);
let cursor = 0;
const workerCount = 8;
await Promise.all(Array.from({ length: workerCount }, async () => {
  while (cursor < source.items.length) {
    const index = cursor;
    cursor += 1;
    results[index] = await researchItem(source.items[index]);
    console.log(`${index + 1}/${source.items.length} ${source.items[index].name}: ${results[index].suggestedX || "—"}`);
  }
}));

const report = {
  generatedAt: new Date().toISOString(),
  sourceItems: source.items.length,
  fetchedItems: results.filter((item) => item.pages.some((page) => page.status >= 200 && page.status < 400)).length,
  xResolved: results.filter((item) => item.suggestedX).length,
  descriptionResolved: results.filter((item) => item.metaDescription).length,
  items: results
};

await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputPath, sourceItems: report.sourceItems, fetchedItems: report.fetchedItems, xResolved: report.xResolved, descriptionResolved: report.descriptionResolved }, null, 2));
