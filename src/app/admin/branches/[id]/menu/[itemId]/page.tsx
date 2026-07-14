"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { IconBack } from "@/components/icons";
import {
  adminInputClass,
  adminLabelClass,
  btnOutline,
  btnPrimary,
} from "@/components/admin/AdminShell";
import { ImageField } from "@/components/admin/ImageField";
import { useToast } from "@/components/admin/Toast";
import type { BranchOptionGroup } from "@/components/admin/BranchOptionLibrary";

type MenuItemDetail = {
  id: string;
  name: string;
  price: string;
  description: string | null;
  categoryId: string | null;
  category: { id: string; name: string; sortOrder: number } | null;
  imageUrl: string | null;
  isHidden: boolean;
  isOutOfStock: boolean;
  sortOrder: number;
  optionGroups: BranchOptionGroup[];
  optionGroupIds?: string[];
};

type MenuCategoryOption = {
  id: string;
  name: string;
  sortOrder: number;
};

const EMPTY_ITEM: MenuItemDetail = {
  id: "new",
  name: "",
  price: "",
  description: null,
  categoryId: null,
  category: null,
  imageUrl: null,
  isHidden: false,
  isOutOfStock: false,
  sortOrder: 0,
  optionGroups: [],
  optionGroupIds: [],
};

const sectionClass = "rounded-xl border border-gray-200 bg-white p-4";

