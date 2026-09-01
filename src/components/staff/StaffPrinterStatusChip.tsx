"use client";

import { IconPrinter } from "@/components/icons";
import { usePrintBridgeStatus } from "@/hooks/usePrintBridgeStatus";
import {
  hasPackageLabelPrintBridge,
  selectPrinter,
} from "@/lib/print-bridge";

type Props = {
  /** When true, show a hint that browser print is used outside the APK. */
  showBrowserHint?: boolean;
  /** Package labels require a TSC/3R20 sticker printer in the APK. */
  requireTsc?: boolean;
  className?: string;
};

export function StaffPrinterStatusChip({
  showBrowserHint = false,
  requireTsc = false,
  className = "",
}: Props) {
  const { inApp, configured, printer, label } = usePrintBridgeStatus();
  const hasPackageBridge = hasPackageLabelPrintBridge();
  const isTsc = printer?.type === "TSC";
  const readyForPackage =
    configured && hasPackageBridge && (!requireTsc || isTsc);
  let displayLabel = label;
  if (requireTsc && inApp && configured && !hasPackageBridge) {
    displayLabel = "อัปเดตแอป v1.2.0 เพื่อพิมพ์ป้ายแพ็ก";
  } else if (requireTsc && configured && hasPackageBridge && !isTsc) {
    displayLabel = "เชื่อมแล้ว · ต้องใช้เครื่องป้าย TSC/3R20";
  }

  if (!inApp) {
    if (!showBrowserHint) return null;
    return (
      <p
        className={`rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold leading-snug text-slate-600 ${className}`}
      >
        พิมพ์ป้ายผ่านหน้าต่างเบราว์เซอร์ · {label}
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={() => selectPrinter()}
      title={label}
      aria-label={label}
      className={`flex max-w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-[11px] font-bold leading-tight active:scale-[0.99] ${
        readyForPackage
          ? "border-emerald-300 bg-emerald-50 text-emerald-900"
          : "border-amber-300 bg-amber-50 text-amber-950"
      } ${className}`}
    >
      <IconPrinter size={16} className="shrink-0" aria-hidden />
      <span className="min-w-0 truncate">{displayLabel}</span>
    </button>
  );
}
