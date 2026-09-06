import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { put } from "@vercel/blob";
import { load, type Cheerio, type CheerioAPI } from "cheerio";
import type { AnyNode, Element } from "domhandler";

const IMPORT_USER_AGENT = "welinkBTCResearchImporter/1.0 (+https://www.welinkbtc-onchainmain.xyz/research)";
const MAX_REDIRECTS = 4;
const MAX_HTML_BYTES = 3 * 1024 * 1024;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_IMPORTED_IMAGES = 12;
const FETCH_TIMEOUT_MS = 12_000;

export class ResearchImportError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "RESEARCH_IMPORT_FAILED") {
    super(message);
    this.name = "ResearchImportError";
    this.status = status;
    this.code = code;
  }
}

function isPrivateIpv4(address: string) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export function isPrivateNetworkAddress(address: string) {
  const normalized = address.toLowerCase().split("%")[0];
  if (isIP(normalized) === 4) return isPrivateIpv4(normalized);
  if (isIP(normalized) !== 6) return true;
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isPrivateIpv4(mapped[1]) : false;
}

export function normalizeExternalSourceUrl(value: string | URL) {
  let url: URL;
  try {
    url = value instanceof URL ? new URL(value) : new URL(value);
  } catch {
    throw new ResearchImportError("请输入有效的文章网址");
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new ResearchImportError("仅支持公开的 HTTP 或 HTTPS 文章网址");
  }
  if (url.port && !["80", "443"].includes(url.port)) {
    throw new ResearchImportError("文章网址使用了不受支持的端口");
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new ResearchImportError("不能抓取本地或内部网络地址");
  }
  const literalIp = isIP(hostname);
  if (literalIp && isPrivateNetworkAddress(hostname)) throw new ResearchImportError("不能抓取本地或内部网络地址");
  url.hash = "";
  return url;
}

export async function assertSafeRemoteUrl(value: string | URL) {
  const url = normalizeExternalSourceUrl(value);
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const literalIp = isIP(hostname);
  if (!literalIp) {
    let resolved: Array<{ address: string; family: number }>;
    try {
      resolved = await lookup(hostname, { all: true, verbatim: true });
    } catch {
      throw new ResearchImportError("无法解析文章来源网站");
    }
    if (!resolved.length || resolved.some((item) => isPrivateNetworkAddress(item.address))) {
      throw new ResearchImportError("文章来源解析到了不安全的网络地址");
    }
  }
  return url;
}

async function safeFetch(input: string | URL, accept: string) {
  let current = await assertSafeRemoteUrl(input);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(current, {
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Accept: accept,
          "User-Agent": IMPORT_USER_AGENT
        }
      });
    } catch {
      throw new ResearchImportError("文章来源暂时无法访问或响应超时", 502);
    } finally {
      clearTimeout(timeout);
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirects === MAX_REDIRECTS) throw new ResearchImportError("文章来源重定向次数过多", 502);
      current = await assertSafeRemoteUrl(new URL(location, current));
      continue;
    }
    return { response, finalUrl: current };
  }
  throw new ResearchImportError("文章来源重定向次数过多", 502);
}

function robotsRulesFor(content: string, targetAgent: string) {
  const groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; path: string }> }> = [];
  let group = { agents: [] as string[], rules: [] as Array<{ allow: boolean; path: string }> };
  let hasRules = false;
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === "user-agent") {
      if (hasRules) {
        groups.push(group);
        group = { agents: [], rules: [] };
        hasRules = false;
      }
      group.agents.push(value.toLowerCase());
    } else if ((key === "allow" || key === "disallow") && group.agents.length) {
      if (value) group.rules.push({ allow: key === "allow", path: value });
      hasRules = true;
    }
  }
  if (group.agents.length) groups.push(group);
  const normalizedAgent = targetAgent.toLowerCase();
  const exact = groups.filter((item) => item.agents.some((agent) => agent !== "*" && normalizedAgent.includes(agent)));
  return exact.length ? exact.flatMap((item) => item.rules) : groups.filter((item) => item.agents.includes("*")).flatMap((item) => item.rules);
}

export function robotsAllowsPath(content: string, pathname: string, targetAgent = "welinkbtcresearchimporter") {
  const path = pathname || "/";
  const matches = robotsRulesFor(content, targetAgent)
    .filter((rule) => path.startsWith(rule.path.replace(/\*.*$/, "")))
    .sort((left, right) => right.path.length - left.path.length);
  return matches[0]?.allow ?? true;
}

