"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requireAdmin, requireViewer } from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { fallbackResearchSlug, normalizeResearchSlug, researchArticlePath } from "@/lib/research-routing";

const articleSchema = z.object({
  title: z.string().trim().min(4).max(160),
  slug: z.string().trim().max(160).optional(),
  category: z.string().trim().min(2).max(40),
  excerpt: z.string().trim().min(12).max(600),
  body: z.string().trim().min(40).max(100_000),
  coverImageUrl: z.string().trim().max(2_000).optional(),
  access: z.enum(["PUBLIC", "FREE", "PRO", "MAX"]),
  status: z.enum(["DRAFT", "PUBLISHED"]),
  sourceType: z.enum(["INTERNAL", "EXTERNAL"]),
  externalUrl: z.string().trim().max(2_000).optional(),
  readingMinutes: z.coerce.number().int().min(0).max(90)
}).superRefine((value, context) => {
  if (value.sourceType === "EXTERNAL") {
    const parsed = z.string().url().safeParse(value.externalUrl);
    if (!parsed.success || !/^https?:\/\//i.test(value.externalUrl ?? "")) {
      context.addIssue({ code: "custom", path: ["externalUrl"], message: "外链文章必须提供有效的 HTTPS URL" });
    }
  }
  if (value.sourceType === "INTERNAL" && value.externalUrl) {
    const parsed = z.string().url().safeParse(value.externalUrl);
    if (!parsed.success || !/^https?:\/\//i.test(value.externalUrl)) {
      context.addIssue({ code: "custom", path: ["externalUrl"], message: "导入来源必须是有效的 HTTP 或 HTTPS URL" });
    }
  }
  if (value.coverImageUrl && !value.coverImageUrl.startsWith("/") && !z.string().url().safeParse(value.coverImageUrl).success) {
    context.addIssue({ code: "custom", path: ["coverImageUrl"], message: "封面图片地址无效" });
  }
});

const articleIdSchema = z.string().trim().min(3).max(191);
const commentSchema = z.string().trim().min(2).max(2_000);

function estimateReadingMinutes(body: string) {
  const chineseCharacters = (body.match(/[\u3400-\u9fff]/g) ?? []).length;
  const words = body.replace(/[\u3400-\u9fff]/g, " ").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(chineseCharacters / 350 + words / 220));
}

function parseArticleForm(formData: FormData) {
  return articleSchema.parse({
    title: formData.get("title"),
    slug: formData.get("slug") || undefined,
    category: formData.get("category"),
    excerpt: formData.get("excerpt"),
    body: formData.get("body"),
    coverImageUrl: formData.get("coverImageUrl") || undefined,
    access: formData.get("access"),
    status: formData.get("status"),
    sourceType: formData.get("sourceType"),
    externalUrl: formData.get("externalUrl") || undefined,
    readingMinutes: formData.get("readingMinutes") || 0
  });
}

async function availableResearchSlug(value: string, currentArticleId?: string) {
  const baseSlug = normalizeResearchSlug(value) || fallbackResearchSlug();
  const existing = await prisma.researchArticle.findFirst({
    where: {
      slug: baseSlug,
      ...(currentArticleId ? { NOT: { id: currentArticleId } } : {})
    },
    select: { id: true }
  });
  return existing ? `${baseSlug}-${Date.now().toString(36)}` : baseSlug;
}

export async function createResearchArticleAction(formData: FormData) {
  const admin = await requireAdmin("/research");
  const input = parseArticleForm(formData);

  const slug = await availableResearchSlug(input.slug || input.title);
  const article = await prisma.researchArticle.create({
    data: {
      slug,
      title: input.title,
      excerpt: input.excerpt,
      body: input.body,
      coverImageUrl: input.coverImageUrl || null,
      category: input.category.toUpperCase(),
      access: input.access,
      status: input.status,
      sourceType: input.sourceType,
      externalUrl: input.externalUrl || null,
      readingMinutes: input.readingMinutes || estimateReadingMinutes(input.body),
      featured: input.status === "PUBLISHED" && formData.get("featured") === "on",
      publishedAt: input.status === "PUBLISHED" ? new Date() : null,
      authorUserId: admin.id
    }
  });

  await writeAudit({
    actorUserId: admin.id,
    action: "admin.research.created",
    targetType: "research_article",
    targetId: article.id,
    metadata: { slug: article.slug, status: article.status, access: article.access, sourceType: article.sourceType }
  });
  const articlePath = researchArticlePath(article.slug);
  revalidatePath("/research");
  revalidatePath(articlePath);
  redirect(articlePath);
}

