"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  adminInputClass,
  adminLabelClass,
  btnOutline,
  btnPrimaryXl,
} from "@/components/admin/AdminShell";
import { ImageField } from "@/components/admin/ImageField";
import { BranchLocationPicker } from "@/components/admin/BranchLocationPicker";
import { BranchHoursEditor } from "@/components/admin/BranchHoursEditor";
import {
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

type Brand = { id: string; name: string; code: string; color?: string };

type Branch = {
  id: string;
  name: string;
  code: string | null;
  imageUrl: string | null;
  brand: Brand | null;
  _count: {
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
}) {
  setters.setName("");
  setters.setBrandId("");
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

export default function AdminDashboard() {
  const router = useRouter();
  const titleId = useId();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [brandId, setBrandId] = useState("");
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

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/branches"),
      fetch("/api/admin/brands"),
    ]).then(async ([branchRes, brandRes]) => {
      if (branchRes.status === 401) {
        router.push("/admin/login");
        return;
      }
      if (branchRes.ok) setBranches(await branchRes.json());
      if (brandRes.ok) setBrands(await brandRes.json());
      setLoading(false);
    });
  }, [router]);

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
      const autoCode = slugifyCode(name);
      const res = await fetch("/api/admin/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          brandId: brandId || null,
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้างสาขาไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-gray-500">กำลังโหลด...</p>;
  }

  const selectedBrand = brands.find((b) => b.id === brandId);
  const previewCode = code || slugifyCode(name) || "…";

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">แดชบอร์ดสาขา</h2>
          <p className="mt-1 text-sm text-gray-500">
            จัดการสาขาและรูปหน้าร้านที่ใช้แสดงฝั่งลูกค้า
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="rounded-full bg-white px-3 py-1 text-sm text-gray-600 ring-1 ring-gray-200">
            {branches.length} สาขา
          </p>
          <button
            type="button"
            onClick={openModal}
            className={btnPrimaryXl}
          >
            <IconPlus size={16} />
            เพิ่มสาขา
          </button>
        </div>
      </div>

      <section className="mt-6">
        {branches.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
              <IconStore size={22} />
            </span>
            <p className="mt-3 font-medium text-gray-800">ยังไม่มีสาขา</p>
            <p className="mt-1 text-sm text-gray-500">
              กด “เพิ่มสาขา” เพื่อสร้างสาขาแรก
            </p>
            <button
              type="button"
              onClick={openModal}
              className={`mt-4 ${btnPrimaryXl}`}
            >
              <IconPlus size={16} />
              เพิ่มสาขา
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {branches.map((branch) => {
              const brandColor =
                branch.brand?.color || DEFAULT_BRAND_COLOR;
              const chipStyle = {
                backgroundColor: rgba(brandColor, 0.14),
                color: brandColor,
              };
              return (
                <Link
                  key={branch.id}
                  href={`/admin/branches/${branch.id}`}
                  className="group overflow-hidden rounded-2xl border shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
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
                      <p className="truncate text-sm font-semibold text-gray-900 sm:text-base">
                        {branch.name}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-gray-500 sm:text-sm">
                        {branch.brand?.name ?? "ไม่มีแบรนด์"}
                        {branch.code &&
                          ` · /${branch.brand?.code ?? "?"}/${branch.code}`}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1 sm:mt-3 sm:gap-1.5">
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-medium sm:text-[11px]"
                          style={chipStyle}
                        >
                          เมนู {branch._count.menuItems}
                        </span>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-medium sm:text-[11px]"
                          style={chipStyle}
                        >
                          ส่ง {branch._count.deliveryLocations}
                        </span>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-medium sm:text-[11px]"
                          style={chipStyle}
                        >
                          ออเดอร์ {branch._count.orders}
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
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 bg-gradient-to-r from-red-50 via-white to-orange-50 px-5 py-4">
              <div>
                <h3 id={titleId} className="font-semibold text-gray-900">
                  เพิ่มสาขาใหม่
                </h3>
                <p className="mt-0.5 text-sm text-gray-500">
                  อัปโหลดรูปจากเครื่อง หรือวางลิงก์รูปได้
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="rounded-lg p-1.5 text-gray-500 hover:bg-white/80 disabled:opacity-50"
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
                    aspectClassName="aspect-[4/3]"
                    size="compact"
                  />

                  <div className="grid gap-4 content-start">
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
                    <div>
                      <label className={adminLabelClass}>แบรนด์</label>
                      <select
                        className={adminInputClass}
                        value={brandId}
                        onChange={(e) => setBrandId(e.target.value)}
                      >
                        <option value="">— ไม่ระบุ —</option>
                        {brands.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </div>
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
                            className="text-xs text-gray-500 hover:text-gray-800"
                          >
                            แก้เอง
                          </button>
                        )}
                      </div>
                      <input
                        className={`${adminInputClass} ${
                          codeManual ? "" : "bg-gray-50 text-gray-600"
                        }`}
                        value={code}
                        onChange={(e) => {
                          setCodeManual(true);
                          setCode(slugifyCode(e.target.value) || e.target.value);
                        }}
                        readOnly={!codeManual}
                        placeholder="สร้างอัตโนมัติจากชื่อ"
                      />
                      <p className="mt-1 text-xs text-gray-400">
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

                <div className="mt-6 space-y-6 border-t border-gray-100 pt-6">
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

              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-100 bg-gray-50 px-5 py-4">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="rounded-xl px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-white hover:text-gray-900 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saving || !name.trim()}
                  className="cursor-pointer rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 hover:shadow active:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
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
