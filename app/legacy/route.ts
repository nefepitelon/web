import { serveLegacy } from "@/lib/legacy-route";

export async function GET(request: Request) {
  return serveLegacy(request);
}
