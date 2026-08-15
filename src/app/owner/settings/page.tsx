"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  OwnerAppShell,
  useOwnerDashboard,
} from "@/components/owner/OwnerAppShell";
import { logout } from "@/components/LoginForm";
import { IconLogout } from "@/components/icons";
import { BrandColorPicker } from "@/components/BrandColorPicker";
import { PlatformSupportCard } from "@/components/PlatformSupportCard";
import {
  DEFAULT_BRAND_COLOR,
  normalizePrimaryColor,
} from "@/lib/color";
import { useToast } from "@/components/admin/Toast";

function Row({
  href,
  label,
  hint,
}: {
  href: string;
  label: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-[4.5rem] items-center justify-between gap-3 rounded-2xl bg-white px-4 py-4 shadow-sm"
    >
      <div className="min-w-0">
        <p className="text-[16px] font-extrabold text-slate-900">{label}</p>
        <p className="mt-1 text-[13px] text-slate-500">{hint}</p>
      </div>
      <span className="text-xl text-slate-300">›</span>
    </Link>
  );
}

function OwnerSettingsInner() {
  const toast = useToast();
  const { data, reload } = useOwnerDashboard();
  const brandName = data?.brand?.nameTh || data?.brand?.name || "ร้านค้า";
  const brandId = data?.brand?.id;
  const firstBranchId = data?.branches[0]?.id;
  const [color, setColor] = useState(DEFAULT_BRAND_COLOR);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data?.brand?.color) {
      setColor(normalizePrimaryColor(data.brand.color, DEFAULT_BRAND_COLOR));
    }
  }, [data?.brand?.color]);

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

  return (
    <div className="space-y-3 px-4 pb-6 pt-4">
      <div className="rounded-3xl bg-white px-4 py-5 shadow-sm">
        <p className="text-[13px] font-semibold text-slate-400">ร้านที่ใช้งาน</p>
        <p className="mt-1 text-[20px] font-black text-slate-900">{brandName}</p>
      </div>

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

      <Row
        href="/owner/stock"
        label="สต๊อกกลาง"
        hint="ยอดคงเหลือ เสียบไม้ และจ่ายออก"
      />
      <Row
        href="/admin"
        label="ตั้งค่าร้านแบบเต็ม"
        hint="สาขา เมนู พนักงาน สต๊อก"
      />
      {firstBranchId ? (
        <Row
          href={`/admin/branches/${firstBranchId}`}
          label="เมนูสาขา"
          hint="เพิ่ม แก้ ราคา และโปรโมชั่น"
        />
      ) : null}
      <Row
        href="/admin/line-connect"
        label="เชื่อม LINE"
        hint="แจ้งเตือนออเดอร์เข้าไลน์"
      />
      <Row
        href="/admin/brands"
        label="แก้ข้อมูลแบรนด์"
        hint="ชื่อ โลโก้ รูปปก และสี"
      />
      <Row
        href="/staff/login"
        label="เข้าหน้าพนักงาน"
        hint="คีย์ออเดอร์และจัดการคิว"
      />

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
