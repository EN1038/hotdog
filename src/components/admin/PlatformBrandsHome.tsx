"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AdminEmptyState,
  AdminLoadingState,
  AdminPageHeader,
  adminInputClass,
  adminLabelClass,
  adminTableClass,
  adminTableWrapClass,
  adminTheadClass,
  adminTrHoverClass,
  btnDanger,
  btnOutline,
  btnPrimary,
  btnPrimaryXl,
} from "@/components/admin/AdminShell";
import { AdminModal } from "@/components/admin/AdminModal";
import { useToast } from "@/components/admin/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { IconPlus } from "@/components/icons";
import { ImageField } from "@/components/admin/ImageField";
import {
  BRAND_COLOR_PRESETS,
  DEFAULT_BRAND_COLOR,
} from "@/lib/color";
import {
  BRAND_COVER_IMAGE_SIZE_HINT,
  BRAND_LOGO_SIZE_HINT,
} from "@/lib/image-guides";

type Brand = {
  id: string;
  code: string;
  name: string;
  color: string;
  _count: { branches: number; members: number };
  members?: Array<{
    role: string;
    admin: { id: string; username: string; isPlatformAdmin: boolean };
  }>;
};

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="color"
          value={value || DEFAULT_BRAND_COLOR}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 cursor-pointer rounded-xl border border-slate-200 bg-white p-1"
          aria-label="เลือกสีแบรนด์"
        />
        <input
          className={`${adminInputClass} max-w-[8rem] font-mono text-xs`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#dc2626"
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {BRAND_COLOR_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            title={preset}
            onClick={() => onChange(preset)}
            className={`h-6 w-6 rounded-full border-2 ${
              value.toLowerCase() === preset
                ? "border-slate-900"
                : "border-transparent"
            }`}
            style={{ backgroundColor: preset }}
          />
        ))}
      </div>
    </div>
  );
}

function emptyCreateForm() {
  return {
    code: "",
    name: "",
    color: DEFAULT_BRAND_COLOR,
    logoUrl: "",
    coverImageUrl: "",
    adminUsername: "",
    adminPassword: "",
  };
}

