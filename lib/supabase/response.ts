export const AUTH_NO_STORE_HEADERS: Record<string, string> = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  Expires: "0",
  Pragma: "no-cache"
};

export function applyAuthResponseHeaders<T extends Response>(
  response: T,
  headers: Record<string, string> = AUTH_NO_STORE_HEADERS
): T {
  for (const [name, value] of Object.entries(headers)) {
    response.headers.set(name, value);
  }
  return response;
}
