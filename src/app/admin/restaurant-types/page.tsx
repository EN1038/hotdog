"use client";

import { useEffect, useState } from "react";
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
import { slugifyCode } from "@/lib/slug";

type RestaurantType = {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

export default function RestaurantTypesPage() {
  const router = useRouter();
  const { session, loaded } = useAdminSession();
  const toast = useToast();
  const { confirm } = useConfirm();
  const isPlatform = Boolean(session?.isPlatformAdmin);

  const [types, setTypes] = useState<RestaurantType[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [codeManual, setCodeManual] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/restaurant-types");
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
      toast.error("โหลดประเภทร้านไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
      setLoading(false);
      return;
    }
    setTypes(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    if (!loaded) return;
    if (session && !session.isPlatformAdmin) {
      router.replace("/admin");
      return;
    }
    load();
  }, [loaded, session, router]);

  async function createType(e: React.FormEvent) {
    e.preventDefault();
    if (!isPlatform) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/restaurant-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          code: (codeManual ? code : slugifyCode(name).replace(/-/g, "_"))
            .trim()
            .toLowerCase(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("สร้างไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
        return;
      }
      toast.success("เพิ่มประเภทร้านแล้ว");
      setName("");
      setCode("");
      setCodeManual(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function patchType(id: string, patch: Partial<RestaurantType>) {
    const res = await fetch(`/api/admin/restaurant-types/${id}`, {
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

  async function deleteType(row: RestaurantType) {
    const ok = await confirm({
      title: `ลบประเภท “${row.name}”?`,
      message: "ลบได้เฉพาะเมื่อไม่มีสาขาใช้งาน — หรือปิดใช้งานแทนได้",
      confirmLabel: "ลบ",
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/restaurant-types/${row.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error("ลบไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
      return;
    }
    toast.success("ลบประเภทแล้ว");
    load();
  }

  if (!loaded || loading) {
    return <AdminLoadingState />;
  }

  return (
    <div>
      <AdminPageHeader
        title="ประเภทร้าน"
        description="ใช้ตั้งค่าสาขาในหัวข้อประเภทหลัก / ประเภทรอง — ประเภทเดียวกันเลือกซ้ำกันไม่ได้"
      />

      <form
        onSubmit={createType}
        className={`${adminCardClass} mb-6 grid gap-3 sm:grid-cols-2`}
      >
        <div>
          <label className={adminLabelClass}>ชื่อประเภท</label>
          <input
            className={adminInputClass}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!codeManual) {
                setCode(slugifyCode(e.target.value).replace(/-/g, "_"));
              }
            }}
            placeholder="เช่น อาหารไทย"
            required
          />
        </div>
        <div>
          <label className={adminLabelClass}>รหัส (code)</label>
          <input
            className={adminInputClass}
            value={code}
            onChange={(e) => {
              setCodeManual(true);
              setCode(e.target.value.toLowerCase());
            }}
            placeholder="thai"
            pattern="[a-z0-9_]+"
            required
          />
        </div>
        <div className="sm:col-span-2">
          <button type="submit" disabled={saving} className={btnPrimary}>
            {saving ? "กำลังเพิ่ม..." : "เพิ่มประเภทร้าน"}
          </button>
        </div>
      </form>

      {types.length === 0 ? (
        <AdminEmptyState
          title="ยังไม่มีประเภทร้าน"
          description="เพิ่มประเภทด้านบน หรือรัน seed เพื่อใส่รายการเริ่มต้น"
        />
      ) : (
        <div className={adminTableWrapClass}>
          <table className={adminTableClass}>
            <thead className={adminTheadClass}>
              <tr>
                <th className="px-4 py-3">ชื่อ</th>
                <th className="px-4 py-3">รหัส</th>
                <th className="px-4 py-3">ลำดับ</th>
                <th className="px-4 py-3">สถานะ</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {types.map((row) => (
                <tr key={row.id} className={adminTrClass}>
                  <td className="px-4 py-3">
                    <input
                      className={adminInputClass}
                      defaultValue={row.name}
                      onBlur={(e) => {
                        const next = e.target.value.trim();
                        if (next && next !== row.name) {
                          patchType(row.id, { name: next });
                        }
                      }}
                    />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {row.code}
                  </td>
                  <td className="px-4 py-3 w-24">
                    <input
                      type="number"
                      className={adminInputClass}
                      defaultValue={row.sortOrder}
                      onBlur={(e) => {
                        const next = Number(e.target.value);
                        if (!Number.isNaN(next) && next !== row.sortOrder) {
                          patchType(row.id, { sortOrder: next });
                        }
                      }}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <AdminToggle
                      checked={row.isActive}
                      onChange={(next) =>
                        patchType(row.id, { isActive: next })
                      }
                      label={row.isActive ? "ใช้งาน" : "ปิด"}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className={btnDanger}
                      onClick={() => deleteType(row)}
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
