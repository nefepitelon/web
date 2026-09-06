import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  if (supabase) await supabase.auth.signOut();
  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.delete("welinkbtc_2fa");
  return response;
}
