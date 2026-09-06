export type AgentStudioReportSummary = {
  rating: string | null;
  targetPrice: number | null;
  risks: string | null;
};

export type AgentStudioReadableSection = {
  id: string;
  title: string;
  paragraphs: string[];
  bullets: string[];
};

export type AgentStudioReadableReport = {
  version: 1;
  sourceFormat: "structured-json" | "markdown";
  language: "zh" | "en" | "mixed";
  title: string;
  subtitle: string | null;
  executiveSummary: string[];
  highlights: Array<{ label: string; value: string }>;
  sections: AgentStudioReadableSection[];
  conclusion: string[];
  disclaimer: string;
};

type UnknownRecord = Record<string, unknown>;

function cleanMarkdownCell(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[\*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function markdownTableCells(line: string) {
  if (!line.includes("|")) return [];
  const cells = line.trim().split("|");
  if (!cells[0]?.trim()) cells.shift();
  if (!cells.at(-1)?.trim()) cells.pop();
  return cells.map(cleanMarkdownCell);
}

function normalizedHeader(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function isTableSeparator(cells: string[]) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s/g, "")));
}

function parsePrice(value: string | null | undefined) {
  const match = cleanMarkdownCell(String(value || "")).match(/(?:US\$|USD|\$)?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i);
  if (!match) return null;
  const number = Number(match[1].replaceAll(",", ""));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null;
}

function firstString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstText(record: UnknownRecord | null, keys: string[]) {
  for (const key of keys) {
    const value = firstString(record?.[key]);
    if (value) return value;
  }
  return null;
}

const SECTION_TITLES: Record<string, string> = {
  executive_summary: "执行摘要",
  investment_summary: "投资摘要",
  investment_thesis: "投资逻辑",
  macro_snapshot: "宏观与市场环境",
  macro_analysis: "宏观分析",
  company_overview: "公司概览",
  business_overview: "业务概览",
  fundamental_analysis: "基本面分析",
  fundamentals: "基本面分析",
  financial_analysis: "财务分析",
  valuation_analysis: "估值分析",
  valuation: "估值分析",
  technical_analysis: "技术面分析",
  technicals: "技术面分析",
  catalysts: "潜在催化剂",
  key_catalysts: "关键催化剂",
  principal_risks: "主要风险",
  key_risks: "关键风险",
  risk_factors: "风险因素",
  portfolio_impact: "组合影响",
  portfolio_analysis: "组合分析",
  scenario_analysis: "情景分析",
  earnings_outlook: "盈利展望",
  recommendation: "投资建议",
  conclusion: "结论",
  investment_conclusion: "投资结论"
};

const STRUCTURED_SECTION_KEYS = [
  "macro_snapshot",
  "macro_analysis",
  "company_overview",
  "business_overview",
  "investment_thesis",
  "fundamental_analysis",
  "fundamentals",
  "financial_analysis",
  "valuation_analysis",
  "valuation",
  "technical_analysis",
  "technicals",
  "earnings_outlook",
  "catalysts",
  "key_catalysts",
  "scenario_analysis",
  "portfolio_impact",
  "portfolio_analysis",
  "principal_risks",
  "key_risks",
  "risk_factors"
] as const;

function readableKey(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (SECTION_TITLES[normalized]) return SECTION_TITLES[normalized];
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .trim();
}

function cleanReadableText(value: string) {
  return value
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/```/g, "")
    .replace(/!\[([^\]]*)]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/[\*_`~]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function limitedText(value: string, max = 1_600) {
  const clean = cleanReadableText(value);
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean;
}

function uniqueText(values: string[], limit: number) {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const clean = limitedText(value);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) return [];
    seen.add(key);
    return [clean];
  }).slice(0, limit);
}

function stringParagraphs(value: string) {
  const clean = cleanReadableText(value);
  if (!clean) return [];
  return uniqueText(clean.split(/\n\s*\n|\n(?=[A-Z\u3400-\u9fff][^\n]{30,})/).map((part) => part.trim()), 8);
}

function primitiveText(value: unknown) {
  if (typeof value === "string") return limitedText(value, 900);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "是" : "否";
  return null;
}

