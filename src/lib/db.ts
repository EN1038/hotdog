import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/** Bump when Prisma schema/models change so Next.js HMR drops a stale client. */
const PRISMA_CLIENT_VERSION = 15;

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
    "adminActivityLog" in client
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
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
    globalForPrisma.prismaClientVersion = PRISMA_CLIENT_VERSION;
  }
  return client;
}

export const prisma = getClient();
