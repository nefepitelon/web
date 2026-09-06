import { Prisma, type SocialAccount } from "@prisma/client";
import type { UserIdentity } from "@supabase/supabase-js";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { evaluateReferralQualification } from "@/lib/referrals";

type IdentityData = Record<string, unknown>;

function textValue(data: IdentityData, keys: string[]) {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function xIdentityProfile(identity: UserIdentity) {
  const data = (identity.identity_data ?? {}) as IdentityData;
  const providerAccountId = textValue(data, ["provider_id", "sub", "id"]) ?? identity.id;
  const username = textValue(data, ["user_name", "preferred_username", "username", "screen_name", "name"])
    ?.replace(/^@/, "");
  const avatarUrl = textValue(data, ["avatar_url", "picture", "profile_image_url"]);

  return {
    providerAccountId,
    username,
    avatarUrl,
    profileUrl: username ? `https://x.com/${encodeURIComponent(username)}` : undefined
  };
}

export function hasSupabaseXIdentity(identities: UserIdentity[] | null | undefined) {
  return Boolean(
    identities?.some((item) => item.provider === "x" || item.provider === "twitter")
  );
}

export async function syncSupabaseXIdentity(input: {
  userId: string;
  identities: UserIdentity[] | null | undefined;
  request?: Request;
}): Promise<SocialAccount> {
  const identity = input.identities?.find((item) => item.provider === "x" || item.provider === "twitter");
  if (!identity) {
    throw new Error("X 授权已返回，但未找到可绑定的 X 身份，请确认 Supabase 已启用 X / Twitter OAuth 2.0");
  }

  const profile = xIdentityProfile(identity);
  try {
    const account = await prisma.socialAccount.upsert({
      where: { userId_provider: { userId: input.userId, provider: "twitter" } },
      update: {
        providerAccountId: profile.providerAccountId,
        username: profile.username,
        profileUrl: profile.profileUrl,
        avatarUrl: profile.avatarUrl
      },
      create: {
        userId: input.userId,
        provider: "twitter",
        providerAccountId: profile.providerAccountId,
        username: profile.username,
        profileUrl: profile.profileUrl,
        avatarUrl: profile.avatarUrl
      }
    });

    await writeAudit({
      actorUserId: input.userId,
      action: "connection.social.linked",
      targetType: "social_account",
      targetId: account.id,
      metadata: {
        provider: "twitter",
        providerAccountId: profile.providerAccountId,
        authority: "supabase-x-oauth2"
      },
      request: input.request
    });
    await evaluateReferralQualification(input.userId);
    return account;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new Error("该 X 账号已绑定其他 welinkBTC 用户");
    }
    throw error;
  }
}
