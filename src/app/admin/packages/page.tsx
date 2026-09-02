"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AdminEmptyState,
  AdminLoadingState,
  AdminPageHeader,
  adminCardClass,
  adminInputClass,
  adminLabelClass,
  adminTableClass,
  adminTableWrapClass,
  adminTheadClass,
  adminTrClass,
  btnOutline,
  btnPrimary,
} from "@/components/admin/AdminShell";
import { AdminToggle } from "@/components/admin/AdminToggle";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { useToast } from "@/components/admin/Toast";
import type { BrandPlanConfigRow } from "@/lib/brand-plan-catalog";

type RestaurantTypeRow = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  showInOwnerRegister: boolean;
  ownerRegisterPlan: "RETAIL" | "WEIGH_TABLE" | "MALA" | "MULTI";
  ownerRegisterHint: string | null;
};

type CatalogPayload = {
  trialDays: number;
  plans: BrandPlanConfigRow[];
  restaurantTypes: RestaurantTypeRow[];
};

const PLANS = ["RETAIL", "WEIGH_TABLE", "MALA", "MULTI"] as const;

function moduleChips(row: BrandPlanConfigRow) {
  const chips: string[] = [];
  if (row.stockEnabled) chips.push("สต๊อก");
  if (row.kitchenEnabled) chips.push("ครัว");
  if (row.bbqEnabled) chips.push("ชั่ง/โต๊ะ");
  if (row.skewerEnabled) chips.push("เสียบไม้");
  return chips.length ? chips.join(" · ") : "พื้นฐาน";
}

