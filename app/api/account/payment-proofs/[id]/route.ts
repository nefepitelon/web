import { getViewer } from "@/lib/membership";
import { readPaymentProof } from "@/lib/payment-proofs";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer || viewer.status !== "ACTIVE" || viewer.needsSecondFactor) return Response.json({ error: "Authentication required" }, { status: 401, headers });
  const { id } = await params;
  if (!/^[a-zA-Z0-9_-]{1,191}$/.test(id)) return Response.json({ error: "Not found" }, { status: 404, headers });
  const admin = viewer.role === "admin" && viewer.twoFactorEnabled && viewer.twoFactorPassed;
  const invoice = await prisma.cryptoPayment.findFirst({
    where: { id, ...(admin ? {} : { userId: viewer.id }) },
    select: { id: true, userId: true, proofUrl: true }
  });
  if (!invoice?.proofUrl) return Response.json({ error: "Not found" }, { status: 404, headers });
  try {
    const proof = await readPaymentProof(invoice.proofUrl, invoice.id, invoice.userId);
    try {
      return new Response(new Uint8Array(proof.bytes), { headers: {
        ...headers, "Content-Type": proof.type,
        "Content-Disposition": `attachment; filename="payment-proof.${proof.extension}"`
      } });
    } finally { proof.bytes.fill(0); }
  } catch { return Response.json({ error: "付款凭证暂时不可读取" }, { status: 502, headers }); }
}
