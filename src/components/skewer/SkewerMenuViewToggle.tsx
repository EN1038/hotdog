"use client";

import { IconGridView, IconListView } from "@/components/icons";

export type SkewerMenuViewMode = "list" | "grid";

export const SKEWER_MENU_VIEW_STORAGE_KEY = "skewer-menu-view";

export function SkewerMenuViewToggle({
  value,
  onChange,
}: {
  value: SkewerMenuViewMode;
  onChange: (next: SkewerMenuViewMode) => void;
}) {
  return (
    <div
      className="inline-flex shrink-0 items-center gap-0.5 rounded-xl border border-gray-200 bg-gray-50 p-0.5"
      role="group"
      aria-label="รูปแบบแสดงเมนู"
    >
      <button
        type="button"
        onClick={() => onChange("list")}
        className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${
          value === "list"
            ? "bg-site-primary text-white shadow-sm"
            : "text-gray-500 hover:bg-white hover:text-gray-800"
        }`}
        aria-label="แสดงแบบรายการ"
        aria-pressed={value === "list"}
        title="รายการ"
      >
        <IconListView size={18} />
      </button>
      <button
        type="button"
        onClick={() => onChange("grid")}
        className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${
          value === "grid"
            ? "bg-site-primary text-white shadow-sm"
            : "text-gray-500 hover:bg-white hover:text-gray-800"
        }`}
        aria-label="แสดงแบบรูปใหญ่"
        aria-pressed={value === "grid"}
        title="รูป"
      >
        <IconGridView size={18} />
      </button>
    </div>
  );
}
