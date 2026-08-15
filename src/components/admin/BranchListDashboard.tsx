"use client";

import { Suspense, useEffect, useId, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AdminEmptyState,
  AdminLoadingState,
  AdminPageHeader,
  adminInputClass,
  adminLabelClass,
  btnOutline,
  btnPrimaryXl,
} from "@/components/admin/AdminShell";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { useToast } from "@/components/admin/Toast";
import { ImageField } from "@/components/admin/ImageField";
import { BranchLocationPicker } from "@/components/admin/BranchLocationPicker";
import { BranchHoursEditor } from "@/components/admin/BranchHoursEditor";
import {
  IconBack,
  IconChevronRight,
  IconClose,
  IconPlus,
  IconStore,
} from "@/components/icons";
import { slugifyCode } from "@/lib/slug";
import { DEFAULT_BRAND_COLOR, rgba } from "@/lib/color";
import {
  defaultWeeklyHours,
  type WeeklySchedule,
} from "@/lib/branch-hours";
import { BRANCH_IMAGE_SIZE_HINT } from "@/lib/image-guides";
import { BrandOverviewPanel } from "@/components/admin/BrandOverviewPanel";
import { parseBrandHqSection } from "@/lib/brand-hq-nav";
import { isTestBranch } from "@/lib/branch-test";
import {
  allowedOperatingModesForBrand,
  BRANCH_OPERATING_MODE_META,
  type BranchOperatingModeId,
} from "@/lib/branch-operating-mode";
import { HOTPOT_COUNTER_GROUP } from "@/lib/hotpot-counter-group";

export type DashboardBrand = {
  id: string;
  name: string;
  code: string;
  color?: string;
  kitchenEnabled?: boolean;
  bbqEnabled?: boolean;
  skewerEnabled?: boolean;
  maxBranches?: number;
  plan?: string;
};

type Branch = {
  id: string;
  name: string;
  code: string | null;
  imageUrl: string | null;
  isOpen?: boolean;
  isHidden?: boolean;
  isTest?: boolean;
  kind?: "STORE" | "WAREHOUSE" | string | null;
  brand: DashboardBrand | null;
  _count?: {
    staff: number;
    menuItems: number;
    deliveryLocations: number;
    orders: number;
  };
};

function defaultWeighAddonForBrand(brand: DashboardBrand | null | undefined) {
  if (!brand?.bbqEnabled) return false;
  const plan = brand.plan;
  return plan === "MALA" || plan === "MULTI" || plan === "WEIGH_TABLE";
}

function resetFormState(setters: {
  setName: (v: string) => void;
  setBrandId: (v: string) => void;
  setCode: (v: string) => void;
  setCodeManual: (v: boolean) => void;
  setImageUrl: (v: string) => void;
  setAddress: (v: string) => void;
  setLatitude: (v: number | null) => void;
  setLongitude: (v: number | null) => void;
  setStorefrontHours: (v: WeeklySchedule) => void;
  setDeliveryHours: (v: WeeklySchedule) => void;
  setError: (v: string | null) => void;
  setCreateStep: (v: 1 | 2) => void;
  setOperatingMode: (v: BranchOperatingModeId | null) => void;
  setWeighSalesEnabled: (v: boolean) => void;
  setCreateAsTest: (v: boolean) => void;
  defaultBrandId: string;
  defaultWeighSalesEnabled?: boolean;
  defaultCreateAsTest?: boolean;
}) {
  setters.setName("");
  setters.setBrandId(setters.defaultBrandId);
  setters.setCode("");
  setters.setCodeManual(false);
  setters.setImageUrl("");
  setters.setAddress("");
  setters.setLatitude(null);
  setters.setLongitude(null);
  setters.setStorefrontHours(defaultWeeklyHours());
  setters.setDeliveryHours(defaultWeeklyHours());
  setters.setError(null);
  setters.setCreateStep(1);
  setters.setOperatingMode("NORMAL");
  setters.setWeighSalesEnabled(Boolean(setters.defaultWeighSalesEnabled));
  setters.setCreateAsTest(Boolean(setters.defaultCreateAsTest));
}

