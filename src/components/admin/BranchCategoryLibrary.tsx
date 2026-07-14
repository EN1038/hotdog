"use client";

import { useEffect, useState } from "react";
import {
  adminInputClass,
  adminLabelClass,
  btnDanger,
  btnDark,
  btnOutline,
} from "@/components/admin/AdminShell";
import { useToast } from "@/components/admin/Toast";
import { useConfirm } from "@/components/ConfirmDialog";

type BranchCategory = {
  id: string;
  name: string;
  sortOrder: number;
  _count?: { menuItems: number };
};

type Props = { branchId: string };

export function BranchCategoryLibrary({ branchId }: Props) {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [categories, setCategories] = useState<BranchCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  async function load() {
    const res = await fetch(`/api/admin/branches/${branchId}/categories`);
    if (res.ok) setCategories(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [branchId]);

  async function createCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("กรอกชื่อหมวด");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/branches/${branchId}/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("สร้างไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
        return;
      }
      setName("");
      await load();
      toast.success("สร้างหมวดแล้ว");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(categoryId: string) {
    if (!editName.trim()) {
      toast.error("กรอกชื่อหมวด");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/categories/${categoryId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: editName.trim() }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("บันทึกไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
        return;
      }
      setEditingId(null);
      await load();
      toast.success("บันทึกแล้ว");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCategory(categoryId: string) {
    const ok = await confirm({
      title: "ลบหมวดหมู่?",
      message: "เมนูที่ผูกอยู่จะเหลือโดยไม่มีหมวด",
      confirmLabel: "ลบหมวด",
    });
    if (!ok) return;
    const res = await fetch(
      `/api/admin/branches/${branchId}/categories/${categoryId}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error("ลบไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
      return;
    }
    toast.success("ลบหมวดแล้ว");
    load();
  }

  if (loading) {
    return <p className="text-sm text-gray-500">กำลังโหลดหมวดหมู่...</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-gray-900">หมวดหมู่เมนู</h3>
        <p className="mt-0.5 text-sm text-gray-600">
          หมวดของสาขานี้เท่านั้น — ใช้จัดกลุ่มเมนูและแท็บฝั่งลูกค้า
        </p>
      </div>

      <form
        onSubmit={createCategory}
        className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4"
      >
        <div className="min-w-[12rem] flex-1">
          <label className={adminLabelClass}>ชื่อหมวดใหม่</label>
          <input
            className={adminInputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เช่น เมนูปิ้ง"
          />
        </div>
        <button type="submit" disabled={saving} className={btnDark}>
          เพิ่มหมวด
        </button>
      </form>

      <div className="space-y-2">
        {categories.map((cat) => (
          <div
            key={cat.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4"
          >
            {editingId === cat.id ? (
              <div className="flex w-full flex-wrap items-center gap-2">
                <input
                  className={`${adminInputClass} min-w-[10rem] flex-1`}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
                <button
                  type="button"
                  className={btnDark}
                  disabled={saving}
                  onClick={() => saveEdit(cat.id)}
                >
                  บันทึก
                </button>
                <button
                  type="button"
                  className={btnOutline}
                  onClick={() => setEditingId(null)}
                >
                  ยกเลิก
                </button>
              </div>
            ) : (
              <>
                <div>
                  <p className="font-semibold text-gray-900">{cat.name}</p>
                  <p className="text-sm text-gray-500">
                    ใช้กับเมนู {cat._count?.menuItems ?? 0} รายการ
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={btnOutline}
                    onClick={() => {
                      setEditingId(cat.id);
                      setEditName(cat.name);
                    }}
                  >
                    แก้ไข
                  </button>
                  <button
                    type="button"
                    className={btnDanger}
                    onClick={() => deleteCategory(cat.id)}
                  >
                    ลบ
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
        {categories.length === 0 && (
          <p className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
            ยังไม่มีหมวดหมู่
          </p>
        )}
      </div>
    </div>
  );
}
