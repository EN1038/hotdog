"use client";

import {
  AdminMapLocationField,
  type MapLocationValue,
} from "@/components/admin/AdminMapLocationField";

/** @deprecated Prefer MapLocationValue — kept for existing imports */
export type BranchLocationValue = MapLocationValue;

type Props = {
  value: MapLocationValue;
  onChange: (next: MapLocationValue) => void;
};

/** Branch store pin — thin wrapper around shared admin map field. */
export function BranchLocationField({ value, onChange }: Props) {
  return (
    <AdminMapLocationField
      value={value}
      onChange={onChange}
      addressLabel="ที่อยู่ร้าน (พิมพ์ได้เอง)"
      addressPlaceholder="บ้านเลขที่ ถนน แขวง/ตำบล จังหวัด — กรอกเองได้เสมอ"
    />
  );
}