async function assertRobotsAllowed(url: URL) {
  const robotsUrl = new URL("/robots.txt", url);
  try {
    const { response } = await safeFetch(robotsUrl, "text/plain,*/*;q=0.1");
    if (response.status === 404) return;
    if (response.status === 401 || response.status === 403) {
      throw new ResearchImportError("来源网站禁止自动抓取，请改用授权粘贴导入", 409, "MANUAL_IMPORT_REQUIRED");
    }
    if (!response.ok) return;
    const content = (await response.text()).slice(0, 512_000);
    if (!robotsAllowsPath(content, url.pathname)) {
      throw new ResearchImportError("来源网站禁止自动抓取。已为你打开授权粘贴导入，可从原页面复制正文后保存为站内草稿。", 409, "MANUAL_IMPORT_REQUIRED");
    }
  } catch (error) {
    if (error instanceof ResearchImportError && [403, 409].includes(error.status)) throw error;
  }
}

function absoluteHttpUrl(value: string | undefined, baseUrl: URL) {
  if (!value || value.startsWith("data:") || value.startsWith("blob:")) return null;
  try {
    const url = new URL(value, baseUrl);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function sourceFromImage(element: Element, baseUrl: URL) {
  const attributes = element.attribs ?? {};
  const direct = attributes["data-src"] || attributes["data-original"] || attributes["data-lazy-src"] || attributes.src;
  if (direct) return absoluteHttpUrl(direct, baseUrl);
  const srcset = attributes["data-srcset"] || attributes.srcset;
  const candidate = srcset?.split(",").at(-1)?.trim().split(/\s+/)[0];
  return absoluteHttpUrl(candidate, baseUrl);
}

function safeAssetName(url: URL, contentType: string) {
  const sourceName = decodeURIComponent(url.pathname.split("/").pop() || "article-image")
    .normalize("NFKC")
    .replace(/[^\p{Letter}\p{Number}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-100);
  if (/\.(?:png|jpe?g|webp|gif|avif)$/i.test(sourceName)) return sourceName;
  const extension = ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" } as Record<string, string>)[contentType] || "img";
  return `${sourceName || "article-image"}.${extension}`;
}

async function saveRemoteImage(value: string) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  try {
    const url = await assertSafeRemoteUrl(value);
    const { response, finalUrl } = await safeFetch(url, "image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9");
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type")?.split(";")[0]?.toLowerCase() ?? "";
    if (!["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"].includes(contentType)) return null;
    const advertisedSize = Number(response.headers.get("content-length") || 0);
    if (advertisedSize > MAX_IMAGE_BYTES) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return null;
    const blob = await put(`research/imports/${safeAssetName(finalUrl, contentType)}`, bytes, {
      access: "public",
      addRandomSuffix: true,
      contentType
    });
    return blob.url;
  } catch {
    return null;
  }
}

function compactText(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/[\t ]+/g, " ").replace(/\s*\n\s*/g, " ").trim();
}

function escapeInline(value: string) {
  return compactText(value).replace(/([\[\]])/g, "\\$1");
}

function renderChildren(node: Element, baseUrl: URL): string {
  return node.children.map((child) => renderNode(child, baseUrl)).join("");
}

function renderList(node: Element, baseUrl: URL, ordered: boolean) {
  const items = node.children.filter((child): child is Element => child.type === "tag" && child.name === "li");
  return `\n\n${items.map((item, index) => `${ordered ? `${index + 1}.` : "-"} ${renderChildren(item, baseUrl).trim()}`).join("\n")}\n\n`;
}

function renderTable(node: Element, baseUrl: URL) {
  const rows: string[][] = [];
  const visit = (current: AnyNode) => {
    if (current.type === "tag" && current.name === "tr") {
      rows.push(current.children
        .filter((child): child is Element => child.type === "tag" && ["th", "td"].includes(child.name))
        .map((cell) => compactText(renderChildren(cell, baseUrl)).replace(/\|/g, "\\|")));
      return;
    }
    if ("children" in current) current.children.forEach(visit);
  };
  visit(node);
  if (!rows.length) return "";
  const width = Math.max(...rows.map((row) => row.length));
  const normalized = rows.map((row) => [...row, ...Array(Math.max(0, width - row.length)).fill("")]);
  const header = normalized[0];
  return `\n\n| ${header.join(" | ")} |\n| ${header.map(() => "---").join(" | ")} |\n${normalized.slice(1).map((row) => `| ${row.join(" | ")} |`).join("\n")}\n\n`;
}

function renderNode(node: AnyNode, baseUrl: URL): string {
  if (node.type === "text") return node.data.replace(/\s+/g, " ");
  if (node.type !== "tag") return "";
  const element = node as Element;
  const tag = element.name.toLowerCase();
  const children = renderChildren(element, baseUrl);
  if (["script", "style", "noscript", "template", "svg"].includes(tag)) return "";
  if (tag === "br") return "\n";
  if (/^h[1-4]$/.test(tag)) return `\n\n${"#".repeat(Math.max(2, Number(tag[1])))} ${compactText(children)}\n\n`;
  if (tag === "p") return `\n\n${children.trim()}\n\n`;
  if (tag === "blockquote") return `\n\n${compactText(children).split("\n").map((line) => `> ${line}`).join("\n")}\n\n`;
  if (tag === "ul") return renderList(element, baseUrl, false);
  if (tag === "ol") return renderList(element, baseUrl, true);
  if (tag === "pre") return `\n\n\`\`\`\n${element.children.map((child) => child.type === "text" ? child.data : renderNode(child, baseUrl)).join("").trim()}\n\`\`\`\n\n`;
  if (tag === "code") return `\`${compactText(children)}\``;
  if (tag === "strong" || tag === "b") return `**${compactText(children)}**`;
  if (tag === "em" || tag === "i") return `*${compactText(children)}*`;
  if (tag === "a") {
    const href = absoluteHttpUrl(element.attribs?.href, baseUrl);
    const label = escapeInline(children) || href || "原文链接";
    return href ? `[${label}](${href})` : label;
  }
  if (tag === "img") {
    const src = element.attribs?.src;
    if (!src) return "";
    return `\n\n![${escapeInline(element.attribs?.alt || "文章配图")}](${src})\n\n`;
  }
  if (tag === "iframe") {
    const src = absoluteHttpUrl(element.attribs?.src, baseUrl);
    return src ? `\n\n[嵌入内容](${src})\n\n` : "";
  }
  if (tag === "table") return renderTable(element, baseUrl);
  if (tag === "hr") return "\n\n---\n\n";
  if (["div", "section", "article", "main", "figure", "figcaption", "header"].includes(tag)) return `\n${children}\n`;
  return children;
}

function bestArticleRoot($: CheerioAPI): Cheerio<AnyNode> | null {
  const selectors = [
    "[itemprop='articleBody']",
    "article",
    ".article-content",
    ".article-body",
    ".post-content",
    ".post-body",
    ".entry-content",
    "main"
  ];
  let best: Cheerio<AnyNode> | null = null;
  let bestScore = 0;
  for (const selector of selectors) {
    $(selector).each((_index, element) => {
      const candidate = $(element);
      const textLength = compactText(candidate.text()).length;
      const linkLength = candidate.find("a").toArray().reduce((sum, link) => sum + compactText($(link).text()).length, 0);
      const score = textLength - linkLength * 0.35;
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    });
  }
  return best;
}

function firstMeta($: CheerioAPI, selectors: string[]) {
  for (const selector of selectors) {
    const value = $(selector).first().attr("content")?.trim();
    if (value) return value;
  }
  return "";
}

export type ImportedResearchArticle = {
  title: string;
  excerpt: string;
  body: string;
  coverImageUrl: string | null;
  category: string;
  sourceUrl: string;
  readingMinutes: number;
  importedImageCount: number;
  skippedImageCount: number;
  method: "AUTO_HTML" | "X_OEMBED" | "MANUAL_PASTE";
  warning?: string;
};

type XOEmbedResponse = {
  author_name?: string;
  author_url?: string;
  html?: string;
  provider_name?: string;
};

function xStatusId(url: URL) {
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!["x.com", "twitter.com", "mobile.twitter.com"].includes(hostname)) return null;
  return url.pathname.match(/\/(?:status|statuses)\/(\d+)/)?.[1] ?? null;
}

