"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  AdminEmptyState,
  AdminLoadingState,
  adminInputClass,
  adminTableClass,
  adminTableWrapClass,
  adminTheadClass,
  adminTrClass,
  btnOutline,
  btnPrimary,
} from "@/components/admin/AdminShell";
import { AdminModal } from "@/components/admin/AdminModal";
import { useToast } from "@/components/admin/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { MenuItemCodeBadge } from "@/components/MenuItemCodeDisplay";
import {
  bangkokWeekdayLabel,
  formatBangkokDateTime,
} from "@/lib/inventory/inventory-date";
import { formatConfirmedPlanShareText } from "@/lib/inventory/inventory-tomorrow-plan-shared";
import { IconEdit, IconTrash } from "@/components/icons";
import {
  ShareExportMenu,
  type ShareExportAction,
} from "@/components/staff/ShareExportMenu";
import {
  captureElementToPng,
  copyTextToClipboard,
  downloadPngDataUrl,
  sharePngDataUrl,
} from "@/lib/share-media";

type PlanStatus = "CONFIRMED" | "CANCELLED";

type PlanListItem = {
  id: string;
  planDate: string;
  status: PlanStatus;
  statusLabel: string;
  note: string | null;
  confirmedAt: string;
  updatedAt: string;
  confirmedByUsername: string | null;
  lineCount: number;
  totalConfirmedQty: number;
  totalSuggestedQty: number;
};

type PlanDetailLine = {
  id: string;
  menuItemId: string;
  productCode: string;
  name: string;
  category: string | null;
  imageUrl: string | null;
  confirmedQty: number;
  suggestedQty: number;
  parStock: number;
  availableStock: number;
};

type PlanDetail = PlanListItem & {
  branchName: string;
  lines: PlanDetailLine[];
};

const STATUS_TONE: Record<PlanStatus, string> = {
  CONFIRMED: "bg-emerald-50 text-emerald-800 border-emerald-200",
  CANCELLED: "bg-gray-100 text-gray-600 border-gray-200",
};

function MenuThumb({ url, name }: { url: string | null; name: string }) {
  return (
    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-gray-100">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[10px] text-gray-400">
          ไม่มีรูป
        </div>
      )}
    </div>
  );
}

