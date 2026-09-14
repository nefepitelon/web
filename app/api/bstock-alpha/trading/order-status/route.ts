import type { NextRequest } from "next/server";
import { handleBstockTradingStatus } from "@/lib/bstock-trading-status-handler";

export const dynamic = "force-dynamic";
export const maxDuration = 20;
export async function POST(request: NextRequest) { return handleBstockTradingStatus(request); }
