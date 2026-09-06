import { put } from "@vercel/blob";
import { getViewer } from "@/lib/membership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 4 * 1024 * 1024;
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const fileTypes = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);

function safeFilename(value: string) {
  const cleaned = value.normalize("NFKC").replace(/[^\p{Letter}\p{Number}._-]+/gu, "-").replace(/^-+|-+$/g, "");
  return cleaned.slice(-120) || `asset-${Date.now()}`;
}

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer || viewer.role !== "admin") {
    return Response.json({ error: "只有管理员可以上传研究素材" }, { status: 403 });
  }
  if (!viewer.twoFactorEnabled || !viewer.twoFactorPassed) {
    return Response.json({ error: "请先完成管理员双重验证" }, { status: 403 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json({ error: "研究素材存储尚未配置" }, { status: 503 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return Response.json({ error: "请选择需要上传的文件" }, { status: 400 });
  if (file.size === 0 || file.size > MAX_FILE_SIZE) return Response.json({ error: "文件必须小于 4MB" }, { status: 413 });

  const kind = imageTypes.has(file.type) ? "image" : fileTypes.has(file.type) ? "file" : null;
  if (!kind) return Response.json({ error: "仅支持 JPG、PNG、WebP、GIF、PDF、Markdown、TXT 和 Word 文件" }, { status: 415 });

  const name = safeFilename(file.name);
  const blob = await put(`research/${kind}s/${name}`, file, {
    access: "public",
    addRandomSuffix: true,
    contentType: file.type
  });

  return Response.json(
    { url: blob.url, name: file.name.slice(0, 160), type: file.type, kind },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
