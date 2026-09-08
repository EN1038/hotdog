"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { StaffPhotoPickSheet } from "@/components/staff/StaffPhotoPickSheet";
import { DateInput } from "@/components/DateInput";
import { useToast } from "@/components/admin/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import {
  MobileDateRangeControl,
  mobileRangeForPreset,
  type MobileDatePresetId,
} from "@/components/owner/OwnerDatePresetChips";
import { bangkokDateKey, formatPrice } from "@/lib/constants";
import {
  MAX_PURCHASE_IMAGES,
  PURCHASE_CHANNELS,
  PURCHASE_CHANNEL_LABEL,
  PURCHASE_STATUS_LABEL,
  PURCHASE_STOCK_TYPE_LABEL,
  type PurchaseChannel,
  type PurchaseStockType,
} from "@/lib/branch-purchase";
import {
  IconBack,
  IconCamera,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconClose,
  IconImage,
  IconNote,
  IconPlus,
  IconRefresh,
  IconTrash,
} from "@/components/icons";
import { formatOperatingDayLabel } from "@/lib/operating-day";

/** ประเภทที่ใช้ในฟอร์มจัดซื้อ (ตามสเปกหน้าร้าน) */
const PURCHASE_FORM_STOCK_TYPES = ["CONSUMABLE", "EQUIPMENT"] as const;

type CatalogItem = {
  id: string;
  name: string;
  itemCode: string | null;
  unit: string;
  unitPrice: number | null;
  imageUrl: string | null;
  stockType: string;
  stockTypeLabel: string;
  quantity: number;
};

type DraftLine = {
  key: string;
  branchNonMenuItemId: string;
  itemName: string;
  itemCode: string | null;
  unit: string;
  unitPrice: number | null;
  /** Snapshot of master price when added (for compare / history) */
  systemUnitPrice: number | null;
  quantity: number;
  stockType: PurchaseStockType;
  imageUrl: string | null;
};

type PurchaseLineView = {
  branchNonMenuItemId?: string | null;
  itemName: string;
  itemCode?: string | null;
  quantity: number;
  unit: string;
  unitPrice?: number | null;
  systemUnitPrice?: number | null;
  stockType?: string;
  imageUrl?: string | null;
};

type PurchaseListItem = {
  id: string;
  documentDate: string;
  documentNo: string;
  channel: string;
  status: string;
  lines: PurchaseLineView[];
};

type Mode = "list" | "create" | "detail";

function newLineKey() {
  return `l-${Math.random().toString(36).slice(2, 10)}`;
}

function sumBillTotal(lines: { unitPrice?: number | null; quantity: number }[]) {
  return lines.reduce((sum, l) => sum + (l.unitPrice ?? 0) * l.quantity, 0);
}

function sumSystemTotal(
  lines: { systemUnitPrice?: number | null; quantity: number }[],
) {
  return lines.reduce(
    (sum, l) => sum + (l.systemUnitPrice ?? 0) * l.quantity,
    0,
  );
}

function hasSystemPriceOnLines(
  lines: { systemUnitPrice?: number | null }[],
) {
  return lines.some((l) => l.systemUnitPrice != null);
}

function PurchaseStatusIcon({ status }: { status: string }) {
  const label =
    PURCHASE_STATUS_LABEL[status as keyof typeof PURCHASE_STATUS_LABEL] ??
    status;
  if (status === "CONFIRMED") {
    return (
      <span
        title={label}
        aria-label={label}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200"
      >
        <IconCheck size={16} />
      </span>
    );
  }
  if (status === "CANCELLED") {
    return (
      <span
        title={label}
        aria-label={label}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 ring-1 ring-slate-200"
      >
        <IconClose size={16} />
      </span>
    );
  }
  return (
    <span
      title={label}
      aria-label={label}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800 ring-1 ring-amber-200"
    >
      <IconNote size={16} />
    </span>
  );
}

function ItemThumb({
  src,
  size = "md",
}: {
  src?: string | null;
  size?: "sm" | "md";
}) {
  const box = size === "sm" ? "h-11 w-11" : "h-14 w-14";
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className={`${box} shrink-0 rounded-xl object-cover ring-1 ring-site-primary/15`}
      />
    );
  }
  return (
    <span
      className={`flex ${box} shrink-0 items-center justify-center rounded-xl bg-site-primary-soft text-site-primary ring-1 ring-site-primary/20`}
    >
      <IconImage size={size === "sm" ? 18 : 22} />
    </span>
  );
}

