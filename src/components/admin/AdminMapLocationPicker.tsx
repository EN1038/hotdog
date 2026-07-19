"use client";

import dynamic from "next/dynamic";
import type {
  MapLocationValue,
  MapReferencePin,
} from "@/components/admin/AdminMapLocationField";
import { LoadingState } from "@/components/LoadingState";

const AdminMapLocationFieldInner = dynamic(
  () =>
    import("@/components/admin/AdminMapLocationField").then(
      (m) => m.AdminMapLocationField,
    ),
  {
    ssr: false,
    loading: () => (
      <LoadingState compact label="กำลังโหลดแผนที่" className="px-2" />
    ),
  },
);

export type { MapLocationValue, MapReferencePin };

export function AdminMapLocationPicker(props: {
  value: MapLocationValue;
  onChange: (next: MapLocationValue) => void;
  onSuggestLabel?: (label: string) => void;
  addressLabel?: string;
  addressPlaceholder?: string;
  referencePin?: MapReferencePin | null;
  mapHeightClassName?: string;
  geocodePath?: string;
  hideAddressField?: boolean;
}) {
  return <AdminMapLocationFieldInner {...props} />;
}
