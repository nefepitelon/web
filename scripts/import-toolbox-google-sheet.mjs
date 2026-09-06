import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import ExcelJS from "exceljs";

const inputPath = process.argv[2];
if (!inputPath) {
  throw new Error("Usage: node scripts/import-toolbox-google-sheet.mjs <source.xlsx>");
}

const root = process.cwd();
const dataPath = path.join(root, "data", "toolbox-sheet-data.json");
const migrationDirectory = path.join(root, "prisma", "migrations", "20260811170000_import_full_toolbox_sheet");
const migrationPath = path.join(migrationDirectory, "migration.sql");

const categoryIds = new Map([
  ["Socialfi社交类", "toolbox-cat-socialfi"],
  ["身份认证", "toolbox-cat-identity"],
  ["咨询数据分析平台", "toolbox-cat-analytics"]
]);

const displayCategoryNames = new Map([
  ["Socialfi社交类", "SocialFi 社交类"]
]);

const categoryDescriptions = new Map([
  ["Socialfi社交类", "社交协议、内容分发与社区增长平台"],
  ["身份认证", "钱包身份、社交图谱与社区验证"],
  ["咨询数据分析平台", "市场、链上数据、资讯与研究工具"],
  ["预测市场", "事件预测、市场概率与观点交易平台"],
  ["AI产品", "人工智能助手、研究、生成与代理工具"],
  ["perps平台", "永续合约、链上交易与衍生品平台"],
  ["工具类产品", "数据观察、钱包、跨链与运营效率工具"],
  ["常用页面", "邮箱、账号、代理与日常运营入口"],
  ["其他", "跨链、支付、挖矿与新兴项目工具"],
  ["机器人AI赛道", "机器人、分布式算力与 AI 基础设施"],
  ["质押挖矿", "质押、稳定币收益与链上挖矿平台"],
  ["打新平台", "项目发行、认购与早期参与平台"],
  ["打狗平台", "链上新资产发现与交易平台"]
]);

const categoryPalette = [
  "#3BA6D8", "#8B7CF6", "#2AA876", "#F1B84B", "#E26FA4", "#D97845", "#55A6A6",
  "#6E89C8", "#9C7C5A", "#7A9E3A", "#B35C5C", "#7E6BB2", "#C8793F"
];

const existingItemIds = new Map([
  ["Socialfi社交类|firefly", "toolbox-firefly"],
  ["Socialfi社交类|tako", "toolbox-tako"],
  ["Socialfi社交类|farcaster", "toolbox-farcaster"],
  ["Socialfi社交类|giverep", "toolbox-giverep"],
  ["Socialfi社交类|reddit", "toolbox-reddit"],
  ["Socialfi社交类|virtuals", "toolbox-virtuals"],
  ["Socialfi社交类|soul", "toolbox-soul"],
  ["Socialfi社交类|glider", "toolbox-glider"],
  ["Socialfi社交类|river", "toolbox-river"],
  ["Socialfi社交类|wallchain", "toolbox-wallchain"],
  ["Socialfi社交类|ethos", "toolbox-ethos"],
  ["Socialfi社交类|推特", "toolbox-x"],
  ["Socialfi社交类|币安广场", "toolbox-binance-square"],
  ["Socialfi社交类|kaito", "toolbox-kaito"],
  ["Socialfi社交类|base钱包", "toolbox-base"],
  ["身份认证|matrica", "toolbox-matrica"],
  ["咨询数据分析平台|coinmarketcap", "toolbox-cmc"],
  ["咨询数据分析平台|coingecko", "toolbox-coingecko"],
  ["咨询数据分析平台|livecoinwatch", "toolbox-livecoinwatch"],
  ["咨询数据分析平台|arkm", "toolbox-arkm"],
  ["咨询数据分析平台|dune", "toolbox-dune"],
  ["咨询数据分析平台|nansen", "toolbox-nansen"],
  ["咨询数据分析平台|dlnews", "toolbox-dlnews"],
  ["咨询数据分析平台|glassnode", "toolbox-glassnode"],
  ["咨询数据分析平台|treeofalpha", "toolbox-treeofalpha"],
  ["咨询数据分析平台|panewslab财经日历", "toolbox-panewslab"],
  ["咨询数据分析平台|chainalert币链快报", "toolbox-chainalert"],
  ["咨询数据分析平台|foresightnews财经日历", "toolbox-foresight"]
]);

function textOf(cell) {
  const value = cell.value;
  if (value == null) return "";
  if (["string", "number", "boolean"].includes(typeof value)) return String(value).trim();
  if (value instanceof Date) return value.toISOString();
  const text = value.text;
  if (typeof text === "string") return text.trim();
  if (text && Array.isArray(text.richText)) return text.richText.map((part) => part.text || "").join("").trim();
  if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || "").join("").trim();
  if (value.result != null) return String(value.result).trim();
  return String(cell.text || "").trim();
}

function normalizedText(cell) {
  const value = textOf(cell);
  return value === "\\" ? "" : value;
}

