"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AdminEmptyState,
  AdminLoadingState,
  AdminPageHeader,
  adminInputClass,
  adminLabelClass,
  btnOutline,
  btnPrimary,
  btnPrimaryXl,
} from "@/components/admin/AdminShell";
import { AdminModal } from "@/components/admin/AdminModal";
import { useToast } from "@/components/admin/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { IconFilter, IconPackage, IconPlus, IconSearch, IconStore, IconTrash, IconUser } from "@/components/icons";
import { ImageField } from "@/components/admin/ImageField";
import { SimpleRichTextEditor } from "@/components/admin/SimpleRichTextEditor";
import { PhoneInput } from "@/components/PhoneInput";
import { DateInput } from "@/components/DateInput";
import {
  DEFAULT_BRAND_COLOR,
} from "@/lib/color";
import { BrandColorPicker } from "@/components/BrandColorPicker";
import {
  BRAND_COVER_IMAGE_SIZE_HINT,
  BRAND_LOGO_SIZE_HINT,
} from "@/lib/image-guides";
import { bangkokDateKey } from "@/lib/constants";
import { slugifyCode } from "@/lib/slug";
import {
  BRAND_PLAN_HINTS,
  BRAND_PLAN_LABELS,
  BRAND_PLAN_PRESETS,
  BRAND_PLAN_PRICES,
  BRAND_PLANS_ORDERED,
} from "@/lib/brand-plan-shared";
import {
  BrandPlanBanner,
  BRAND_STATUS_BADGE,
  BRAND_STATUS_EDITABLE,
  BRAND_STATUS_LABELS,
  brandMonitorDaysRemaining,
  daysUntilDate,
  effectiveStatus,
  formatDaysRemaining,
  formatTrialEndsAt,
  moduleLabels,
  type BrandPlanId,
  type BrandStatusId,
} from "@/components/admin/BrandPlanBanner";

type Brand = {
  id: string;
  code: string;
  name: string;
  color: string;
  logoUrl?: string | null;
  status?: BrandStatusId;
  plan?: BrandPlanId;
  maxBranches?: number;
  maxStaff?: number;
  stockEnabled?: boolean;
  kitchenEnabled?: boolean;
  bbqEnabled?: boolean;
  skewerEnabled?: boolean;
  trialEndsAt?: string | null;
  serviceStartsAt?: string | null;
  lastPaidAt?: string | null;
  nextDueAt?: string | null;
  hasTestBranch?: boolean;
  _count: { branches: number; members: number };
  members?: Array<{
    role: string;
    admin: { id: string; username: string; isPlatformAdmin: boolean };
  }>;
};

const PLAN_SHORT_LABELS: Record<BrandPlanId, string> = {
  RETAIL: "Retail",
  WEIGH_TABLE: "ชั่งโต๊ะ",
  MALA: "Mala",
  MULTI: "Multi",
};

type StatusFilter = "ALL" | BrandStatusId;
type PlanFilter = "ALL" | BrandPlanId;
type ExpiryFilter = "ALL" | "d15" | "d7" | "d3" | "d1" | "overdue";

function chipClass(active: boolean, tone: "neutral" | "warn" | "danger" = "neutral") {
  if (active) {
    if (tone === "danger") return "bg-red-600 text-white ring-red-600";
    if (tone === "warn") return "bg-amber-600 text-white ring-amber-600";
    return "bg-slate-900 text-white ring-slate-900";
  }
  if (tone === "danger") {
    return "bg-white text-red-700 ring-red-200 hover:bg-red-50";
  }
  if (tone === "warn") {
    return "bg-white text-amber-800 ring-amber-200 hover:bg-amber-50";
  }
  return "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50";
}

type PlanForm = {
  status: BrandStatusId;
  plan: BrandPlanId;
  maxBranches: number;
  maxStaff: number;
  stockEnabled: boolean;
  kitchenEnabled: boolean;
  bbqEnabled: boolean;
  skewerEnabled: boolean;
  serviceStartsAt: string;
  trialEndsAt: string;
};

function emptyPlanForm(): PlanForm {
  const trial = new Date();
  trial.setDate(trial.getDate() + 30);
  const preset = BRAND_PLAN_PRESETS.RETAIL;
  return {
    status: "TRIAL",
    ...preset,
    serviceStartsAt: bangkokDateKey(),
    trialEndsAt: bangkokDateKey(trial),
  };
}

function planFormFromBrand(brand: Brand): PlanForm {
  const trialEnds = brand.trialEndsAt
    ? bangkokDateKey(new Date(brand.trialEndsAt))
    : emptyPlanForm().trialEndsAt;
  const starts = brand.serviceStartsAt
    ? bangkokDateKey(new Date(brand.serviceStartsAt))
    : bangkokDateKey();
  const plan = brand.plan ?? "RETAIL";
  return {
    status: brand.status ?? "ACTIVE",
    plan,
    maxBranches: brand.maxBranches ?? BRAND_PLAN_PRESETS[plan].maxBranches,
    maxStaff: brand.maxStaff ?? BRAND_PLAN_PRESETS[plan].maxStaff,
    stockEnabled: Boolean(brand.stockEnabled),
    kitchenEnabled: Boolean(brand.kitchenEnabled),
    bbqEnabled: Boolean(brand.bbqEnabled),
    skewerEnabled: Boolean(brand.skewerEnabled),
    serviceStartsAt: starts,
    trialEndsAt: trialEnds,
  };
}

