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

type AndroidPrintBridge = {
  isPrintBridge?: () => boolean;
  getSelectedPrinter?: () => string;
  selectPrinter?: () => void;
  setNetworkPrinter?: (ip: string) => string;
  printQueueNumber?: (queueNumber: string) => string;
};

declare global {
  interface Window {
    Android?: AndroidPrintBridge;
  }
}

function getBridge(): AndroidPrintBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = window.Android;
  if (!bridge || typeof bridge.printQueueNumber !== "function") return null;
  return bridge;
}

export function hasPrintBridge(): boolean {
  return getBridge() != null;
}

export function getSelectedPrinter(): PrintBridgePrinter | null {
  const bridge = getBridge();
  if (!bridge?.getSelectedPrinter) return null;
  try {
    const raw = bridge.getSelectedPrinter();
    if (!raw || raw === "null") return null;
    return JSON.parse(raw) as PrintBridgePrinter;
  } catch {
    return null;
  }
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

/** Fire-and-forget when a new queue is created inside the print APK. */
export function autoPrintQueueNumber(
  queueNumber: number | string | null | undefined,
): void {
  if (!hasPrintBridge()) return;
  if (queueNumber == null || queueNumber === "") return;
  try {
    printQueueNumber(queueNumber);
  } catch {
    // ignore — toast is shown by native side on failure
  }
}

export function formatPrinterLabel(printer: PrintBridgePrinter | null): string {
  if (!printer) return "เลือกเครื่องพิมพ์";
  if (printer.transport === "network") {
    return `พิมพ์ IP ${printer.address || printer.mac}`;
  }
  return `พิมพ์ ${printer.name}`;
}