type BranchListDashboardProps = {
  lockedBrandId?: string;
  brandMeta?: DashboardBrand | null;
  title?: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
  headerActions?: React.ReactNode;
};

export function BranchListDashboard(props: BranchListDashboardProps) {
  return (
    <Suspense fallback={<AdminLoadingState />}>
      <BranchListDashboardInner {...props} />
    </Suspense>
  );
}

function BranchListDashboardInner({
  lockedBrandId,
  brandMeta = null,
  title = "แดชบอร์ดสาขา",
  description = "จัดการสาขาและรูปหน้าร้านที่ใช้แสดงฝั่งลูกค้า",
  backHref,
  backLabel = "กลับ",
  headerActions,
}: BranchListDashboardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hqSection = parseBrandHqSection(searchParams.get("section"));
  const toast = useToast();
  const { session } = useAdminSession();
  const titleId = useId();
  const effectiveLockedBrandId =
    lockedBrandId ??
    (session && !session.isPlatformAdmin && session.brandIds.length === 1
      ? session.brandIds[0]
      : undefined);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [brands, setBrands] = useState<DashboardBrand[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [brandId, setBrandId] = useState(effectiveLockedBrandId ?? "");
  const [code, setCode] = useState("");
  const [codeManual, setCodeManual] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [storefrontHours, setStorefrontHours] = useState<WeeklySchedule>(
    () => defaultWeeklyHours(),
  );
  const [deliveryHours, setDeliveryHours] = useState<WeeklySchedule>(() =>
    defaultWeeklyHours(),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createStep, setCreateStep] = useState<1 | 2>(1);
  const [operatingMode, setOperatingMode] =
    useState<BranchOperatingModeId | null>(null);
  const [weighSalesEnabled, setWeighSalesEnabled] = useState(false);
  const [createAsTest, setCreateAsTest] = useState(false);

  const defaultBrandId = effectiveLockedBrandId ?? "";

  useEffect(() => {
    const branchesUrl = effectiveLockedBrandId
      ? `/api/admin/branches?brandId=${encodeURIComponent(effectiveLockedBrandId)}`
      : "/api/admin/branches";

    Promise.all([fetch(branchesUrl), fetch("/api/admin/brands")]).then(
      async ([branchRes, brandRes]) => {
        if (branchRes.status === 401 || brandRes.status === 401) {
          router.push("/admin/login");
          return;
        }
        if (branchRes.status === 403 || branchRes.status === 404) {
          router.push("/admin");
          return;
        }
        if (branchRes.ok) setBranches(await branchRes.json());
        if (brandRes.ok) {
          const list = (await brandRes.json()) as DashboardBrand[];
          setBrands(
            effectiveLockedBrandId
              ? list.filter((b) => b.id === effectiveLockedBrandId)
              : list,
          );
        }
        setLoading(false);
      },
    );
  }, [router, effectiveLockedBrandId]);

  useEffect(() => {
    if (effectiveLockedBrandId) {
      setBrandId(effectiveLockedBrandId);
    }
  }, [effectiveLockedBrandId]);

  useEffect(() => {
    if (!modalOpen) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) closeModal();
    }

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [modalOpen, saving]);

  function formSetters() {
    const brand =
      brands.find((b) => b.id === (effectiveLockedBrandId || defaultBrandId)) ||
      brandMeta;
    const liveCount = branches.filter((b) => !b.isTest).length;
    const hasTest = branches.some((b) => b.isTest);
    const liveAtLimit =
      typeof brand?.maxBranches === "number" &&
      liveCount >= brand.maxBranches;
    return {
      setName,
      setBrandId,
      setCode,
      setCodeManual,
      setImageUrl,
      setAddress,
      setLatitude,
      setLongitude,
      setStorefrontHours,
      setDeliveryHours,
      setError,
      setCreateStep,
      setOperatingMode,
      setWeighSalesEnabled,
      setCreateAsTest,
      defaultBrandId,
      defaultWeighSalesEnabled: defaultWeighAddonForBrand(brand),
      defaultCreateAsTest: liveAtLimit && !hasTest,
    };
  }

  function openModal() {
    resetFormState(formSetters());
    const brand =
      brands.find((b) => b.id === (effectiveLockedBrandId || defaultBrandId)) ||
      brandMeta;
    const modes = allowedOperatingModesForBrand(brand);
    setWeighSalesEnabled(defaultWeighAddonForBrand(brand));
    if (modes.length === 1) {
      setOperatingMode(modes[0]);
      setCreateStep(2);
    }
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    resetFormState(formSetters());
  }

  function onNameChange(value: string) {
    setName(value);
    if (!codeManual) {
      setCode(slugifyCode(value));
    }
  }

  async function createBranch(e: React.FormEvent) {
    e.preventDefault();
    if (createStep !== 2 || !operatingMode) return;
    setError(null);
    setSaving(true);
    try {
      const resolvedBrandId = effectiveLockedBrandId || brandId || null;
      const brandForCreate =
        brands.find((b) => b.id === (resolvedBrandId || "")) || brandMeta;
      const autoCode = slugifyCode(name);
      const liveCount = branches.filter(
        (b) => !b.isTest && b.kind !== "WAREHOUSE",
      ).length;
      const alreadyHasTest = branches.some((b) => b.isTest);
      const liveFull =
        typeof brandForCreate?.maxBranches === "number" &&
        liveCount >= brandForCreate.maxBranches;
      const res = await fetch("/api/admin/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          brandId: resolvedBrandId,
          code: (codeManual ? code.trim() : autoCode) || null,
          imageUrl: imageUrl.trim() || null,
          address: address.trim() || null,
          latitude,
          longitude,
          storefrontHours,
          deliveryHours,
          operatingMode,
          weighSalesEnabled:
            operatingMode === "NORMAL" &&
            Boolean(brandForCreate?.bbqEnabled) &&
            weighSalesEnabled,
          ...(createAsTest || liveFull
            ? { isTest: true }
            : alreadyHasTest
              ? { isTest: false }
              : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "สร้างสาขาไม่สำเร็จ",
        );
      }
      setBranches((prev) => [data, ...prev]);
      setModalOpen(false);
      resetFormState(formSetters());
      toast.success("สร้างสาขาแล้ว", data.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้างสาขาไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <AdminLoadingState />;
  }

  const selectedBrand =
    brands.find((b) => b.id === (effectiveLockedBrandId || brandId)) ||
    brandMeta;
  const previewCode = code || slugifyCode(name) || "…";
  const accent = selectedBrand?.color || DEFAULT_BRAND_COLOR;
  const brandLocked = Boolean(effectiveLockedBrandId);
  const availableModes = allowedOperatingModesForBrand(selectedBrand);
  const liveBranchCount = branches.filter(
    (b) => !b.isTest && b.kind !== "WAREHOUSE",
  ).length;
  const hasTestBranch = branches.some((b) => b.isTest);
  const liveAtLimit =
    typeof selectedBrand?.maxBranches === "number" &&
    liveBranchCount >= selectedBrand.maxBranches;
  const atBranchLimit = liveAtLimit && hasTestBranch;

  return (
    <div>
      {backHref ? (
        <Link
          href={backHref}
          className="mb-3 inline-flex items-center gap-1 text-sm text-red-600 hover:underline"
        >
          <IconBack size={16} />
          {backLabel}
        </Link>
      ) : null}

      {!session?.isPlatformAdmin ? (
        <Link
          href="/owner"
          className="mb-4 flex items-center justify-between rounded-2xl bg-[#0b2a4a] px-4 py-3 text-white shadow-sm"
        >
          <div>
            <p className="text-sm font-bold">โหมดใช้งานทุกวัน</p>
            <p className="text-xs text-white/75">
              ปุ่มใหญ่ · ดูยอดวันนี้ · ไม่ต้องหาเมนู
            </p>
          </div>
          <span className="text-sm font-semibold">เปิด ›</span>
        </Link>
      ) : null}

      <AdminPageHeader
        title={title}
        description={description}
        actions={
          <>
            {headerActions}
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 shadow-sm">
              {liveBranchCount}
              {typeof selectedBrand?.maxBranches === "number"
                ? `/${selectedBrand.maxBranches}`
                : ""}{" "}
              สาขา
              {hasTestBranch ? " · +ทดลอง" : ""}
            </span>
            <button
              type="button"
              onClick={openModal}
              disabled={atBranchLimit}
              title={
                atBranchLimit
                  ? `แพ็กนี้เปิดสาขาได้สูงสุด ${selectedBrand?.maxBranches} สาขา และใช้สล็อตทดลองแล้ว`
                  : liveAtLimit
                    ? "โควต้าสาขาจริงเต็ม — ยังสร้างสาขาทดลองได้อีก 1 สล็อต"
                    : undefined
              }
              className={btnPrimaryXl}
            >
              <IconPlus size={16} />
              เพิ่มสาขา
            </button>
          </>
        }
      />

      {effectiveLockedBrandId ? (
        <BrandOverviewPanel
          brandId={effectiveLockedBrandId}
          section={hqSection}
        />
      ) : null}

      {hqSection === "home" ? (
      <section className="mt-6">
        {branches.length === 0 ? (
          <AdminEmptyState
            title="ยังไม่มีสาขา"
            description="กด “เพิ่มสาขา” เพื่อสร้างสาขาแรก"
            action={
              <button type="button" onClick={openModal} className={btnPrimaryXl}>
                <IconPlus size={16} />
                เพิ่มสาขา
              </button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {branches.map((branch) => {
              const brandColor = branch.brand?.color || accent;
              const isWarehouse = branch.kind === "WAREHOUSE";
              const chipStyle = {
                backgroundColor: rgba(brandColor, 0.14),
                color: brandColor,
              };
              return (
                <Link
                  key={branch.id}
                  href={`/admin/branches/${branch.id}`}
                  className={`group overflow-hidden rounded-2xl border shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                    isWarehouse
                      ? "border-teal-300 ring-1 ring-teal-200/70"
                      : isTestBranch(branch)
                        ? "border-violet-300 ring-1 ring-violet-200/80"
                        : "border-slate-200"
                  }`}
                  style={{
                    borderColor:
                      isWarehouse || isTestBranch(branch)
                        ? undefined
                        : rgba(brandColor, 0.35),
                    background: isWarehouse
                      ? "linear-gradient(to bottom right, rgba(13,148,136,0.1), #ffffff)"
                      : isTestBranch(branch)
                        ? "linear-gradient(to bottom right, rgba(124,58,237,0.08), #ffffff)"
                        : `linear-gradient(to bottom right, ${rgba(brandColor, 0.12)}, #ffffff)`,
                  }}
                >
                  <div className="relative aspect-[16/10] bg-white/60">
                    {branch.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={branch.imageUrl}
                        alt=""
                        className={`absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.02] ${
                          branch.isHidden && !isWarehouse
                            ? "opacity-70 grayscale-[0.35]"
                            : ""
                        }`}
                      />
                    ) : (
                      <div
                        className="absolute inset-0 flex flex-col items-center justify-center gap-2"
                        style={{
                          background: isWarehouse
                            ? "linear-gradient(to bottom right, rgba(13,148,136,0.22), rgba(13,148,136,0.06))"
                            : `linear-gradient(to bottom right, ${rgba(brandColor, 0.22)}, ${rgba(brandColor, 0.06)})`,
                          color: isWarehouse
                            ? "rgba(13,148,136,0.7)"
                            : rgba(brandColor, 0.55),
                        }}
                      >
                        <IconStore size={28} />
                        <span className="text-xs">
                          {isWarehouse ? "สต๊อกกลาง" : "ยังไม่มีรูป"}
                        </span>
                      </div>
                    )}
                    <div className="absolute left-2 top-2 flex flex-wrap gap-1">
                      {isWarehouse ? (
                        <span className="rounded-full bg-teal-600/95 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white shadow-sm">
                          สต๊อกกลาง
                        </span>
                      ) : null}
                      {isTestBranch(branch) ? (
                        <span
                          title="สาขาทดลอง / ทดสอบระบบ — ไม่ใช่สาขาเปิดขายจริง"
                          className="rounded-full bg-violet-600/95 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white shadow-sm"
                        >
                          ⚗ ทดลอง
                        </span>
                      ) : null}
                      {!isWarehouse && branch.isHidden ? (
                        <span className="rounded-full bg-amber-500/95 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                          ซ่อน
                        </span>
                      ) : !isWarehouse && branch.isOpen === false ? (
                        <span className="rounded-full bg-slate-800/85 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                          ปิดร้าน
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-start justify-between gap-2 p-3 sm:p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900 sm:text-base">
                        {branch.name}
                        {isTestBranch(branch) ? (
                          <span className="ml-1.5 align-middle text-[10px] font-bold text-violet-600">
                            ทดลอง
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500 sm:text-sm">
                        {branch.brand?.name ?? selectedBrand?.name ?? "ไม่มีแบรนด์"}
                        {branch.code &&
                          ` · /${branch.brand?.code ?? selectedBrand?.code ?? "?"}/${branch.code}`}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1 sm:mt-3 sm:gap-1.5">
                        {isWarehouse ? (
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-medium sm:text-[11px]"
                            style={chipStyle}
                          >
                            พนักงาน {branch._count?.staff ?? 0}
                          </span>
                        ) : (
                          <>
                            <span
                              className="rounded-full px-2 py-0.5 text-[10px] font-medium sm:text-[11px]"
                              style={chipStyle}
                            >
                              เมนู {branch._count?.menuItems ?? 0}
                            </span>
                            <span
                              className="rounded-full px-2 py-0.5 text-[10px] font-medium sm:text-[11px]"
                              style={chipStyle}
                            >
                              ส่ง {branch._count?.deliveryLocations ?? 0}
                            </span>
                            <span
                              className="rounded-full px-2 py-0.5 text-[10px] font-medium sm:text-[11px]"
                              style={chipStyle}
                            >
                              ออเดอร์ {branch._count?.orders ?? 0}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <span
                      className="mt-0.5 shrink-0 opacity-60 transition group-hover:opacity-100"
                      style={{ color: isWarehouse ? "#0d9488" : brandColor }}
                    >
                      <IconChevronRight size={18} />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
      ) : null}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <button
            type="button"
            aria-label="ปิด"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1px]"
            onClick={closeModal}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative z-10 flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-slate-50 px-5 py-4">
              <div>
                <h3 id={titleId} className="font-semibold text-slate-900">
                  เพิ่มสาขาใหม่
                </h3>
                <p className="mt-0.5 text-sm text-slate-500">
                  {createStep === 1
                    ? "เลือกโหมดการทำงานของสาขาก่อน — เลือกแล้วเปลี่ยนไม่ได้"
                    : selectedBrand
                      ? `ภายใต้แบรนด์ ${selectedBrand.name}`
                      : "กรอกรายละเอียดสาขา"}
                </p>
                <p className="mt-1 text-xs font-medium text-slate-400">
                  ขั้นตอน {createStep} / 2
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-white/80 disabled:opacity-50"
                aria-label="ปิดหน้าต่าง"
              >
                <IconClose size={18} />
              </button>
            </div>

            <form
              onSubmit={createBranch}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                {createStep === 1 ? (
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        โหมดสาขา
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        กลุ่ม {HOTPOT_COUNTER_GROUP.shortLabel} เลือก「คิวเคาน์เตอร์」
                        แล้วติ๊กชั่งกิโลได้ — พนักงานใช้บัญชีเดียวสลับโหมดขาย
                      </p>
                    </div>
                    <div
                      className={`grid gap-3 ${
                        availableModes.length === 1
                          ? "sm:grid-cols-1"
                          : "sm:grid-cols-3"
                      }`}
                    >
                      {availableModes.map((modeId) => {
                        const meta = BRANCH_OPERATING_MODE_META[modeId];
                        const selected = operatingMode === modeId;
                        return (
                          <button
                            key={modeId}
                            type="button"
                            onClick={() => {
                              setOperatingMode(modeId);
                              if (modeId === "NORMAL") {
                                setWeighSalesEnabled(
                                  defaultWeighAddonForBrand(selectedBrand),
                                );
                              } else {
                                setWeighSalesEnabled(false);
                              }
                            }}
                            className={`rounded-2xl border px-4 py-5 text-left transition ${
                              selected
                                ? meta.selectedClass
                                : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50"
                            }`}
                          >
                            <p className="text-base font-semibold">
                              {meta.title}
                            </p>
                            <p
                              className={`mt-1.5 text-xs leading-relaxed ${
                                selected ? "text-white/80" : "text-slate-500"
                              }`}
                            >
                              {meta.description}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                    {operatingMode === "NORMAL" &&
                    selectedBrand?.bbqEnabled ? (
                      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50/70 px-4 py-3.5">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 rounded border-rose-300 text-rose-700 focus:ring-rose-500"
                          checked={weighSalesEnabled}
                          onChange={(e) =>
                            setWeighSalesEnabled(e.target.checked)
                          }
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-rose-950">
                            {HOTPOT_COUNTER_GROUP.weighAddonTitle}
                          </span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-rose-900/75">
                            {HOTPOT_COUNTER_GROUP.weighAddonHint}
                          </span>
                        </span>
                      </label>
                    ) : null}
                    {availableModes.length === 1 ? (
                      <p className="text-xs text-slate-500">
                        แพ็กเกจนี้ใช้โหมดร้านทั่วไป — เปิดหมูกระทะ/เสียบไม้ได้ที่ผู้ดูแลแพลตฟอร์ม
                      </p>
                    ) : null}
                    {error && (
                      <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                        {error}
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    {operatingMode && (
                      <div className="mb-5 flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${BRANCH_OPERATING_MODE_META[operatingMode].badgeClass}`}
                        >
                          {BRANCH_OPERATING_MODE_META[operatingMode].title}
                        </span>
                        <span className="text-xs text-slate-400">
                          โหมดล็อกหลังสร้างสาขา
                        </span>
                      </div>
                    )}
                <div className="grid gap-6 lg:grid-cols-[minmax(0,240px)_1fr]">
                  <ImageField
                    label="รูปสาขา"
                    value={imageUrl}
                    onChange={setImageUrl}
                    shopCode={code || selectedBrand?.code}
                    folder="Branch"
                    aspectClassName="aspect-[3/2]"
                    size="compact"
                    hint={BRANCH_IMAGE_SIZE_HINT}
                  />

                  <div className="grid content-start gap-4">
                    <div>
                      <label className={adminLabelClass}>ชื่อสาขา</label>
                      <input
                        className={adminInputClass}
                        value={name}
                        onChange={(e) => onNameChange(e.target.value)}
                        placeholder="เช่น สาขาคลอง 6"
                        required
                        autoFocus
                      />
                    </div>
                    {!brandLocked && (
                      <div>
                        <label className={adminLabelClass}>แบรนด์</label>
                        <select
                          className={adminInputClass}
                          value={brandId}
                          onChange={(e) => {
                            const nextId = e.target.value;
                            setBrandId(nextId);
                            const nextBrand = brands.find((b) => b.id === nextId);
                            const modes = allowedOperatingModesForBrand(nextBrand);
                            setOperatingMode((prev) =>
                              prev && modes.includes(prev) ? prev : "NORMAL",
                            );
                          }}
                          required={brands.length > 0}
                        >
                          <option value="">— เลือกแบรนด์ —</option>
                          {brands.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {brandLocked && selectedBrand && (
                      <div>
                        <label className={adminLabelClass}>แบรนด์</label>
                        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                          {selectedBrand.name}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          สร้างสาขาภายใต้แบรนด์นี้โดยอัตโนมัติ
                        </p>
                      </div>
                    )}
                    <div>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <label className={`${adminLabelClass} mb-0`}>
                          รหัสสาขา (URL)
                        </label>
                        {codeManual ? (
                          <button
                            type="button"
                            onClick={() => {
                              setCodeManual(false);
                              setCode(slugifyCode(name));
                            }}
                            className="text-xs text-red-600 hover:underline"
                          >
                            ใช้แบบอัตโนมัติ
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setCodeManual(true)}
                            className="text-xs text-slate-500 hover:text-slate-800"
                          >
                            แก้เอง
                          </button>
                        )}
                      </div>
                      <input
                        className={`${adminInputClass} ${
                          codeManual ? "" : "bg-slate-50 text-slate-600"
                        }`}
                        value={code}
                        onChange={(e) => {
                          setCodeManual(true);
                          setCode(slugifyCode(e.target.value) || e.target.value);
                        }}
                        readOnly={!codeManual}
                        placeholder="สร้างอัตโนมัติจากชื่อ"
                      />
                      <p className="mt-1 text-xs text-slate-400">
                        {codeManual
                          ? "คุณกำลังกำหนดรหัสเอง"
                          : "สร้างอัตโนมัติจากชื่อสาขา"}
                        {selectedBrand && name.trim()
                          ? ` · /${selectedBrand.code}/${previewCode}`
                          : null}
                      </p>
                    </div>
                    {!hasTestBranch ? (
                      <label
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 ${
                          createAsTest || liveAtLimit
                            ? "border-violet-300 bg-violet-50"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={createAsTest || liveAtLimit}
                          disabled={liveAtLimit}
                          onChange={(e) => setCreateAsTest(e.target.checked)}
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-violet-950">
                            สาขาทดลอง (ไม่นับโควต้า)
                          </span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-violet-900/75">
                            {liveAtLimit
                              ? "โควต้าสาขาจริงเต็มแล้ว — สร้างได้เฉพาะสล็อตทดลองนี้ (แบรนด์ละ 1)"
                              : "ได้ 1 สล็อตต่อแบรนด์ · ไม่โชว์หน้าร้านลูกค้า"}
                          </span>
                        </span>
                      </label>
                    ) : (
                      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        ใช้สล็อตสาขาทดลองแล้ว — สาขาใหม่จะนับโควต้าแพ็กเกจ
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-6 space-y-6 border-t border-slate-100 pt-6">
                  <BranchLocationPicker
                    value={{ address, latitude, longitude }}
                    onChange={(loc) => {
                      setAddress(loc.address);
                      setLatitude(loc.latitude);
                      setLongitude(loc.longitude);
                    }}
                  />

                  <BranchHoursEditor
                    title="เวลาเปิด–ปิดหน้าร้าน"
                    description="ใช้กับออเดอร์รับที่ร้าน (Pickup)"
                    value={storefrontHours}
                    onChange={setStorefrontHours}
                  />

                  <BranchHoursEditor
                    title="เวลาเปิด–ปิดเดลิเวอรี"
                    description="ใช้กับออเดอร์จัดส่ง"
                    value={deliveryHours}
                    onChange={setDeliveryHours}
                    extraActions={
                      <button
                        type="button"
                        className={btnOutline}
                        onClick={() =>
                          setDeliveryHours(
                            storefrontHours.map((d) => ({
                              ...d,
                              slots: d.slots.map((s) => ({ ...s })),
                            })),
                          )
                        }
                      >
                        คัดลอกจากหน้าร้าน
                      </button>
                    }
                  />
                </div>

                {error && (
                  <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </p>
                )}
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4">
                {createStep === 1 ? (
                  <>
                    <button
                      type="button"
                      onClick={closeModal}
                      disabled={saving}
                      className="cursor-pointer rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="button"
                      disabled={!operatingMode}
                      onClick={() => {
                        setError(null);
                        setCreateStep(2);
                      }}
                      className="cursor-pointer rounded-xl bg-site-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-site-primary-hover hover:shadow active:bg-site-primary-active disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      ถัดไป
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setCreateStep(1);
                      }}
                      disabled={saving}
                      className="cursor-pointer rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      กลับ
                    </button>
                    <button
                      type="button"
                      onClick={closeModal}
                      disabled={saving}
                      className="cursor-pointer rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      disabled={
                        saving ||
                        !name.trim() ||
                        (!brandLocked && brands.length > 0 && !brandId) ||
                        !operatingMode
                      }
                      className="cursor-pointer rounded-xl bg-site-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-site-primary-hover hover:shadow active:bg-site-primary-active disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving ? "กำลังบันทึก..." : "สร้างสาขา"}
                    </button>
                  </>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
