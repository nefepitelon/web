import { getViewer } from "@/lib/membership";

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return Response.json({ user: null }, { status: 401 });
  return Response.json({ user: viewer }, { headers: { "Cache-Control": "private, no-store" } });
}
