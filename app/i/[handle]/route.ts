import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;
  if (!/^[a-z]{3,20}$/.test(handle)) return NextResponse.redirect(new URL("/", request.url));
  const code = await prisma.referralCode.findUnique({ where: { code: handle } });
  if (!code?.active) return NextResponse.redirect(new URL("/", request.url));

  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.set("welinkbtc_ref", handle, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/"
  });
  return response;
}