function urlOf(cell) {
  const value = cell.value;
  if (value && typeof value === "object" && typeof value.hyperlink === "string") return value.hyperlink.trim();
  const text = textOf(cell);
  const matches = text.match(/https?:\/\/[^\s]+/g);
  if (matches?.length) return matches.at(-1).replace(/[，。；;）)]+$/, "");
  if (/^www\./i.test(text)) return `https://${text}`;
  return text;
}

function tutorialOf(cell) {
  const value = cell.value;
  if (value && typeof value === "object" && typeof value.hyperlink === "string") return value.hyperlink.trim();
  return normalizedText(cell);
}

function rowColorOf(cell) {
  const color = cell.fill?.fgColor?.argb?.toUpperCase() || "";
  if (["FF00B050", "FF92D050", "FF70AD47"].includes(color)) return "green";
  if (["FFFFFF00", "FFFFC000", "FFFFD966"].includes(color)) return "yellow";
  if (["FFFF0000", "FFC00000", "FFFF6666"].includes(color)) return "red";
  if (["FF808080", "FFA6A6A6", "FFD9D9D9"].includes(color)) return "gray";
  return "none";
}

function sqlString(value) {
  if (value == null || value === "") return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlBoolean(value) {
  return value ? "TRUE" : "FALSE";
}

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(path.resolve(inputPath));
const worksheet = workbook.worksheets[0];
if (!worksheet) throw new Error("The workbook contains no worksheets");

const header = Array.from({ length: 12 }, (_, index) => textOf(worksheet.getCell(1, index + 1)));
const expectedHeader = ["分类", "序号", "名称", "简要描述", "官网链接", "登录账号", "是否发币", "评分", "融资", "空投交互教程", "是否公开", "管理员操作列"];
if (expectedHeader.some((value, index) => header[index] !== value)) {
  throw new Error(`Unexpected worksheet header: ${JSON.stringify(header)}`);
}

const categories = [];
const items = [];
const skippedRows = [];
const inferredRows = [];
let sourceCategory = "";
let categoryCounter = 0;

for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
  const categoryCell = worksheet.getCell(rowNumber, 1);
  const categoryName = normalizedText(categoryCell);
  if (categoryName) {
    sourceCategory = categoryName;
    categoryCounter = 0;
    const categoryIndex = categories.length;
    const id = categoryIds.get(sourceCategory) || `toolbox-cat-sheet-${String(categoryIndex + 1).padStart(2, "0")}`;
    categories.push({
      id,
      sourceName: sourceCategory,
      name: displayCategoryNames.get(sourceCategory) || sourceCategory,
      description: categoryDescriptions.get(sourceCategory) || null,
      color: categoryPalette[categoryIndex % categoryPalette.length],
      sortOrder: (categoryIndex + 1) * 10,
      isPublic: true
    });
  }

  const sequenceText = normalizedText(worksheet.getCell(rowNumber, 2));
  let name = normalizedText(worksheet.getCell(rowNumber, 3));
  const officialUrl = urlOf(worksheet.getCell(rowNumber, 5));

  if (!name && rowNumber === 150 && officialUrl.includes("app.katana.network")) {
    name = "katana 生态";
    inferredRows.push({ row: rowNumber, field: "name", value: name, reason: "官网存在但名称单元格为空" });
  }

  if (!name) {
    if (sequenceText || officialUrl) skippedRows.push({ row: rowNumber, sequence: sequenceText, officialUrl });
    continue;
  }
  if (!sourceCategory) throw new Error(`Missing category before row ${rowNumber}`);

  const category = categories.find((entry) => entry.sourceName === sourceCategory);
  if (!category) throw new Error(`Unknown category at row ${rowNumber}`);
  const parsedSequence = Number.parseInt(sequenceText, 10);
  const sortOrder = Number.isFinite(parsedSequence) && parsedSequence > 0 ? parsedSequence : categoryCounter + 1;
  categoryCounter = Math.max(categoryCounter, sortOrder);
  const identityKey = `${sourceCategory}|${name.toLowerCase()}`;
  const id = existingItemIds.get(identityKey) || `toolbox-sheet-r${rowNumber}`;
  const ratingText = normalizedText(worksheet.getCell(rowNumber, 8));
  const ratingNumber = Number.parseInt(ratingText, 10);
  const publicText = normalizedText(worksheet.getCell(rowNumber, 11));

  items.push({
    id,
    sourceRow: rowNumber,
    categoryId: category.id,
    name,
    description: normalizedText(worksheet.getCell(rowNumber, 4)) || null,
    officialUrl: officialUrl || null,
    loginAccount: normalizedText(worksheet.getCell(rowNumber, 6)) || null,
    tokenStatus: normalizedText(worksheet.getCell(rowNumber, 7)) || null,
    isPublished: true,
    rating: Number.isFinite(ratingNumber) && ratingNumber >= 1 && ratingNumber <= 10 ? ratingNumber : null,
    financing: normalizedText(worksheet.getCell(rowNumber, 9)) || null,
    tutorial: tutorialOf(worksheet.getCell(rowNumber, 10)) || null,
    isPublic: !/私密|不公开|否/.test(publicText),
    rowColor: rowColorOf(worksheet.getCell(rowNumber, 3)),
    sortOrder
  });
}

