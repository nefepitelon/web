import ExcelJS from "exceljs";
import { writeAudit } from "@/lib/audit";
import { getViewer } from "@/lib/membership";
import { isDatabaseConfigured } from "@/lib/prisma";
import { canManageToolbox, getToolboxSnapshot } from "@/lib/toolbox";
import { hasEntitlement } from "@/lib/entitlements";

export const dynamic = "force-dynamic";

function displayValue(value: unknown, type: string) {
  if (value === null || value === undefined) return "";
  if (type === "boolean") return value ? "是" : "否";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!hasEntitlement(viewer, "toolbox.export")) {
    return Response.json({ error: "Pro、Max 或管理员账户可以导出百宝箱数据" }, { status: viewer ? 403 : 401 });
  }
  const snapshot = await getToolboxSnapshot(viewer);
  const searchParams = new URL(request.url).searchParams;
  const template = searchParams.get("template") === "1";
  const requestedIds = new Set((searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 500));
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "welinkBTC 百宝箱";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(template ? "导入模板" : "百宝箱工具", {
    views: [{ state: "frozen", ySplit: 1, xSplit: 3 }]
  });
  sheet.columns = snapshot.columns.map((column) => ({
    header: column.title,
    key: column.key,
    width: Math.max(10, Math.round(column.width / 7.5))
  }));

  const categoryNames = new Map(snapshot.categories.map((category) => [category.id, category.name]));
  const rows = template
    ? [{
        category: snapshot.categories[0]?.name ?? "SocialFi 社交类",
        sortOrder: 1,
        name: "示例工具",
        description: "填写工具简介",
        officialUrl: "https://example.com",
        loginAccount: "管理员可见",
        isPublished: "是",
        rating: 8,
        financing: "未公布",
        tutorial: "教程链接或文字",
        isPublic: "是"
      }]
    : snapshot.items.filter((item) => !requestedIds.size || requestedIds.has(item.id)).map((item) => Object.fromEntries(snapshot.columns.map((column) => {
        const value = column.key === "category" ? categoryNames.get(item.categoryId) : item.values[column.key];
        return [column.key, displayValue(value, column.type)];
      })));
  sheet.addRows(rows);

  const header = sheet.getRow(1);
  header.height = 28;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F8F55" } };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = { bottom: { style: "thin", color: { argb: "FF1F6F41" } } };
  });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: Math.max(1, snapshot.columns.length) } };
  for (let index = 2; index <= sheet.rowCount; index += 1) {
    const row = sheet.getRow(index);
    row.height = 24;
    row.alignment = { vertical: "middle" };
    if (index % 2 === 0) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F8F5" } };
  }

  const output = await workbook.xlsx.writeBuffer();
  const filename = template ? "welinkbtc-toolbox-template.xlsx" : `welinkbtc-toolbox-${new Date().toISOString().slice(0, 10)}.xlsx`;
  if (viewer && canManageToolbox(viewer) && isDatabaseConfigured()) {
    await writeAudit({
      actorUserId: viewer.id,
      action: template ? "toolbox.excel.template_downloaded" : "toolbox.excel.exported",
      targetType: "toolbox_export",
      metadata: { rowCount: template ? 1 : rows.length, filtered: requestedIds.size > 0 },
      request
    });
  }
  return new Response(output as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store"
    }
  });
}
