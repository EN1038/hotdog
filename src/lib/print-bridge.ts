/** Native Android WebView print bridge (SkillSale Print APK) — Bluetooth only. */

export type PrintBridgePrinter = {
  name: string;
  mac: string;
  address?: string;
  transport?: "bluetooth" | "network" | string;
  type: string;
};

export type PrintBridgeResult = {
  code: string;
  message: string;
};

export type PrintBridgeStatus = {
  inApp: boolean;
  configured: boolean;
  printer: PrintBridgePrinter | null;
};

export type QueueTicketPayload = {
  queueNumber: number | string | null | undefined;
  orderNumber?: string | null;
  dateLabel?: string | null;
  copies?: number | null;
};

type AndroidPrintBridge = {
  isPrintBridge?: () => boolean;
  getSelectedPrinter?: () => string;
  selectPrinter?: () => void;
  printQueueNumber?: (queueNumber: string) => string;
  printQueueTickets?: (json: string) => string;
};

declare global {
  interface Window {
    Android?: AndroidPrintBridge;
    __SKILLSALE_PRINT__?: boolean;
  }
}

function getBridge(): AndroidPrintBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = window.Android;
  if (!bridge) return null;
  if (typeof bridge.printQueueTickets === "function") return bridge;
  if (typeof bridge.printQueueNumber === "function") return bridge;
  if (typeof bridge.isPrintBridge === "function") {
    try {
      if (bridge.isPrintBridge()) return bridge;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function hasPrintBridge(): boolean {
  if (getBridge() != null) return true;
  if (typeof navigator !== "undefined" && /SkillSalePrint/i.test(navigator.userAgent)) {
    return true;
  }
  if (typeof window !== "undefined" && window.__SKILLSALE_PRINT__) return true;
  return false;
}

export function getSelectedPrinter(): PrintBridgePrinter | null {
  const bridge = getBridge();
  if (!bridge?.getSelectedPrinter) return null;
  try {
    const raw = bridge.getSelectedPrinter();
    if (!raw || raw === "null") return null;
    const parsed = JSON.parse(raw) as PrintBridgePrinter;
    if (parsed.transport === "network") return null;
    if (!parsed?.name && !parsed?.address && !parsed?.mac) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isPrinterConfigured(): boolean {
  return getSelectedPrinter() != null;
}

export function getPrintBridgeStatus(): PrintBridgeStatus {
  const inApp = hasPrintBridge();
  const printer = inApp ? getSelectedPrinter() : null;
  return { inApp, configured: printer != null, printer };
}

export function canUsePrintActions(): boolean {
  return hasPrintBridge() && isPrinterConfigured();
}

export function selectPrinter(): boolean {
  const bridge = getBridge();
  if (!bridge?.selectPrinter) return false;
  try {
    bridge.selectPrinter();
    return true;
  } catch {
    return false;
  }
}

export function clampTicketCopies(raw: number | null | undefined): number {
  if (raw == null || !Number.isFinite(raw)) return 1;
  return Math.min(5, Math.max(1, Math.trunc(raw)));
}

/** Bangkok calendar day as YYYY-MM-DD (or pass-through if already that shape). */
export function formatTicketDateLabel(
  isoOrDay: string | null | undefined,
): string {
  if (!isoOrDay) return "";
  const trimmed = isoOrDay.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  try {
    return new Date(trimmed).toLocaleDateString("sv-SE", {
      timeZone: "Asia/Bangkok",
    });
  } catch {
    return trimmed.slice(0, 10);
  }
}

export function printQueueTickets(
  payload: QueueTicketPayload,
): PrintBridgeResult | null {
  if (!canUsePrintActions()) {
    return { code: "-1", message: "ยังไม่ได้เชื่อมเครื่องพิมพ์" };
  }
  const bridge = getBridge();
  if (!bridge) return null;
  const queueNumber = payload.queueNumber;
  if (queueNumber == null || queueNumber === "") {
    return { code: "-1", message: "ไม่มีเลขคิว" };
  }
  const body = JSON.stringify({
    queueNumber: String(queueNumber),
    orderNumber: payload.orderNumber?.trim() || "",
    dateLabel: payload.dateLabel?.trim() || "",
    copies: clampTicketCopies(payload.copies),
  });
  try {
    if (typeof bridge.printQueueTickets === "function") {
      return JSON.parse(bridge.printQueueTickets(body)) as PrintBridgeResult;
    }
    // Older APK fallback: single slip with queue only
    if (typeof bridge.printQueueNumber === "function") {
      return JSON.parse(
        bridge.printQueueNumber(String(queueNumber)),
      ) as PrintBridgeResult;
    }
    return { code: "-1", message: "แอปยังไม่รองรับพิมพ์บัตรคิว" };
  } catch (e) {
    return {
      code: "-1",
      message: e instanceof Error ? e.message : "พิมพ์ไม่สำเร็จ",
    };
  }
}

/** @deprecated use printQueueTickets */
export function printQueueNumber(
  queueNumber: number | string | null | undefined,
): PrintBridgeResult | null {
  return printQueueTickets({ queueNumber, copies: 1 });
}

export function autoPrintQueueTickets(payload: QueueTicketPayload): void {
  if (!canUsePrintActions()) return;
  if (payload.queueNumber == null || payload.queueNumber === "") return;
  try {
    printQueueTickets(payload);
  } catch {
    /* native toast on failure */
  }
}

/** @deprecated use autoPrintQueueTickets */
export function autoPrintQueueNumber(
  queueNumber: number | string | null | undefined,
): void {
  autoPrintQueueTickets({ queueNumber, copies: 1 });
}

export function formatPrinterLabel(printer: PrintBridgePrinter | null): string {
  if (!printer) return "ยังไม่เชื่อมเครื่องพิมพ์ — แตะเพื่อเลือก";
  return `เชื่อมแล้ว · ${printer.name}`;
}
