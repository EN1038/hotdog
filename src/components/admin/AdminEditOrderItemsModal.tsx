"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  adminInputClass,
  adminLabelClass,
  btnOutline,
  btnPrimary,
} from "@/components/admin/AdminShell";
import { MenuOptionGroupPicker } from "@/components/customer/MenuOptionGroupPicker";
import { formatPrice } from "@/lib/constants";
import type { MenuItemData, MenuOptionGroupData } from "@/lib/customer-types";
import {
  computeSelectedOptions,
  validateOptionGroupSelections,
} from "@/lib/option-selection";
import {
  fulfillmentToChannel,
  resolveSellPrice,
} from "@/lib/menu-pricing";
import type { FulfillmentType } from "@prisma/client";

export type EditOrderLineDraft = {
  key: string;
  branchMenuItemId: string;
  name: string;
  quantity: number;
  optionIds: string[];
  note: string;
};

type MenuApiItem = MenuItemData & {
  isHidden?: boolean;
  optionGroups?: MenuOptionGroupData[];
};

type Props = {
  open: boolean;
  branchId: string;
  orderNumber: string;
  fulfillmentType: FulfillmentType;
  initialLines: EditOrderLineDraft[];
  busy?: boolean;
  onClose: () => void;
  onSave: (input: {
    items: Array<{
      branchMenuItemId: string;
      quantity: number;
      optionIds: string[];
      note?: string;
    }>;
    reason?: string;
  }) => void;
};

function newKey() {
  return `line-${Math.random().toString(36).slice(2, 10)}`;
}