function recordBullet(record: UnknownRecord) {
  const parts = Object.entries(record).flatMap(([key, value]) => {
    const primitive = primitiveText(value);
    return primitive ? [`${readableKey(key)}：${primitive}`] : [];
  });
  return limitedText(parts.join("；"), 1_200);
}

function valueBlocks(value: unknown): { paragraphs: string[]; bullets: string[] } {
  if (typeof value === "string") {
    const lines = cleanReadableText(value).split("\n").map((line) => line.trim()).filter(Boolean);
    const bullets = lines.filter((line) => /^[-•]\s+/.test(line)).map((line) => line.replace(/^[-•]\s+/, ""));
    const paragraphs = lines.filter((line) => !/^[-•]\s+/.test(line));
    return { paragraphs: uniqueText(paragraphs.length ? paragraphs : stringParagraphs(value), 8), bullets: uniqueText(bullets, 12) };
  }
  if (Array.isArray(value)) {
    const bullets = value.flatMap((entry) => {
      const primitive = primitiveText(entry);
      if (primitive) return [primitive];
      const record = asRecord(entry);
      return record ? [recordBullet(record)] : [];
    });
    return { paragraphs: [], bullets: uniqueText(bullets, 14) };
  }
  const record = asRecord(value);
  if (!record) return { paragraphs: [], bullets: [] };
  const bullets = Object.entries(record).flatMap(([key, entry]) => {
    const primitive = primitiveText(entry);
    if (primitive) return [`${readableKey(key)}：${primitive}`];
    if (Array.isArray(entry)) {
      const nested = valueBlocks(entry).bullets;
      return nested.map((item) => `${readableKey(key)}：${item}`);
    }
    const nested = asRecord(entry);
    return nested ? [`${readableKey(key)}：${recordBullet(nested)}`] : [];
  });
  return { paragraphs: [], bullets: uniqueText(bullets, 16) };
}

function detectLanguage(value: string): "zh" | "en" | "mixed" {
  const chinese = (value.match(/[\u3400-\u9fff]/g) || []).length;
  const latin = (value.match(/[A-Za-z]/g) || []).length;
  if (chinese >= 20 && chinese >= latin * 0.12) return "zh";
  if (latin >= 40 && chinese < 20) return "en";
  return "mixed";
}

