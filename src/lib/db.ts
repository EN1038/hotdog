import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/** Bump when Prisma schema/models change so Next.js HMR drops a stale client. */
const PRISMA_CLIENT_VERSION = 6;

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

function getClient() {
  const existing = globalForPrisma.prisma;
  if (
    existing &&
    globalForPrisma.prismaClientVersion === PRISMA_CLIENT_VERSION &&
    "restaurantType" in existing &&
    "deliveryLocation" in existing &&
    "adminActivityLog" in existing
  ) {
    return existing;
  }

  void existing?.$disconnect().catch(() => undefined);

  const client = createClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
    globalForPrisma.prismaClientVersion = PRISMA_CLIENT_VERSION;
  }
  return client;
}

export const prisma = getClient();