function emptyCreateForm() {
  const plan = emptyPlanForm();
  return {
    code: "",
    name: "",
    color: DEFAULT_BRAND_COLOR,
    siteDescription: "",
    logoUrl: "",
    coverImageUrl: "",
    adminPhone: "",
    adminPassword: "",
    passwordTouched: false,
    codeTouched: false,
    ...plan,
  };
}

export function PlatformBrandsHome() {
  const router = useRouter();
  const toast = useToast();
  const { confirm } = useConfirm();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyCreateForm);
  const [planBrand, setPlanBrand] = useState<Brand | null>(null);
  const [planForm, setPlanForm] = useState<PlanForm>(emptyPlanForm);
  const [savingPlan, setSavingPlan] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [planFilter, setPlanFilter] = useState<PlanFilter>("ALL");
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>("ALL");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filtersActive =
    Boolean(query.trim()) ||
    statusFilter !== "ALL" ||
    planFilter !== "ALL" ||
    expiryFilter !== "ALL";

  const monitorStats = useMemo(() => {
    let active = 0;
    let trial = 0;
    let paused = 0;
    let expired = 0;
    let deleted = 0;
    let d15 = 0;
    let d7 = 0;
    let d3 = 0;
    let d1 = 0;
    let overdue = 0;
    for (const brand of brands) {
      const status = effectiveStatus(brand);
      if (status === "DELETED") {
        deleted += 1;
        continue;
      }
      if (status === "TRIAL") trial += 1;
      else if (status === "ACTIVE") active += 1;
      else if (status === "PAUSED") paused += 1;
      else if (status === "EXPIRED") expired += 1;

      const days = brandMonitorDaysRemaining(brand);
      if (days == null) continue;
      if (days < 0 || status === "EXPIRED") overdue += 1;
      else {
        if (days <= 15) d15 += 1;
        if (days <= 7) d7 += 1;
        if (days <= 3) d3 += 1;
        if (days <= 1) d1 += 1;
      }
    }
    return { active, trial, paused, expired, deleted, d15, d7, d3, d1, overdue };
  }, [brands]);

  const filteredBrands = useMemo(() => {
    const q = query.trim().toLowerCase();
    return brands.filter((brand) => {
      const status = effectiveStatus(brand);
      if (statusFilter === "ALL") {
        if (status === "DELETED") return false;
      } else if (statusFilter === "EXPIRED") {
        if (status !== "EXPIRED") return false;
      } else if (status !== statusFilter) {
        return false;
      }

      const plan = brand.plan ?? "RETAIL";
      if (planFilter !== "ALL" && plan !== planFilter) return false;

      if (q) {
        const hay = `${brand.name} ${brand.code}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      if (expiryFilter !== "ALL") {
        if (status === "DELETED") return false;
        const days = brandMonitorDaysRemaining(brand);
        if (expiryFilter === "overdue") {
          if (!(days != null && days < 0) && status !== "EXPIRED") return false;
        } else {
          if (days == null || days < 0) return false;
          const max =
            expiryFilter === "d15"
              ? 15
              : expiryFilter === "d7"
                ? 7
                : expiryFilter === "d3"
                  ? 3
                  : 1;
          if (days > max) return false;
        }
      }

      return true;
    });
  }, [brands, query, statusFilter, planFilter, expiryFilter]);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/brands");
    if (res.status === 401) {
      router.push("/admin/login");
      return;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(
        "โหลดแบรนด์ไม่สำเร็จ",
        typeof data.error === "string" ? data.error : "กรุณารีเฟรชหน้า หรือรีสตาร์ทเซิร์ฟเวอร์",
      );
      setLoading(false);
      return;
    }
    setBrands(await res.json());
    setLoading(false);
  }, [router, toast]);

  useEffect(() => {
    load();
  }, [load]);

  function openModal() {
    setForm(emptyCreateForm());
    setModalOpen(true);
  }

  function closeModal() {
    if (creating) return;
    setModalOpen(false);
    setForm(emptyCreateForm());
  }

  async function createBrand(e: React.FormEvent) {
    e.preventDefault();
    const code = form.code.trim().toLowerCase();
    if (!/^[a-z0-9-]{2,}$/.test(code)) {
      toast.error(
        "รหัสแบรนด์ไม่ถูกต้อง",
        "ใช้ได้เฉพาะ a-z, 0-9 และ - เท่านั้น (ห้ามภาษาไทยหรือช่องว่าง) เช่น malakhunmae",
      );
      return;
    }
    if (form.adminPhone.length < 9) {
      toast.error("เบอร์โทรไม่ถูกต้อง", "กรอกเบอร์เจ้าของร้านให้ครบ");
      return;
    }
    const password =
      form.adminPassword.trim() || form.adminPhone;
    if (password.length < 6) {
      toast.error("รหัสผ่านไม่ถูกต้อง", "ต้องมีอย่างน้อย 6 ตัวอักษร");
      return;
    }
    setCreating(true);
    const trialIso =
      form.status === "TRIAL" && form.trialEndsAt
        ? new Date(`${form.trialEndsAt}T23:59:59.999+07:00`).toISOString()
        : null;
    const startIso = form.serviceStartsAt
      ? new Date(`${form.serviceStartsAt}T00:00:00.000+07:00`).toISOString()
      : new Date().toISOString();
    const res = await fetch("/api/admin/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        name: form.name.trim(),
        color: form.color,
        siteDescription: form.siteDescription.trim() || null,
        logoUrl: form.logoUrl.trim() || null,
        coverImageUrl: form.coverImageUrl.trim() || null,
        contactPhone: form.adminPhone,
        adminPhone: form.adminPhone,
        adminPassword: password,
        status: form.status,
        plan: form.plan,
        applyPlanPreset: true,
        maxBranches: form.maxBranches,
        maxStaff: form.maxStaff,
        stockEnabled: form.stockEnabled,
        kitchenEnabled: form.kitchenEnabled,
        bbqEnabled: form.bbqEnabled,
        skewerEnabled: form.skewerEnabled,
        serviceStartsAt: startIso,
        trialEndsAt: trialIso,
      }),
    });
    setCreating(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error("สร้างไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
      return;
    }
    toast.success(
      "สร้างแบรนด์แล้ว",
      `เบอร์เจ้าของ: ${data.createdAdminPhone ?? form.adminPhone} · รหัสเริ่มต้น = เบอร์โทร`,
    );
    setModalOpen(false);
    setForm(emptyCreateForm());
    load();
  }

  async function deleteBrand(brand: Brand) {
    const ok = await confirm({
      title: "ลบแบรนด์?",
      message:
        "จะตั้งสถานะเป็น «ลบแล้ว» ไม่ลบข้อมูลออกจากระบบ — ร้านและพนักงานเข้าใช้ไม่ได้ และซ่อนจากรายการปกติ",
      confirmLabel: "ตั้งสถานะลบ",
      confirmText: brand.name.trim(),
      confirmTextHint: `พิมพ์ชื่อแบรนด์ «${brand.name.trim()}» เพื่อยืนยัน`,
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/brands/${brand.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json();
      toast.error("ลบไม่สำเร็จ", data.error ?? "ลบไม่สำเร็จ");
      return;
    }
    toast.success("ตั้งสถานะลบแล้ว", brand.name);
    load();
  }

  async function restoreBrand(brand: Brand) {
    const ok = await confirm({
      title: "กู้คืนแบรนด์?",
      message: "จะกลับไปสถานะ «ใช้งาน» — ปรับแพ็กเกจ/วันหมดอายุทีหลังได้",
      confirmLabel: "กู้คืน",
      tone: "primary",
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/brands/${brand.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ACTIVE" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error("กู้คืนไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
      return;
    }
    toast.success("กู้คืนแบรนด์แล้ว", brand.name);
    load();
  }

  function openPlan(brand: Brand) {
    setPlanBrand(brand);
    setPlanForm(planFormFromBrand(brand));
  }

  function closePlan() {
    if (savingPlan) return;
    setPlanBrand(null);
  }

  function applyPlanLimits(plan: BrandPlanId) {
    const preset = BRAND_PLAN_PRESETS[plan];
    setPlanForm((f) => ({ ...f, ...preset }));
  }

  async function savePlan(e: React.FormEvent) {
    e.preventDefault();
    if (!planBrand) return;
    setSavingPlan(true);
    const trialIso =
      planForm.status === "TRIAL" && planForm.trialEndsAt
        ? new Date(`${planForm.trialEndsAt}T23:59:59.999+07:00`).toISOString()
        : null;
    const startIso = planForm.serviceStartsAt
      ? new Date(`${planForm.serviceStartsAt}T00:00:00.000+07:00`).toISOString()
      : null;
    const res = await fetch(`/api/admin/brands/${planBrand.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: planForm.status,
        plan: planForm.plan,
        maxBranches: planForm.maxBranches,
        maxStaff: planForm.maxStaff,
        stockEnabled: planForm.stockEnabled,
        kitchenEnabled: planForm.kitchenEnabled,
        bbqEnabled: planForm.bbqEnabled,
        skewerEnabled: planForm.skewerEnabled,
        serviceStartsAt: startIso,
        trialEndsAt: trialIso,
      }),
    });
    setSavingPlan(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error("บันทึกแพ็กเกจไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
      return;
    }
    toast.success("อัปเดตแพ็กเกจแล้ว", planBrand.name);
    setPlanBrand(null);
    load();
  }

  if (loading) {
    return <AdminLoadingState />;
  }

  return (
    <div>
      <AdminPageHeader
        title="แบรนด์"
        description="มอนิเตอร์แพ็กเกจ สถานะ และวันใกล้หมดอายุ — กดดูสาขาเพื่อเข้าไปตั้งค่า"
        actions={
          <button type="button" onClick={openModal} className={btnPrimaryXl}>
            <IconPlus size={16} />
            สร้างแบรนด์
          </button>
        }
      />

      <section className="mt-4">
        <div className="mb-2 flex items-end justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-800">สรุป</h2>
          <p className="text-[11px] text-slate-500">กดการ์ดเพื่อกรองรายการ</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {(
            [
              {
                id: "all",
                label: "ทั้งหมด",
                value: brands.length - monitorStats.deleted,
                hint: "ไม่รวมที่ลบ",
                active:
                  statusFilter === "ALL" &&
                  expiryFilter === "ALL" &&
                  planFilter === "ALL" &&
                  !query.trim(),
                tone: "neutral" as const,
                onClick: () => {
                  setQuery("");
                  setStatusFilter("ALL");
                  setPlanFilter("ALL");
                  setExpiryFilter("ALL");
                },
              },
              {
                id: "active",
                label: "ใช้งาน",
                value: monitorStats.active,
                hint: "สถานะ Active",
                active: statusFilter === "ACTIVE" && expiryFilter === "ALL",
                tone: "ok" as const,
                onClick: () => {
                  setQuery("");
                  setStatusFilter("ACTIVE");
                  setPlanFilter("ALL");
                  setExpiryFilter("ALL");
                },
              },
              {
                id: "trial",
                label: "ทดลอง",
                value: monitorStats.trial,
                hint: "ช่วงทดลอง",
                active: statusFilter === "TRIAL" && expiryFilter === "ALL",
                tone: "warn" as const,
                onClick: () => {
                  setQuery("");
                  setStatusFilter("TRIAL");
                  setPlanFilter("ALL");
                  setExpiryFilter("ALL");
                },
              },
              {
                id: "d7",
                label: "≤7 วัน",
                value: monitorStats.d7,
                hint: "ใกล้หมดอายุ",
                active: expiryFilter === "d7",
                tone: "warn" as const,
                onClick: () => {
                  setQuery("");
                  setStatusFilter("ALL");
                  setPlanFilter("ALL");
                  setExpiryFilter("d7");
                },
              },
              {
                id: "d1",
                label: "≤1 วัน",
                value: monitorStats.d1,
                hint: "เร่งด่วน",
                active: expiryFilter === "d1",
                tone: "danger" as const,
                onClick: () => {
                  setQuery("");
                  setStatusFilter("ALL");
                  setPlanFilter("ALL");
                  setExpiryFilter("d1");
                },
              },
              {
                id: "overdue",
                label: "หมดอายุ",
                value: monitorStats.overdue,
                hint: "เลยกำหนด",
                active: expiryFilter === "overdue",
                tone: "danger" as const,
                onClick: () => {
                  setQuery("");
                  setStatusFilter("ALL");
                  setPlanFilter("ALL");
                  setExpiryFilter("overdue");
                },
              },
            ] as const
          ).map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={card.onClick}
              className={`rounded-2xl border px-3 py-2.5 text-left shadow-sm transition ${
                card.active
                  ? card.tone === "danger"
                    ? "border-red-600 bg-red-600 text-white"
                    : card.tone === "warn"
                      ? "border-amber-600 bg-amber-600 text-white"
                      : card.tone === "ok"
                        ? "border-emerald-700 bg-emerald-700 text-white"
                        : "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <p
                className={`text-[11px] font-semibold ${
                  card.active ? "text-white/85" : "text-slate-500"
                }`}
              >
                {card.label}
              </p>
              <p className="mt-0.5 text-2xl font-bold tabular-nums leading-none">
                {card.value}
              </p>
              <p
                className={`mt-1 text-[10px] ${
                  card.active ? "text-white/75" : "text-slate-400"
                }`}
              >
                {card.hint}
              </p>
            </button>
          ))}
        </div>
        {monitorStats.deleted > 0 ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setStatusFilter("DELETED");
              setPlanFilter("ALL");
              setExpiryFilter("ALL");
            }}
            className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition ${
              statusFilter === "DELETED"
                ? "bg-slate-800 text-white ring-slate-800"
                : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            ลบแล้ว {monitorStats.deleted}
          </button>
        ) : null}
      </section>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 p-2.5 sm:p-3">
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            aria-expanded={filtersOpen}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold ring-1 transition ${
              filtersOpen || filtersActive
                ? "bg-slate-900 text-white ring-slate-900"
                : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            <IconFilter size={16} />
            ค้นหา / กรอง
            {filtersActive ? (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  filtersOpen || filtersActive
                    ? "bg-white/20 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                เปิดอยู่
              </span>
            ) : null}
          </button>
          <span className="ml-auto text-xs text-slate-500">
            แสดง {filteredBrands.length}/{brands.length}
          </span>
        </div>

        {filtersOpen ? (
          <div className="space-y-3 border-t border-slate-100 p-3 sm:p-4">
            <label className="relative block">
              <IconSearch
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="search"
                className={`${adminInputClass} pl-9`}
                placeholder="ค้นหาชื่อหรือรหัสแบรนด์…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
            </label>

            <div>
              <p className={adminLabelClass}>สถานะ</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {(
                  [
                    ["ALL", `ทั้งหมด (${brands.length - monitorStats.deleted})`],
                    ["TRIAL", `ทดลอง (${monitorStats.trial})`],
                    ["ACTIVE", `ใช้งาน (${monitorStats.active})`],
                    ["PAUSED", `หยุดใช้ (${monitorStats.paused})`],
                    ["EXPIRED", `หมดอายุ (${monitorStats.expired})`],
                    ["DELETED", `ลบแล้ว (${monitorStats.deleted})`],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setStatusFilter(id)}
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition ${chipClass(
                      statusFilter === id,
                      id === "DELETED" || id === "EXPIRED" ? "danger" : "neutral",
                    )}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className={adminLabelClass}>แพ็กเกจ</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setPlanFilter("ALL")}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition ${chipClass(
                    planFilter === "ALL",
                  )}`}
                >
                  ทั้งหมด
                </button>
                {BRAND_PLANS_ORDERED.map((plan) => (
                  <button
                    key={plan}
                    type="button"
                    onClick={() => setPlanFilter(plan)}
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition ${chipClass(
                      planFilter === plan,
                    )}`}
                  >
                    {PLAN_SHORT_LABELS[plan]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className={adminLabelClass}>ใกล้หมดอายุ / ครบกำหนด</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {(
                  [
                    ["ALL", "ทั้งหมด", "neutral"],
                    ["d15", `≤15 วัน (${monitorStats.d15})`, "warn"],
                    ["d7", `≤7 วัน (${monitorStats.d7})`, "warn"],
                    ["d3", `≤3 วัน (${monitorStats.d3})`, "danger"],
                    ["d1", `≤1 วัน (${monitorStats.d1})`, "danger"],
                    ["overdue", `หมดอายุแล้ว (${monitorStats.overdue})`, "danger"],
                  ] as const
                ).map(([id, label, tone]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setExpiryFilter(id)}
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition ${chipClass(
                      expiryFilter === id,
                      tone,
                    )}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500">
                นับจากวันสิ้นสุดทดลอง หรือวันครบกำหนดชำระ (ถ้ามี)
              </p>
            </div>

            {filtersActive ? (
              <button
                type="button"
                className={`${btnOutline} w-full sm:w-auto`}
                onClick={() => {
                  setQuery("");
                  setStatusFilter("ALL");
                  setPlanFilter("ALL");
                  setExpiryFilter("ALL");
                }}
              >
                ล้างตัวกรอง
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="mt-6">
        {brands.length === 0 ? (
          <AdminEmptyState
            title="ยังไม่มีแบรนด์"
            description="กด “สร้างแบรนด์” เพื่อเพิ่มแบรนด์แรกพร้อมบัญชีผู้ดูแล"
            action={
              <button type="button" onClick={openModal} className={btnPrimaryXl}>
                <IconPlus size={16} />
                สร้างแบรนด์
              </button>
            }
          />
        ) : filteredBrands.length === 0 ? (
          <AdminEmptyState
            title="ไม่พบแบรนด์ตามเงื่อนไข"
            description="ลองเปลี่ยนตัวกรอง หรือล้างการค้นหา"
            action={
              <button
                type="button"
                className={btnOutline}
                onClick={() => {
                  setQuery("");
                  setStatusFilter("ALL");
                  setPlanFilter("ALL");
                  setExpiryFilter("ALL");
                }}
              >
                ล้างตัวกรอง
              </button>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredBrands.map((brand) => {
              const owners =
                brand.members
                  ?.filter((m) => !m.admin.isPlatformAdmin)
                  .map((m) => m.admin.username) ?? [];
              const status = effectiveStatus(brand);
              const plan = brand.plan ?? "RETAIL";
              const trialLabel = formatTrialEndsAt(brand.trialEndsAt);
              const startLabel = formatTrialEndsAt(brand.serviceStartsAt);
              const dueLabel = formatTrialEndsAt(brand.nextDueAt);
              const paidLabel = formatTrialEndsAt(brand.lastPaidAt);
              const trialDays = daysUntilDate(brand.trialEndsAt);
              const dueDays = daysUntilDate(brand.nextDueAt);
              const trialRemain = formatDaysRemaining(trialDays);
              const dueRemain = formatDaysRemaining(dueDays);
              const modules = moduleLabels(brand);
              const branchUsed = brand._count.branches;
              const branchMax =
                typeof brand.maxBranches === "number"
                  ? brand.maxBranches
                  : null;
              const showTrialSchedule =
                Boolean(trialLabel) &&
                (status === "TRIAL" || status === "EXPIRED");
              return (
                <article
                  key={brand.id}
                  className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                >
                  <div
                    className="h-1.5 w-full"
                    style={{ backgroundColor: brand.color }}
                  />
                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <div className="flex items-start gap-3">
                      <div
                        className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl ring-1 ring-slate-200"
                        style={{
                          backgroundColor: brand.logoUrl
                            ? "#fff"
                            : `${brand.color}22`,
                        }}
                      >
                        {brand.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={brand.logoUrl}
                            alt=""
                            className="h-full w-full object-contain p-1"
                          />
                        ) : (
                          <span
                            className="text-lg font-bold"
                            style={{ color: brand.color }}
                          >
                            {brand.name.trim().charAt(0) || "B"}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h3 className="truncate text-base font-bold text-slate-900">
                            {brand.name}
                          </h3>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${BRAND_STATUS_BADGE[status]}`}
                          >
                            {BRAND_STATUS_LABELS[status]}
                          </span>
                        </div>
                        <p
                          className="mt-0.5 truncate font-mono text-[11px] text-slate-500"
                          title={brand.code}
                        >
                          /{brand.code}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                        {PLAN_SHORT_LABELS[plan]}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        ฿{BRAND_PLAN_PRICES[plan]}/เดือน
                      </span>
                      {startLabel ? (
                        <span className="text-[11px] text-slate-500">
                          · เริ่ม {startLabel}
                        </span>
                      ) : null}
                    </div>

                    {(showTrialSchedule || dueLabel || paidLabel) && (
                      <div className="space-y-1.5 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-xs">
                        {showTrialSchedule ? (
                          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                            <span
                              className={
                                status === "EXPIRED" ||
                                (trialDays != null && trialDays < 0)
                                  ? "font-medium text-red-700"
                                  : trialDays != null && trialDays <= 7
                                    ? "font-medium text-amber-800"
                                    : "text-slate-600"
                              }
                            >
                              ทดลองถึง {trialLabel}
                            </span>
                            {trialRemain ? (
                              <span
                                className={`font-semibold ${
                                  status === "EXPIRED" ||
                                  (trialDays != null && trialDays < 0)
                                    ? "text-red-700"
                                    : trialDays != null && trialDays <= 7
                                      ? "text-amber-800"
                                      : "text-slate-800"
                                }`}
                              >
                                {trialRemain}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                        {dueLabel ? (
                          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                            <span
                              className={
                                dueDays != null && dueDays < 0
                                  ? "font-medium text-red-700"
                                  : dueDays != null && dueDays <= 7
                                    ? "font-medium text-amber-800"
                                    : "text-slate-600"
                              }
                            >
                              ครบกำหนดชำระ {dueLabel}
                            </span>
                            {dueRemain ? (
                              <span
                                className={`font-semibold ${
                                  dueDays != null && dueDays < 0
                                    ? "text-red-700"
                                    : dueDays != null && dueDays <= 7
                                      ? "text-amber-800"
                                      : "text-slate-800"
                                }`}
                              >
                                {dueRemain}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                        {paidLabel ? (
                          <p className="text-slate-500">ชำระล่าสุด {paidLabel}</p>
                        ) : null}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <IconStore size={14} className="shrink-0 text-slate-400" />
                        <span>
                          สาขา{" "}
                          <span className="font-semibold text-slate-800">
                            {branchUsed}
                            {branchMax != null ? `/${branchMax}` : ""}
                          </span>
                          {brand.hasTestBranch ? (
                            <span className="ml-1 text-violet-700">+ทดลอง</span>
                          ) : null}
                        </span>
                      </div>
                      <div className="flex min-w-0 items-center gap-1.5">
                        <IconUser size={14} className="shrink-0 text-slate-400" />
                        <span className="truncate" title={owners.join(", ")}>
                          {owners.length
                            ? owners.length === 1
                              ? owners[0]
                              : `${owners[0]} +${owners.length - 1}`
                            : "ยังไม่มีผู้ดูแล"}
                        </span>
                      </div>
                    </div>

                    {modules.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {modules.map((m) => (
                          <span
                            key={m}
                            className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200"
                          >
                            {m}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-auto space-y-2 border-t border-slate-100 pt-3">
                      <div className="grid grid-cols-2 gap-2">
                        <Link
                          href={`/admin/brands/${brand.id}`}
                          className={`${btnPrimary} justify-center`}
                        >
                          ดูสาขา
                        </Link>
                        <Link
                          href={`/admin/brands/${brand.id}/admins`}
                          className={`${btnOutline} justify-center`}
                        >
                          บัญชีเจ้าของ
                        </Link>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        {status === "DELETED" ? (
                          <button
                            type="button"
                            onClick={() => restoreBrand(brand)}
                            className="ml-auto inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
                          >
                            กู้คืน
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => openPlan(brand)}
                              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                            >
                              <IconPackage size={14} />
                              แพ็กเกจ
                            </button>
                            <Link
                              href={`/${brand.code}`}
                              target="_blank"
                              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                            >
                              หน้าร้าน
                            </Link>
                            <button
                              type="button"
                              onClick={() => deleteBrand(brand)}
                              className="ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                            >
                              <IconTrash size={14} />
                              ลบ
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <AdminModal
        open={modalOpen}
        onClose={closeModal}
        busy={creating}
        title="สร้างแบรนด์ใหม่"
        description="กรอกให้จบในหน้านี้ — เริ่ม Retail ทดลอง 30 วัน ปรับแพ็กทีหลังได้"
        maxWidthClassName="max-w-2xl"
      >
        <form onSubmit={createBrand} className="p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={adminLabelClass}>ชื่อแบรนด์</label>
              <input
                className={adminInputClass}
                value={form.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setForm((f) => ({
                    ...f,
                    name,
                    code: f.codeTouched
                      ? f.code
                      : slugifyCode(name).slice(0, 40),
                  }));
                }}
                placeholder="เช่น หมาล่าคุณแม่"
                required
                autoFocus
              />
              <p className="mt-1 text-xs text-slate-500">
                ชื่อที่แสดงให้ลูกค้า — ใช้ภาษาไทยได้
              </p>
            </div>
            <div className="sm:col-span-2">
              <label className={adminLabelClass}>รหัสแบรนด์ (URL)</label>
              <div className="flex gap-2">
                <input
                  className={adminInputClass}
                  value={form.code}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      code: e.target.value,
                      codeTouched: true,
                    }))
                  }
                  placeholder="เช่น malakhunmae"
                  pattern="[a-zA-Z0-9-]{2,}"
                  title="ใช้ได้เฉพาะ a-z, 0-9 และ - เท่านั้น"
                  required
                />
                <button
                  type="button"
                  className={`${btnOutline} shrink-0`}
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      code: slugifyCode(f.name || f.code).slice(0, 40),
                      codeTouched: true,
                    }))
                  }
                >
                  Gen
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                ใช้ในลิงก์ร้าน — ได้เฉพาะ a-z, 0-9 และ - (ห้ามภาษาไทย)
                {form.code.trim() ? ` · /${form.code.trim().toLowerCase()}` : ""}
              </p>
            </div>
            <div className="sm:col-span-2">
              <label className={adminLabelClass}>สีแบรนด์ / ธีม</label>
              <BrandColorPicker
                value={form.color}
                onChange={(color) => setForm((f) => ({ ...f, color }))}
                inputClassName={adminInputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <SimpleRichTextEditor
                label="รายละเอียดแบรนด์"
                hint="แนะนำร้านสั้นๆ ให้ลูกค้าเห็นตอนเข้าจากลิงก์แบรนด์"
                value={form.siteDescription}
                onChange={(siteDescription) =>
                  setForm((f) => ({ ...f, siteDescription }))
                }
                placeholder="เช่น หม่าล่าหม้อไฟ · เปิดทุกวัน 16:00–23:00"
              />
            </div>
            <div className="sm:col-span-2">
              <div className="grid gap-4 sm:grid-cols-2">
                <ImageField
                  label="โลโก้ (ไม่บังคับ)"
                  value={form.logoUrl}
                  onChange={(url) =>
                    setForm((f) => ({ ...f, logoUrl: url }))
                  }
                  shopCode={form.code.trim() || undefined}
                  folder="Brand"
                  aspectClassName="aspect-square"
                  cropAspect={1}
                  cropTitle="ครอปลโก้ 1:1"
                  size="compact"
                  objectFit="contain"
                  hint={BRAND_LOGO_SIZE_HINT}
                />
                <ImageField
                  label="รูปปก (ไม่บังคับ)"
                  value={form.coverImageUrl}
                  onChange={(url) =>
                    setForm((f) => ({ ...f, coverImageUrl: url }))
                  }
                  shopCode={form.code.trim() || undefined}
                  folder="Brand"
                  aspectClassName="aspect-[3/2]"
                  cropAspect={3 / 2}
                  cropTitle="ครอปรูปปก 3:2"
                  size="compact"
                  hint={BRAND_COVER_IMAGE_SIZE_HINT}
                />
              </div>
            </div>
            <div className="border-t border-slate-100 pt-3 sm:col-span-2">
              <p className="mb-1 text-sm font-semibold text-slate-800">
                แพ็กเกจและการใช้งาน
              </p>
              <p className="mb-3 text-xs text-slate-500">
                เลือกตอนสร้างได้ — แก้ทีหลังที่หน้าบัญชีเจ้าของได้
              </p>
              <div className="space-y-3">
                <div>
                  <p className={adminLabelClass}>สถานะ</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {BRAND_STATUS_EDITABLE.map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, status }))}
                        className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                          form.status === status
                            ? BRAND_STATUS_BADGE[status]
                            : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {BRAND_STATUS_LABELS[status]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label>
                    <span className={adminLabelClass}>วันเริ่มใช้งาน</span>
                    <DateInput
                      className={adminInputClass}
                      value={form.serviceStartsAt}
                      onChange={(v) =>
                        setForm((f) => ({
                          ...f,
                          serviceStartsAt: v,
                        }))
                      }
                      required
                    />
                  </label>
                  {form.status === "TRIAL" ? (
                    <label>
                      <span className={adminLabelClass}>วันสิ้นสุดทดลอง</span>
                      <DateInput
                        className={adminInputClass}
                        value={form.trialEndsAt}
                        onChange={(v) =>
                          setForm((f) => ({
                            ...f,
                            trialEndsAt: v,
                          }))
                        }
                      />
                    </label>
                  ) : null}
                </div>
                <div>
                  <p className={adminLabelClass}>แพ็กเกจ</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {BRAND_PLANS_ORDERED.map((plan) => {
                      const preset = BRAND_PLAN_PRESETS[plan];
                      const selected = form.plan === plan;
                      return (
                        <button
                          key={plan}
                          type="button"
                          onClick={() =>
                            setForm((f) => ({ ...f, ...preset }))
                          }
                          className={`rounded-2xl border px-3 py-2.5 text-left transition ${
                            selected
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 bg-white text-slate-800"
                          }`}
                        >
                          <p className="text-sm font-semibold">
                            {BRAND_PLAN_LABELS[plan]}
                          </p>
                          <p
                            className={`mt-0.5 text-xs ${
                              selected ? "text-white/85" : "text-slate-500"
                            }`}
                          >
                            ฿{BRAND_PLAN_PRICES[plan]}/เดือน · สาขา{" "}
                            {preset.maxBranches}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
            <div className="border-t border-slate-100 pt-3 sm:col-span-2">
              <p className="mb-1 text-sm font-semibold text-slate-800">
                บัญชีเจ้าของร้าน
              </p>
              <p className="mb-3 text-xs text-slate-500">
                ล็อกอินด้วยเบอร์โทร — รับ OTP หรือใส่รหัสผ่านก็ได้
              </p>
            </div>
            <div>
              <label className={adminLabelClass}>เบอร์โทรเจ้าของ</label>
              <PhoneInput
                className={adminInputClass}
                value={form.adminPhone}
                onChange={(adminPhone) =>
                  setForm((f) => ({
                    ...f,
                    adminPhone,
                    adminPassword: f.passwordTouched
                      ? f.adminPassword
                      : adminPhone,
                  }))
                }
                required
              />
              <p className="mt-1 text-xs text-slate-500">
                ระบบเช็คซ้ำ — เบอร์นี้ใช้ล็อกอินแอปเจ้าของ
              </p>
            </div>
            <div>
              <label className={adminLabelClass}>รหัสผ่านเริ่มต้น</label>
              <input
                type="text"
                className={adminInputClass}
                value={form.adminPassword}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    adminPassword: e.target.value,
                    passwordTouched: true,
                  }))
                }
                placeholder="ค่าเริ่มต้น = เบอร์โทร"
                minLength={6}
                autoComplete="new-password"
              />
              <p className="mt-1 text-xs text-slate-500">
                ว่างไว้ได้ — ระบบใช้เบอร์โทรเป็นรหัสผ่านให้อัตโนมัติ
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={closeModal}
              disabled={creating}
              className="cursor-pointer rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={creating}
              className={btnPrimary}
            >
              {creating ? "กำลังสร้าง..." : "สร้างแบรนด์ + บัญชีเจ้าของ"}
            </button>
          </div>
        </form>
      </AdminModal>

      <AdminModal
        open={Boolean(planBrand)}
        onClose={closePlan}
        busy={savingPlan}
        title={planBrand ? `แพ็กเกจ · ${planBrand.name}` : "แพ็กเกจ"}
        description="สถานะ แพ็กเกจ โควต้า และโมดูล — PAUSED/EXPIRED จะปิดหน้าร้านและล็อกอินพนักงาน"
        maxWidthClassName="max-w-xl"
      >
        <form onSubmit={savePlan} className="space-y-5 p-5">
          <BrandPlanBanner
            brand={{
              ...planForm,
              trialEndsAt:
                planForm.status === "TRIAL" && planForm.trialEndsAt
                  ? `${planForm.trialEndsAt}T23:59:59.999+07:00`
                  : null,
              _count: planBrand?._count,
            }}
            editable
          />

          <div>
            <p className={adminLabelClass}>สถานะ</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {BRAND_STATUS_EDITABLE.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setPlanForm((f) => ({ ...f, status }))}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                    planForm.status === status
                      ? BRAND_STATUS_BADGE[status]
                      : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {BRAND_STATUS_LABELS[status]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={adminLabelClass}>วันเริ่มใช้งาน</label>
              <DateInput
                className={adminInputClass}
                value={planForm.serviceStartsAt}
                onChange={(v) =>
                  setPlanForm((f) => ({
                    ...f,
                    serviceStartsAt: v,
                  }))
                }
              />
            </div>
            {planForm.status === "TRIAL" ? (
              <div>
                <label className={adminLabelClass}>วันสิ้นสุดทดลอง</label>
                <DateInput
                  className={adminInputClass}
                  value={planForm.trialEndsAt}
                  onChange={(v) =>
                    setPlanForm((f) => ({ ...f, trialEndsAt: v }))
                  }
                />
              </div>
            ) : null}
          </div>

          <div>
            <p className={adminLabelClass}>แพ็กเกจ</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {BRAND_PLANS_ORDERED.map((plan) => {
                const preset = BRAND_PLAN_PRESETS[plan];
                const selected = planForm.plan === plan;
                return (
                  <button
                    key={plan}
                    type="button"
                    onClick={() => applyPlanLimits(plan)}
                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                      selected
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-800 hover:border-slate-300"
                    }`}
                  >
                    <p className="font-semibold">{BRAND_PLAN_LABELS[plan]}</p>
                    <p
                      className={`mt-0.5 text-xs font-medium ${
                        selected ? "text-white/90" : "text-slate-600"
                      }`}
                    >
                      ฿{BRAND_PLAN_PRICES[plan]}/เดือน
                    </p>
                    <p
                      className={`mt-1 text-xs ${
                        selected ? "text-white/75" : "text-slate-500"
                      }`}
                    >
                      สาขา {preset.maxBranches} · พนักงาน {preset.maxStaff}
                      {preset.stockEnabled ? " · สต็อกรวม" : ""}
                    </p>
                    <p
                      className={`mt-1 text-[11px] leading-snug ${
                        selected ? "text-white/65" : "text-slate-400"
                      }`}
                    >
                      {BRAND_PLAN_HINTS[plan]}
                    </p>
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              กดแพ็กเพื่อใส่โควต้าและโมดูลตามค่าเริ่มต้น — ปรับเองได้ด้านล่าง
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={adminLabelClass}>สาขาสูงสุด</label>
              <input
                type="number"
                min={1}
                max={200}
                className={adminInputClass}
                value={planForm.maxBranches}
                onChange={(e) =>
                  setPlanForm((f) => ({
                    ...f,
                    maxBranches: Math.max(1, Number(e.target.value) || 1),
                  }))
                }
              />
            </div>
            <div>
              <label className={adminLabelClass}>พนักงานสูงสุด</label>
              <input
                type="number"
                min={1}
                max={500}
                className={adminInputClass}
                value={planForm.maxStaff}
                onChange={(e) =>
                  setPlanForm((f) => ({
                    ...f,
                    maxStaff: Math.max(1, Number(e.target.value) || 1),
                  }))
                }
              />
            </div>
          </div>

          <div>
            <p className={adminLabelClass}>โมดูล</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["stockEnabled", "สต๊อกกลาง"],
                  ["kitchenEnabled", "ครัว / ผลิต"],
                  ["bbqEnabled", "หมูกระทะชั่งกิโล"],
                  ["skewerEnabled", "เสียบไม้"],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                >
                  <input
                    type="checkbox"
                    checked={planForm[key]}
                    onChange={(e) =>
                      setPlanForm((f) => ({ ...f, [key]: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={closePlan}
              disabled={savingPlan}
              className="cursor-pointer rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
            >
              ยกเลิก
            </button>
            <button type="submit" disabled={savingPlan} className={btnPrimary}>
              {savingPlan ? "กำลังบันทึก..." : "บันทึกแพ็กเกจ"}
            </button>
          </div>
        </form>
      </AdminModal>
    </div>
  );
}
