"use client";

import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Boxes,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Filter,
  Grid2X2,
  History,
  LayoutList,
  LockKeyhole,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Star,
  Table2,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { FormEvent, Fragment, useEffect, useMemo, useState } from "react";
import type {
  ToolboxCategoryDto,
  ToolboxColumnDto,
  ToolboxColumnType,
  ToolboxItemDto,
  ToolboxSettings,
  ToolboxSnapshot
} from "@/lib/toolbox-types";

type ViewMode = "table" | "cards" | "board";
type ImportPreview = {
  fileName: string;
  headers: string[];
  mappedHeaders: string[];
  unmappedHeaders: string[];
  totalRows: number;
  previewRows: Array<{ rowNumber: number; values: Record<string, unknown> }>;
  errors: Array<{ row: number; field: string; message: string }>;
};

const emptyItem = (categoryId = ""): ToolboxItemDto => ({
  id: "",
  categoryId,
  name: "",
  description: "",
  officialUrl: "",
  loginAccount: "",
  isPublished: false,
  rating: null,
  financing: "",
  tutorial: "",
  isPublic: true,
  rowColor: "none",
  sortOrder: 0,
  values: {},
  isFavorite: false,
  updatedAt: ""
});

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function isUrl(value: unknown) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function displayCell(item: ToolboxItemDto, column: ToolboxColumnDto, category?: ToolboxCategoryDto) {
  const value = item.values[column.key];
  if (column.key === "category") return <span className="toolbox-category-mini"><i style={{ background: category?.color }} />{category?.name ?? "—"}</span>;
  if (column.key === "sortOrder") return <span className="toolbox-order">{item.sortOrder}</span>;
  if (column.key === "name") return <span className={`toolbox-name-cell toolbox-name-cell--${item.rowColor}`}>{item.name}</span>;
  if (column.key === "description") return <span className="toolbox-ellipsis" title={item.description}>{item.description || "—"}</span>;
  if (column.key === "officialTwitter") {
    const handle = String(value ?? "");
    return handle.startsWith("@")
      ? <a className="toolbox-link toolbox-x-link" href={`https://x.com/${handle.slice(1)}`} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>{handle}<ExternalLink size={12} /></a>
      : <span className="toolbox-empty">{handle || "未发现官方 X"}</span>;
  }
  if (column.key === "officialUrl") return item.officialUrl ? <a className="toolbox-link" href={item.officialUrl} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>{item.officialUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}<ExternalLink size={12} /></a> : <span className="toolbox-empty">—</span>;
  if (column.key === "loginAccount") return <span className="toolbox-sensitive"><LockKeyhole size={12} />{item.loginAccount || "—"}</span>;
  if (column.key === "isPublished") return <StatusPill positive={item.isPublished} positiveLabel="已发布" negativeLabel="未发布" />;
  if (column.key === "rating") return item.rating ? <span className="toolbox-rating"><strong>{item.rating}</strong><span>/ 10</span></span> : <span className="toolbox-empty">—</span>;
  if (column.key === "financing") return <span>{item.financing || "—"}</span>;
  if (column.key === "tutorial") return isUrl(item.tutorial) ? <a className="toolbox-link" href={item.tutorial} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>查看教程<ExternalLink size={12} /></a> : <span className="toolbox-ellipsis" title={item.tutorial}>{item.tutorial || "—"}</span>;
  if (column.key === "isPublic") return <StatusPill positive={item.isPublic} positiveLabel="公开" negativeLabel="私密" />;
  if (column.type === "boolean") return <StatusPill positive={Boolean(value)} positiveLabel="是" negativeLabel="否" />;
  if (column.type === "url" && isUrl(value)) return <a className="toolbox-link" href={String(value)} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>打开链接<ExternalLink size={12} /></a>;
  return <span className="toolbox-ellipsis" title={String(value ?? "")}>{String(value ?? "") || "—"}</span>;
}

function StatusPill({ positive, positiveLabel, negativeLabel }: { positive: boolean; positiveLabel: string; negativeLabel: string }) {
  return <span className={`toolbox-status ${positive ? "is-positive" : "is-muted"}`}><i />{positive ? positiveLabel : negativeLabel}</span>;
}

