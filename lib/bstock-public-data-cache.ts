import "server-only";

import type { Prisma } from "@prisma/client";
import { isDatabaseConfigured, prisma } from "@/lib/prisma";

export type BstockDataDeliveryMode = "LIVE" | "CACHE_FRESH" | "CACHE_STALE";

type CacheEnvelope<T> = {
  version: 1;
  savedAt: string;
  payload: T;
};

type LoadOptions<T extends Record<string, unknown>> = {
  key: string;
  description: string;
  freshForMs: number;
  staleForMs: number;
  load: () => Promise<T>;
  isUsable: (value: T) => boolean;
};

const inFlight = new Map<string, Promise<Record<string, unknown>>>();

function cleanJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function parseEnvelope<T>(value: Prisma.JsonValue): CacheEnvelope<T> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || typeof record.savedAt !== "string" || !record.payload || typeof record.payload !== "object") {
    return null;
  }
  const savedAt = Date.parse(record.savedAt);
  if (!Number.isFinite(savedAt)) return null;
  return { version: 1, savedAt: record.savedAt, payload: record.payload as T };
}

async function readSnapshot<T>(key: string) {
  if (!isDatabaseConfigured()) return null;
  try {
    const record = await prisma.systemSetting.findUnique({
      where: { key },
      select: { value: true }
    });
    return record ? parseEnvelope<T>(record.value) : null;
  } catch (error) {
    console.warn("[bstock:data-cache] read_failed", { key, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

async function writeSnapshot<T extends Record<string, unknown>>(key: string, description: string, payload: T) {
  if (!isDatabaseConfigured()) return;
  const savedAt = new Date().toISOString();
  const value = cleanJson({ version: 1, savedAt, payload }) as Prisma.InputJsonValue;
  try {
    await prisma.systemSetting.upsert({
      where: { key },
      update: { value, description },
      create: { key, value, description },
      select: { key: true }
    });
  } catch (error) {
    console.warn("[bstock:data-cache] write_failed", { key, error: error instanceof Error ? error.message : String(error) });
  }
}

function delivered<T extends Record<string, unknown>>(
  payload: T,
  deliveryMode: BstockDataDeliveryMode,
  persistedAt: string,
  cacheAgeMs: number
) {
  return {
    ...payload,
    deliveryMode,
    persistedAt,
    cacheAgeMs: Math.max(0, Math.round(cacheAgeMs))
  };
}

/**
 * Database-backed stale-while-revalidate for public, non-wallet data.
 * Sensitive Agentic Wallet balances and session material must never use this cache.
 */
export async function loadBstockPublicData<T extends Record<string, unknown>>(options: LoadOptions<T>) {
  const cached = await readSnapshot<T>(options.key);
  const now = Date.now();
  const cacheAgeMs = cached ? now - Date.parse(cached.savedAt) : Number.POSITIVE_INFINITY;
  if (cached && cacheAgeMs <= options.freshForMs && options.isUsable(cached.payload)) {
    return delivered(cached.payload, "CACHE_FRESH", cached.savedAt, cacheAgeMs);
  }

  let active = inFlight.get(options.key) as Promise<T> | undefined;
  if (!active) {
    active = options.load().then(async (value) => {
      if (!options.isUsable(value)) throw new Error("Public data source returned an unusable snapshot.");
      await writeSnapshot(options.key, options.description, value);
      return value;
    });
    inFlight.set(options.key, active);
    void active.finally(() => inFlight.delete(options.key)).catch(() => undefined);
  }

  try {
    const live = await active;
    return delivered(live, "LIVE", new Date().toISOString(), 0);
  } catch (error) {
    if (cached && cacheAgeMs <= options.staleForMs && options.isUsable(cached.payload)) {
      console.warn("[bstock:data-cache] stale_fallback", {
        key: options.key,
        cacheAgeMs: Math.max(0, Math.round(cacheAgeMs)),
        error: error instanceof Error ? error.message : String(error)
      });
      return delivered(cached.payload, "CACHE_STALE", cached.savedAt, cacheAgeMs);
    }
    throw error;
  }
}