export function AdminEditOrderItemsModal({
  open,
  branchId,
  orderNumber,
  fulfillmentType,
  initialLines,
  busy = false,
  onClose,
  onSave,
}: Props) {
  const titleId = useId();
  const [lines, setLines] = useState<EditOrderLineDraft[]>([]);
  const [reason, setReason] = useState("");
  const [menus, setMenus] = useState<MenuApiItem[]>([]);
  const [menusLoading, setMenusLoading] = useState(false);
  const [menusError, setMenusError] = useState("");
  const [query, setQuery] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!open) return;
    setLines(initialLines.map((l) => ({ ...l, key: l.key || newKey() })));
    setReason("");
    setQuery("");
    setEditingKey(null);
    setFormError("");
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, initialLines]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setMenusLoading(true);
      setMenusError("");
      try {
        const res = await fetch(`/api/admin/branches/${branchId}/menu-items`);
        if (!res.ok) throw new Error("โหลดเมนูไม่สำเร็จ");
        const data = (await res.json()) as MenuApiItem[];
        if (!cancelled) {
          setMenus(data.filter((m) => !m.isHidden));
        }
      } catch {
        if (!cancelled) setMenusError("โหลดเมนูไม่สำเร็จ");
      } finally {
        if (!cancelled) setMenusLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, branchId]);

  const menuMap = useMemo(() => new Map(menus.map((m) => [m.id, m])), [menus]);
  const channel = fulfillmentToChannel(fulfillmentType);

  const filteredMenus = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return menus.slice(0, 40);
    return menus
      .filter((m) => m.name.toLowerCase().includes(q))
      .slice(0, 40);
  }, [menus, query]);

  const editing = editingKey
    ? lines.find((l) => l.key === editingKey) ?? null
    : null;
  const editingMenu = editing ? menuMap.get(editing.branchMenuItemId) : null;

  function addMenu(menu: MenuApiItem) {
    const key = newKey();
    setLines((prev) => [
      ...prev,
      {
        key,
        branchMenuItemId: menu.id,
        name: menu.name,
        quantity: 1,
        optionIds: [],
        note: "",
      },
    ]);
    setEditingKey(key);
    setFormError("");
  }

  function updateLine(key: string, patch: Partial<EditOrderLineDraft>) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
    if (editingKey === key) setEditingKey(null);
  }

  function handleSave() {
    setFormError("");
    if (lines.length < 1) {
      setFormError("ต้องมีรายการอย่างน้อย 1 รายการ");
      return;
    }
    for (const line of lines) {
      const menu = menuMap.get(line.branchMenuItemId);
      const groups = menu?.optionGroups ?? [];
      if (groups.length > 0) {
        const byGroup: Record<string, string[]> = {};
        for (const g of groups) {
          const allowed = new Set(g.options.map((o) => o.id));
          byGroup[g.id] = line.optionIds.filter((id) => allowed.has(id));
        }
        const err = validateOptionGroupSelections(groups, byGroup);
        if (err) {
          setEditingKey(line.key);
          setFormError(`${line.name}: ${err.error}`);
          return;
        }
      }
    }
    onSave({
      items: lines.map((l) => ({
        branchMenuItemId: l.branchMenuItemId,
        quantity: l.quantity,
        optionIds: l.optionIds,
        note: l.note.trim() || undefined,
      })),
      reason: reason.trim() || undefined,
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-2 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="ปิด"
        className="absolute inset-0"
        disabled={busy}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        <div className="border-b border-amber-100 bg-amber-50 px-5 py-4">
          <h2 id={titleId} className="text-base font-bold text-amber-950">
            แก้ไขรายการออเดอร์
          </h2>
          <p className="mt-1 text-sm text-amber-900/90">
            #{orderNumber} — แก้เมนู จำนวน และตัวเลือก (คืนสต๊อกแล้วหักใหม่ถ้าเคยตัด)
          </p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <p className={adminLabelClass}>รายการปัจจุบัน</p>
            {lines.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">ยังไม่มีรายการ</p>
            ) : (
              <ul className="mt-2 divide-y divide-gray-100 rounded-xl border border-gray-200">
                {lines.map((line) => {
                  const menu = menuMap.get(line.branchMenuItemId);
                  const priced = menu
                    ? resolveSellPrice(menu, channel)
                    : { final: 0 };
                  const groups = menu?.optionGroups ?? [];
                  const byGroup: Record<string, string[]> = {};
                  for (const g of groups) {
                    const allowed = new Set(g.options.map((o) => o.id));
                    byGroup[g.id] = line.optionIds.filter((id) =>
                      allowed.has(id),
                    );
                  }
                  const sel = computeSelectedOptions(groups, byGroup);
                  const unit = priced.final + sel.optionsPrice;
                  return (
                    <li
                      key={line.key}
                      className={`flex flex-wrap items-start gap-2 px-3 py-3 ${
                        editingKey === line.key ? "bg-amber-50/60" : ""
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900">{line.name}</p>
                        <p className="text-xs text-gray-600">
                          ฿{formatPrice(unit)} × {line.quantity}
                          {sel.optionNames.length
                            ? ` · ${sel.optionNames.join(", ")}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className={`${btnOutline} !px-2 !py-1 text-xs`}
                          disabled={busy}
                          onClick={() =>
                            setEditingKey(
                              editingKey === line.key ? null : line.key,
                            )
                          }
                        >
                          {editingKey === line.key ? "ปิด" : "แก้"}
                        </button>
                        <button
                          type="button"
                          className={`${btnOutline} !px-2 !py-1 text-xs text-red-700`}
                          disabled={busy}
                          onClick={() => removeLine(line.key)}
                        >
                          ลบ
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {editing && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
              <p className="text-sm font-semibold text-gray-900">
                แก้: {editing.name}
              </p>
              <label className="mt-3 block">
                <span className={adminLabelClass}>จำนวน</span>
                <input
                  type="number"
                  min={1}
                  max={99}
                  className={adminInputClass}
                  value={editing.quantity}
                  disabled={busy}
                  onChange={(e) =>
                    updateLine(editing.key, {
                      quantity: Math.max(
                        1,
                        Math.min(99, Number(e.target.value) || 1),
                      ),
                    })
                  }
                />
              </label>
              <label className="mt-3 block">
                <span className={adminLabelClass}>หมายเหตุบรรทัด</span>
                <input
                  type="text"
                  className={adminInputClass}
                  value={editing.note}
                  disabled={busy}
                  maxLength={200}
                  onChange={(e) =>
                    updateLine(editing.key, { note: e.target.value })
                  }
                />
              </label>
              {(editingMenu?.optionGroups ?? []).map((group) => {
                const allowed = new Set(group.options.map((o) => o.id));
                const selectedIds = editing.optionIds.filter((id) =>
                  allowed.has(id),
                );
                return (
                  <div key={group.id} className="mt-3">
                    <MenuOptionGroupPicker
                      group={group}
                      selectedIds={selectedIds}
                      compact
                      onChange={(ids) => {
                        const other = editing.optionIds.filter(
                          (id) => !allowed.has(id),
                        );
                        updateLine(editing.key, {
                          optionIds: [...other, ...ids],
                        });
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}

          <div>
            <p className={adminLabelClass}>เพิ่มเมนู</p>
            <input
              type="search"
              className={`${adminInputClass} mt-1`}
              placeholder="ค้นหาเมนู…"
              value={query}
              disabled={busy || menusLoading}
              onChange={(e) => setQuery(e.target.value)}
            />
            {menusError ? (
              <p className="mt-2 text-sm text-red-600">{menusError}</p>
            ) : menusLoading ? (
              <p className="mt-2 text-sm text-gray-500">กำลังโหลดเมนู…</p>
            ) : (
              <ul className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-gray-200">
                {filteredMenus.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                      disabled={busy}
                      onClick={() => addMenu(m)}
                    >
                      <span className="font-medium text-gray-900">{m.name}</span>
                      <span className="text-xs text-gray-500">
                        ฿{formatPrice(resolveSellPrice(m, channel).final)}
                      </span>
                    </button>
                  </li>
                ))}
                {filteredMenus.length === 0 ? (
                  <li className="px-3 py-3 text-sm text-gray-500">ไม่พบเมนู</li>
                ) : null}
              </ul>
            )}
          </div>

          <label className="block">
            <span className={adminLabelClass}>เหตุผล (ไม่บังคับ)</span>
            <input
              type="text"
              className={adminInputClass}
              value={reason}
              disabled={busy}
              maxLength={300}
              placeholder="เช่น ลูกค้าขอเปลี่ยนเมนู"
              onChange={(e) => setReason(e.target.value)}
            />
          </label>

          {formError ? (
            <p className="text-sm text-red-600">{formError}</p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <button
            type="button"
            className={btnOutline}
            disabled={busy}
            onClick={onClose}
          >
            ยกเลิก
          </button>
          <button
            type="button"
            className={btnPrimary}
            disabled={busy}
            onClick={handleSave}
          >
            {busy ? "กำลังบันทึก…" : "บันทึกรายการ"}
          </button>
        </div>
      </div>
    </div>
  );
}
