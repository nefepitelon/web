import { serveLegacy } from "@/lib/legacy-route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return serveLegacy(request, path);
}
