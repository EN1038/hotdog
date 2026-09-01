"use client";

import { btnOutline } from "@/components/admin/AdminShell";
import { openProductLabelPrint } from "@/lib/product-label-print";

type Props = {
  code: string;
  name: string;
  itemId?: string | null;
  branchName?: string | null;
  copies?: number;
  className?: string;
  label?: string;
  disabled?: boolean;
};

export function ProductLabelPrintButton({
  code,
  name,
  itemId,
  branchName,
  copies = 1,
  className,
  label = "พิมพ์ป้าย",
  disabled,
}: Props) {
  const canPrint = Boolean(code.trim()) && !disabled;

  return (
    <button
      type="button"
      className={className ?? `${btnOutline} text-xs`}
      disabled={!canPrint}
      title={canPrint ? "พิมพ์ป้ายบาร์โค้ด + QR" : "ยังไม่มีรหัสสินค้า"}
      onClick={() =>
        void openProductLabelPrint([
          { code, name, itemId, branchName, copies },
        ])
      }
    >
      {label}
    </button>
  );
}
