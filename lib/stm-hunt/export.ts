import type { StmDashboard } from "./types";

export function stmCsvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  // Spreadsheet applications must never execute upstream tickers or labels.
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function stmDashboardCsv(data: StmDashboard) {
  const rows: unknown[][] = [["dataset", "id", "symbol", "strategy", "status", "price_or_pnl_usd", "source_or_reason", "time"]];
  for (const row of data.candidates) rows.push(["candidate", row.id, row.symbol, "", row.risk, row.price, row.sources.join("|"), row.updatedAt]);
  for (const row of data.signals) rows.push(["signal", row.id, row.symbol, `${row.strategy}:v${row.strategyVersion}`, row.status, "", [...row.reasons, ...row.missing].join("；"), row.asOf]);
  for (const row of data.state.paper) rows.push(["paper", row.id, row.symbol, row.strategy, row.status, row.pnlUsd, `fee=${row.feeBps}bps;slippage=${row.slippageBps}bps`, row.closedAt || row.openedAt]);
  for (const row of data.sources) rows.push(["source", row.id, "", "", row.status, "", row.message, row.updatedAt]);
  return "\uFEFF" + rows.map(row => row.map(stmCsvCell).join(",")).join("\r\n");
}
