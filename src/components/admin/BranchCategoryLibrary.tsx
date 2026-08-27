"use client";

import { useEffect, useRef, useState } from "react";
import {
  AdminLoadingState,
  adminInputClass,
  adminLabelClass,
  btnDanger,
  btnDark,
  btnOutline,
} from "@/components/admin/AdminShell";
import { AdminUsageDeleteModal } from "@/components/admin/AdminUsageDeleteModal";
import { useToast } from "@/components/admin/Toast";
import {
  SKEWER_CATEGORY_ROLE_LABELS,
  type SkewerCategoryRoleValue,
} from "@/lib/skewer-order";

type BranchCategory = {
  id: string;
  name: string;
  sortOrder: number;
  stockExempt?: boolean;
  skewerCategoryRole?: SkewerCategoryRoleValue;
  _count?: { menuItems: number };
};

type Props = { branchId: string; skewerMode?: boolean };

export function BranchCategoryLibrary({ branchId, skewerMode }: Props) {
  const toast = useToast();
  const [categories, setCategories] = useState<BranchCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<BranchCategory | null>(null);
  const [usageItems, setUsageItems] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [usageLoading, setUsageLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const categoriesRef = useRef<BranchCategory[]>([]);
  const dragStartOrderRef = useRef<string[]>([]);

  async function load() {
    const res = await fetch(`/api/admin/branches/${branchId}/categories`);
    if (res.ok) {
      const next = await res.json();
      categoriesRef.current = next;
      setCategories(next);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [branchId]);

  function reorderCategories(list: BranchCategory[], activeId: string, overId: string) {
    const fromIndex = list.findIndex((category) => category.id === activeId);
    const toIndex = list.findIndex((category) => category.id === overId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return list;

    const next = [...list];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next.map((category, index) => ({ ...category, sortOrder: index }));
  }

  async function persistOrder(nextCategories: BranchCategory[]) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/branches/${branchId}/categories`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderedIds: nextCategories.map((category) => category.id),
        }),
      });
      const data = await res.json().catch(() => []);
      if (!res.ok) {
        toast.error("บันทึกลำดับไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
        await load();
        return;
      }
      categoriesRef.current = data;
      setCategories(data);
      toast.success("บันทึกลำดับหมวดแล้ว");
    } finally {
      setSaving(false);
      setDraggingId(null);
      setDragOverId(null);
    }
  }

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

  async function setSkewerCategoryRole(
    category: BranchCategory,
    role: SkewerCategoryRoleValue,
  ) {
    if (category.skewerCategoryRole === role) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/categories/${category.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skewerCategoryRole: role }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("บันทึกไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
        return;
      }
      await load();
      toast.success(
        role === "SKEWER_SUPPLY"
          ? "ตั้งเป็นของสิ้นเปลืองแล้ว"
          : "ตั้งเป็นรายการขายแล้ว",
        `หมวด “${category.name}” จะแสดงในกลุ่ม${SKEWER_CATEGORY_ROLE_LABELS[role]}`,
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleStockExempt(category: BranchCategory) {
    const next = !category.stockExempt;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/categories/${category.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stockExempt: next }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("บันทึกไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
        return;
      }
      await load();
      toast.success(
        next ? "ยกเว้นสต็อกแล้ว" : "ติดตามสต็อกแล้ว",
        next
          ? `หมวด “${category.name}” ไม่ต้องรับเข้าสต็อก และเปิดขายได้ทันที`
          : `หมวด “${category.name}” ต้องมีสต็อกถึงจะขายได้`,
      );
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

  async function openDelete(category: BranchCategory) {
    setDeleteTarget(category);
    setUsageItems([]);
    setUsageLoading(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/categories/${category.id}`,
      );
      if (res.ok) {
        const data = await res.json();
        setUsageItems(data.menuItems ?? []);
      }
    } finally {
      setUsageLoading(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/categories/${deleteTarget.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error("ลบไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
        return;
      }
      toast.success(
        "ลบหมวดแล้ว",
        usageItems.length > 0
          ? `เมนู ${usageItems.length} รายการจะแสดงเป็น “ไม่มีหมวดหมู่”`
          : undefined,
      );
      setDeleteTarget(null);
      load();
    } finally {
      setDeleting(false);
    }
  }

  function onDragStart(categoryId: string) {
    if (editingId || saving || deleting) return;
    dragStartOrderRef.current = categoriesRef.current.map((category) => category.id);
    setDraggingId(categoryId);
    setDragOverId(categoryId);
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>, categoryId: string) {
    e.preventDefault();
    if (!draggingId || draggingId === categoryId) return;
    setDragOverId(categoryId);
    setCategories((current) => {
      const next = reorderCategories(current, draggingId, categoryId);
      categoriesRef.current = next;
      return next;
    });
  }

  async function onDrop(categoryId: string) {
    if (!draggingId) return;
    const ordered = reorderCategories(categoriesRef.current, draggingId, categoryId);
    const changed = ordered.some(
      (category, index) => dragStartOrderRef.current[index] !== category.id,
    );
    if (!changed) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }
    categoriesRef.current = ordered;
    setCategories(ordered);
    await persistOrder(ordered);
  }

  function onDragEnd() {
    dragStartOrderRef.current = [];
    setDraggingId(null);
    setDragOverId(null);
  }

  async function moveCategoryByStep(categoryId: string, direction: -1 | 1) {
    if (saving || deleting || editingId) return;
    const list = [...categoriesRef.current];
    const idx = list.findIndex((category) => category.id === categoryId);
    const target = idx + direction;
    if (idx < 0 || target < 0 || target >= list.length) return;
    const next = reorderCategories(list, list[idx].id, list[target].id);
    categoriesRef.current = next;
    setCategories(next);
    await persistOrder(next);
  }

  if (loading) {
    return <AdminLoadingState compact label="กำลังโหลดหมวดหมู่" />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-slate-900">หมวดหมู่เมนู</h3>
        <p className="mt-0.5 text-sm text-slate-600">
          หมวดของสาขานี้เท่านั้น — ใช้จัดกลุ่มเมนูและแท็บฝั่งลูกค้า
          {skewerMode ? (
            <>
              {" "}
              สำหรับเสียบไม้: ตั้ง “ของสิ้นเปลือง” สำหรับน้ำจิ้ม ผงหมาล่า
              ฯลฯ — จะแสดงหลังรายการขายตอนสรุปออเดอร์
            </>
          ) : (
            <> กด “ยกเว้นสต็อก” สำหรับหมวดโปรโมชั่นที่ไม่ต้องรับเข้าสต็อก</>
          )}
        </p>
      </div>

      <form
        onSubmit={createCategory}
        className="flex flex-col gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-end"
      >
        <div className="min-w-0 flex-1">
          <label className={adminLabelClass}>ชื่อหมวดใหม่</label>
          <input
            className={adminInputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เช่น เมนูปิ้ง"
          />
        </div>
        <button type="submit" disabled={saving} className={`min-h-10 ${btnDark}`}>
          เพิ่มหมวด
        </button>
      </form>

      <div className="space-y-2">
        {categories.length > 1 && (
          <p className="text-sm text-slate-500">
            ลากการ์ดหรือกด ↑↓ เพื่อจัดลำดับการแสดงผลบนหน้าเมนู
          </p>
        )}
        {categories.map((cat, index) => (
          <div
            key={cat.id}
            draggable={editingId !== cat.id && !saving && !deleting}
            onDragStart={() => onDragStart(cat.id)}
            onDragOver={(e) => onDragOver(e, cat.id)}
            onDragEnd={onDragEnd}
            onDrop={(e) => {
              e.preventDefault();
              void onDrop(cat.id);
            }}
            className={`flex flex-col gap-3 rounded-xl border bg-white p-4 transition sm:flex-row sm:items-center sm:justify-between ${
              draggingId === cat.id
                ? "border-slate-300 opacity-60 shadow-sm"
                : dragOverId === cat.id
                  ? "border-amber-300 bg-amber-50/70"
                  : "border-slate-200"
            } ${editingId === cat.id ? "" : "sm:cursor-move"}`}
          >
            {editingId === cat.id ? (
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  className={`${adminInputClass} min-w-0 flex-1`}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`min-h-10 flex-1 sm:flex-none ${btnDark}`}
                    disabled={saving}
                    onClick={() => saveEdit(cat.id)}
                  >
                    บันทึก
                  </button>
                  <button
                    type="button"
                    className={`min-h-10 flex-1 sm:flex-none ${btnOutline}`}
                    onClick={() => setEditingId(null)}
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  {categories.length > 1 ? (
                    <div className="flex shrink-0 flex-col gap-1 sm:hidden">
                      <button
                        type="button"
                        disabled={index === 0 || saving}
                        onClick={() => void moveCategoryByStep(cat.id, -1)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-600 disabled:opacity-40"
                        aria-label={`เลื่อน ${cat.name} ขึ้น`}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={index === categories.length - 1 || saving}
                        onClick={() => void moveCategoryByStep(cat.id, 1)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-600 disabled:opacity-40"
                        aria-label={`เลื่อน ${cat.name} ลง`}
                      >
                        ↓
                      </button>
                    </div>
                  ) : null}
                  <div className="hidden select-none pt-0.5 text-slate-400 sm:block">::</div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{cat.name}</p>
                    <p className="text-sm text-slate-500">
                      ใช้กับเมนู {cat._count?.menuItems ?? 0} รายการ
                      {cat.stockExempt ? (
                        <span className="ml-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                          ยกเว้นสต็อก
                        </span>
                      ) : null}
                      {skewerMode &&
                      cat.skewerCategoryRole === "SKEWER_SUPPLY" ? (
                        <span className="ml-1.5 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-800">
                          ของสิ้นเปลือง
                        </span>
                      ) : null}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  {skewerMode ? (
                    <select
                      className={`min-h-10 col-span-2 sm:col-span-1 ${adminInputClass}`}
                      disabled={Boolean(draggingId) || saving}
                      value={cat.skewerCategoryRole ?? "SKEWER_SALE"}
                      onChange={(e) =>
                        void setSkewerCategoryRole(
                          cat,
                          e.target.value as SkewerCategoryRoleValue,
                        )
                      }
                      aria-label={`ประเภทหมวด ${cat.name}`}
                    >
                      <option value="SKEWER_SALE">
                        {SKEWER_CATEGORY_ROLE_LABELS.SKEWER_SALE}
                      </option>
                      <option value="SKEWER_SUPPLY">
                        {SKEWER_CATEGORY_ROLE_LABELS.SKEWER_SUPPLY}
                      </option>
                    </select>
                  ) : null}
                  <button
                    type="button"
                    className={`min-h-10 ${cat.stockExempt ? btnDark : btnOutline}`}
                    disabled={Boolean(draggingId) || saving}
                    onClick={() => void toggleStockExempt(cat)}
                    title={
                      cat.stockExempt
                        ? "คลิกเพื่อติดตามสต็อกอีกครั้ง"
                        : "ไม่ต้องรับเข้าสต็อก — เปิดขายได้ทันที"
                    }
                  >
                    {cat.stockExempt ? "ติดตามสต็อก" : "ยกเว้นสต็อก"}
                  </button>
                  <button
                    type="button"
                    className={`min-h-10 ${btnOutline}`}
                    disabled={Boolean(draggingId) || saving}
                    onClick={() => {
                      setEditingId(cat.id);
                      setEditName(cat.name);
                    }}
                  >
                    แก้ไข
                  </button>
                  <button
                    type="button"
                    className={`min-h-10 col-span-2 sm:col-span-1 ${btnDanger}`}
                    disabled={Boolean(draggingId) || deleting}
                    onClick={() => openDelete(cat)}
                  >
                    ลบ
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
        {categories.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
            ยังไม่มีหมวดหมู่
          </p>
        )}
      </div>

      <AdminUsageDeleteModal
        open={Boolean(deleteTarget)}
        title={`ลบหมวดหมู่ “${deleteTarget?.name ?? ""}”?`}
        description={
          usageLoading
            ? "กำลังโหลดเมนูที่ใช้งาน..."
            : usageItems.length > 0
              ? "หมวดนี้ถูกใช้กับเมนูด้านล่าง — หลังลบ เมนูเหล่านั้นจะแสดงเป็น “ไม่มีหมวดหมู่” (ยังสั่งได้ตามปกติ)"
              : "หมวดนี้ยังไม่ถูกใช้กับเมนูใด กดยืนยันเพื่อลบ"
        }
        items={usageItems}
        confirmLabel="ยืนยันลบหมวด"
        busy={deleting || usageLoading}
        onConfirm={confirmDelete}
        onClose={() => !deleting && setDeleteTarget(null)}
      />
    </div>
  );
}
