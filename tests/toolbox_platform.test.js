const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("toolbox is placed after AI Ops in the primary navigation", () => {
  const header = read("components/platform-header.tsx");
  assert.ok(header.indexOf('href: "/toolbox"') > header.indexOf('href: "/ai-ops"'));
});

test("toolbox schema supports dynamic columns, favorites, categories and cell values", () => {
  const schema = read("prisma/schema.prisma");
  for (const model of ["ToolboxCategory", "ToolboxItem", "ToolboxColumn", "ToolboxCellValue", "ToolboxFavorite"]) {
    assert.match(schema, new RegExp(`model ${model}`));
  }
  assert.match(schema, /@@unique\(\[itemId, columnId\]\)/);
  assert.match(schema, /isSensitive\s+Boolean/);
});

test("toolbox workbench includes filters, batch tools, views, import, logs and detail drawer", () => {
  const component = read("components/toolbox-workbench.tsx");
  for (const phrase of ["搜索名称、链接、账号或教程", "批量操作已完成", "Excel 导入", "百宝箱操作日志", "分类看板", "加入常用", "表格与列设置"]) {
    assert.ok(component.includes(phrase), `missing ${phrase}`);
  }
  assert.match(component, /action: "setItemPublic"/);
  assert.match(component, /toolbox-inline-visibility/);
});

test("toolbox server API enforces manager and admin boundaries", () => {
  const route = read("app/api/toolbox/route.ts");
  assert.match(route, /if \(!manager\).*403/);
  assert.match(route, /admin && action === "createColumn"/);
  assert.match(route, /operatorCanDelete/);
  assert.match(route, /assertSameOrigin\(request\)/);
});

test("spreadsheet import validates file size, rows, URLs and scores", () => {
  const route = read("app/api/toolbox/import/route.ts");
  assert.match(route, /5 \* 1024 \* 1024/);
  assert.match(route, /评分必须是 1-10 的整数/);
  assert.match(route, /链接需要以 http:\/\/ 或 https:\/\/ 开头/);
  assert.match(route, /\["append", "dedupe", "overwrite"\]/);
});

test("full shared Google Sheet data is normalized without losing valid rows", () => {
  const data = JSON.parse(read("data/toolbox-sheet-data.json"));
  assert.equal(data.source.bottomRow, 182);
  assert.equal(data.source.categoryCount, 13);
  assert.equal(data.source.validItemCount, 162);
  assert.equal(data.categories.length, 13);
  assert.equal(data.items.length, 162);
  assert.equal(new Set(data.items.map((item) => item.id)).size, 162);
  assert.ok(data.items.every((item) => item.name && item.categoryId && item.officialUrl));
  assert.deepEqual(data.source.inferredRows, [
    { row: 150, field: "name", value: "katana 生态", reason: "官网存在但名称单元格为空" }
  ]);
  assert.deepEqual(data.source.skippedRows.map((row) => row.row), [93, 160, 174, 175]);
});

test("full toolbox migration upserts imported rows and preserves token issuance", () => {
  const migration = read("prisma/migrations/20260811170000_import_full_toolbox_sheet/migration.sql");
  assert.match(migration, /toolbox-col-token-status/);
  assert.match(migration, /'tokenStatus', '是否发币'/);
  assert.match(migration, /ON CONFLICT \("id"\) DO UPDATE SET/);
  assert.match(migration, /toolbox\.full_sheet_import/);
  assert.match(migration, /"items":162/);
});

test("all toolbox rows are enriched with official X, descriptions, scores and token status", () => {
  const data = JSON.parse(read("data/toolbox-enriched-data.json"));
  assert.equal(data.categories.length, 13);
  assert.equal(data.items.length, 162);
  assert.ok(data.items.every((item) => item.description.trim().length > 0));
  assert.ok(data.items.every((item) => item.officialTwitter.startsWith("@") || item.officialTwitter === "未发现官方 X"));
  assert.ok(data.items.every((item) => Number.isInteger(item.rating) && item.rating >= 1 && item.rating <= 10));
  assert.ok(data.items.every((item) => ["已发币", "未发币"].includes(item.tokenStatus)));
  assert.equal(data.items.filter((item) => item.officialTwitter.startsWith("@")).length, 156);

  const migration = read("prisma/migrations/20260811190000_enrich_toolbox_metadata/migration.sql");
  assert.match(migration, /'officialTwitter', '官方推特', 'text', 150, 45/);
  assert.match(migration, /toolbox\.metadata_enriched/);
  assert.match(migration, /"items":162/);
});
