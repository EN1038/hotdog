"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { useToast } from "@/components/admin/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { IconBack, IconPlus } from "@/components/icons";

type MemberRow = {
  membershipId: string;
  role: string;
  adminId: string;
  username: string;
  createdAt: string;
  password?: string | null;
  passwordRecoverable?: boolean;
};

type BrandInfo = { id: string; name: string; code: string };

export default function BrandAdminsPage() {
  const { id: brandId } = useParams<{ id: string }>();
  const router = useRouter();
  const { session, loaded } = useAdminSession();
  const toast = useToast();
  const { confirm } = useConfirm();

  const [brand, setBrand] = useState<BrandInfo | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MemberRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>(
    {},
  );
  const [form, setForm] = useState({
    username: "",
    password: "",
    role: "OWNER" as "OWNER" | "MANAGER",
  });

  const isPlatform = Boolean(session?.isPlatformAdmin);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/brands/${brandId}/admins`);
    if (res.status === 401) {
      router.push("/admin/login");
      return;
    }
    if (res.status === 403 || res.status === 404) {
      router.replace("/admin");
      return;
    }
    if (!res.ok) {
      toast.error("โหลดไม่สำเร็จ");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setBrand(data.brand);
    setMembers(data.members ?? []);
    setCanManage(Boolean(data.canManage));
    setLoading(false);
  }, [brandId, router, toast]);

  useEffect(() => {
    if (!loaded) return;
    if (session && !session.isPlatformAdmin) {
      if (!session.brandIds.includes(brandId)) {
        router.replace("/admin");
        return;
      }
    }
    void load();
  }, [loaded, session, brandId, router, load]);

  function openCreate() {
    setEditing(null);
    setForm({ username: "", password: "", role: "OWNER" });
    setModalOpen(true);
  }

  function openEdit(member: MemberRow) {
    setEditing(member);
    setForm({
      username: member.username,
      password: "",
      role: member.role === "MANAGER" ? "MANAGER" : "OWNER",
    });
    setModalOpen(true);
  }

  async function saveMember(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setSaving(true);
    try {
      if (editing) {
        const payload: Record<string, string> = {};
        if (form.username.trim().toLowerCase() !== editing.username) {
          payload.username = form.username.trim().toLowerCase();
        }
        if (form.password.trim()) payload.password = form.password;
        if (form.role !== editing.role) payload.role = form.role;
        if (Object.keys(payload).length === 0) {
          toast.error("ยังไม่ได้เปลี่ยนอะไร");
          return;
        }
        const res = await fetch(
          `/api/admin/brands/${brandId}/admins/${editing.adminId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error("บันทึกไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
          return;
        }
        toast.success("บันทึกแล้ว");
      } else {
        const res = await fetch(`/api/admin/brands/${brandId}/admins`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: form.username.trim().toLowerCase(),
            password: form.password,
            role: form.role,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error("เพิ่มไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
          return;
        }
        toast.success(
          data.linked ? "ผูกไอดีเดิมเข้าแบรนด์แล้ว" : "เพิ่มผู้ดูแลแล้ว",
        );
      }
      setModalOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function removeMember(member: MemberRow) {
    if (!canManage) return;
    const ok = await confirm({
      title: "ถอดผู้ดูแลออกจากแบรนด์?",
      message: `ถอด ${member.username} ออกจาก ${brand?.name ?? "แบรนด์นี้"}`,
      confirmLabel: "ถอดออก",
    });
    if (!ok) return;
    const res = await fetch(
      `/api/admin/brands/${brandId}/admins/${member.adminId}`,
      { method: "DELETE" },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error("ถอดไม่ออก", data.error ?? "กรุณาลองใหม่");
      return;
    }
    toast.success("ถอดผู้ดูแลแล้ว");
    await load();
  }

  if (!loaded || loading || !brand) {
    return <AdminLoadingState />;
  }

  return (
    <div>
      <Link
        href={isPlatform ? "/admin" : "/admin"}
        className="inline-flex items-center gap-1 text-sm text-site-primary hover:underline"
      >
        <IconBack size={16} />
        กลับ
      </Link>

      <AdminPageHeader
        title={`ผู้ดูแล · ${brand.name}`}
        description={
          canManage
            ? `จัดการไอดีเข้าใช้ของ /${brand.code} — ดูรหัสและแก้ไขได้เฉพาะแอดมินแพลตฟอร์ม`
            : `รายชื่อไอดีภายใต้ /${brand.code} — แก้รหัสให้ติดต่อแอดมินแพลตฟอร์ม`
        }
        actions={
          canManage ? (
            <button type="button" onClick={openCreate} className={btnPrimaryXl}>
              <IconPlus size={16} />
              เพิ่มไอดี
            </button>
          ) : undefined
        }
      />

      <section className="mt-6">
        {members.length === 0 ? (
          <AdminEmptyState
            title="ยังไม่มีผู้ดูแล"
            description={
              canManage
                ? "กดเพิ่มไอดีเพื่อสร้างบัญชีเข้าใช้หลังบ้านของแบรนด์นี้"
                : "ยังไม่มีบัญชีในแบรนด์นี้"
            }
          />
        ) : (
          <div className={adminTableWrapClass}>
            <table className={adminTableClass}>
              <thead className={adminTheadClass}>
                <tr>
                  <th className="px-4 py-3 font-semibold">ไอดี</th>
                  <th className="px-4 py-3 font-semibold">สิทธิ์</th>
                  {canManage && (
                    <th className="px-4 py-3 font-semibold">รหัสผ่าน</th>
                  )}
                  {canManage && <th className="px-4 py-3 font-semibold" />}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.membershipId} className={adminTrHoverClass}>
                    <td className="px-4 py-3 font-mono text-sm font-medium text-slate-900">
                      {m.username}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {m.role === "MANAGER" ? "ผู้จัดการ" : "เจ้าของ"}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-sm">
                        {m.passwordRecoverable && m.password ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <code className="rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-800">
                              {showPassword[m.adminId]
                                ? m.password
                                : "••••••••"}
                            </code>
                            <button
                              type="button"
                              className="text-xs font-medium text-site-primary hover:underline"
                              onClick={() =>
                                setShowPassword((s) => ({
                                  ...s,
                                  [m.adminId]: !s[m.adminId],
                                }))
                              }
                            >
                              {showPassword[m.adminId] ? "ซ่อน" : "แสดง"}
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-amber-700">
                            ยังกู้รหัสเก่าไม่ได้ — กดแก้ไขเพื่อตั้งรหัสใหม่
                          </span>
                        )}
                      </td>
                    )}
                    {canManage && (
                      <td className="space-x-2 px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openEdit(m)}
                          className={btnOutline}
                        >
                          แก้ไข
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeMember(m)}
                          className={btnDanger}
                          disabled={members.length <= 1}
                        >
                          ถอดออก
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!canManage && (
          <p className="mt-4 text-sm text-slate-500">
            หากต้องการเพิ่มไอดีหรือเปลี่ยนรหัสผ่าน ให้ติดต่อแอดมินแพลตฟอร์ม
          </p>
        )}
      </section>

      {canManage && (
        <AdminModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          busy={saving}
          title={editing ? "แก้ไขผู้ดูแล" : "เพิ่มผู้ดูแลแบรนด์"}
          description={
            editing
              ? "เปลี่ยนไอดีหรือตั้งรหัสผ่านใหม่ (เว้นรหัสว่างถ้าไม่เปลี่ยน)"
              : "สร้างไอดีใหม่ หรือใส่ไอดีที่มีอยู่แล้วเพื่อผูกเข้าแบรนด์นี้"
          }
          maxWidthClassName="max-w-md"
        >
          <form onSubmit={saveMember} className="space-y-4 p-5">
            <div>
              <label className={adminLabelClass}>ไอดีผู้ใช้</label>
              <input
                className={adminInputClass}
                value={form.username}
                onChange={(e) =>
                  setForm((f) => ({ ...f, username: e.target.value }))
                }
                required
                autoFocus
                autoComplete="off"
              />
            </div>
            <div>
              <label className={adminLabelClass}>
                รหัสผ่าน{" "}
                {editing && (
                  <span className="font-normal text-slate-400">
                    (ว่าง = ไม่เปลี่ยน)
                  </span>
                )}
              </label>
              <input
                type="text"
                className={adminInputClass}
                value={form.password}
                onChange={(e) =>
                  setForm((f) => ({ ...f, password: e.target.value }))
                }
                required={!editing}
                minLength={editing ? undefined : 6}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className={adminLabelClass}>สิทธิ์ในแบรนด์</label>
              <select
                className={adminInputClass}
                value={form.role}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    role: e.target.value as "OWNER" | "MANAGER",
                  }))
                }
              >
                <option value="OWNER">เจ้าของ</option>
                <option value="MANAGER">ผู้จัดการ</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                className={btnOutline}
                onClick={() => setModalOpen(false)}
                disabled={saving}
              >
                ยกเลิก
              </button>
              <button type="submit" className={btnPrimary} disabled={saving}>
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </form>
        </AdminModal>
      )}
    </div>
  );
}
