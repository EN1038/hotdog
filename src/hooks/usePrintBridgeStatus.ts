"use client";

import { useEffect, useState } from "react";
import {
  formatPrinterLabel,
  getPrintBridgeStatus,
  type PrintBridgeStatus,
} from "@/lib/print-bridge";

export type PrintBridgeStatusView = PrintBridgeStatus & {
  label: string;
};

export function usePrintBridgeStatus(): PrintBridgeStatusView {
  const [status, setStatus] = useState<PrintBridgeStatusView>(() => {
    const base = getPrintBridgeStatus();
    return {
      ...base,
      label: base.inApp
        ? formatPrinterLabel(base.printer)
        : "เปิดผ่านแอป SkillSale Print เพื่อเชื่อมเครื่องพิมพ์",
    };
  });

  useEffect(() => {
    const refresh = () => {
      const base = getPrintBridgeStatus();
      setStatus({
        ...base,
        label: base.inApp
          ? formatPrinterLabel(base.printer)
          : "เปิดผ่านแอป SkillSale Print เพื่อเชื่อมเครื่องพิมพ์",
      });
    };
    refresh();
    window.addEventListener("skillsale-print-ready", refresh);
    const id = window.setInterval(refresh, 1200);
    return () => {
      window.removeEventListener("skillsale-print-ready", refresh);
      window.clearInterval(id);
    };
  }, []);

  return status;
}
