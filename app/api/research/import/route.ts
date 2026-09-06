import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { getViewer } from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { importAuthorizedPastedArticle, importResearchArticle, ResearchImportError } from "@/lib/research-import";
import { fallbackResearchSlug, normalizeResearchSlug } from "@/lib/research-routing";
import { assertSameOrigin } from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const automaticImportSchema = z.object({
  mode: z.literal("auto"),
  url: z.url().max(2_000),
  rightsConfirmed: z.literal(true)
});

const manualImportSchema = z.object({
  mode: z.literal("manual"),
  url: z.url().max(2_000),
  title: z.string().trim().min(4).max(160),
  body: z.string().min(40).max(300_000),
  bodyFormat: z.enum(["html", "markdown"]),
  rightsConfirmed: z.literal(true)
});

const importSchema = z.discriminatedUnion("mode", [automaticImportSchema, manualImportSchema]);

async function availableSlug(title: string) {
  const base = normalizeResearchSlug(title) || fallbackResearchSlug();
  const existing = await prisma.researchArticle.findUnique({ where: { slug: base }, select: { id: true } });
  return existing ? `${base}-${Date.now().toString(36)}` : base;
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await getViewer();
    if (!viewer || viewer.role !== "admin") return Response.json({ error: "只有管理员可以导入研究文章" }, { status: 403 });
    if (!viewer.twoFactorEnabled || !viewer.twoFactorPassed) {
      return Response.json({ error: "请先完成管理员双重验证" }, { status: 403 });
    }
    const input = importSchema.parse(await request.json());
    const rate = await checkRateLimit(`research:import:${viewer.id}`, 8, 60 * 60 * 1000);
    if (!rate.allowed) {
      return Response.json({ error: `导入过于频繁，请在 ${rate.retryAfterSeconds} 秒后重试` }, { status: 429 });
    }

    const imported = input.mode === "manual"
      ? await importAuthorizedPastedArticle({
          sourceUrl: input.url,
          title: input.title,
          body: input.body,
          bodyFormat: input.bodyFormat
        })
      : await importResearchArticle(input.url);
    const slug = await availableSlug(imported.title);
    const article = await prisma.researchArticle.create({
      data: {
        slug,
        title: imported.title,
        excerpt: imported.excerpt,
        body: imported.body,
        coverImageUrl: imported.coverImageUrl,
        category: imported.category,
        access: "PUBLIC",
        status: "DRAFT",
        sourceType: "INTERNAL",
        externalUrl: imported.sourceUrl,
        readingMinutes: imported.readingMinutes,
        featured: false,
        publishedAt: null,
        authorUserId: viewer.id
      }
    });

    await writeAudit({
      actorUserId: viewer.id,
      action: "admin.research.imported",
      targetType: "research_article",
      targetId: article.id,
      metadata: {
        slug: article.slug,
        sourceUrl: imported.sourceUrl,
        importedImageCount: imported.importedImageCount,
        skippedImageCount: imported.skippedImageCount,
        importMethod: imported.method,
        rightsConfirmed: true
      },
      request
    });

    return Response.json({
      ok: true,
      articleId: article.id,
      importedImageCount: imported.importedImageCount,
      skippedImageCount: imported.skippedImageCount,
      importMethod: imported.method,
      warning: imported.warning
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof ResearchImportError) {
      return Response.json({
        error: error.message,
        code: error.code,
        manualImport: error.code === "MANUAL_IMPORT_REQUIRED"
      }, { status: error.status });
    }
    if (error instanceof z.ZodError) return Response.json({ error: "请输入有效的公开文章 URL，并确认你拥有转载或导入授权" }, { status: 400 });
    console.error("[research:import] failed", { message: error instanceof Error ? error.message : "unknown" });
    return Response.json({ error: "文章导入失败，请稍后重试或改用手动编辑" }, { status: 500 });
  }
}
