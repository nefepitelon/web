export type ToolboxRole = "viewer" | "operator" | "admin";

export type ToolboxColumnType =
  | "text"
  | "url"
  | "url_text"
  | "number"
  | "rating"
  | "boolean"
  | "select"
  | "date"
  | "category";

export type ToolboxCategoryDto = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  sortOrder: number;
  isPublic: boolean;
  isCollapsed: boolean;
  itemCount: number;
};

export type ToolboxColumnDto = {
  id: string;
  key: string;
  title: string;
  type: ToolboxColumnType;
  width: number;
  sortOrder: number;
  isSystem: boolean;
  isVisible: boolean;
  isPublic: boolean;
  isSensitive: boolean;
  isEditable: boolean;
  isRequired: boolean;
  options: string[];
};

export type ToolboxItemDto = {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  officialUrl: string;
  loginAccount: string;
  isPublished: boolean;
  rating: number | null;
  financing: string;
  tutorial: string;
  isPublic: boolean;
  rowColor: "none" | "green" | "yellow" | "red" | "gray";
  sortOrder: number;
  values: Record<string, unknown>;
  isFavorite: boolean;
  updatedAt: string;
};

export type ToolboxSettings = {
  showActions: boolean;
  operatorCanCreate: boolean;
  operatorCanDelete: boolean;
  operatorCanBulk: boolean;
};

export type ToolboxAuditDto = {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  actor: string;
  createdAt: string;
  metadata: Record<string, unknown> | null;
};

export type ToolboxSnapshot = {
  role: ToolboxRole;
  viewerId: string | null;
  categories: ToolboxCategoryDto[];
  columns: ToolboxColumnDto[];
  items: ToolboxItemDto[];
  settings: ToolboxSettings;
  auditLogs: ToolboxAuditDto[];
};

export const coreToolboxKeys = [
  "category",
  "sortOrder",
  "name",
  "description",
  "officialUrl",
  "loginAccount",
  "isPublished",
  "rating",
  "financing",
  "tutorial",
  "isPublic"
] as const;

export const defaultToolboxSettings: ToolboxSettings = {
  showActions: true,
  operatorCanCreate: true,
  operatorCanDelete: false,
  operatorCanBulk: true
};
