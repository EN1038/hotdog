"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { formatPrice } from "@/lib/constants";
import type { BranchData, MenuItemData, MenuOptionGroupData } from "@/lib/customer-types";
import { useCustomer } from "@/components/customer/CustomerProvider";
import {
  IconBack,
  IconCheck,
  IconLabel,
  IconMinus,
  IconNote,
  IconPin,
  IconPlus,
  IconSkewerPlaceholder,
  IconStore,
} from "@/components/icons";

type SelectedByGroup = Record<string, string[]>;

function CheckIndicator({
  checked,
  variant,
}: {
  checked: boolean;
  variant: "radio" | "checkbox";
}) {
  if (variant === "radio") {
    return (
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
          checked ? "border-orange-500 bg-orange-500" : "border-gray-300 bg-white"
        }`}
        aria-hidden
      >
        {checked && <span className="h-2 w-2 rounded-full bg-white" />}
      </span>
    );
  }

  return (
    <span
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
        checked ? "border-orange-500 bg-orange-500" : "border-gray-300 bg-white"
      }`}
      aria-hidden
    >
      {checked && <IconCheck size={14} className="text-white" />}
    </span>
  );
}

function validateSelections(
  optionGroups: MenuOptionGroupData[],
  selectedByGroup: SelectedByGroup,
) {
  for (const group of optionGroups) {
    if (!group.required) continue;
    const selected = selectedByGroup[group.id] ?? [];
    if (selected.length === 0) return `กรุณาเลือก "${group.name}"`;
  }
  return null;
}

function computeOptions(
  item: MenuItemData,
  selectedByGroup: SelectedByGroup,
): { optionIds: string[]; optionNames: string[]; optionsPrice: number } {
  const optionIds = Object.values(selectedByGroup).flat();
  const allOptions = item.optionGroups.flatMap((g) => g.options);
  const chosen = optionIds
    .map((id) => allOptions.find((o) => o.id === id))
    .filter((o): o is NonNullable<typeof o> => Boolean(o));
  return {
    optionIds: chosen.map((o) => o.id),
    optionNames: chosen.map((o) => o.name),
    optionsPrice: chosen.reduce((s, o) => s + Number(o.priceDelta), 0),
  };
}

