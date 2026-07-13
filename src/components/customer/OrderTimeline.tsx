"use client";

import { OrderStatus, type FulfillmentType } from "@prisma/client";
import { ORDER_STATUS_LABELS, getTimelineStatuses } from "@/lib/constants";
import { IconCheck } from "@/components/icons";

export function OrderTimeline({
  status,
  fulfillmentType,
}: {
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
}) {
  const steps = getTimelineStatuses(fulfillmentType);
  if (status === OrderStatus.CANCELLED) {
    return (
      <div className="rounded-lg bg-gray-100 p-3 text-center text-sm font-medium text-gray-500">
        ออเดอร์ถูกยกเลิกแล้ว
      </div>
    );
  }
  const currentIndex = steps.indexOf(status);

  return (
    <div className="flex items-center">
      {steps.map((step, i) => {
        const done = i < currentIndex;
        const current = i === currentIndex;
        return (
          <div key={step} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs ${
                  current
                    ? "bg-red-500 text-white"
                    : done
                      ? "bg-red-100 text-red-500"
                      : "bg-gray-100 text-gray-400"
                }`}
              >
                {done ? <IconCheck size={14} /> : i + 1}
              </div>
              <p
                className={`mt-1 w-16 text-center text-[10px] leading-tight ${
                  current ? "font-semibold text-red-600" : "text-gray-400"
                }`}
              >
                {ORDER_STATUS_LABELS[step]}
              </p>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`mx-0.5 mb-4 h-0.5 flex-1 ${
                  done ? "bg-red-400" : "bg-gray-200"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