function Modal({ title, description, onClose, children, wide = false }: { title: string; description?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="toolbox-modal-backdrop" role="presentation">
      <section className={`toolbox-modal ${wide ? "toolbox-modal--wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header><div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div><button type="button" onClick={onClose} aria-label="关闭"><X size={18} /></button></header>
        {children}
      </section>
    </div>
  );
}

function Drawer({ title, description, onClose, children, wide = false }: { title: string; description?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="toolbox-drawer-backdrop" role="presentation">
      <aside className={`toolbox-drawer ${wide ? "toolbox-drawer--wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header><div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div><button type="button" onClick={onClose} aria-label="关闭"><X size={18} /></button></header>
        <div className="toolbox-drawer-body">{children}</div>
      </aside>
    </div>
  );
}

export function ToolboxWorkbench({ initialData }: { initialData: ToolboxSnapshot }) {
  const [data, setData] = useState(initialData);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [publishFilter, setPublishFilter] = useState("all");
  const [publicFilter, setPublicFilter] = useState("all");
  const [ratingFilter, setRatingFilter] = useState("0");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [view, setView] = useState<ViewMode>("table");
  const [collapsed, setCollapsed] = useState(() => new Set(initialData.categories.filter((category) => category.isCollapsed).map((category) => category.id)));
  const [selected, setSelected] = useState(() => new Set<string>());
  const [localFavorites, setLocalFavorites] = useState(() => new Set<string>());
  const [editingItem, setEditingItem] = useState<ToolboxItemDto | null>(null);
  const [editingCategory, setEditingCategory] = useState<ToolboxCategoryDto | null>(null);
  const [editingColumn, setEditingColumn] = useState<ToolboxColumnDto | null>(null);
  const [detailItem, setDetailItem] = useState<ToolboxItemDto | null>(null);
  const [showColumns, setShowColumns] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importMode, setImportMode] = useState("dedupe");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const isAdmin = data.role === "admin";
  const canEdit = data.role === "admin" || data.role === "operator";
  const showActions = canEdit && data.settings.showActions;
  const categoryMap = useMemo(() => new Map(data.categories.map((category) => [category.id, category])), [data.categories]);

  useEffect(() => {
    if (data.viewerId) return;
    try {
      const stored = JSON.parse(localStorage.getItem("welinkbtc-toolbox-favorites") ?? "[]") as string[];
      setLocalFavorites(new Set(stored));
    } catch { /* Device-local favorites are optional. */ }
  }, [data.viewerId]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function isFavorite(item: ToolboxItemDto) {
    return item.isFavorite || localFavorites.has(item.id);
  }

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const minRating = Number(ratingFilter);
    return data.items.filter((item) => {
      if (categoryFilter !== "all" && item.categoryId !== categoryFilter) return false;
      if (publishFilter === "published" && !item.isPublished) return false;
      if (publishFilter === "draft" && item.isPublished) return false;
      if (publicFilter === "public" && !item.isPublic) return false;
      if (publicFilter === "private" && item.isPublic) return false;
      if (minRating && (item.rating ?? 0) < minRating) return false;
      if (favoritesOnly && !isFavorite(item)) return false;
      if (!normalized) return true;
      const categoryName = categoryMap.get(item.categoryId)?.name ?? "";
      return [item.name, item.description, item.officialUrl, item.loginAccount, item.financing, item.tutorial, categoryName, ...Object.values(item.values)]
        .some((value) => String(value ?? "").toLowerCase().includes(normalized));
    });
  }, [data.items, query, categoryFilter, publishFilter, publicFilter, ratingFilter, favoritesOnly, localFavorites, categoryMap]);

  const grouped = useMemo(() => data.categories.map((category) => ({ category, items: filteredItems.filter((item) => item.categoryId === category.id) })).filter((group) => canEdit || group.items.length > 0), [data.categories, filteredItems, canEdit]);
  const favoriteCount = data.items.filter(isFavorite).length;
  const publishedCount = data.items.filter((item) => item.isPublished).length;
  const visibleColumns = data.columns.filter((column) => column.isVisible);

  async function mutate(payload: Record<string, unknown>, success: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/toolbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(result.error ?? "操作失败"));
      setData(result as ToolboxSnapshot);
      setSelected(new Set());
      setNotice({ tone: "success", text: success });
      return true;
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "操作失败" });
      return false;
    } finally { setBusy(false); }
  }

  async function toggleFavorite(item: ToolboxItemDto) {
    if (!data.viewerId) {
      const next = new Set(localFavorites);
      if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
      setLocalFavorites(next);
      localStorage.setItem("welinkbtc-toolbox-favorites", JSON.stringify([...next]));
      return;
    }
    await mutate({ action: "toggleFavorite", itemId: item.id }, isFavorite(item) ? "已取消收藏" : "已加入常用工具");
  }

  async function setItemVisibility(item: ToolboxItemDto, isPublic: boolean) {
    if (item.isPublic === isPublic) return;
    await mutate({ action: "setItemPublic", itemId: item.id, isPublic }, isPublic ? "已设为公开" : "已设为私密");
  }

  async function toggleCategory(category: ToolboxCategoryDto) {
    const next = new Set(collapsed);
    const isCollapsed = next.has(category.id);
    if (isCollapsed) next.delete(category.id); else next.add(category.id);
    setCollapsed(next);
    if (canEdit) await mutate({ action: "toggleCategory", categoryId: category.id, collapsed: !isCollapsed }, isCollapsed ? "分类已展开" : "分类已折叠");
  }

  function toggleSelection(itemId: string) {
    const next = new Set(selected);
    if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
    setSelected(next);
  }

  function openNewItem(categoryId?: string) {
    setEditingItem(emptyItem(categoryId ?? (categoryFilter !== "all" ? categoryFilter : data.categories[0]?.id ?? "")));
  }

  async function submitItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values: Record<string, unknown> = {};
    for (const column of data.columns.filter((column) => !column.isSystem)) {
      const raw = form.get(`custom:${column.key}`);
      values[column.key] = column.type === "boolean" ? raw === "on" : column.type === "number" || column.type === "rating" ? (raw ? Number(raw) : null) : String(raw ?? "");
    }
    const item = {
      id: editingItem?.id || undefined,
      categoryId: String(form.get("categoryId") ?? ""),
      name: String(form.get("name") ?? ""),
      description: String(form.get("description") ?? ""),
      officialUrl: String(form.get("officialUrl") ?? ""),
      loginAccount: String(form.get("loginAccount") ?? ""),
      isPublished: form.get("isPublished") === "on",
      rating: form.get("rating") ? Number(form.get("rating")) : null,
      financing: String(form.get("financing") ?? ""),
      tutorial: String(form.get("tutorial") ?? ""),
      isPublic: form.get("isPublic") === "on",
      rowColor: String(form.get("rowColor") ?? "none"),
      values
    };
    const success = await mutate({ action: editingItem?.id ? "updateItem" : "createItem", item }, editingItem?.id ? "工具信息已更新" : "工具已添加");
    if (success) setEditingItem(null);
  }

  async function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const category = { id: editingCategory?.id || undefined, name: String(form.get("name") ?? ""), description: String(form.get("description") ?? ""), color: String(form.get("color") ?? "#4BA3D8"), isPublic: form.get("isPublic") === "on" };
    const success = await mutate({ action: editingCategory?.id ? "updateCategory" : "createCategory", category }, editingCategory?.id ? "分类已更新" : "分类已添加");
    if (success) setEditingCategory(null);
  }

  async function submitColumn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const sensitive = form.get("isSensitive") === "on";
    const column = {
      id: editingColumn?.id || undefined,
      key: String(form.get("key") ?? ""),
      title: String(form.get("title") ?? ""),
      type: String(form.get("type") ?? "text"),
      width: Number(form.get("width") ?? 160),
      isVisible: form.get("isVisible") === "on",
      isPublic: sensitive ? false : form.get("isPublic") === "on",
      isSensitive: sensitive,
      isEditable: form.get("isEditable") === "on",
      isRequired: form.get("isRequired") === "on",
      options: String(form.get("options") ?? "").split(/[,，\n]/).map((value) => value.trim()).filter(Boolean)
    };
    const success = await mutate({ action: editingColumn?.id ? "updateColumn" : "createColumn", column }, editingColumn?.id ? "列配置已更新" : "自定义列已添加");
    if (success) setEditingColumn(null);
  }

  async function submitSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const settings: ToolboxSettings = { showActions: form.get("showActions") === "on", operatorCanCreate: form.get("operatorCanCreate") === "on", operatorCanDelete: form.get("operatorCanDelete") === "on", operatorCanBulk: form.get("operatorCanBulk") === "on" };
    const success = await mutate({ action: "updateSettings", settings }, "权限设置已保存");
    if (success) setShowSettings(false);
  }

  async function previewImport() {
    if (!importFile) { setNotice({ tone: "error", text: "请先选择 Excel 或 CSV 文件" }); return; }
    const form = new FormData();
    form.set("file", importFile);
    form.set("preview", "1");
    setBusy(true);
    try {
      const response = await fetch("/api/toolbox/import", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(String(result.error ?? "无法读取文件"));
      setImportPreview(result);
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "无法读取文件" }); }
    finally { setBusy(false); }
  }

  async function confirmImport() {
    if (!importFile || !importPreview || importPreview.errors.length) return;
    const form = new FormData();
    form.set("file", importFile);
    form.set("preview", "0");
    form.set("mode", importMode);
    setBusy(true);
    try {
      const response = await fetch("/api/toolbox/import", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(String(result.error ?? "导入失败"));
      setData(result.snapshot);
      setNotice({ tone: "success", text: `导入完成：新增 ${result.created}，更新 ${result.updated}，跳过 ${result.skipped}` });
      setShowImport(false); setImportFile(null); setImportPreview(null);
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "导入失败" }); }
    finally { setBusy(false); }
  }

  async function bulk(operation: string, categoryId?: string) {
    if (!selected.size) return;
    if (operation === "delete" && !window.confirm(`确定删除选中的 ${selected.size} 条工具吗？此操作不可撤销。`)) return;
    await mutate({ action: "bulkUpdate", itemIds: [...selected], operation, categoryId }, "批量操作已完成");
  }

  function beginColumnResize(event: React.PointerEvent<HTMLElement>, column: ToolboxColumnDto) {
    if (!isAdmin) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = column.width;
    let latestWidth = startWidth;
    const move = (pointerEvent: PointerEvent) => {
      latestWidth = Math.max(72, Math.min(600, Math.round(startWidth + pointerEvent.clientX - startX)));
      setData((current) => ({ ...current, columns: current.columns.map((entry) => entry.id === column.id ? { ...entry, width: latestWidth } : entry) }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (latestWidth !== startWidth) void mutate({ action: "updateColumn", column: { ...column, width: latestWidth } }, "列宽已保存");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  }

  const exportHref = `/api/toolbox/export?ids=${encodeURIComponent(filteredItems.map((item) => item.id).join(","))}`;

  return (
    <main className="toolbox-page">
      <section className="toolbox-hero">
        <div>
          <p className="toolbox-kicker"><Boxes size={15} /> OPERATIONS KNOWLEDGE BASE</p>
          <h1>百宝箱<span>工具台</span></h1>
          <p>把常用平台、工具、网站、教程与账号线索集中到一张可维护、可筛选、可公开分享的运营表格。</p>
        </div>
        <div className="toolbox-hero-stats" aria-label="百宝箱统计">
          <div><span>全部工具</span><strong>{data.items.length}</strong><small>TOOLS</small></div>
          <div><span>已发布</span><strong>{publishedCount}</strong><small>LIVE</small></div>
          <div><span>分类</span><strong>{data.categories.length}</strong><small>GROUPS</small></div>
          <div><span>我的常用</span><strong>{favoriteCount}</strong><small>STARRED</small></div>
        </div>
      </section>

      <section className="toolbox-workspace">
        <header className="toolbox-workspace-head">
          <div><span className={`toolbox-access toolbox-access--${data.role}`}>{data.role === "admin" ? "系统管理员" : data.role === "operator" ? "操作员" : "公开视图"}</span><h2>工具知识库</h2><p>{canEdit ? "双击行可编辑，所有写入都会进入操作日志。" : "当前仅展示已公开且已发布的条目。登录后可同步收藏。"}</p></div>
          <div className="toolbox-primary-actions">
            {canEdit && (isAdmin || data.settings.operatorCanCreate) ? <button className="toolbox-button toolbox-button--primary" type="button" onClick={() => openNewItem()}><Plus size={16} />添加工具</button> : null}
            {isAdmin ? <button className="toolbox-button" type="button" onClick={() => setEditingCategory({ id: "", name: "", description: "", color: "#4BA3D8", sortOrder: 0, isPublic: true, isCollapsed: false, itemCount: 0 })}><Plus size={16} />添加分类</button> : null}
            {isAdmin ? <button className="toolbox-button" type="button" onClick={() => setShowImport(true)}><Upload size={16} />导入</button> : null}
            <a className="toolbox-button" href={exportHref}><Download size={16} />导出 Excel</a>
            {isAdmin ? <button className="toolbox-icon-button" type="button" title="表格设置" onClick={() => setShowColumns(true)}><Settings2 size={18} /></button> : null}
          </div>
        </header>

        <div className="toolbox-toolbar">
          <label className="toolbox-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、链接、账号或教程…" /><kbd>⌘ K</kbd></label>
          <div className="toolbox-filter-group"><Filter size={15} />
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="分类筛选"><option value="all">全部分类</option>{data.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
            {canEdit ? <select value={publishFilter} onChange={(event) => setPublishFilter(event.target.value)} aria-label="发布状态筛选"><option value="all">全部发布状态</option><option value="published">已发布</option><option value="draft">未发布</option></select> : null}
            {canEdit ? <select value={publicFilter} onChange={(event) => setPublicFilter(event.target.value)} aria-label="公开状态筛选"><option value="all">全部公开状态</option><option value="public">公开</option><option value="private">私密</option></select> : null}
            <select value={ratingFilter} onChange={(event) => setRatingFilter(event.target.value)} aria-label="最低评分"><option value="0">全部评分</option><option value="7">7 分以上</option><option value="8">8 分以上</option><option value="9">9 分以上</option></select>
          </div>
          <button className={`toolbox-filter-chip ${favoritesOnly ? "is-active" : ""}`} type="button" onClick={() => setFavoritesOnly((value) => !value)}><Star size={14} fill={favoritesOnly ? "currentColor" : "none"} />常用</button>
          <div className="toolbox-view-switch" aria-label="视图模式">
            <button type="button" className={view === "table" ? "is-active" : ""} onClick={() => setView("table")} title="表格视图"><Table2 size={16} /></button>
            <button type="button" className={view === "cards" ? "is-active" : ""} onClick={() => setView("cards")} title="卡片视图"><Grid2X2 size={16} /></button>
            <button type="button" className={view === "board" ? "is-active" : ""} onClick={() => setView("board")} title="分类看板"><LayoutList size={16} /></button>
          </div>
          {canEdit ? <button className="toolbox-log-button" type="button" onClick={() => setShowLogs(true)}><History size={15} />操作日志</button> : null}
        </div>

        {selected.size && canEdit ? (
          <div className="toolbox-bulkbar">
            <strong>已选择 {selected.size} 项</strong><span />
            <button type="button" onClick={() => bulk("publish")}>设为已发布</button><button type="button" onClick={() => bulk("unpublish")}>设为未发布</button><button type="button" onClick={() => bulk("public")}>设为公开</button><button type="button" onClick={() => bulk("private")}>设为私密</button>
            <select defaultValue="" onChange={(event) => { if (event.target.value) bulk("move", event.target.value); event.target.value = ""; }} aria-label="移动到分类"><option value="" disabled>移动到分类…</option>{data.categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select>
            {(isAdmin || data.settings.operatorCanDelete) ? <button className="is-danger" type="button" onClick={() => bulk("delete")}><Trash2 size={14} />删除</button> : null}
            <button type="button" onClick={() => setSelected(new Set())}>取消选择</button>
          </div>
        ) : null}

        <div className="toolbox-results-meta"><span>显示 <strong>{filteredItems.length}</strong> / {data.items.length} 个工具</span><span><i className="is-green" />已验证 <i className="is-yellow" />待研究 <i className="is-red" />风险 / 高优先级</span></div>

        {view === "table" ? (
          <div className="toolbox-table-shell">
            <table className="toolbox-table">
              <colgroup>
                {canEdit ? <col style={{ width: 44 }} /> : null}<col style={{ width: 48 }} />
                {visibleColumns.map((column) => <col key={column.id} style={{ width: column.width }} />)}
                {showActions ? <col style={{ width: 180 }} /> : null}
              </colgroup>
              <thead><tr>
                {canEdit ? <th className="toolbox-check-cell"><input type="checkbox" aria-label="全选当前筛选" checked={filteredItems.length > 0 && filteredItems.every((item) => selected.has(item.id))} onChange={(event) => setSelected(event.target.checked ? new Set(filteredItems.map((item) => item.id)) : new Set())} /></th> : null}
                <th className="toolbox-star-cell"><Star size={14} /></th>
                {visibleColumns.map((column) => <th key={column.id}><span>{column.title}{column.isSensitive ? <LockKeyhole size={11} /> : null}</span><i className={isAdmin ? "is-resizable" : ""} onPointerDown={(event) => beginColumnResize(event, column)} /></th>)}
                {showActions ? <th className="toolbox-actions-head">操作</th> : null}
              </tr></thead>
              <tbody>
                {grouped.map(({ category, items }) => (
                  <Fragment key={category.id}>
                    <tr className="toolbox-category-row"><td colSpan={(canEdit ? 2 : 1) + visibleColumns.length + (showActions ? 1 : 0)}>
                      <div><button type="button" className="toolbox-category-toggle" onClick={() => toggleCategory(category)}>{collapsed.has(category.id) ? <ChevronRight size={16} /> : <ChevronDown size={16} />}<i style={{ background: category.color }} /><strong>{category.name}</strong><span>{items.length} 个工具</span>{!category.isPublic ? <em><LockKeyhole size={11} />私密分类</em> : null}</button>
                      {isAdmin ? <div className="toolbox-category-actions"><button type="button" title="添加工具" onClick={() => openNewItem(category.id)}><Plus size={14} /></button><button type="button" title="编辑分类" onClick={() => setEditingCategory(category)}><Pencil size={14} /></button><button type="button" title="分类上移" onClick={() => mutate({ action: "moveCategory", categoryId: category.id, direction: "up" }, "分类顺序已更新")}><ArrowUp size={14} /></button><button type="button" title="分类下移" onClick={() => mutate({ action: "moveCategory", categoryId: category.id, direction: "down" }, "分类顺序已更新")}><ArrowDown size={14} /></button><button type="button" title="删除分类" onClick={() => { if (window.confirm(`删除“${category.name}”及其 ${category.itemCount} 个工具？此操作不可撤销。`)) mutate({ action: "deleteCategory", categoryId: category.id }, "分类已删除"); }}><Trash2 size={14} /></button></div> : null}</div>
                    </td></tr>
                    {!collapsed.has(category.id) ? items.map((item) => (
                      <tr key={item.id} className={`toolbox-data-row toolbox-data-row--${item.rowColor}`} onDoubleClick={() => canEdit ? setEditingItem(item) : setDetailItem(item)}>
                        {canEdit ? <td className="toolbox-check-cell"><input type="checkbox" aria-label={`选择 ${item.name}`} checked={selected.has(item.id)} onChange={() => toggleSelection(item.id)} /></td> : null}
                        <td className="toolbox-star-cell"><button type="button" aria-label={isFavorite(item) ? `取消收藏 ${item.name}` : `收藏 ${item.name}`} onClick={() => toggleFavorite(item)}><Star size={15} fill={isFavorite(item) ? "currentColor" : "none"} /></button></td>
                        {visibleColumns.map((column) => <td key={column.id} onClick={column.key === "name" ? () => setDetailItem(item) : undefined}>{column.key === "isPublic" && canEdit ? <select className={`toolbox-inline-visibility ${item.isPublic ? "is-public" : "is-private"}`} value={item.isPublic ? "public" : "private"} disabled={busy} aria-label={`${item.name} 的公开状态`} onClick={(event) => event.stopPropagation()} onChange={(event) => setItemVisibility(item, event.target.value === "public")}><option value="public">公开</option><option value="private">私密</option></select> : displayCell(item, column, category)}</td>)}
                        {showActions ? <td className="toolbox-row-actions"><button type="button" title="编辑" onClick={() => setEditingItem(item)}><Pencil size={14} /></button><button type="button" title="上移" onClick={() => mutate({ action: "moveItem", itemId: item.id, direction: "up" }, "行顺序已更新")}><ArrowUp size={14} /></button><button type="button" title="下移" onClick={() => mutate({ action: "moveItem", itemId: item.id, direction: "down" }, "行顺序已更新")}><ArrowDown size={14} /></button>{isAdmin || data.settings.operatorCanDelete ? <button type="button" title="删除" onClick={() => { if (window.confirm(`确定删除“${item.name}”吗？`)) mutate({ action: "deleteItem", itemId: item.id }, "工具已删除"); }}><Trash2 size={14} /></button> : null}<button type="button" title="查看详情" onClick={() => setDetailItem(item)}><MoreHorizontal size={15} /></button></td> : null}
                      </tr>
                    )) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
            {!filteredItems.length ? <EmptyState onAdd={canEdit ? () => openNewItem() : undefined} /> : null}
          </div>
        ) : view === "cards" ? (
          <div className="toolbox-card-grid">{filteredItems.map((item) => { const category = categoryMap.get(item.categoryId); return <article className={`toolbox-card toolbox-card--${item.rowColor}`} key={item.id} onClick={() => setDetailItem(item)}><header><span style={{ color: category?.color }}><i style={{ background: category?.color }} />{category?.name}</span><button type="button" aria-label="收藏" onClick={(event) => { event.stopPropagation(); toggleFavorite(item); }}><Star size={17} fill={isFavorite(item) ? "currentColor" : "none"} /></button></header><h3>{item.name}</h3><p>{item.description || "暂无简介"}</p><div className="toolbox-card-tags"><StatusPill positive={item.isPublished} positiveLabel="已发布" negativeLabel="未发布" /><span>{item.rating ? `${item.rating} / 10` : "未评分"}</span></div><footer>{item.officialUrl ? <a href={item.officialUrl} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>访问官网<ExternalLink size={13} /></a> : <span>暂无链接</span>}{canEdit ? <button type="button" onClick={(event) => { event.stopPropagation(); setEditingItem(item); }}><Pencil size={13} />编辑</button> : null}</footer></article>; })}{!filteredItems.length ? <EmptyState onAdd={canEdit ? () => openNewItem() : undefined} /> : null}</div>
        ) : (
          <div className="toolbox-board">{grouped.map(({ category, items }) => <section key={category.id}><header><span><i style={{ background: category.color }} /><strong>{category.name}</strong></span><em>{items.length}</em></header><div>{items.map((item) => <article key={item.id} onClick={() => setDetailItem(item)}><div><strong>{item.name}</strong><button type="button" onClick={(event) => { event.stopPropagation(); toggleFavorite(item); }}><Star size={14} fill={isFavorite(item) ? "currentColor" : "none"} /></button></div><p>{item.description || item.officialUrl || "暂无简介"}</p><footer><span>{item.rating ? `${item.rating} / 10` : "—"}</span><StatusPill positive={item.isPublished} positiveLabel="已发布" negativeLabel="草稿" /></footer></article>)}</div>{canEdit && (isAdmin || data.settings.operatorCanCreate) ? <button className="toolbox-board-add" type="button" onClick={() => openNewItem(category.id)}><Plus size={14} />添加工具</button> : null}</section>)}</div>
        )}
      </section>

      {editingItem ? <ItemModal item={editingItem} columns={data.columns} categories={data.categories} onClose={() => setEditingItem(null)} onSubmit={submitItem} busy={busy} /> : null}
      {editingCategory ? <CategoryModal category={editingCategory} onClose={() => setEditingCategory(null)} onSubmit={submitCategory} busy={busy} /> : null}
      {editingColumn ? <ColumnModal column={editingColumn} onClose={() => setEditingColumn(null)} onSubmit={submitColumn} busy={busy} /> : null}
      {detailItem ? <DetailDrawer item={detailItem} columns={visibleColumns} category={categoryMap.get(detailItem.categoryId)} logs={data.auditLogs.filter((log) => log.targetId === detailItem.id)} favorite={isFavorite(detailItem)} onFavorite={() => toggleFavorite(detailItem)} onEdit={canEdit ? () => { setEditingItem(detailItem); setDetailItem(null); } : undefined} onClose={() => setDetailItem(null)} /> : null}
      {showColumns ? <ColumnSettings columns={data.columns} settings={data.settings} onClose={() => setShowColumns(false)} onNew={() => setEditingColumn({ id: "", key: "", title: "", type: "text", width: 160, sortOrder: 0, isSystem: false, isVisible: true, isPublic: true, isSensitive: false, isEditable: true, isRequired: false, options: [] })} onEdit={setEditingColumn} onMove={(column, direction) => mutate({ action: "moveColumn", columnId: column.id, direction }, "列顺序已更新")} onDelete={(column) => { if (window.confirm(`确定删除自定义列“${column.title}”及其全部单元格数据吗？`)) mutate({ action: "deleteColumn", columnId: column.id }, "自定义列已删除"); }} onSettings={() => setShowSettings(true)} /> : null}
      {showSettings ? <SettingsModal settings={data.settings} onClose={() => setShowSettings(false)} onSubmit={submitSettings} busy={busy} /> : null}
      {showLogs ? <LogDrawer logs={data.auditLogs} onClose={() => setShowLogs(false)} /> : null}
      {showImport ? <ImportModal file={importFile} preview={importPreview} mode={importMode} busy={busy} onFile={(file) => { setImportFile(file); setImportPreview(null); }} onMode={setImportMode} onPreview={previewImport} onConfirm={confirmImport} onClose={() => { setShowImport(false); setImportFile(null); setImportPreview(null); }} /> : null}
      {notice ? <div className={`toolbox-toast toolbox-toast--${notice.tone}`} role="status">{notice.tone === "success" ? <Check size={16} /> : <X size={16} />}{notice.text}</div> : null}
    </main>
  );
}

function EmptyState({ onAdd }: { onAdd?: () => void }) {
  return <div className="toolbox-empty-state"><Search size={28} /><h3>没有匹配的工具</h3><p>调整筛选条件，或添加一条新的工具记录。</p>{onAdd ? <button type="button" onClick={onAdd}><Plus size={15} />添加工具</button> : null}</div>;
}

function ItemModal({ item, columns, categories, onClose, onSubmit, busy }: { item: ToolboxItemDto; columns: ToolboxColumnDto[]; categories: ToolboxCategoryDto[]; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; busy: boolean }) {
  const customColumns = columns.filter((column) => !column.isSystem);
  return <Modal title={item.id ? `编辑 · ${item.name}` : "添加工具"} description="基础字段与自定义列会一起保存，敏感字段仅对有权限的人员展示。" onClose={onClose} wide><form className="toolbox-form" onSubmit={onSubmit} key={item.id || "new"}><div className="toolbox-form-grid"><label><span>分类 *</span><select name="categoryId" defaultValue={item.categoryId} required>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label><label><span>名称 *</span><input name="name" defaultValue={item.name} required maxLength={120} placeholder="例如 Dune" /></label><label className="is-wide"><span>简要描述</span><textarea name="description" defaultValue={item.description} maxLength={1000} rows={3} placeholder="一句话说明用途与适用场景" /></label><label className="is-wide"><span>官网链接</span><input name="officialUrl" defaultValue={item.officialUrl} type="url" placeholder="https://" /></label><label><span>登录账号</span><input name="loginAccount" defaultValue={item.loginAccount} placeholder="邮箱、钱包或账号说明" /></label><label><span>评分</span><input name="rating" defaultValue={item.rating ?? ""} type="number" min={1} max={10} step={1} placeholder="1–10" /></label><label><span>融资</span><input name="financing" defaultValue={item.financing} placeholder="例如 200万 / 未公布" /></label><label><span>行颜色</span><select name="rowColor" defaultValue={item.rowColor}><option value="none">无标记</option><option value="green">绿色 · 已验证</option><option value="yellow">黄色 · 待研究</option><option value="red">红色 · 风险/高优先级</option><option value="gray">灰色 · 待复核</option></select></label><label className="is-wide"><span>空投交互教程</span><input name="tutorial" defaultValue={item.tutorial} placeholder="教程链接或文字说明" /></label>{customColumns.map((column) => <CustomField key={column.id} column={column} value={item.values[column.key]} />)}</div><div className="toolbox-form-checks"><label><input type="checkbox" name="isPublished" defaultChecked={item.isPublished} /><span><strong>已发布</strong><small>发布状态仅后台可见</small></span></label><label><input type="checkbox" name="isPublic" defaultChecked={item.isPublic} /><span><strong>允许公开</strong><small>普通用户仍只看到已发布条目</small></span></label></div><footer><button className="toolbox-button" type="button" onClick={onClose}>取消</button><button className="toolbox-button toolbox-button--primary" disabled={busy}>{busy ? "保存中…" : item.id ? "保存修改" : "添加工具"}</button></footer></form></Modal>;
}

function CustomField({ column, value }: { column: ToolboxColumnDto; value: unknown }) {
  const name = `custom:${column.key}`;
  if (column.type === "boolean") return <label className="toolbox-custom-check"><input type="checkbox" name={name} defaultChecked={Boolean(value)} /><span>{column.title}</span></label>;
  if (column.type === "select") return <label><span>{column.title}{column.isRequired ? " *" : ""}</span><select name={name} defaultValue={String(value ?? "")} required={column.isRequired}><option value="">请选择</option>{column.options.map((option) => <option key={option}>{option}</option>)}</select></label>;
  const type = column.type === "number" || column.type === "rating" ? "number" : column.type === "date" ? "date" : column.type === "url" ? "url" : "text";
  return <label><span>{column.title}{column.isRequired ? " *" : ""}</span><input name={name} type={type} defaultValue={String(value ?? "")} required={column.isRequired} min={column.type === "rating" ? 1 : undefined} max={column.type === "rating" ? 10 : undefined} /></label>;
}

function CategoryModal({ category, onClose, onSubmit, busy }: { category: ToolboxCategoryDto; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; busy: boolean }) {
  return <Modal title={category.id ? "编辑分类" : "添加分类"} description="分类颜色会用于分组行、标签和看板。" onClose={onClose}><form className="toolbox-form" onSubmit={onSubmit} key={category.id || "new"}><div className="toolbox-form-grid"><label className="is-wide"><span>分类名称 *</span><input name="name" defaultValue={category.name} required maxLength={80} /></label><label className="is-wide"><span>分类说明</span><textarea name="description" defaultValue={category.description ?? ""} rows={3} /></label><label><span>分类颜色</span><input className="toolbox-color-input" name="color" type="color" defaultValue={category.color} /></label><label className="toolbox-custom-check"><input type="checkbox" name="isPublic" defaultChecked={category.isPublic} /><span>允许公开展示</span></label></div><footer><button className="toolbox-button" type="button" onClick={onClose}>取消</button><button className="toolbox-button toolbox-button--primary" disabled={busy}>{busy ? "保存中…" : "保存分类"}</button></footer></form></Modal>;
}

function ColumnModal({ column, onClose, onSubmit, busy }: { column: ToolboxColumnDto; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; busy: boolean }) {
  const types: Array<[ToolboxColumnType, string]> = [["text", "文本"], ["url", "网址"], ["url_text", "网址 / 文本"], ["number", "数字"], ["rating", "评分"], ["boolean", "开关"], ["select", "下拉选项"], ["date", "日期"]];
  return <Modal title={column.id ? `配置列 · ${column.title}` : "添加自定义列"} description={column.isSystem ? "系统列不可删除或更改字段 Key，但可以调整宽度与可见权限。" : "自定义列无需修改数据库结构，保存后立即出现在表格中。"} onClose={onClose}><form className="toolbox-form" onSubmit={onSubmit} key={column.id || "new"}><div className="toolbox-form-grid"><label><span>列名 *</span><input name="title" defaultValue={column.title} required /></label><label><span>字段 Key *</span><input name="key" defaultValue={column.key} required pattern="[a-z][a-zA-Z0-9_]{1,39}" readOnly={column.isSystem} /></label><label><span>字段类型</span><select name="type" defaultValue={column.type} disabled={column.isSystem}>{types.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>{column.isSystem ? <input type="hidden" name="type" value={column.type} /> : null}</label><label><span>列宽（px）</span><input name="width" defaultValue={column.width} type="number" min={72} max={600} /></label><label className="is-wide"><span>下拉选项（逗号或换行分隔）</span><textarea name="options" defaultValue={column.options.join("，")} rows={2} /></label></div><div className="toolbox-form-checks toolbox-form-checks--stack"><label><input type="checkbox" name="isVisible" defaultChecked={column.isVisible} /><span><strong>后台显示</strong><small>关闭后表格中不展示</small></span></label><label><input type="checkbox" name="isPublic" defaultChecked={column.isPublic} /><span><strong>前台公开</strong><small>访客和普通用户可以看到</small></span></label><label><input type="checkbox" name="isSensitive" defaultChecked={column.isSensitive} /><span><strong>敏感字段</strong><small>启用后强制关闭前台公开</small></span></label><label><input type="checkbox" name="isEditable" defaultChecked={column.isEditable} /><span><strong>允许编辑</strong><small>维护人员可以填写此字段</small></span></label><label><input type="checkbox" name="isRequired" defaultChecked={column.isRequired} /><span><strong>必填字段</strong><small>新增或编辑时必须提供</small></span></label></div><footer><button className="toolbox-button" type="button" onClick={onClose}>取消</button><button className="toolbox-button toolbox-button--primary" disabled={busy}>{busy ? "保存中…" : "保存列配置"}</button></footer></form></Modal>;
}

function DetailDrawer({ item, columns, category, logs, favorite, onFavorite, onEdit, onClose }: { item: ToolboxItemDto; columns: ToolboxColumnDto[]; category?: ToolboxCategoryDto; logs: ToolboxSnapshot["auditLogs"]; favorite: boolean; onFavorite: () => void; onEdit?: () => void; onClose: () => void }) {
  return <Drawer title={item.name} description={`${category?.name ?? "未分类"} · 更新于 ${formatDate(item.updatedAt)}`} onClose={onClose}><div className={`toolbox-detail-accent toolbox-detail-accent--${item.rowColor}`}><Sparkles size={18} /><span>{item.rowColor === "green" ? "已验证工具" : item.rowColor === "yellow" ? "重点关注" : item.rowColor === "red" ? "风险 / 高优先级" : "工具档案"}</span></div><div className="toolbox-detail-actions"><button type="button" onClick={onFavorite}><Star size={15} fill={favorite ? "currentColor" : "none"} />{favorite ? "已收藏" : "加入常用"}</button>{onEdit ? <button type="button" onClick={onEdit}><Pencil size={15} />编辑工具</button> : null}{item.officialUrl ? <a href={item.officialUrl} target="_blank" rel="noopener noreferrer">打开官网<ExternalLink size={15} /></a> : null}</div><dl className="toolbox-detail-list">{columns.filter((column) => !["category", "sortOrder", "name"].includes(column.key)).map((column) => <div key={column.id}><dt>{column.title}{column.isSensitive ? <LockKeyhole size={11} /> : null}</dt><dd>{displayCell(item, column, category)}</dd></div>)}</dl>{logs.length ? <div className="toolbox-item-history"><h3><History size={15} />最近变更</h3>{logs.slice(0, 8).map((log) => <div key={log.id}><i /><span><strong>{log.action}</strong><small>{log.actor} · {formatDate(log.createdAt)}</small></span></div>)}</div> : null}</Drawer>;
}

function ColumnSettings({ columns, settings, onClose, onNew, onEdit, onMove, onDelete, onSettings }: { columns: ToolboxColumnDto[]; settings: ToolboxSettings; onClose: () => void; onNew: () => void; onEdit: (column: ToolboxColumnDto) => void; onMove: (column: ToolboxColumnDto, direction: "up" | "down") => void; onDelete: (column: ToolboxColumnDto) => void; onSettings: () => void }) {
  return <Drawer title="表格与列设置" description="调整列宽、顺序、公开范围与敏感字段。" onClose={onClose} wide><div className="toolbox-settings-summary"><div><SlidersHorizontal size={17} /><span><strong>管理员操作列</strong><small>{settings.showActions ? "当前已显示" : "当前已隐藏"}</small></span></div><button type="button" onClick={onSettings}>权限设置</button></div><div className="toolbox-column-list">{columns.map((column) => <article key={column.id}><div className="toolbox-column-grip"><span /><span /><span /></div><div><strong>{column.title}</strong><span>{column.key} · {column.type} · {column.width}px</span><small>{column.isSystem ? "系统列" : "自定义列"}{column.isPublic ? " · 前台公开" : " · 仅后台"}{column.isSensitive ? " · 敏感" : ""}</small></div><div><button type="button" title="上移" onClick={() => onMove(column, "up")}><ArrowUp size={14} /></button><button type="button" title="下移" onClick={() => onMove(column, "down")}><ArrowDown size={14} /></button><button type="button" title="编辑" onClick={() => onEdit(column)}><Pencil size={14} /></button>{!column.isSystem ? <button type="button" title="删除" onClick={() => onDelete(column)}><Trash2 size={14} /></button> : null}</div></article>)}</div><button className="toolbox-add-column" type="button" onClick={onNew}><Plus size={16} />添加自定义列</button></Drawer>;
}

function SettingsModal({ settings, onClose, onSubmit, busy }: { settings: ToolboxSettings; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; busy: boolean }) {
  return <Modal title="操作列与权限" description="系统管理员可以控制操作列以及操作员的具体能力。" onClose={onClose}><form className="toolbox-form" onSubmit={onSubmit}><div className="toolbox-permission-list"><label><span><strong>显示管理员操作列</strong><small>编辑、删除、上移、下移与详情入口</small></span><input type="checkbox" name="showActions" defaultChecked={settings.showActions} /></label><label><span><strong>操作员可新增工具</strong><small>允许操作员向现有分类添加新行</small></span><input type="checkbox" name="operatorCanCreate" defaultChecked={settings.operatorCanCreate} /></label><label><span><strong>操作员可批量操作</strong><small>允许批量发布、公开与移动分类</small></span><input type="checkbox" name="operatorCanBulk" defaultChecked={settings.operatorCanBulk} /></label><label><span><strong>操作员可删除工具</strong><small>删除不可撤销，建议保持关闭</small></span><input type="checkbox" name="operatorCanDelete" defaultChecked={settings.operatorCanDelete} /></label></div><footer><button className="toolbox-button" type="button" onClick={onClose}>取消</button><button className="toolbox-button toolbox-button--primary" disabled={busy}>{busy ? "保存中…" : "保存权限"}</button></footer></form></Modal>;
}

function LogDrawer({ logs, onClose }: { logs: ToolboxSnapshot["auditLogs"]; onClose: () => void }) {
  const [search, setSearch] = useState("");
  const filtered = logs.filter((log) => `${log.action} ${log.actor} ${log.targetType}`.toLowerCase().includes(search.toLowerCase()));
  return <Drawer title="百宝箱操作日志" description="保留新增、编辑、删除、公开状态、列配置和导入记录。" onClose={onClose} wide><label className="toolbox-log-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="按操作或管理员搜索" /></label><div className="toolbox-log-list">{filtered.map((log) => <article key={log.id}><span><ClipboardList size={15} /></span><div><strong>{log.action}</strong><p>{log.targetType}{log.targetId ? ` · ${log.targetId}` : ""}</p><small>{log.actor} · {formatDate(log.createdAt)}</small></div>{log.metadata ? <code>{JSON.stringify(log.metadata)}</code> : null}</article>)}{!filtered.length ? <div className="toolbox-empty-state"><History size={26} /><h3>暂无匹配日志</h3></div> : null}</div></Drawer>;
}

function ImportModal({ file, preview, mode, busy, onFile, onMode, onPreview, onConfirm, onClose }: { file: File | null; preview: ImportPreview | null; mode: string; busy: boolean; onFile: (file: File | null) => void; onMode: (mode: string) => void; onPreview: () => void; onConfirm: () => void; onClose: () => void }) {
  return <Modal title="Excel 导入" description="自动匹配中英文列名，先预览校验，再写入工具库。" onClose={onClose} wide><div className="toolbox-import"><label className="toolbox-dropzone"><FileSpreadsheet size={30} /><strong>{file ? file.name : "选择 .xlsx 或 .csv 文件"}</strong><span>最大 5MB · 支持标准模板与截图中的列名</span><input type="file" accept=".xlsx,.csv" onChange={(event) => onFile(event.target.files?.[0] ?? null)} /></label><div className="toolbox-import-links"><a href="/api/toolbox/export?template=1"><Download size={14} />下载导入模板</a><span>导入模式</span><select value={mode} onChange={(event) => onMode(event.target.value)}><option value="dedupe">按分类 + 名称去重</option><option value="overwrite">覆盖同名数据</option><option value="append">全部追加</option></select><button type="button" onClick={onPreview} disabled={busy || !file}>{busy ? "读取中…" : "预览文件"}</button></div>{preview ? <div className="toolbox-import-preview"><div className="toolbox-import-stats"><span><strong>{preview.totalRows}</strong> 数据行</span><span><strong>{preview.headers.length - preview.unmappedHeaders.length}</strong> 已匹配列</span><span className={preview.errors.length ? "is-error" : "is-ok"}><strong>{preview.errors.length}</strong> 错误</span></div>{preview.unmappedHeaders.length ? <p className="toolbox-import-warning">未匹配列：{preview.unmappedHeaders.join("、")}。这些列将被忽略；如需保留，请先在表格设置中添加同名列。</p> : null}{preview.errors.length ? <div className="toolbox-import-errors">{preview.errors.slice(0, 12).map((error, index) => <p key={`${error.row}-${error.field}-${index}`}>第 {error.row} 行 · {error.field}：{error.message}</p>)}</div> : <div className="toolbox-import-table"><table><thead><tr><th>行</th><th>分类</th><th>名称</th><th>官网链接</th><th>评分</th></tr></thead><tbody>{preview.previewRows.map((row) => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td>{String(row.values.category ?? "")}</td><td>{String(row.values.name ?? "")}</td><td>{String(row.values.officialUrl ?? "")}</td><td>{String(row.values.rating ?? "")}</td></tr>)}</tbody></table></div>}</div> : null}</div><footer className="toolbox-modal-footer"><button className="toolbox-button" type="button" onClick={onClose}>取消</button><button className="toolbox-button toolbox-button--primary" type="button" disabled={busy || !preview || preview.errors.length > 0} onClick={onConfirm}>{busy ? "导入中…" : "确认导入"}</button></footer></Modal>;
}
