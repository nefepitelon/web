import "server-only";

import type { Prisma } from "@prisma/client";
import type { Viewer } from "@/lib/membership";
import { isDatabaseConfigured, prisma } from "@/lib/prisma";
import toolboxSheetData from "@/data/toolbox-enriched-data.json";
import {
  defaultToolboxSettings,
  type ToolboxCategoryDto,
  type ToolboxColumnDto,
  type ToolboxColumnType,
  type ToolboxItemDto,
  type ToolboxRole,
  type ToolboxSettings,
  type ToolboxSnapshot
} from "@/lib/toolbox-types";

export function toolboxRole(viewer: Viewer | null): ToolboxRole {
  if (viewer?.role === "admin") return "admin";
  if (viewer?.role === "operator" || viewer?.roles.includes("operator")) return "operator";
  return "viewer";
}

export function canManageToolbox(viewer: Viewer | null) {
  return toolboxRole(viewer) !== "viewer";
}

function stringOptions(value: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function settingsFrom(value: Prisma.JsonValue | null | undefined): ToolboxSettings {
  if (!value || Array.isArray(value) || typeof value !== "object") return defaultToolboxSettings;
  return {
    showActions: typeof value.showActions === "boolean" ? value.showActions : true,
    operatorCanCreate: typeof value.operatorCanCreate === "boolean" ? value.operatorCanCreate : true,
    operatorCanDelete: typeof value.operatorCanDelete === "boolean" ? value.operatorCanDelete : false,
    operatorCanBulk: typeof value.operatorCanBulk === "boolean" ? value.operatorCanBulk : true
  };
}

export async function getToolboxSnapshot(viewer: Viewer | null): Promise<ToolboxSnapshot> {
  if (!isDatabaseConfigured()) return mockToolboxSnapshot(toolboxRole(viewer), viewer?.id ?? null);

  const role = toolboxRole(viewer);
  const manager = role !== "viewer";
  const [categories, columns, items, settingsRecord, auditLogs] = await Promise.all([
    prisma.toolboxCategory.findMany({
      where: manager ? undefined : { isPublic: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    }),
    prisma.toolboxColumn.findMany({
      where: manager
        ? { isVisible: true }
        : { isVisible: true, isPublic: true, isSensitive: false },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    }),
    prisma.toolboxItem.findMany({
      where: manager
        ? undefined
        : { isPublic: true, isPublished: true, category: { isPublic: true } },
      include: {
        cells: { include: { column: { select: { key: true } } } },
        favorites: viewer ? { where: { userId: viewer.id }, select: { id: true } } : false
      },
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }]
    }),
    prisma.systemSetting.findUnique({ where: { key: "toolbox.settings" }, select: { value: true } }),
    manager
      ? prisma.auditLog.findMany({
          where: { targetType: { startsWith: "toolbox" } },
          include: { actor: { select: { email: true } } },
          orderBy: { createdAt: "desc" },
          take: 80
        })
      : Promise.resolve([])
  ]);

  const itemCounts = new Map<string, number>();
  for (const item of items) itemCounts.set(item.categoryId, (itemCounts.get(item.categoryId) ?? 0) + 1);

  return {
    role,
    viewerId: viewer?.id ?? null,
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description,
      color: category.color,
      sortOrder: category.sortOrder,
      isPublic: category.isPublic,
      isCollapsed: category.isCollapsed,
      itemCount: itemCounts.get(category.id) ?? 0
    })),
    columns: columns.map((column) => ({
      id: column.id,
      key: column.key,
      title: column.title,
      type: column.type as ToolboxColumnType,
      width: column.width,
      sortOrder: column.sortOrder,
      isSystem: column.isSystem,
      isVisible: column.isVisible,
      isPublic: column.isPublic,
      isSensitive: column.isSensitive,
      isEditable: column.isEditable,
      isRequired: column.isRequired,
      options: stringOptions(column.options)
    })),
    items: (viewer ? items : items.slice(0, 8)).map((item) => {
      const dynamicValues = Object.fromEntries(item.cells.map((cell) => [cell.column.key, cell.value]));
      const values: Record<string, unknown> = {
        category: item.categoryId,
        sortOrder: item.sortOrder,
        name: item.name,
        description: item.description ?? "",
        officialUrl: item.officialUrl ?? "",
        loginAccount: item.loginAccount ?? "",
        isPublished: item.isPublished,
        rating: item.rating,
        financing: item.financing ?? "",
        tutorial: item.tutorial ?? "",
        isPublic: item.isPublic,
        ...dynamicValues
      };
      return {
        id: item.id,
        categoryId: item.categoryId,
        name: item.name,
        description: item.description ?? "",
        officialUrl: item.officialUrl ?? "",
        loginAccount: item.loginAccount ?? "",
        isPublished: item.isPublished,
        rating: item.rating,
        financing: item.financing ?? "",
        tutorial: item.tutorial ?? "",
        isPublic: item.isPublic,
        rowColor: item.rowColor as ToolboxItemDto["rowColor"],
        sortOrder: item.sortOrder,
        values,
        isFavorite: Boolean("favorites" in item && item.favorites.length),
        updatedAt: item.updatedAt.toISOString()
      };
    }),
    settings: settingsFrom(settingsRecord?.value),
    auditLogs: auditLogs.map((log) => ({
      id: log.id,
      action: log.action,
      targetType: log.targetType,
      targetId: log.targetId,
      actor: log.actor?.email ?? "system",
      createdAt: log.createdAt.toISOString(),
      metadata:
        log.metadata && !Array.isArray(log.metadata) && typeof log.metadata === "object"
          ? (log.metadata as Record<string, unknown>)
          : null
    }))
  };
}

