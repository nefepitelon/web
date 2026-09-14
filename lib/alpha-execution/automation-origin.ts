type Reservation = { id: string; planId: string | null; symbol: string; side: string };
type FilledEntry = { id: string; planId: string; symbol: string; side: string; environment: string; market: string;
  role: string; filledQuantity: number; exchangeOrderId: string | null; plan: { intent: { source: string } } };

/** A display tag proves a stored automation reservation owns a real exchange fill. */
export function automationFillBindings(reservations: Reservation[], entries: FilledEntry[]) {
  const result = new Map<string, { reservationId: string; source: string; entryOrderId: string; symbol: string }>();
  for (const reservation of reservations) {
    if (!reservation.planId || !/^[a-zA-Z0-9-]{1,80}$/.test(reservation.id)) continue;
    const entry = entries.find(row => row.planId === reservation.planId && row.environment === "LIVE" && row.market === "FUTURES" && row.role === "ENTRY"
      && Number.isFinite(row.filledQuantity) && row.filledQuantity > 0 && Boolean(row.exchangeOrderId)
      && row.symbol === reservation.symbol && row.side === (reservation.side === "LONG" ? "BUY" : reservation.side === "SHORT" ? "SELL" : "")
      && row.plan.intent.source === `alpha-auto:${reservation.id}`);
    if (entry) result.set(reservation.planId, { reservationId: reservation.id, source: entry.plan.intent.source, entryOrderId: entry.id, symbol: entry.symbol });
  }
  return result;
}