export default function ItemDetailPage() {
  const { branchId, itemId } = useParams<{ branchId: string; itemId: string }>();
  const router = useRouter();
  const { cart, cartBranchId, addLine, fulfillment } = useCustomer();

  const [branch, setBranch] = useState<BranchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [selectedByGroup, setSelectedByGroup] = useState<SelectedByGroup>({});
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/customer/branches")
      .then((res) => res.json())
      .then((data: BranchData[] | unknown) => {
        const branches = Array.isArray(data) ? data : [];
        setBranch(branches.find((b) => b.id === branchId) ?? null);
      })
      .finally(() => setLoading(false));
  }, [branchId]);

  const item = useMemo(() => {
    return branch?.menuItems.find((m) => m.id === itemId) ?? null;
  }, [branch, itemId]);

  useEffect(() => {
    if (!item) return;
    const initial: SelectedByGroup = {};
    for (const group of item.optionGroups) initial[group.id] = [];
    setSelectedByGroup(initial);
  }, [itemId, item]);

  const cartCount = useMemo(() => cart.reduce((s, l) => s + l.quantity, 0), [cart]);
  const itemBasePrice = item ? Number(item.price) : 0;
  const computed = useMemo(
    () => (item ? computeOptions(item, selectedByGroup) : null),
    [item, selectedByGroup],
  );
  const unitTotal = item ? itemBasePrice + (computed?.optionsPrice ?? 0) : 0;
  const lineTotal = unitTotal * qty;

  function toggleOption(groupId: string, optionId: string, maxSelect: number) {
    setSelectedByGroup((prev) => {
      const current = prev[groupId] ?? [];
      const has = current.includes(optionId);
      let next: string[] = current;
      if (has) {
        next = current.filter((id) => id !== optionId);
      } else if (maxSelect <= 1) {
        next = [optionId];
      } else if (current.length < maxSelect) {
        next = [...current, optionId];
      }
      return { ...prev, [groupId]: next };
    });
  }

  function addToCart() {
    setError("");
    if (!item || !branch) return;
    if (cartBranchId && cartBranchId !== branch.id) {
      setError("ตะกร้ามีของจากสาขาอื่นอยู่ กรุณาเคลียร์ตะกร้าก่อน");
      return;
    }
    if (item.isOutOfStock) {
      setError("เมนูนี้หมดชั่วคราว");
      return;
    }
    const validationError = validateSelections(item.optionGroups, selectedByGroup);
    if (validationError) {
      setError(validationError);
      return;
    }
    const opts = computeOptions(item, selectedByGroup);
    addLine(branch.id, {
      branchMenuItemId: item.id,
      name: item.name,
      unitPrice: itemBasePrice,
      quantity: qty,
      optionIds: opts.optionIds,
      optionNames: opts.optionNames,
      optionsPrice: opts.optionsPrice,
      note: note.trim() || undefined,
    });
    router.push(`/order/store/${branch.id}`);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f5f6]">
        <p className="text-sm text-gray-400">กำลังโหลด...</p>
      </main>
    );
  }

  if (!branch || !item) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#f5f5f6]">
        <p className="text-gray-500">ไม่พบเมนูนี้</p>
        <Link href={`/order/store/${branchId}`} className="text-orange-500 underline">
          กลับหน้าเมนู
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f5f6] pb-44">
      <header className="bg-white px-4 pb-4 pt-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-3 flex h-9 w-9 items-center justify-center rounded-full text-gray-800 hover:bg-gray-100"
          aria-label="กลับ"
        >
          <IconBack size={22} />
        </button>

        <div className="flex gap-3">
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt={item.name}
              className="h-[84px] w-[84px] shrink-0 rounded-2xl object-cover"
            />
          ) : (
            <div className="flex h-[84px] w-[84px] shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-red-100 to-orange-50">
              <IconSkewerPlaceholder size={48} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[18px] font-bold text-gray-900">{item.name}</p>
            {item.description && (
              <p className="mt-1 text-sm text-gray-500">{item.description}</p>
            )}
            <p className="mt-2 text-lg font-bold text-orange-500">
              ฿{formatPrice(item.price)}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-3 py-1">
            <IconStore size={14} />
            {branch.name}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-3 py-1">
            {fulfillment === "DELIVERY" ? (
              <>
                <IconPin size={14} />
                จัดส่ง
              </>
            ) : (
              <>
                <IconStore size={14} />
                รับที่ร้าน
              </>
            )}
          </span>
        </div>
      </header>

      <section className="mx-4 mt-3 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
        {item.optionGroups.length === 0 ? (
          <div className="px-4 py-4">
            <p className="text-sm text-gray-500">เมนูนี้ไม่มีตัวเลือกเพิ่มเติม</p>
          </div>
        ) : (
          item.optionGroups.map((group, gi) => {
            const isSingle = group.maxSelect <= 1;
            const selected = selectedByGroup[group.id] ?? [];
            const selectedCount = selected.length;
            return (
              <div key={group.id} className={gi > 0 ? "border-t border-gray-100" : ""}>
                <div className="px-4 pb-1 pt-4">
                  <p className="text-[15px] font-bold text-orange-500">
                    {group.name}
                    {group.required ? (
                      <span className="ml-0.5 text-orange-400">*</span>
                    ) : (
                      <span className="text-sm font-normal text-gray-400"> (ไม่บังคับ)</span>
                    )}
                  </p>
                  {!isSingle && group.maxSelect > 1 && (
                    <p className="mt-0.5 text-xs text-gray-400">
                      เลือกได้สูงสุด {group.maxSelect}
                      {selectedCount > 0 && ` • เลือกแล้ว ${selectedCount}`}
                    </p>
                  )}
                </div>
                <ul className="pb-2">
                  {group.options.map((opt) => {
                    const active = selected.includes(opt.id);
                    const atMax = !isSingle && !active && selectedCount >= group.maxSelect;
                    return (
                      <li key={opt.id}>
                        <button
                          type="button"
                          disabled={atMax}
                          onClick={() => toggleOption(group.id, opt.id, group.maxSelect)}
                          className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                            atMax ? "cursor-not-allowed opacity-40" : "active:bg-gray-50"
                          } ${active ? "bg-orange-50/40" : ""}`}
                        >
                          <span className="min-w-0 flex-1">
                            <span className={`text-[15px] ${active ? "font-semibold text-gray-900" : "text-gray-800"}`}>
                              {opt.name}
                            </span>
                            {Number(opt.priceDelta) > 0 && (
                              <span className="ml-1.5 text-[15px] font-medium text-orange-500">
                                +฿{formatPrice(opt.priceDelta)}
                              </span>
                            )}
                          </span>
                          <CheckIndicator checked={active} variant={isSingle ? "radio" : "checkbox"} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })
        )}
      </section>

      <section className="mx-4 mt-3 overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
        <IconLabel icon={IconNote} className="mb-2 text-[15px] font-bold text-orange-500" iconClassName="text-orange-500">
          หมายเหตุ (ต่อไม้)
          <span className="ml-1 text-sm font-normal text-gray-400">(ไม่บังคับ)</span>
        </IconLabel>
        <textarea
          className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[15px] text-gray-900 placeholder:text-gray-500 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="เช่น ไม่ใส่ผักชี / เผ็ดน้อย"
          rows={2}
          maxLength={200}
        />
        <p className="mt-1 text-right text-[11px] text-gray-400">
          {note.length}/200
        </p>
      </section>

      {error && (
        <p className="mx-4 mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="fixed bottom-0 left-1/2 z-20 w-full max-w-md -translate-x-1/2 border-t bg-white p-4 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-900">จำนวน</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-orange-300 text-orange-500"
              aria-label="ลดจำนวน"
            >
              <IconMinus size={16} />
            </button>
            <span className="w-8 text-center text-base font-bold text-gray-900">
              {qty}
            </span>
            <button
              type="button"
              onClick={() => setQty((q) => q + 1)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-500 text-white hover:bg-orange-600"
              aria-label="เพิ่มจำนวน"
            >
              <IconPlus size={16} />
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={addToCart}
          className="flex w-full items-center justify-between rounded-xl bg-orange-500 px-4 py-3.5 font-semibold text-white hover:bg-orange-600"
        >
          <span>เพิ่มเข้าตะกร้า</span>
          <span>฿{formatPrice(lineTotal)}</span>
        </button>
        <p className="mt-2 text-center text-xs text-gray-400">
          ตะกร้า {cartCount} ชิ้น
        </p>
      </div>
    </main>
  );
}

