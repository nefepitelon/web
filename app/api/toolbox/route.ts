import { Prisma } from "@prisma/client";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requireViewer } from "@/lib/membership";
import { isDatabaseConfigured, prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/request-security";
import { getToolboxSnapshot, toolboxRole } from "@/lib/toolbox";
import { defaultToolboxSettings, type ToolboxSettings } from "@/lib/toolbox-types";

export const dynamic = "force-dynamic";

const idSchema = z.string().trim().min(3).max(191);
const categorySchema = z.object({
  id: idSchema.optional(),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional().default(""),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#4BA3D8"),
  isPublic: z.boolean().default(true)
});
const columnSchema = z.object({
  id: idSchema.optional(),
  key: z.string().trim().regex(/^[a-z][a-zA-Z0-9_]{1,39}$/),
  title: z.string().trim().min(1).max(80),
  type: z.enum(["text", "url", "url_text", "number", "rating", "boolean", "select", "date"]),
  width: z.coerce.number().int().min(72).max(600),
  isVisible: z.boolean(),
  isPublic: z.boolean(),
  isSensitive: z.boolean(),
  isEditable: z.boolean(),
  isRequired: z.boolean(),
  options: z.array(z.string().trim().min(1).max(80)).max(50).default([])
});
const itemSchema = z.object({
  id: idSchema.optional(),
  categoryId: idSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional().default(""),
  officialUrl: z.string().trim().max(2000).optional().default(""),
  loginAccount: z.string().trim().max(1000).optional().default(""),
  isPublished: z.boolean().default(false),
  rating: z.coerce.number().int().min(1).max(10).nullable().optional(),
  financing: z.string().trim().max(200).optional().default(""),
  tutorial: z.string().trim().max(2000).optional().default(""),
  isPublic: z.boolean().default(true),
  rowColor: z.enum(["none", "green", "yellow", "red", "gray"]).default("none"),
  values: z.record(z.string(), z.unknown()).default({})
}).superRefine((value, context) => {
  if (value.officialUrl && !/^https?:\/\//i.test(value.officialUrl)) {
    context.addIssue({ code: "custom", path: ["officialUrl"], message: "官网链接需要以 http:// 或 https:// 开头" });
  }
});

async function toolboxSettings(): Promise<ToolboxSettings> {
  const record = await prisma.systemSetting.findUnique({ where: { key: "toolbox.settings" }, select: { value: true } });
  const value = record?.value;
  if (!value || Array.isArray(value) || typeof value !== "object") return defaultToolboxSettings;
  return {
    showActions: typeof value.showActions === "boolean" ? value.showActions : true,
    operatorCanCreate: typeof value.operatorCanCreate === "boolean" ? value.operatorCanCreate : true,
    operatorCanDelete: typeof value.operatorCanDelete === "boolean" ? value.operatorCanDelete : false,
    operatorCanBulk: typeof value.operatorCanBulk === "boolean" ? value.operatorCanBulk : true
  };
}

function jsonValue(value: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (value === undefined || value === null || value === "") return Prisma.JsonNull;
  if (["string", "number", "boolean"].includes(typeof value)) return value as string | number | boolean;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function saveDynamicCells(itemId: string, values: Record<string, unknown>) {
  const columns = await prisma.toolboxColumn.findMany({
    where: { key: { in: Object.keys(values) }, isSystem: false },
    select: { id: true, key: true }
  });
  if (!columns.length) return;
  await prisma.$transaction(columns.map((column) => prisma.toolboxCellValue.upsert({
    where: { itemId_columnId: { itemId, columnId: column.id } },
    update: { value: jsonValue(values[column.key]) },
    create: { itemId, columnId: column.id, value: jsonValue(values[column.key]) }
  })));
}

async function nextItemOrder(categoryId: string) {
  const aggregate = await prisma.toolboxItem.aggregate({ where: { categoryId }, _max: { sortOrder: true } });
  return (aggregate._max.sortOrder ?? 0) + 1;
}

async function swapOrder(model: "category" | "item", id: string, direction: "up" | "down") {
  if (model === "category") {
    const current = await prisma.toolboxCategory.findUniqueOrThrow({ where: { id } });
    const neighbor = await prisma.toolboxCategory.findFirst({
      where: direction === "up" ? { sortOrder: { lt: current.sortOrder } } : { sortOrder: { gt: current.sortOrder } },
      orderBy: { sortOrder: direction === "up" ? "desc" : "asc" }
    });
    if (neighbor) await prisma.$transaction([
      prisma.toolboxCategory.update({ where: { id: current.id }, data: { sortOrder: neighbor.sortOrder } }),
      prisma.toolboxCategory.update({ where: { id: neighbor.id }, data: { sortOrder: current.sortOrder } })
    ]);
    return;
  }
  const current = await prisma.toolboxItem.findUniqueOrThrow({ where: { id } });
  const neighbor = await prisma.toolboxItem.findFirst({
    where: {
      categoryId: current.categoryId,
      ...(direction === "up" ? { sortOrder: { lt: current.sortOrder } } : { sortOrder: { gt: current.sortOrder } })
    },
    orderBy: { sortOrder: direction === "up" ? "desc" : "asc" }
  });
  if (neighbor) await prisma.$transaction([
    prisma.toolboxItem.update({ where: { id: current.id }, data: { sortOrder: neighbor.sortOrder } }),
    prisma.toolboxItem.update({ where: { id: neighbor.id }, data: { sortOrder: current.sortOrder } })
  ]);
}

export async function GET() {
  const viewer = await import("@/lib/membership").then(({ getViewer }) => getViewer());
  return Response.json(await getToolboxSnapshot(viewer), { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  assertSameOrigin(request);
  if (!isDatabaseConfigured()) return Response.json({ error: "本地预览未连接数据库" }, { status: 503 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = String(body?.action ?? "");
  const viewer = await requireViewer("/toolbox");
  const role = toolboxRole(viewer);
  const settings = await toolboxSettings();
  const manager = role === "admin" || role === "operator";
  const admin = role === "admin";

  if (action === "toggleFavorite") {
    const itemId = idSchema.parse(body?.itemId);
    const existing = await prisma.toolboxFavorite.findUnique({ where: { userId_itemId: { userId: viewer.id, itemId } } });
    if (existing) await prisma.toolboxFavorite.delete({ where: { id: existing.id } });
    else await prisma.toolboxFavorite.create({ data: { userId: viewer.id, itemId } });
    return Response.json(await getToolboxSnapshot(viewer));
  }

  if (!manager) return Response.json({ error: "没有百宝箱维护权限" }, { status: 403 });

  let targetId: string | null = null;
  let auditAction = `toolbox.${action}`;
  let metadata: Record<string, unknown> = {};

  if (action === "createItem") {
    if (role === "operator" && !settings.operatorCanCreate) return Response.json({ error: "操作员新增权限已关闭" }, { status: 403 });
    const input = itemSchema.parse(body?.item);
    const item = await prisma.toolboxItem.create({ data: {
      categoryId: input.categoryId,
      name: input.name,
      description: input.description || null,
      officialUrl: input.officialUrl || null,
      loginAccount: input.loginAccount || null,
      isPublished: input.isPublished,
      rating: input.rating ?? null,
      financing: input.financing || null,
      tutorial: input.tutorial || null,
      isPublic: input.isPublic,
      rowColor: input.rowColor,
      sortOrder: await nextItemOrder(input.categoryId),
      createdBy: viewer.id,
      updatedBy: viewer.id
    } });
    await saveDynamicCells(item.id, input.values);
    targetId = item.id;
    metadata = { name: item.name, categoryId: item.categoryId };
  } else if (action === "updateItem") {
    const input = itemSchema.parse(body?.item);
    if (!input.id) throw new Error("Missing item id");
    const before = await prisma.toolboxItem.findUniqueOrThrow({ where: { id: input.id } });
    const categoryChanged = before.categoryId !== input.categoryId;
    const item = await prisma.toolboxItem.update({ where: { id: input.id }, data: {
      categoryId: input.categoryId,
      name: input.name,
      description: input.description || null,
      officialUrl: input.officialUrl || null,
      loginAccount: input.loginAccount || null,
      isPublished: input.isPublished,
      rating: input.rating ?? null,
      financing: input.financing || null,
      tutorial: input.tutorial || null,
      isPublic: input.isPublic,
      rowColor: input.rowColor,
      sortOrder: categoryChanged ? await nextItemOrder(input.categoryId) : before.sortOrder,
      updatedBy: viewer.id
    } });
    await saveDynamicCells(item.id, input.values);
    targetId = item.id;
    metadata = { name: item.name, before: { categoryId: before.categoryId, isPublic: before.isPublic, isPublished: before.isPublished }, after: { categoryId: item.categoryId, isPublic: item.isPublic, isPublished: item.isPublished } };
  } else if (action === "setItemPublic") {
    const itemId = idSchema.parse(body?.itemId);
    const isPublic = z.boolean().parse(body?.isPublic);
    const before = await prisma.toolboxItem.findUniqueOrThrow({ where: { id: itemId }, select: { id: true, name: true, isPublic: true } });
    await prisma.toolboxItem.update({ where: { id: itemId }, data: { isPublic, updatedBy: viewer.id } });
    targetId = itemId;
    auditAction = "toolbox.item.visibility_updated";
    metadata = { name: before.name, before: before.isPublic, after: isPublic };
  } else if (action === "deleteItem") {
    if (role === "operator" && !settings.operatorCanDelete) return Response.json({ error: "操作员删除权限已关闭" }, { status: 403 });
    const itemId = idSchema.parse(body?.itemId);
    const item = await prisma.toolboxItem.delete({ where: { id: itemId } });
    targetId = item.id;
    metadata = { name: item.name };
  } else if (action === "moveItem") {
    const itemId = idSchema.parse(body?.itemId);
    const direction = z.enum(["up", "down"]).parse(body?.direction);
    await swapOrder("item", itemId, direction);
    targetId = itemId;
    metadata = { direction };
  } else if (action === "bulkUpdate") {
    if (role === "operator" && !settings.operatorCanBulk) return Response.json({ error: "操作员批量权限已关闭" }, { status: 403 });
    const itemIds = z.array(idSchema).min(1).max(200).parse(body?.itemIds);
    const operation = z.enum(["publish", "unpublish", "public", "private", "move", "delete"]).parse(body?.operation);
    if (operation === "delete" && role === "operator" && !settings.operatorCanDelete) return Response.json({ error: "操作员删除权限已关闭" }, { status: 403 });
    if (operation === "delete") await prisma.toolboxItem.deleteMany({ where: { id: { in: itemIds } } });
    else if (operation === "move") {
      const categoryId = idSchema.parse(body?.categoryId);
      let order = await nextItemOrder(categoryId);
      await prisma.$transaction(itemIds.map((id) => prisma.toolboxItem.update({ where: { id }, data: { categoryId, sortOrder: order++, updatedBy: viewer.id } })));
      metadata = { operation, count: itemIds.length, categoryId };
    } else {
      const data = operation === "publish" ? { isPublished: true } : operation === "unpublish" ? { isPublished: false } : operation === "public" ? { isPublic: true } : { isPublic: false };
      await prisma.toolboxItem.updateMany({ where: { id: { in: itemIds } }, data: { ...data, updatedBy: viewer.id } });
      metadata = { operation, count: itemIds.length };
    }
    auditAction = "toolbox.items.bulk_updated";
  } else if (action === "toggleCategory") {
    const categoryId = idSchema.parse(body?.categoryId);
    const collapsed = z.boolean().parse(body?.collapsed);
    await prisma.toolboxCategory.update({ where: { id: categoryId }, data: { isCollapsed: collapsed } });
    targetId = categoryId;
    metadata = { collapsed };
  } else if (admin && action === "createCategory") {
    const input = categorySchema.parse(body?.category);
    const aggregate = await prisma.toolboxCategory.aggregate({ _max: { sortOrder: true } });
    const category = await prisma.toolboxCategory.create({ data: { ...input, description: input.description || null, sortOrder: (aggregate._max.sortOrder ?? 0) + 10 } });
    targetId = category.id;
    metadata = { name: category.name };
  } else if (admin && action === "updateCategory") {
    const input = categorySchema.parse(body?.category);
    if (!input.id) throw new Error("Missing category id");
    const category = await prisma.toolboxCategory.update({ where: { id: input.id }, data: { name: input.name, description: input.description || null, color: input.color, isPublic: input.isPublic } });
    targetId = category.id;
    metadata = { name: category.name, isPublic: category.isPublic };
  } else if (admin && action === "deleteCategory") {
    const categoryId = idSchema.parse(body?.categoryId);
    const category = await prisma.toolboxCategory.delete({ where: { id: categoryId } });
    targetId = category.id;
    metadata = { name: category.name };
  } else if (admin && action === "moveCategory") {
    const categoryId = idSchema.parse(body?.categoryId);
    const direction = z.enum(["up", "down"]).parse(body?.direction);
    await swapOrder("category", categoryId, direction);
    targetId = categoryId;
    metadata = { direction };
  } else if (admin && action === "createColumn") {
    const input = columnSchema.parse(body?.column);
    const aggregate = await prisma.toolboxColumn.aggregate({ _max: { sortOrder: true } });
    const column = await prisma.toolboxColumn.create({ data: { ...input, options: input.options, isSystem: false, sortOrder: (aggregate._max.sortOrder ?? 0) + 10 } });
    targetId = column.id;
    metadata = { key: column.key, title: column.title };
  } else if (admin && action === "updateColumn") {
    const input = columnSchema.parse(body?.column);
    if (!input.id) throw new Error("Missing column id");
    const current = await prisma.toolboxColumn.findUniqueOrThrow({ where: { id: input.id } });
    const column = await prisma.toolboxColumn.update({ where: { id: input.id }, data: {
      key: current.isSystem ? current.key : input.key,
      title: input.title,
      type: current.isSystem ? current.type : input.type,
      width: input.width,
      isVisible: input.isVisible,
      isPublic: input.isSensitive ? false : input.isPublic,
      isSensitive: input.isSensitive,
      isEditable: input.isEditable,
      isRequired: input.isRequired,
      options: input.options
    } });
    targetId = column.id;
    metadata = { key: column.key, title: column.title };
  } else if (admin && action === "deleteColumn") {
    const columnId = idSchema.parse(body?.columnId);
    const column = await prisma.toolboxColumn.findUniqueOrThrow({ where: { id: columnId } });
    if (column.isSystem) return Response.json({ error: "系统列不能删除" }, { status: 400 });
    await prisma.toolboxColumn.delete({ where: { id: columnId } });
    targetId = columnId;
    metadata = { key: column.key, title: column.title };
  } else if (admin && action === "moveColumn") {
    const columnId = idSchema.parse(body?.columnId);
    const direction = z.enum(["up", "down"]).parse(body?.direction);
    const current = await prisma.toolboxColumn.findUniqueOrThrow({ where: { id: columnId } });
    const neighbor = await prisma.toolboxColumn.findFirst({ where: direction === "up" ? { sortOrder: { lt: current.sortOrder } } : { sortOrder: { gt: current.sortOrder } }, orderBy: { sortOrder: direction === "up" ? "desc" : "asc" } });
    if (neighbor) await prisma.$transaction([
      prisma.toolboxColumn.update({ where: { id: current.id }, data: { sortOrder: neighbor.sortOrder } }),
      prisma.toolboxColumn.update({ where: { id: neighbor.id }, data: { sortOrder: current.sortOrder } })
    ]);
    targetId = columnId;
    metadata = { direction };
  } else if (admin && action === "updateSettings") {
    const input = z.object({ showActions: z.boolean(), operatorCanCreate: z.boolean(), operatorCanDelete: z.boolean(), operatorCanBulk: z.boolean() }).parse(body?.settings);
    await prisma.systemSetting.upsert({ where: { key: "toolbox.settings" }, update: { value: input, updatedBy: viewer.id }, create: { key: "toolbox.settings", value: input, updatedBy: viewer.id, description: "百宝箱操作列与操作员权限" } });
    targetId = "toolbox.settings";
    metadata = input;
  } else {
    return Response.json({ error: admin ? "未知操作" : "该操作仅限系统管理员" }, { status: admin ? 400 : 403 });
  }

  await writeAudit({ actorUserId: viewer.id, action: auditAction, targetType: action.includes("Column") ? "toolbox_column" : action.includes("Category") ? "toolbox_category" : action.includes("Settings") ? "toolbox_setting" : "toolbox_item", targetId, metadata, request });
  return Response.json(await getToolboxSnapshot(viewer));
}
