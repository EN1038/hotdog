"use client";

import {
  AdminMapLocationPicker,
  type MapLocationValue,
  type MapReferencePin,
} from "@/components/admin/AdminMapLocationPicker";
import { distanceKm, formatDistanceKm, hasMapPin } from "@/lib/geo";

type Props = {
  value: MapLocationValue;
  onChange: (next: MapLocationValue) => void;
  referencePin?: MapReferencePin | null;
};

export function CustomerDeliveryMapPin({
  value,
  onChange,
  referencePin = null,
}: Props) {
  const distanceLabel =
    hasMapPin(value) && referencePin && hasMapPin(referencePin)
      ? formatDistanceKm(
          distanceKm(
            referencePin.latitude,
            referencePin.longitude,
            value.latitude!,
            value.longitude!,
          ),
        )
      : null;

  return (
    <div className="space-y-2">
      <p className="text-xs leading-relaxed text-gray-600">
        ระบบจะขอตำแหน่งปัจจุบันครั้งแรก — หรือกด “ตำแหน่งปัจจุบัน” /
        ลากหมุดเอง ร้านจะเห็นระยะทางจากสาขา
      </p>
      <AdminMapLocationPicker
        value={value}
        onChange={onChange}
        referencePin={referencePin}
        geocodePath="/api/customer/geocode"
        hideAddressField
        enableMyLocation
        autoLocateOnMount
        mapHeightClassName="h-56"
        addressLabel="ที่อยู่จากแผนที่"
      />
      {distanceLabel ? (
        <p className="rounded-xl bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-900">
          ห่างจากร้านประมาณ {distanceLabel}
        </p>
      ) : (
        <p className="text-xs text-amber-700">กรุณาปักหมุดจุดส่งบนแผนที่</p>
      )}
    </div>
  );
}

export type { MapLocationValue };
