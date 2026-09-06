import { z } from "zod";

const scalarSchema = z.union([z.string(), z.number(), z.bigint()])
  .transform((value) => String(value));

const optionalScalarSchema = scalarSchema.nullish().transform((value) => value ?? undefined);

const quotePayloadSchema = z.object({
  quoteId: optionalScalarSchema,
  uniQuoteId: optionalScalarSchema,
  fromCoinSymbol: optionalScalarSchema,
  fromCoinAmount: optionalScalarSchema,
  toCoinSymbol: optionalScalarSchema,
  toCoinAmount: optionalScalarSchema,
  toTokenShare: optionalScalarSchema,
  toMultiplier: optionalScalarSchema,
  slippage: optionalScalarSchema,
  feeDetail: z.object({
    ratePercent: optionalScalarSchema,
    rateFiatValue: optionalScalarSchema
  }).passthrough().nullish(),
  gasDetails: z.object({
    gasFeeInUsd: optionalScalarSchema,
    gasMode: optionalScalarSchema
  }).passthrough().nullish()
}).passthrough();

export type AgenticWalletQuote = z.infer<typeof quotePayloadSchema>;

export function normalizeAgenticWalletQuote(value: unknown): AgenticWalletQuote {
  return quotePayloadSchema.parse(value);
}

export function resolveBstockQuoteOutput(
  quote: AgenticWalletQuote,
  side: "buy" | "sell",
  assetMultiplier: string,
  multiply: (left: string, right: string) => string
) {
  if (side === "sell") return quote.toCoinAmount || "";
  if (quote.toTokenShare) return quote.toTokenShare;
  if (!quote.toCoinAmount) return "";
  return multiply(quote.toCoinAmount, quote.toMultiplier || assetMultiplier);
}

export function zodIssueSummary(error: z.ZodError) {
  return error.issues.map((issue) => ({
    code: issue.code,
    path: issue.path.join("."),
    message: issue.message
  }));
}