function isOnlyLink(value: string) {
  return /^https?:\/\/\S+$/i.test(value.trim());
}

async function importXPost(requestedUrl: URL): Promise<ImportedResearchArticle> {
  const endpoint = new URL("https://publish.x.com/oembed");
  endpoint.searchParams.set("url", requestedUrl.toString());
  endpoint.searchParams.set("omit_script", "true");
  endpoint.searchParams.set("dnt", "true");
  endpoint.searchParams.set("lang", "zh-cn");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": IMPORT_USER_AGENT }
    });
  } catch {
    throw new ResearchImportError("X 官方嵌入接口暂时无法读取该帖子，请改用授权粘贴导入", 409, "MANUAL_IMPORT_REQUIRED");
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    throw new ResearchImportError("X 官方嵌入接口暂时无法读取该帖子，请改用授权粘贴导入", 409, "MANUAL_IMPORT_REQUIRED");
  }
  const advertisedSize = Number(response.headers.get("content-length") || 0);
  if (advertisedSize > 256_000) throw new ResearchImportError("X 返回的嵌入数据过大", 413);
  const payload = await response.json() as XOEmbedResponse;
  if (!payload.html || payload.provider_name !== "X") {
    throw new ResearchImportError("X 没有返回可导入的公开内容，请改用授权粘贴导入", 409, "MANUAL_IMPORT_REQUIRED");
  }

  const $ = load(payload.html);
  const postParagraph = $("blockquote p").first();
  const postText = compactText(postParagraph.text());
  const postMarkdown = postParagraph.length ? renderNode(postParagraph.get(0) as AnyNode, requestedUrl).trim() : "";
  const authorName = compactText(payload.author_name || "X 作者");
  const sourceOnly = !postText || isOnlyLink(postText);
  const titleSeed = sourceOnly ? `${authorName} 发布的 X 研究链接` : postText;
  const title = titleSeed.slice(0, 88);
  const body = [
    "## X 官方来源",
    postMarkdown ? `> ${postMarkdown.replace(/\n+/g, "\n> ")}` : "> 该帖子未返回可展示的文本正文。",
    `**作者：** [${escapeInline(authorName)}](${payload.author_url || requestedUrl.toString()})`,
    `[在 X 查看原内容](${requestedUrl.toString()})`
  ].join("\n\n");
  const warning = sourceOnly
    ? "该 X 帖子指向长文章，X 官方嵌入接口仅返回了来源链接。草稿已建立，请在编辑器中粘贴获授权的文章正文。"
    : "已通过 X 官方嵌入接口生成草稿，请发布前核对文本与授权信息。";

  return {
    title,
    excerpt: `来自 ${authorName} 的 X 内容。${warning}`.slice(0, 600),
    body,
    coverImageUrl: null,
    category: "SOCIAL",
    sourceUrl: requestedUrl.toString(),
    readingMinutes: Math.max(1, Math.ceil(postText.length / 350)),
    importedImageCount: 0,
    skippedImageCount: 0,
    method: "X_OEMBED",
    warning
  };
}

