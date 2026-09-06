import { createResearchShareImage } from "@/lib/research-share-image";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return createResearchShareImage(slug);
}
