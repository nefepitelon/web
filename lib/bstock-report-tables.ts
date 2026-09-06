export type ReportMetricLanguage = "zh" | "en" | "mixed";

export type ReportMetricTable = {
  id: string;
  kind: "metrics" | "matrix" | "facts";
  title: string;
  columns: string[];
  rows: string[][];
};

export type ReportMetricPartition = {
  remaining: string[];
  tables: ReportMetricTable[];
};

type ParsedField = { label: string; normalized: string; value: string };
type ParsedEntry = { fields: ParsedField[]; sourceIndex: number };

const indicatorLabels = new Set(["指标", "项目", "metric", "indicator", "item"]);
const knownLabels = new Set([
  ...indicatorLabels,
  "数值", "数据", "读数", "水平", "信号", "状态", "趋势", "判断", "评估", "结论", "说明", "期限",
  "value", "data", "reading", "level", "signal", "status", "trend", "assessment", "conclusion", "note", "period", "horizon",
  "代码", "标的", "公司", "评级", "目标价", "当前价格", "参考价格", "潜在空间", "上涨/下跌空间", "风险", "风险等级",
  "市值", "滚动市盈率", "预期市盈率", "peg比率", "营收增长", "毛利率", "贝塔", "波动率", "胜率", "盈亏比",
  "symbol", "ticker", "company", "rating", "price target", "target price", "current price", "reference price", "potential upside",
  "upside/downside", "upside / downside", "risk", "risk level", "market cap", "trailing p/e", "forward p/e", "peg ratio",
  "revenue growth", "gross margin", "beta", "volatility", "win rate", "profit factor",
  "rsi", "rsi-14", "macd", "adx", "obv", "ma-50", "ma-200", "vix", "cpi", "失业率", "fed rate", "treasury yield"
]);

function normalizeLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/&nbsp;|\u00a0/gi, " ")
    .replace(/[\s_-]+/g, " ")
    .replace(/[：:]+$/g, "")
    .trim();
}

function cleanDisplayText(value: string) {
  return String(value || "")
    .replace(/&nbsp;|&#160;|\u00a0/gi, " ")
    .replace(/&#124;/gi, "|")
    .replace(/&amp;/gi, "&")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\\n/g, " ")
    .replace(/[\*_`~]/g, "")
    .replace(/^\s*(?:[-•]|\d+[.)])\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitLabeledSegments(value: string) {
  const clean = cleanDisplayText(value)
    .replace(/^[-—–]{3,}$/, "")
    .replace(/\s+\|\s+/g, "；");
  if (!clean) return [];
  return clean.split(/[；;]+/).map((segment) => segment.trim()).filter(Boolean);
}

function parseReportFields(value: string): ParsedField[] | null {
  const fields = splitLabeledSegments(value).flatMap((segment) => {
    const separator = segment.search(/[：:]/);
    if (separator < 1 || separator > 48) return [];
    const label = cleanDisplayText(segment.slice(0, separator));
    const fieldValue = cleanDisplayText(segment.slice(separator + 1)).replace(/^[◆◇●▪]+\s*/, "");
    const normalized = normalizeLabel(label);
    if (!label || !fieldValue || !normalized) return [];
    return [{ label, normalized, value: fieldValue }];
  });
  if (fields.length < 2) return null;
  const recognized = fields.filter((field) => knownLabels.has(field.normalized)).length;
  const hasIndicator = fields.some((field) => indicatorLabels.has(field.normalized));
  if (!hasIndicator && recognized < 2) return null;
  return fields.slice(0, 10);
}

function tableCopy(language: ReportMetricLanguage) {
  const english = language === "en";
  return {
    metrics: english ? "Key metrics" : "关键指标",
    matrix: english ? "Data comparison" : "数据对比",
    facts: english ? "Data overview" : "数据概览",
    item: english ? "Item" : "项目",
    value: english ? "Value" : "数据"
  };
}

function uniqueColumns(entries: ParsedEntry[]) {
  const seen = new Set<string>();
  return entries.flatMap((entry) => entry.fields.flatMap((field) => {
    if (seen.has(field.normalized)) return [];
    seen.add(field.normalized);
    return [field.label];
  })).slice(0, 8);
}

function valueForColumn(entry: ParsedEntry, column: string) {
  const normalized = normalizeLabel(column);
  return entry.fields.find((field) => field.normalized === normalized)?.value || "—";
}

/**
 * Extracts table-shaped metric content from already-sanitized report strings.
 * It is deliberately presentation-only so historical reports and cached shares
 * gain the improved layout without regenerating or changing their source text.
 */
export function partitionReportMetricContent(
  values: readonly string[],
  language: ReportMetricLanguage = "mixed"
): ReportMetricPartition {
  const parsed: ParsedEntry[] = [];
  const remaining: string[] = [];

  values.forEach((value, sourceIndex) => {
    const clean = cleanDisplayText(value);
    if (!clean || /^[-—–]{3,}$/.test(clean)) return;
    const fields = parseReportFields(clean);
    if (!fields) {
      remaining.push(clean);
      return;
    }
    parsed.push({ fields, sourceIndex });
  });

  if (!parsed.length) return { remaining, tables: [] };
  const copy = tableCopy(language);
  const metricEntries = parsed.filter((entry) => entry.fields.some((field) => indicatorLabels.has(field.normalized)));
  const generalEntries = parsed.filter((entry) => !metricEntries.includes(entry));
  const tables: ReportMetricTable[] = [];

  if (metricEntries.length) {
    const columns = uniqueColumns(metricEntries);
    tables.push({
      id: "metrics",
      kind: "metrics",
      title: copy.metrics,
      columns,
      rows: metricEntries.slice(0, 24).map((entry) => columns.map((column) => valueForColumn(entry, column)))
    });
  }

  const matrixGroups = new Map<string, ParsedEntry[]>();
  generalEntries.forEach((entry) => {
    const signature = entry.fields.map((field) => field.normalized).join("|");
    const group = matrixGroups.get(signature) || [];
    group.push(entry);
    matrixGroups.set(signature, group);
  });

  const factEntries: ParsedEntry[] = [];
  let matrixIndex = 0;
  matrixGroups.forEach((entries) => {
    if (entries.length < 2) {
      factEntries.push(...entries);
      return;
    }
    const columns = entries[0].fields.map((field) => field.label).slice(0, 8);
    tables.push({
      id: `matrix-${matrixIndex += 1}`,
      kind: "matrix",
      title: copy.matrix,
      columns,
      rows: entries.slice(0, 24).map((entry) => columns.map((column) => valueForColumn(entry, column)))
    });
  });

  if (factEntries.length) {
    const rows = factEntries.flatMap((entry) => entry.fields.map((field) => [field.label, field.value])).slice(0, 30);
    tables.push({
      id: "facts",
      kind: "facts",
      title: copy.facts,
      columns: [copy.item, copy.value],
      rows
    });
  }

  return { remaining, tables: tables.slice(0, 5) };
}