export default function AdminPackagesPage() {
  const router = useRouter();
  const { session, loaded } = useAdminSession();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [savingTrial, setSavingTrial] = useState(false);
  const [savingPlan, setSavingPlan] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogPayload | null>(null);
  const [trialDays, setTrialDays] = useState(7);
  const [drafts, setDrafts] = useState<Record<string, BrandPlanConfigRow>>({});

  async function load() {
    const res = await fetch("/api/admin/brand-plans");
    if (res.status === 401) {
      router.push("/admin/login");
      return;
    }
    if (res.status === 403) {
      router.replace("/admin");
      return;
    }
    if (!res.ok) {
      toast.error("โหลดแพ็กเกจไม่สำเร็จ");
      setLoading(false);
      return;
    }
    const data = (await res.json()) as CatalogPayload;
    setCatalog(data);
    setTrialDays(data.trialDays);
    const next: Record<string, BrandPlanConfigRow> = {};
    for (const plan of data.plans) next[plan.plan] = { ...plan };
    setDrafts(next);
    setLoading(false);
  }

  useEffect(() => {
    if (!loaded) return;
    if (session && !session.isPlatformAdmin) {
      router.replace("/admin");
      return;
    }
    void load();
  }, [loaded, session, router]);

  const typesByPlan = useMemo(() => {
    const map = new Map<string, RestaurantTypeRow[]>();
    for (const plan of PLANS) map.set(plan, []);
    for (const row of catalog?.restaurantTypes ?? []) {
      map.get(row.ownerRegisterPlan)?.push(row);
    }
    return map;
  }, [catalog?.restaurantTypes]);

  async function saveTrial() {
    setSavingTrial(true);
    try {
      const res = await fetch("/api/admin/brand-plans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trialDays }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error("บันทึกไม่สำเร็จ", data.error ?? "ลองใหม่");
        return;
      }
      toast.success("บันทึกช่วงทดลองแล้ว");
      await load();
    } finally {
      setSavingTrial(false);
    }
  }

  async function savePlan(plan: string) {
    const draft = drafts[plan];
    if (!draft) return;
    setSavingPlan(plan);
    try {
      const res = await fetch(`/api/admin/brand-plans/${plan}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: draft.label,
          hint: draft.hint,
          priceBaht: draft.priceBaht,
          maxBranches: draft.maxBranches,
          maxStaff: draft.maxStaff,
          stockEnabled: draft.stockEnabled,
          kitchenEnabled: draft.kitchenEnabled,
          bbqEnabled: draft.bbqEnabled,
          skewerEnabled: draft.skewerEnabled,
          isActive: draft.isActive,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error("บันทึกแพ็กเกจไม่สำเร็จ", data.error ?? "ลองใหม่");
        return;
      }
      toast.success(`บันทึก ${draft.label} แล้ว`);
      await load();
    } finally {
      setSavingPlan(null);
    }
  }

  async function setTypePlan(typeId: string, ownerRegisterPlan: string) {
    const res = await fetch(`/api/admin/restaurant-types/${typeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownerRegisterPlan }),
    });
    if (!res.ok) {
      toast.error("อัปเดตประเภทร้านไม่สำเร็จ");
      return;
    }
    toast.success("อัปเดตแพ็กเกจเริ่มต้นแล้ว");
    await load();
  }

  function patchDraft(plan: string, patch: Partial<BrandPlanConfigRow>) {
    setDrafts((prev) => ({
      ...prev,
      [plan]: { ...prev[plan], ...patch },
    }));
  }

  if (!loaded || loading) return <AdminLoadingState />;
  if (!session?.isPlatformAdmin) return null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <AdminPageHeader
        title="แพ็กเกจ"
        description="กำหนดโควต้า · โมดูล · ช่วงทดลอง · แพ็กเกจเริ่มต้นตามประเภทร้าน"
      />

      <section className={adminCardClass}>
        <h2 className="text-sm font-semibold text-slate-900">ช่วงทดลองใช้ฟรี</h2>
        <p className="mt-1 text-xs text-slate-500">
          ใช้กับร้านที่สมัครเองและแบรนด์ใหม่สถานะทดลอง
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className={adminLabelClass} htmlFor="trial-days">
              จำนวนวัน
            </label>
            <input
              id="trial-days"
              type="number"
              min={1}
              max={90}
              className={`${adminInputClass} w-28`}
              value={trialDays}
              onChange={(e) => setTrialDays(Number(e.target.value))}
            />
          </div>
          <button
            type="button"
            className={btnPrimary}
            disabled={savingTrial}
            onClick={() => void saveTrial()}
          >
            {savingTrial ? "กำลังบันทึก…" : "บันทึกช่วงทดลอง"}
          </button>
        </div>
      </section>

      {PLANS.map((planId) => {
        const draft = drafts[planId];
        if (!draft) return null;
        const linkedTypes = typesByPlan.get(planId) ?? [];
        return (
          <section key={planId} className={adminCardClass}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[11px] text-slate-400">{planId}</p>
                <input
                  className={`${adminInputClass} mt-1 max-w-md text-base font-semibold`}
                  value={draft.label}
                  onChange={(e) => patchDraft(planId, { label: e.target.value })}
                />
              </div>
              <AdminToggle
                checked={draft.isActive}
                onChange={(isActive) => patchDraft(planId, { isActive })}
                label={draft.isActive ? "เปิดใช้" : "ปิดใช้"}
              />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className={adminLabelClass}>สาขาสูงสุด</label>
                <input
                  type="number"
                  min={1}
                  className={adminInputClass}
                  value={draft.maxBranches}
                  onChange={(e) =>
                    patchDraft(planId, {
                      maxBranches: Number(e.target.value),
                    })
                  }
                />
              </div>
              <div>
                <label className={adminLabelClass}>พนักงานสูงสุด</label>
                <input
                  type="number"
                  min={1}
                  className={adminInputClass}
                  value={draft.maxStaff}
                  onChange={(e) =>
                    patchDraft(planId, { maxStaff: Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <label className={adminLabelClass}>ราคา/เดือน (บาท)</label>
                <input
                  type="number"
                  min={0}
                  className={adminInputClass}
                  value={draft.priceBaht}
                  onChange={(e) =>
                    patchDraft(planId, { priceBaht: Number(e.target.value) })
                  }
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-1">
                <label className={adminLabelClass}>โมดูล</label>
                <p className="mt-2 text-xs text-slate-500">{moduleChips(draft)}</p>
              </div>
            </div>

            <div className="mt-3">
              <label className={adminLabelClass}>คำอธิบาย</label>
              <input
                className={adminInputClass}
                value={draft.hint}
                onChange={(e) => patchDraft(planId, { hint: e.target.value })}
              />
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  ["stockEnabled", "สต็อกสาขา"],
                  ["kitchenEnabled", "ครัว"],
                  ["bbqEnabled", "ชั่ง/โต๊ะ"],
                  ["skewerEnabled", "เสียบไม้"],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  <span>{label}</span>
                  <AdminToggle
                    checked={draft[key]}
                    onChange={(checked) => patchDraft(planId, { [key]: checked })}
                    label={label}
                  />
                </label>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className={btnPrimary}
                disabled={savingPlan === planId}
                onClick={() => void savePlan(planId)}
              >
                {savingPlan === planId ? "กำลังบันทึก…" : "บันทึกแพ็กเกจ"}
              </button>
            </div>

            <div className="mt-5 border-t border-slate-100 pt-4">
              <p className="text-sm font-semibold text-slate-800">
                ประเภทร้านที่ใช้แพ็กเกจนี้เป็นค่าเริ่มต้น
              </p>
              {linkedTypes.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">ยังไม่มีประเภทร้าน</p>
              ) : (
                <div className={adminTableWrapClass + " mt-2"}>
                  <table className={adminTableClass}>
                    <thead className={adminTheadClass}>
                      <tr>
                        <th>ประเภทร้าน</th>
                        <th>โชว์ตอนสมัคร</th>
                        <th>เปลี่ยนแพ็กเกจ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linkedTypes.map((row) => (
                        <tr key={row.id} className={adminTrClass}>
                          <td>
                            <p className="font-medium text-slate-900">{row.name}</p>
                            <p className="text-xs text-slate-400">{row.code}</p>
                          </td>
                          <td className="text-sm text-slate-600">
                            {row.showInOwnerRegister ? "ใช่" : "—"}
                          </td>
                          <td>
                            <select
                              className={adminInputClass}
                              value={row.ownerRegisterPlan}
                              onChange={(e) =>
                                void setTypePlan(row.id, e.target.value)
                              }
                            >
                              {PLANS.map((p) => (
                                <option key={p} value={p}>
                                  {drafts[p]?.label ?? p}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        );
      })}

      <section className={adminCardClass}>
        <h2 className="text-sm font-semibold text-slate-900">ประเภทร้านทั้งหมด</h2>
        <p className="mt-1 text-xs text-slate-500">
          จัดการรายละเอียดประเภทร้านเพิ่มเติมได้ที่{" "}
          <a href="/admin/restaurant-types" className="text-site-primary underline">
            ประเภทร้าน
          </a>
        </p>
        {(catalog?.restaurantTypes.length ?? 0) === 0 ? (
          <AdminEmptyState title="ยังไม่มีประเภทร้าน" />
        ) : (
          <div className={adminTableWrapClass + " mt-3"}>
            <table className={adminTableClass}>
              <thead className={adminTheadClass}>
                <tr>
                  <th>ชื่อ</th>
                  <th>แพ็กเกจเริ่มต้น</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {catalog!.restaurantTypes.map((row) => (
                  <tr key={row.id} className={adminTrClass}>
                    <td>
                      <p className="font-medium">{row.name}</p>
                      <p className="text-xs text-slate-400">{row.code}</p>
                    </td>
                    <td>
                      <select
                        className={adminInputClass}
                        value={row.ownerRegisterPlan}
                        onChange={(e) => void setTypePlan(row.id, e.target.value)}
                      >
                        {PLANS.map((p) => (
                          <option key={p} value={p}>
                            {drafts[p]?.label ?? p}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="text-sm">
                      {row.isActive ? (
                        <span className="text-emerald-700">ใช้งาน</span>
                      ) : (
                        <span className="text-slate-400">ปิด</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4">
          <a href="/admin/restaurant-types" className={btnOutline}>
            ไปหน้าประเภทร้าน
          </a>
        </div>
      </section>

      <p className="text-xs text-slate-400">
        การเพิ่มแพ็กเกจใหม่ (นอก 4 แพ็กเกจมาตรฐาน) ต้องขยาย enum ในระบบ — ติดต่อทีมพัฒนา
      </p>
    </div>
  );
}
