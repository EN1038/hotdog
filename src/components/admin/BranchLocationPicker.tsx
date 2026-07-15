"use client";

import {
  AdminMapLocationPicker,
  type MapLocationValue,
} from "@/components/admin/AdminMapLocationPicker";

export type BranchLocationValue = MapLocationValue;

export function BranchLocationPicker(props: {
  value: BranchLocationValue;
  onChange: (next: BranchLocationValue) => void;
}) {
  return (
    <AdminMapLocationPicker
      value={props.value}
      onChange={props.onChange}
      addressLabel="ที่อยู่ร้าน (พิมพ์ได้เอง)"
      addressPlaceholder="บ้านเลขที่ ถนน แขวง/ตำบล จังหวัด — กรอกเองได้เสมอ"
    />
  );
}
