import "server-only";

import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  buildAgentStudioReadableReport,
  type AgentStudioReadableReport,
  type AgentStudioReadableSection
} from "@/lib/bstock-agent-studio-report";
import { isDatabaseConfigured, prisma } from "@/lib/prisma";

export type AgentStudioReportLanguage = "zh" | "en";

const localizedSectionSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(240),
  paragraphs: z.array(z.string().max(2_000)).max(8),
  bullets: z.array(z.string().max(1_500)).max(16)
}).strict();

const localizedContentSchema = z.object({
  title: z.string().min(1).max(300),
  subtitle: z.string().max(300).nullable(),
  executiveSummary: z.array(z.string().max(2_000)).max(6),
  highlights: z.array(z.object({
    label: z.string().min(1).max(80),
    value: z.string().min(1).max(300)
  }).strict()).max(12),
  sections: z.array(localizedSectionSchema).max(12),
  conclusion: z.array(z.string().max(2_000)).max(6),
  disclaimer: z.string().min(1).max(1_000)
}).strict();

const cachedReportSchema = localizedContentSchema.extend({
  version: z.literal(1),
  sourceFormat: z.enum(["structured-json", "markdown"]),
  language: z.enum(["zh", "en", "mixed"])
}).strict();

const translationJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    subtitle: { type: ["string", "null"] },
    executiveSummary: { type: "array", items: { type: "string" }, maxItems: 6 },
    highlights: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        properties: { label: { type: "string" }, value: { type: "string" } },
        required: ["label", "value"]
      }
    },
    sections: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          paragraphs: { type: "array", items: { type: "string" }, maxItems: 8 },
          bullets: { type: "array", items: { type: "string" }, maxItems: 16 }
        },
        required: ["id", "title", "paragraphs", "bullets"]
      }
    },
    conclusion: { type: "array", items: { type: "string" }, maxItems: 6 },
    disclaimer: { type: "string" }
  },
  required: ["title", "subtitle", "executiveSummary", "highlights", "sections", "conclusion", "disclaimer"]
} as const;

const staticLabels = {
  zh: {
    symbol: "标的",
    company: "公司",
    rating: "评级",
    target: "目标价",
    current: "参考价格",
    upside: "潜在空间",
    risk: "风险等级"
  },
  en: {
    symbol: "Symbol",
    company: "Company",
    rating: "Rating",
    target: "Price target",
    current: "Reference price",
    upside: "Potential upside",
    risk: "Risk level"
  }
} as const;

const labelAliases: Record<string, keyof typeof staticLabels.zh> = {
  "标的": "symbol", symbol: "symbol", ticker: "symbol",
  "公司": "company", company: "company",
  "评级": "rating", rating: "rating",
  "目标价": "target", "price target": "target", target: "target",
  "参考价格": "current", "current price": "current", "reference price": "current",
  "潜在空间": "upside", "potential upside": "upside", upside: "upside",
  "风险等级": "risk", "risk level": "risk", risk: "risk"
};

