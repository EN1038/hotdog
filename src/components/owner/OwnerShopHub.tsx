"use client";

import Link from "next/link";
import { useState } from "react";
import type { OwnerSubscriptionInfo } from "@/lib/owner-dashboard";
import type { BrandSmsQuotaSnapshot } from "@/lib/brand-sms-quota";
import { OwnerSmsQuotaCard } from "@/components/owner/OwnerSmsQuotaCard";
import { OwnerBillingModal } from "@/components/owner/OwnerBillingModal";
import {
  enterOwnerStaffMode,
  type OwnerEnterStaffBranch,
} from "@/lib/owner-enter-staff";
import { useToast } from "@/components/admin/Toast";
import { PlatformSupportCard } from "@/components/PlatformSupportCard";
import { branchAdminBasePath } from "@/lib/branch-admin-path";
import { IconChevronRight, IconClose, IconLinkSuffix } from "@/components/icons";
import { PAR_STOCK_LABEL, PAR_STOCK_SHORT_LABEL } from "@/lib/inventory/inventory-par-labels";

function formatDateLabel(iso: string | null) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

export type OwnerBranchTask =
  | "menu"
  | "staff"
  | "hours"
  | "branchSettings";

export type OwnerShopLink = {
  href: string;
  label: string;
  hint: string;
  /** เข้าโหมดหน้าร้านก่อน แล้วไปที่ href นี้ (เมนูเดียวกับพนักงาน) */
  enterStaff?: boolean;
  /** เปิด modal จัดการสาขาบนมือถือ */
  manageBranches?: boolean;
  /** เลือกสาขาแล้วเปิดงานของสาขานั้น (เมนู / พนักงาน / เวลา) */
  pickBranchTask?: OwnerBranchTask;
};

export type OwnerShopBranchOption = {
  id: string;
  name: string;
  isOpen?: boolean;
  isTest?: boolean;
};

export function ownerBranchTaskHref(
  branchId: string,
  task: OwnerBranchTask,
): string {
  const base = branchAdminBasePath(branchId, { ownerShell: true });
  if (task === "hours") {
    return `${base}?tab=settings&focus=1&section=hours`;
  }
  if (task === "branchSettings") {
    return `${base}?tab=settings&focus=1&section=branch`;
  }
  return `${base}?tab=${task}&focus=1`;
}

/** เมนูร้าน (กลุ่ม A) — งานจัดการรายวันเหมือนแอดมินแบรนด์ */
export const BRANCH_TASK_LABEL: Record<OwnerBranchTask, string> = {
  menu: "เมนู",
  staff: "พนักงาน",
  hours: "เวลาเปิด–ปิด",
  branchSettings: "ตั้งค่าสาขา",
};

