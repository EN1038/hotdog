"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
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

export type DashboardBrand = {
  id: string;
  name: string;
  code: string;
  color?: string;
};

type Branch = {
  id: string;
  name: string;
  code: string | null;
  imageUrl: string | null;
  brand: DashboardBrand | null;
  _count?: {
    staff: number;
    menuItems: number;
    deliveryLocations: number;
    orders: number;
  };
};

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
  defaultBrandId: string;
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

export function BranchListDashboard({
  lockedBrandId,
  brandMeta = null,
  title = "แดชบอร์ดสาขา",
  description = "จัดการสาขาและรูปหน้าร้านที่ใช้แสดงฝั่งลูกค้า",
  backHref,
  backLabel = "กลับ",
  headerActions,
}: BranchListDashboardProps) {
  const router = useRouter();
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
      defaultBrandId,
    };
  }

  function openModal() {
    resetFormState(formSetters());
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
    setError(null);
    setSaving(true);
    try {
      const resolvedBrandId = effectiveLockedBrandId || brandId || null;
      const autoCode = slugifyCode(name);
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

      <AdminPageHeader
        title={title}
        description={description}
        actions={
          <>
            {headerActions}
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 shadow-sm">
              {branches.length} สาขา
            </span>
            <button type="button" onClick={openModal} className={btnPrimaryXl}>
              <IconPlus size={16} />
              เพิ่มสาขา
            </button>
          </>
        }
      />

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
              const chipStyle = {
                backgroundColor: rgba(brandColor, 0.14),
                color: brandColor,
              };
              return (
                <Link
                  key={branch.id}
                  href={`/admin/branches/${branch.id}`}
                  className="group overflow-hidden rounded-2xl border border-slate-200 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  style={{
                    borderColor: rgba(brandColor, 0.35),
                    background: `linear-gradient(to bottom right, ${rgba(brandColor, 0.12)}, #ffffff)`,
                  }}
                >
                  <div className="relative aspect-[16/10] bg-white/60">
                    {branch.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={branch.imageUrl}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div
                        className="absolute inset-0 flex flex-col items-center justify-center gap-2"
                        style={{
                          background: `linear-gradient(to bottom right, ${rgba(brandColor, 0.22)}, ${rgba(brandColor, 0.06)})`,
                          color: rgba(brandColor, 0.55),
                        }}
                      >
                        <IconStore size={28} />
                        <span className="text-xs">ยังไม่มีรูป</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-start justify-between gap-2 p-3 sm:p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900 sm:text-base">
                        {branch.name}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500 sm:text-sm">
                        {branch.brand?.name ?? selectedBrand?.name ?? "ไม่มีแบรนด์"}
                        {branch.code &&
                          ` · /${branch.brand?.code ?? selectedBrand?.code ?? "?"}/${branch.code}`}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1 sm:mt-3 sm:gap-1.5">
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
                      </div>
                    </div>
                    <span
                      className="mt-0.5 shrink-0 opacity-60 transition group-hover:opacity-100"
                      style={{ color: brandColor }}
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
                  {selectedBrand
                    ? `ภายใต้แบรนด์ ${selectedBrand.name}`
                    : "อัปโหลดรูปจากเครื่อง หรือวางลิงก์รูปได้"}
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
                          onChange={(e) => setBrandId(e.target.value)}
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
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4">
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
                    (!brandLocked && brands.length > 0 && !brandId)
                  }
                  className="cursor-pointer rounded-xl bg-site-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-site-primary-hover hover:shadow active:bg-site-primary-active disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "กำลังบันทึก..." : "สร้างสาขา"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
