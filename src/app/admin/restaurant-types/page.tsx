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
  showInOwnerRegister: boolean;
  ownerRegisterHint: string | null;
  ownerRegisterPlan: "RETAIL" | "WEIGH_TABLE" | "MALA" | "MULTI";
  ownerRegisterOperatingMode: "NORMAL" | "SKEWER" | "BBQ_WEIGH";
  offersMasterImport: boolean;
};

export default function RestaurantTypesPage() {
  const router = useRouter();
  const { session, loaded } = useAdminSession();
  const toast = useToast();
  const { confirm } = useConfirm();
  const isPlatform = Boolean(session?.isPlatformAdmin);

  const [types, setTypes] = useState<RestaurantType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLegacy, setShowLegacy] = useState(false);
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
    const raw = (await res.json()) as Partial<RestaurantType>[];
    setTypes(
      raw.map((row) => ({
        id: row.id!,
        code: row.code!,
        name: row.name!,
        sortOrder: row.sortOrder ?? 0,
        isActive: row.isActive ?? false,
        showInOwnerRegister: row.showInOwnerRegister ?? false,
        ownerRegisterHint: row.ownerRegisterHint ?? null,
        ownerRegisterPlan: row.ownerRegisterPlan ?? "RETAIL",
        ownerRegisterOperatingMode: row.ownerRegisterOperatingMode ?? "NORMAL",
        offersMasterImport: row.offersMasterImport ?? false,
      })),
    );
    setLoading(false);
  }

  const focusCodes = new Set([
    "mala_hotpot",
    "fish_ball",
    "weigh_bbq",
    "made_to_order",
  ]);
  const visibleTypes = types.filter((row) => {
    if (showLegacy) return true;
    return row.showInOwnerRegister || focusCodes.has(row.code);
  });
  const hiddenLegacyCount = types.length - visibleTypes.length;

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
        description="ใช้ตั้งค่าสาขา (ประเภทหลัก/รอง) และเลือกประเภทที่แสดงตอนสมัคร owner — แนะนำขึ้นต้นชื่อด้วย «ร้าน» เช่น ร้านหมาล่า/ย่าง/ทอด/ชาบู"
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
            placeholder="เช่น ร้านหมาล่า/ย่าง/ทอด/ชาบู"
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
            placeholder="mala_hotpot"
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
          description="เพิ่มประเภทด้านบน หรือรัน migration/seed"
        />
      ) : (
        <>
          {hiddenLegacyCount > 0 ? (
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm text-slate-600">
                แสดง {visibleTypes.length} ประเภทหลัก
                {hiddenLegacyCount > 0
                  ? ` · ซ่อนประเภทเก่า ${hiddenLegacyCount} รายการ`
                  : ""}
              </p>
              <button
                type="button"
                className={btnOutline}
                onClick={() => setShowLegacy((v) => !v)}
              >
                {showLegacy ? "ซ่อนประเภทเก่า" : "แสดงประเภทเก่า"}
              </button>
            </div>
          ) : null}
        <div className={`${adminTableWrapClass} overflow-x-auto`}>
          <table className={`${adminTableClass} min-w-[960px]`}>
            <thead className={adminTheadClass}>
              <tr>
                <th className="px-4 py-3">ชื่อ (แสดงตอนสมัคร)</th>
                <th className="px-4 py-3">รหัส</th>
                <th className="px-4 py-3">คำอธิบายสั้น</th>
                <th className="px-4 py-3">ลำดับ</th>
                <th className="px-4 py-3">ใช้งาน</th>
                <th className="px-4 py-3">สมัคร owner</th>
                <th className="px-4 py-3">นำเข้าเมนู</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {visibleTypes.map((row) => (
                <tr key={row.id} className={adminTrClass}>
                  <td className="px-4 py-3 min-w-[220px]">
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
                  <td className="px-4 py-3 min-w-[180px]">
                    <input
                      className={adminInputClass}
                      defaultValue={row.ownerRegisterHint ?? ""}
                      placeholder="คิวหน้าร้าน · ครัว · …"
                      onBlur={(e) => {
                        const next = e.target.value.trim();
                        if (next !== (row.ownerRegisterHint ?? "")) {
                          patchType(row.id, {
                            ownerRegisterHint: next || null,
                          });
                        }
                      }}
                    />
                  </td>
                  <td className="px-4 py-3 w-20">
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
                      label={row.isActive ? "เปิด" : "ปิด"}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <AdminToggle
                      checked={row.showInOwnerRegister}
                      onChange={(next) =>
                        patchType(row.id, { showInOwnerRegister: next })
                      }
                      label={row.showInOwnerRegister ? "แสดง" : "ซ่อน"}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <AdminToggle
                      checked={row.offersMasterImport}
                      disabled={!row.showInOwnerRegister}
                      onChange={(next) =>
                        patchType(row.id, { offersMasterImport: next })
                      }
                      label={row.offersMasterImport ? "ได้" : "ไม่"}
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
        </>
      )}
    </div>
  );
}
