"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { LoadingState } from "@/components/LoadingState";
import { DateInput } from "@/components/DateInput";
import { useToast } from "@/components/admin/Toast";
import { bangkokDateKey } from "@/lib/constants";
import {
  PROMO_EXPIRED_GRACE_DAYS,
  PROMO_SCHEDULE_STATUS_TONE,
  type PromoScheduleStatus,
} from "@/lib/promo-schedule";
import { StatusBadge } from "@/components/StatusBadge";

type PromoRow = {
  id: string;
  name: string;
  price: number;
  categoryName: string | null;
  promoContinuous: boolean;
  promoStartsAt: string | null;
  promoEndsAt: string | null;
  status: PromoScheduleStatus;
  statusLabel: string;
  endsAtDateKey: string | null;
  startsAtDateKey: string | null;
};

export default function StaffPromoManagePage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [promos, setPromos] = useState<PromoRow[]>([]);
  const [drafts, setDrafts] = useState<
    Record<string, { start: string; end: string; continuous: boolean }>
  >({});

  const load = useCallback(async () => {
    const res = await fetch("/api/staff/promos", { cache: "no-store" });
    if (res.status === 401) {
      router.replace("/staff/login");
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(
        typeof data.error === "string" ? data.error : "โหลดโปรไม่สำเร็จ",
      );
      setLoading(false);
      return;
    }
    const list = Array.isArray(data.promos) ? (data.promos as PromoRow[]) : [];
    setPromos(list);
    const next: Record<
      string,
      { start: string; end: string; continuous: boolean }
    > = {};
    for (const p of list) {
      next[p.id] = {
        start: p.startsAtDateKey ?? "",
        end: p.endsAtDateKey ?? "",
        continuous: p.promoContinuous || (!p.startsAtDateKey && !p.endsAtDateKey),
      };
    }
    setDrafts(next);
    setLoading(false);
  }, [router, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(promo: PromoRow) {
    const draft = drafts[promo.id];
    if (!draft) return;
    setSavingId(promo.id);
    try {
      const body = draft.continuous
        ? { id: promo.id, clearSchedule: true }
        : {
            id: promo.id,
            promoContinuous: false,
            promoStartsAt: draft.start || null,
            promoEndsAt: draft.end || null,
          };
      if (!draft.continuous && !draft.end) {
        toast.error("กรุณาระบุวันหมดอายุ หรือเลือกไม่มีกำหนด");
        setSavingId(null);
        return;
      }
      const res = await fetch("/api/staff/promos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          typeof data.error === "string" ? data.error : "บันทึกไม่สำเร็จ",
        );
        return;
      }
      toast.success("บันทึกช่วงโปรแล้ว", promo.name);
      await load();
    } finally {
      setSavingId(null);
    }
  }

  if (loading) {
    return (
      <StaffAppShell active="settings">
        <LoadingState className="mx-auto max-w-lg py-16" />
      </StaffAppShell>
    );
  }

  return (
    <StaffAppShell active="settings">
      <div className="mx-auto max-w-lg space-y-4 px-4 py-6 pb-28">
        <div className="flex items-start gap-2">
          <Link
            href="/staff/settings"
            className="flex h-10 shrink-0 items-center rounded-xl bg-white px-3 text-sm font-bold text-slate-700 shadow-sm"
          >
            ← กลับ
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg font-extrabold text-slate-900">
              จัดการโปรโมชั่น
            </h1>
            <p className="mt-0.5 text-[12px] font-medium text-slate-500">
              กำหนดวันหมดอายุ · หลังหมดแล้วยังโชว์ที่หน้าร้าน{" "}
              {PROMO_EXPIRED_GRACE_DAYS} วัน (ขายไม่ได้) จากนั้นซ่อนอัตโนมัติ
            </p>
          </div>
        </div>

        {promos.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center shadow-sm">
            <p className="font-bold text-slate-800">ยังไม่มีโปรเลือกไม้</p>
            <p className="mt-1 text-sm text-slate-500">
              โปรคือเมนูที่มีตัวเลือกแบบเลือกจากเมนู
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {promos.map((promo) => {
              const draft = drafts[promo.id] ?? {
                start: "",
                end: "",
                continuous: true,
              };
              return (
                <li
                  key={promo.id}
                  className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[16px] font-extrabold text-slate-900">
                        {promo.name}
                      </p>
                      <p className="mt-0.5 text-[12px] text-slate-500">
                        {promo.categoryName ?? "ไม่มีหมวด"} ·{" "}
                        {promo.price.toLocaleString("th-TH")}฿
                      </p>
                    </div>
                    <StatusBadge
                      label={promo.statusLabel}
                      tone={PROMO_SCHEDULE_STATUS_TONE[promo.status]}
                      size="sm"
                    />
                  </div>

                  <label className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={draft.continuous}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [promo.id]: {
                            ...draft,
                            continuous: e.target.checked,
                          },
                        }))
                      }
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <span className="text-[13px] font-semibold text-slate-700">
                      ไม่มีกำหนดหมดอายุ
                    </span>
                  </label>

                  {!draft.continuous ? (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-semibold text-slate-500">
                          วันเริ่ม (ถ้ามี)
                        </span>
                        <DateInput
                          value={draft.start}
                          onChange={(v) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [promo.id]: { ...draft, start: v },
                            }))
                          }
                          max={draft.end || undefined}
                          className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-[13px] font-bold"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-semibold text-slate-500">
                          วันหมดอายุ *
                        </span>
                        <DateInput
                          value={draft.end}
                          onChange={(v) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [promo.id]: { ...draft, end: v },
                            }))
                          }
                          min={draft.start || undefined}
                          className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-[13px] font-bold"
                        />
                      </label>
                    </div>
                  ) : null}

                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={savingId === promo.id}
                      onClick={() => void save(promo)}
                      className="flex-1 rounded-xl bg-site-primary py-2.5 text-[14px] font-extrabold text-white disabled:opacity-60"
                    >
                      {savingId === promo.id ? "กำลังบันทึก…" : "บันทึก"}
                    </button>
                    {!draft.continuous ? (
                      <button
                        type="button"
                        onClick={() =>
                          setDrafts((prev) => ({
                            ...prev,
                            [promo.id]: {
                              ...draft,
                              end: bangkokDateKey(),
                            },
                          }))
                        }
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[12px] font-bold text-slate-600"
                      >
                        หมดวันนี้
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </StaffAppShell>
  );
}
