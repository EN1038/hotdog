"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AdminLoadingState,
  AdminPageHeader,
  adminCardClass,
  adminInputClass,
  adminLabelClass,
  btnPrimary,
} from "@/components/admin/AdminShell";
import { ImageField } from "@/components/admin/ImageField";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { useToast } from "@/components/admin/Toast";
import type { MarkAssetKind, PlatformSettingsData } from "@/lib/platform-branding";
import { PLATFORM_SETTINGS_DEFAULTS } from "@/lib/platform-branding";

const PLACEMENT_OPTIONS: {
  key: keyof Pick<
    PlatformSettingsData,
    "markSidebar" | "markLogin" | "markHome" | "markOrder" | "markFavicon"
  >;
  label: string;
  hint: string;
}[] = [
  {
    key: "markSidebar",
    label: "แถบด้านข้าง CMS (บนสุด)",
    hint: "ไอคอนมักเหมาะกับพื้นที่แคบ",
  },
  {
    key: "markLogin",
    label: "หน้า Login (Admin / พนักงาน / ลูกค้าเมื่อไม่มีโลโก้แบรนด์)",
    hint: "โลโก้ตัวอักษรอ่านง่ายบนหน้าเข้าสู่ระบบ",
  },
  {
    key: "markHome",
    label: "หน้าแรกแพลตฟอร์ม",
    hint: "หน้าเลือกบทบาทที่เส้นทาง /",
  },
  {
    key: "markOrder",
    label: "หน้าสั่งอาหาร (เมื่อยังไม่ใช้โลโก้แบรนด์)",
    hint: "หัวหน้า /order ของแพลตฟอร์ม",
  },
  {
    key: "markFavicon",
    label: "Favicon แท็บเบราว์เซอร์",
    hint: "แนะนำไอคอนสี่เหลี่ยม",
  },
];

