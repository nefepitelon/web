import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// JWT verification alone does not revoke an already-issued access token.
// Read only the matching Auth session's existence; never cache between requests.
export const hasActiveAuthSession = cache(async (userId: unknown, sessionId: unknown): Promise<boolean> => {
  if (typeof userId !== "string" || typeof sessionId !== "string" || !uuid.test(userId) || !uuid.test(sessionId)) return false;
  try {
    const rows = await prisma.$queryRaw<Array<{ active: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM auth.sessions s
        WHERE s.id = ${sessionId}::uuid AND s.user_id = ${userId}::uuid
          AND (s.not_after IS NULL OR s.not_after > now())
          AND NOT EXISTS (
            SELECT 1 FROM public.audit_logs revoked
            WHERE revoked.action = 'admin.user.2fa.reset_requested'
              AND revoked."targetType" = 'user' AND revoked."targetId" = ${userId}
              AND revoked."createdAt" >= s.created_at
          )
      ) AS active
    `;
    // Reset intent is protected server audit history, not user metadata. Its
    // revocation boundary survives the resetting admin's later role changes.
    return rows.length === 1 && rows[0].active === true;
  } catch {
    // Auth/database outages must not turn a revoked session into a valid one.
    return false;
  }
});
