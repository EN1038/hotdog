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
  staffName?: string | null;
  orderType?: string | null;
  items?: Array<{ name: string; optionsText?: string | null; qty: number; price: number; total: number }> | null;
  subtotal?: number | null;
  discount?: number | null;
  paymentMethod?: string | null;
  amountReceived?: number | null;
  change?: number | null;
  totalAmount?: number | null;
  brandName?: string | null;
  branchName?: string | null;
  branchAddress?: string | null;
};

type AndroidPrintBridge = {
  isPrintBridge?: () => boolean;
  getSelectedPrinter?: () => string;
  selectPrinter?: () => void;
  printQueueNumber?: (queueNumber: string) => string;
  printQueueTickets?: (json: string) => string;
  printPackageLabels?: (json: string) => string;
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
  if (typeof bridge.printPackageLabels === "function") return bridge;
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

export function hasPackageLabelPrintBridge(): boolean {
  return typeof getBridge()?.printPackageLabels === "function";
}

export function canPrintPackageLabelsNative(): boolean {
  return canUsePrintActions() && hasPackageLabelPrintBridge();
}

/** In-app: try native print; never fall back to browser popup. */
export function shouldUseBrowserPackageLabelPrint(): boolean {
  return !hasPrintBridge();
}

export type PackageLabelBridgeInput = {
  labelCode: string;
  qrPayload: string;
  productName: string;
  productCode: string;
  brandName?: string | null;
  sourceBranchName?: string | null;
  quantity: number;
  unit: string;
  producedAtLabel?: string;
  lotNumber: string;
  copies?: number;
};

export type PackageLabelPrintEnvelope = {
  brandId?: string;
  layoutVersion: number;
  layout?: Record<string, unknown>;
  labels: PackageLabelBridgeInput[];
};

/** @deprecated Use printPackageLabelsEnvelope — kept for legacy APK array payloads */
export function printPackageLabels(
  labels: PackageLabelBridgeInput[],
): PrintBridgeResult | null {
  return printPackageLabelsLegacyArray(labels);
}

function isLegacyPackageLabelEnvelopeError(message: string | undefined): boolean {
  if (!message) return false;
  return (
    message.includes("cannot be converted to JSONArray") ||
    message.includes("org.json.JSONArray") ||
    (message.startsWith("Value {") && message.includes("layoutVersion"))
  );
}

/** Legacy APK payload: JSON array of labels only (no layout envelope). */
export function printPackageLabelsLegacyArray(
  labels: PackageLabelBridgeInput[],
): PrintBridgeResult | null {
  if (!canUsePrintActions()) {
    return { code: "-1", message: "ยังไม่ได้เชื่อมเครื่องพิมพ์" };
  }
  const bridge = getBridge();
  if (!bridge?.printPackageLabels) return null;
  try {
    return JSON.parse(
      bridge.printPackageLabels(JSON.stringify(labels)),
    ) as PrintBridgeResult;
  } catch (e) {
    return {
      code: "-1",
      message: e instanceof Error ? e.message : "พิมพ์ป้ายรายการไม่สำเร็จ",
    };
  }
}

export function printPackageLabelsEnvelope(
  envelope: PackageLabelPrintEnvelope,
): PrintBridgeResult | null {
  if (!canUsePrintActions()) {
    return { code: "-1", message: "ยังไม่ได้เชื่อมเครื่องพิมพ์" };
  }
  const bridge = getBridge();
  if (!bridge?.printPackageLabels) return null;
  try {
    const result = JSON.parse(
      bridge.printPackageLabels(JSON.stringify(envelope)),
    ) as PrintBridgeResult;
    if (result?.code === "1") return result;
    if (isLegacyPackageLabelEnvelopeError(result?.message)) {
      return printPackageLabelsLegacyArray(envelope.labels);
    }
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : "พิมพ์ป้ายรายการไม่สำเร็จ";
    if (isLegacyPackageLabelEnvelopeError(message)) {
      return printPackageLabelsLegacyArray(envelope.labels);
    }
    return { code: "-1", message };
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

export function clampTicketCopies(raw: number | null | undefined): number {
  if (raw == null || !Number.isFinite(raw)) return 1;
  return Math.min(5, Math.max(1, Math.trunc(raw)));
}

/** Bangkok date+time label for receipt. If input is a date-only string (YYYY-MM-DD),
 * uses the current time instead of midnight UTC to avoid the 07:00 bug. */
export function formatTicketDateLabel(
  isoOrDay: string | null | undefined,
): string {
  if (!isoOrDay) return "";
  const trimmed = isoOrDay.trim();
  try {
    // If it's a date-only string like "2025-07-27", attach current time
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
    const d = isDateOnly ? new Date() : new Date(trimmed);
    if (Number.isNaN(d.getTime())) return trimmed;
    return d.toLocaleString("th-TH", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
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
    staffName: payload.staffName?.trim() || "",
    orderType: payload.orderType?.trim() || "",
    items: payload.items || [],
    subtotal: payload.subtotal || 0,
    discount: payload.discount || 0,
    paymentMethod: payload.paymentMethod?.trim() || "",
    amountReceived: payload.amountReceived || 0,
    change: payload.change || 0,
    totalAmount: payload.totalAmount || 0,
    brandName: payload.brandName?.trim() || "",
    branchName: payload.branchName?.trim() || "",
    branchAddress: payload.branchAddress?.trim() || "",
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
