import type { Prisma } from "@prisma/client";
import { startOfTodayBangkok } from "@/lib/constants";
import { prisma } from "@/lib/db";

export { formatQueueNumber } from "@/lib/order-queue-format";

/** Bangkok calendar date (midnight +07) for queue reset boundaries. */
export function bangkokQueueBusinessDate(at = new Date()): Date {
  return startOfTodayBangkok(at);
}

const MAX_QUEUE_ALLOC_ATTEMPTS = 12;

type Tx = Prisma.TransactionClient;

async function nextQueueNumberForBranchDay(
  tx: Tx,
  branchId: string,
  queueBusinessDate: Date,
): Promise<number> {
  const agg = await tx.order.aggregate({
    where: { branchId, queueBusinessDate },
    _max: { queueNumber: true },
  });
  return (agg._max.queueNumber ?? 0) + 1;
}

/**
 * Create an order with the next queue number for this branch + Bangkok day.
 * Retries on unique (branch, day, queue) collisions under concurrency.
 */
export async function createOrderWithDailyQueue(
  branchId: string,
  buildCreateArgs: (
    queue: { queueNumber: number; queueBusinessDate: Date },
  ) => Prisma.OrderCreateArgs,
) {
  const queueBusinessDate = bangkokQueueBusinessDate();

  for (let attempt = 0; attempt < MAX_QUEUE_ALLOC_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const queueNumber = await nextQueueNumberForBranchDay(
          tx,
          branchId,
          queueBusinessDate,
        );
        const args = buildCreateArgs({ queueNumber, queueBusinessDate });
        return tx.order.create(args);
      });
    } catch (e) {
      const code =
        e &&
        typeof e === "object" &&
        "code" in e &&
        (e as { code?: string }).code;
      if (code === "P2002" && attempt < MAX_QUEUE_ALLOC_ATTEMPTS - 1) {
        continue;
      }
      throw e;
    }
  }

  throw new Error("ไม่สามารถออกเลขคิวได้ กรุณาลองใหม่");
}
