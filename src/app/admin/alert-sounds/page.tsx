"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AdminEmptyState,
  AdminLoadingState,
  AdminPageHeader,
  adminCardClass,
  adminInputClass,
  adminLabelClass,
  adminTableClass,
  adminTableWrapClass,
  adminTheadClass,
  adminTrClass,
  btnDanger,
  btnOutline,
  btnPrimary,
} from "@/components/admin/AdminShell";
import { AdminToggle } from "@/components/admin/AdminToggle";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { useToast } from "@/components/admin/Toast";
import { useConfirm } from "@/components/ConfirmDialog";

type AlertSound = {
  id: string;
  name: string;
  fileUrl: string;
  sortOrder: number;
  isActive: boolean;
};

export default function AlertSoundsAdminPage() {
  const router = useRouter();
  const { session, loaded } = useAdminSession();
  const toast = useToast();
  const { confirm } = useConfirm();
  const isPlatform = Boolean(session?.isPlatformAdmin);
  const fileRef = useRef<HTMLInputElement>(null);

  const [sounds, setSounds] = useState<AlertSound[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/alert-sounds");
    if (res.status === 401) {
      router.push("/admin/login");
      return;
    }
    if (res.status === 403) {
      router.replace("/admin");
      return;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error("โหลดเสียงไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
      setLoading(false);
      return;
    }
    setSounds(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    if (!loaded) return;
    if (session && !session.isPlatformAdmin) {
      router.replace("/admin");
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, session, router]);

  async function createSound(e: React.FormEvent) {
    e.preventDefault();
    if (!isPlatform) return;
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error("กรุณาเลือกไฟล์ MP3");
      return;
    }
    setSaving(true);
    try {
      const form = new FormData();
      form.append("file", file);
      if (name.trim()) form.append("name", name.trim());
      const res = await fetch("/api/admin/alert-sounds", {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("อัปโหลดไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
        return;
      }
      toast.success("เพิ่มเสียงแล้ว");
      setName("");
      if (fileRef.current) fileRef.current.value = "";
      load();
    } finally {
      setSaving(false);
    }
  }

  async function patchSound(id: string, patch: Partial<AlertSound>) {
    const res = await fetch(`/api/admin/alert-sounds/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error("บันทึกไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
      load();
      return;
    }
    load();
  }

  async function deleteSound(row: AlertSound) {
    const ok = await confirm({
      title: `ลบเสียง “${row.name}”?`,
      message: "สาขาที่ใช้เสียงนี้จะกลับไปใช้เสียงบี๊บเริ่มต้น",
      confirmLabel: "ลบ",
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/alert-sounds/${row.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error("ลบไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
      return;
    }
    toast.success("ลบเสียงแล้ว");
    load();
  }

  function preview(url: string) {
    try {
      const audio = new Audio(url);
      void audio.play();
    } catch {
      toast.error("เล่นเสียงไม่สำเร็จ");
    }
  }

  if (!loaded || loading) {
    return <AdminLoadingState />;
  }

  return (
    <div>
      <AdminPageHeader
        title="เสียงแจ้งเตือน Staff"
        description="คลังเสียงสำหรับแจ้งออเดอร์ใหม่ — พนักงานแต่ละสาขาเลือกใช้จากหน้า Staff"
      />

      <form
        onSubmit={createSound}
        className={`${adminCardClass} mb-6 grid gap-3 sm:grid-cols-2`}
      >
        <div>
          <label className={adminLabelClass}>ชื่อเสียง</label>
          <input
            className={adminInputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เช่น กระดิ่งร้าน"
          />
        </div>
        <div>
          <label className={adminLabelClass}>ไฟล์ MP3 (สูงสุด 2MB)</label>
          <input
            ref={fileRef}
            type="file"
            accept="audio/mpeg,.mp3"
            className={adminInputClass}
            required
          />
        </div>
        <div className="sm:col-span-2">
          <button type="submit" disabled={saving} className={btnPrimary}>
            {saving ? "กำลังอัปโหลด..." : "เพิ่มเสียง"}
          </button>
        </div>
      </form>

      {sounds.length === 0 ? (
        <AdminEmptyState
          title="ยังไม่มีเสียงในคลัง"
          description="อัปโหลด MP3 ด้านบน"
        />
      ) : (
        <div className={adminTableWrapClass}>
          <table className={adminTableClass}>
            <thead className={adminTheadClass}>
              <tr>
                <th className="px-4 py-3">ชื่อ</th>
                <th className="px-4 py-3">ไฟล์</th>
                <th className="px-4 py-3">ลำดับ</th>
                <th className="px-4 py-3">สถานะ</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {sounds.map((row) => (
                <tr key={row.id} className={adminTrClass}>
                  <td className="px-4 py-3">
                    <input
                      className={adminInputClass}
                      defaultValue={row.name}
                      onBlur={(e) => {
                        const next = e.target.value.trim();
                        if (next && next !== row.name) {
                          patchSound(row.id, { name: next });
                        }
                      }}
                    />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600 break-all">
                    {row.fileUrl}
                  </td>
                  <td className="px-4 py-3 w-24">
                    <input
                      type="number"
                      className={adminInputClass}
                      defaultValue={row.sortOrder}
                      onBlur={(e) => {
                        const next = Number(e.target.value);
                        if (!Number.isNaN(next) && next !== row.sortOrder) {
                          patchSound(row.id, { sortOrder: next });
                        }
                      }}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <AdminToggle
                      checked={row.isActive}
                      onChange={(next) =>
                        patchSound(row.id, { isActive: next })
                      }
                      label={row.isActive ? "ใช้งาน" : "ปิด"}
                    />
                  </td>
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    <button
                      type="button"
                      className={btnOutline}
                      onClick={() => preview(row.fileUrl)}
                    >
                      ลองฟัง
                    </button>
                    <button
                      type="button"
                      className={btnDanger}
                      onClick={() => deleteSound(row)}
                    >
                      ลบ
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
