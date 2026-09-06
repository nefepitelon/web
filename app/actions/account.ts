"use server";

import { Prisma } from "@prisma/client";
import { put } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requireViewer } from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { evaluateReferralQualification } from "@/lib/referrals";

const handleSchema = z.string().regex(/^[a-z]{3,20}$/, "用户名仅允许 3–20 位小写字母");

export async function setHandleAction(formData: FormData) {
  const viewer = await requireViewer("/onboarding/username", false);
  const parsed = handleSchema.safeParse(String(formData.get("handle") ?? "").trim());
  if (!parsed.success) redirect(`/onboarding/username?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "用户名不合法")}`);

  try {
    await prisma.$transaction(async (tx) => {
      const profile = await tx.profile.findUnique({ where: { userId: viewer.id } });
      if (!profile) throw new Error("PROFILE_NOT_FOUND");
      if (profile.handle && profile.handle !== parsed.data) throw new Error("HANDLE_ALREADY_SET");
      await tx.profile.update({ where: { userId: viewer.id }, data: { handle: parsed.data } });
      await tx.referralCode.upsert({
        where: { code: parsed.data },
        update: { active: true },
        create: { userId: viewer.id, code: parsed.data }
      });
    });
    await writeAudit({ actorUserId: viewer.id, action: "profile.handle.set", targetType: "user", targetId: viewer.id, metadata: { handle: parsed.data } });
    await evaluateReferralQualification(viewer.id);
  } catch (caught) {
    if (caught instanceof Prisma.PrismaClientKnownRequestError && caught.code === "P2002") {
      redirect("/onboarding/username?error=该用户名已被使用，请选择其他名称");
    }
    if (caught instanceof Error && caught.message === "HANDLE_ALREADY_SET") {
      redirect("/account/profile?error=用户名设置后不可自行修改");
    }
    throw caught;
  }

  redirect("/account?welcome=1");
}

const profileSchema = z.object({
  displayName: z.string().trim().max(60),
  bio: z.string().trim().max(500),
  region: z.string().trim().max(60),
  website: z.string().trim().max(200)
});

export async function updateProfileAction(formData: FormData) {
  const viewer = await requireViewer("/account/profile");
  const parsed = profileSchema.safeParse({
    displayName: String(formData.get("displayName") ?? ""),
    bio: String(formData.get("bio") ?? ""),
    region: String(formData.get("region") ?? ""),
    website: String(formData.get("website") ?? "")
  });
  if (!parsed.success) redirect("/account/profile?error=资料格式不正确");
  if (parsed.data.website) {
    try {
      new URL(parsed.data.website);
    } catch {
      redirect("/account/profile?error=请输入完整的网站地址，例如 https://example.com");
    }
  }

  const avatar = formData.get("avatar");
  let avatarUrl: string | undefined;
  if (avatar instanceof File && avatar.size > 0) {
    if (avatar.size > 5 * 1024 * 1024) redirect("/account/profile?error=头像文件不能超过 5MB");
    if (!['image/jpeg','image/png','image/webp'].includes(avatar.type)) redirect("/account/profile?error=头像仅支持 JPG、PNG 或 WebP");
    try {
      const safeName = avatar.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-80) || "avatar.webp";
      const blob = await put(`avatars/${viewer.id}/${Date.now()}-${safeName}`, avatar, { access: "public", addRandomSuffix: true });
      avatarUrl = blob.url;
    } catch (caught) {
      console.error("[profile] avatar upload failed", { message: caught instanceof Error ? caught.message : "unknown" });
      redirect("/account/profile?error=头像上传失败，请稍后重试");
    }
  }

  await prisma.profile.update({
    where: { userId: viewer.id },
    data: {
      displayName: parsed.data.displayName || null,
      bio: parsed.data.bio || null,
      region: parsed.data.region || null,
      website: parsed.data.website || null,
      profileCompletedAt: new Date(),
      ...(avatarUrl ? { avatarUrl } : {})
    }
  });
  await writeAudit({ actorUserId: viewer.id, action: "profile.updated", targetType: "user", targetId: viewer.id, metadata: { avatarUpdated: Boolean(avatarUrl) } });
  await evaluateReferralQualification(viewer.id);
  revalidatePath("/account");
  redirect("/account/profile?saved=1");
}
