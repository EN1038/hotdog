"use client";

import Link from "next/link";
import { useState } from "react";
import type { OwnerSubscriptionInfo } from "@/lib/owner-dashboard";
import {
  enterOwnerStaffMode,
  type OwnerEnterStaffBranch,
} from "@/lib/owner-enter-staff";
import { useToast } from "@/components/admin/Toast";
import { PlatformSupportCard } from "@/components/PlatformSupportCard";
import { WAREHOUSE_UI_ENABLED } from "@/lib/warehouse-ui";

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

export type OwnerShopLink = {
  href: string;
  label: string;
  hint: string;
  /** เข้าโหมดหน้าร้านก่อน แล้วไปที่ href นี้ (เมนูเดียวกับพนักงาน) */
  enterStaff?: boolean;
};

/** เมนูร้าน (กลุ่ม A) — งานจัดการรายวันเหมือนแอดมินแบรนด์ */
export function OwnerShopMenuSection({
  links,
  title = "ร้าน",
  subtitle = "จัดการสาขา เมนู พนักงาน และสต๊อก",
}: {
  links: OwnerShopLink[];
  title?: string;
  subtitle?: string;
}) {
  const toast = useToast();
  const [entering, setEntering] = useState(false);
  const [staffBranches, setStaffBranches] = useState<
    OwnerEnterStaffBranch[] | null
  >(null);
  const [pendingHref, setPendingHref] = useState("/staff/stock");

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

  return (
    <section className="mt-5">
      <div className="mb-2">
        <p className="text-sm font-bold text-slate-800">{title}</p>
        <p className="mt-0.5 text-[12px] font-medium text-slate-500">
          {subtitle}
        </p>
      </div>
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        {links.map((link, index) =>
          link.enterStaff ? (
            <button
              key={`${link.href}-${link.label}`}
              type="button"
              disabled={entering}
              onClick={() => void enterStaff(link.href)}
              className={`flex min-h-[3.75rem] w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-slate-50 ${
                index > 0 ? "border-t border-slate-100" : ""
              }`}
            >
              <div className="min-w-0">
                <p className="text-[15px] font-extrabold text-slate-900">
                  {entering ? "กำลังเข้า…" : link.label}
                </p>
                <p className="mt-0.5 text-[12px] font-medium text-slate-500">
                  {link.hint}
                </p>
              </div>
              <span className="text-lg text-slate-300" aria-hidden>
                ›
              </span>
            </button>
          ) : (
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
              <span className="text-lg text-slate-300" aria-hidden>
                ›
              </span>
            </Link>
          ),
        )}
      </div>

      {staffBranches ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
          <div className="w-full max-w-md rounded-3xl bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-base font-bold text-slate-900">เลือกสาขา</p>
              <button
                type="button"
                onClick={() => setStaffBranches(null)}
                className="rounded-full px-3 py-1.5 text-sm font-medium text-slate-500"
              >
                ปิด
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
                  <span className="text-sm font-bold text-site-primary">
                    เข้า →
                  </span>
                </button>
              ))}
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
}: {
  brandId: string;
  brandName: string;
  subscription: OwnerSubscriptionInfo | null;
}) {
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
  const modules = [
    subscription.stockEnabled ? "สต๊อก" : null,
    subscription.kitchenEnabled ? "ครัว" : null,
    subscription.bbqEnabled ? "โต๊ะ/BBQ" : null,
    subscription.skewerEnabled ? "เสียบไม้" : null,
  ].filter(Boolean) as string[];

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
          โปรไฟล์ร้าน · แพ็กเกจ · ติดต่อทีมงาน
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <Link
          href="/admin/brands"
          className="flex min-h-[3.75rem] items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 active:bg-slate-50"
        >
          <div className="min-w-0">
            <p className="text-[15px] font-extrabold text-slate-900">
              โปรไฟล์แบรนด์
            </p>
            <p className="mt-0.5 text-[12px] font-medium text-slate-500">
              ชื่อ โลโก้ รูปปก · {brandName}
            </p>
          </div>
          <span className="text-lg text-slate-300" aria-hidden>
            ›
          </span>
        </Link>
        <Link
          href={`/admin/brands/${brandId}/admins`}
          className="flex min-h-[3.75rem] items-center justify-between gap-3 px-4 py-3 active:bg-slate-50"
        >
          <div className="min-w-0">
            <p className="text-[15px] font-extrabold text-slate-900">
              บัญชีเจ้าของ
            </p>
            <p className="mt-0.5 text-[12px] font-medium text-slate-500">
              ดูข้อมูลล็อกอินและทีมแอดมิน
            </p>
          </div>
          <span className="text-lg text-slate-300" aria-hidden>
            ›
          </span>
        </Link>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-slate-500">
              แพ็กเกจของฉัน
            </p>
            <p className="mt-1 text-[16px] font-black text-slate-900">
              {subscription.planLabel}
            </p>
            {subscription.planHint ? (
              <p className="mt-1 text-[12px] font-medium leading-snug text-slate-500">
                {subscription.planHint}
              </p>
            ) : null}
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

        <div
          className={`mt-3 rounded-xl px-3 py-2.5 ${
            expired
              ? "bg-red-50 ring-1 ring-red-100"
              : nearExpiry
                ? "bg-amber-50 ring-1 ring-amber-100"
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
                ? "วันหมดอายุทดลอง"
                : "วันหมดอายุแพ็กเกจ"}
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
            {expiryLabel ?? "ยังไม่ระบุวันหมดอายุ"}
          </p>
          {!expiryLabel ? (
            <p className="mt-1 text-[11px] font-medium text-slate-500">
              ติดต่อทีม SkillSale เพื่อตั้งวันหมดอายุ / ต่ออายุแพ็กเกจ
            </p>
          ) : null}
          {subscription.writeBlockedReason ? (
            <p className="mt-1.5 text-[12px] font-semibold text-red-800">
              {subscription.writeBlockedReason}
            </p>
          ) : null}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-slate-50 px-3 py-2.5">
            <p className="text-[11px] font-semibold text-slate-500">สาขา</p>
            <p className="mt-0.5 text-[15px] font-extrabold tabular-nums text-slate-900">
              {subscription.branchCount}/{subscription.maxBranches}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2.5">
            <p className="text-[11px] font-semibold text-slate-500">พนักงาน</p>
            <p className="mt-0.5 text-[15px] font-extrabold tabular-nums text-slate-900">
              {subscription.staffCount}/{subscription.maxStaff}
            </p>
          </div>
        </div>
        {modules.length > 0 ? (
          <p className="mt-3 text-[12px] font-medium text-slate-600">
            โมดูล: {modules.join(" · ")}
          </p>
        ) : (
          <p className="mt-3 text-[12px] font-medium text-slate-500">
            ยังไม่เปิดโมดูลเสริม
          </p>
        )}
        {subscription.status === "TRIAL" &&
        trialLabel &&
        trialLabel !== expiryLabel ? (
          <p className="mt-2 text-[12px] font-semibold text-amber-700">
            ทดลองถึง {trialLabel}
          </p>
        ) : null}
        {dueLabel && dueLabel !== expiryLabel ? (
          <p className="mt-1 text-[12px] font-medium text-slate-500">
            ครบกำหนดชำระถัดไป {dueLabel}
          </p>
        ) : null}
        <Link
          href={`/admin/brands/${brandId}/admins?tab=billing`}
          className="mt-3 inline-flex text-[13px] font-bold text-site-primary"
        >
          ดูใบแจ้งหนี้ / ประวัติชำระ ›
        </Link>
      </div>

      <PlatformSupportCard />
    </section>
  );
}

export function buildOwnerShopLinks(input: {
  brandId: string;
  firstBranchId: string | null;
  stockEnabled: boolean;
  kitchenEnabled: boolean;
  bbqEnabled: boolean;
}): OwnerShopLink[] {
  const groups = buildOwnerShopLinkGroups(input);
  return [...groups.setup, ...groups.stock, ...groups.more];
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
    ? `/admin/branches/${firstBranchId}`
    : null;

  const setup: OwnerShopLink[] = [
    {
      href: "/owner/branches",
      label: "รวมทุกสาขา",
      hint: "การ์ดยอดขาย · กดเจาะสาขา",
    },
    {
      href: "/admin",
      label: "จัดการสาขา (แอดมิน)",
      hint: "เพิ่มสาขา · ตั้งค่าเต็ม",
    },
  ];

  if (branchBase) {
    setup.push(
      {
        href: `${branchBase}?tab=menu`,
        label: "เมนู",
        hint: "เมนู · หมวด · ตัวเลือก · ราคา",
      },
      {
        href: `${branchBase}?tab=staff`,
        label: "พนักงาน",
        hint: "เพิ่มพนักงานและสิทธิ์หน้าร้าน",
      },
      {
        href: `${branchBase}?tab=settings`,
        label: "เวลาเปิด–ปิด",
        hint: "หน้าร้านและเดลิเวอรี",
      },
      {
        href: `${branchBase}?tab=shifts`,
        label: "รอบขาย",
        hint: "ดูรอบเปิด–ปิดและสรุปรายรอบ",
      },
      {
        href: `${branchBase}?tab=expenses`,
        label: "ค่าใช้จ่าย",
        hint: "บันทึกและดูรายจ่ายสาขา",
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

  if (kitchenEnabled && WAREHOUSE_UI_ENABLED) {
    setup.push({
      href: `/admin/brands/${brandId}/kitchen`,
      label: "ครัว / ผลิต",
      hint: "ผลิตและจัดส่งตามคำขอสาขา",
    });
  }

  const stock: OwnerShopLink[] = [];
  if (stockEnabled) {
    stock.push({
      href: "/owner/stock-flow",
      label: "วิเคราะห์สต๊อก",
      hint: "รับเข้า · ขาย · เสีย · เทียบสาขา",
    });
    stock.push({
      href: "/staff/stock",
      label: "จัดการสต๊อก",
      hint: "รับเข้า · จ่ายออก · นับสต๊อก — มีเลขที่เอกสาร",
      enterStaff: true,
    });
    if (WAREHOUSE_UI_ENABLED) {
      stock.push({
        href: "/owner/stock",
        label: "สต๊อกกลาง",
        hint: "นำเข้า · จ่ายออก · สินค้าขาย/สิ้นเปลือง/อุปกรณ์",
      });
    }
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
      hint: "รับ · ขาย · ของเสีย · จ่ายออก",
    });
  }

  // ซ่อนไว้ก่อน — ยังไม่จำเป็นบนหน้าตั้งค่า (เข้าตรง URL ได้)
  const more: OwnerShopLink[] = [];

  return { setup, stock, more };
}
