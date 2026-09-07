"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  adminInputClass,
  adminLabelClass,
} from "@/components/admin/AdminShell";
import { IconClose, IconChevronRight, IconPlus } from "@/components/icons";
import { IconLine } from "@/components/owner/owner-register-ui";
import { useToast } from "@/components/admin/Toast";
import { branchAdminBasePath } from "@/lib/branch-admin-path";
import {
  allowedOperatingModesForBrand,
  BRANCH_OPERATING_MODES,
  type BranchOperatingModeId,
} from "@/lib/branch-operating-mode";
import { defaultWeeklyHours } from "@/lib/branch-hours";
import { slugifyCode } from "@/lib/slug";
import { PLATFORM_LINE_ADD_URL } from "@/lib/platform-support";

type BranchRow = {
  id: string;
  name: string;
  isOpen?: boolean;
  isTest?: boolean;
  kind?: string | null;
  isHidden?: boolean;
};

type BrandInfo = {
  id: string;
  name: string;
  maxBranches?: number;
  bbqEnabled?: boolean;
  skewerEnabled?: boolean;
  plan?: string;
};

type OwnerBranchesManageModalProps = {
  brandId: string;
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
  /** เปิด modal ตั้งค่าโปรไฟล์สาขา (แทนการ navigate) */
  onOpenBranchSettings?: (branchId: string) => void;
};

