"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AdminEmptyState,
  AdminLoadingState,
  AdminPageHeader,
  adminInputClass,
  adminLabelClass,
  adminTableClass,
  adminTableWrapClass,
  adminTheadClass,
  adminTrHoverClass,
  btnDanger,
  btnOutline,
  btnPrimary,
  btnPrimaryXl,
} from "@/components/admin/AdminShell";
import { AdminModal } from "@/components/admin/AdminModal";
import { useToast } from "@/components/admin/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { IconPlus } from "@/components/icons";
import { ImageField } from "@/components/admin/ImageField";
import {
  DEFAULT_BRAND_COLOR,
} from "@/lib/color";
import { BrandColorPicker } from "@/components/BrandColorPicker";
import {
  BRAND_COVER_IMAGE_SIZE_HINT,
  BRAND_LOGO_SIZE_HINT,
} from "@/lib/image-guides";
import { bangkokDateKey } from "@/lib/constants";
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
  BRAND_STATUS_LABELS,
  effectiveStatus,
  formatTrialEndsAt,
  type BrandPlanId,
  type BrandStatusId,
} from "@/components/admin/BrandPlanBanner";

type Brand = {
  id: string;
  code: string;
  name: string;
  color: string;
  status?: BrandStatusId;
  plan?: BrandPlanId;
  maxBranches?: number;
  maxStaff?: number;
  stockEnabled?: boolean;
  kitchenEnabled?: boolean;
  bbqEnabled?: boolean;
  skewerEnabled?: boolean;
  trialEndsAt?: string | null;
  _count: { branches: number; members: number };
  members?: Array<{
    role: string;
    admin: { id: string; username: string; isPlatformAdmin: boolean };
  }>;
};

type PlanForm = {
  status: BrandStatusId;
  plan: BrandPlanId;
  maxBranches: number;
  maxStaff: number;
  stockEnabled: boolean;
  kitchenEnabled: boolean;
  bbqEnabled: boolean;
  skewerEnabled: boolean;
  trialEndsAt: string;
};

function emptyPlanForm(): PlanForm {
  const trial = new Date();
  trial.setDate(trial.getDate() + 30);
  const preset = BRAND_PLAN_PRESETS.RETAIL;
  return {
    status: "TRIAL",
    ...preset,
    trialEndsAt: bangkokDateKey(trial),
  };
}

function planFormFromBrand(brand: Brand): PlanForm {
  const trialEnds = brand.trialEndsAt
    ? bangkokDateKey(new Date(brand.trialEndsAt))
    : emptyPlanForm().trialEndsAt;
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
    trialEndsAt: trialEnds,
  };
}

