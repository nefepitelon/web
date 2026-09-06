import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/request-security";
import { getToolboxSnapshot } from "@/lib/toolbox";

export const dynamic = "force-dynamic";

type ParsedRow = { rowNumber: number; values: Record<string, unknown> };

function textValue(value: ExcelJS.CellValue | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if ("text" in value && typeof value.text === "string") return value.text.trim();
  if ("richText" in value && Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("").trim();
  if ("result" in value && value.result !== undefined) return String(value.result).trim();
  return String(value).trim();
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') { current += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) { cells.push(current.trim()); current = ""; }
    else current += character;
  }
  cells.push(current.trim());
  return cells;
}

async function readRows(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  if (file.name.toLowerCase().endsWith(".csv")) {
    const lines = Buffer.from(arrayBuffer).toString("utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
    return lines.map(parseCsvLine);
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    rows.push(Array.from({ length: Math.max(0, row.cellCount) }, (_, index) => textValue(row.getCell(index + 1).value)));
  });
  return rows;
}

function booleanValue(value: unknown, fallback: boolean) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["是", "true", "1", "公开", "已发布", "yes"].includes(normalized)) return true;
  if (["否", "false", "0", "私密", "未发布", "no"].includes(normalized)) return false;
  return fallback;
}

function jsonValue(value: unknown) {
  if (value === "" || value === undefined || value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

export async function POST(request: Request) {
  assertSameOrigin(request);
  const admin = await requireAdmin("/toolbox");
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return Response.json({ error: "请选择 Excel 或 CSV 文件" }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return Response.json({ error: "文件不能超过 5MB" }, { status: 400 });
  if (!/\.(xlsx|csv)$/i.test(file.name)) return Response.json({ error: "仅支持 .xlsx 或 .csv 文件" }, { status: 400 });

  const rawRows = await readRows(file);
  if (rawRows.length < 2) return Response.json({ error: "表格中没有可导入的数据行" }, { status: 400 });
  const columns = await prisma.toolboxColumn.findMany({ orderBy: { sortOrder: "asc" } });
  const aliases: Record<string, string> = {
    分类: "category", 序号: "sortOrder", 名称: "name", 工具名称: "name", 简要描述: "description", 描述: "description",
    官网链接: "officialUrl", 链接: "officialUrl", 登录账号: "loginAccount", 是否发布: "isPublished", 评分: "rating",
    融资: "financing", 空投交互教程: "tutorial", 教程: "tutorial", 是否公开: "isPublic", 行颜色: "rowColor"
  };
  for (const column of columns) {
    aliases[column.title.trim().toLowerCase()] = column.key;
    aliases[column.key.toLowerCase()] = column.key;
  }
  const headers = rawRows[0].map((value) => value.trim());
  const mappedHeaders = headers.map((value) => aliases[value.toLowerCase()] ?? "");
  const unmappedHeaders = headers.filter((_, index) => !mappedHeaders[index]);
  const parsed: ParsedRow[] = [];
  const errors: Array<{ row: number; field: string; message: string }> = [];

  rawRows.slice(1).forEach((row, rowIndex) => {
    const values: Record<string, unknown> = {};
    mappedHeaders.forEach((key, columnIndex) => { if (key) values[key] = row[columnIndex] ?? ""; });
    const rowNumber = rowIndex + 2;
    if (!String(values.name ?? "").trim()) errors.push({ row: rowNumber, field: "名称", message: "名称不能为空" });
    if (!String(values.category ?? "").trim()) errors.push({ row: rowNumber, field: "分类", message: "分类不能为空" });
    const rating = values.rating ? Number(values.rating) : null;
    if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 10)) errors.push({ row: rowNumber, field: "评分", message: "评分必须是 1-10 的整数" });
    const officialUrl = String(values.officialUrl ?? "").trim();
    if (officialUrl && !/^https?:\/\//i.test(officialUrl)) errors.push({ row: rowNumber, field: "官网链接", message: "链接需要以 http:// 或 https:// 开头" });
    parsed.push({ rowNumber, values });
  });

  const preview = String(formData.get("preview") ?? "1") !== "0";
  if (preview) {
    return Response.json({
      fileName: file.name,
      headers,
      mappedHeaders,
      unmappedHeaders,
      totalRows: parsed.length,
      previewRows: parsed.slice(0, 8),
      errors
    });
  }

  if (errors.length) return Response.json({ error: "请先修复导入错误", errors }, { status: 422 });
  const mode = String(formData.get("mode") ?? "dedupe");
  if (!["append", "dedupe", "overwrite"].includes(mode)) return Response.json({ error: "导入模式无效" }, { status: 400 });

  const existingCategories = await prisma.toolboxCategory.findMany();
  const categoryMap = new Map(existingCategories.map((category) => [category.name.toLowerCase(), category]));
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const parsedRow of parsed) {
    const values = parsedRow.values;
    const categoryName = String(values.category).trim();
    let category = categoryMap.get(categoryName.toLowerCase());
    if (!category) {
      const aggregate = await prisma.toolboxCategory.aggregate({ _max: { sortOrder: true } });
      category = await prisma.toolboxCategory.create({ data: { name: categoryName, sortOrder: (aggregate._max.sortOrder ?? 0) + 10 } });
      categoryMap.set(categoryName.toLowerCase(), category);
    }
    const name = String(values.name).trim();
    const existing = await prisma.toolboxItem.findFirst({ where: { categoryId: category.id, name: { equals: name, mode: "insensitive" } } });
    if (existing && mode === "dedupe") { skipped += 1; continue; }
    const itemData = {
      categoryId: category.id,
      name,
      description: String(values.description ?? "").trim() || null,
      officialUrl: String(values.officialUrl ?? "").trim() || null,
      loginAccount: String(values.loginAccount ?? "").trim() || null,
      isPublished: booleanValue(values.isPublished, false),
      rating: values.rating ? Number(values.rating) : null,
      financing: String(values.financing ?? "").trim() || null,
      tutorial: String(values.tutorial ?? "").trim() || null,
      isPublic: booleanValue(values.isPublic, true),
      rowColor: ["green", "yellow", "red", "gray"].includes(String(values.rowColor)) ? String(values.rowColor) : "none",
      updatedBy: admin.id
    };
    let itemId: string;
    if (existing && mode === "overwrite") {
      const item = await prisma.toolboxItem.update({ where: { id: existing.id }, data: itemData });
      itemId = item.id;
      updated += 1;
    } else {
      const aggregate = await prisma.toolboxItem.aggregate({ where: { categoryId: category.id }, _max: { sortOrder: true } });
      const item = await prisma.toolboxItem.create({ data: { ...itemData, sortOrder: (aggregate._max.sortOrder ?? 0) + 1, createdBy: admin.id } });
      itemId = item.id;
      created += 1;
    }
    const dynamicColumns = columns.filter((column) => !column.isSystem && values[column.key] !== undefined);
    if (dynamicColumns.length) await prisma.$transaction(dynamicColumns.map((column) => prisma.toolboxCellValue.upsert({
      where: { itemId_columnId: { itemId, columnId: column.id } },
      update: { value: jsonValue(values[column.key]) },
      create: { itemId, columnId: column.id, value: jsonValue(values[column.key]) }
    })));
  }

  await writeAudit({
    actorUserId: admin.id,
    action: "toolbox.excel.imported",
    targetType: "toolbox_import",
    metadata: { fileName: file.name, mode, total: parsed.length, created, updated, skipped },
    request
  });
  return Response.json({ created, updated, skipped, snapshot: await getToolboxSnapshot(admin) });
}