const sourceData = {
  source: {
    spreadsheetId: "18i-vrpwprwYvRsUIbuJKsiNRCwTuwbtXMokZlili9UM",
    worksheet: worksheet.name,
    bottomRow: worksheet.rowCount,
    importedAt: "2026-08-11T09:00:00.000Z",
    validItemCount: items.length,
    categoryCount: categories.length,
    inferredRows,
    skippedRows
  },
  categories: categories.map(({ sourceName: _sourceName, ...category }) => category),
  items
};

if (items.length !== 162 || categories.length !== 13) {
  throw new Error(`Expected 162 items in 13 categories, found ${items.length} items in ${categories.length} categories`);
}

const categoryValues = categories.map((category) =>
  `  (${sqlString(category.id)}, ${sqlString(category.name)}, ${sqlString(category.description)}, ${sqlString(category.color)}, ${category.sortOrder}, ${sqlBoolean(category.isPublic)}, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
).join(",\n");

const itemValues = items.map((item) =>
  `  (${sqlString(item.id)}, ${sqlString(item.categoryId)}, ${sqlString(item.name)}, ${sqlString(item.description)}, ${sqlString(item.officialUrl)}, ${sqlString(item.loginAccount)}, TRUE, ${item.rating ?? "NULL"}, ${sqlString(item.financing)}, ${sqlString(item.tutorial)}, ${sqlBoolean(item.isPublic)}, ${sqlString(item.rowColor)}, ${item.sortOrder}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
).join(",\n");

const tokenValues = items.filter((item) => item.tokenStatus).map((item) =>
  `  (${sqlString(`toolbox-token-r${item.sourceRow}`)}, ${sqlString(item.id)}, 'toolbox-col-token-status', ${sqlString(JSON.stringify(item.tokenStatus))}::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
).join(",\n");

const migration = `-- Full import from the shared Google Sheet. Generated by scripts/import-toolbox-google-sheet.mjs.
INSERT INTO "toolbox_categories" ("id", "name", "description", "color", "sortOrder", "isPublic", "isCollapsed", "createdAt", "updatedAt") VALUES
${categoryValues}
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "color" = EXCLUDED."color",
  "sortOrder" = EXCLUDED."sortOrder",
  "isPublic" = EXCLUDED."isPublic",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "toolbox_columns" ("id", "key", "title", "type", "width", "sortOrder", "isSystem", "isVisible", "isPublic", "isSensitive", "isEditable", "isRequired", "options", "createdAt", "updatedAt") VALUES
  ('toolbox-col-token-status', 'tokenStatus', '是否发币', 'select', 120, 65, FALSE, TRUE, TRUE, FALSE, TRUE, FALSE, '["未发币","已发币"]'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET
  "title" = EXCLUDED."title",
  "type" = EXCLUDED."type",
  "width" = EXCLUDED."width",
  "sortOrder" = EXCLUDED."sortOrder",
  "isVisible" = TRUE,
  "isPublic" = TRUE,
  "isSensitive" = FALSE,
  "isEditable" = TRUE,
  "options" = EXCLUDED."options",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "toolbox_items" ("id", "categoryId", "name", "description", "officialUrl", "loginAccount", "isPublished", "rating", "financing", "tutorial", "isPublic", "rowColor", "sortOrder", "createdAt", "updatedAt") VALUES
${itemValues}
ON CONFLICT ("id") DO UPDATE SET
  "categoryId" = EXCLUDED."categoryId",
  "name" = EXCLUDED."name",
  "description" = COALESCE(NULLIF(EXCLUDED."description", ''), "toolbox_items"."description"),
  "officialUrl" = EXCLUDED."officialUrl",
  "loginAccount" = EXCLUDED."loginAccount",
  "isPublished" = TRUE,
  "rating" = EXCLUDED."rating",
  "financing" = EXCLUDED."financing",
  "tutorial" = EXCLUDED."tutorial",
  "isPublic" = EXCLUDED."isPublic",
  "rowColor" = EXCLUDED."rowColor",
  "sortOrder" = EXCLUDED."sortOrder",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "toolbox_cell_values" ("id", "itemId", "columnId", "value", "createdAt", "updatedAt") VALUES
${tokenValues}
ON CONFLICT ("itemId", "columnId") DO UPDATE SET
  "value" = EXCLUDED."value",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "audit_logs" ("id", "action", "targetType", "targetId", "metadata", "createdAt") VALUES
  ('toolbox-full-import-20260811', 'toolbox.full_sheet_import', 'toolbox.import', '18i-vrpwprwYvRsUIbuJKsiNRCwTuwbtXMokZlili9UM', '{"categories":13,"items":162,"inferredRows":1,"skippedEmptyRows":4}'::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
`;

await fs.mkdir(path.dirname(dataPath), { recursive: true });
await fs.mkdir(migrationDirectory, { recursive: true });
await fs.writeFile(dataPath, `${JSON.stringify(sourceData, null, 2)}\n`, "utf8");
await fs.writeFile(migrationPath, migration, "utf8");

console.log(JSON.stringify({ dataPath, migrationPath, categories: categories.length, items: items.length, inferredRows, skippedRows }, null, 2));