function markdownFromAuthorizedHtml(value: string, sourceUrl: URL, articleTitle: string) {
  const $ = load(value);
  $("script,style,noscript,template,nav,footer,aside,form,button,[role='navigation'],[aria-hidden='true']").remove();
  const root = bestArticleRoot($) || $("body").first();
  root.find("h1").filter((_index, element) => compactText($(element).text()) === articleTitle).first().remove();
  root.find("img").each((_index, element) => {
    const source = sourceFromImage(element, sourceUrl);
    if (source) $(element).attr("src", source).removeAttr("srcset data-srcset data-src data-original data-lazy-src");
    else $(element).remove();
  });
  return renderNode(root.get(0) as AnyNode, sourceUrl)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function researchReadingMinutes(markdown: string) {
  const chineseCharacters = (markdown.match(/[\u3400-\u9fff]/g) ?? []).length;
  const words = markdown.replace(/[\u3400-\u9fff]/g, " ").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(chineseCharacters / 350 + words / 220));
}

export async function importAuthorizedPastedArticle(input: {
  sourceUrl: string;
  title: string;
  body: string;
  bodyFormat: "html" | "markdown";
}): Promise<ImportedResearchArticle> {
  const sourceUrl = normalizeExternalSourceUrl(input.sourceUrl);
  const title = compactText(input.title).slice(0, 160);
  if (title.length < 4) throw new ResearchImportError("请填写至少 4 个字的文章标题");
  const markdown = (input.bodyFormat === "html" ? markdownFromAuthorizedHtml(input.body, sourceUrl, title) : input.body)
    .replace(/\0/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (markdown.length < 40) throw new ResearchImportError("请粘贴更完整的正文内容（至少 40 个字符）");
  if (markdown.length > 100_000) throw new ResearchImportError("文章正文超过 10 万字，请精简后再导入", 413);
  const excerpt = compactText(markdown.replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/[#>*_`\[\]()|-]/g, " ")).slice(0, 600);
  return {
    title,
    excerpt: excerpt.length >= 12 ? excerpt : `${title}：由管理员从授权来源粘贴导入的研究草稿。`,
    body: markdown,
    coverImageUrl: null,
    category: "IMPORTED",
    sourceUrl: sourceUrl.toString(),
    readingMinutes: researchReadingMinutes(markdown),
    importedImageCount: 0,
    skippedImageCount: 0,
    method: "MANUAL_PASTE",
    warning: input.bodyFormat === "html" ? "已从浏览器富文本剪贴板转换正文结构；请发布前核对图片与排版。" : undefined
  };
}

export async function importResearchArticle(rawUrl: string): Promise<ImportedResearchArticle> {
  const sourceUrl = normalizeExternalSourceUrl(rawUrl);
  if (xStatusId(sourceUrl)) return importXPost(sourceUrl);
  const requestedUrl = await assertSafeRemoteUrl(sourceUrl);
  await assertRobotsAllowed(requestedUrl);
  const { response, finalUrl } = await safeFetch(requestedUrl, "text/html,application/xhtml+xml;q=0.9");
  if (!response.ok) throw new ResearchImportError(`来源网站返回了 ${response.status}，暂时无法抓取`, 502);
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
    throw new ResearchImportError("该网址不是可导入的网页文章");
  }
  const advertisedSize = Number(response.headers.get("content-length") || 0);
  if (advertisedSize > MAX_HTML_BYTES) throw new ResearchImportError("原文页面过大，不能自动导入", 413);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_HTML_BYTES) throw new ResearchImportError("原文页面为空或超过 3MB", 413);

  const $ = load(bytes.toString("utf8"));
  $("script,style,noscript,template,nav,footer,aside,form,button,[role='navigation'],[aria-hidden='true']").remove();
  $("[class*='advert'],[class*='cookie'],[class*='newsletter'],[class*='related'],[class*='recommend'],[class*='comment'],[class*='share'],[id*='advert'],[id*='cookie'],[id*='comment'],[id*='share']").remove();
  const root = bestArticleRoot($);
  if (!root || compactText(root.text()).length < 120) {
    throw new ResearchImportError("未能识别文章正文；该页面可能依赖登录或动态脚本，请改用手动编辑");
  }

  const title = compactText(
    firstMeta($, ["meta[property='og:title']", "meta[name='twitter:title']"]) ||
    root.find("h1").first().text() ||
    $("h1").first().text() ||
    $("title").text()
  ).slice(0, 160);
  if (title.length < 4) throw new ResearchImportError("未能识别文章标题");
  root.find("h1").filter((_index, element) => compactText($(element).text()) === title).first().remove();

  const imageElements = root.find("img").toArray();
  let importedImageCount = 0;
  let skippedImageCount = Math.max(0, imageElements.length - MAX_IMPORTED_IMAGES);
  for (const element of imageElements.slice(0, MAX_IMPORTED_IMAGES)) {
    const original = sourceFromImage(element, finalUrl);
    const stored = original ? await saveRemoteImage(original) : null;
    if (stored) {
      $(element).attr("src", stored).removeAttr("srcset data-srcset data-src data-original data-lazy-src");
      importedImageCount += 1;
    } else {
      $(element).remove();
      skippedImageCount += 1;
    }
  }
  imageElements.slice(MAX_IMPORTED_IMAGES).forEach((element) => $(element).remove());

  const rawCover = firstMeta($, ["meta[property='og:image']", "meta[name='twitter:image']"]);
  const resolvedCover = absoluteHttpUrl(rawCover, finalUrl);
  const coverImageUrl = resolvedCover ? await saveRemoteImage(resolvedCover) : null;
  const markdown = renderNode(root.get(0) as AnyNode, finalUrl)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (markdown.length < 40) throw new ResearchImportError("抓取结果没有足够的正文内容");
  if (markdown.length > 100_000) throw new ResearchImportError("文章正文超过 10 万字，请精简后手动导入", 413);

  const firstParagraph = root.find("p").toArray().map((element) => compactText($(element).text())).find((value) => value.length >= 24) || "";
  const excerpt = compactText(firstMeta($, ["meta[name='description']", "meta[property='og:description']"]) || firstParagraph || markdown.replace(/[#>*_`\[\]()|-]/g, " ")).slice(0, 600);
  return {
    title,
    excerpt: excerpt.length >= 12 ? excerpt : `${title}：由管理员从授权来源导入的研究草稿。`,
    body: markdown,
    coverImageUrl,
    category: "IMPORTED",
    sourceUrl: finalUrl.toString(),
    readingMinutes: researchReadingMinutes(markdown),
    importedImageCount,
    skippedImageCount,
    method: "AUTO_HTML"
  };
}