function reportConclusion(summary: AgentStudioReportSummary, symbol: string | null, explicit: string | null) {
  if (explicit) return uniqueText(stringParagraphs(explicit), 4);
  const subject = symbol || "该标的";
  const rating = summary.rating ? `评级为 ${summary.rating}` : "未给出可识别的最终评级";
  const target = summary.targetPrice != null ? `，目标价为 $${summary.targetPrice.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "";
  return [`Agent Studio 对 ${subject} 的研报${rating}${target}。应结合报告中的基本面、估值、技术面与风险因素综合判断。`];
}

function structuredReadableReport(clean: string): AgentStudioReadableReport | null {
  if (!clean.trimStart().startsWith("{")) return null;
  try {
    const root = asRecord(JSON.parse(clean));
    if (!root) return null;
    const analysis = Array.isArray(root.analyses) ? asRecord(root.analyses[0]) : asRecord(root.analysis);
    const summary = extractAgentStudioReportSummary(clean);
    const symbol = firstText(analysis, ["symbol", "ticker"]) || firstText(root, ["symbol", "ticker"]);
    const company = firstText(analysis, ["company", "company_name", "name"]) || firstText(root, ["company", "company_name", "name"]);
    const explicitTitle = firstText(root, ["title", "report_title"]);
    const executive = firstText(root, ["executive_summary", "investment_summary", "summary"])
      || firstText(analysis, ["executive_summary", "investment_summary", "summary"]);
    const highlights = [
      symbol ? { label: "标的", value: symbol } : null,
      company ? { label: "公司", value: company } : null,
      summary.rating ? { label: "评级", value: summary.rating } : null,
      summary.targetPrice != null ? { label: "目标价", value: `$${summary.targetPrice.toLocaleString("en-US", { maximumFractionDigits: 2 })}` } : null,
      primitiveText(analysis?.current_price) ? { label: "参考价格", value: String(primitiveText(analysis?.current_price)) } : null,
      primitiveText(analysis?.upside_downside ?? analysis?.upside) ? { label: "潜在空间", value: String(primitiveText(analysis?.upside_downside ?? analysis?.upside)) } : null,
      primitiveText(analysis?.risk ?? analysis?.risk_level) ? { label: "风险等级", value: String(primitiveText(analysis?.risk ?? analysis?.risk_level)) } : null
    ].filter((item): item is { label: string; value: string } => Boolean(item));
    const sections: AgentStudioReadableSection[] = [];
    const consumed = new Set<string>();
    for (const key of STRUCTURED_SECTION_KEYS) {
      const value = analysis?.[key] ?? root[key];
      if (value == null || consumed.has(key)) continue;
      const blocks = valueBlocks(value);
      if (!blocks.paragraphs.length && !blocks.bullets.length) continue;
      consumed.add(key);
      sections.push({ id: key.replace(/_/g, "-"), title: readableKey(key), ...blocks });
    }
    if (!sections.length && analysis) {
      for (const [key, value] of Object.entries(analysis)) {
        if (["symbol", "ticker", "company", "company_name", "name", "rating", "price_target", "target_price", "current_price", "upside_downside", "upside", "risk", "risk_level"].includes(key)) continue;
        const blocks = valueBlocks(value);
        if (!blocks.paragraphs.length && !blocks.bullets.length) continue;
        sections.push({ id: key.replace(/_/g, "-"), title: readableKey(key), ...blocks });
        if (sections.length >= 12) break;
      }
    }
    const explicitConclusion = firstText(analysis, ["conclusion", "investment_conclusion", "recommendation"])
      || firstText(root, ["conclusion", "investment_conclusion", "recommendation"]);
    const sourceText = [executive, ...sections.flatMap((section) => [...section.paragraphs, ...section.bullets])].filter(Boolean).join(" ");
    return {
      version: 1,
      sourceFormat: "structured-json",
      language: detectLanguage(sourceText),
      title: explicitTitle || `${company || symbol || "Agent Studio"} AI 投资研报`,
      subtitle: [symbol, company].filter(Boolean).join(" · ") || null,
      executiveSummary: executive ? uniqueText(stringParagraphs(executive), 5) : [],
      highlights,
      sections: sections.slice(0, 12),
      conclusion: reportConclusion(summary, symbol || company, explicitConclusion),
      disclaimer: "本赏析忠实整理 Agent Studio 返回内容，仅用于研究辅助；原始研报、实时价格与链上成交结果应分别核验。"
    };
  } catch {
    return null;
  }
}

function markdownReadableReport(clean: string): AgentStudioReadableReport {
  const lines = clean.replace(/\r/g, "").split("\n");
  let title = "Agent Studio AI 投资研报";
  const sections: AgentStudioReadableSection[] = [];
  let current: AgentStudioReadableSection = { id: "report-body", title: "研报正文", paragraphs: [], bullets: [] };
  let paragraph: string[] = [];
  let table: string[] = [];

  const flushParagraph = () => {
    const value = limitedText(paragraph.join(" "));
    if (value) current.paragraphs.push(value);
    paragraph = [];
  };
  const flushTable = () => {
    if (table.length < 2) {
      paragraph.push(...table);
      table = [];
      return;
    }
    const headers = markdownTableCells(table[0]);
    const rows = table.slice(1).map(markdownTableCells).filter((row) => row.length && !isTableSeparator(row));
    rows.forEach((row) => {
      const value = headers.map((header, index) => row[index] ? `${header}：${row[index]}` : "").filter(Boolean).join("；");
      if (value) current.bullets.push(limitedText(value, 1_200));
    });
    table = [];
  };
  const flushSection = () => {
    flushTable();
    flushParagraph();
    current.paragraphs = uniqueText(current.paragraphs, 10);
    current.bullets = uniqueText(current.bullets, 16);
    if (current.paragraphs.length || current.bullets.length) sections.push(current);
  };

  for (const originalLine of lines) {
    const line = originalLine.trim();
    if (!line || /^```/.test(line)) {
      flushTable();
      flushParagraph();
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const headingText = cleanReadableText(heading[2]);
      if (heading[1].length === 1 && title === "Agent Studio AI 投资研报") {
        title = headingText;
        continue;
      }
      flushSection();
      current = {
        id: headingText.toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || `section-${sections.length + 1}`,
        title: headingText,
        paragraphs: [],
        bullets: []
      };
      continue;
    }
    if (line.includes("|") && markdownTableCells(line).length >= 2) {
      flushParagraph();
      table.push(line);
      continue;
    }
    flushTable();
    if (/^[-*•]\s+/.test(line) || /^\d+[.)]\s+/.test(line)) {
      flushParagraph();
      current.bullets.push(limitedText(line.replace(/^(?:[-*•]|\d+[.)])\s+/, ""), 1_200));
    } else {
      paragraph.push(line);
    }
  }
  flushSection();

  const summaryIndex = sections.findIndex((section) => /executive|investment summary|摘要|投资概览/i.test(section.title));
  const conclusionIndex = sections.findIndex((section) => /conclusion|recommendation|结论|投资建议/i.test(section.title));
  const summarySection = summaryIndex >= 0 ? sections[summaryIndex] : sections[0];
  const conclusionSection = conclusionIndex >= 0 ? sections[conclusionIndex] : null;
  const summary = extractAgentStudioReportSummary(clean);
  const highlights = [
    summary.rating ? { label: "评级", value: summary.rating } : null,
    summary.targetPrice != null ? { label: "目标价", value: `$${summary.targetPrice.toLocaleString("en-US", { maximumFractionDigits: 2 })}` } : null
  ].filter((item): item is { label: string; value: string } => Boolean(item));
  const executiveSummary = summarySection
    ? uniqueText([...summarySection.paragraphs, ...summarySection.bullets].slice(0, 5), 5)
    : [];
  const contentSections = sections.filter((_, index) => index !== summaryIndex && index !== conclusionIndex).slice(0, 12);
  const languageSource = sections.flatMap((section) => [...section.paragraphs, ...section.bullets]).join(" ");

  return {
    version: 1,
    sourceFormat: "markdown",
    language: detectLanguage(languageSource),
    title,
    subtitle: null,
    executiveSummary,
    highlights,
    sections: contentSections,
    conclusion: conclusionSection
      ? uniqueText([...conclusionSection.paragraphs, ...conclusionSection.bullets], 5)
      : reportConclusion(summary, null, null),
    disclaimer: "本赏析忠实整理 Agent Studio 返回内容，仅用于研究辅助；原始研报、实时价格与链上成交结果应分别核验。"
  };
}

