"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  adminInputClass,
  adminLabelClass,
  btnPrimary,
} from "@/components/admin/AdminShell";

type SiteSettings = {
  siteName: string;
  siteTitle: string;
  siteDescription: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
};

export default function SiteSettingsPage() {
  const router = useRouter();
  const [form, setForm] = useState<SiteSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/admin/site-settings")
      .then((res) => {
        if (res.status === 401) {
          router.push("/admin/login");
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data) setForm(data);
      });
  }, [router]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setMessage("");
    const res = await fetch("/api/admin/site-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        logoUrl: form.logoUrl?.trim() || null,
        faviconUrl: form.faviconUrl?.trim() || null,
        siteDescription: form.siteDescription?.trim() || null,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setForm(await res.json());
      setMessage("บันทึกแล้ว");
    } else {
      setMessage("บันทึกไม่สำเร็จ");
    }
  }

  if (!form) {
    return <p className="text-gray-500">กำลังโหลด...</p>;
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900">ตั้งค่าเว็บ / โลโก้</h2>
      <p className="mt-1 text-sm text-gray-500">
        ข้อมูลนี้จะแสดงบนหน้า login, ชื่อเว็บ และ metadata ของระบบลูกค้า
      </p>

      <form onSubmit={save} className="mt-6 space-y-4 rounded-xl border bg-white p-4">
        <div>
          <label className={adminLabelClass}>ชื่อเว็บ (แสดงในแอป)</label>
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
          <label className={adminLabelClass}>คำอธิบายเว็บ</label>
          <textarea
            className={adminInputClass}
            rows={2}
            value={form.siteDescription ?? ""}
            onChange={(e) =>
              setForm({ ...form, siteDescription: e.target.value })
            }
          />
        </div>
        <div>
          <label className={adminLabelClass}>URL โลโก้</label>
          <input
            className={adminInputClass}
            value={form.logoUrl ?? ""}
            onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
            placeholder="https://..."
          />
          {form.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={form.logoUrl}
              alt="โลโก้"
              className="mt-2 h-16 w-16 rounded-full object-cover"
            />
          )}
        </div>
        <div>
          <label className={adminLabelClass}>URL Favicon</label>
          <input
            className={adminInputClass}
            value={form.faviconUrl ?? ""}
            onChange={(e) => setForm({ ...form, faviconUrl: e.target.value })}
            placeholder="https://..."
          />
        </div>
        <div>
          <label className={adminLabelClass}>สีหลัก (hex)</label>
          <div className="flex gap-2">
            <input
              type="color"
              className="h-10 w-14 rounded border"
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

        {message && (
          <p className="text-sm text-green-600">{message}</p>
        )}

        <button
          type="submit"
          disabled={saving}
          className={btnPrimary}
        >
          {saving ? "กำลังบันทึก..." : "บันทึกการตั้งค่าเว็บ"}
        </button>
      </form>
    </div>
  );
}
