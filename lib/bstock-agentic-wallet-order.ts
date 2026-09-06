import { z } from "zod";

const scalarSchema = z.union([z.string(), z.number(), z.bigint()])
  .transform((value) => String(value));

const optionalScalarSchema = scalarSchema.nullish().transform((value) => value ?? undefined);

const orderPayloadSchema = z.object({
  code: optionalScalarSchema,
  message: optionalScalarSchema,
  orderId: optionalScalarSchema,
  clientOrderId: optionalScalarSchema,
  orderExpireTime: optionalScalarSchema,
  status: optionalScalarSchema
}).passthrough();

export type AgenticWalletOrder = z.infer<typeof orderPayloadSchema>;

export function normalizeAgenticWalletOrder(value: unknown): AgenticWalletOrder {
  return orderPayloadSchema.parse(value);
}