const sectionTitleAliases: Record<string, { zh: string; en: string }> = {
  "执行摘要": { zh: "执行摘要", en: "Executive summary" },
  "投资摘要": { zh: "投资摘要", en: "Investment summary" },
  "投资逻辑": { zh: "投资逻辑", en: "Investment thesis" },
  "宏观与市场环境": { zh: "宏观与市场环境", en: "Macro and market backdrop" },
  "宏观分析": { zh: "宏观分析", en: "Macro analysis" },
  "公司概览": { zh: "公司概览", en: "Company overview" },
  "业务概览": { zh: "业务概览", en: "Business overview" },
  "基本面分析": { zh: "基本面分析", en: "Fundamental analysis" },
  "财务分析": { zh: "财务分析", en: "Financial analysis" },
  "估值分析": { zh: "估值分析", en: "Valuation analysis" },
  "技术面分析": { zh: "技术面分析", en: "Technical analysis" },
  "潜在催化剂": { zh: "潜在催化剂", en: "Potential catalysts" },
  "关键催化剂": { zh: "关键催化剂", en: "Key catalysts" },
  "主要风险": { zh: "主要风险", en: "Principal risks" },
  "关键风险": { zh: "关键风险", en: "Key risks" },
  "风险因素": { zh: "风险因素", en: "Risk factors" },
  "组合影响": { zh: "组合影响", en: "Portfolio impact" },
  "组合分析": { zh: "组合分析", en: "Portfolio analysis" },
  "情景分析": { zh: "情景分析", en: "Scenario analysis" },
  "盈利展望": { zh: "盈利展望", en: "Earnings outlook" },
  "投资建议": { zh: "投资建议", en: "Recommendation" },
  "结论": { zh: "结论", en: "Conclusion" },
  "投资结论": { zh: "投资结论", en: "Investment conclusion" },
  "研报正文": { zh: "研报正文", en: "Research report" }
};

Object.values(sectionTitleAliases).forEach((entry) => {
  sectionTitleAliases[entry.en.toLowerCase()] = entry;
});

export class ReportLocalizationError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, code = "REPORT_LOCALIZATION_FAILED", status = 502) {
    super(message);
    this.name = "ReportLocalizationError";
    this.code = code;
    this.status = status;
  }
}

function clampText(value: string, max: number) {
  const clean = String(value || "").trim();
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean;
}

function compactSection(section: AgentStudioReadableSection) {
  return {
    id: section.id,
    title: clampText(section.title, 200),
    paragraphs: section.paragraphs.slice(0, 6).map((value) => clampText(value, 900)).filter(Boolean),
    bullets: section.bullets.slice(0, 10).map((value) => clampText(value, 600)).filter(Boolean)
  };
}

function compactReport(report: AgentStudioReadableReport) {
  return {
    title: clampText(report.title, 260),
    subtitle: report.subtitle ? clampText(report.subtitle, 260) : null,
    executiveSummary: report.executiveSummary.slice(0, 6).map((value) => clampText(value, 1_200)).filter(Boolean),
    highlights: report.highlights.slice(0, 12).map((item) => ({
      label: clampText(item.label, 70),
      value: clampText(item.value, 260)
    })),
    sections: report.sections.slice(0, 12).map(compactSection),
    conclusion: report.conclusion.slice(0, 6).map((value) => clampText(value, 1_200)).filter(Boolean),
    disclaimer: clampText(report.disclaimer, 800)
  };
}

function localizeStaticShell(report: AgentStudioReadableReport, language: AgentStudioReportLanguage) {
  const labels = staticLabels[language];
  const localizedHighlights = report.highlights.map((item) => {
    const key = labelAliases[item.label.trim().toLowerCase()] || labelAliases[item.label.trim()];
    return { ...item, label: key ? labels[key] : item.label };
  });
  const localizedSections = report.sections.map((section) => {
    const alias = sectionTitleAliases[section.title.trim()] || sectionTitleAliases[section.title.trim().toLowerCase()];
    return { ...section, title: alias ? alias[language] : section.title };
  });
  return {
    ...report,
    language,
    highlights: localizedHighlights,
    sections: localizedSections,
    disclaimer: language === "zh"
      ? "本赏析忠实整理 Agent Studio 返回内容，仅用于研究辅助；原始研报、实时价格与链上成交结果应分别核验。"
      : "This reading faithfully organizes the Agent Studio response for research support only. Verify the source report, live prices, and on-chain execution separately."
  } satisfies AgentStudioReadableReport;
}

function outputText(payload: unknown) {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  if (typeof root.output_text === "string") return root.output_text;
  const output = Array.isArray(root.output) ? root.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? (item as Record<string, unknown>).content as unknown[]
      : [];
    for (const part of content) {
      if (part && typeof part === "object" && (part as Record<string, unknown>).type === "output_text") {
        const text = (part as Record<string, unknown>).text;
        if (typeof text === "string") return text;
      }
    }
  }
  return "";
}

