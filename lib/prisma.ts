import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function databaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL;
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient(
  databaseUrl() ? { datasources: { db: { url: databaseUrl() } } } : undefined
);

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export function isDatabaseConfigured() {
  return Boolean(databaseUrl());
}

export function requireDatabase() {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL is not configured");
  }
  return prisma;
}