export function OwnerShopMenuSection({
  links,
  title = "ร้าน",
  subtitle = "จัดการสาขา เมนู พนักงาน และสต๊อก",
  branches = [],
  onManageBranchesClick,
  onOpenBranchTask,
}: {
  links: OwnerShopLink[];
  title?: string;
  subtitle?: string;
  branches?: OwnerShopBranchOption[];
  onManageBranchesClick?: () => void;
  /** ถ้ามี จะเปิด modal แทนการ navigate ไปหน้าสาขา */
  onOpenBranchTask?: (task: OwnerBranchTask, branchId: string) => void;
}) {
  const toast = useToast();
  const [entering, setEntering] = useState(false);
  const [staffBranches, setStaffBranches] = useState<
    OwnerEnterStaffBranch[] | null
  >(null);
  const [pendingHref, setPendingHref] = useState("/staff/stock");
  const [taskPicker, setTaskPicker] = useState<OwnerBranchTask | null>(null);

  if (links.length === 0) return null;

  async function enterStaff(href: string, branchId?: string) {
    if (entering) return;
    setEntering(true);
    setPendingHref(href);
    try {
      const result = await enterOwnerStaffMode(branchId);
      if (!result.ok) {
        toast.error("เข้าหน้าร้านไม่สำเร็จ", result.error);
        return;
      }
      if ("needsBranchSelect" in result && result.needsBranchSelect) {
        setStaffBranches(result.branches);
        return;
      }
      window.location.assign(href);
    } catch {
      toast.error("เข้าหน้าร้านไม่สำเร็จ", "เชื่อมต่อไม่ได้");
    } finally {
      setEntering(false);
    }
  }

  function launchBranchTask(task: OwnerBranchTask, branchId: string) {
    if (onOpenBranchTask) {
      onOpenBranchTask(task, branchId);
      return;
    }
    window.location.assign(ownerBranchTaskHref(branchId, task));
  }

  function openBranchTask(task: OwnerBranchTask) {
    if (branches.length === 0) {
      toast.error("ยังไม่มีสาขา", "เพิ่มสาขาก่อนจากเมนูจัดการสาขา");
      return;
    }
    // เลือกสาขาก่อนเสมอ — แม้มีสาขาเดียว ก็รู้ว่ากำลังแก้สาขาไหน
    setTaskPicker(task);
  }

  return (
    <section className="mt-5">
      <div className="mb-2">
        <p className="text-sm font-bold text-slate-800">{title}</p>
        <p className="mt-0.5 text-[12px] font-medium text-slate-500">
          {subtitle}
        </p>
      </div>
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        {links.map((link, index) => {
          const rowClass = `flex min-h-[3.75rem] w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-slate-50 ${
            index > 0 ? "border-t border-slate-100" : ""
          }`;

          if (link.enterStaff) {
            return (
              <button
                key={`${link.href}-${link.label}`}
                type="button"
                disabled={entering}
                onClick={() => void enterStaff(link.href)}
                className={rowClass}
              >
                <div className="min-w-0">
                  <p className="text-[15px] font-extrabold text-slate-900">
                    {entering ? "กำลังเข้า…" : link.label}
                  </p>
                  <p className="mt-0.5 text-[12px] font-medium text-slate-500">
                    {link.hint}
                  </p>
                </div>
                <IconChevronRight size={18} className="text-slate-300" aria-hidden />
              </button>
            );
          }

          if (link.manageBranches && onManageBranchesClick) {
            return (
              <button
                key={`${link.href}-${link.label}`}
                type="button"
                onClick={onManageBranchesClick}
                className={rowClass}
              >
                <div className="min-w-0">
                  <p className="text-[15px] font-extrabold text-slate-900">
                    {link.label}
                  </p>
                  <p className="mt-0.5 text-[12px] font-medium text-slate-500">
                    {link.hint}
                  </p>
                </div>
                <IconChevronRight size={18} className="text-slate-300" aria-hidden />
              </button>
            );
          }

          if (link.pickBranchTask) {
            return (
              <button
                key={`${link.href}-${link.label}`}
                type="button"
                onClick={() => openBranchTask(link.pickBranchTask!)}
                className={rowClass}
              >
                <div className="min-w-0">
                  <p className="text-[15px] font-extrabold text-slate-900">
                    {link.label}
                  </p>
                  <p className="mt-0.5 text-[12px] font-medium text-slate-500">
                    {link.hint}
                  </p>
                </div>
                <IconChevronRight size={18} className="text-slate-300" aria-hidden />
              </button>
            );
          }

          return (
            <Link
              key={`${link.href}-${link.label}`}
              href={link.href}
              className={`flex min-h-[3.75rem] items-center justify-between gap-3 px-4 py-3 active:bg-slate-50 ${
                index > 0 ? "border-t border-slate-100" : ""
              }`}
            >
              <div className="min-w-0">
                <p className="text-[15px] font-extrabold text-slate-900">
                  {link.label}
                </p>
                <p className="mt-0.5 text-[12px] font-medium text-slate-500">
                  {link.hint}
                </p>
              </div>
              <IconChevronRight size={18} className="text-slate-300" aria-hidden />
            </Link>
          );
        })}
      </div>

      {staffBranches ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
          <div className="w-full max-w-md rounded-3xl bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-base font-bold text-slate-900">เลือกสาขา</p>
              <button
                type="button"
                onClick={() => setStaffBranches(null)}
                aria-label="ปิด"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 active:bg-slate-200"
              >
                <IconClose size={18} />
              </button>
            </div>
            <p className="mb-3 text-sm text-slate-500">
              เข้าจัดการสต๊อกหน้าร้าน — เมนูเดียวกับพนักงาน
            </p>
            <div className="space-y-2">
              {staffBranches.map((b) => (
                <button
                  key={b.branchId}
                  type="button"
                  disabled={entering}
                  onClick={() => void enterStaff(pendingHref, b.branchId)}
                  className="flex w-full items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-left active:scale-[0.99]"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-slate-900">
                      {b.branchName}
                    </span>
                    <span className="text-xs text-slate-500">
                      {b.isOpen ? "เปิดอยู่" : "ปิดร้าน"}
                    </span>
                  </span>
                  <IconLinkSuffix size={14} className="text-sm font-bold text-site-primary">
                    เข้า
                  </IconLinkSuffix>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {taskPicker ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="ปิด"
            className="absolute inset-0 bg-black/45"
            onClick={() => setTaskPicker(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="owner-branch-task-pick-title"
            className="relative z-10 flex max-h-[min(92dvh,40rem)] w-full max-w-md flex-col overflow-hidden rounded-t-[1.75rem] bg-white shadow-2xl sm:mx-4 sm:rounded-[1.75rem]"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
              <div className="min-w-0">
                <p
                  id="owner-branch-task-pick-title"
                  className="text-[17px] font-extrabold text-slate-900"
                >
                  เลือกสาขา
                </p>
                <p className="mt-0.5 text-[12px] text-slate-500">
                  สำหรับ{BRANCH_TASK_LABEL[taskPicker]}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTaskPicker(null)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 active:bg-slate-200"
                aria-label="ปิด"
              >
                <IconClose size={16} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <div className="overflow-hidden rounded-2xl border border-slate-100">
                {branches.map((b, index) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => {
                      setTaskPicker(null);
                      launchBranchTask(taskPicker, b.id);
                    }}
                    className={`flex min-h-[3.75rem] w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-slate-50 ${
                      index > 0 ? "border-t border-slate-100" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-extrabold text-slate-900">
                        {b.name}
                      </p>
                      <p className="mt-0.5 text-[12px] font-medium text-slate-500">
                        {b.isOpen ? "เปิดอยู่" : "ปิดร้าน"}
                        {b.isTest ? " · ทดลอง" : ""}
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
            </div>

            <div className="shrink-0 border-t border-slate-100 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => setTaskPicker(null)}
                aria-label="ปิด"
                className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-slate-900 text-white active:bg-slate-800"
              >
                <IconClose size={18} />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** แพ็กเกจ / บัญชี (กลุ่ม B) — สำหรับเจ้าของที่ซื้อระบบ */
export function OwnerAccountCards({
  brandId,
  brandName,
  subscription,
  smsQuota,
  hideSmsQuota,
  hideSupport,
  hideProfileLinks,
  onBrandProfileClick,
  onOwnerAccountClick,
}: {
  brandId: string;
  brandName: string;
  subscription: OwnerSubscriptionInfo | null;
  smsQuota?: BrandSmsQuotaSnapshot | null;
  /** ซ่อนเมื่อแสดงโควตา SMS / ติดต่อ LINE ในส่วนแจ้งเตือนแล้ว */
  hideSmsQuota?: boolean;
  hideSupport?: boolean;
  /** ซ่อนโปรไฟล์แบรนด์ / บัญชีเจ้าของ (ย้ายไปการ์ดอื่นแล้ว) */
  hideProfileLinks?: boolean;
  /** ถ้ามี จะเปิด modal แทนลิงก์ไป /admin/brands */
  onBrandProfileClick?: () => void;
  /** ถ้ามี จะเปิด modal แทนลิงก์ไปหน้าบัญชีแอดมิน */
  onOwnerAccountClick?: () => void;
}) {
  const [billingOpen, setBillingOpen] = useState(false);

  if (!subscription) return null;

  const expiryLabel = formatDateLabel(
    subscription.expiresAt ??
      (subscription.status === "TRIAL"
        ? subscription.trialEndsAt
        : subscription.nextDueAt),
  );
  const trialLabel = formatDateLabel(subscription.trialEndsAt);
  const dueLabel = formatDateLabel(subscription.nextDueAt);
  const daysLeft = subscription.daysLeft ?? null;
  const nearExpiry = Boolean(subscription.nearExpiry);
  const expired =
    subscription.effectiveStatus === "EXPIRED" ||
    subscription.status === "EXPIRED" ||
    (daysLeft != null && daysLeft < 0);
  const daysLeftText =
    daysLeft == null
      ? null
      : daysLeft < 0
        ? `หมดอายุแล้ว ${Math.abs(daysLeft)} วัน`
        : daysLeft === 0
          ? "หมดอายุวันนี้"
          : `เหลือ ${daysLeft} วัน`;

  return (
    <section className="mt-5 space-y-3">
      <div>
        <p className="text-sm font-bold text-slate-800">บัญชีและแพ็กเกจ</p>
        <p className="mt-0.5 text-[12px] font-medium text-slate-500">
          {hideProfileLinks
            ? "แพ็กเกจและการชำระเงิน"
            : "โปรไฟล์ร้าน · แพ็กเกจ · ติดต่อทีมงาน"}
        </p>
      </div>

      {!hideProfileLinks ? (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
          {onBrandProfileClick ? (
            <button
              type="button"
              onClick={onBrandProfileClick}
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
          ) : (
            <Link
              href="/admin/brands"
              className="flex min-h-[3.75rem] items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 active:bg-slate-50"
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
            </Link>
          )}
          {onOwnerAccountClick ? (
            <button
              type="button"
              onClick={onOwnerAccountClick}
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
          ) : (
            <Link
              href={`/admin/brands/${brandId}/admins`}
              className="flex min-h-[3.75rem] items-center justify-between gap-3 px-4 py-3 active:bg-slate-50"
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
            </Link>
          )}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-slate-500">แพ็กเกจ</p>
              <p className="mt-1 text-[18px] font-black tracking-tight text-slate-900">
                {subscription.planLabel}
              </p>
              {typeof subscription.planPrice === "number" ? (
                <p className="mt-1 text-[13px] font-bold tabular-nums text-slate-700">
                  ฿{subscription.planPrice.toLocaleString("th-TH")}
                  <span className="font-semibold text-slate-500">/เดือน</span>
                </p>
              ) : null}
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                expired
                  ? "bg-red-50 text-red-800"
                  : nearExpiry
                    ? "bg-amber-50 text-amber-900"
                    : "bg-emerald-50 text-emerald-800"
              }`}
            >
              {subscription.effectiveStatusLabel ?? subscription.statusLabel}
            </span>
          </div>
          {subscription.planHint ? (
            <p className="mt-2 text-[12px] font-medium leading-snug text-slate-500">
              {subscription.planHint}
            </p>
          ) : null}
        </div>

        <div className="space-y-3 px-4 py-4">
          <div
            className={`rounded-2xl px-3.5 py-3 ${
              expired
                ? "bg-red-50"
                : nearExpiry
                  ? "bg-amber-50"
                  : "bg-slate-50"
            }`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <p
                className={`text-[11px] font-semibold ${
                  expired
                    ? "text-red-700"
                    : nearExpiry
                      ? "text-amber-800"
                      : "text-slate-500"
                }`}
              >
                {subscription.status === "TRIAL"
                  ? "หมดอายุทดลอง"
                  : "หมดอายุแพ็กเกจ"}
              </p>
              {daysLeftText ? (
                <p
                  className={`text-[11px] font-bold ${
                    expired
                      ? "text-red-800"
                      : nearExpiry
                        ? "text-amber-900"
                        : "text-slate-600"
                  }`}
                >
                  {daysLeftText}
                </p>
              ) : null}
            </div>
            <p
              className={`mt-0.5 text-[15px] font-extrabold ${
                expired
                  ? "text-red-900"
                  : nearExpiry
                    ? "text-amber-950"
                    : "text-slate-900"
              }`}
            >
              {expiryLabel ?? "ยังไม่ระบุ"}
            </p>
            {subscription.writeBlockedReason ? (
              <p className="mt-1.5 text-[12px] font-semibold text-red-800">
                {subscription.writeBlockedReason}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
              <p className="text-[11px] font-semibold text-slate-500">สาขา</p>
              <p className="mt-0.5 text-[15px] font-extrabold tabular-nums text-slate-900">
                {subscription.branchCount}/{subscription.maxBranches}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
              <p className="text-[11px] font-semibold text-slate-500">พนักงาน</p>
              <p className="mt-0.5 text-[15px] font-extrabold tabular-nums text-slate-900">
                {subscription.staffCount}/{subscription.maxStaff}
              </p>
            </div>
          </div>

          {subscription.status === "TRIAL" &&
          trialLabel &&
          trialLabel !== expiryLabel ? (
            <p className="text-[12px] font-semibold text-amber-700">
              ทดลองถึง {trialLabel}
            </p>
          ) : null}
          {dueLabel && dueLabel !== expiryLabel ? (
            <p className="text-[12px] font-medium text-slate-500">
              ครบกำหนดชำระถัดไป {dueLabel}
            </p>
          ) : null}
        </div>

        <div className="border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            onClick={() => setBillingOpen(true)}
            className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl bg-slate-900 px-4 text-left active:bg-slate-800"
          >
            <span className="text-[15px] font-extrabold text-white">บิล</span>
            <IconChevronRight size={18} className="text-white/70" aria-hidden />
          </button>
        </div>
      </div>

      <OwnerBillingModal
        brandId={brandId}
        open={billingOpen}
        onClose={() => setBillingOpen(false)}
      />

      {smsQuota && !hideSmsQuota ? (
        <OwnerSmsQuotaCard quota={smsQuota} />
      ) : null}

      {!hideSupport ? <PlatformSupportCard /> : null}
    </section>
  );
}

export function buildOwnerShopLinks(input: {
  brandId: string;
  firstBranchId: string | null;
  stockEnabled: boolean;
  kitchenEnabled: boolean;
  bbqEnabled: boolean;
  forSettings?: boolean;
}): OwnerShopLink[] {
  const groups = buildOwnerShopLinkGroups(input);
  if (!input.forSettings) {
    return [...groups.setup, ...groups.stock, ...groups.more];
  }
  const hiddenSetup = new Set([
    "รวมทุกสาขา",
    "รอบขาย",
    "บัญชี",
    "โต๊ะ / BBQ",
  ]);
  return groups.setup.filter((l) => !hiddenSetup.has(l.label));
}

/** แยกเมนูร้าน: ตั้งค่า · สต๊อก · อื่นๆ */
export function buildOwnerShopLinkGroups(input: {
  brandId: string;
  firstBranchId: string | null;
  stockEnabled: boolean;
  kitchenEnabled: boolean;
  bbqEnabled: boolean;
}): { setup: OwnerShopLink[]; stock: OwnerShopLink[]; more: OwnerShopLink[] } {
  const { brandId, firstBranchId, stockEnabled, kitchenEnabled, bbqEnabled } =
    input;
  const branchBase = firstBranchId
    ? branchAdminBasePath(firstBranchId, { ownerShell: true })
    : null;

  const setup: OwnerShopLink[] = [
    {
      href: "/owner/branches",
      label: "รวมทุกสาขา",
      hint: "การ์ดยอดขาย · กดเจาะสาขา",
    },
    {
      href: "#manage-branches",
      label: "จัดการสาขา",
      hint: "เพิ่มสาขา และเข้าตั้งค่าแต่ละสาขา",
      manageBranches: true,
    },
  ];

  if (branchBase) {
    setup.push(
      {
        href: "#branch-task-menu",
        label: "เมนู",
        hint: "เมนู · หมวด · ตัวเลือก · ราคา",
        pickBranchTask: "menu",
      },
      {
        href: "#branch-task-staff",
        label: "พนักงาน",
        hint: "เพิ่มพนักงานและสิทธิ์หน้าร้าน",
        pickBranchTask: "staff",
      },
      {
        href: "#branch-task-hours",
        label: "เวลาเปิด–ปิด",
        hint: "เปิด/ปิดร้านและตารางทำการ",
        pickBranchTask: "hours",
      },
      {
        href: `${branchBase}?tab=shifts`,
        label: "รอบขาย",
        hint: "ดูรอบเปิด–ปิดและสรุปรายรอบ",
      },
    );
    if (bbqEnabled) {
      setup.push({
        href: `${branchBase}?tab=bbq-tables`,
        label: "โต๊ะ / BBQ",
        hint: "โต๊ะ QR และบิลเปิด",
      });
    }
  }

  setup.push({
    href: "/owner/accounts",
    label: "บัญชี",
    hint: "รายรับ · รายจ่าย · ภาพรวม",
  });

  const stock: OwnerShopLink[] = [];
  if (stockEnabled) {
    if (firstBranchId) {
      stock.push({
        href: `${branchBase}?tab=stock&view=manage`,
        label: "จัดการสต๊อก",
        hint: "รับเข้า · จ่ายออก · ปรับยอด · สร้างของสิ้นเปลือง/อุปกรณ์",
      });
    }
    stock.push({
      href: "/staff/stock",
      label: "นับสต๊อกหน้าร้าน",
      hint: "เข้าเมนูพนักงาน — นับสต๊อก · มีเลขที่เอกสาร",
      enterStaff: true,
    });
    stock.push({
      href: "/owner/sales-days",
      label: "วันขายดี / วันยอดอ่อน",
      hint: "รู้วันเตรียมเพิ่ม–ลด · ช่วงที่ลูกค้าใช้จ่าย",
    });
    stock.push({
      href: "/owner/par-stock",
      label: `แนะนำ${PAR_STOCK_LABEL}`,
      hint: "ตั้งเป้าคงคลังต่อเมนู · ฐานแผนผลิต",
    });
    stock.push({
      href: "/owner/tomorrow-plans",
      label: "แผนผลิต-เติม",
      hint: `คำนวณของที่ต้องผลิต/เติมจาก${PAR_STOCK_SHORT_LABEL}`,
    });
    stock.push({
      href: "/owner/stock-flow",
      label: "วิเคราะห์สต๊อก",
      hint: "รับเข้า · ขาย · เสีย · เทียบสาขา",
    });
    stock.push({
      href: "/owner/aging",
      label: "ค้างอายุ",
      hint: "สต๊อกใกล้หมดอายุและของค้าง",
    });
    stock.push({
      href: "/owner/waste",
      label: "ของเสีย",
      hint: "ชำรุด · สูญหาย",
    });
    stock.push({
      href: "/owner/stock-history",
      label: "ประวัติ",
      hint: "รับ · ขาย · ปรับสต๊อก · ของเสีย · จ่ายออก",
    });
  }

  // ซ่อนไว้ก่อน — ยังไม่จำเป็นบนหน้าตั้งค่า (เข้าตรง URL ได้)
  const more: OwnerShopLink[] = [];

  return { setup, stock, more };
}
