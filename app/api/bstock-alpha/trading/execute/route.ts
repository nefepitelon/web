import type { NextRequest } from "next/server";
import { handleBstockTradingExecute } from "@/lib/bstock-trading-execute-handler";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function POST(request: NextRequest) {
  return handleBstockTradingExecute(request);
}
