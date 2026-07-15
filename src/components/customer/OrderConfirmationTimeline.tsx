"use client";

import { OrderStatus, type FulfillmentType } from "@prisma/client";
import { getTimelineStatuses } from "@/lib/constants";
import { IconBag, IconCheck, IconDelivery, IconStore } from "@/components/icons";

const TIMELINE_LABELS: Record<FulfillmentType, Record<OrderStatus, string>> = {
  PICKUP: {
    WAITING_FOR_STORE_ACCEPTANCE: "รอยืนยันจากร้าน",
    PREPARING: "กำลังเตรียม",
    READY_FOR_PICKUP: "พร้อมรับสินค้า",
    READY_FOR_DELIVERY: "พร้อมจัดส่ง",
    DELIVERING: "กำลังจัดส่ง",
    COMPLETED: "รับสินค้าแล้ว",
    CANCELLED: "ยกเลิก",
  },
  DELIVERY: {
    WAITING_FOR_STORE_ACCEPTANCE: "รอยืนยันจากร้าน",
    PREPARING: "กำลังเตรียม",
    READY_FOR_PICKUP: "พร้อมรับสินค้า",
    READY_FOR_DELIVERY: "รอการจัดส่ง",
    DELIVERING: "กำลังจัดส่ง",
    COMPLETED: "จัดส่งสำเร็จ",
    CANCELLED: "ยกเลิก",
  },
};

function stepIcon(
  step: OrderStatus,
  fulfillmentType: FulfillmentType,
): typeof IconStore {
  if (step === OrderStatus.COMPLETED) return IconCheck;
  if (
    step === OrderStatus.READY_FOR_PICKUP ||
    (fulfillmentType === "DELIVERY" &&
      (step === OrderStatus.READY_FOR_DELIVERY ||
        step === OrderStatus.DELIVERING))
  ) {
    return fulfillmentType === "DELIVERY" ? IconDelivery : IconBag;
  }
  return IconStore;
}

export function OrderConfirmationTimeline({
  status,
  fulfillmentType,
  shopClosedHint,
}: {
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  shopClosedHint?: string | null;
}) {
  const steps = getTimelineStatuses(fulfillmentType);
  if (status === OrderStatus.CANCELLED) {
    return (
      <div className="rounded-lg bg-gray-100 p-3 text-center text-sm font-medium text-gray-500">
        ออเดอร์ถูกยกเลิกแล้ว
      </div>
    );
  }

  const currentIndex = Math.max(0, steps.indexOf(status));
  const labels = TIMELINE_LABELS[fulfillmentType];

  return (
    <div className="flex items-start">
      {steps.map((step, i) => {
        const done = i < currentIndex;
        const current = i === currentIndex;
        const StepIcon = stepIcon(step, fulfillmentType);
        const showHint =
          current &&
          step === OrderStatus.WAITING_FOR_STORE_ACCEPTANCE &&
          shopClosedHint;

        return (
          <div key={step} className="flex min-w-0 flex-1 items-start last:flex-none">
            <div className="flex w-full flex-col items-center">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full ${
                  current
                    ? "bg-site-primary text-white"
                    : done
                      ? "bg-site-primary-soft text-site-primary"
                      : "bg-gray-100 text-gray-400"
                }`}
              >
                {done ? <IconCheck size={16} /> : <StepIcon size={16} />}
              </div>
              <p
                className={`mt-1.5 w-full px-0.5 text-center text-[10px] leading-tight ${
                  current
                    ? "font-semibold text-site-primary"
                    : done
                      ? "text-gray-600"
                      : "text-gray-400"
                }`}
              >
                {labels[step]}
              </p>
              {showHint && (
                <p className="mt-0.5 px-0.5 text-center text-[9px] leading-tight text-gray-400">
                  {shopClosedHint}
                </p>
              )}
            </div>
            {i < steps.length - 1 && (
              <div
                className={`mx-0.5 mt-4 h-0.5 min-w-[8px] flex-1 ${
                  i < currentIndex ? "bg-site-primary" : "bg-gray-200"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
