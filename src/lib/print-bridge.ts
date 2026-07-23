/** Native Android WebView print bridge (SkillSale Print APK). */

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
  /** Running inside SkillSale Print APK */
  inApp: boolean;
  /** A printer target is saved (IP or Bluetooth) */
  configured: boolean;
  printer: PrintBridgePrinter | null;
};

type AndroidPrintBridge = {
  isPrintBridge?: () => boolean;
  getSelectedPrinter?: () => string;
  selectPrinter?: () => void;
  setNetworkPrinter?: (ip: string) => string;
  printQueueNumber?: (queueNumber: string) => string;
  clearPrinter?: () => void;
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
  // Android WebView sometimes exposes Java methods with typeof !== "function"
  const printable = bridge.printQueueNumber as unknown;
  if (typeof printable === "function") return bridge;
  if (typeof printable !== "undefined") return bridge;
  if (typeof bridge.isPrintBridge === "function") {
    try {
      if (bridge.isPrintBridge()) return bridge;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** True only inside the SkillSale Print APK (not normal browser). */
export function hasPrintBridge(): boolean {
  if (getBridge() != null) return true;
  if (typeof navigator !== "undefined") {
    if (/SkillSalePrint/i.test(navigator.userAgent)) return true;
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
    if (!parsed?.name && !parsed?.address && !parsed?.mac) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Printer target saved → print UI / auto-print allowed. */
export function isPrinterConfigured(): boolean {
  return getSelectedPrinter() != null;
}

export function getPrintBridgeStatus(): PrintBridgeStatus {
  const inApp = hasPrintBridge();
  const printer = inApp ? getSelectedPrinter() : null;
  return {
    inApp,
    configured: printer != null,
    printer,
  };
}

/** Show reprint / auto-print only in APK with a configured printer. */
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

/** Save One thermal printer over LAN/Wi‑Fi (default store IP often 192.168.8.20). */
export function setNetworkPrinter(ip: string): PrintBridgeResult | null {
  const bridge = getBridge();
  if (!bridge?.setNetworkPrinter) return null;
  try {
    const raw = bridge.setNetworkPrinter(ip.trim());
    return JSON.parse(raw) as PrintBridgeResult;
  } catch (e) {
    return {
      code: "-1",
      message: e instanceof Error ? e.message : "ตั้งค่า IP ไม่สำเร็จ",
    };
  }
}

export function printQueueNumber(
  queueNumber: number | string | null | undefined,
): PrintBridgeResult | null {
  if (!canUsePrintActions()) {
    return { code: "-1", message: "ยังไม่ได้เชื่อมเครื่องพิมพ์" };
  }
  const bridge = getBridge();
  if (!bridge?.printQueueNumber) return null;
  if (queueNumber == null || queueNumber === "") {
    return { code: "-1", message: "ไม่มีเลขคิว" };
  }
  try {
    const raw = bridge.printQueueNumber(String(queueNumber));
    return JSON.parse(raw) as PrintBridgeResult;
  } catch (e) {
    return {
      code: "-1",
      message: e instanceof Error ? e.message : "พิมพ์ไม่สำเร็จ",
    };
  }
}

/** Auto-print only when a printer is configured; otherwise no-op (normal flow). */
export function autoPrintQueueNumber(
  queueNumber: number | string | null | undefined,
): void {
  if (!canUsePrintActions()) return;
  if (queueNumber == null || queueNumber === "") return;
  try {
    printQueueNumber(queueNumber);
  } catch {
    // ignore — toast is shown by native side on failure
  }
}

export function formatPrinterLabel(printer: PrintBridgePrinter | null): string {
  if (!printer) return "ยังไม่เชื่อมเครื่องพิมพ์ — แตะเพื่อเลือก";
  if (printer.transport === "network") {
    return `เชื่อมแล้ว · IP ${printer.address || printer.mac}`;
  }
  return `เชื่อมแล้ว · ${printer.name}`;
}