export function OwnerBranchesManageModal({
  brandId,
  open,
  onClose,
  onChanged,
  onOpenBranchSettings,
}: OwnerBranchesManageModalProps) {
  const toast = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [brand, setBrand] = useState<BrandInfo | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [operatingMode, setOperatingMode] =
    useState<BranchOperatingModeId>("NORMAL");

  const availableModes = useMemo(
    () => allowedOperatingModesForBrand(brand),
    [brand],
  );
  const availableModeSet = useMemo(
    () => new Set(availableModes),
    [availableModes],
  );

  const visibleBranches = useMemo(
    () =>
      branches.filter(
        (b) => b.kind !== "WAREHOUSE" && !b.isHidden,
      ),
    [branches],
  );

  const branchCount = visibleBranches.length;
  const maxBranches =
    typeof brand?.maxBranches === "number" ? brand.maxBranches : null;
  const atBranchLimit = maxBranches != null && branchCount >= maxBranches;

  useEffect(() => {
    if (!open || !brandId) return;
    let cancelled = false;
    setLoading(true);
    setAdding(false);
    setName("");
    setOperatingMode("NORMAL");

    void (async () => {
      try {
        const [branchRes, brandRes] = await Promise.all([
          fetch(
            `/api/admin/branches?brandId=${encodeURIComponent(brandId)}`,
          ),
          fetch(`/api/admin/brands/${brandId}`),
        ]);
        if (!branchRes.ok || !brandRes.ok) {
          if (!cancelled) {
            toast.error("โหลดไม่สำเร็จ", "ลองใหม่อีกครั้ง");
            setLoading(false);
          }
          return;
        }
        const branchJson = (await branchRes.json()) as BranchRow[];
        const brandJson = (await brandRes.json()) as BrandInfo;
        if (cancelled) return;
        setBranches(Array.isArray(branchJson) ? branchJson : []);
        setBrand(brandJson);
        const modes = allowedOperatingModesForBrand(brandJson);
        setOperatingMode(modes[0] ?? "NORMAL");
      } catch {
        if (!cancelled) {
          toast.error("โหลดไม่สำเร็จ", "เชื่อมต่อไม่ได้");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast is stable enough
  }, [open, brandId]);

  async function createBranch() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("สร้างไม่สำเร็จ", "กรุณาใส่ชื่อสาขา");
      return;
    }
    if (atBranchLimit) {
      toast.error(
        "สร้างไม่สำเร็จ",
        maxBranches != null
          ? `แพ็กนี้เปิดสาขาได้สูงสุด ${maxBranches} สาขา`
          : "โควต้าสาขาเต็มแล้ว",
      );
      return;
    }
    if (!operatingMode || !availableModeSet.has(operatingMode)) {
      toast.error("สร้างไม่สำเร็จ", "เลือกโหมดร้านที่แพ็กเกจรองรับ");
      return;
    }

    setSaving(true);
    try {
      const hours = defaultWeeklyHours();
      const res = await fetch("/api/admin/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          brandId,
          code: slugifyCode(trimmed) || null,
          operatingMode,
          weighSalesEnabled:
            operatingMode === "NORMAL" &&
            Boolean(brand?.bbqEnabled) &&
            (brand?.plan === "MALA" ||
              brand?.plan === "MULTI" ||
              brand?.plan === "WEIGH_TABLE"),
          storefrontHours: hours,
          deliveryHours: hours,
          isTest: false,
          isOpen: false,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          "สร้างไม่สำเร็จ",
          typeof data.error === "string" ? data.error : "ลองใหม่อีกครั้ง",
        );
        return;
      }
      setBranches((prev) => [data as BranchRow, ...prev]);
      setAdding(false);
      setName("");
      toast.success("สร้างสาขาแล้ว", data.name ?? trimmed);
      onChanged?.();
    } catch {
      toast.error("สร้างไม่สำเร็จ", "เชื่อมต่อไม่ได้");
    } finally {
      setSaving(false);
    }
  }

  /** กดสาขา = ตั้งค่าโปรไฟล์สาขา (เวลาเปิดปิดอยู่เมนูแยก) */
  function openBranchSettings(branchId: string) {
    onClose();
    if (onOpenBranchSettings) {
      onOpenBranchSettings(branchId);
      return;
    }
    router.push(
      `${branchAdminBasePath(branchId, { ownerShell: true })}?tab=settings&focus=1&section=branch`,
    );
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="ปิด"
        className="absolute inset-0 bg-black/45"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="owner-branches-manage-title"
        className="relative z-10 flex max-h-[min(92dvh,40rem)] w-full max-w-md flex-col overflow-hidden rounded-t-[1.75rem] bg-white shadow-2xl sm:mx-4 sm:rounded-[1.75rem]"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="min-w-0">
            <p
              id="owner-branches-manage-title"
              className="text-[17px] font-extrabold text-slate-900"
            >
              {adding ? "เพิ่มสาขา" : "จัดการสาขา"}
            </p>
            <p className="mt-0.5 text-[12px] text-slate-500">
              {adding
                ? "สร้างสาขาใหม่"
                : maxBranches != null
                  ? `${branchCount}/${maxBranches} · กดสาขาเพื่อตั้งค่า`
                  : `${branchCount} · กดสาขาเพื่อตั้งค่า`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (adding) {
                setAdding(false);
                setName("");
                return;
              }
              onClose();
            }}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 active:bg-slate-200"
            aria-label="ปิด"
          >
            <IconClose size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <p className="py-10 text-center text-sm text-slate-500">
              กำลังโหลด…
            </p>
          ) : adding ? (
            <div className="space-y-4 pb-2">
              <div>
                <label className={adminLabelClass}>ชื่อสาขา</label>
                <input
                  className={adminInputClass}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="เช่น สาขาหลัก"
                  autoFocus
                />
              </div>

              <div>
                <p className={adminLabelClass}>โหมดร้าน</p>
                <div className="mt-2 space-y-2">
                  {BRANCH_OPERATING_MODES.map((mode) => {
                    const title =
                      mode === "NORMAL"
                        ? "คิวเคาน์เตอร์"
                        : mode === "SKEWER"
                          ? "เสียบไม้"
                          : "ชั่งโต๊ะ";
                    const allowed = availableModeSet.has(mode);
                    const selected = operatingMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        disabled={!allowed}
                        onClick={() => {
                          if (!allowed) return;
                          setOperatingMode(mode);
                        }}
                        className={`flex min-h-[3.25rem] w-full items-center justify-between gap-2 rounded-2xl border px-4 py-3 text-left ${
                          !allowed
                            ? "cursor-not-allowed border-slate-100 bg-slate-50 opacity-70"
                            : selected
                              ? "border-site-primary bg-site-primary-banner"
                              : "border-slate-200 bg-white"
                        }`}
                      >
                        <p
                          className={`text-[15px] font-extrabold ${
                            allowed ? "text-slate-900" : "text-slate-500"
                          }`}
                        >
                          {title}
                        </p>
                        {!allowed ? (
                          <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                            แพ็กเกจอื่น
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              {atBranchLimit ? (
                <p className="rounded-xl bg-slate-50 px-3 py-2 text-[13px] font-medium text-slate-600">
                  ใช้ครบจำนวนสาขาของแพ็กเกจแล้ว ติดต่อแอดมินเพื่อขอเพิ่ม
                </p>
              ) : null}

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setAdding(false);
                    setName("");
                  }}
                  className="min-h-12 flex-1 rounded-2xl bg-slate-100 text-[15px] font-bold text-slate-700 active:bg-slate-200 disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  disabled={saving || !name.trim() || atBranchLimit}
                  onClick={() => void createBranch()}
                  className="min-h-12 flex-1 rounded-2xl bg-site-primary text-[15px] font-bold text-white active:bg-site-primary-active disabled:opacity-50"
                >
                  {saving ? "กำลังสร้าง…" : "สร้างสาขา"}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 pb-2">
              {visibleBranches.length === 0 ? (
                <p className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  ยังไม่มีสาขา กดเพิ่มสาขาเพื่อเริ่มใช้งาน
                </p>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-100">
                  {visibleBranches.map((branch, index) => (
                    <button
                      key={branch.id}
                      type="button"
                      onClick={() => openBranchSettings(branch.id)}
                      className={`flex min-h-[3.75rem] w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-slate-50 ${
                        index > 0 ? "border-t border-slate-100" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-extrabold text-slate-900">
                          {branch.name}
                        </p>
                        <p className="mt-0.5 text-[12px] font-medium text-slate-500">
                          {branch.isOpen ? "เปิดอยู่" : "ปิดร้าน"}
                          {branch.isTest ? " · ทดลอง" : ""}
                          {" · ตั้งค่าสาขา"}
                        </p>
                      </div>
                      <IconChevronRight
                        size={18}
                        className="shrink-0 text-slate-300"
                        aria-hidden
                      />
                    </button>
                  ))}
                </div>
              )}

              {atBranchLimit ? (
                <div className="space-y-2">
                  <p className="text-center text-[13px] leading-relaxed text-slate-500">
                    ใช้ครบจำนวนสาขาของแพ็กเกจแล้ว
                    ติดต่อแอดมินเพื่อขอเพิ่มสาขา
                  </p>
                  <a
                    href={PLATFORM_LINE_ADD_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#06C755] px-4 text-[15px] font-extrabold text-white active:brightness-95"
                  >
                    <IconLine className="h-5 w-5 shrink-0" />
                    ติดต่อแอดมินทาง LINE
                  </a>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-site-primary/40 bg-site-primary-banner text-[15px] font-bold text-site-primary active:bg-site-primary-soft"
                >
                  <IconPlus size={18} />
                  เพิ่มสาขา
                </button>
              )}
            </div>
          )}
        </div>

        {!adding ? (
          <div className="shrink-0 border-t border-slate-100 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={onClose}
              aria-label="ปิด"
              className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-slate-900 text-white active:bg-slate-800"
            >
              <IconClose size={18} />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