export function BranchTomorrowPlanRecordsPanel({
  branchId,
  refreshKey = 0,
  onCreatePlan,
}: {
  branchId: string;
  refreshKey?: number;
  onCreatePlan?: () => void;
}) {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<PlanListItem[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"ALL" | PlanStatus>("ALL");
  const [detail, setDetail] = useState<PlanDetail | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});
  const [noteDraft, setNoteDraft] = useState("");
  const captureRef = useRef<HTMLDivElement | null>(null);
  const [exportBusy, setExportBusy] = useState<ShareExportAction | null>(null);
  const [exportMsg, setExportMsg] = useState("");
  const [exportCapturing, setExportCapturing] = useState(false);
  const [captureStamp, setCaptureStamp] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (status !== "ALL") params.set("status", status);
      const res = await fetch(
        `/api/admin/branches/${branchId}/inventory/tomorrow-plans?${params}`,
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("โหลดไม่สำเร็จ", json.error ?? "กรุณาลองใหม่");
        setItems([]);
        return;
      }
      setItems((json.items ?? []) as PlanListItem[]);
    } finally {
      setLoading(false);
    }
  }, [branchId, q, status, toast]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function openDetail(row: PlanListItem, startEdit = false) {
    setBusy(true);
    try {
      const params = new URLSearchParams();
      if (row.planDate) params.set("planDate", row.planDate);
      const res = await fetch(
        `/api/admin/branches/${branchId}/inventory/tomorrow-plans/${encodeURIComponent(row.id)}?${params}`,
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("เปิดรายละเอียดไม่สำเร็จ", json.error ?? "กรุณาลองใหม่");
        return;
      }
      const payload = (json.plan ?? json) as PlanDetail;
      if (!payload?.id || !Array.isArray(payload.lines)) {
        toast.error("เปิดรายละเอียดไม่สำเร็จ", "รูปแบบข้อมูลไม่ถูกต้อง");
        return;
      }
      setDetail(payload);
      setNoteDraft(payload.note ?? "");
      const draft: Record<string, string> = {};
      for (const line of payload.lines) {
        draft[line.id] = String(line.confirmedQty);
      }
      setQtyDraft(draft);
      setEditMode(startEdit);
    } finally {
      setBusy(false);
    }
  }

  async function saveDetail() {
    if (!detail) return;
    const itemsPayload = detail.lines.map((line) => {
      const n = Number.parseInt(qtyDraft[line.id] ?? "", 10);
      return {
        lineId: line.id,
        confirmedQty: Number.isInteger(n) && n >= 0 ? n : line.confirmedQty,
      };
    });
    if (itemsPayload.some((row) => row.confirmedQty < 0)) {
      toast.error("จำนวนไม่ถูกต้อง");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/inventory/tomorrow-plans/${detail.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            note: noteDraft.trim() || null,
            items: itemsPayload,
          }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("บันทึกไม่สำเร็จ", json.error ?? "กรุณาลองใหม่");
        return;
      }
      const payload = json as PlanDetail;
      setDetail(payload);
      setEditMode(false);
      toast.success("แก้ไขแผนแล้ว");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function setPlanStatus(next: PlanStatus) {
    if (!detail) return;
    const ok = await confirm({
      title: next === "CANCELLED" ? "ยกเลิกแผนนี้?" : "ยืนยันแผนนี้อีกครั้ง?",
      message:
        next === "CANCELLED"
          ? "แผนจะยังอยู่ในรายการสถานะยกเลิก จนกว่าจะลบถาวร"
          : "จะเปลี่ยนสถานะกลับเป็นยืนยันแล้ว",
      confirmLabel: next === "CANCELLED" ? "ยกเลิกแผน" : "ยืนยัน",
      tone: next === "CANCELLED" ? "danger" : "primary",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/inventory/tomorrow-plans/${detail.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: next }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("เปลี่ยนสถานะไม่สำเร็จ", json.error ?? "กรุณาลองใหม่");
        return;
      }
      setDetail(json as PlanDetail);
      toast.success("อัปเดตสถานะแล้ว");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function removePlan(planId: string) {
    const ok = await confirm({
      title: "ลบแผนผลิต-เติมนี้?",
      message: "ลบทั้งเอกสารและทุกรายการในแผน — กู้คืนไม่ได้",
      confirmLabel: "ลบถาวร",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/inventory/tomorrow-plans/${planId}`,
        { method: "DELETE" },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("ลบไม่สำเร็จ", json.error ?? "กรุณาลองใหม่");
        return;
      }
      toast.success("ลบแผนแล้ว");
      setDetail(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function removeLine(lineId: string) {
    if (!detail) return;
    const ok = await confirm({
      title: "ลบรายการนี้ออกจากแผน?",
      confirmLabel: "ลบรายการ",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/inventory/tomorrow-plans/${detail.id}/lines/${lineId}`,
        { method: "DELETE" },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("ลบรายการไม่สำเร็จ", json.error ?? "กรุณาลองใหม่");
        return;
      }
      if (!json.plan) {
        toast.success("ลบแผนแล้ว เพราะไม่มีรายการเหลือ");
        setDetail(null);
      } else {
        const payload = json.plan as PlanDetail;
        setDetail(payload);
        const draft: Record<string, string> = {};
        for (const line of payload.lines) {
          draft[line.id] = String(line.confirmedQty);
        }
        setQtyDraft(draft);
        toast.success("ลบรายการแล้ว");
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  const filteredHint = useMemo(() => {
    if (status === "ALL" && !q.trim()) return `${items.length} แผน`;
    return `พบ ${items.length} แผน`;
  }, [items.length, status, q]);

  const shareText = useMemo(() => {
    if (!detail || detail.lines.length === 0) return "";
    return formatConfirmedPlanShareText({
      branchName: detail.branchName,
      planDate: detail.planDate,
      statusLabel: detail.statusLabel,
      note: noteDraft || detail.note,
      items: detail.lines.map((line) => ({
        productCode: line.productCode,
        name: line.name,
        confirmedQty: Number.parseInt(qtyDraft[line.id] ?? "", 10) >= 0
          ? Number.parseInt(qtyDraft[line.id] ?? "", 10)
          : line.confirmedQty,
        suggestedQty: line.suggestedQty,
        parStock: line.parStock,
        availableStock: line.availableStock,
      })),
    });
  }, [detail, noteDraft, qtyDraft]);

  function planShareFilename() {
    const slug = (detail?.branchName ?? "สาขา")
      .replace(/[^\w\u0E00-\u0E7F\-]+/g, "_")
      .slice(0, 40);
    return `PlanRefill_${slug}_${detail?.planDate ?? ""}.png`;
  }

  async function capturePlanPng() {
    flushSync(() => {
      setExportCapturing(true);
      setCaptureStamp(formatBangkokDateTime(new Date().toISOString()));
    });
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
    const node = captureRef.current;
    if (!node) throw new Error("ไม่พบตาราง");
    try {
      return await captureElementToPng(node);
    } finally {
      setExportCapturing(false);
    }
  }

  async function handleShareImage() {
    if (exportBusy || !detail || detail.lines.length === 0) return;
    setExportBusy("share");
    setExportMsg("");
    try {
      const dataUrl = await capturePlanPng();
      const title = `แผนผลิต-เติม — ${detail.branchName}`;
      const result = await sharePngDataUrl(dataUrl, planShareFilename(), title);
      if (result.error === "cancelled") {
        setExportMsg("");
        return;
      }
      if (result.mode === "share") {
        setExportMsg("แชร์รูปแล้ว");
        toast.success("แชร์รูปแล้ว");
      } else if (result.ok) {
        setExportMsg("บันทึกรูปแล้ว — แชร์จากแกลเลอรีได้");
        toast.success("บันทึกรูปแล้ว", "เครื่องนี้แชร์ตรงไม่ได้ — บันทึกไว้ให้แล้ว");
      } else {
        setExportMsg(result.error || "แชร์รูปไม่สำเร็จ");
        toast.error("แชร์รูปไม่สำเร็จ", result.error);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "แชร์รูปไม่สำเร็จ";
      setExportMsg(msg);
      toast.error("แชร์รูปไม่สำเร็จ", msg);
    } finally {
      setExportBusy(null);
    }
  }

  async function handleSaveImage() {
    if (exportBusy || !detail || detail.lines.length === 0) return;
    setExportBusy("save");
    setExportMsg("");
    try {
      const dataUrl = await capturePlanPng();
      const result = await downloadPngDataUrl(dataUrl, planShareFilename());
      if (result.ok) {
        setExportMsg("บันทึกรูปแล้ว");
        toast.success("บันทึกรูปแล้ว");
      } else {
        setExportMsg(result.error || "บันทึกรูปไม่สำเร็จ");
        toast.error("บันทึกรูปไม่สำเร็จ", result.error);
      }
    } catch {
      setExportMsg("บันทึกรูปไม่สำเร็จ");
      toast.error("บันทึกรูปไม่สำเร็จ");
    } finally {
      setExportBusy(null);
    }
  }

  async function handleCopyText() {
    if (exportBusy || !shareText) {
      toast.error("ไม่มีรายการส่งผลิต");
      return;
    }
    setExportBusy("copy");
    setExportMsg("");
    try {
      const ok = await copyTextToClipboard(shareText);
      if (ok) {
        setExportMsg("คัดลอกข้อความแล้ว — ไปวางในไลน์ได้เลย");
        toast.success("คัดลอกข้อความแล้ว", "ไปวางในไลน์ได้เลย");
      } else {
        setExportMsg("คัดลอกไม่สำเร็จ");
        toast.error("คัดลอกไม่สำเร็จ");
      }
    } catch {
      setExportMsg("คัดลอกไม่สำเร็จ");
      toast.error("คัดลอกไม่สำเร็จ");
    } finally {
      setExportBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              แผนผลิต-เติม
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              แผนที่ยืนยันแล้ว — ค้นหา ดูรายละเอียด แก้ไข หรือลบได้ กดสร้างแผนใหม่เพื่อคำนวณส่งผลิต
            </p>
          </div>
          {onCreatePlan ? (
            <button
              type="button"
              className={btnPrimary}
              onClick={onCreatePlan}
            >
              สร้างแผนใหม่
            </button>
          ) : null}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-gray-500">ค้นหา</label>
            <input
              className={adminInputClass}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="วันที่ / ชื่อเมนู / รหัส"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">สถานะ</label>
            <select
              className={adminInputClass}
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
            >
              <option value="ALL">ทั้งหมด</option>
              <option value="CONFIRMED">ยืนยันแล้ว</option>
              <option value="CANCELLED">ยกเลิก</option>
            </select>
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-500">{filteredHint}</p>
      </div>

      {loading ? (
        <AdminLoadingState label="กำลังโหลดรายการแผน…" />
      ) : items.length === 0 ? (
        <AdminEmptyState
          title="ยังไม่มีแผนที่ยืนยัน"
          description="กดสร้างแผนใหม่ เพื่อคำนวณรายการจาก Par แล้วยืนยันส่งผลิต"
          action={
            onCreatePlan ? (
              <button
                type="button"
                className={btnPrimary}
                onClick={onCreatePlan}
              >
                สร้างแผนใหม่
              </button>
            ) : null
          }
        />
      ) : (
        <div className={adminTableWrapClass}>
          <table className={adminTableClass}>
            <thead className={adminTheadClass}>
              <tr>
                <th className="px-3 py-3">วันที่แผน</th>
                <th className="px-3 py-3">สถานะ</th>
                <th className="px-3 py-3 text-right">รายการ</th>
                <th className="px-3 py-3 text-right">รวมชิ้น</th>
                <th className="px-3 py-3">ยืนยันเมื่อ</th>
                <th className="px-3 py-3 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className={adminTrClass}>
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-gray-900">{row.planDate}</p>
                    <p className="text-xs text-gray-500">
                      {bangkokWeekdayLabel(row.planDate)}
                    </p>
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_TONE[row.status]}`}
                    >
                      {row.statusLabel}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {row.lineCount.toLocaleString("th-TH")}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                    {row.totalConfirmedQty.toLocaleString("th-TH")}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-gray-600">
                    <p>{formatBangkokDateTime(row.confirmedAt)}</p>
                    {row.confirmedByUsername ? (
                      <p className="text-xs text-gray-400">
                        {row.confirmedByUsername}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className={btnOutline}
                        onClick={() => void openDetail(row)}
                      >
                        ดู
                      </button>
                      <button
                        type="button"
                        className={btnOutline}
                        onClick={() => void openDetail(row, true)}
                        title="แก้ไข"
                      >
                        <IconEdit size={16} />
                      </button>
                      <button
                        type="button"
                        className={btnOutline}
                        onClick={() => void removePlan(row.id)}
                        title="ลบ"
                      >
                        <IconTrash size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminModal
        open={detail != null}
        onClose={() => {
          if (!busy) {
            setDetail(null);
            setEditMode(false);
          }
        }}
        busy={busy}
        title={
          detail
            ? `${detail.branchName} · แผน ${detail.planDate} (${bangkokWeekdayLabel(detail.planDate)})`
            : "รายละเอียดแผน"
        }
        description={
          detail
            ? `${detail.statusLabel} · ${detail.lineCount} รายการ · รวม ${detail.totalConfirmedQty.toLocaleString("th-TH")} ชิ้น`
            : undefined
        }
        maxWidthClassName="max-w-4xl"
      >
        {detail ? (
          <div className="space-y-4 overflow-y-auto p-5">
            <div className="flex flex-wrap items-center gap-2">
              {!editMode ? (
                <button
                  type="button"
                  className={btnPrimary}
                  onClick={() => setEditMode(true)}
                  disabled={busy}
                >
                  แก้ไข
                </button>
              ) : (
                <button
                  type="button"
                  className={btnPrimary}
                  onClick={() => void saveDetail()}
                  disabled={busy}
                >
                  {busy ? "กำลังบันทึก…" : "บันทึก"}
                </button>
              )}
              <ShareExportMenu
                busy={exportBusy}
                message={exportMsg}
                disabled={busy || detail.lines.length === 0}
                className={btnOutline}
                label="แชร์"
                sheetTitle={`แชร์แผน — ${detail.branchName}`}
                sheetHint="แชร์รูป บันทึกรูป หรือคัดลอกข้อความ ส่งทีมผลิต"
                onShareImage={handleShareImage}
                onSaveImage={handleSaveImage}
                onCopyText={handleCopyText}
              />
              {detail.status === "CONFIRMED" ? (
                <button
                  type="button"
                  className={btnOutline}
                  onClick={() => void setPlanStatus("CANCELLED")}
                  disabled={busy}
                >
                  ยกเลิกแผน
                </button>
              ) : (
                <button
                  type="button"
                  className={btnOutline}
                  onClick={() => void setPlanStatus("CONFIRMED")}
                  disabled={busy}
                >
                  ตั้งเป็นยืนยันแล้ว
                </button>
              )}
              <button
                type="button"
                className={btnOutline}
                onClick={() => void removePlan(detail.id)}
                disabled={busy}
              >
                ลบถาวร
              </button>
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">หมายเหตุ</label>
              <input
                className={adminInputClass}
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                disabled={!editMode || busy}
                placeholder="เช่น ส่งครัวรอบเช้า"
              />
            </div>
            <div
              ref={captureRef}
              className="overflow-hidden rounded-xl border border-gray-200 bg-white"
            >
              {exportCapturing ? (
                <div className="border-b border-gray-100 px-4 py-3">
                  <p className="text-sm font-semibold text-gray-900">
                    แผนผลิต-เติม — {detail.branchName}
                  </p>
                  <p className="text-xs text-gray-500">
                    {detail.planDate} ({bangkokWeekdayLabel(detail.planDate)}) ·{" "}
                    {detail.statusLabel} · {captureStamp}
                  </p>
                </div>
              ) : null}
              <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-600">
                  <tr>
                    <th className="px-3 py-2">สินค้า</th>
                    <th className="px-3 py-2 text-right">ควรส่ง</th>
                    <th className="px-3 py-2 text-right">ยืนยัน</th>
                    <th className="px-3 py-2 text-right">Par / คงเหลือ</th>
                    {editMode ? <th className="px-3 py-2" /> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {detail.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <MenuThumb url={line.imageUrl} name={line.name} />
                          <div>
                            <p className="font-medium text-gray-900">{line.name}</p>
                            <div className="mt-0.5 flex items-center gap-2">
                              <MenuItemCodeBadge code={line.productCode} />
                              {line.category ? (
                                <span className="text-xs text-gray-400">
                                  {line.category}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-800">
                        {line.suggestedQty.toLocaleString("th-TH")}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {editMode ? (
                          <input
                            className={`${adminInputClass} ml-auto w-20 py-1 text-right tabular-nums`}
                            type="number"
                            min={0}
                            value={qtyDraft[line.id] ?? String(line.confirmedQty)}
                            onChange={(e) =>
                              setQtyDraft((prev) => ({
                                ...prev,
                                [line.id]: e.target.value,
                              }))
                            }
                          />
                        ) : (
                          <span className="font-semibold tabular-nums text-sky-800">
                            {line.confirmedQty.toLocaleString("th-TH")}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                        {line.parStock.toLocaleString("th-TH")} /{" "}
                        {line.availableStock.toLocaleString("th-TH")}
                      </td>
                      {editMode ? (
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            className="text-xs font-semibold text-red-600 hover:underline"
                            onClick={() => void removeLine(line.id)}
                            disabled={busy}
                          >
                            ลบ
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        ) : null}
      </AdminModal>
    </div>
  );
}