export function buildAgentStudioReadableReport(report: string): AgentStudioReadableReport {
  const clean = String(report || "").replace(/\r/g, "").trim();
  if (!clean) {
    return {
      version: 1,
      sourceFormat: "markdown",
      language: "mixed",
      title: "Agent Studio AI 投资研报",
      subtitle: null,
      executiveSummary: ["研报正文为空，当前无法生成可读赏析。"],
      highlights: [],
      sections: [],
      conclusion: ["请回捞或重新生成完整的 Agent Studio 研报后再查看。"],
      disclaimer: "本赏析仅整理 Agent Studio 返回内容，不构成投资建议。"
    };
  }
  return structuredReadableReport(clean) || markdownReadableReport(clean);
}

function structuredRiskText(value: unknown) {
  if (!Array.isArray(value)) return null;
  const entries = value.flatMap((entry) => {
    if (typeof entry === "string" && entry.trim()) return [entry.trim()];
    const record = asRecord(entry);
    if (!record) return [];
    const factor = firstString(record.factor);
    const assessment = firstString(record.assessment);
    const observation = firstString(record.supporting_observation) || firstString(record.observation);
    const text = [factor, assessment, observation].filter(Boolean).join("：");
    return text ? [text] : [];
  });
  return entries.length ? entries.join("\n").slice(0, 800) : null;
}

