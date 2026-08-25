"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  adminInputClass,
  adminLabelClass,
  btnDanger,
  btnOutline,
  btnPrimary,
} from "@/components/admin/AdminShell";
import { useToast } from "@/components/admin/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { appAbsoluteUrl } from "@/lib/app-url";
import {
  formatWeightKgDisplay,
  parseWeightInput,
  weightInputHint,
  weightInputPlaceholder,
  type WeighInputUnit,
} from "@/lib/weigh-input";

type BbqSection = "tables" | "sessions" | "bills";

type DiningTableRow = {
  id: string;
  name: string;
  token: string;
  sortOrder: number;
  isActive: boolean;
  openSession: { id: string; openedAt: string } | null;
};

type SessionLine = {
  id: string;
  itemName: string;
  kind: "PIECE" | "WEIGHT";
  quantity: number;
  weightKg: number | null;
  unitPrice: number;
  lineTotal: number;
};

type SessionRow = {
  id: string;
  status: "OPEN" | "CLOSED";
  openedAt: string;
  closedAt: string | null;
  paymentMethod: "CASH" | "TRANSFER" | "CARD" | null;
  discountAmount: number;
  closedTotal: number | null;
  runningTotal: number;
  itemsTotal: number;
  note: string | null;
  table: { id: string; name: string; token: string };
  lines: SessionLine[];
  closedByAdmin?: { username: string } | null;
};

type MenuItemOption = {
  id: string;
  name: string;
  sellByWeight: boolean;
  pricePerKg: number | null;
  price: number;
  storefrontPrice: number | null;
  pickupPrice: number | null;
  isHidden: boolean;
};

type BranchBbqPanelProps = {
  branchId: string;
  brandCode: string;
  branchCode: string;
  section: BbqSection;
};

