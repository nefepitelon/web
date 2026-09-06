import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PENDING_ACCESS_CODE_COOKIE, redeemAccessCode, validateAccessCode } from "@/lib/access-codes";
import { writeAudit } from "@/lib/audit";
import { AUTH_NEXT_COOKIE, authCallbackUrl, safeAuthNext } from "@/lib/auth-redirect";
import { syncAuthenticatedUser } from "@/lib/membership";
import { isDatabaseConfigured } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { assertSameOrigin, requestContext } from "@/lib/request-security";
import { applyAuthResponseHeaders } from "@/lib/supabase/response";

const schema = z.object({
  intent: z.enum(["signin", "signup"]),
  email: z.email().max(254),
  password: z.string().min(8).max(72).regex(/[A-Za-z]/).regex(/[0-9]/),
  next: z.string().max(300).optional(),
  accessCode: z.string().max(64).optional()
});

type PendingCookie = { name: string; value: string; options: CookieOptions };

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const input = schema.parse(await request.json());
    const email = input.email.trim().toLowerCase();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) return Response.json({ error: "认证服务尚未配置" }, { status: 503 });

    if (isDatabaseConfigured()) {
      const { ipAddress } = await requestContext(request);
      const rate = await checkRateLimit(`auth:password:${email}:${ipAddress ?? "unknown"}`, 10, 10 * 60 * 1000);
      if (!rate.allowed) return Response.json({ error: `尝试过于频繁，请在 ${rate.retryAfterSeconds} 秒后重试` }, { status: 429 });
    }

    const pendingAccessCode = input.accessCode?.trim();
    const validation = pendingAccessCode && isDatabaseConfigured() ? await validateAccessCode(pendingAccessCode) : null;
    if (pendingAccessCode && !validation?.valid) {
      return Response.json({ error: "Access Code 无效、尚未生效、已过期或已达到使用上限。" }, { status: 400 });
    }

    const pendingCookies: PendingCookie[] = [];
    const pendingHeaders: Record<string, string> = {};
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          pendingCookies.push(...cookiesToSet);
          Object.assign(pendingHeaders, headers);
        }
      }
    });

    const safeNext = safeAuthNext(input.next);
    const result = input.intent === "signup"
      ? await supabase.auth.signUp({
          email,
          password: input.password,
          options: { emailRedirectTo: authCallbackUrl(request.url).toString() }
        })
      : await supabase.auth.signInWithPassword({ email, password: input.password });

    if (result.error) {
      const status = result.error.code === "invalid_credentials" ? 401 : 400;
      const message = result.error.code === "invalid_credentials"
        ? "邮箱或密码不正确；尚未验证邮箱的账户请先完成邮箱确认。"
        : result.error.code === "user_already_exists"
          ? "该邮箱已经注册，请切换到密码登录。"
          : "暂时无法完成邮箱密码认证，请稍后重试。";
      return Response.json({ error: message }, { status });
    }

    const response = applyAuthResponseHeaders(NextResponse.json({
      ok: true,
      next: safeNext,
      confirmationRequired: input.intent === "signup" && !result.data.session
    }));
    applyAuthResponseHeaders(response, pendingHeaders);
    for (const cookie of pendingCookies) response.cookies.set(cookie.name, cookie.value, cookie.options);

    if (result.data.user && result.data.session) {
      await syncAuthenticatedUser(result.data.user);
      if (validation?.valid) {
        const redemption = await redeemAccessCode(result.data.user.id, validation.normalized, "login");
        if (redemption.status === "activated") {
          await writeAudit({
            actorUserId: result.data.user.id,
            action: "access_code.redeemed",
            targetType: "access_code",
            metadata: { source: "password_signup", label: redemption.label, endsAt: redemption.endsAt.toISOString() },
            request
          });
        }
      }
      response.cookies.set(PENDING_ACCESS_CODE_COOKIE, "", { expires: new Date(0), path: "/" });
    } else if (validation?.valid) {
      response.cookies.set(PENDING_ACCESS_CODE_COOKIE, validation.normalized, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 60,
        path: "/"
      });
      response.cookies.set(AUTH_NEXT_COOKIE, safeNext, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 60,
        path: "/"
      });
    }
    return response;
  } catch (caught) {
    if (caught instanceof z.ZodError) {
      return Response.json({ error: "请输入有效邮箱；密码需为 8–72 位并同时包含字母和数字。" }, { status: 400 });
    }
    console.error("[auth:password] request failed", { message: caught instanceof Error ? caught.message : "unknown" });
    return Response.json({ error: "认证请求失败，请稍后重试。" }, { status: 400 });
  }
}