export default function MenuItemEditorPage() {
  const { id: branchId, itemId } = useParams<{
    id: string;
    itemId: string;
  }>();
  const router = useRouter();
  const toast = useToast();
  const isCreate = itemId === "new";

  const [item, setItem] = useState<MenuItemDetail | null>(
    isCreate ? EMPTY_ITEM : null,
  );
  const [library, setLibrary] = useState<BranchOptionGroup[]>([]);
  const [categories, setCategories] = useState<MenuCategoryOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);

  const [form, setForm] = useState({
    name: "",
    price: "",
    description: "",
    categoryId: "",
    imageUrl: "",
    isHidden: false,
    isOutOfStock: false,
  });

  function applyItem(data: MenuItemDetail) {
    setItem(data);
    setForm({
      name: data.name,
      price: String(data.price),
      description: data.description ?? "",
      categoryId: data.categoryId ?? "",
      imageUrl: data.imageUrl ?? "",
      isHidden: data.isHidden,
      isOutOfStock: data.isOutOfStock,
    });
    const ids = data.optionGroupIds ?? data.optionGroups.map((g) => g.id);
    setSelectedGroupIds(ids);
  }

  async function loadLibrary() {
    const res = await fetch(`/api/admin/branches/${branchId}/option-groups`);
    if (res.status === 401) {
      router.push("/admin/login");
      return;
    }
    if (res.ok) setLibrary(await res.json());
  }

  async function loadCategories() {
    const res = await fetch(`/api/admin/branches/${branchId}/categories`);
    if (res.ok) setCategories(await res.json());
  }

  async function loadItem() {
    if (isCreate) {
      setItem(EMPTY_ITEM);
      setSelectedGroupIds([]);
      return;
    }
    const res = await fetch(
      `/api/admin/branches/${branchId}/menu-items/${itemId}`,
    );
    if (res.status === 401) {
      router.push("/admin/login");
      return;
    }
    if (!res.ok) {
      toast.error("โหลดเมนูไม่สำเร็จ");
      return;
    }
    applyItem(await res.json());
  }

  useEffect(() => {
    loadLibrary();
    loadCategories();
    loadItem();
  }, [branchId, itemId, router]);

  function toggleGroup(groupId: string) {
    setSelectedGroupIds((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId],
    );
  }

  async function saveItem() {
    if (!form.name.trim()) {
      toast.error("กรอกชื่อเมนู");
      return;
    }
    if (!form.price || Number.isNaN(parseFloat(form.price))) {
      toast.error("กรอกราคา");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        price: parseFloat(form.price),
        description: form.description.trim() || null,
        categoryId: form.categoryId || null,
        imageUrl: form.imageUrl || null,
        isHidden: form.isHidden,
        isOutOfStock: form.isOutOfStock,
        optionGroupIds: selectedGroupIds,
      };

      const res = await fetch(
        isCreate
          ? `/api/admin/branches/${branchId}/menu-items`
          : `/api/admin/branches/${branchId}/menu-items/${itemId}`,
        {
          method: isCreate ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("บันทึกไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
        return;
      }
      toast.success(isCreate ? "สร้างเมนูแล้ว" : "บันทึกแล้ว");
      if (isCreate) {
        router.replace(`/admin/branches/${branchId}/menu/${data.id}`);
      } else {
        applyItem(data);
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveAttachedGroups() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/menu-items/${itemId}/option-groups`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ groupIds: selectedGroupIds }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("บันทึกการผูกไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
        return;
      }
      applyItem(data);
      toast.success("อัปเดตหัวข้อของเมนูแล้ว");
    } finally {
      setSaving(false);
    }
  }

  if (!item) {
    return <p className="text-sm text-gray-500">กำลังโหลด...</p>;
  }

  const attachedGroups = selectedGroupIds
    .map((id) => library.find((g) => g.id === id))
    .filter((g): g is BranchOptionGroup => Boolean(g));

  const optionsTabHref = `/admin/branches/${branchId}?tab=options`;

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Link
          href={`/admin/branches/${branchId}?tab=menu`}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
          aria-label="กลับ"
        >
          <IconBack size={20} />
        </Link>
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            {isCreate ? "เพิ่มเมนู" : "แก้ไขเมนู"}
          </h2>
          <p className="text-sm text-gray-500">
            {isCreate
              ? "เลือกหัวข้อตัวเลือกจากคลังสาขา"
              : item.name || "—"}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={sectionClass}>
          <h3 className="mb-3 font-semibold text-gray-900">ข้อมูลเมนู</h3>
          <div className="space-y-3">
            <div>
              <label className={adminLabelClass}>ชื่อเมนู</label>
              <input
                className={adminInputClass}
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>
            <div>
              <label className={adminLabelClass}>ราคา (บาท)</label>
              <input
                type="number"
                step="0.01"
                className={adminInputClass}
                value={form.price}
                onChange={(e) =>
                  setForm((f) => ({ ...f, price: e.target.value }))
                }
              />
            </div>
            <div>
              <label className={adminLabelClass}>คำอธิบาย</label>
              <textarea
                className={adminInputClass}
                rows={2}
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </div>
            <div>
              <label className={adminLabelClass}>หมวดหมู่</label>
              <select
                className={adminInputClass}
                value={form.categoryId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, categoryId: e.target.value }))
                }
              >
                <option value="">— ไม่ระบุ —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <ImageField
              label="รูปเมนู"
              value={form.imageUrl}
              onChange={(url) => setForm((f) => ({ ...f, imageUrl: url }))}
            />
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isHidden}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, isHidden: e.target.checked }))
                  }
                />
                ซ่อนจากลูกค้า
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isOutOfStock}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, isOutOfStock: e.target.checked }))
                  }
                />
                หมดชั่วคราว
              </label>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={saveItem}
              className={btnPrimary}
            >
              {isCreate ? "สร้างเมนู" : "บันทึกเมนู"}
            </button>
          </div>
        </section>

        <div className="space-y-6">
          <section className={sectionClass}>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-gray-900">ใช้กับเมนูนี้</h3>
                <p className="mt-0.5 text-sm text-gray-500">
                  ติ๊กหัวข้อจากคลัง — สร้าง/แก้ที่แท็บตัวเลือกของสาขา
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/admin/branches/${branchId}?tab=categories`}
                  className={btnOutline}
                >
                  หมวดหมู่
                </Link>
                <Link href={optionsTabHref} className={btnOutline}>
                  คลังตัวเลือก
                </Link>
              </div>
            </div>

            {library.length === 0 ? (
              <p className="text-sm text-gray-500">
                ยังไม่มีหัวข้อในคลัง —{" "}
                <Link
                  href={optionsTabHref}
                  className="text-red-600 hover:underline"
                >
                  ไปสร้างที่แท็บตัวเลือก
                </Link>
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {library.map((group) => {
                  const on = selectedGroupIds.includes(group.id);
                  return (
                    <label
                      key={group.id}
                      className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
                        on
                          ? "border-red-300 bg-red-50 text-red-900"
                          : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={on}
                        onChange={() => toggleGroup(group.id)}
                      />
                      <span
                        className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${
                          on
                            ? "border-red-500 bg-red-500 text-white"
                            : "border-gray-300 bg-white"
                        }`}
                        aria-hidden
                      >
                        {on ? "✓" : ""}
                      </span>
                      {group.name}
                      {group.required ? (
                        <span className="text-red-500">*</span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            )}

            {isCreate && attachedGroups.length > 0 && (
              <p className="mt-3 text-xs text-amber-800">
                หัวข้อที่เลือกจะถูกผูกเมื่อกด “สร้างเมนู”
              </p>
            )}

            {!isCreate && (
              <button
                type="button"
                disabled={saving}
                className={`mt-3 ${btnOutline}`}
                onClick={saveAttachedGroups}
              >
                บันทึกหัวข้อที่ใช้กับเมนูนี้
              </button>
            )}
          </section>

          <section className={sectionClass}>
            <h3 className="mb-1 font-semibold text-gray-900">
              ตัวอย่างที่ลูกค้าจะเห็น
            </h3>
            <p className="mb-3 text-sm text-gray-500">
              ดูอย่างเดียว — อยากแก้รายการให้ไปที่คลังตัวเลือกของสาขา
            </p>

            {attachedGroups.length === 0 ? (
              <p className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
                ยังไม่ได้เลือกหัวข้อ — ติ๊กด้านบนเพื่อดูตัวอย่าง
              </p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
                {attachedGroups.map((group, gi) => {
                  const isSingle = group.maxSelect <= 1;
                  return (
                    <div
                      key={group.id}
                      className={gi > 0 ? "border-t border-gray-100" : ""}
                    >
                      <div className="px-4 pb-1 pt-4">
                        <p className="text-[15px] font-bold text-orange-500">
                          {group.name}
                          {group.required ? (
                            <span className="ml-0.5 text-orange-400">*</span>
                          ) : (
                            <span className="text-sm font-normal text-gray-400">
                              {" "}
                              (ไม่บังคับ)
                            </span>
                          )}
                        </p>
                        {!isSingle && (
                          <p className="mt-0.5 text-xs text-gray-400">
                            เลือกได้สูงสุด {group.maxSelect}
                          </p>
                        )}
                      </div>
                      <ul className="pb-2">
                        {group.options.length === 0 ? (
                          <li className="px-4 py-3 text-sm text-gray-400">
                            หัวข้อนี้ยังไม่มีรายการ — ไปเพิ่มที่คลังตัวเลือก
                          </li>
                        ) : (
                          group.options.map((opt) => (
                            <li
                              key={opt.id}
                              className="flex w-full items-center gap-3 px-4 py-3 text-left"
                            >
                              <span className="min-w-0 flex-1">
                                <span className="text-[15px] text-gray-800">
                                  {opt.name}
                                </span>
                                {Number(opt.priceDelta) > 0 && (
                                  <span className="ml-1.5 text-[15px] font-medium text-orange-500">
                                    +฿
                                    {Number(opt.priceDelta).toLocaleString(
                                      "th-TH",
                                    )}
                                  </span>
                                )}
                              </span>
                              <span
                                className={`flex h-5 w-5 shrink-0 items-center justify-center border border-gray-300 ${
                                  isSingle ? "rounded-full" : "rounded"
                                }`}
                                aria-hidden
                              />
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
