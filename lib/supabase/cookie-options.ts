// Supabase browser MFA needs access to its session cookies. Keep this policy
// shared with server refreshes instead of claiming those cookies are HttpOnly.
export const supabaseCookieOptions = {
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 30 * 24 * 60 * 60
};
