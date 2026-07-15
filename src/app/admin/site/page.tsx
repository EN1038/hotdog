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

import { useAdminSession } from "@/components/admin/AdminSessionProvider";

import { useToast } from "@/components/admin/Toast";



type PlatformSettings = {

  siteName: string;

  siteTitle: string;

  siteDescription: string | null;

  logoUrl: string | null;

  faviconUrl: string | null;

  primaryColor: string;

};



export default function PlatformSettingsPage() {

  const router = useRouter();

  const { session, loaded } = useAdminSession();

  const toast = useToast();

  const [form, setForm] = useState<PlatformSettings | null>(null);

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

        if (data && !data.error) setForm(data);

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

        ...form,

        logoUrl: form.logoUrl?.trim() || null,

        faviconUrl: form.faviconUrl?.trim() || null,

        siteDescription: form.siteDescription?.trim() || null,

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

        description="ชื่อและโลโก้ของระบบ (ไม่ใช่ของร้านค้า) — แบรนด์ร้านตั้งในเมนูแบรนด์"

      />



      <form onSubmit={save} className={`space-y-4 ${adminCardClass}`}>

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

            rows={2}

            value={form.siteDescription ?? ""}

            onChange={(e) =>

              setForm({ ...form, siteDescription: e.target.value })

            }

          />

        </div>

        <div>

          <label className={adminLabelClass}>URL โลโก้แพลตฟอร์ม</label>

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

              className="mt-2 h-16 w-16 rounded-full border border-slate-200 object-cover"

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


