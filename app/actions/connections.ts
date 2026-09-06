"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAudit } from "@/lib/audit";
import { requireViewer } from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function unlinkSocialAction(formData: FormData) {
  const viewer = await requireViewer("/account/connections");
  const id = String(formData.get("id") ?? "");
  const account = await prisma.socialAccount.findFirst({ where: { id, userId: viewer.id } });
  if (!account) return;

  let unlinkError: string | null = null;
  if (account.provider === "twitter") {
    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      unlinkError = "Supabase Auth 尚未配置，暂时无法解绑 X 账户";
    } else {
      const { data, error } = await supabase.auth.getUserIdentities();
      const identity = data?.identities?.find((item) => item.provider === "x" || item.provider === "twitter");
      if (error) unlinkError = "无法读取 X 绑定状态，请稍后再试";
      if (identity && !unlinkError) {
        const { error: identityError } = await supabase.auth.unlinkIdentity(identity);
        if (identityError) unlinkError = identityError.message || "Supabase 未能解除 X 身份关联";
      }
    }
  }
  if (unlinkError) redirect(`/account/connections?error=${encodeURIComponent(unlinkError)}`);

  await prisma.socialAccount.delete({ where: { id: account.id } });
  await writeAudit({
    actorUserId: viewer.id,
    action: "connection.social.unlinked",
    targetType: "social_account",
    targetId: account.id,
    metadata: { provider: account.provider }
  });
  revalidatePath("/account/connections");
}

export async function unlinkWalletAction(formData: FormData) {
  const viewer = await requireViewer("/account/connections");
  const id = String(formData.get("id") ?? "");
  const wallet = await prisma.wallet.findFirst({ where: { id, userId: viewer.id } });
  if (!wallet) return;
  await prisma.wallet.delete({ where: { id: wallet.id } });
  await writeAudit({
    actorUserId: viewer.id,
    action: "connection.wallet.unlinked",
    targetType: "wallet",
    targetId: wallet.id,
    metadata: { chain: wallet.chain, address: wallet.address }
  });
  revalidatePath("/account/connections");
}
