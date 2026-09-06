import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { researchSlugCandidates } from "@/lib/research-routing";

export const getPublishedResearchArticle = cache((slug: string) => prisma.researchArticle.findFirst({
  where: {
    slug: { in: researchSlugCandidates(slug) },
    status: "PUBLISHED",
    publishedAt: { lte: new Date() }
  },
  select: {
    id: true,
    slug: true,
    title: true,
    excerpt: true,
    coverImageUrl: true,
    category: true,
    readingMinutes: true,
    sourceType: true,
    publishedAt: true,
    createdAt: true
  }
}));
