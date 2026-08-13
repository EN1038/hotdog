"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { LoadingState } from "@/components/LoadingState";
import { useToast } from "@/components/admin/Toast";
import { formatPrice } from "@/lib/constants";
import {
  formatWeightKgDisplay,
  parseWeightInput,
  weightInputHint,
  weightInputPlaceholder,
  type WeighInputUnit,
} from "@/lib/weigh-input";

type WeighMenu = { id: string; name: string; pricePerKg: number | null };
type SessionLine = {
  id: string;
  itemName: string;
  weightKg: number | null;
  unitPrice: number;
  lineTotal: number;
};
type OpenSession = {
  id: string;
  runningTotal: number;
  table: { id: string; name: string };
  lines: SessionLine[];
};

type Bootstrap = {
  takeawayTableId: string;
  weighMenus: WeighMenu[];
  openSessions: OpenSession[];
};

export default function StaffWeighPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [session, setSession] = useState<OpenSession | null>(null);
  const [menuId, setMenuId] = useState("");
  const [weightRaw, setWeightRaw] = useState("");
  const [weightUnit, setWeightUnit] = useState<WeighInputUnit>("kg");
  const [payment, setPayment] = useState<"CASH" | "TRANSFER">("CASH");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/staff/weigh", { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/staff/login");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error("โหลดไม่สำเร็จ", body.error ?? "ลองใหม่");
        setBoot(null);
        return;
      }
      const data = (await res.json()) as Bootstrap;
      setBoot(data);
      if (!menuId && data.weighMenus[0]) setMenuId(data.weighMenus[0].id);
      const takeawayOpen =
        data.openSessions.find((s) => s.table.id === data.takeawayTableId) ??
        data.openSessions[0] ??
        null;
      setSession(takeawayOpen);
    } finally {
      setLoading(false);
    }
  }, [router, toast, menuId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  const selectedMenu = useMemo(
    () => (boot?.weighMenus ?? []).find((m) => m.id === menuId) ?? null,
    [boot?.weighMenus, menuId],
  );

  const parsedKg = useMemo(
    () => parseWeightInput(weightRaw, weightUnit),
    [weightRaw, weightUnit],
  );

  const previewTotal =
    parsedKg != null && selectedMenu?.pricePerKg != null
      ? Math.round(parsedKg * selectedMenu.pricePerKg * 100) / 100
      : null;

  const startBill = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/staff/weigh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useTakeaway: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("เปิดบิลไม่สำเร็จ", body.error ?? "ลองใหม่");
        return;
      }
      setSession(body as OpenSession);
      toast.success(body.created ? "เปิดบิลแล้ว" : "ใช้บิลเปิดอยู่");
    } finally {
      setBusy(false);
    }
  };

  const addWeight = async () => {
    if (!session) return;
    const kg = parseWeightInput(weightRaw, weightUnit);
    if (!menuId || kg == null) {
      toast.error(
        "กรอกน้ำหนักให้ถูกต้อง",
        weightUnit === "g" ? "เช่น 350 กรัม" : "เช่น 1.4 กก.",
      );
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/staff/weigh/${session.id}/lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchMenuItemId: menuId, weightKg: kg }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("เพิ่มรายการไม่สำเร็จ", body.error ?? "ลองใหม่");
        return;
      }
      setSession(body as OpenSession);
      setWeightRaw("");
      toast.success(
        "เพิ่มรายการแล้ว",
        `${formatWeightKgDisplay(kg)} กก.${previewTotal != null ? ` · ${formatPrice(previewTotal)}฿` : ""}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const closeBill = async () => {
    if (!session) return;
    if (session.lines.length === 0) {
      toast.error("ยังไม่มีรายการในบิล");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/staff/weigh/${session.id}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethod: payment }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("ปิดบิลไม่สำเร็จ", body.error ?? "ลองใหม่");
        return;
      }
      toast.success(
        "ปิดบิลแล้ว",
        `ยอด ${formatPrice(Number(body.closedTotal ?? 0))}฿`,
      );
      setSession(null);
      void load();
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <LoadingState className="w-full max-w-sm" />
      </main>
    );
  }

  const menus = boot?.weighMenus ?? [];

  return (
    <StaffAppShell active="home">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-3 pb-8 pt-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-600">
              โหมดชั่งกิโล
            </p>
            <h1 className="text-xl font-black text-slate-900">ขายชั่งกิโล</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              บิลซื้อกลับบ้าน · ชั่งแล้วปิดบิล
            </p>
          </div>
          <Link
            href="/staff"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
          >
            กลับหน้าหลัก
          </Link>
        </div>

        {menus.length === 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm text-amber-950">
            ยังไม่มีเมนูชั่งกิโล — ไปตั้งค่าเมนูในแอดมิน เปิด “ขายตามน้ำหนัก”
            และใส่ราคาต่อกิโล
          </div>
        ) : null}

        {!session ? (
          <button
            type="button"
            disabled={busy || menus.length === 0}
            onClick={() => void startBill()}
            className="rounded-2xl bg-rose-600 px-4 py-4 text-lg font-extrabold text-white disabled:opacity-50"
          >
            เปิดบิลซื้อกลับบ้าน
          </button>
        ) : (
          <>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">
                  บิล · {session.table.name}
                </p>
                <p className="text-lg font-black text-rose-700">
                  {formatPrice(session.runningTotal)}฿
                </p>
              </div>

              <label className="mt-4 block text-xs font-semibold text-slate-500">
                เมนูชั่งกิโล
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-base font-semibold text-slate-900"
                  value={menuId}
                  onChange={(e) => setMenuId(e.target.value)}
                >
                  {menus.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {m.pricePerKg != null
                        ? ` · ${formatPrice(m.pricePerKg)}฿/กก.`
                        : ""}
                    </option>
                  ))}
                </select>
              </label>

              <div className="mt-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-500">น้ำหนัก</p>
                  <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-0.5">
                    <button
                      type="button"
                      onClick={() => setWeightUnit("kg")}
                      className={`rounded-md px-3 py-1.5 text-xs font-bold ${
                        weightUnit === "kg"
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-500"
                      }`}
                    >
                      กก.
                    </button>
                    <button
                      type="button"
                      onClick={() => setWeightUnit("g")}
                      className={`rounded-md px-3 py-1.5 text-xs font-bold ${
                        weightUnit === "g"
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-500"
                      }`}
                    >
                      กรัม
                    </button>
                  </div>
                </div>
                <input
                  inputMode="decimal"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-2xl font-black text-slate-900"
                  placeholder={weightInputPlaceholder(weightUnit)}
                  value={weightRaw}
                  onChange={(e) => setWeightRaw(e.target.value)}
                />
                <p className="mt-1.5 text-[12px] text-slate-500">
                  {weightInputHint(weightUnit)}
                </p>
                {parsedKg != null ? (
                  <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900">
                    = {formatWeightKgDisplay(parsedKg)} กก.
                    {selectedMenu?.pricePerKg != null && previewTotal != null
                      ? ` × ${formatPrice(selectedMenu.pricePerKg)}฿ = ${formatPrice(previewTotal)}฿`
                      : ""}
                  </p>
                ) : weightRaw.trim() ? (
                  <p className="mt-2 text-sm text-amber-700">น้ำหนักยังไม่ถูกต้อง</p>
                ) : null}
              </div>

              <button
                type="button"
                disabled={busy || parsedKg == null}
                onClick={() => void addWeight()}
                className="mt-3 w-full rounded-xl bg-slate-900 py-3.5 text-base font-extrabold text-white disabled:opacity-50"
              >
                เพิ่มรายการชั่ง
              </button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-bold text-slate-800">รายการในบิล</p>
              {session.lines.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">ยังไม่มีรายการ</p>
              ) : (
                <ul className="mt-2 divide-y divide-slate-100">
                  {session.lines.map((l) => (
                    <li
                      key={l.id}
                      className="flex items-center justify-between gap-2 py-2.5 text-sm"
                    >
                      <span className="min-w-0 flex-1 font-medium text-slate-800">
                        {l.itemName}
                        {l.weightKg != null ? (
                          <span className="text-slate-500">
                            {" "}
                            · {formatWeightKgDisplay(l.weightKg)} กก.
                            {l.weightKg < 1
                              ? ` (${Math.round(l.weightKg * 1000)} ก.)`
                              : ""}
                          </span>
                        ) : null}
                      </span>
                      <span className="font-bold text-slate-900">
                        {formatPrice(l.lineTotal)}฿
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setPayment("CASH")}
                  className={`flex-1 rounded-xl py-2.5 text-sm font-bold ${
                    payment === "CASH"
                      ? "bg-emerald-600 text-white"
                      : "border border-slate-200 text-slate-600"
                  }`}
                >
                  เงินสด
                </button>
                <button
                  type="button"
                  onClick={() => setPayment("TRANSFER")}
                  className={`flex-1 rounded-xl py-2.5 text-sm font-bold ${
                    payment === "TRANSFER"
                      ? "bg-sky-600 text-white"
                      : "border border-slate-200 text-slate-600"
                  }`}
                >
                  โอน
                </button>
              </div>

              <button
                type="button"
                disabled={busy || session.lines.length === 0}
                onClick={() => void closeBill()}
                className="mt-3 w-full rounded-xl bg-rose-600 py-3.5 text-base font-extrabold text-white disabled:opacity-50"
              >
                ปิดบิล · รับเงิน
              </button>
            </div>
          </>
        )}
      </div>
    </StaffAppShell>
  );
}
