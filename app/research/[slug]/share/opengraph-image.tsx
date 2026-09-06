import { createResearchShareImage, researchShareImageSize } from "@/lib/research-share-image";

export const alt = "WELINKBTC Research 品牌分享卡";
export const size = researchShareImageSize;
export const contentType = "image/png";

export default async function OpenGraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return createResearchShareImage(slug);
}
