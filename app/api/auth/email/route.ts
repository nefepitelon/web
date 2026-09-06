import { z } from "zod";
import { NextResponse } from "next/server";
import { PENDING_ACCESS_CODE_COOKIE, validateAccessCode } from "@/lib/access-codes";
import { AUTH_NEXT_COOKIE, authCallbackUrl, safeAuthNext } from "@/lib/auth-redirect";
import { isDatabaseConfigured } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { assertSameOrigin, requestContext } from "@/lib/request-security";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const schema = z.object({
  email: z.email().max(254),
  next: z.string().max(300).optional(),
  accessCode: z.string().max(64).optional()
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = schema.parse(await request.json());
    const supabase = await createServerSupabaseClient();
    if (!supabase) return Response.json({ error: "认证服务尚未配置" }, { status: 503 });

    if (isDatabaseConfigured()) {
      const { ipAddress } = await requestContext(request);
      const rate = await checkRateLimit(
        `auth:email:${input.email.toLowerCase()}:${ipAddress ?? "unknown"}`,
        5,
        10 * 60 * 1000
      );
      if (!rate.allowed) {
        return Response.json(
          { error: `请求过于频繁，请在 ${rate.retryAfterSeconds} 秒后重试` },
          { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
        );
      }
    }

    const pendingAccessCode = input.accessCode?.trim();
    const accessCodeValidation = pendingAccessCode && isDatabaseConfigured()
      ? await validateAccessCode(pendingAccessCode)
      : null;
    if (pendingAccessCode && !accessCodeValidation?.valid) {
      return Response.json(
        { error: "Access Code 无效、尚未生效、已过期或已达到使用上限。你可以清空后跳过。" },
        { status: 400 }
      );
    }

    const safeNext = safeAuthNext(input.next);
    const emailRedirectTo = authCallbackUrl(request.url).toString();
    const { error } = await supabase.auth.signInWithOtp({
      email: input.email.toLowerCase(),
      options: { emailRedirectTo, shouldCreateUser: true }
    });
    if (error) throw error;

    const response = NextResponse.json({ ok: true });
    response.cookies.set(AUTH_NEXT_COOKIE, safeNext, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 10 * 60,
      path: "/"
    });
    if (accessCodeValidation?.valid) {
      response.cookies.set(PENDING_ACCESS_CODE_COOKIE, accessCodeValidation.normalized, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 60,
        path: "/"
      });
    } else {
      response.cookies.set(PENDING_ACCESS_CODE_COOKIE, "", { expires: new Date(0), path: "/" });
    }
    return response;
  } catch (caught) {
    if (caught instanceof z.ZodError) {
      return Response.json({ error: "请输入有效的邮箱地址" }, { status: 400 });
    }
    const authError = caught as { code?: string; status?: number; message?: string };
    console.error("[auth:email] Magic link request failed", {
      code: authError.code,
      status: authError.status,
      message: authError.message
    });
    if (authError.code === "over_email_send_rate_limit") {
      return Response.json(
        { error: "登录邮件发送额度已用完，请稍后重试或使用 Google 登录。" },
        { status: 429 }
      );
    }
    if (authError.code === "email_address_not_authorized") {
      return Response.json(
        { error: "当前邮件服务仅允许项目成员邮箱；请配置自定义 SMTP 后再向所有用户开放。" },
        { status: 503 }
      );
    }
    if (authError.message === "Error sending magic link email") {
      return Response.json(
        { error: "Supabase 邮件服务暂时无法发送登录链接，请配置自定义 SMTP 或使用 Google 登录。" },
        { status: 503 }
      );
    }
    return Response.json({ error: "登录邮件发送失败，请稍后重试。" }, { status: 400 });
  }
}