export async function updateResearchArticleAction(articleIdValue: string, formData: FormData) {
  const articleId = articleIdSchema.parse(articleIdValue);
  const admin = await requireAdmin("/research");
  const input = parseArticleForm(formData);
  const previous = await prisma.researchArticle.findUnique({
    where: { id: articleId },
    select: { id: true, slug: true, publishedAt: true }
  });

  if (!previous) redirect("/research?error=article-not-found#research-archive");

  const slug = await availableResearchSlug(input.slug || input.title, articleId);
  const article = await prisma.researchArticle.update({
    where: { id: articleId },
    data: {
      slug,
      title: input.title,
      excerpt: input.excerpt,
      body: input.body,
      coverImageUrl: input.coverImageUrl || null,
      category: input.category.toUpperCase(),
      access: input.access,
      status: input.status,
      sourceType: input.sourceType,
      externalUrl: input.externalUrl || null,
      readingMinutes: input.readingMinutes || estimateReadingMinutes(input.body),
      featured: input.status === "PUBLISHED" && formData.get("featured") === "on",
      publishedAt: input.status === "PUBLISHED" ? previous.publishedAt ?? new Date() : null
    }
  });

  await writeAudit({
    actorUserId: admin.id,
    action: "admin.research.updated",
    targetType: "research_article",
    targetId: article.id,
    metadata: { slug: article.slug, previousSlug: previous.slug, status: article.status, access: article.access, featured: article.featured }
  });
  revalidatePath("/research");
  revalidatePath(researchArticlePath(previous.slug));
  const articlePath = researchArticlePath(article.slug);
  revalidatePath(articlePath);
  redirect(articlePath);
}

export async function unpublishResearchArticleAction(articleIdValue: string) {
  const articleId = articleIdSchema.parse(articleIdValue);
  const admin = await requireAdmin("/research");
  const previous = await prisma.researchArticle.findUnique({
    where: { id: articleId },
    select: { id: true, slug: true, status: true }
  });

  if (!previous) redirect("/research?error=article-not-found#research-archive");

  await prisma.researchArticle.update({
    where: { id: articleId },
    data: { status: "DRAFT", featured: false, publishedAt: null }
  });
  await writeAudit({
    actorUserId: admin.id,
    action: "admin.research.unpublished",
    targetType: "research_article",
    targetId: articleId,
    metadata: { slug: previous.slug, previousStatus: previous.status }
  });
  revalidatePath("/research");
  revalidatePath(researchArticlePath(previous.slug));
  redirect("/research?unpublished=1#research-archive");
}

export async function deleteResearchDraftAction(articleIdValue: string) {
  const articleId = articleIdSchema.parse(articleIdValue);
  const admin = await requireAdmin("/research");
  const draft = await prisma.researchArticle.findUnique({
    where: { id: articleId },
    select: { id: true, slug: true, title: true, status: true }
  });

  if (!draft) redirect("/research?error=article-not-found#research-archive");
  if (draft.status !== "DRAFT") redirect("/research?error=published-delete-blocked#research-archive");

  await prisma.researchArticle.delete({ where: { id: draft.id } });
  await writeAudit({
    actorUserId: admin.id,
    action: "admin.research.draft_deleted",
    targetType: "research_article",
    targetId: draft.id,
    metadata: { slug: draft.slug, title: draft.title, previousStatus: draft.status }
  });
  revalidatePath("/research");
  revalidatePath(researchArticlePath(draft.slug));
  redirect("/research?deleted=1#research-archive");
}

export async function toggleResearchBookmarkAction(articleIdValue: string) {
  const articleId = articleIdSchema.parse(articleIdValue);
  const article = await prisma.researchArticle.findUnique({
    where: { id: articleId },
    select: { id: true, slug: true, status: true }
  });
  if (!article) return;
  const articlePath = researchArticlePath(article.slug);
  const viewer = await requireViewer(articlePath);
  if (article.status !== "PUBLISHED" && viewer.role !== "admin") return;

  const existing = await prisma.researchBookmark.findUnique({
    where: { articleId_userId: { articleId, userId: viewer.id } },
    select: { id: true }
  });
  if (existing) {
    await prisma.researchBookmark.delete({ where: { id: existing.id } });
  } else {
    await prisma.researchBookmark.create({ data: { articleId, userId: viewer.id } });
  }
  revalidatePath("/research");
  revalidatePath(articlePath);
}

export async function createResearchCommentAction(articleIdValue: string, formData: FormData) {
  const articleId = articleIdSchema.parse(articleIdValue);
  const body = commentSchema.parse(formData.get("comment"));
  const article = await prisma.researchArticle.findUnique({
    where: { id: articleId },
    select: { id: true, slug: true, status: true }
  });
  if (!article) return;
  const articlePath = researchArticlePath(article.slug);
  const viewer = await requireViewer(`${articlePath}#comments`);
  if (article.status !== "PUBLISHED" && viewer.role !== "admin") return;

  await prisma.researchComment.create({
    data: { articleId, userId: viewer.id, body }
  });
  revalidatePath("/research");
  revalidatePath(articlePath);
}
