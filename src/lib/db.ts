import { Pool } from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/** Bump when Prisma schema/models change so Next.js HMR drops a stale client. */
const PRISMA_CLIENT_VERSION = 54;

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaPool?: Pool;
  prismaClientVersion?: number;
};

function getPoolMax(): number {
  // `next build` forks many workers; each process gets its own pool singleton.
  if (process.env.NEXT_PHASE === "phase-production-build") return 1;
  return 8;
}

function getPool() {
  if (!globalForPrisma.prismaPool) {
    globalForPrisma.prismaPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Managed Postgres (DO) has a small slot budget; HMR must not open a new pool.
      max: getPoolMax(),
      idleTimeoutMillis: 30_000,
    });
    globalForPrisma.prismaPool.on("error", (err) => {
      console.error("[pg] pool", err.message);
    });
  }
  return globalForPrisma.prismaPool;
}

function createClient() {
  const adapter = new PrismaPg(getPool(), {
    schema: process.env.DATABASE_SCHEMA ?? "public",
    disposeExternalPool: false,
  });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

function getClient() {
  const existing = globalForPrisma.prisma;
  if (
    existing &&
    globalForPrisma.prismaClientVersion === PRISMA_CLIENT_VERSION
  ) {
    return existing;
  }

  // Replace the Prisma wrapper only. Never pool.end() — in-flight queries
  // and the next client share this process-wide pool.
  const client = createClient();
  globalForPrisma.prisma = client;
  globalForPrisma.prismaClientVersion = PRISMA_CLIENT_VERSION;
  return client;
}

/**
 * Always resolve through getClient() so HMR / schema bumps drop a stale singleton.
 * (A plain `export const prisma = getClient()` freezes the first instance forever.)
 *
 * Use bracket access — Prisma 7 model delegates are getters on an inner Proxy.
 * Reflect.get(..., receiver) can yield undefined (findMany on undefined).
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient() as unknown as Record<PropertyKey, unknown>;
    const value = client[prop];
    return typeof value === "function" ? value.bind(getClient()) : value;
  },
});
