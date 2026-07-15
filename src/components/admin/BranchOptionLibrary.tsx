"use client";

import { useEffect, useRef, useState } from "react";
import {
  AdminLoadingState,
  adminInputClass,
  btnDanger,
  btnDark,
  btnOutline,
} from "@/components/admin/AdminShell";
import { AdminUsageDeleteModal } from "@/components/admin/AdminUsageDeleteModal";
import { useToast } from "@/components/admin/Toast";
import { useConfirm } from "@/components/ConfirmDialog";

export type BranchOption = {
  id: string;
  name: string;
  priceDelta: string;
};

export type BranchOptionGroup = {
  id: string;
  name: string;
  required: boolean;
  maxSelect: number;
  options: BranchOption[];
  _count?: { menuItemLinks: number };
  menuItemLinks?: Array<{ menuItem: { id: string; name: string } }>;
};

type Props = {
  branchId: string;
};

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
        checked
          ? "border-site-primary-soft bg-site-primary-soft text-site-primary"
          : "border-gray-200 bg-white text-gray-600"
      }`}
    >
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${
          checked ? "bg-site-primary" : "bg-gray-300"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </span>
      {label}
    </button>
  );
}

export function BranchOptionLibrary({ branchId }: Props) {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [library, setLibrary] = useState<BranchOptionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [focusGroupId, setFocusGroupId] = useState<string | null>(null);
  const groupRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [newGroup, setNewGroup] = useState({
    name: "",
    required: false,
    maxSelect: "1",
  });
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroup, setEditGroup] = useState({
    name: "",
    maxSelect: "1",
  });
  const [newOptionByGroup, setNewOptionByGroup] = useState<
    Record<string, { name: string; priceDelta: string }>
  >({});
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [editOption, setEditOption] = useState({
    name: "",
    priceDelta: "",
  });
  const [deleteTarget, setDeleteTarget] = useState<BranchOptionGroup | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  async function load() {
    const res = await fetch(`/api/admin/branches/${branchId}/option-groups`);
    if (res.ok) setLibrary(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [branchId]);

  useEffect(() => {
    if (!focusGroupId) return;
    const el = groupRefs.current[focusGroupId];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-site-primary");
      const t = window.setTimeout(() => {
        el.classList.remove("ring-2", "ring-site-primary");
        setFocusGroupId(null);
      }, 1600);
      return () => window.clearTimeout(t);
    }
  }, [focusGroupId, library]);

  async function createGroup() {
    if (!newGroup.name.trim()) {
      toast.error("กรอกชื่อหัวข้อตัวเลือก");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/branches/${branchId}/option-groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newGroup.name.trim(),
          required: newGroup.required,
          maxSelect: parseInt(newGroup.maxSelect || "1", 10),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("สร้างหัวข้อไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
        return;
      }
      setNewGroup({ name: "", required: false, maxSelect: "1" });
      setCollapsed((c) => ({ ...c, [data.id]: false }));
      await load();
      setFocusGroupId(data.id);
      toast.success("สร้างหัวข้อแล้ว");
    } finally {
      setSaving(false);
    }
  }

  function startEditGroup(group: BranchOptionGroup) {
    setEditingGroupId(group.id);
    setEditGroup({
      name: group.name,
      maxSelect: String(group.maxSelect),
    });
    setCollapsed((c) => ({ ...c, [group.id]: false }));
  }

  async function saveGroupMeta(groupId: string, patch: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/option-groups/${groupId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("บันทึกหัวข้อไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
        return;
      }
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function saveGroupName(groupId: string) {
    if (!editGroup.name.trim()) {
      toast.error("กรอกชื่อหัวข้อ");
      return;
    }
    await saveGroupMeta(groupId, {
      name: editGroup.name.trim(),
      maxSelect: parseInt(editGroup.maxSelect || "1", 10),
    });
    setEditingGroupId(null);
    toast.success("อัปเดตหัวข้อแล้ว");
  }

  async function toggleRequired(group: BranchOptionGroup) {
    await saveGroupMeta(group.id, { required: !group.required });
  }

  async function openDeleteGroup(group: BranchOptionGroup) {
    setDeleteTarget(group);
  }

  async function confirmDeleteGroup() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/option-groups/${deleteTarget.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error("ลบไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
        return;
      }
      const used = deleteTarget.menuItemLinks?.length ?? deleteTarget._count?.menuItemLinks ?? 0;
      toast.success(
        "ลบหัวข้อแล้ว",
        used > 0
          ? `ถอดออกจากเมนู ${used} รายการแล้ว — ลูกค้าจะไม่เห็นตัวเลือกชุดนี้`
          : undefined,
      );
      setDeleteTarget(null);
      await load();
    } finally {
      setDeleting(false);
    }
  }

  async function deleteGroup(group: BranchOptionGroup) {
    openDeleteGroup(group);
  }

  async function addOption(groupId: string) {
    const draft = newOptionByGroup[groupId] ?? { name: "", priceDelta: "" };
    if (!draft.name.trim()) {
      toast.error("กรอกชื่อตัวเลือก");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/option-groups/${groupId}/options`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: draft.name.trim(),
            priceDelta: parseFloat(draft.priceDelta || "0"),
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("เพิ่มตัวเลือกไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
        return;
      }
      setNewOptionByGroup((m) => ({
        ...m,
        [groupId]: { name: "", priceDelta: "" },
      }));
      await load();
      toast.success("เพิ่มตัวเลือกแล้ว");
    } finally {
      setSaving(false);
    }
  }

  function startEditOption(opt: BranchOption) {
    setEditingOptionId(opt.id);
    setEditOption({
      name: opt.name,
      priceDelta:
        Number(opt.priceDelta) === 0 ? "" : String(opt.priceDelta),
    });
  }

  async function saveOption(groupId: string, optionId: string) {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/option-groups/${groupId}/options/${optionId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: editOption.name.trim(),
            priceDelta: parseFloat(editOption.priceDelta || "0"),
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("บันทึกตัวเลือกไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
        return;
      }
      setEditingOptionId(null);
      await load();
      toast.success("อัปเดตตัวเลือกแล้ว");
    } finally {
      setSaving(false);
    }
  }

  async function deleteOption(groupId: string, optionId: string) {
    const ok = await confirm({
      title: "ลบตัวเลือก?",
      message: "ลบออกจากคลัง — กระทบทุกเมนูที่ใช้หัวข้อนี้",
      confirmLabel: "ลบ",
    });
    if (!ok) return;
    const res = await fetch(
      `/api/admin/branches/${branchId}/option-groups/${groupId}/options/${optionId}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error("ลบไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
      return;
    }
    await load();
    toast.success("ลบตัวเลือกแล้ว");
  }

  if (loading) {
    return <AdminLoadingState compact label="กำลังโหลดคลังตัวเลือก" />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-gray-900">
          คลังหัวข้อตัวเลือก
        </h3>
        <p className="mt-0.5 text-sm text-gray-600">
          สร้างและแก้ที่นี่เท่านั้น — หน้าเมนูแค่เลือกหัวข้อมาใช้
        </p>
      </div>

      <form
        className="space-y-3 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          createGroup();
        }}
      >
        <p className="text-sm font-medium text-gray-800">สร้างหัวข้อใหม่</p>
        <input
          className={adminInputClass}
          placeholder="ชื่อหัวข้อ เช่น ความหวาน"
          value={newGroup.name}
          onChange={(e) =>
            setNewGroup((g) => ({ ...g, name: e.target.value }))
          }
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Toggle
            checked={newGroup.required}
            onChange={(required) => setNewGroup((g) => ({ ...g, required }))}
            label="บังคับเลือก"
          />
          <label className="inline-flex items-center gap-2 whitespace-nowrap text-sm text-gray-800">
            เลือกได้สูงสุด
            <input
              type="number"
              min={1}
              className="w-16 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
              value={newGroup.maxSelect}
              onChange={(e) =>
                setNewGroup((g) => ({ ...g, maxSelect: e.target.value }))
              }
            />
          </label>
          <button type="submit" disabled={saving} className={btnDark}>
            สร้างหัวข้อ
          </button>
        </div>
      </form>

      <div className="space-y-3">
        {library.map((group) => {
          const isCollapsed = collapsed[group.id] ?? false;
          return (
            <div
              key={group.id}
              ref={(el) => {
                groupRefs.current[group.id] = el;
              }}
              className="rounded-xl border border-gray-200 bg-white transition"
            >
              <div className="flex flex-wrap items-center gap-2 px-4 py-3">
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
                  aria-label={isCollapsed ? "ขยาย" : "หุบ"}
                  onClick={() =>
                    setCollapsed((c) => ({
                      ...c,
                      [group.id]: !isCollapsed,
                    }))
                  }
                >
                  <span className="text-lg leading-none">
                    {isCollapsed ? "▸" : "▾"}
                  </span>
                </button>

                <div className="min-w-0 flex-1">
                  {editingGroupId === group.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        className={`${adminInputClass} min-w-[10rem] flex-1`}
                        value={editGroup.name}
                        onChange={(e) =>
                          setEditGroup((g) => ({
                            ...g,
                            name: e.target.value,
                          }))
                        }
                      />
                      <label className="inline-flex items-center gap-2 whitespace-nowrap text-sm">
                        สูงสุด
                        <input
                          type="number"
                          min={1}
                          className="w-16 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                          value={editGroup.maxSelect}
                          onChange={(e) =>
                            setEditGroup((g) => ({
                              ...g,
                              maxSelect: e.target.value,
                            }))
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className={btnDark}
                        disabled={saving}
                        onClick={() => saveGroupName(group.id)}
                      >
                        บันทึก
                      </button>
                      <button
                        type="button"
                        className={btnOutline}
                        onClick={() => setEditingGroupId(null)}
                      >
                        ยกเลิก
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="font-semibold text-gray-900">
                        {group.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        เลือกได้สูงสุด {group.maxSelect}
                        {group._count
                          ? ` · ใช้กับ ${group._count.menuItemLinks} เมนู`
                          : ""}
                        {` · ${group.options.length} ตัวเลือก`}
                      </p>
                    </>
                  )}
                </div>

                <Toggle
                  checked={group.required}
                  onChange={() => toggleRequired(group)}
                  label="บังคับเลือก"
                />

                {editingGroupId !== group.id && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={btnOutline}
                      onClick={() => startEditGroup(group)}
                    >
                      แก้ชื่อ
                    </button>
                    <button
                      type="button"
                      className={btnDanger}
                      onClick={() => deleteGroup(group)}
                    >
                      ลบ
                    </button>
                  </div>
                )}
              </div>

              {!isCollapsed && (
                <div className="space-y-3 border-t border-gray-100 px-4 py-3">
                  <ul className="space-y-2">
                    {group.options.map((opt) => (
                      <li
                        key={opt.id}
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2"
                      >
                        {editingOptionId === opt.id ? (
                          <>
                            <input
                              className={`${adminInputClass} min-w-[10rem] flex-1`}
                              placeholder="ชื่อตัวเลือก"
                              value={editOption.name}
                              onChange={(e) =>
                                setEditOption((o) => ({
                                  ...o,
                                  name: e.target.value,
                                }))
                              }
                            />
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-gray-500">+฿</span>
                              <input
                                type="number"
                                step="0.01"
                                className="w-24 rounded-lg border border-gray-300 px-2 py-2 text-sm text-gray-900"
                                placeholder="ราคาเพิ่ม"
                                value={editOption.priceDelta}
                                onChange={(e) =>
                                  setEditOption((o) => ({
                                    ...o,
                                    priceDelta: e.target.value,
                                  }))
                                }
                              />
                            </div>
                            <button
                              type="button"
                              className={btnDark}
                              disabled={saving}
                              onClick={() => saveOption(group.id, opt.id)}
                            >
                              บันทึก
                            </button>
                            <button
                              type="button"
                              className={btnOutline}
                              onClick={() => setEditingOptionId(null)}
                            >
                              ยกเลิก
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="min-w-0 flex-1 text-sm font-medium text-gray-900">
                              {opt.name}
                              {Number(opt.priceDelta) !== 0 && (
                                <span className="ml-2 font-normal text-orange-600">
                                  +฿
                                  {Number(opt.priceDelta).toLocaleString(
                                    "th-TH",
                                  )}
                                </span>
                              )}
                            </span>
                            <button
                              type="button"
                              className={btnOutline}
                              onClick={() => startEditOption(opt)}
                            >
                              แก้
                            </button>
                            <button
                              type="button"
                              className={btnDanger}
                              onClick={() => deleteOption(group.id, opt.id)}
                            >
                              ลบ
                            </button>
                          </>
                        )}
                      </li>
                    ))}
                    {group.options.length === 0 && (
                      <li className="text-sm text-gray-500">
                        ยังไม่มีรายการในหัวข้อนี้
                      </li>
                    )}
                  </ul>

                  <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-gray-200 bg-white p-3">
                    <div className="min-w-[10rem] flex-1">
                      <label className="mb-1 block text-xs font-semibold text-gray-600">
                        ชื่อตัวเลือก
                      </label>
                      <input
                        className={adminInputClass}
                        placeholder="เช่น ไม่เผ็ด"
                        value={newOptionByGroup[group.id]?.name ?? ""}
                        onChange={(e) =>
                          setNewOptionByGroup((m) => ({
                            ...m,
                            [group.id]: {
                              name: e.target.value,
                              priceDelta: m[group.id]?.priceDelta ?? "",
                            },
                          }))
                        }
                      />
                    </div>
                    <div className="w-28">
                      <label className="mb-1 block text-xs font-semibold text-gray-600">
                        ราคาเพิ่ม (฿)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        className={adminInputClass}
                        placeholder="0"
                        value={newOptionByGroup[group.id]?.priceDelta ?? ""}
                        onChange={(e) =>
                          setNewOptionByGroup((m) => ({
                            ...m,
                            [group.id]: {
                              name: m[group.id]?.name ?? "",
                              priceDelta: e.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                    <button
                      type="button"
                      className={btnOutline}
                      disabled={saving}
                      onClick={() => addOption(group.id)}
                    >
                      + เพิ่มตัวเลือก
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {library.length === 0 && (
          <p className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
            ยังไม่มีหัวข้อตัวเลือก — สร้างด้านบนได้เลย
          </p>
        )}
      </div>

      <AdminUsageDeleteModal
        open={Boolean(deleteTarget)}
        title={`ลบหัวข้อ “${deleteTarget?.name ?? ""}”?`}
        description={
          (deleteTarget?.menuItemLinks?.length ??
            deleteTarget?._count?.menuItemLinks ??
            0) > 0
            ? "หัวข้อนี้ถูกใช้กับเมนูด้านล่าง — หลังลบจะถอดตัวเลือกชุดนี้ออกจากเมนูเหล่านั้น ลูกค้าจะไม่เห็นชุดนี้แล้ว"
            : "หัวข้อนี้ยังไม่ถูกผูกกับเมนูใด กดยืนยันเพื่อลบ"
        }
        items={(deleteTarget?.menuItemLinks ?? []).map((link) => ({
          id: link.menuItem.id,
          name: link.menuItem.name,
        }))}
        confirmLabel="ยืนยันลบหัวข้อ"
        busy={deleting}
        onConfirm={confirmDeleteGroup}
        onClose={() => !deleting && setDeleteTarget(null)}
      />
    </div>
  );
}