function emptyCreateForm() {
  return {
    code: "",
    name: "",
    color: DEFAULT_BRAND_COLOR,
    logoUrl: "",
    coverImageUrl: "",
    adminUsername: "",
    adminPassword: "",
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

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/brands");
    if (res.status === 401) {
      router.push("/admin/login");
      return;
    }
    if (res.ok) setBrands(await res.json());
    setLoading(false);
  }, [router]);

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
    if (form.adminUsername.trim().length < 3) {
      toast.error("ไอดีผู้ดูแลไม่ถูกต้อง", "ต้องมีอย่างน้อย 3 ตัวอักษร");
      return;
    }
    if (form.adminPassword.length < 6) {
      toast.error("รหัสผ่านไม่ถูกต้อง", "ต้องมีอย่างน้อย 6 ตัวอักษร");
      return;
    }
    setCreating(true);
    const res = await fetch("/api/admin/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        name: form.name.trim(),
        color: form.color,
        logoUrl: form.logoUrl.trim() || null,
        coverImageUrl: form.coverImageUrl.trim() || null,
        adminUsername: form.adminUsername.trim().toLowerCase(),
        adminPassword: form.adminPassword,
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
      `ไอดีผู้ดูแล: ${data.createdAdminUsername ?? form.adminUsername}`,
    );
    setModalOpen(false);
    setForm(emptyCreateForm());
    load();
  }

  async function deleteBrand(id: string) {
    const ok = await confirm({
      title: "ลบแบรนด์?",
      message:
        "ลบได้เฉพาะเมื่อไม่มีสาขา — ผู้ดูแลแบรนด์ที่ผูกอยู่จะถูกลบสิทธิ์ด้วย",
      confirmLabel: "ลบแบรนด์",
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/brands/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      toast.error("ลบไม่สำเร็จ", data.error ?? "ลบไม่สำเร็จ");
      return;
    }
    toast.success("ลบแบรนด์แล้ว");
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
        description="จัดการแบรนด์และบัญชีผู้ดูแล — กดดูสาขาเพื่อเข้าไปตั้งค่าแต่ละสาขา"
        actions={
          <>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 shadow-sm">
              {brands.length} แบรนด์
            </span>
            <button type="button" onClick={openModal} className={btnPrimaryXl}>
              <IconPlus size={16} />
              สร้างแบรนด์
            </button>
          </>
        }
      />

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
        ) : (
          <div className={adminTableWrapClass}>
            <table className={adminTableClass}>
              <thead className={adminTheadClass}>
                <tr>
                  <th className="px-4 py-3 font-semibold">แบรนด์</th>
                  <th className="px-4 py-3 font-semibold">รหัส</th>
                  <th className="px-4 py-3 font-semibold">สถานะ / แพ็ก</th>
                  <th className="px-4 py-3 font-semibold">สาขา</th>
                  <th className="px-4 py-3 font-semibold">ผู้ดูแล</th>
                  <th className="px-4 py-3 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {brands.map((brand) => {
                  const owners =
                    brand.members
                      ?.filter((m) => !m.admin.isPlatformAdmin)
                      .map((m) => m.admin.username) ?? [];
                  const status = effectiveStatus(brand);
                  const plan = brand.plan ?? "RETAIL";
                  const trialLabel = formatTrialEndsAt(brand.trialEndsAt);
                  return (
                    <tr key={brand.id} className={adminTrHoverClass}>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        <span
                          className="mr-2 inline-block h-3 w-3 rounded-full"
                          style={{ backgroundColor: brand.color }}
                        />
                        {brand.name}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">
                        {brand.code}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${BRAND_STATUS_BADGE[status]}`}
                          >
                            {BRAND_STATUS_LABELS[status]}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                            {BRAND_PLAN_LABELS[plan]}
                          </span>
                        </div>
                        {status === "TRIAL" && trialLabel ? (
                          <p className="mt-1 text-[11px] text-slate-500">
                            ถึง {trialLabel}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {brand._count.branches}
                        {typeof brand.maxBranches === "number"
                          ? `/${brand.maxBranches}`
                          : ""}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {owners.length ? owners.join(", ") : "—"}
                      </td>
                      <td className="space-x-2 px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openPlan(brand)}
                          className={btnOutline}
                        >
                          แพ็กเกจ
                        </button>
                        <Link
                          href={`/admin/brands/${brand.id}`}
                          className={btnPrimary}
                        >
                          ดูสาขา
                        </Link>
                        <Link
                          href={`/admin/brands/${brand.id}/admins`}
                          className={btnOutline}
                        >
                          ผู้ดูแล
                        </Link>
                        <Link
                          href={`/${brand.code}`}
                          target="_blank"
                          className={btnOutline}
                        >
                          หน้าร้าน
                        </Link>
                        <button
                          type="button"
                          onClick={() => deleteBrand(brand.id)}
                          className={btnDanger}
                        >
                          ลบ
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AdminModal
        open={modalOpen}
        onClose={closeModal}
        busy={creating}
        title="สร้างแบรนด์ใหม่"
        description="สร้างแบรนด์พร้อมบัญชีเข้าใช้หลังบ้าน — เริ่ม Retail ทดลอง 30 วัน ปรับแพ็กทีหลังได้"
        maxWidthClassName="max-w-xl"
      >
        <form onSubmit={createBrand} className="p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={adminLabelClass}>รหัสแบรนด์ (URL)</label>
              <input
                className={adminInputClass}
                value={form.code}
                onChange={(e) =>
                  setForm((f) => ({ ...f, code: e.target.value }))
                }
                placeholder="เช่น malakhunmae"
                pattern="[a-zA-Z0-9-]{2,}"
                title="ใช้ได้เฉพาะ a-z, 0-9 และ - เท่านั้น"
                required
                autoFocus
              />
              <p className="mt-1 text-xs text-slate-500">
                ใช้ในลิงก์ร้าน — ได้เฉพาะ a-z, 0-9 และ - (ห้ามภาษาไทย)
              </p>
            </div>
            <div>
              <label className={adminLabelClass}>ชื่อแบรนด์</label>
              <input
                className={adminInputClass}
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="เช่น หมาล่าคุณแม่"
                required
              />
              <p className="mt-1 text-xs text-slate-500">
                ชื่อที่แสดงให้ลูกค้า — ใช้ภาษาไทยได้
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
              <p className="mb-2 text-xs text-slate-500">
                รูปภาพไม่บังคับตอนสร้าง — ผู้ดูแลแบรนด์อัปโหลดทีหลังในเมนูโปรไฟล์แบรนด์ได้
              </p>
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
                  size="compact"
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
                  size="compact"
                  hint={BRAND_COVER_IMAGE_SIZE_HINT}
                />
              </div>
            </div>
            <div className="border-t border-slate-100 pt-3 sm:col-span-2">
              <p className="mb-2 text-sm font-semibold text-slate-800">
                บัญชีผู้ดูแลแบรนด์
              </p>
            </div>
            <div>
              <label className={adminLabelClass}>ไอดีเข้าใช้</label>
              <input
                className={adminInputClass}
                value={form.adminUsername}
                onChange={(e) =>
                  setForm((f) => ({ ...f, adminUsername: e.target.value }))
                }
                placeholder="เช่น skillsale_admin"
                required
                autoComplete="off"
              />
            </div>
            <div>
              <label className={adminLabelClass}>รหัสผ่าน</label>
              <input
                type="password"
                className={adminInputClass}
                value={form.adminPassword}
                onChange={(e) =>
                  setForm((f) => ({ ...f, adminPassword: e.target.value }))
                }
                placeholder="อย่างน้อย 6 ตัวอักษร"
                required
                minLength={6}
                autoComplete="new-password"
              />
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
              {creating ? "กำลังสร้าง..." : "สร้างแบรนด์ + บัญชีผู้ดูแล"}
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
              {(
                [
                  "TRIAL",
                  "ACTIVE",
                  "PAUSED",
                  "EXPIRED",
                ] as const satisfies readonly BrandStatusId[]
              ).map((status) => (
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

          {planForm.status === "TRIAL" ? (
            <div>
              <label className={adminLabelClass}>วันสิ้นสุดทดลอง</label>
              <input
                type="date"
                className={adminInputClass}
                value={planForm.trialEndsAt}
                onChange={(e) =>
                  setPlanForm((f) => ({ ...f, trialEndsAt: e.target.value }))
                }
              />
            </div>
          ) : null}

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
                  ["stockEnabled", "สต็อก / บ้านกลาง"],
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
