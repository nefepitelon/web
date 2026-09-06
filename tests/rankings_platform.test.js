const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Qilu Rankings is grouped under the first-level Products menu", () => {
  const header = read("components/platform-header.tsx");
  const products = header.match(/const productLinks:[\s\S]*?const collaborationLinks:/)?.[0] ?? "";
  assert.match(products, /href: "\/rankings"/);
  assert.match(products, /zh: "奇录排行榜"/);
  assert.match(products, /en: "Qilu Rankings"/);
  assert.match(products, /icon: Trophy/);
});

test("Qilu Rankings is a native extensible ranking surface", () => {
  const page = read("app/rankings/page.tsx");
  const styles = read("app/rankings/rankings.module.css");
  assert.match(page, /HistoryRanking/);
  assert.match(page, /EasyRanking/);
  assert.match(page, /SquareRanking/);
  assert.match(page, /InfluenceRanking/);
  assert.match(page, /InfluenceResults/);
  assert.match(page, /BinanceSquareMonitor/);
  assert.match(page, /searchParams: Promise/);
  assert.match(page, /影响人类历史进程的100名人排行榜/);
  assert.match(page, /EASY Residency 孵化项目榜/);
  assert.match(page, /币安广场主播监控榜/);
  assert.match(page, /币安广场影响力排名 Top100/);
  assert.match(page, /RANKING INDEX · 04/);
  assert.match(page, /board: "square"/);
  assert.match(page, /board: "influence"/);
  assert.match(page, /type RankingView = "table" \| "cards" \| "board"/);
  assert.match(page, /表格展示/);
  assert.match(page, /卡片展示/);
  assert.match(page, /分类看板/);
  assert.match(page, /HistoryResults/);
  assert.match(page, /EasyResults/);
  assert.match(styles, /\.rankingTable/);
  assert.match(styles, /height: 39px/);
  assert.match(styles, /\.recordCardGrid/);
  assert.match(styles, /\.categoryBoard/);
  assert.match(styles, /--rank-accent: #86bd99/);
  assert.doesNotMatch(page, /<iframe|dangerouslySetInnerHTML/);
  assert.doesNotMatch(page, /podium|榜单前三名/);
  assert.doesNotMatch(styles, /\.podium/);
  assert.match(styles, /@media \(max-width: 560px\)/);
});

test("Binance Square influence board preserves the complete sourced Top100 snapshot", () => {
  const page = read("app/rankings/page.tsx");
  const data = read("lib/binance-square-influence.ts");
  const details = read("lib/binance-square-influence-details.ts");
  const extractor = read("scripts/extract-binance-influence-sheet.mjs");
  const styles = read("app/rankings/rankings.module.css");
  const factsBlock = data.match(/const influenceFacts:[\s\S]*?\] as const;/)?.[0] ?? "";
  const records = factsBlock.match(/^\s+\[\d+, ".+", \d+, \d+\],$/gm) ?? [];
  const detailRecords = details.match(/^\s+"rank": \d+,$/gm) ?? [];
  const descriptions = details.match(/^\s+"bio": ".*",?$/gm) ?? [];
  const profileUrls = details.match(/^\s+"profileUrl": "https:\/\/www\.binance\.com\/zh-CN\/square\/profile\/[a-zA-Z0-9_-]+"$/gm) ?? [];

  assert.equal(records.length, 100);
  assert.equal(detailRecords.length, 100);
  assert.equal(descriptions.filter((line) => !/^\s+"bio": "",?$/.test(line)).length, 100);
  assert.equal(profileUrls.length, 100);
  assert.doesNotMatch(details, /"bio": ".*KOL\s*粉丝数\s*[:：]/);
  assert.match(data, /327689933670801/);
  assert.match(data, /327696134287794/);
  assert.match(data, /XHuntCN\/status\/2059581779934409139/);
  assert.match(data, /BINANCE_INFLUENCE_SNAPSHOT = "2026-05-23"/);
  assert.match(data, /\[88, "万联welinkBTC", 69, 51347\]/);
  assert.match(page, /KOL 粉丝数/);
  assert.match(page, /<th>个人说明<\/th><th>跳转主页<\/th>/);
  assert.doesNotMatch(page, /<th>来源<\/th>/);
  assert.match(page, /InfluenceProfileLink/);
  assert.match(page, /account\.bio/);
  assert.match(page, /个人说明与主页匹配表/);
  assert.match(page, /站内分类用于阅读导航/);
  assert.match(details, /docs\.google\.com\/spreadsheets\/d\/1ungkQGp0xTLDiGHO4r2qV3P-_m1wTdiPoRM-kfkvwKk/);
  assert.match(extractor, /profileUrls\.size !== 100/);
  assert.match(extractor, /descriptions\.size !== 100/);
  assert.match(details, /币安广场活跃创作者，经常通过直播与社区互动，聚焦BNB生态/);
  assert.match(details, /square\/profile\/cryptosociety/);
  assert.match(details, /square\/profile\/square-creator-461623241/);
  assert.match(styles, /\.influenceTable/);
  assert.match(styles, /\.influenceBioCell/);
  assert.match(styles, /\.profileLink/);
  assert.match(styles, /\.influenceSummary/);
  assert.doesNotMatch(page, /<iframe|dangerouslySetInnerHTML/);
});

test("Binance Square ranking uses a fixed server adapter and resilient live UI", () => {
  const page = read("app/rankings/page.tsx");
  const adapter = read("lib/binance-square-radar.ts");
  const route = read("app/api/rankings/binance-square/route.ts");
  const monitor = read("app/rankings/binance-square-monitor.tsx");
  const monitorStyles = read("app/rankings/binance-square-monitor.module.css");

  assert.match(adapter, /import "server-only"/);
  assert.match(adapter, /https:\/\/binancesquareradar\.qianyuwing\.com/);
  assert.match(adapter, /"\/api\/creators"/);
  assert.match(adapter, /"\/api\/dashboard"/);
  assert.match(adapter, /"\/api\/categories"/);
  assert.match(adapter, /FETCH_TIMEOUT_MS = 8_000/);
  assert.match(adapter, /AVATAR_HOSTS/);
  assert.match(adapter, /binanceUrl/);
  assert.match(adapter, /lastGoodSnapshot/);
  assert.match(adapter, /Promise\.allSettled/);
  assert.match(route, /s-maxage=15, stale-while-revalidate=45/);
  assert.match(route, /X-Radar-Mode/);
  assert.match(monitor, /30_000/);
  assert.match(monitor, /document\.visibilityState/);
  assert.match(monitor, /localStorage/);
  assert.match(monitor, /FOLLOW_STORAGE_KEY/);
  assert.match(monitor, /CreatorIdentity/);
  assert.match(monitor, /SortHeading/);
  assert.match(monitor, /categoryIds/);
  assert.match(monitor, /精选/);
  assert.match(monitor, /PAGE_SIZE = 50/);
  assert.match(monitor, /rel="noopener noreferrer"/);
  assert.match(monitorStyles, /min-width: 1380px/);
  assert.match(monitorStyles, /@media \(max-width: 680px\)/);
  assert.doesNotMatch(page, /<iframe/);
});

test("ranking data includes 100 historical people and four EASY seasons", () => {
  const data = read("lib/rankings.ts");
  const peopleBlock = data.match(/const historicalPeopleBase:[\s\S]*?\] as const;/)?.[0] ?? "";
  const countriesBlock = data.match(/export const historicalCountries = \[[\s\S]*?\] as const;/)?.[0] ?? "";
  const seasonsBlock = data.match(/export const easySeasons:[\s\S]*?\] as const;/)?.[0] ?? "";
  const peopleRanks = peopleBlock.match(/\{ rank: \d+, name:/g) ?? [];
  const countries = countriesBlock.match(/^\s+".+",$/gm) ?? [];
  const seasonHeaders = seasonsBlock.match(/\n    season: [1-4],/g) ?? [];
  const projectRanks = seasonsBlock.match(/\{ rank: \d+, name:/g) ?? [];
  assert.equal(peopleRanks.length, 100);
  assert.equal(countries.length, 100);
  assert.equal(seasonHeaders.length, 4);
  assert.equal(projectRanks.length, 81);
  assert.match(data, /historyRankingSource/);
  assert.match(data, /www\.yzilabs\.com\/easy-residency/);
});

test("ranking enrichment exposes historical regions and verified EASY project links", () => {
  const page = read("app/rankings/page.tsx");
  const data = read("lib/rankings.ts");
  const styles = read("app/rankings/rankings.module.css");
  const linkBlock = data.match(/export const easyProjectLinks:[\s\S]*?^};/m)?.[0] ?? "";
  const verifiedProjects = linkBlock.match(/^\s+"[1-4]:\d+":/gm) ?? [];

  assert.match(data, /country: string/);
  assert.match(data, /country: historicalCountries\[index\]/);
  assert.match(page, /所属国家／地区/);
  assert.match(page, /person\.country/);
  assert.match(page, /X／推特/);
  assert.match(page, /<th>官网<\/th>/);
  assert.match(page, /getEasyProjectLinks/);
  assert.match(page, /target="_blank"/);
  assert.match(page, /rel="noopener noreferrer"/);
  assert.match(page, /待核验/);
  assert.ok(verifiedProjects.length >= 30);
  assert.match(styles, /\.historyTable/);
  assert.match(styles, /\.projectTable/);
  assert.match(styles, /\.projectLink/);
});