export function PlatformBrandsHome() {
  const router = useRouter();
  const toast = useToast();
  const { confirm } = useConfirm();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyCreateForm);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/brands");
    if (res.status === 401) {
      router.push("/admin/login");
      return;
    }
    if (res.ok) setBrands(await res.json());
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  function openModal() {
    setForm(emptyCreateForm());
    setModalOpen(true);
  }

  function closeModal() {
    if (creating) return;
    setModalOpen(false);
    setForm(emptyCreateForm());
  }

  async function createBrand(e: React.FormEvent) {
    e.preventDefault();
    const code = form.code.trim().toLowerCase();
    if (!/^[a-z0-9-]{2,}$/.test(code)) {
      toast.error(
        "รหัสแบรนด์ไม่ถูกต้อง",
        "ใช้ได้เฉพาะ a-z, 0-9 และ - เท่านั้น (ห้ามภาษาไทยหรือช่องว่าง) เช่น malakhunmae",
      );
      return;
    }
    if (form.adminUsername.trim().length < 3) {
      toast.error("ไอดีผู้ดูแลไม่ถูกต้อง", "ต้องมีอย่างน้อย 3 ตัวอักษร");
      return;
    }
    if (form.adminPassword.length < 6) {
      toast.error("รหัสผ่านไม่ถูกต้อง", "ต้องมีอย่างน้อย 6 ตัวอักษร");
      return;
    }
    setCreating(true);
    const res = await fetch("/api/admin/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        name: form.name.trim(),
        color: form.color,
        logoUrl: form.logoUrl.trim() || null,
        coverImageUrl: form.coverImageUrl.trim() || null,
        adminUsername: form.adminUsername.trim().toLowerCase(),
        adminPassword: form.adminPassword,
      }),
    });
    setCreating(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error("สร้างไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
      return;
    }
    toast.success(
      "สร้างแบรนด์แล้ว",
      `ไอดีผู้ดูแล: ${data.createdAdminUsername ?? form.adminUsername}`,
    );
    setModalOpen(false);
    setForm(emptyCreateForm());
    load();
  }

  async function deleteBrand(id: string) {
    const ok = await confirm({
      title: "ลบแบรนด์?",
      message:
        "ลบได้เฉพาะเมื่อไม่มีสาขา — ผู้ดูแลแบรนด์ที่ผูกอยู่จะถูกลบสิทธิ์ด้วย",
      confirmLabel: "ลบแบรนด์",
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/brands/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      toast.error("ลบไม่สำเร็จ", data.error ?? "ลบไม่สำเร็จ");
      return;
    }
    toast.success("ลบแบรนด์แล้ว");
    load();
  }

  if (loading) {
    return <AdminLoadingState />;
  }

  return (
    <div>
      <AdminPageHeader
        title="แบรนด์"
        description="จัดการแบรนด์และบัญชีผู้ดูแล — กดดูสาขาเพื่อเข้าไปตั้งค่าแต่ละสาขา"
        actions={
          <>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 shadow-sm">
              {brands.length} แบรนด์
            </span>
            <button type="button" onClick={openModal} className={btnPrimaryXl}>
              <IconPlus size={16} />
              สร้างแบรนด์
            </button>
          </>
        }
      />

      <section className="mt-6">
        {brands.length === 0 ? (
          <AdminEmptyState
            title="ยังไม่มีแบรนด์"
            description="กด “สร้างแบรนด์” เพื่อเพิ่มแบรนด์แรกพร้อมบัญชีผู้ดูแล"
            action={
              <button type="button" onClick={openModal} className={btnPrimaryXl}>
                <IconPlus size={16} />
                สร้างแบรนด์
              </button>
            }
          />
        ) : (
          <div className={adminTableWrapClass}>
            <table className={adminTableClass}>
              <thead className={adminTheadClass}>
                <tr>
                  <th className="px-4 py-3 font-semibold">แบรนด์</th>
                  <th className="px-4 py-3 font-semibold">รหัส</th>
                  <th className="px-4 py-3 font-semibold">สาขา</th>
                  <th className="px-4 py-3 font-semibold">ผู้ดูแล</th>
                  <th className="px-4 py-3 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {brands.map((brand) => {
                  const owners =
                    brand.members
                      ?.filter((m) => !m.admin.isPlatformAdmin)
                      .map((m) => m.admin.username) ?? [];
                  return (
                    <tr key={brand.id} className={adminTrHoverClass}>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        <span
                          className="mr-2 inline-block h-3 w-3 rounded-full"
                          style={{ backgroundColor: brand.color }}
                        />
                        {brand.name}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">
                        {brand.code}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {brand._count.branches}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {owners.length ? owners.join(", ") : "—"}
                      </td>
                      <td className="space-x-2 px-4 py-3 text-right whitespace-nowrap">
                        <Link
                          href={`/admin/brands/${brand.id}`}
                          className={btnPrimary}
                        >
                          ดูสาขา
                        </Link>
                        <Link
                          href={`/admin/brands/${brand.id}/admins`}
                          className={btnOutline}
                        >
                          ผู้ดูแล
                        </Link>
                        <Link
                          href={`/${brand.code}`}
                          target="_blank"
                          className={btnOutline}
                        >
                          หน้าร้าน
                        </Link>
                        <button
                          type="button"
                          onClick={() => deleteBrand(brand.id)}
                          className={btnDanger}
                        >
                          ลบ
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AdminModal
        open={modalOpen}
        onClose={closeModal}
        busy={creating}
        title="สร้างแบรนด์ใหม่"
        description="สร้างแบรนด์พร้อมบัญชีเข้าใช้หลังบ้าน — โลโก้/รูปปกอัปโหลดทีหลังได้ในโปรไฟล์แบรนด์"
        maxWidthClassName="max-w-xl"
      >
        <form onSubmit={createBrand} className="p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={adminLabelClass}>รหัสแบรนด์ (URL)</label>
              <input
                className={adminInputClass}
                value={form.code}
                onChange={(e) =>
                  setForm((f) => ({ ...f, code: e.target.value }))
                }
                placeholder="เช่น malakhunmae"
                pattern="[a-zA-Z0-9-]{2,}"
                title="ใช้ได้เฉพาะ a-z, 0-9 และ - เท่านั้น"
                required
                autoFocus
              />
              <p className="mt-1 text-xs text-slate-500">
                ใช้ในลิงก์ร้าน — ได้เฉพาะ a-z, 0-9 และ - (ห้ามภาษาไทย)
              </p>
            </div>
            <div>
              <label className={adminLabelClass}>ชื่อแบรนด์</label>
              <input
                className={adminInputClass}
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="เช่น หมาล่าคุณแม่"
                required
              />
              <p className="mt-1 text-xs text-slate-500">
                ชื่อที่แสดงให้ลูกค้า — ใช้ภาษาไทยได้
              </p>
            </div>
            <div className="sm:col-span-2">
              <label className={adminLabelClass}>สีเริ่มต้น</label>
              <ColorPicker
                value={form.color}
                onChange={(color) => setForm((f) => ({ ...f, color }))}
              />
            </div>
            <div className="sm:col-span-2">
              <p className="mb-2 text-xs text-slate-500">
                รูปภาพไม่บังคับตอนสร้าง — ผู้ดูแลแบรนด์อัปโหลดทีหลังในเมนูโปรไฟล์แบรนด์ได้
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <ImageField
                  label="โลโก้ (ไม่บังคับ)"
                  value={form.logoUrl}
                  onChange={(url) =>
                    setForm((f) => ({ ...f, logoUrl: url }))
                  }
                  shopCode={form.code.trim() || undefined}
                  folder="Brand"
                  aspectClassName="aspect-square"
                  size="compact"
                  hint={BRAND_LOGO_SIZE_HINT}
                />
                <ImageField
                  label="รูปปก (ไม่บังคับ)"
                  value={form.coverImageUrl}
                  onChange={(url) =>
                    setForm((f) => ({ ...f, coverImageUrl: url }))
                  }
                  shopCode={form.code.trim() || undefined}
                  folder="Brand"
                  aspectClassName="aspect-[3/2]"
                  size="compact"
                  hint={BRAND_COVER_IMAGE_SIZE_HINT}
                />
              </div>
            </div>
            <div className="border-t border-slate-100 pt-3 sm:col-span-2">
              <p className="mb-2 text-sm font-semibold text-slate-800">
                บัญชีผู้ดูแลแบรนด์
              </p>
            </div>
            <div>
              <label className={adminLabelClass}>ไอดีเข้าใช้</label>
              <input
                className={adminInputClass}
                value={form.adminUsername}
                onChange={(e) =>
                  setForm((f) => ({ ...f, adminUsername: e.target.value }))
                }
                placeholder="เช่น skillsale_admin"
                required
                autoComplete="off"
              />
            </div>
            <div>
              <label className={adminLabelClass}>รหัสผ่าน</label>
              <input
                type="password"
                className={adminInputClass}
                value={form.adminPassword}
                onChange={(e) =>
                  setForm((f) => ({ ...f, adminPassword: e.target.value }))
                }
                placeholder="อย่างน้อย 6 ตัวอักษร"
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={closeModal}
              disabled={creating}
              className="cursor-pointer rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={creating}
              className={btnPrimary}
            >
              {creating ? "กำลังสร้าง..." : "สร้างแบรนด์ + บัญชีผู้ดูแล"}
            </button>
          </div>
        </form>
      </AdminModal>
    </div>
  );
}
