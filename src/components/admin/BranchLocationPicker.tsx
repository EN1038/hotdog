"use client";

import dynamic from "next/dynamic";
import type { BranchLocationValue } from "@/components/admin/BranchLocationField";

const BranchLocationFieldInner = dynamic(
  () =>
    import("@/components/admin/BranchLocationField").then(
      (m) => m.BranchLocationField,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-500">
        กำลังโหลดแผนที่...
      </div>
    ),
  },
);

export type { BranchLocationValue };

export function BranchLocationPicker(props: {
  value: BranchLocationValue;
  onChange: (next: BranchLocationValue) => void;
}) {
  return <BranchLocationFieldInner {...props} />;
}