function MarkPick({
  value,
  onChange,
  label,
  hint,
}: {
  value: MarkAssetKind;
  onChange: (v: MarkAssetKind) => void;
  label: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-3">
      <p className="text-sm font-medium text-slate-800">{label}</p>
      <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {(
          [
            { id: "icon", label: "ไอคอน" },
            { id: "logo", label: "โลโก้" },
          ] as const
        ).map((opt) => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                active
                  ? "bg-site-primary text-white"
                  : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function PlatformSettingsPage() {
  const router = useRouter();
  const { session, loaded } = useAdminSession();
  const toast = useToast();
  const [form, setForm] = useState<PlatformSettingsData | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loaded) return;
    if (session && !session.isPlatformAdmin) {
      router.replace("/admin");
      return;
    }

    fetch("/api/admin/site-settings")
      .then((res) => {
        if (res.status === 401) {
          router.push("/admin/login");
          return null;
        }
        if (res.status === 403) {
          router.replace("/admin");
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data && !data.error) {
          setForm({
            ...PLATFORM_SETTINGS_DEFAULTS,
            ...data,
            iconUrl: data.iconUrl || PLATFORM_SETTINGS_DEFAULTS.iconUrl,
            logoUrl: data.logoUrl || PLATFORM_SETTINGS_DEFAULTS.logoUrl,
            markSidebar:
              data.markSidebar === "logo" || data.markSidebar === "icon"
                ? data.markSidebar
                : PLATFORM_SETTINGS_DEFAULTS.markSidebar,
            markLogin:
              data.markLogin === "logo" || data.markLogin === "icon"
                ? data.markLogin
                : PLATFORM_SETTINGS_DEFAULTS.markLogin,
            markHome:
              data.markHome === "logo" || data.markHome === "icon"
                ? data.markHome
                : PLATFORM_SETTINGS_DEFAULTS.markHome,
            markOrder:
              data.markOrder === "logo" || data.markOrder === "icon"
                ? data.markOrder
                : PLATFORM_SETTINGS_DEFAULTS.markOrder,
            markFavicon:
              data.markFavicon === "logo" || data.markFavicon === "icon"
                ? data.markFavicon
                : PLATFORM_SETTINGS_DEFAULTS.markFavicon,
          });
        }
      });
  }, [router, loaded, session]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    const res = await fetch("/api/admin/site-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteName: form.siteName,
        siteTitle: form.siteTitle,
        siteDescription: form.siteDescription?.trim() || null,
        iconUrl: form.iconUrl?.trim() || null,
        logoUrl: form.logoUrl?.trim() || null,
        primaryColor: form.primaryColor,
        markSidebar: form.markSidebar,
        markLogin: form.markLogin,
        markHome: form.markHome,
        markOrder: form.markOrder,
        markFavicon: form.markFavicon,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setForm(await res.json());
      toast.success("บันทึกแล้ว", "การตั้งค่าแพลตฟอร์มอัปเดตเรียบร้อย");
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error("บันทึกไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
    }
  }

  if (!form) {
    return <AdminLoadingState />;
  }

  return (
    <div>
      <AdminPageHeader
        title="ตั้งค่าแพลตฟอร์ม"
        description="ชื่อ โลโก้ และตำแหน่งแสดงของระบบ (ไม่ใช่ของร้านค้า) — แบรนด์ร้านตั้งในเมนูแบรนด์"
      />

      <form onSubmit={save} className={`space-y-6 ${adminCardClass}`}>
        <div className="space-y-4">
          <div>
            <label className={adminLabelClass}>ชื่อแพลตฟอร์ม</label>
            <input
              className={adminInputClass}
              value={form.siteName}
              onChange={(e) => setForm({ ...form, siteName: e.target.value })}
              required
            />
          </div>
          <div>
            <label className={adminLabelClass}>ชื่อแท็บเบราว์เซอร์</label>
            <input
              className={adminInputClass}
              value={form.siteTitle}
              onChange={(e) => setForm({ ...form, siteTitle: e.target.value })}
              required
            />
          </div>
          <div>
            <label className={adminLabelClass}>คำอธิบายแพลตฟอร์ม</label>
            <textarea
              className={adminInputClass}
              rows={3}
              value={form.siteDescription ?? ""}
              onChange={(e) =>
                setForm({ ...form, siteDescription: e.target.value })
              }
            />
          </div>
        </div>

        <div className="space-y-3 border-t border-slate-100 pt-5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              สินทรัพย์แบรนด์แพลตฟอร์ม
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              อัปโหลดทั้งไอคอน (ตัวอักษร/รูปสี่เหลี่ยม) และโลโก้เต็ม (มีชื่อ)
              แล้วเลือกด้านล่างว่าใช้แบบไหนที่ไหน
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <ImageField
              label="ไอคอน"
              hint="แนะนำรูปสี่เหลี่ยม เช่น ตัวย่อ / มาร์ก"
              value={form.iconUrl ?? ""}
              onChange={(url) =>
                setForm({ ...form, iconUrl: url.trim() || null })
              }
              folder="Site"
              size="thumb"
              objectFit="contain"
            />
            <ImageField
              label="โลโก้ (มีตัวอักษร)"
              hint="โลโก้แนวนอนที่รวมชื่อแบรนด์"
              value={form.logoUrl ?? ""}
              onChange={(url) =>
                setForm({ ...form, logoUrl: url.trim() || null })
              }
              folder="Site"
              aspectClassName="aspect-[3/1]"
              objectFit="contain"
            />
          </div>
        </div>

        <div className="space-y-3 border-t border-slate-100 pt-5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              ตำแหน่งการแสดง
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              เลือกว่าแต่ละจุดจะใช้ไอคอนหรือโลโก้
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {PLACEMENT_OPTIONS.map((opt) => (
              <MarkPick
                key={opt.key}
                label={opt.label}
                hint={opt.hint}
                value={form[opt.key]}
                onChange={(v) => setForm({ ...form, [opt.key]: v })}
              />
            ))}
          </div>
        </div>

        <div className="border-t border-slate-100 pt-5">
          <label className={adminLabelClass}>สีหลัก (hex)</label>
          <div className="flex gap-2">
            <input
              type="color"
              className="h-10 w-14 cursor-pointer rounded-xl border border-slate-200 bg-white p-1"
              value={form.primaryColor}
              onChange={(e) =>
                setForm({ ...form, primaryColor: e.target.value })
              }
            />
            <input
              className={adminInputClass}
              value={form.primaryColor}
              onChange={(e) =>
                setForm({ ...form, primaryColor: e.target.value })
              }
            />
          </div>
        </div>

        <button type="submit" disabled={saving} className={btnPrimary}>
          {saving ? "กำลังบันทึก..." : "บันทึกการตั้งค่าแพลตฟอร์ม"}
        </button>
      </form>
    </div>
  );
}
