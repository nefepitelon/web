import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { assertSameOrigin } from "@/lib/request-security";
import { applyAuthResponseHeaders } from "@/lib/supabase/response";

export async function POST(request: Request) {
  try { assertSameOrigin(request); }
  catch { return Response.json({ error: "跨站退出请求已拒绝" }, { status: 403 }); }
  const supabase = await createServerSupabaseClient();
  if (supabase) await supabase.auth.signOut();
  const response = applyAuthResponseHeaders(NextResponse.redirect(new URL("/", request.url), 303));
  response.cookies.delete("welinkbtc_2fa");
  return response;
}