export default function StaffPurchasesPage() {
  const toast = useToast();
  const { confirm } = useConfirm();
  const today = bangkokDateKey();
  const initialRange = mobileRangeForPreset("today", today);
  const [mode, setMode] = useState<Mode>("list");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<PurchaseListItem[]>([]);
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const [datePreset, setDatePreset] = useState<MobileDatePresetId>("today");
  const [detail, setDetail] = useState<
    | (PurchaseListItem & {
        channelNote?: string | null;
        note?: string | null;
        imageUrls?: string[];
        lines: PurchaseLineView[];
      })
    | null
  >(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingWasConfirmed, setEditingWasConfirmed] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const [documentDate, setDocumentDate] = useState(today);
  const [documentNo, setDocumentNo] = useState("");
  const [channel, setChannel] = useState<PurchaseChannel>("CASH");
  const [channelNote, setChannelNote] = useState("");
  const [note, setNote] = useState("");
  const [stockType, setStockType] = useState<PurchaseStockType>("CONSUMABLE");
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [docGenBusy, setDocGenBusy] = useState(false);
  const [photoPickOpen, setPhotoPickOpen] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  /** One document = one stock type; lock after the first line is added. */
  const lockedStockType = lines[0]?.stockType ?? null;
  const activeStockType = lockedStockType ?? stockType;

  const rangeHint = useMemo(() => {
    const a = formatOperatingDayLabel(dateFrom) || dateFrom;
    const b = formatOperatingDayLabel(dateTo) || dateTo;
    return dateFrom === dateTo ? a : `${a} – ${b}`;
  }, [dateFrom, dateTo]);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const from = dateFrom <= dateTo ? dateFrom : dateTo;
      const to = dateFrom <= dateTo ? dateTo : dateFrom;
      const params = new URLSearchParams({
        from,
        to,
        limit: "40",
      });
      const res = await fetch(`/api/staff/purchases?${params}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        // Empty / missing table should still be 200 — only toast real failures
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setItems([]);
        if (res.status >= 500) {
          toast.error(
            body.error || "โหลดรายการจัดซื้อไม่สำเร็จ",
          );
        }
        return;
      }
      const data = (await res.json()) as { items?: PurchaseListItem[] };
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setItems([]);
      toast.error("โหลดรายการจัดซื้อไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, toast]);

  useEffect(() => {
    if (mode !== "list") return;
    void loadList();
  }, [loadList, mode]);

  async function suggestDocumentNo(date: string): Promise<string> {
    setDocGenBusy(true);
    try {
      const res = await fetch(
        `/api/staff/purchases/document-no?date=${encodeURIComponent(date)}`,
      );
      const data = (await res.json().catch(() => ({}))) as {
        documentNo?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "สร้างเลขที่เอกสารไม่สำเร็จ");
      }
      const next = String(data.documentNo ?? "").trim();
      if (next) {
        setDocumentNo(next);
        return next;
      }
      throw new Error("ไม่ได้รับเลขที่เอกสารจากเซิร์ฟเวอร์");
    } catch (err) {
      const day = date.replace(/-/g, "");
      const fallback = `PO-${day}-${String(Date.now() % 1000).padStart(3, "0")}`;
      setDocumentNo(fallback);
      toast.error(
        err instanceof Error ? err.message : "สร้างเลขที่เอกสารไม่สำเร็จ",
        `ใช้เลขชั่วคราว ${fallback} — กดปุ่มอีกครั้งหรือแก้เองได้`,
      );
      return fallback;
    } finally {
      setDocGenBusy(false);
    }
  }

  async function loadCatalog(type: PurchaseStockType) {
    setCatalogLoading(true);
    try {
      const res = await fetch(
        `/api/staff/purchases/catalog?stockType=${encodeURIComponent(type)}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("โหลดสินค้าไม่สำเร็จ");
      const data = (await res.json()) as { items?: CatalogItem[] };
      setCatalog(Array.isArray(data.items) ? data.items : []);
    } catch {
      toast.error("โหลดรายการสินค้าไม่สำเร็จ");
      setCatalog([]);
    } finally {
      setCatalogLoading(false);
    }
  }

  function openCreate() {
    setMode("create");
    setEditingId(null);
    setEditingWasConfirmed(false);
    const docDate = dateFrom === dateTo ? dateFrom : today;
    setDocumentDate(docDate);
    setChannel("CASH");
    setChannelNote("");
    setNote("");
    setStockType("CONSUMABLE");
    setLines([]);
    setImageUrls([]);
    setDetail(null);
    void suggestDocumentNo(docDate);
  }

  function openEditFromDetail() {
    if (!detail || detail.status === "CANCELLED") return;
    const firstType = detail.lines.find((l) =>
      l.stockType === "CONSUMABLE" || l.stockType === "EQUIPMENT",
    )?.stockType as PurchaseStockType | undefined;
    setEditingId(detail.id);
    setEditingWasConfirmed(detail.status === "CONFIRMED");
    setDocumentDate(detail.documentDate);
    setDocumentNo(detail.documentNo);
    setChannel((detail.channel as PurchaseChannel) || "CASH");
    setChannelNote(detail.channelNote ?? "");
    setNote(detail.note ?? "");
    setStockType(firstType ?? "CONSUMABLE");
    setImageUrls(detail.imageUrls ?? []);
    setLines(
      detail.lines
        .filter((l) => l.branchNonMenuItemId)
        .map((l) => ({
          key: newLineKey(),
          branchNonMenuItemId: String(l.branchNonMenuItemId),
          itemName: l.itemName,
          itemCode: l.itemCode ?? null,
          unit: l.unit,
          unitPrice: l.unitPrice ?? 0,
          systemUnitPrice: l.systemUnitPrice ?? null,
          quantity: l.quantity,
          stockType: (l.stockType === "EQUIPMENT"
            ? "EQUIPMENT"
            : "CONSUMABLE") as PurchaseStockType,
          imageUrl: l.imageUrl ?? null,
        })),
    );
    setMode("create");
  }

  async function deleteCurrentPurchase() {
    if (!detail) return;
    const ok = await confirm({
      title: "ลบรายการจัดซื้อ?",
      message:
        detail.status === "CONFIRMED"
          ? `ลบเอกสาร ${detail.documentNo} และถอนยอดออกจากสต๊อก`
          : `ลบเอกสาร ${detail.documentNo} ออกจากระบบ`,
      confirmLabel: "ลบ",
      cancelLabel: "ยกเลิก",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/staff/purchases/${detail.id}`, {
        method: "DELETE",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "ลบไม่สำเร็จ");
      toast.success(
        detail.status === "CONFIRMED"
          ? "ลบและถอนสต๊อกแล้ว"
          : "ลบรายการแล้ว",
      );
      setDetail(null);
      setMode("list");
      await loadList();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function openDetail(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/staff/purchases/${id}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("โหลดไม่สำเร็จ");
      const data = (await res.json()) as { item?: typeof detail };
      if (!data.item) throw new Error("ไม่พบรายการ");
      setDetail(data.item);
      setMode("detail");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "โหลดไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  function addFromCatalog(item: CatalogItem) {
    if (
      item.stockType !== "CONSUMABLE" &&
      item.stockType !== "EQUIPMENT"
    ) {
      return;
    }
    if (
      lockedStockType &&
      item.stockType !== lockedStockType
    ) {
      toast.error(
        `เอกสารนี้เป็น${PURCHASE_STOCK_TYPE_LABEL[lockedStockType]}แล้ว`,
        "ลบรายการทั้งหมดก่อนจึงเปลี่ยนประเภทได้",
      );
      return;
    }
    setStockType(item.stockType as PurchaseStockType);
    setLines((prev) => {
      const existing = prev.find((l) => l.branchNonMenuItemId === item.id);
      if (existing) {
        return prev.map((l) =>
          l.key === existing.key
            ? { ...l, quantity: l.quantity + 1 }
            : l,
        );
      }
      return [
        ...prev,
        {
          key: newLineKey(),
          branchNonMenuItemId: item.id,
          itemName: item.name,
          itemCode: item.itemCode,
          unit: item.unit,
          unitPrice: item.unitPrice ?? 0,
          systemUnitPrice: item.unitPrice,
          quantity: 1,
          stockType: item.stockType as PurchaseStockType,
          imageUrl: item.imageUrl,
        },
      ];
    });
    setPickerOpen(false);
  }

  function setLineUnitPrice(key: string, raw: string) {
    const trimmed = raw.trim();
    if (trimmed === "") {
      setLines((prev) =>
        prev.map((l) => (l.key === key ? { ...l, unitPrice: null } : l)),
      );
      return;
    }
    const n = Number(trimmed.replace(/,/g, ""));
    if (!Number.isFinite(n) || n < 0) return;
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, unitPrice: n } : l)),
    );
  }

  async function uploadImages(files: FileList | null) {
    if (!files || files.length === 0) return;
    const remaining = MAX_PURCHASE_IMAGES - imageUrls.length;
    if (remaining <= 0) {
      toast.error(`แนบรูปได้สูงสุด ${MAX_PURCHASE_IMAGES} รูป`);
      return;
    }
    setUploading(true);
    try {
      const next: string[] = [];
      const list = Array.from(files).slice(0, remaining);
      for (const file of list) {
        const form = new FormData();
        form.set("file", file);
        form.set("folder", "purchases");
        const res = await fetch("/api/staff/uploads", {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "อัปโหลดรูปไม่สำเร็จ");
        }
        const data = (await res.json()) as { url?: string };
        if (data.url) next.push(data.url);
      }
      setImageUrls((prev) => [...prev, ...next].slice(0, MAX_PURCHASE_IMAGES));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "อัปโหลดรูปไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  }

  async function savePurchase(doConfirm: boolean) {
    if (!documentNo.trim()) {
      toast.error("กรุณาระบุเลขที่เอกสาร");
      return;
    }
    if (lines.length === 0) {
      toast.error("เพิ่มสินค้าอย่างน้อย 1 รายการ");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        documentDate,
        documentNo: documentNo.trim(),
        channel,
        channelNote: channelNote.trim() || null,
        note: note.trim() || null,
        imageUrls,
        lines: lines.map((l) => ({
          branchNonMenuItemId: l.branchNonMenuItemId,
          itemName: l.itemName,
          itemCode: l.itemCode,
          unit: l.unit,
          unitPrice: l.unitPrice,
          systemUnitPrice: l.systemUnitPrice,
          quantity: l.quantity,
          stockType: l.stockType,
        })),
      };

      let purchaseId = editingId;
      if (editingId) {
        const res = await fetch(`/api/staff/purchases/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "บันทึกไม่สำเร็จ");
      } else {
        const res = await fetch("/api/staff/purchases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, confirm: doConfirm }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "บันทึกไม่สำเร็จ");
        purchaseId = body.item?.id ?? null;
      }

      if (doConfirm && editingId && purchaseId && !editingWasConfirmed) {
        const res = await fetch(`/api/staff/purchases/${purchaseId}/confirm`, {
          method: "POST",
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "ยืนยันไม่สำเร็จ");
      }

      toast.success(
        editingWasConfirmed
          ? "บันทึกการแก้ไขแล้ว"
          : doConfirm
            ? "ยืนยันและรับเข้าสต๊อกแล้ว"
            : "บันทึกฉบับร่างแล้ว",
      );
      setEditingId(null);
      setEditingWasConfirmed(false);
      setMode("list");
      await loadList();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDetail() {
    if (!detail) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/staff/purchases/${detail.id}/confirm`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "ยืนยันไม่สำเร็จ");
      toast.success("ยืนยันและรับเข้าสต๊อกแล้ว");
      setMode("list");
      await loadList();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ยืนยันไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const lineTotal = useMemo(
    () =>
      lines.reduce(
        (sum, l) => sum + (l.unitPrice ?? 0) * l.quantity,
        0,
      ),
    [lines],
  );

  const systemLineTotal = useMemo(
    () =>
      lines.reduce(
        (sum, l) => sum + (l.systemUnitPrice ?? 0) * l.quantity,
        0,
      ),
    [lines],
  );

  const hasSystemPrice = useMemo(
    () => lines.some((l) => l.systemUnitPrice != null),
    [lines],
  );

  return (
    <StaffAppShell active="home">
      <div className="px-4 pb-8 pt-4">
        {mode === "list" ? (
          <>
            <header className="mb-3 flex items-center gap-2">
              <Link
                href="/staff"
                aria-label="กลับ"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm ring-1 ring-slate-200"
              >
                <IconBack size={22} />
              </Link>
              <div className="min-w-0 flex-1">
                <h1 className="text-[18px] font-black text-slate-900">
                  จัดซื้อ
                </h1>
                <p className="text-[12px] font-medium text-slate-500">
                  รายการจัดซื้อสาขา · รับเข้าสต๊อกเมื่อยืนยัน
                </p>
              </div>
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex h-10 items-center gap-1 rounded-full bg-site-primary px-3.5 text-[13px] font-extrabold text-white"
              >
                <IconPlus size={16} />
                สร้าง
              </button>
            </header>

            <MobileDateRangeControl
              todayKey={today}
              from={dateFrom}
              to={dateTo}
              preset={datePreset}
              maxDate={today}
              className="mb-3"
              onChange={({ from: nextFrom, to: nextTo, preset }) => {
                setDatePreset(preset);
                setDateFrom(nextFrom);
                setDateTo(nextTo);
              }}
            />

            {loading ? (
              <p className="py-10 text-center text-sm text-slate-400">
                กำลังโหลด…
              </p>
            ) : items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-12 text-center">
                <p className="text-[15px] font-bold text-slate-700">
                  ยังไม่มีรายการจัดซื้อ
                </p>
                <p className="mt-1 text-[13px] text-slate-500">
                  ไม่มีเอกสารในช่วง {rangeHint}
                </p>
                <button
                  type="button"
                  onClick={openCreate}
                  className="mt-4 rounded-full bg-site-primary px-5 py-2.5 text-[13px] font-extrabold text-white"
                >
                  สร้างรายการจัดซื้อ
                </button>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {items.map((item) => {
                  const billTotal = sumBillTotal(item.lines);
                  const systemTotal = sumSystemTotal(item.lines);
                  const showSystem = hasSystemPriceOnLines(item.lines);
                  const expanded = Boolean(expandedIds[item.id]);
                  const previewLines = expanded
                    ? item.lines
                    : item.lines.slice(0, 2);
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => void openDetail(item.id)}
                        className="group w-full overflow-hidden rounded-2xl bg-white text-left shadow-sm ring-1 ring-slate-100 transition active:scale-[0.99]"
                      >
                        <div className="flex items-center gap-2 bg-site-primary-soft/70 px-4 py-3 ring-1 ring-inset ring-site-primary/15">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[14px] font-extrabold text-site-primary-strong">
                              {item.documentNo}
                            </p>
                            <p className="mt-0.5 text-[12px] font-medium text-site-primary-medium/80">
                              {item.documentDate} ·{" "}
                              {PURCHASE_CHANNEL_LABEL[
                                item.channel as PurchaseChannel
                              ] ?? item.channel}{" "}
                              · {item.lines.length} รายการ
                            </p>
                          </div>
                          <PurchaseStatusIcon status={item.status} />
                          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-site-primary text-white shadow-sm">
                            <IconChevronRight size={16} />
                          </span>
                        </div>

                        <div className="px-4 py-3">
                          <ul className="space-y-1.5">
                            {previewLines.map((l, idx) => (
                              <li
                                key={`${item.id}-${l.itemName}-${idx}`}
                                className="flex items-center justify-between gap-2 text-[12px]"
                              >
                                <span className="min-w-0 truncate font-semibold text-slate-700">
                                  {l.itemName}{" "}
                                  <span className="font-medium text-slate-400">
                                    ×{formatPrice(l.quantity)}
                                  </span>
                                </span>
                                <span className="shrink-0 tabular-nums font-bold text-slate-600">
                                  {formatPrice(
                                    (l.unitPrice ?? 0) * l.quantity,
                                  )}{" "}
                                  ฿
                                </span>
                              </li>
                            ))}
                          </ul>
                          {item.lines.length > 2 ? (
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setExpandedIds((prev) => ({
                                  ...prev,
                                  [item.id]: !prev[item.id],
                                }));
                              }}
                              onKeyDown={(e) => {
                                if (e.key !== "Enter" && e.key !== " ") return;
                                e.preventDefault();
                                e.stopPropagation();
                                setExpandedIds((prev) => ({
                                  ...prev,
                                  [item.id]: !prev[item.id],
                                }));
                              }}
                              className="mt-2 flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-site-primary/30 bg-site-primary-soft/30 py-2 text-[12px] font-bold text-site-primary active:bg-site-primary-soft/60"
                            >
                              {expanded
                                ? "หุบรายการ"
                                : `ดูทั้งหมด ${item.lines.length} รายการ`}
                              <IconChevronDown
                                size={16}
                                className={`transition-transform ${
                                  expanded ? "rotate-180" : ""
                                }`}
                              />
                            </span>
                          ) : null}

                          <div className="mt-3 flex items-end justify-between gap-3 border-t border-slate-100 pt-2.5">
                            <div className="min-w-0 text-left">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                จากระบบ
                              </p>
                              <p className="text-[13px] font-extrabold tabular-nums text-slate-500">
                                {showSystem
                                  ? `${formatPrice(systemTotal)} ฿`
                                  : "—"}
                              </p>
                            </div>
                            <div className="min-w-0 text-right">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                รวมประมาณ
                              </p>
                              <p className="text-[15px] font-black tabular-nums text-site-primary">
                                {formatPrice(billTotal)} ฿
                              </p>
                            </div>
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        ) : null}

        {mode === "create" ? (
          <>
            <header className="mb-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setMode(detail ? "detail" : "list");
                }}
                aria-label="กลับ"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm ring-1 ring-slate-200"
              >
                <IconBack size={22} />
              </button>
              <div className="min-w-0 flex-1">
                <h1 className="text-[18px] font-black text-slate-900">
                  {editingId ? "แก้ไขจัดซื้อ" : "สร้างรายการจัดซื้อ"}
                </h1>
                <p className="text-[12px] font-medium text-slate-500">
                  {editingWasConfirmed
                    ? "แก้แล้วบันทึก — ระบบจะปรับสต๊อกให้ตรงเอกสาร"
                    : editingId
                      ? "แก้ฉบับร่างแล้วบันทึกหรือยืนยันรับเข้าสต๊อก"
                      : "หนึ่งวันสร้างได้หลายเอกสาร"}
                </p>
              </div>
            </header>

            <div className="space-y-3">
              <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
                <label className="block text-[12px] font-bold text-slate-500">
                  วันที่เอกสาร
                </label>
                <DateInput
                  value={documentDate}
                  max={today}
                  onChange={(next) => {
                    setDocumentDate(next);
                    if (!editingId) void suggestDocumentNo(next);
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[15px] font-semibold"
                />
                <label className="mt-3 block text-[12px] font-bold text-slate-500">
                  เลขที่เอกสาร
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    value={documentNo}
                    onChange={(e) =>
                      setDocumentNo(e.target.value.toUpperCase())
                    }
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-[14px] font-bold tracking-tight text-slate-900"
                    placeholder="กำลังสร้างเลขที่…"
                  />
                  <button
                    type="button"
                    onClick={() => void suggestDocumentNo(documentDate)}
                    disabled={docGenBusy}
                    aria-label="สร้างเลขที่เอกสารอัตโนมัติ"
                    title="สร้างเลขที่อัตโนมัติ"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 active:bg-emerald-100 disabled:opacity-50"
                  >
                    <IconRefresh
                      size={20}
                      className={docGenBusy ? "animate-spin" : undefined}
                    />
                  </button>
                </div>
                <label className="mt-3 block text-[12px] font-bold text-slate-500">
                  ช่องทางการจัดซื้อ
                </label>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {PURCHASE_CHANNELS.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setChannel(id)}
                      className={`rounded-full px-3.5 py-2 text-[13px] font-extrabold ${
                        channel === id
                          ? "bg-site-primary text-white"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {PURCHASE_CHANNEL_LABEL[id]}
                    </button>
                  ))}
                </div>
                {channel === "OTHER" || channel === "CREDIT" ? (
                  <input
                    value={channelNote}
                    onChange={(e) => setChannelNote(e.target.value)}
                    placeholder="รายละเอียดช่องทาง (ถ้ามี)"
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[14px] font-semibold"
                  />
                ) : null}
              </section>

              <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
                <p className="text-[14px] font-extrabold text-slate-900">
                  สินค้า
                </p>
                <div className="mt-2 flex gap-2">
                  {PURCHASE_FORM_STOCK_TYPES.map((id) => {
                    const locked = lockedStockType != null;
                    const selected = activeStockType === id;
                    const disabled = locked && lockedStockType !== id;
                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          if (locked) return;
                          setStockType(id);
                        }}
                        className={`flex-1 rounded-full px-3 py-2.5 text-[13px] font-extrabold transition-colors ${
                          selected
                            ? "bg-site-primary text-white shadow-sm"
                            : disabled
                              ? "cursor-not-allowed bg-slate-100 text-slate-400"
                              : "bg-site-primary-soft/50 text-site-primary-medium ring-1 ring-site-primary/15"
                        }`}
                      >
                        {PURCHASE_STOCK_TYPE_LABEL[id]}
                      </button>
                    );
                  })}
                </div>

                {lines.length === 0 ? null : (
                  <ul className="mt-3 space-y-2">
                    {lines.map((line) => {
                      const lineBaht = (line.unitPrice ?? 0) * line.quantity;
                      return (
                        <li
                          key={line.key}
                          className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm"
                        >
                          <div className="flex items-center gap-3">
                            <ItemThumb src={line.imageUrl} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="min-w-0 flex-1 truncate text-[14px] font-extrabold text-slate-900">
                                  {line.itemName}
                                </p>
                                <button
                                  type="button"
                                  aria-label="ลบรายการ"
                                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600 ring-1 ring-rose-100 active:bg-rose-100"
                                  onClick={() =>
                                    setLines((prev) =>
                                      prev.filter((l) => l.key !== line.key),
                                    )
                                  }
                                >
                                  <IconTrash size={16} />
                                </button>
                              </div>
                              <div className="mt-2 flex items-center gap-2">
                                <div className="flex h-8 items-center overflow-hidden rounded-full border border-slate-200 bg-slate-50">
                                  <button
                                    type="button"
                                    aria-label="ลดจำนวน"
                                    className="flex h-full w-8 shrink-0 items-center justify-center text-[15px] font-bold text-slate-600 active:bg-slate-100"
                                    onClick={() =>
                                      setLines((prev) =>
                                        prev
                                          .map((l) =>
                                            l.key === line.key
                                              ? {
                                                  ...l,
                                                  quantity: Math.max(
                                                    1,
                                                    l.quantity - 1,
                                                  ),
                                                }
                                              : l,
                                          )
                                          .filter((l) => l.quantity > 0),
                                      )
                                    }
                                  >
                                    −
                                  </button>
                                  <span className="min-w-[1.75rem] text-center text-[13px] font-black tabular-nums text-slate-900">
                                    {line.quantity}
                                  </span>
                                  <button
                                    type="button"
                                    aria-label="เพิ่มจำนวน"
                                    className="flex h-full w-8 shrink-0 items-center justify-center text-[15px] font-bold text-slate-600 active:bg-slate-100"
                                    onClick={() =>
                                      setLines((prev) =>
                                        prev.map((l) =>
                                          l.key === line.key
                                            ? {
                                                ...l,
                                                quantity: l.quantity + 1,
                                              }
                                            : l,
                                        ),
                                      )
                                    }
                                  >
                                    +
                                  </button>
                                </div>
                                <span className="text-[12px] font-medium text-slate-500">
                                  {line.unit}
                                </span>
                                <span className="ml-auto text-[13px] font-extrabold tabular-nums text-site-primary">
                                  {formatPrice(lineBaht)} ฿
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="mt-2.5 flex items-center gap-2">
                            <span className="shrink-0 text-[12px] font-bold text-slate-500">
                              ราคา/{line.unit}
                            </span>
                            <div className="flex h-9 min-w-0 flex-1 items-center overflow-hidden rounded-full border border-slate-200 bg-white pl-3 pr-1 shadow-sm focus-within:border-site-primary focus-within:ring-1 focus-within:ring-site-primary/30">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={
                                  line.unitPrice == null
                                    ? ""
                                    : String(line.unitPrice)
                                }
                                placeholder="0"
                                onChange={(e) =>
                                  setLineUnitPrice(line.key, e.target.value)
                                }
                                className="min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 text-right text-[14px] font-extrabold tabular-nums text-slate-900 outline-none ring-0 placeholder:font-semibold placeholder:text-slate-300"
                              />
                              <span className="ml-1.5 flex h-7 shrink-0 items-center rounded-full bg-site-primary-soft px-2.5 text-[12px] font-extrabold text-site-primary">
                                ฿
                              </span>
                            </div>
                          </div>
                          {line.systemUnitPrice != null ? (
                            <p className="mt-1.5 text-[11px] font-medium text-slate-500">
                              จากระบบ {formatPrice(line.systemUnitPrice)} ฿/
                              {line.unit}
                              {line.unitPrice != null &&
                              line.unitPrice !== line.systemUnitPrice ? (
                                <span
                                  className={
                                    line.unitPrice > line.systemUnitPrice
                                      ? " text-rose-600"
                                      : " text-emerald-700"
                                  }
                                >
                                  {" "}
                                  ·{" "}
                                  {line.unitPrice > line.systemUnitPrice
                                    ? "แพงกว่า"
                                    : "ถูกกว่า"}{" "}
                                  {formatPrice(
                                    Math.abs(
                                      line.unitPrice - line.systemUnitPrice,
                                    ),
                                  )}{" "}
                                  ฿
                                </span>
                              ) : null}
                            </p>
                          ) : (
                            <p className="mt-1.5 text-[11px] font-medium text-slate-400">
                              ยังไม่มีราคามาตรฐานในระบบ
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setPickerOpen(true);
                    void loadCatalog(activeStockType);
                  }}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-site-primary/40 bg-site-primary-soft/40 px-3 py-3.5 text-[14px] font-extrabold text-site-primary active:bg-site-primary-soft/70"
                >
                  <IconPlus size={18} />
                  เพิ่มรายการ
                </button>

                {lines.length > 0 ? (
                  <div className="mt-3 flex items-end justify-between gap-3 border-t border-slate-100 pt-3">
                    <div className="min-w-0 text-left">
                      <p className="text-[11px] font-bold text-slate-400">
                        จากระบบ
                      </p>
                      <p className="text-[13px] font-extrabold tabular-nums text-slate-500">
                        {hasSystemPrice
                          ? `${formatPrice(systemLineTotal)} ฿`
                          : "—"}
                      </p>
                    </div>
                    <div className="min-w-0 text-right">
                      <p className="text-[11px] font-bold text-slate-400">
                        รวมประมาณ (บิล)
                      </p>
                      <p className="text-[15px] font-black tabular-nums text-site-primary">
                        {formatPrice(lineTotal)} ฿
                      </p>
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
                <p className="text-[14px] font-extrabold text-slate-900">
                  รูปแนบ{" "}
                  <span className="font-medium text-slate-400">
                    ({imageUrls.length}/{MAX_PURCHASE_IMAGES})
                  </span>
                </p>
                <p className="mt-0.5 text-[12px] font-medium text-slate-500">
                  กดเพื่อถ่ายรูปหรือเลือกจากอัลบั้ม · ไม่บังคับ
                </p>

                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    void uploadImages(e.target.files);
                    e.target.value = "";
                    setPhotoPickOpen(false);
                  }}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => {
                    void uploadImages(e.target.files);
                    e.target.value = "";
                    setPhotoPickOpen(false);
                  }}
                />

                {imageUrls.length > 0 ? (
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {imageUrls.map((url) => (
                      <div key={url} className="relative aspect-square">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt=""
                          className="h-full w-full rounded-xl object-cover ring-1 ring-slate-200"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setImageUrls((prev) =>
                              prev.filter((u) => u !== url),
                            )
                          }
                          className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white"
                          aria-label="ลบรูป"
                        >
                          <IconClose size={12} />
                        </button>
                      </div>
                    ))}
                    {imageUrls.length < MAX_PURCHASE_IMAGES ? (
                      <button
                        type="button"
                        disabled={uploading}
                        onClick={() => setPhotoPickOpen(true)}
                        className="flex aspect-square flex-col items-center justify-center rounded-xl border-2 border-dashed border-site-primary/40 bg-site-primary-soft/40 text-site-primary disabled:opacity-50"
                        aria-label="เพิ่มรูป"
                      >
                        <IconCamera size={22} />
                        <span className="mt-1 text-[10px] font-extrabold">
                          เพิ่ม
                        </span>
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => setPhotoPickOpen(true)}
                    className="mt-3 flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-site-primary/35 bg-site-primary-soft/30 px-4 py-8 text-site-primary active:bg-site-primary-soft/50 disabled:opacity-50"
                  >
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-site-primary/20">
                      <IconCamera size={28} />
                    </span>
                    <span className="text-[15px] font-extrabold">
                      {uploading ? "กำลังอัปโหลด…" : "ถ่ายรูป / เลือกจากอัลบั้ม"}
                    </span>
                    <span className="text-[12px] font-medium text-site-primary/80">
                      สูงสุด {MAX_PURCHASE_IMAGES} รูป
                    </span>
                  </button>
                )}

                <label className="mt-3 block text-[12px] font-bold text-slate-500">
                  หมายเหตุ
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-[14px]"
                />
              </section>

              {editingWasConfirmed ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void savePurchase(false)}
                  className="w-full rounded-2xl bg-site-primary py-3.5 text-[14px] font-extrabold text-white disabled:opacity-50"
                >
                  บันทึกการแก้ไข
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void savePurchase(false)}
                    className="rounded-2xl bg-white py-3.5 text-[14px] font-extrabold text-slate-800 ring-1 ring-slate-200 disabled:opacity-50"
                  >
                    บันทึกร่าง
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void savePurchase(true)}
                    className="rounded-2xl bg-site-primary py-3.5 text-[14px] font-extrabold text-white disabled:opacity-50"
                  >
                    ยืนยันรับเข้าสต๊อก
                  </button>
                </div>
              )}
            </div>
          </>
        ) : null}

        {mode === "detail" && detail ? (
          <>
            <header className="mb-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMode("list")}
                aria-label="กลับ"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm ring-1 ring-slate-200"
              >
                <IconBack size={22} />
              </button>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-[18px] font-black text-slate-900">
                  {detail.documentNo}
                </h1>
                <p className="text-[12px] font-medium text-slate-500">
                  {detail.documentDate} ·{" "}
                  {PURCHASE_STATUS_LABEL[
                    detail.status as keyof typeof PURCHASE_STATUS_LABEL
                  ] ?? detail.status}
                </p>
              </div>
            </header>

            <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
              <p className="text-[13px] font-semibold text-slate-600">
                ช่องทาง ·{" "}
                {PURCHASE_CHANNEL_LABEL[
                  detail.channel as PurchaseChannel
                ] ?? detail.channel}
                {detail.channelNote ? ` · ${detail.channelNote}` : ""}
              </p>
              <ul className="mt-3 divide-y divide-slate-100">
                {detail.lines.map((line, idx) => {
                  const unit = line.unitPrice ?? 0;
                  const lineBaht = unit * line.quantity;
                  const sys = line.systemUnitPrice;
                  const entered = line.unitPrice;
                  const diff =
                    sys != null && entered != null ? entered - sys : null;
                  return (
                    <li
                      key={`${line.itemName}-${idx}`}
                      className="flex items-center gap-3 py-2.5"
                    >
                      <ItemThumb src={line.imageUrl} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-bold text-slate-900">
                          {line.itemName}
                        </p>
                        <p className="text-[12px] text-slate-500">
                          {formatPrice(line.quantity)} {line.unit}
                          {entered != null
                            ? ` · บิล ${formatPrice(entered)} ฿/${line.unit}`
                            : ""}
                        </p>
                        {sys != null ? (
                          <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                            ระบบ {formatPrice(sys)} ฿/{line.unit}
                            {diff != null && diff !== 0 ? (
                              <span
                                className={
                                  diff > 0
                                    ? " text-rose-600"
                                    : " text-emerald-700"
                                }
                              >
                                {" "}
                                · {diff > 0 ? "+" : ""}
                                {formatPrice(diff)} ฿
                              </span>
                            ) : null}
                          </p>
                        ) : null}
                      </div>
                      <p className="shrink-0 text-[13px] font-extrabold tabular-nums text-site-primary">
                        {formatPrice(lineBaht)} ฿
                      </p>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 flex items-end justify-between gap-3 border-t border-slate-100 pt-3">
                <div className="min-w-0 text-left">
                  <p className="text-[11px] font-bold text-slate-400">
                    จากระบบ
                  </p>
                  <p className="text-[13px] font-extrabold tabular-nums text-slate-500">
                    {detail.lines.some((l) => l.systemUnitPrice != null)
                      ? `${formatPrice(
                          detail.lines.reduce(
                            (sum, line) =>
                              sum +
                              (line.systemUnitPrice ?? 0) * line.quantity,
                            0,
                          ),
                        )} ฿`
                      : "—"}
                  </p>
                </div>
                <div className="min-w-0 text-right">
                  <p className="text-[11px] font-bold text-slate-400">
                    รวมบิล
                  </p>
                  <p className="text-[15px] font-black tabular-nums text-site-primary">
                    {formatPrice(
                      detail.lines.reduce(
                        (sum, line) =>
                          sum + (line.unitPrice ?? 0) * line.quantity,
                        0,
                      ),
                    )}{" "}
                    ฿
                  </p>
                </div>
              </div>
              {detail.imageUrls && detail.imageUrls.length > 0 ? (
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {detail.imageUrls.map((url) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={url}
                      src={url}
                      alt=""
                      className="aspect-square rounded-lg object-cover"
                    />
                  ))}
                </div>
              ) : null}
              {detail.note ? (
                <p className="mt-3 text-[13px] text-slate-600">{detail.note}</p>
              ) : null}
            </section>

            {detail.status !== "CANCELLED" ? (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void deleteCurrentPurchase()}
                  className="rounded-2xl bg-rose-50 py-3.5 text-[14px] font-extrabold text-rose-700 ring-1 ring-rose-100 disabled:opacity-50"
                >
                  ลบ
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={openEditFromDetail}
                  className="rounded-2xl bg-white py-3.5 text-[14px] font-extrabold text-slate-800 ring-1 ring-slate-200 disabled:opacity-50"
                >
                  แก้ไข
                </button>
                {detail.status === "DRAFT" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void confirmDetail()}
                    className="col-span-2 rounded-2xl bg-site-primary py-3.5 text-[14px] font-extrabold text-white disabled:opacity-50"
                  >
                    ยืนยันรับเข้าสต๊อก
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {pickerOpen ? (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-slate-900/40">
          <button
            type="button"
            className="flex-1"
            aria-label="ปิด"
            onClick={() => setPickerOpen(false)}
          />
          <div className="max-h-[75vh] overflow-hidden rounded-t-[1.5rem] bg-white pb-[env(safe-area-inset-bottom)]">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <p className="text-[15px] font-extrabold text-slate-900">
                เลือก{PURCHASE_STOCK_TYPE_LABEL[activeStockType]}
              </p>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="rounded-full bg-slate-100 p-2"
              >
                <IconClose size={18} />
              </button>
            </div>
            <div className="overflow-y-auto px-4 py-2" style={{ maxHeight: "60vh" }}>
              {catalogLoading ? (
                <p className="py-8 text-center text-sm text-slate-400">
                  กำลังโหลด…
                </p>
              ) : catalog.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">
                  ยังไม่มีสินค้าประเภทนี้ — เพิ่มในจัดการสต๊อกก่อน
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {catalog.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => addFromCatalog(item)}
                        className="flex w-full items-center gap-3 py-3 text-left active:bg-slate-50"
                      >
                        <ItemThumb src={item.imageUrl} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-bold text-slate-900">
                            {item.name}
                          </p>
                          <p className="text-[12px] text-slate-500">
                            คงเหลือ {formatPrice(item.quantity)} {item.unit}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[14px] font-extrabold tabular-nums text-site-primary">
                            {item.unitPrice != null
                              ? `${formatPrice(item.unitPrice)} ฿`
                              : "—"}
                          </p>
                          <p className="text-[11px] font-medium text-slate-400">
                            /{item.unit}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <StaffPhotoPickSheet
        open={photoPickOpen}
        onClose={() => setPhotoPickOpen(false)}
        showThumb={false}
        title="แนบรูปจัดซื้อ"
        subtitle={
          imageUrls.length > 0
            ? `เพิ่มรูปต่อ · เหลืออีก ${Math.max(0, MAX_PURCHASE_IMAGES - imageUrls.length)} รูป`
            : `แนบหลักฐานใบจัดซื้อ (ถ้ามี) · สูงสุด ${MAX_PURCHASE_IMAGES} รูป`
        }
        onCamera={() => cameraInputRef.current?.click()}
        onAlbum={() => galleryInputRef.current?.click()}
        disabled={uploading || imageUrls.length >= MAX_PURCHASE_IMAGES}
        footerText="ไม่บังคับ — ไม่มีรูปก็บันทึกเอกสารได้อยู่"
      />
    </StaffAppShell>
  );
}
