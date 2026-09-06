import { Prisma } from "@prisma/client";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { requireViewer } from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { safeEqualText, verifyOAuthState } from "@/lib/security";
import { evaluateReferralQualification } from "@/lib/referrals";

type ProviderProfile = {
  id: string;
  username: string;
  profileUrl: string;
  avatarUrl?: string;
};

async function discordProfile(code: string, redirectUri: string): Promise<ProviderProfile> {
  const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID!,
      client_secret: process.env.DISCORD_CLIENT_SECRET!,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri
    })
  });
  if (!tokenResponse.ok) throw new Error("Discord token exchange failed");
  const token = await tokenResponse.json() as { access_token: string };
  const profileResponse = await fetch("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${token.access_token}` } });
  if (!profileResponse.ok) throw new Error("Discord profile request failed");
  const profile = await profileResponse.json() as { id: string; username: string; avatar?: string };
  return {
    id: profile.id,
    username: profile.username,
    profileUrl: `https://discord.com/users/${profile.id}`,
    avatarUrl: profile.avatar ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png` : undefined
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const viewer = await requireViewer("/account/connections");
  const { provider } = await params;
  const url = new URL(request.url);
  if (provider !== "discord") {
    return NextResponse.redirect(new URL("/account/connections?error=请重新发起 X 账户绑定", url.origin));
  }
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const cookieState = (await cookies()).get("welinkbtc_oauth_state")?.value;
  if (!state || !code || !cookieState || !safeEqualText(state, cookieState)) {
    return NextResponse.redirect(new URL("/account/connections?error=OAuth state 校验失败", url.origin));
  }

  try {
    const verified = await verifyOAuthState(state, viewer.id);
    if (verified.provider !== provider) throw new Error("Provider mismatch");
    const origin = process.env.NEXT_PUBLIC_APP_URL ?? url.origin;
    const redirectUri = `${origin}/api/connections/${provider}/callback`;
    const profile = await discordProfile(code, redirectUri);

    const account = await prisma.socialAccount.upsert({
      where: { userId_provider: { userId: viewer.id, provider } },
      update: { providerAccountId: profile.id, username: profile.username, profileUrl: profile.profileUrl, avatarUrl: profile.avatarUrl },
      create: { userId: viewer.id, provider, providerAccountId: profile.id, username: profile.username, profileUrl: profile.profileUrl, avatarUrl: profile.avatarUrl }
    });
    await writeAudit({ actorUserId: viewer.id, action: "connection.social.linked", targetType: "social_account", targetId: account.id, metadata: { provider, providerAccountId: profile.id }, request });
    await evaluateReferralQualification(viewer.id);
    const response = NextResponse.redirect(new URL(`/account/connections?connected=${encodeURIComponent(provider)}`, url.origin));
    response.cookies.delete("welinkbtc_oauth_state");
    return response;
  } catch (caught) {
    const message = caught instanceof Prisma.PrismaClientKnownRequestError && caught.code === "P2002"
      ? "该外部账号已绑定其他 welinkBTC 用户"
      : caught instanceof Error ? caught.message : "OAuth binding failed";
    return NextResponse.redirect(new URL(`/account/connections?error=${encodeURIComponent(message)}`, url.origin));
  }
}
