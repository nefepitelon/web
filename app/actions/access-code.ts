"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { redeemAccessCode } from "@/lib/access-codes";
import { writeAudit } from "@/lib/audit";
import { requireViewer } from "@/lib/membership";
import { checkRateLimit } from "@/lib/rate-limit";

const schema = z.object({ accessCode: z.string().trim().min(1).max(64) });

type RedeemState = { status: "idle" | "success" | "error"; message: string };

export async function redeemAccessCodeAction(
  _previousState: RedeemState,
  formData: FormData
): Promise<RedeemState> {
  const viewer = await requireViewer("/account/referrals");
  const parsed = schema.safeParse({ accessCode: formData.get("accessCode") });
  if (!parsed.success) return { status: "error", message: "请输入有效的 Access Code。" };

  const rate = await checkRateLimit(`access-code:${viewer.id}`, 10, 60 * 60 * 1000);
  if (!rate.allowed) {
    return { status: "error", message: `尝试次数过多，请在 ${rate.retryAfterSeconds} 秒后重试。` };
  }

  const result = await redeemAccessCode(viewer.id, parsed.data.accessCode, "account");
  if (result.status === "activated") {
    await writeAudit({
      actorUserId: viewer.id,
      action: "access_code.redeemed",
      targetType: "access_code",
      metadata: { source: "account", label: result.label, endsAt: result.endsAt.toISOString() }
    });
    revalidatePath("/account");
    revalidatePath("/account/referrals");
    revalidatePath("/account/subscription");
    return {
      status: "success",
      message: `已开启一个月 Max 全功能体验，有效至 ${result.endsAt.toLocaleDateString("zh-CN")}。管理员后台不会开放。`
    };
  }
  if (result.status === "already_redeemed") {
    return {
      status: "error",
      message: `此账户已经使用过同一个 Access Code，原体验有效期至 ${result.endsAt.toLocaleDateString("zh-CN")}。`
    };
  }
  return {
    status: "error",
    message: "Access Code 无效、尚未生效、已过期或已达到使用上限。"
  };
}