async function translateReport(report: AgentStudioReadableReport, language: AgentStudioReportLanguage) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new ReportLocalizationError(
      language === "zh" ? "生产环境尚未配置研报中文翻译服务。" : "The report English translation service is not configured.",
      "REPORT_TRANSLATION_NOT_CONFIGURED",
      503
    );
  }

  const targetName = language === "zh" ? "简体中文" : "English";
  const source = compactReport(report);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_TEXT_MODEL || "gpt-5.6-terra",
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 16_000,
      prompt_cache_key: createHash("sha256").update(`bstock-report:${language}:${report.title}`).digest("hex"),
      instructions: [
        `Translate the supplied investment-research reading into ${targetName}.`,
        "Translate every human-readable title, label, paragraph, bullet, conclusion, and disclaimer.",
        "Preserve section ids exactly. Preserve all numbers, prices, percentages, ticker symbols, company names, URLs, hashes, ratings, and financial meaning.",
        "Do not add, remove, soften, strengthen, summarize, or fact-check any investment claim. Do not add investment advice.",
        "Return only the requested JSON schema."
      ].join(" "),
      input: JSON.stringify(source),
      text: { format: { type: "json_schema", name: "localized_bstock_research", strict: true, schema: translationJsonSchema } }
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(55_000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.error?.message === "string" ? payload.error.message : `OpenAI translation returned HTTP ${response.status}.`;
    throw new ReportLocalizationError(message, "REPORT_TRANSLATION_UPSTREAM_FAILED", response.status === 429 ? 429 : 502);
  }
  const parsed = localizedContentSchema.parse(JSON.parse(outputText(payload)));
  const sourceIds = source.sections.map((section) => section.id);
  const translatedIds = parsed.sections.map((section) => section.id);
  if (sourceIds.length !== translatedIds.length || sourceIds.some((id, index) => id !== translatedIds[index])) {
    throw new ReportLocalizationError("研报翻译返回的模块结构与原文不一致。", "REPORT_TRANSLATION_STRUCTURE_MISMATCH");
  }
  return {
    version: 1,
    sourceFormat: report.sourceFormat,
    language,
    ...parsed
  } satisfies AgentStudioReadableReport;
}

export async function localizedAgentStudioReport(options: {
  researchJobId: string;
  reportMarkdown: string;
  language: AgentStudioReportLanguage;
}) {
  if (isDatabaseConfigured()) {
    const cached = await prisma.bstockResearchTranslation.findUnique({
      where: { researchJobId_language: { researchJobId: options.researchJobId, language: options.language } },
      select: { report: true, model: true }
    });
    const parsed = cachedReportSchema.safeParse(cached?.report);
    if (parsed.success) return { report: parsed.data as AgentStudioReadableReport, cached: true, model: cached?.model ?? null };
  }

  const source = buildAgentStudioReadableReport(options.reportMarkdown);
  const localized = source.language === options.language
    ? localizeStaticShell(source, options.language)
    : await translateReport(source, options.language);
  const model = source.language === options.language ? null : process.env.OPENAI_TEXT_MODEL || "gpt-5.6-terra";

  if (isDatabaseConfigured()) {
    await prisma.bstockResearchTranslation.upsert({
      where: { researchJobId_language: { researchJobId: options.researchJobId, language: options.language } },
      update: { report: localized as unknown as Prisma.InputJsonValue, sourceLanguage: source.language, model },
      create: {
        researchJobId: options.researchJobId,
        language: options.language,
        sourceLanguage: source.language,
        report: localized as unknown as Prisma.InputJsonValue,
        model
      }
    });
  }
  return { report: localized, cached: false, model };
}

export function parseStoredAgentStudioReport(value: Prisma.JsonValue) {
  const parsed = cachedReportSchema.safeParse(value);
  return parsed.success ? parsed.data as AgentStudioReadableReport : null;
}
