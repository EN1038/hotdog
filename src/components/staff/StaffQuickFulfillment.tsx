"use client";

import type { FulfillmentType, PaymentMethod } from "@prisma/client";
import {
  CUSTOM_DELIVERY_ADDRESS_MIN_LENGTH,
  PAYMENT_METHOD_LABELS,
  formatPrice,
} from "@/lib/constants";
import {
  AdminMapLocationPicker,
  type MapLocationValue,
} from "@/components/admin/AdminMapLocationPicker";
import type { StaffDeliveryLocation } from "@/lib/staff-key-order";

const PAYMENTS: PaymentMethod[] = ["CASH", "TRANSFER"];

export type StaffFulfillmentState = {
  fulfillmentType: FulfillmentType;
  paymentMethod: PaymentMethod;
  deliveryLocationId: string;
  addressDetail: string;
  mapPin: MapLocationValue;
  note: string;
};

export const emptyStaffFulfillment = (): StaffFulfillmentState => ({
  fulfillmentType: "PICKUP",
  paymentMethod: "CASH",
  deliveryLocationId: "",
  addressDetail: "",
  mapPin: { address: "", latitude: null, longitude: null },
  note: "",
});

export function StaffQuickFulfillment({
  value,
  onChange,
  deliveryLocations,
}: {
  value: StaffFulfillmentState;
  onChange: (next: StaffFulfillmentState) => void;
  deliveryLocations: StaffDeliveryLocation[];
}) {
  const selectedLoc =
    deliveryLocations.find((l) => l.id === value.deliveryLocationId) ?? null;
  const needsCustomPin = Boolean(selectedLoc?.isCustomAddress);
  const deliveryAvailable = deliveryLocations.length > 0;

  function patch(partial: Partial<StaffFulfillmentState>) {
    onChange({ ...value, ...partial });
  }

  return (
    <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-900">รับออเดอร์ / ชำระเงิน</h2>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => patch({ fulfillmentType: "PICKUP" })}
          className={`rounded-xl px-3 py-2.5 text-sm font-semibold ${
            value.fulfillmentType === "PICKUP"
              ? "bg-site-primary text-white"
              : "bg-gray-100 text-gray-700"
          }`}
        >
          รับที่ร้าน
        </button>
        <button
          type="button"
          disabled={!deliveryAvailable}
          onClick={() => patch({ fulfillmentType: "DELIVERY" })}
          className={`rounded-xl px-3 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
            value.fulfillmentType === "DELIVERY"
              ? "bg-site-primary text-white"
              : "bg-gray-100 text-gray-700"
          }`}
        >
          เดลิเวอรี
        </button>
      </div>

      {value.fulfillmentType === "DELIVERY" ? (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              พื้นที่จัดส่ง
            </label>
            <select
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
              value={value.deliveryLocationId}
              onChange={(e) =>
                patch({
                  deliveryLocationId: e.target.value,
                  addressDetail: "",
                  mapPin: { address: "", latitude: null, longitude: null },
                })
              }
            >
              <option value="">เลือกพื้นที่</option>
              {deliveryLocations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} · ค่าส่ง {formatPrice(Number(loc.deliveryFee))}฿
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              ที่อยู่ / จุดสังเกต
              {needsCustomPin
                ? ` (อย่างน้อย ${CUSTOM_DELIVERY_ADDRESS_MIN_LENGTH} ตัวอักษร)`
                : ""}
            </label>
            <textarea
              rows={2}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              value={value.addressDetail}
              onChange={(e) => patch({ addressDetail: e.target.value })}
              placeholder="เช่น ห้อง / ตึก / จุดสังเกต"
            />
          </div>
          {needsCustomPin ? (
            <div>
              <p className="mb-1 text-xs font-medium text-gray-500">
                ปักหมุดจัดส่ง
              </p>
              <AdminMapLocationPicker
                value={value.mapPin}
                onChange={(mapPin) =>
                  patch({
                    mapPin,
                    addressDetail: value.addressDetail.trim()
                      ? value.addressDetail
                      : mapPin.address || value.addressDetail,
                  })
                }
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div>
        <p className="mb-1 text-xs font-medium text-gray-500">ชำระเงิน</p>
        <div className="grid grid-cols-2 gap-2">
          {PAYMENTS.map((pm) => (
            <button
              key={pm}
              type="button"
              onClick={() => patch({ paymentMethod: pm })}
              className={`rounded-xl px-3 py-2.5 text-sm font-semibold ${
                value.paymentMethod === pm
                  ? "bg-site-primary text-white"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              {PAYMENT_METHOD_LABELS[pm]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">
          หมายเหตุออเดอร์
        </label>
        <input
          type="text"
          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
          value={value.note}
          maxLength={300}
          onChange={(e) => patch({ note: e.target.value })}
          placeholder="ไม่บังคับ"
        />
      </div>
    </section>
  );
}

export function validateStaffFulfillment(
  value: StaffFulfillmentState,
  deliveryLocations: StaffDeliveryLocation[],
): string | null {
  if (value.fulfillmentType === "DELIVERY") {
    if (deliveryLocations.length === 0) {
      return "สาขานี้ยังไม่มีพื้นที่จัดส่ง";
    }
    const loc = deliveryLocations.find((l) => l.id === value.deliveryLocationId);
    if (!loc) return "กรุณาเลือกพื้นที่จัดส่ง";
    if (!value.addressDetail.trim()) return "กรุณาระบุที่อยู่จัดส่ง";
    if (loc.isCustomAddress) {
      if (value.addressDetail.trim().length < CUSTOM_DELIVERY_ADDRESS_MIN_LENGTH) {
        return `ที่อยู่ต้องมีอย่างน้อย ${CUSTOM_DELIVERY_ADDRESS_MIN_LENGTH} ตัวอักษร`;
      }
      if (
        value.mapPin.latitude == null ||
        value.mapPin.longitude == null ||
        !Number.isFinite(value.mapPin.latitude) ||
        !Number.isFinite(value.mapPin.longitude)
      ) {
        return "กรุณาปักหมุดจุดจัดส่ง";
      }
    }
  }
  return null;
}
