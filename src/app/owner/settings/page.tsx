"use client";

import { useEffect, useMemo, useState } from "react";
import {
  OwnerAppShell,
  useOwnerDashboard,
} from "@/components/owner/OwnerAppShell";
import { logout } from "@/components/LoginForm";
import { IconLogout } from "@/components/icons";
import { BrandColorPicker } from "@/components/BrandColorPicker";
import { PlatformSupportCard } from "@/components/PlatformSupportCard";
import {
  OwnerAccountCards,
  OwnerShopMenuSection,
  buildOwnerShopLinks,
} from "@/components/owner/OwnerShopHub";
import {
  DEFAULT_BRAND_COLOR,
  normalizePrimaryColor,
} from "@/lib/color";
import {
  enterOwnerStaffMode,
  type OwnerEnterStaffBranch,
} from "@/lib/owner-enter-staff";
import {
  clearSkipAutoShopFloor,
  getOwnerStartPreference,
  OWNER_START_LABELS,
  setOwnerStartPreference,
  type OwnerStartPreference,
} from "@/lib/owner-sole-start";
import { useToast } from "@/components/admin/Toast";
import { OwnerNotificationSettings } from "@/components/owner/OwnerNotificationSettings";

function OwnerSettingsInner() {
  const toast = useToast();
  const { data, reload } = useOwnerDashboard();
  const brandName = data?.brand?.nameTh || data?.brand?.name || "ร้านค้า";
  const brandId = data?.brand?.id;
  const subscription = data?.subscription ?? null;
  const liveBranches = (data?.branches ?? []).filter(
    (b) => !b.isTest && b.kind !== "WAREHOUSE",
  );
  const firstBranchId = liveBranches[0]?.id ?? data?.branches[0]?.id ?? null;
  const [color, setColor] = useState(DEFAULT_BRAND_COLOR);
  const [saving, setSaving] = useState(false);
  const [enteringStaff, setEnteringStaff] = useState(false);
  const [staffBranches, setStaffBranches] = useState<OwnerEnterStaffBranch[] | null>(
    null,
  );
  const [startPref, setStartPref] = useState<OwnerStartPreference>("auto");

  const shopLinks = useMemo(
    () =>
      brandId
        ? buildOwnerShopLinks({
            brandId,
            firstBranchId,
            stockEnabled: Boolean(
              subscription?.stockEnabled ?? data?.stockEnabled,
            ),
            kitchenEnabled: Boolean(subscription?.kitchenEnabled),
            bbqEnabled: Boolean(subscription?.bbqEnabled),
          })
        : [],
    [
      brandId,
      firstBranchId,
      subscription?.stockEnabled,
      subscription?.kitchenEnabled,
      subscription?.bbqEnabled,
      data?.stockEnabled,
    ],
  );

  useEffect(() => {
    if (data?.brand?.color) {
      setColor(normalizePrimaryColor(data.brand.color, DEFAULT_BRAND_COLOR));
    }
  }, [data?.brand?.color]);

  useEffect(() => {
    setStartPref(getOwnerStartPreference());
  }, []);

  async function saveColor(next: string) {
    if (!brandId) return;
    const normalized = normalizePrimaryColor(next, DEFAULT_BRAND_COLOR);
    setColor(normalized);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/brands/${brandId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color: normalized }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error("บันทึกสีไม่สำเร็จ", err.error ?? "ลองใหม่อีกครั้ง");
        return;
      }
      document.documentElement.style.setProperty("--site-primary", normalized);
      toast.success("บันทึกสีแล้ว", "ธีมร้านอัปเดตแล้ว");
      reload();
    } catch {
      toast.error("บันทึกสีไม่สำเร็จ", "เชื่อมต่อไม่ได้");
    } finally {
      setSaving(false);
    }
  }

  async function goSell(branchId?: string) {
    if (enteringStaff) return;
    if (data?.subscription?.writeAllowed === false) {
      toast.error(
        "แพ็กเกจหมดอายุ",
        data.subscription.writeBlockedReason ??
          "ยังดูข้อมูลได้ แต่สร้างรายการใหม่ไม่ได้",
      );
      return;
    }
    setEnteringStaff(true);
    try {
      const result = await enterOwnerStaffMode(branchId);
      if (!result.ok) {
        toast.error("เข้าโหมดขายไม่สำเร็จ", result.error);
        return;
      }
      if ("needsBranchSelect" in result && result.needsBranchSelect) {
        setStaffBranches(result.branches);
        return;
      }
      window.location.assign("/staff/key-order/regular");
    } catch {
      toast.error("เข้าโหมดขายไม่สำเร็จ", "เชื่อมต่อไม่ได้");
    } finally {
      setEnteringStaff(false);
    }
  }

  function saveStartPref(next: OwnerStartPreference) {
    setOwnerStartPreference(next);
    setStartPref(next);
    if (next !== "office") clearSkipAutoShopFloor();
    toast.success("บันทึกแล้ว", OWNER_START_LABELS[next]);
  }

  return (
    <div className="space-y-3 px-4 pb-6 pt-4">
      <div className="rounded-3xl bg-white px-4 py-5 shadow-sm">
        <p className="text-[13px] font-semibold text-slate-400">ร้านที่ใช้งาน</p>
        <p className="mt-1 text-[20px] font-black text-slate-900">{brandName}</p>
        {data?.soleOperator ? (
          <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-[13px] font-semibold text-emerald-900">
            แม่ค้าคนเดียว · สาขาเดียว — แนะนำเริ่มที่หน้าร้าน
          </p>
        ) : null}
      </div>

      <div className="rounded-3xl bg-white px-4 py-5 shadow-sm">
        <p className="text-[17px] font-extrabold text-slate-900">เริ่มใช้งานวันละ</p>
        <p className="mt-1 text-[13px] text-slate-500">
          ลดการสลับหน้า — ล็อกอินแล้วไปหน้าร้านขายเลยได้
        </p>
        <div className="mt-3 space-y-2">
          {(
            ["auto", "shop", "office"] as const satisfies readonly OwnerStartPreference[]
          ).map((option) => {
            const active = startPref === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => saveStartPref(option)}
                className={`flex w-full rounded-2xl border px-4 py-3 text-left text-[14px] font-bold ${
                  active
                    ? "border-site-primary bg-site-primary/10 text-site-primary"
                    : "border-slate-200 bg-slate-50 text-slate-800"
                }`}
              >
                {OWNER_START_LABELS[option]}
              </button>
            );
          })}
        </div>
      </div>

      <OwnerNotificationSettings />

      <div className="rounded-3xl bg-white px-4 py-5 shadow-sm">
        <p className="text-[17px] font-extrabold text-slate-900">สีธีมร้าน</p>
        <p className="mt-1 text-[13px] text-slate-500">
          ใช้กับหน้าพนักงาน หน้าเจ้าของร้าน และปุ่มหลักของแบรนด์
        </p>
        <div className="mt-4">
          <BrandColorPicker
            value={color}
            onChange={(next) => void saveColor(next)}
            disabled={saving || !brandId}
          />
        </div>
        <div
          className="mt-4 overflow-hidden rounded-2xl bg-site-primary px-4 py-3 text-white"
          aria-hidden
        >
          <p className="text-xs font-medium text-white/80">ตัวอย่างหัวหน้า</p>
          <p className="text-base font-black">{brandName}</p>
        </div>
      </div>

      <OwnerShopMenuSection
        links={shopLinks}
        title="ร้าน"
        subtitle="จัดการเหมือนแอดมินแบรนด์"
      />

      {brandId ? (
        <OwnerAccountCards
          brandId={brandId}
          brandName={brandName}
          subscription={subscription}
        />
      ) : null}

      <button
        type="button"
        disabled={enteringStaff || data?.subscription?.writeAllowed === false}
        onClick={() => void goSell()}
        className="flex min-h-[4.5rem] w-full items-center justify-between gap-3 rounded-2xl bg-white px-4 py-4 text-left shadow-sm active:scale-[0.99] disabled:opacity-60"
      >
        <div className="min-w-0">
          <p className="text-[16px] font-extrabold text-slate-900">
            {enteringStaff ? "กำลังเข้า…" : "ขายหน้าร้าน"}
          </p>
          <p className="mt-1 text-[13px] text-slate-500">
            {data?.subscription?.writeAllowed === false
              ? (data.subscription.writeBlockedReason ??
                "แพ็กเกจหมดอายุชั่วคราว")
              : "เข้าคีย์ออเดอร์ทันที · กด「บัญชีร้าน」เมื่อต้องจัดการแพ็กเกจ"}
          </p>
        </div>
        <span className="text-xl text-slate-300">›</span>
      </button>

      {staffBranches ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
          <div className="w-full max-w-md rounded-3xl bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-base font-bold text-slate-900">เลือกสาขาที่จะขาย</p>
              <button
                type="button"
                onClick={() => setStaffBranches(null)}
                className="rounded-full px-3 py-1.5 text-sm font-medium text-slate-500"
              >
                ปิด
              </button>
            </div>
            <div className="space-y-2">
              {staffBranches.map((b) => (
                <button
                  key={b.branchId}
                  type="button"
                  disabled={enteringStaff || data?.subscription?.writeAllowed === false}
                  onClick={() => void goSell(b.branchId)}
                  className="flex w-full items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-left"
                >
                  <span className="truncate font-semibold text-slate-900">
                    {b.branchName}
                  </span>
                  <span className="text-sm font-bold text-site-primary">ขาย →</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <PlatformSupportCard />

      <button
        type="button"
        onClick={() => logout("/owner/login")}
        className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-4 text-[15px] font-extrabold text-red-600 shadow-sm"
      >
        <IconLogout size={20} />
        ออกจากระบบ
      </button>
    </div>
  );
}

export default function OwnerSettingsPage() {
  return (
    <OwnerAppShell active="settings">
      <OwnerSettingsInner />
    </OwnerAppShell>
  );
}
