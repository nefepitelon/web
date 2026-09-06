import QRCode from "qrcode";
import { z } from "zod";

const bodySchema = z.object({
  url: z.string().url().max(2048)
});

const allowedHosts = new Set(["app.binance.com", "web3.binance.com"]);

function approvedLoginUrl(value: string) {
  const url = new URL(value);
  return url.protocol === "https:"
    && allowedHosts.has(url.hostname)
    && !url.username
    && !url.password;
}

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !approvedLoginUrl(parsed.data.url)) {
    return Response.json(
      { error: "Only official Binance Agentic Wallet HTTPS login links are accepted." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const svg = await QRCode.toString(parsed.data.url, {
    type: "svg",
    width: 320,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#07100b", light: "#ffffff" }
  });

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox"
    }
  });
}
