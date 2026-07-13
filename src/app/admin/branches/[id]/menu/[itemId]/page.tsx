"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { IconBack } from "@/components/icons";
import {
  adminInputClass,
  adminLabelClass,
} from "@/components/admin/AdminShell";

type MenuOption = {
  id: string;
  name: string;
  priceDelta: string;
  sortOrder: number;
};

type MenuOptionGroup = {
  id: string;
  name: string;
  required: boolean;
  maxSelect: number;
  sortOrder: number;
  options: MenuOption[];
};

type MenuItemDetail = {
  id: string;
  name: string;
  price: string;
  description: string | null;
  category: string | null;
  imageUrl: string | null;
  isHidden: boolean;
  isOutOfStock: boolean;
  sortOrder: number;
  optionGroups: MenuOptionGroup[];
};

const sectionClass = "mt-6 rounded-xl border bg-white p-4";
const btnPrimary =
  "rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white";
const btnDark =
  "rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white";
const btnOutline =
  "rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700";
const btnDanger =
  "rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700";

export default function MenuItemEditorPage() {
  const { id: branchId, itemId } = useParams<{
    id: string;
    itemId: string;
  }>();
  const router = useRouter();
  const [item, setItem] = useState<MenuItemDetail | null>(null);

  const [form, setForm] = useState({
    name: "",
    price: "",
    description: "",
    category: "",
    imageUrl: "",
    sortOrder: "0",
    isHidden: false,
    isOutOfStock: false,
  });

  const [newGroup, setNewGroup] = useState({
    name: "",
    required: false,
    maxSelect: "1",
    sortOrder: "0",
  });

  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroup, setEditGroup] = useState({
    name: "",
    required: false,
    maxSelect: "1",
    sortOrder: "0",
  });

  const [newOptionGroupId, setNewOptionGroupId] = useState<string | null>(null);
  const [newOption, setNewOption] = useState({
    name: "",
    priceDelta: "0",
    sortOrder: "0",
  });

  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [editOption, setEditOption] = useState({
    name: "",
    priceDelta: "0",
    sortOrder: "0",
  });

  async function load() {
    const res = await fetch(
      `/api/admin/branches/${branchId}/menu-items/${itemId}`,
    );
    if (res.status === 401) {
      router.push("/admin/login");
      return;
    }
    if (!res.ok) return;
    const data: MenuItemDetail = await res.json();
    setItem(data);
    setForm({
      name: data.name,
      price: String(data.price),
      description: data.description ?? "",
      category: data.category ?? "",
      imageUrl: data.imageUrl ?? "",
      sortOrder: String(data.sortOrder),
      isHidden: data.isHidden,
      isOutOfStock: data.isOutOfStock,
    });
  }

  useEffect(() => {
    load();
  }, [branchId, itemId, router]);

  async function saveItem(e: React.FormEvent) {
    e.preventDefault();
    await fetch(`/api/admin/branches/${branchId}/menu-items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        price: parseFloat(form.price),
        description: form.description || null,
        category: form.category || null,
        imageUrl: form.imageUrl || null,
        sortOrder: parseInt(form.sortOrder || "0", 10),
        isHidden: form.isHidden,
        isOutOfStock: form.isOutOfStock,
      }),
    });
    load();
  }

  async function addGroup(e: React.FormEvent) {
    e.preventDefault();
    await fetch(
      `/api/admin/branches/${branchId}/menu-items/${itemId}/option-groups`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newGroup.name,
          required: newGroup.required,
          maxSelect: parseInt(newGroup.maxSelect || "1", 10),
          sortOrder: parseInt(newGroup.sortOrder || "0", 10),
        }),
      },
    );
    setNewGroup({ name: "", required: false, maxSelect: "1", sortOrder: "0" });
    load();
  }

  function startEditGroup(group: MenuOptionGroup) {
    setEditingGroupId(group.id);
    setEditGroup({
      name: group.name,
      required: group.required,
      maxSelect: String(group.maxSelect),
      sortOrder: String(group.sortOrder),
    });
  }

  async function saveGroup(groupId: string) {
    await fetch(
      `/api/admin/branches/${branchId}/menu-items/${itemId}/option-groups/${groupId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editGroup.name,
          required: editGroup.required,
          maxSelect: parseInt(editGroup.maxSelect || "1", 10),
          sortOrder: parseInt(editGroup.sortOrder || "0", 10),
        }),
      },
    );
    setEditingGroupId(null);
    load();
  }

  async function deleteGroup(groupId: string) {
    if (!window.confirm("ลบกลุ่มตัวเลือกนี้?")) return;
    await fetch(
      `/api/admin/branches/${branchId}/menu-items/${itemId}/option-groups/${groupId}`,
      { method: "DELETE" },
    );
    load();
  }

  async function addOption(e: React.FormEvent, groupId: string) {
    e.preventDefault();
    await fetch(
      `/api/admin/branches/${branchId}/menu-items/${itemId}/option-groups/${groupId}/options`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newOption.name,
          priceDelta: parseFloat(newOption.priceDelta || "0"),
          sortOrder: parseInt(newOption.sortOrder || "0", 10),
        }),
      },
    );
    setNewOption({ name: "", priceDelta: "0", sortOrder: "0" });
    setNewOptionGroupId(null);
    load();
  }

  function startEditOption(option: MenuOption) {
    setEditingOptionId(option.id);
    setEditOption({
      name: option.name,
      priceDelta: String(option.priceDelta),
      sortOrder: String(option.sortOrder),
    });
  }

  async function saveOption(optionId: string) {
    await fetch(
      `/api/admin/branches/${branchId}/menu-items/${itemId}/options/${optionId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editOption.name,
          priceDelta: parseFloat(editOption.priceDelta || "0"),
          sortOrder: parseInt(editOption.sortOrder || "0", 10),
        }),
      },
    );
    setEditingOptionId(null);
    load();
  }

  async function deleteOption(optionId: string) {
    if (!window.confirm("ลบตัวเลือกนี้?")) return;
    await fetch(
      `/api/admin/branches/${branchId}/menu-items/${itemId}/options/${optionId}`,
      { method: "DELETE" },
    );
    load();
  }

  if (!item) {
    return <p className="text-gray-500">กำลังโหลด...</p>;
  }

  return (
    <div>
      <Link
        href={`/admin/branches/${branchId}`}
        className="inline-flex items-center gap-1 text-sm text-red-600 hover:underline"
      >
        <IconBack size={16} />
        กลับไปหน้าสาขา
      </Link>
      <h2 className="mt-2 text-xl font-bold text-gray-900">แก้ไขเมนู</h2>
      <p className="text-sm text-gray-500">{item.name}</p>

      <section className={sectionClass}>
        <h3 className="mb-3 font-semibold">ข้อมูลเมนู</h3>
        <form onSubmit={saveItem} className="grid gap-3 md:grid-cols-2">
          <div>
            <label className={adminLabelClass}>ชื่อเมนู</label>
            <input
              className={adminInputClass}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className={adminLabelClass}>ราคา</label>
            <input
              type="number"
              step="0.01"
              className={adminInputClass}
              value={form.price}
              onChange={(e) =>
                setForm((f) => ({ ...f, price: e.target.value }))
              }
              required
            />
          </div>
          <div>
            <label className={adminLabelClass}>หมวดหมู่</label>
            <input
              className={adminInputClass}
              value={form.category}
              onChange={(e) =>
                setForm((f) => ({ ...f, category: e.target.value }))
              }
            />
          </div>
          <div>
            <label className={adminLabelClass}>ลำดับ</label>
            <input
              type="number"
              className={adminInputClass}
              value={form.sortOrder}
              onChange={(e) =>
                setForm((f) => ({ ...f, sortOrder: e.target.value }))
              }
            />
          </div>
          <div className="md:col-span-2">
            <label className={adminLabelClass}>รายละเอียด</label>
            <textarea
              className={adminInputClass}
              rows={2}
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </div>
          <div className="md:col-span-2">
            <label className={adminLabelClass}>URL รูปภาพ</label>
            <input
              className={adminInputClass}
              value={form.imageUrl}
              onChange={(e) =>
                setForm((f) => ({ ...f, imageUrl: e.target.value }))
              }
              placeholder="https://..."
            />
          </div>
          {form.imageUrl && (
            <div className="md:col-span-2">
              <img
                src={form.imageUrl}
                alt=""
                className="h-24 w-24 rounded object-cover"
              />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-4 md:col-span-2">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.isHidden}
                onChange={(e) =>
                  setForm((f) => ({ ...f, isHidden: e.target.checked }))
                }
              />
              ซ่อนเมนู
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.isOutOfStock}
                onChange={(e) =>
                  setForm((f) => ({ ...f, isOutOfStock: e.target.checked }))
                }
              />
              หมด
            </label>
          </div>
          <div className="md:col-span-2">
            <button type="submit" className={btnPrimary}>
              บันทึกเมนู
            </button>
          </div>
        </form>
      </section>

      <section className={sectionClass}>
        <h3 className="mb-3 font-semibold">กลุ่มตัวเลือก</h3>

        <form
          onSubmit={addGroup}
          className="mb-4 grid gap-3 rounded-lg border border-dashed p-3 md:grid-cols-5"
        >
          <div className="md:col-span-2">
            <label className={adminLabelClass}>ชื่อกลุ่มใหม่</label>
            <input
              className={adminInputClass}
              value={newGroup.name}
              onChange={(e) =>
                setNewGroup((g) => ({ ...g, name: e.target.value }))
              }
              placeholder="เช่น ท็อปปิ้ง"
              required
            />
          </div>
          <div>
            <label className={adminLabelClass}>เลือกได้สูงสุด</label>
            <input
              type="number"
              min="1"
              className={adminInputClass}
              value={newGroup.maxSelect}
              onChange={(e) =>
                setNewGroup((g) => ({ ...g, maxSelect: e.target.value }))
              }
            />
          </div>
          <div>
            <label className={adminLabelClass}>ลำดับ</label>
            <input
              type="number"
              className={adminInputClass}
              value={newGroup.sortOrder}
              onChange={(e) =>
                setNewGroup((g) => ({ ...g, sortOrder: e.target.value }))
              }
            />
          </div>
          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={newGroup.required}
                onChange={(e) =>
                  setNewGroup((g) => ({ ...g, required: e.target.checked }))
                }
              />
              บังคับเลือก
            </label>
            <button type="submit" className={btnDark}>
              เพิ่มกลุ่ม
            </button>
          </div>
        </form>

        <div className="space-y-4">
          {item.optionGroups.map((group) => (
            <div key={group.id} className="rounded-lg border p-3">
              {editingGroupId === group.id ? (
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="md:col-span-2">
                    <label className={adminLabelClass}>ชื่อกลุ่ม</label>
                    <input
                      className={adminInputClass}
                      value={editGroup.name}
                      onChange={(e) =>
                        setEditGroup((g) => ({ ...g, name: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className={adminLabelClass}>เลือกได้สูงสุด</label>
                    <input
                      type="number"
                      min="1"
                      className={adminInputClass}
                      value={editGroup.maxSelect}
                      onChange={(e) =>
                        setEditGroup((g) => ({
                          ...g,
                          maxSelect: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className={adminLabelClass}>ลำดับ</label>
                    <input
                      type="number"
                      className={adminInputClass}
                      value={editGroup.sortOrder}
                      onChange={(e) =>
                        setEditGroup((g) => ({
                          ...g,
                          sortOrder: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-3 md:col-span-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={editGroup.required}
                        onChange={(e) =>
                          setEditGroup((g) => ({
                            ...g,
                            required: e.target.checked,
                          }))
                        }
                      />
                      บังคับเลือก
                    </label>
                    <button
                      type="button"
                      onClick={() => saveGroup(group.id)}
                      className={btnPrimary}
                    >
                      บันทึก
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingGroupId(null)}
                      className={btnOutline}
                    >
                      ยกเลิก
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{group.name}</p>
                    <p className="text-xs text-gray-500">
                      {group.required ? "บังคับเลือก" : "ไม่บังคับ"} • เลือกได้{" "}
                      {group.maxSelect} • ลำดับ {group.sortOrder}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => startEditGroup(group)}
                      className={btnOutline}
                    >
                      แก้ไข
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteGroup(group.id)}
                      className={btnDanger}
                    >
                      ลบ
                    </button>
                  </div>
                </div>
              )}

              <ul className="mt-3 space-y-2 border-t pt-3">
                {group.options.map((opt) => (
                  <li
                    key={opt.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border bg-gray-50 px-2 py-1.5"
                  >
                    {editingOptionId === opt.id ? (
                      <div className="flex flex-1 flex-wrap items-end gap-2">
                        <div className="min-w-[120px] flex-1">
                          <input
                            className={adminInputClass}
                            value={editOption.name}
                            onChange={(e) =>
                              setEditOption((o) => ({
                                ...o,
                                name: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="w-24">
                          <input
                            type="number"
                            step="0.01"
                            className={adminInputClass}
                            value={editOption.priceDelta}
                            onChange={(e) =>
                              setEditOption((o) => ({
                                ...o,
                                priceDelta: e.target.value,
                              }))
                            }
                            placeholder="+ราคา"
                          />
                        </div>
                        <div className="w-20">
                          <input
                            type="number"
                            className={adminInputClass}
                            value={editOption.sortOrder}
                            onChange={(e) =>
                              setEditOption((o) => ({
                                ...o,
                                sortOrder: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => saveOption(opt.id)}
                          className={btnPrimary}
                        >
                          บันทึก
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingOptionId(null)}
                          className={btnOutline}
                        >
                          ยกเลิก
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="text-sm">
                          {opt.name}
                          {Number(opt.priceDelta) !== 0 && (
                            <span className="text-gray-500">
                              {" "}
                              (+{Number(opt.priceDelta).toLocaleString("th-TH")}{" "}
                              บาท)
                            </span>
                          )}
                          <span className="ml-2 text-xs text-gray-400">
                            ลำดับ {opt.sortOrder}
                          </span>
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => startEditOption(opt)}
                            className={btnOutline}
                          >
                            แก้ไข
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteOption(opt.id)}
                            className={btnDanger}
                          >
                            ลบ
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>

              {newOptionGroupId === group.id ? (
                <form
                  onSubmit={(e) => addOption(e, group.id)}
                  className="mt-2 flex flex-wrap items-end gap-2 border-t pt-2"
                >
                  <div className="min-w-[120px] flex-1">
                    <label className={adminLabelClass}>ชื่อตัวเลือก</label>
                    <input
                      className={adminInputClass}
                      value={newOption.name}
                      onChange={(e) =>
                        setNewOption((o) => ({ ...o, name: e.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="w-24">
                    <label className={adminLabelClass}>+ราคา</label>
                    <input
                      type="number"
                      step="0.01"
                      className={adminInputClass}
                      value={newOption.priceDelta}
                      onChange={(e) =>
                        setNewOption((o) => ({
                          ...o,
                          priceDelta: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="w-20">
                    <label className={adminLabelClass}>ลำดับ</label>
                    <input
                      type="number"
                      className={adminInputClass}
                      value={newOption.sortOrder}
                      onChange={(e) =>
                        setNewOption((o) => ({
                          ...o,
                          sortOrder: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <button type="submit" className={btnDark}>
                    เพิ่ม
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewOptionGroupId(null)}
                    className={btnOutline}
                  >
                    ยกเลิก
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setNewOptionGroupId(group.id);
                    setNewOption({ name: "", priceDelta: "0", sortOrder: "0" });
                  }}
                  className={`mt-2 ${btnOutline}`}
                >
                  + เพิ่มตัวเลือก
                </button>
              )}
            </div>
          ))}
          {item.optionGroups.length === 0 && (
            <p className="text-sm text-gray-500">ยังไม่มีกลุ่มตัวเลือก</p>
          )}
        </div>
      </section>
    </div>
  );
}