function structuredSummary(clean: string): AgentStudioReportSummary | null {
  if (!clean.trimStart().startsWith("{")) return null;
  try {
    const root = asRecord(JSON.parse(clean));
    if (!root) return null;
    const firstAnalysis = Array.isArray(root.analyses) ? asRecord(root.analyses[0]) : null;
    const ratingCandidate = firstString(firstAnalysis?.rating) || firstString(root.rating);
    const rating = agentStudioRatingScore(ratingCandidate) == null ? null : ratingCandidate;
    const targetPrice = parsePrice(String(
      firstAnalysis?.price_target
      ?? firstAnalysis?.target_price
      ?? root.price_target
      ?? root.target_price
      ?? ""
    ));
    const risks = structuredRiskText(firstAnalysis?.principal_risks)
      || structuredRiskText(root.principal_risks)
      || structuredRiskText(root.risk_factors);
    return rating || targetPrice != null || risks ? { rating, targetPrice, risks } : null;
  } catch {
    return null;
  }
}

export function agentStudioRatingScore(rating: string | null | undefined) {
  if (!rating) return null;
  const normalized = cleanMarkdownCell(rating).toLowerCase();
  if (/strong\s*sell|强烈卖出|强力卖出/.test(normalized)) return 20;
  if (/(?:^|\b)sell(?:\b|$)|underperform|underweight|卖出|减持/.test(normalized)) return 35;
  if (/strong\s*buy|conviction\s*buy|强烈买入|强力买入/.test(normalized)) return 88;
  if (/(?:^|\b)buy(?:\b|$)|outperform|overweight|accumulate|买入|增持/.test(normalized)) return 82;
  if (/hold|neutral|market\s*perform|equal\s*weight|中性|持有/.test(normalized)) return 60;
  return null;
}

function tableSummary(clean: string) {
  const lines = clean.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const headers = markdownTableCells(lines[index]);
    if (!headers.length) continue;
    const normalized = headers.map(normalizedHeader);
    const ratingIndex = normalized.findIndex((header) => ["rating", "recommendation", "investment rating", "评级", "投资评级"].includes(header));
    const targetIndex = normalized.findIndex((header) => ["price target", "target price", "目标价"].includes(header));
    if (ratingIndex < 0 && targetIndex < 0) continue;

    for (let rowIndex = index + 1; rowIndex < Math.min(lines.length, index + 6); rowIndex += 1) {
      const row = markdownTableCells(lines[rowIndex]);
      if (!row.length || isTableSeparator(row)) continue;
      const ratingCandidate = ratingIndex >= 0 ? cleanMarkdownCell(row[ratingIndex] || "") : "";
      const rating = agentStudioRatingScore(ratingCandidate) == null ? null : ratingCandidate;
      const targetPrice = targetIndex >= 0 ? parsePrice(row[targetIndex]) : null;
      if (rating || targetPrice != null) return { rating, targetPrice };
    }
  }
  return { rating: null, targetPrice: null };
}

export function extractAgentStudioReportSummary(markdown: string): AgentStudioReportSummary {
  const clean = markdown.replace(/\r/g, "");
  const structured = structuredSummary(clean);
  if (structured) return structured;
  const fromTable = tableSummary(clean);
  const inlineRating = clean.match(/(?:^|\n)\s*(?:[-*]\s*)?\*{0,2}(?:rating|recommendation|investment rating|评级|投资评级)\*{0,2}\s*[:：]\s*\*{0,2}([^\n|*]{1,40})/im)?.[1];
  const normalizedInlineRating = inlineRating ? cleanMarkdownCell(inlineRating) : null;
  const rating = fromTable.rating
    || (agentStudioRatingScore(normalizedInlineRating) == null ? null : normalizedInlineRating);
  const inlineTarget = clean.match(/(?:target price|price target|目标价)\*{0,2}\s*[:：]\s*\*{0,2}\s*(?:US\$|USD|\$)?\s*([0-9][0-9,.]*)/i)?.[1];
  const targetPrice = fromTable.targetPrice ?? parsePrice(inlineTarget);
  const riskSection = clean.match(/(?:##+\s*)?(?:key risks|risk factors|风险因素|主要风险)[^\n]*\n([\s\S]{0,1200})/i)?.[1]
    ?.split(/\n#{1,6}\s/)[0]
    ?.trim() || null;
  return { rating, targetPrice, risks: riskSection?.slice(0, 800) || null };
}
