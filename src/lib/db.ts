import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/** Bump when Prisma schema/models change so Next.js HMR drops a stale client. */
const PRISMA_CLIENT_VERSION = 37;

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaClientVersion?: number;
};

function createClient() {
  const adapter = new PrismaPg(
    {
      connectionString: process.env.DATABASE_URL,
    },
    {
      schema: process.env.DATABASE_SCHEMA ?? "public",
    },
  );
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

function clientHasExpectedModels(client: PrismaClient): boolean {
  return (
    "restaurantType" in client &&
    "deliveryLocation" in client &&
    "adminActivityLog" in client &&
    "lineDailySummaryLog" in client &&
    "kitchenProduction" in client &&
    "branchStockRequest" in client
  );
}

function getClient() {
  const existing = globalForPrisma.prisma;
  if (
    existing &&
    globalForPrisma.prismaClientVersion === PRISMA_CLIENT_VERSION &&
    clientHasExpectedModels(existing)
  ) {
    return existing;
  }

  void existing?.$disconnect().catch(() => undefined);

  const client = createClient();
  globalForPrisma.prisma = client;
  globalForPrisma.prismaClientVersion = PRISMA_CLIENT_VERSION;
  return client;
}

/**
 * Always resolve through getClient() so HMR / schema bumps drop a stale singleton.
 * (A plain `export const prisma = getClient()` freezes the first instance forever.)
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, _receiver) {
    const client = getClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
