import ExcelJS from "exceljs";

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error("Usage: node scripts/extract-binance-influence-sheet.mjs <source.xlsx>");

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(sourcePath);
const sheet = workbook.worksheets[0];
if (!sheet) throw new Error("Google Sheet export does not contain a worksheet.");

const descriptions = new Map();
const profileUrls = new Map();
const userSupplements = new Map([
  [51, { profileUrl: "https://www.binance.com/zh-CN/square/profile/cryptosociety" }],
  [65, { bio: "币安广场活跃创作者，经常通过直播与社区互动，聚焦BNB生态、主流币行情分析及Web3财富密码，以高频的市场交流和实盘讨论吸引大量关注。" }],
  [69, { profileUrl: "https://www.binance.com/zh-CN/square/profile/square-creator-461623241" }],
]);

for (let rank = 1; rank <= 100; rank += 1) {
  const description = sheet.getCell(`G${rank + 1}`).text.trim();
  if (description) descriptions.set(rank, description);
}

for (let row = 2; row <= sheet.rowCount; row += 1) {
  const cell = sheet.getCell(`G${row}`);
  if (!cell.hyperlink) continue;

  const value = cell.value;
  const heading = value && typeof value === "object" && "text" in value && value.text && typeof value.text === "object" && "richText" in value.text
    ? value.text.richText.map((part) => part.text).join("")
    : String(cell.text ?? "");
  const rank = Number.parseInt(heading.match(/^(\d+)[、.]/)?.[1] ?? "", 10);
  if (!Number.isInteger(rank) || rank < 1 || rank > 100) continue;

  if (/^https:\/\/www\.binance\.com\/zh-CN\/square\/profile\/[a-zA-Z0-9_-]+$/.test(cell.hyperlink)) {
    profileUrls.set(rank, cell.hyperlink);
  }

  if (descriptions.has(rank)) continue;

  for (let nextRow = row + 1; nextRow <= Math.min(row + 4, sheet.rowCount); nextRow += 1) {
    const candidate = sheet.getCell(`G${nextRow}`);
    if (candidate.hyperlink) break;
    const text = candidate.text.trim();
    const isRankingHeading = /^\d+[、.]\s*@?.+?\s*\|\s*KOL\s*粉丝数\s*[:：]/i.test(text);
    if (text && !isRankingHeading) {
      descriptions.set(rank, text);
      break;
    }
  }
}

for (const [rank, supplement] of userSupplements) {
  if (supplement.bio) descriptions.set(rank, supplement.bio);
  if (supplement.profileUrl) profileUrls.set(rank, supplement.profileUrl);
}

const records = Array.from({ length: 100 }, (_, index) => {
  const rank = index + 1;
  return { rank, bio: descriptions.get(rank) ?? "", profileUrl: profileUrls.get(rank) };
});

const missingProfiles = records.filter((record) => !record.profileUrl).map((record) => record.rank);
if (profileUrls.size !== 100 || missingProfiles.length !== 0) {
  throw new Error(`Unexpected homepage coverage: ${profileUrls.size}/100, missing ${missingProfiles.join(",")}`);
}

const missingDescriptions = records.filter((record) => !record.bio).map((record) => record.rank);
if (descriptions.size !== 100 || missingDescriptions.length !== 0) {
  throw new Error(`Unexpected description coverage: ${descriptions.size}/100, missing ${missingDescriptions.join(",")}`);
}

const invalidDescriptions = records.filter((record) => /KOL\s*粉丝数\s*[:：]/i.test(record.bio));
if (invalidDescriptions.length > 0) {
  throw new Error(`Ranking headings leaked into descriptions: ${invalidDescriptions.map((record) => record.rank).join(",")}`);
}

process.stdout.write(JSON.stringify(records, null, 2));
