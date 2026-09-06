import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const readBinary = (path) => readFile(new URL(`../${path}`, import.meta.url));

test("research cards expose a complete editorial identity and engagement surface", async () => {
  const [page, card, styles, cover] = await Promise.all([
    read("app/research/page.tsx"),
    read("components/research-card.tsx"),
    read("app/globals.css"),
    readBinary("public/research/research-default.png")
  ]);

  assert.match(page, /sourceType:\s*article\.sourceType/);
  assert.match(page, /heatScore:\s*article\.viewCount/);
  assert.match(card, /research-story-image/);
  assert.match(card, /分钟阅读/);
  assert.match(card, /站内原创/);
  assert.match(card, /外部精选/);
  assert.match(card, /research-bookmark-button/);
  assert.match(styles, /\.research-story-media[\s\S]*aspect-ratio:\s*5\s*\/\s*2\.55/);
  assert.equal(cover.subarray(1, 4).toString("ascii"), "PNG");
});

test("the X-style admin publisher uploads covers and inline research assets", async () => {
  const [composer, upload, action] = await Promise.all([
    read("components/research-composer.tsx"),
    read("app/api/research/upload/route.ts"),
    read("app/actions/research.ts")
  ]);

  assert.match(composer, /research-x-composer/);
  assert.match(composer, /上传文章封面/);
  assert.match(composer, /正文编辑工具栏/);
  assert.match(composer, /name="slug"/);
  assert.match(composer, /name="category"/);
  assert.match(composer, /name="access"/);
  assert.match(composer, /name="status"/);
  assert.match(composer, /localStorage\.setItem\(storageKey/);
  assert.match(composer, /research-composer-inline-images/);
  assert.match(composer, /onPaste=\{handleBodyPaste\}/);
  assert.match(composer, /clipboardData\.items/);
  assert.match(composer, /item\.type\.startsWith\("image\/"\)/);
  assert.match(composer, /insertBodyMarkdown\(markdown, selection\)/);
  assert.match(composer, /图片会上传并插入到当前光标位置/);
  assert.match(composer, /<ResearchBody body=\{publishedBody\}/);
  assert.match(composer, /type="hidden" name="body" value=\{publishedBody\}/);
  assert.match(composer, /markdownCaption/);
  assert.match(upload, /viewer\.role !== "admin"/);
  assert.match(upload, /BLOB_READ_WRITE_TOKEN/);
  assert.match(upload, /MAX_FILE_SIZE = 4 \* 1024 \* 1024/);
  assert.match(upload, /put\(`research\/\$\{kind\}s\//);
  assert.match(action, /sourceType:\s*input\.sourceType/);
  assert.match(action, /readingMinutes:\s*input\.readingMinutes/);
});

test("admins can edit and reversibly unpublish research while featured state stays publish-safe", async () => {
  const [page, card, composer, actions, styles] = await Promise.all([
    read("app/research/page.tsx"),
    read("components/research-card.tsx"),
    read("components/research-composer.tsx"),
    read("app/actions/research.ts"),
    read("app/globals.css")
  ]);

  assert.match(page, /searchParams:\s*Promise/);
  assert.match(page, /editingArticle/);
  assert.match(page, /canManage=\{isAdmin\}/);
  assert.match(card, /修改编辑/);
  assert.match(card, /unpublishResearchArticleAction/);
  assert.match(card, /已下架，可编辑后重新发布/);
  assert.match(composer, /updateResearchArticleAction\.bind\(null, article\.id\)/);
  assert.match(composer, /defaultChecked=\{article\?\.featured \?\? false\}/);
  assert.match(composer, /`\$\{DRAFT_KEY\}:\$\{article\.id\}`/);
  assert.match(actions, /export async function updateResearchArticleAction/);
  assert.match(actions, /export async function unpublishResearchArticleAction/);
  assert.match(actions, /status: "DRAFT", featured: false, publishedAt: null/);
  assert.match(actions, /featured: input\.status === "PUBLISHED" && formData\.get\("featured"\) === "on"/);
  assert.match(styles, /\.research-story-admin-actions/);
});

test("research typography stays compact inside a centered editorial column", async () => {
  const styles = await read("app/globals.css");

  assert.match(styles, /\.research-page-hero,[\s\S]*\.research-archive-section\s*\{[\s\S]*width:\s*min\(1360px/);
  assert.match(styles, /\.research-page-intro h1\s*\{[\s\S]*font-size:\s*clamp\(44px,\s*5\.2vw,\s*76px\)/);
  assert.match(styles, /\.research-story-link h3\s*\{[\s\S]*font-size:\s*clamp\(21px,\s*1\.7vw,\s*28px\)/);
  assert.match(styles, /\.research-article-body p\s*\{\s*font-size:\s*17px/);
  assert.match(styles, /\.research-composer-inline-images figure > div\s*\{[\s\S]*aspect-ratio:\s*16\s*\/\s*9/);
});

test("internal and external research stay in-site with access controls, comments and heat", async () => {
  const [article, externalReader, body, tracker, actions, viewRoute, schema] = await Promise.all([
    read("app/research/[slug]/page.tsx"),
    read("components/research-external-reader.tsx"),
    read("components/research-body.tsx"),
    read("components/research-engagement.tsx"),
    read("app/actions/research.ts"),
    read("app/api/research/[id]/view/route.ts"),
    read("prisma/schema.prisma")
  ]);

  assert.match(article, /article\.sourceType === "EXTERNAL"/);
  assert.match(article, /<ResearchExternalReader/);
  assert.match(article, /<ResearchBody/);
  assert.match(article, /research-comments/);
  assert.match(externalReader, /<iframe/);
  assert.match(externalReader, /sandbox="allow-forms allow-popups/);
  assert.doesNotMatch(body, /dangerouslySetInnerHTML/);
  assert.match(tracker, /sessionStorage\.getItem/);
  assert.match(viewRoute, /viewCount:\s*\{ increment:\s*1 \}/);
  assert.match(viewRoute, /checkRateLimit/);
  assert.match(actions, /prisma\.researchComment\.create/);
  assert.match(actions, /prisma\.researchBookmark\.create/);
  assert.match(schema, /viewCount\s+Int\s+@default\(0\)/);
});

test("research publishing uses header-safe URLs and legacy unicode slugs remain readable", async () => {
  const [action, article, card, routing] = await Promise.all([
    read("app/actions/research.ts"),
    read("app/research/[slug]/page.tsx"),
    read("components/research-card.tsx"),
    read("lib/research-routing.ts")
  ]);

  assert.match(action, /normalizeResearchSlug/);
  assert.match(action, /redirect\(articlePath\)/);
  assert.match(action, /researchArticlePath\(article\.slug\)/);
  assert.match(article, /researchSlugCandidates\(slug\)/);
  assert.match(card, /href=\{articlePath\}/);
  assert.match(routing, /replace\(\/\[\^a-z0-9\]\+\/g, "-"\)/);
  assert.match(routing, /encodeURIComponent\(slug\)/);
  assert.match(routing, /decodeURIComponent\(value\)/);
  assert.match(routing, /normalize\("NFKC"\)/);
});

test("published research cards expose branded sharing and social platform handoffs", async () => {
  const [card, menu, sharePage, image, routing, data, styles] = await Promise.all([
    read("components/research-card.tsx"),
    read("components/research-share-menu.tsx"),
    read("app/research/[slug]/share/page.tsx"),
    read("lib/research-share-image.tsx"),
    read("lib/research-routing.ts"),
    read("lib/research-data.ts"),
    read("app/globals.css")
  ]);

  assert.match(card, /!article\.draft/);
  assert.match(card, /<ResearchShareMenu/);
  assert.match(menu, /twitter\.com\/intent\/tweet/);
  assert.match(menu, /service\.weibo\.com\/share\/share\.php/);
  assert.match(menu, /binance\.com\/square\/creator-center\/home/);
  assert.match(menu, /navigator\.share/);
  assert.match(menu, /品牌分享页/);
  assert.match(sharePage, /generateMetadata/);
  assert.match(sharePage, /WELINKBTC 阅读全文/);
  assert.match(image, /new ImageResponse/);
  assert.match(image, /welinkbtc-onchain-brand\.png/);
  assert.doesNotMatch(image, /welinkbtc-orbit-brand\.webp/);
  assert.match(sharePage, /preview-image/);
  assert.match(image, /article\?\.title/);
  assert.match(image, /article\?\.excerpt/);
  assert.match(routing, /researchSharePath/);
  assert.match(data, /status:\s*"PUBLISHED"/);
  assert.match(styles, /\.research-share-popover/);
  assert.match(styles, /\.research-share-dialog-backdrop/);
  assert.match(menu, /createPortal/);
  assert.match(menu, /aria-modal="true"/);
  assert.match(styles, /\.research-share-card/);
});

test("research archive supports server-backed search, category counts and sorting", async () => {
  const [page, filters, styles] = await Promise.all([
    read("app/research/page.tsx"),
    read("components/research-archive-filters.tsx"),
    read("app/globals.css")
  ]);

  assert.match(page, /q\?: string/);
  assert.match(page, /category\?: string/);
  assert.match(page, /sort\?: string/);
  assert.match(page, /contains:\s*searchQuery, mode:\s*"insensitive"/);
  assert.match(page, /groupBy/);
  assert.match(page, /readingMinutes:\s*"asc"/);
  assert.match(page, /viewCount:\s*"desc"/);
  assert.match(page, /<ResearchArchiveFilters/);
  assert.match(filters, /搜索标题、摘要或分类/);
  assert.match(filters, /最新发布/);
  assert.match(filters, /热度最高/);
  assert.match(filters, /router\.replace/);
  assert.match(styles, /\.research-archive-controls/);
  assert.match(styles, /\.research-category-tabs/);
});

test("admins can permanently delete drafts without exposing published articles to direct deletion", async () => {
  const [actions, card, deleteControl, page] = await Promise.all([
    read("app/actions/research.ts"),
    read("components/research-card.tsx"),
    read("components/research-draft-delete.tsx"),
    read("app/research/page.tsx")
  ]);

  assert.match(actions, /export async function deleteResearchDraftAction/);
  assert.match(actions, /draft\.status !== "DRAFT"/);
  assert.match(actions, /prisma\.researchArticle\.delete/);
  assert.match(actions, /admin\.research\.draft_deleted/);
  assert.match(card, /article\.draft \? \(/);
  assert.match(card, /<ResearchDraftDelete/);
  assert.match(deleteControl, /永久删除？/);
  assert.match(page, /published-delete-blocked/);
});

test("authorized external articles import through an SSRF-safe admin-only draft pipeline", async () => {
  const [route, importer, service, composer, page, styles] = await Promise.all([
    read("app/api/research/import/route.ts"),
    read("components/research-importer.tsx"),
    read("lib/research-import.ts"),
    read("components/research-composer.tsx"),
    read("app/research/page.tsx"),
    read("app/globals.css")
  ]);

  assert.match(route, /viewer\.role !== "admin"/);
  assert.match(route, /viewer\.twoFactorEnabled/);
  assert.match(route, /rightsConfirmed:\s*z\.literal\(true\)/);
  assert.match(route, /status:\s*"DRAFT"/);
  assert.match(route, /sourceType:\s*"INTERNAL"/);
  assert.match(route, /externalUrl:\s*imported\.sourceUrl/);
  assert.match(route, /checkRateLimit/);
  assert.match(importer, /我确认拥有转载、授权导入或内容使用权/);
  assert.match(importer, /抓取为草稿/);
  assert.match(importer, /授权粘贴导入/);
  assert.match(importer, /clipboardData\.getData\("text\/html"\)/);
  assert.match(route, /importAuthorizedPastedArticle/);
  assert.match(route, /manualImport:\s*error\.code === "MANUAL_IMPORT_REQUIRED"/);
  assert.match(service, /lookup\(hostname, \{ all: true/);
  assert.match(service, /isPrivateNetworkAddress/);
  assert.match(service, /redirect:\s*"manual"/);
  assert.match(service, /robotsAllowsPath/);
  assert.match(service, /publish\.x\.com\/oembed/);
  assert.match(service, /method:\s*"X_OEMBED"/);
  assert.match(service, /method:\s*"MANUAL_PASTE"/);
  assert.match(service, /MAX_HTML_BYTES/);
  assert.match(service, /MAX_IMPORTED_IMAGES/);
  assert.match(service, /research\/imports\//);
  assert.match(composer, /inlineImagesFromMarkdown/);
  assert.match(page, /<ResearchImporter/);
  assert.match(styles, /\.research-importer/);
});
