"use client";

import { useMemo, useState } from "react";
import {
  OwnerAppShell,
  useOwnerDashboard,
} from "@/components/owner/OwnerAppShell";
import { logout } from "@/components/LoginForm";
import { IconChevronRight, IconLinkSuffix, IconLogout } from "@/components/icons";
import {
  OwnerAccountCards,
  OwnerShopMenuSection,
  buildOwnerShopLinks,
} from "@/components/owner/OwnerShopHub";
import { OwnerBrandProfileSetupModal } from "@/components/owner/OwnerBrandProfileSetupModal";
import { OwnerAccountModal } from "@/components/owner/OwnerAccountModal";
import {
  enterOwnerStaffMode,
  type OwnerEnterStaffBranch,
} from "@/lib/owner-enter-staff";
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
  const [enteringStaff, setEnteringStaff] = useState(false);
  const [staffBranches, setStaffBranches] = useState<OwnerEnterStaffBranch[] | null>(
    null,
  );
  const [brandProfileOpen, setBrandProfileOpen] = useState(false);
  const [ownerAccountOpen, setOwnerAccountOpen] = useState(false);

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
            forSettings: true,
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

  return (
    <div className="space-y-3 px-4 pb-6 pt-4">
      <div className="overflow-hidden rounded-3xl bg-white shadow-sm">
        <div className="px-4 py-5">
          <p className="text-[13px] font-semibold text-slate-400">ร้านที่ใช้งาน</p>
          <p className="mt-1 text-[20px] font-black text-slate-900">{brandName}</p>
        </div>

        {brandId ? (
          <div className="border-t border-slate-100">
            <button
              type="button"
              onClick={() => setBrandProfileOpen(true)}
              className="flex min-h-[3.75rem] w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left active:bg-slate-50"
            >
              <div className="min-w-0">
                <p className="text-[15px] font-extrabold text-slate-900">
                  โปรไฟล์แบรนด์
                </p>
                <p className="mt-0.5 text-[12px] font-medium text-slate-500">
                  ชื่อ โลโก้ และรูปปกของ {brandName}
                </p>
              </div>
              <IconChevronRight size={18} className="text-slate-300" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setOwnerAccountOpen(true)}
              className="flex min-h-[3.75rem] w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-slate-50"
            >
              <div className="min-w-0">
                <p className="text-[15px] font-extrabold text-slate-900">
                  บัญชีเจ้าของ
                </p>
                <p className="mt-0.5 text-[12px] font-medium text-slate-500">
                  ชื่อเข้าสู่ระบบและสิทธิ์ดูแลร้าน
                </p>
              </div>
              <IconChevronRight size={18} className="text-slate-300" aria-hidden />
            </button>
          </div>
        ) : null}
      </div>

      <OwnerShopMenuSection
        links={shopLinks}
        title="ร้าน"
        subtitle="จัดการเหมือนแอดมินแบรนด์"
      />

      <OwnerNotificationSettings />

      {brandId ? (
        <OwnerAccountCards
          brandId={brandId}
          brandName={brandName}
          subscription={subscription}
          smsQuota={data?.smsQuota ?? null}
          hideSmsQuota
          hideSupport
          hideProfileLinks
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
              : "เข้าคีย์ออเดอร์ทันที กดบัญชีร้านเมื่อต้องจัดการแพ็กเกจ"}
          </p>
        </div>
        <IconChevronRight size={20} className="text-slate-300" aria-hidden />
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
                  <IconLinkSuffix size={14} className="text-sm font-bold text-site-primary">
                    ขาย
                  </IconLinkSuffix>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => logout()}
        className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-4 text-[15px] font-extrabold text-red-600 shadow-sm"
      >
        <IconLogout size={20} />
        ออกจากระบบ
      </button>

      {brandId ? (
        <>
          <OwnerBrandProfileSetupModal
            brandId={brandId}
            open={brandProfileOpen}
            mode="settings"
            onClose={() => setBrandProfileOpen(false)}
            onSaved={() => reload()}
          />
          <OwnerAccountModal
            brandId={brandId}
            open={ownerAccountOpen}
            onClose={() => setOwnerAccountOpen(false)}
          />
        </>
      ) : null}
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