function money(n: number) {
  return `฿${n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function BranchBbqPanel({
  branchId,
  brandCode,
  branchCode,
  section,
}: BranchBbqPanelProps) {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [tables, setTables] = useState<DiningTableRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItemOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTableName, setNewTableName] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [weightKg, setWeightKg] = useState("");
  const [weightUnit, setWeightUnit] = useState<WeighInputUnit>("kg");
  const [pieceQty, setPieceQty] = useState("1");
  const [selectedMenuId, setSelectedMenuId] = useState("");
  const [closePayment, setClosePayment] = useState<"CASH" | "TRANSFER">("CASH");
  const [closeDiscount, setCloseDiscount] = useState("0");

  const loadTables = useCallback(async () => {
    const res = await fetch(`/api/admin/branches/${branchId}/dining-tables`);
    if (!res.ok) throw new Error("โหลดโต๊ะไม่สำเร็จ");
    setTables(await res.json());
  }, [branchId]);

  const loadSessions = useCallback(
    async (status: "OPEN" | "CLOSED") => {
      const res = await fetch(
        `/api/admin/branches/${branchId}/table-sessions?status=${status}`,
      );
      if (!res.ok) throw new Error("โหลดบิลไม่สำเร็จ");
      setSessions(await res.json());
    },
    [branchId],
  );

  const loadMenu = useCallback(async () => {
    const res = await fetch(`/api/admin/branches/${branchId}/menu-items`);
    if (!res.ok) return;
    const items = (await res.json()) as MenuItemOption[];
    setMenuItems(
      items
        .filter((i) => !i.isHidden)
        .map((i) => ({
          ...i,
          price: Number(i.price),
          pricePerKg: i.pricePerKg != null ? Number(i.pricePerKg) : null,
          storefrontPrice:
            i.storefrontPrice != null ? Number(i.storefrontPrice) : null,
          pickupPrice: i.pickupPrice != null ? Number(i.pickupPrice) : null,
        })),
    );
  }, [branchId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (section === "tables") {
          await loadTables();
        } else if (section === "sessions") {
          await Promise.all([loadSessions("OPEN"), loadTables(), loadMenu()]);
        } else {
          await loadSessions("CLOSED");
        }
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [section, loadTables, loadSessions, loadMenu, toast]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId],
  );

  const weighMenus = menuItems.filter((m) => m.sellByWeight);
  const pieceMenus = menuItems.filter((m) => !m.sellByWeight);

  async function createTable(e: React.FormEvent) {
    e.preventDefault();
    if (!newTableName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/branches/${branchId}/dining-tables`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTableName.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "สร้างโต๊ะไม่สำเร็จ");
      setNewTableName("");
      toast.success("เพิ่มโต๊ะแล้ว", data.name);
      await loadTables();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "สร้างโต๊ะไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function toggleTableActive(table: DiningTableRow) {
    const res = await fetch(
      `/api/admin/branches/${branchId}/dining-tables/${table.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !table.isActive }),
      },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "อัปเดตไม่สำเร็จ");
      return;
    }
    await loadTables();
  }

  async function deleteTable(table: DiningTableRow) {
    const ok = await confirm({
      title: `ลบโต๊ะ ${table.name}?`,
      message: "ลบได้เฉพาะโต๊ะที่ไม่มีบิลเปิด",
      confirmLabel: "ลบ",
      tone: "danger",
    });
    if (!ok) return;
    const res = await fetch(
      `/api/admin/branches/${branchId}/dining-tables/${table.id}`,
      { method: "DELETE" },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "ลบไม่สำเร็จ");
      return;
    }
    toast.success("ลบโต๊ะแล้ว");
    await loadTables();
  }

  function tableQrUrl(token: string) {
    return appAbsoluteUrl(`/${brandCode}/${branchCode}/t/${token}`);
  }

  async function copyQr(token: string) {
    try {
      await navigator.clipboard.writeText(tableQrUrl(token));
      toast.success("คัดลอกลิงก์ QR แล้ว");
    } catch {
      toast.error("คัดลอกไม่สำเร็จ");
    }
  }

  async function openSession(tableId: string) {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/table-sessions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tableId }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "เปิดบิลไม่สำเร็จ");
      toast.success("เปิดบิลแล้ว");
      await loadSessions("OPEN");
      await loadTables();
      setActiveSessionId(data.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "เปิดบิลไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function addLine(kind: "WEIGHT" | "PIECE") {
    if (!activeSessionId || !selectedMenuId) {
      toast.error("เลือกเมนูก่อน");
      return;
    }
    if (kind === "WEIGHT") {
      const kg = parseWeightInput(weightKg, weightUnit);
      if (kg == null) {
        toast.error(
          "กรอกน้ำหนักให้ถูกต้อง",
          weightUnit === "g" ? "เช่น 350 กรัม" : "เช่น 1.4 กก.",
        );
        return;
      }
    }
    setSaving(true);
    try {
      const body =
        kind === "WEIGHT"
          ? {
              kind: "WEIGHT" as const,
              branchMenuItemId: selectedMenuId,
              weightKg: parseWeightInput(weightKg, weightUnit)!,
            }
          : {
              kind: "PIECE" as const,
              branchMenuItemId: selectedMenuId,
              quantity: Number(pieceQty) || 1,
            };
      const res = await fetch(
        `/api/admin/branches/${branchId}/table-sessions/${activeSessionId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "เพิ่มรายการไม่สำเร็จ");
      setSessions((prev) =>
        prev.map((s) => (s.id === data.id ? data : s)),
      );
      setWeightKg("");
      setPieceQty("1");
      toast.success("เพิ่มรายการแล้ว");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "เพิ่มรายการไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function removeLine(lineId: string) {
    if (!activeSessionId) return;
    const res = await fetch(
      `/api/admin/branches/${branchId}/table-sessions/${activeSessionId}/lines/${lineId}`,
      { method: "DELETE" },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "ลบรายการไม่สำเร็จ");
      return;
    }
    setSessions((prev) => prev.map((s) => (s.id === data.id ? data : s)));
  }

  async function closeBill() {
    if (!activeSession) return;
    const ok = await confirm({
      title: `ปิดบิลโต๊ะ ${activeSession.table.name}?`,
      message: `ยอดประมาณ ${money(Math.max(0, activeSession.itemsTotal - (Number(closeDiscount) || 0)))} · ${closePayment === "CASH" ? "เงินสด" : "โอน"}`,
      confirmLabel: "ปิดบิล",
      tone: "primary",
    });
    if (!ok) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/table-sessions/${activeSession.id}/close`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paymentMethod: closePayment,
            discountAmount: Number(closeDiscount) || 0,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "ปิดบิลไม่สำเร็จ");
      toast.success("ปิดบิลแล้ว", money(Number(data.closedTotal) || 0));
      setActiveSessionId(null);
      await loadSessions("OPEN");
      await loadTables();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ปิดบิลไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        กำลังโหลด…
      </div>
    );
  }

  if (section === "tables") {
    return (
      <div className="space-y-4">
        <form
          onSubmit={createTable}
          className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="min-w-[12rem] flex-1">
            <label className={adminLabelClass}>ชื่อโต๊ะ</label>
            <input
              className={adminInputClass}
              value={newTableName}
              onChange={(e) => setNewTableName(e.target.value)}
              placeholder="เช่น โต๊ะ 1"
            />
          </div>
          <button type="submit" disabled={saving} className={btnPrimary}>
            เพิ่มโต๊ะ
          </button>
        </form>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tables.map((table) => {
            const url = tableQrUrl(table.token);
            const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(url)}`;
            return (
              <div
                key={table.id}
                className={`rounded-2xl border bg-white p-4 shadow-sm ${
                  table.isActive ? "border-slate-200" : "border-slate-100 opacity-70"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{table.name}</p>
                    {table.openSession ? (
                      <p className="mt-0.5 text-xs font-medium text-rose-700">
                        มีบิลเปิด
                      </p>
                    ) : (
                      <p className="mt-0.5 text-xs text-slate-500">ว่าง</p>
                    )}
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      table.isActive
                        ? "bg-emerald-50 text-emerald-800"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {table.isActive ? "ใช้งาน" : "ปิด"}
                  </span>
                </div>
                <img
                  src={qrSrc}
                  alt={`QR ${table.name}`}
                  className="mx-auto mt-3 h-36 w-36 rounded-lg border border-slate-100"
                />
                <p className="mt-2 break-all font-mono text-[10px] text-slate-500">
                  {url}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={btnOutline}
                    onClick={() => copyQr(table.token)}
                  >
                    คัดลอกลิงก์
                  </button>
                  <button
                    type="button"
                    className={btnOutline}
                    onClick={() => toggleTableActive(table)}
                  >
                    {table.isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                  </button>
                  <button
                    type="button"
                    className={btnDanger}
                    onClick={() => deleteTable(table)}
                  >
                    ลบ
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {tables.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            ยังไม่มีโต๊ะ — เพิ่มโต๊ะแล้วพิมพ์ QR ติดที่โต๊ะ
          </p>
        )}
      </div>
    );
  }

  if (section === "bills") {
    return (
      <div className="space-y-3">
        {sessions.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            ยังไม่มีบิลที่ปิด
          </p>
        )}
        {sessions.map((s) => (
          <div
            key={s.id}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-900">{s.table.name}</p>
                <p className="text-xs text-slate-500">
                  ปิด{" "}
                  {s.closedAt
                    ? new Date(s.closedAt).toLocaleString("th-TH")
                    : "—"}
                  {s.closedByAdmin
                    ? ` · โดย ${s.closedByAdmin.username}`
                    : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-slate-900">
                  {money(s.closedTotal ?? s.runningTotal)}
                </p>
                <p className="text-xs text-slate-500">
                  {s.paymentMethod === "CASH"
                    ? "เงินสด"
                    : s.paymentMethod === "TRANSFER"
                      ? "โอน"
                      : "—"}
                </p>
              </div>
            </div>
            <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm">
              {s.lines.map((l) => (
                <li
                  key={l.id}
                  className="flex justify-between gap-3 text-slate-700"
                >
                  <span>
                    {l.itemName}
                    {l.kind === "WEIGHT"
                      ? ` · ${l.weightKg} กก.`
                      : ` · x${l.quantity}`}
                  </span>
                  <span className="shrink-0 font-medium">
                    {money(l.lineTotal)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  // sessions / weigh
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_1fr]">
      <div className="space-y-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="mb-2 text-sm font-semibold text-slate-900">โต๊ะ</p>
          <ul className="space-y-1.5">
            {tables.map((t) => (
              <li key={t.id}>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!t.openSession}
                    onClick={() =>
                      t.openSession && setActiveSessionId(t.openSession.id)
                    }
                    className={`min-w-0 flex-1 rounded-xl px-3 py-2 text-left text-sm transition ${
                      t.openSession && activeSessionId === t.openSession.id
                        ? "bg-rose-800 text-white"
                        : t.openSession
                          ? "bg-rose-50 text-rose-900 hover:bg-rose-100"
                          : "bg-slate-50 text-slate-500"
                    }`}
                  >
                    {t.name}
                    <span className="mt-0.5 block text-[10px] opacity-80">
                      {t.openSession ? "บิลเปิด" : "ว่าง"}
                    </span>
                  </button>
                  {!t.openSession && t.isActive && (
                    <button
                      type="button"
                      disabled={saving}
                      className={btnOutline}
                      onClick={() => openSession(t.id)}
                    >
                      เปิดบิล
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {!activeSession ? (
          <p className="py-12 text-center text-sm text-slate-500">
            เลือกบิลเปิด หรือเปิดบิลจากโต๊ะว่าง
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {activeSession.table.name}
                </h3>
                <p className="text-xs text-slate-500">
                  เปิด{" "}
                  {new Date(activeSession.openedAt).toLocaleString("th-TH")}
                </p>
              </div>
              <p className="text-xl font-bold text-rose-800">
                {money(activeSession.runningTotal)}
              </p>
            </div>

            <ul className="space-y-1.5 border-y border-slate-100 py-3">
              {activeSession.lines.length === 0 && (
                <li className="text-sm text-slate-400">ยังไม่มีรายการ</li>
              )}
              {activeSession.lines.map((l) => (
                <li
                  key={l.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span>
                    {l.itemName}
                    {l.kind === "WEIGHT"
                      ? ` · ${l.weightKg} กก. × ${money(l.unitPrice)}`
                      : ` · x${l.quantity}`}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{money(l.lineTotal)}</span>
                    <button
                      type="button"
                      className="text-xs text-red-600 hover:underline"
                      onClick={() => removeLine(l.id)}
                    >
                      ลบ
                    </button>
                  </span>
                </li>
              ))}
            </ul>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 rounded-xl border border-rose-100 bg-rose-50/50 p-3">
                <p className="text-sm font-semibold text-rose-900">ชั่งกิโล</p>
                <select
                  className={adminInputClass}
                  value={
                    weighMenus.some((m) => m.id === selectedMenuId)
                      ? selectedMenuId
                      : ""
                  }
                  onChange={(e) => setSelectedMenuId(e.target.value)}
                >
                  <option value="">— เลือกเมนูชั่ง —</option>
                  {weighMenus.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {m.pricePerKg != null
                        ? ` · ${money(m.pricePerKg)}/กก.`
                        : ""}
                    </option>
                  ))}
                </select>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-rose-800">น้ำหนัก</span>
                  <div className="grid grid-cols-2 gap-0.5 rounded-lg bg-white p-0.5 ring-1 ring-rose-100">
                    <button
                      type="button"
                      onClick={() => setWeightUnit("kg")}
                      className={`rounded-md px-2.5 py-1 text-xs font-bold ${
                        weightUnit === "kg"
                          ? "bg-rose-600 text-white"
                          : "text-rose-800"
                      }`}
                    >
                      กก.
                    </button>
                    <button
                      type="button"
                      onClick={() => setWeightUnit("g")}
                      className={`rounded-md px-2.5 py-1 text-xs font-bold ${
                        weightUnit === "g"
                          ? "bg-rose-600 text-white"
                          : "text-rose-800"
                      }`}
                    >
                      กรัม
                    </button>
                  </div>
                </div>
                <input
                  className={adminInputClass}
                  inputMode="decimal"
                  placeholder={weightInputPlaceholder(weightUnit)}
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                />
                <p className="text-[11px] text-rose-800/80">
                  {weightInputHint(weightUnit)}
                  {parseWeightInput(weightKg, weightUnit) != null
                    ? ` → ${formatWeightKgDisplay(parseWeightInput(weightKg, weightUnit)!)} กก.`
                    : ""}
                </p>
                <button
                  type="button"
                  disabled={saving}
                  className={btnPrimary}
                  onClick={() => addLine("WEIGHT")}
                >
                  ใส่บิล
                </button>
                {weighMenus.length === 0 && (
                  <p className="text-xs text-rose-800">
                    ยังไม่มีเมนูชั่งกิโล — ไปแท็บเมนูแล้วเปิด “ขายชั่งกิโล”
                    พร้อมราคา/กก.
                  </p>
                )}
              </div>

              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                <p className="text-sm font-semibold text-slate-900">
                  เครื่องเคียง / ชิ้น
                </p>
                <select
                  className={adminInputClass}
                  value={
                    pieceMenus.some((m) => m.id === selectedMenuId)
                      ? selectedMenuId
                      : ""
                  }
                  onChange={(e) => setSelectedMenuId(e.target.value)}
                >
                  <option value="">— เลือกเมนูชิ้น —</option>
                  {pieceMenus.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ·{" "}
                      {money(
                        Number(m.storefrontPrice ?? m.pickupPrice ?? m.price),
                      )}
                    </option>
                  ))}
                </select>
                <input
                  className={adminInputClass}
                  inputMode="numeric"
                  placeholder="จำนวน"
                  value={pieceQty}
                  onChange={(e) => setPieceQty(e.target.value)}
                />
                <button
                  type="button"
                  disabled={saving}
                  className={btnOutline}
                  onClick={() => addLine("PIECE")}
                >
                  ใส่บิล
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
              <div>
                <label className={adminLabelClass}>ส่วนลด (บาท)</label>
                <input
                  className={`${adminInputClass} w-28`}
                  value={closeDiscount}
                  onChange={(e) => setCloseDiscount(e.target.value)}
                />
              </div>
              <div>
                <label className={adminLabelClass}>ชำระเงิน</label>
                <select
                  className={adminInputClass}
                  value={closePayment}
                  onChange={(e) =>
                    setClosePayment(e.target.value as "CASH" | "TRANSFER")
                  }
                >
                  <option value="CASH">เงินสด</option>
                  <option value="TRANSFER">โอน</option>
                </select>
              </div>
              <button
                type="button"
                disabled={saving}
                className={btnPrimary}
                onClick={closeBill}
              >
                ปิดบิลท้ายมื้อ
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
