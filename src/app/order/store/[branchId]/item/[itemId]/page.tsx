"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { formatPrice } from "@/lib/constants";
import type { BranchData, MenuItemData, MenuOptionGroupData } from "@/lib/customer-types";
import { useCustomer } from "@/components/customer/CustomerProvider";
import {
  menuItemSellPrice,
  menuItemVisibleForFulfillment,
} from "@/components/customer/MenuChannelPrice";
import { LoadingState } from "@/components/LoadingState";
import {
  IconCheck,
  IconLabel,
  IconMinus,
  IconNote,
  IconPlus,
  IconSkewerPlaceholder,
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
          checked ? "border-site-primary bg-site-primary" : "border-gray-300 bg-white"
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
        checked ? "border-site-primary bg-site-primary" : "border-gray-300 bg-white"
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

  const priced = useMemo(
    () => (item ? menuItemSellPrice(item, fulfillment) : null),
    [item, fulfillment],
  );
  const itemBasePrice = priced?.final ?? 0;
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
    if (!menuItemVisibleForFulfillment(item, fulfillment)) {
      setError("เมนูนี้ไม่จำหน่ายในช่องทางที่เลือก");
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
      <main className="flex min-h-screen items-center justify-center bg-[#f5f5f6] px-4">
        <LoadingState className="w-full max-w-sm border-0 bg-transparent shadow-none" />
      </main>
    );
  }

  if (!branch || !item || !priced || !menuItemVisibleForFulfillment(item, fulfillment)) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#f5f5f6]">
        <p className="text-gray-500">ไม่พบเมนูนี้</p>
        <Link href={`/order/store/${branchId}`} className="text-site-primary underline">
          กลับหน้าเมนู
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white pb-24">
      <div className="relative w-full aspect-[4/3] bg-gray-100">
        <button
          type="button"
          onClick={() => router.back()}
          className="absolute left-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md text-gray-800 hover:bg-gray-50"
          aria-label="ปิด"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
        
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt={item.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-site-primary-soft">
            <IconSkewerPlaceholder size={64} />
          </div>
        )}
      </div>

      <header className="bg-white px-4 py-4">
        <h1 className="text-[22px] font-bold text-gray-900">{item.name}</h1>
        {item.description && (
          <p className="mt-1 text-[15px] text-gray-500 leading-relaxed">{item.description}</p>
        )}
      </header>

      <div className="h-2 w-full bg-[#f5f5f6]"></div>

      <section className="bg-white">
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
                  <p className="text-[15px] font-bold text-site-primary">
                    {group.name}
                    {group.required ? (
                      <span className="ml-0.5 text-site-primary/70">*</span>
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
                          } ${active ? "bg-site-primary-soft/40" : ""}`}
                        >
                          <span className="min-w-0 flex-1">
                            <span className={`text-[15px] ${active ? "font-semibold text-gray-900" : "text-gray-800"}`}>
                              {opt.name}
                            </span>
                            {Number(opt.priceDelta) > 0 && (
                              <span className="ml-1.5 text-[15px] font-medium text-site-primary">
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

      <div className="h-2 w-full bg-[#f5f5f6]"></div>

      <section className="bg-white p-4">
        <IconLabel icon={IconNote} className="mb-2 text-[15px] font-bold text-site-primary" iconClassName="text-site-primary">
          หมายเหตุ (ต่อไม้)
          <span className="ml-1 text-sm font-normal text-gray-400">(ไม่บังคับ)</span>
        </IconLabel>
        <textarea
          className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[15px] text-gray-900 placeholder:text-gray-500 focus:border-site-primary focus:outline-none focus:ring-2 ring-site-primary"
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

      <div className="fixed bottom-0 left-1/2 z-20 flex w-full max-w-md -translate-x-1/2 items-center gap-4 border-t bg-white px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-600 active:bg-gray-200"
            aria-label="ลดจำนวน"
          >
            <IconMinus size={18} />
          </button>
          <span className="w-5 text-center text-[17px] font-bold text-gray-900">
            {qty}
          </span>
          <button
            type="button"
            onClick={() => setQty((q) => q + 1)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-600 active:bg-gray-200"
            aria-label="เพิ่มจำนวน"
          >
            <IconPlus size={18} />
          </button>
        </div>

        <button
          type="button"
          onClick={addToCart}
          className="flex flex-1 items-center justify-between rounded-xl bg-site-primary px-4 py-3 font-bold text-white hover:opacity-90"
        >
          <span className="text-[17px]">ใส่ตะกร้า</span>
          <span className="text-[17px]">฿{formatPrice(lineTotal)}</span>
        </button>
      </div>
    </main>
  );
}

