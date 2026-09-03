"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  OwnerAppShell,
  useOwnerDashboard,
} from "@/components/owner/OwnerAppShell";
import { logout } from "@/components/LoginForm";
import { IconChevronRight, IconLogout } from "@/components/icons";
import {
  OwnerAccountCards,
  OwnerShopMenuSection,
  buildOwnerShopLinks,
  type OwnerBranchTask,
} from "@/components/owner/OwnerShopHub";
import { OwnerBrandProfileSetupModal } from "@/components/owner/OwnerBrandProfileSetupModal";
import { OwnerAccountModal } from "@/components/owner/OwnerAccountModal";
import { OwnerBranchesManageModal } from "@/components/owner/OwnerBranchesManageModal";
import { OwnerBranchTaskModal } from "@/components/owner/OwnerBranchTaskModal";
import { OwnerNotificationSettings } from "@/components/owner/OwnerNotificationSettings";
import { PlatformSupportCard } from "@/components/PlatformSupportCard";

function OwnerSettingsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, reload } = useOwnerDashboard();
  const brandName = data?.brand?.nameTh || data?.brand?.name || "ร้านค้า";
  const brandId = data?.brand?.id;
  const subscription = data?.subscription ?? null;
  const liveBranches = (data?.branches ?? []).filter(
    (b) => !b.isTest && b.kind !== "WAREHOUSE",
  );
  /** สาขาที่จัดการได้จากเมนูตั้งค่า — รวมสาขาทดลอง ไม่รวมคลัง */
  const manageBranches = (data?.branches ?? []).filter(
    (b) => b.kind !== "WAREHOUSE",
  );
  const firstBranchId =
    liveBranches[0]?.id ?? manageBranches[0]?.id ?? null;
  const [brandProfileOpen, setBrandProfileOpen] = useState(false);
  const [ownerAccountOpen, setOwnerAccountOpen] = useState(false);
  const [manageBranchesOpen, setManageBranchesOpen] = useState(false);
  const [branchTask, setBranchTask] = useState<{
    task: OwnerBranchTask;
    branchId: string;
  } | null>(null);

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

  const taskBranchName = useMemo(() => {
    if (!branchTask) return "";
    return (
      manageBranches.find((b) => b.id === branchTask.branchId)?.name ??
      data?.branches.find((b) => b.id === branchTask.branchId)?.name ??
      "สาขา"
    );
  }, [branchTask, manageBranches, data?.branches]);

  useEffect(() => {
    if (searchParams.get("manageBranches") !== "1") return;
    setManageBranchesOpen(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("manageBranches");
    const qs = params.toString();
    router.replace(qs ? `/owner/settings?${qs}` : "/owner/settings", {
      scroll: false,
    });
  }, [searchParams, router]);

  function openBranchTask(task: OwnerBranchTask, branchId: string) {
    setManageBranchesOpen(false);
    setBranchTask({ task, branchId });
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
                  ดูบัญชีและติดต่อแอดมิน
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
        branches={manageBranches.map((b) => ({
          id: b.id,
          name: b.name,
          isOpen: b.isOpen,
          isTest: b.isTest,
        }))}
        onManageBranchesClick={() => setManageBranchesOpen(true)}
        onOpenBranchTask={openBranchTask}
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
        onClick={() => logout()}
        className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-4 text-[15px] font-extrabold text-red-600 shadow-sm"
      >
        <IconLogout size={20} />
        ออกจากระบบ
      </button>

      <PlatformSupportCard />

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
          <OwnerBranchesManageModal
            brandId={brandId}
            open={manageBranchesOpen}
            onClose={() => setManageBranchesOpen(false)}
            onChanged={() => reload()}
            onOpenBranchSettings={(id) =>
              openBranchTask("branchSettings", id)
            }
          />
          {branchTask ? (
            <OwnerBranchTaskModal
              open
              branchId={branchTask.branchId}
              branchName={taskBranchName}
              task={branchTask.task}
              onClose={() => {
                setBranchTask(null);
                reload();
              }}
            />
          ) : null}
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