const mockColumns: ToolboxColumnDto[] = [
  ["category", "分类", "category", 170, true, false],
  ["sortOrder", "序号", "number", 76, true, false],
  ["name", "名称", "text", 190, true, false],
  ["description", "简要描述", "text", 260, true, false],
  ["officialUrl", "官网链接", "url", 250, true, false],
  ["loginAccount", "登录账号", "text", 210, false, true],
  ["isPublished", "是否发布", "boolean", 116, false, false],
  ["rating", "评分", "rating", 100, true, false],
  ["financing", "融资", "text", 140, true, false],
  ["tutorial", "空投交互教程", "url_text", 220, true, false],
  ["isPublic", "是否公开", "boolean", 116, false, false]
].map(([key, title, type, width, isPublic, isSensitive], index) => ({
  id: `mock-column-${String(key)}`,
  key: String(key),
  title: String(title),
  type: type as ToolboxColumnType,
  width: Number(width),
  sortOrder: (index + 1) * 10,
  isSystem: true,
  isVisible: true,
  isPublic: Boolean(isPublic),
  isSensitive: Boolean(isSensitive),
  isEditable: !["category", "sortOrder"].includes(String(key)),
  isRequired: ["category", "sortOrder", "name"].includes(String(key)),
  options: []
}));

mockColumns.push({
  id: "mock-column-officialTwitter",
  key: "officialTwitter",
  title: "官方推特",
  type: "text",
  width: 150,
  sortOrder: 45,
  isSystem: false,
  isVisible: true,
  isPublic: true,
  isSensitive: false,
  isEditable: true,
  isRequired: false,
  options: []
});
mockColumns.push({
  id: "mock-column-tokenStatus",
  key: "tokenStatus",
  title: "是否发币",
  type: "select",
  width: 120,
  sortOrder: 65,
  isSystem: false,
  isVisible: true,
  isPublic: true,
  isSensitive: false,
  isEditable: true,
  isRequired: false,
  options: ["未发币", "已发币"]
});
mockColumns.sort((left, right) => left.sortOrder - right.sortOrder);

const mockCategories: ToolboxCategoryDto[] = toolboxSheetData.categories.map((category) => ({
  ...category,
  isCollapsed: false,
  itemCount: toolboxSheetData.items.filter((item) => item.categoryId === category.id).length
}));

function mockToolboxSnapshot(role: ToolboxRole, viewerId: string | null): ToolboxSnapshot {
  const allItems: ToolboxItemDto[] = toolboxSheetData.items.map((item) => {
    const values = {
      category: item.categoryId,
      sortOrder: item.sortOrder,
      name: item.name,
      description: item.description ?? "",
      officialTwitter: item.officialTwitter ?? "未发现官方 X",
      officialUrl: item.officialUrl ?? "",
      loginAccount: item.loginAccount ?? "",
      tokenStatus: item.tokenStatus ?? "",
      isPublished: item.isPublished,
      rating: item.rating,
      financing: item.financing ?? "",
      tutorial: item.tutorial ?? "",
      isPublic: item.isPublic
    };
    return {
      id: item.id,
      categoryId: item.categoryId,
      name: item.name,
      description: item.description ?? "",
      officialUrl: item.officialUrl ?? "",
      loginAccount: item.loginAccount ?? "",
      isPublished: item.isPublished,
      rating: item.rating,
      financing: item.financing ?? "",
      tutorial: item.tutorial ?? "",
      isPublic: item.isPublic,
      rowColor: item.rowColor as ToolboxItemDto["rowColor"],
      sortOrder: item.sortOrder,
      values,
      isFavorite: false,
      updatedAt: toolboxSheetData.source.enrichedAt
    };
  });
  return {
    role,
    viewerId,
    categories: mockCategories,
    columns: role === "viewer" ? mockColumns.filter((column) => column.isPublic && !column.isSensitive) : mockColumns,
    items: viewerId ? allItems : allItems.filter((item) => item.isPublic && item.isPublished).slice(0, 8),
    settings: defaultToolboxSettings,
    auditLogs: []
  };
}
