"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
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
import {
  clearMenuItemScroll,
  markMenuItemScroll,
} from "@/lib/menu-scroll-restore";
import { MenuOptionGroupPicker } from "@/components/customer/MenuOptionGroupPicker";
import {
  computeSelectedOptions,
  validateOptionGroupSelections,
  type SelectedByGroup,
} from "@/lib/option-selection";
import {
  applyOptionDefaultsToGroups,
  loadBranchOptionDefaults,
  rememberGroupSelection,
} from "@/lib/option-defaults-prefs";

export default function ItemDetailPage() {
  const { branchId, itemId } = useParams<{ branchId: string; itemId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editKey = searchParams.get("editKey");
  const isNew = searchParams.get("new") === "1";
  const returnTo = searchParams.get("returnTo");
  const { cart, cartBranchId, addLine, replaceLine, removeLine, fulfillment } =
    useCustomer();

  const [branch, setBranch] = useState<BranchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [selectedByGroup, setSelectedByGroup] = useState<SelectedByGroup>({});
  const [error, setError] = useState("");
  const [errorGroupId, setErrorGroupId] = useState<string | null>(null);
  const [existingKey, setExistingKey] = useState<string | null>(null);
  const optionInitKeyRef = useRef<string | null>(null);

  useEffect(() => {
    fetch("/api/customer/branches")
      .then((res) => res.json())
      .then((data: BranchData[] | unknown) => {
        const branches = Array.isArray(data) ? data : [];
        setBranch(branches.find((b) => b.id === branchId) ?? null);
      })
      .finally(() => setLoading(false));
  }, [branchId]);

  // Editing from checkout must not restore scroll on the store menu later.
  useEffect(() => {
    if (returnTo) clearMenuItemScroll();
  }, [returnTo]);

  // Ensure restore marker exists when leaving detail back to this store menu
  // (covers direct links / refresh / add-to-cart push, not only list clicks).
  useEffect(() => {
    if (returnTo) return;
    if (branchId && itemId) markMenuItemScroll(branchId, itemId);
  }, [branchId, itemId, returnTo]);

  const item = useMemo(() => {
    return branch?.menuItems.find((m) => m.id === itemId) ?? null;
  }, [branch, itemId]);

  useEffect(() => {
    if (!item) return;
    const menuItem = item;

    const sessionKey = `${itemId}|${editKey ?? ""}|${isNew ? 1 : 0}`;

    function applyFromLine(existingLine: (typeof cart)[number]) {
      setExistingKey(existingLine.key);
      setQty(existingLine.quantity);
      setNote(existingLine.note || "");
      const initial: SelectedByGroup = {};
      for (const group of menuItem.optionGroups) {
        const groupOptionIds = group.options.map((o) => o.id);
        initial[group.id] = existingLine.optionIds.filter((id) =>
          groupOptionIds.includes(id),
        );
      }
      setSelectedByGroup(initial);
    }

    if (editKey) {
      const existingLine = cart.find((l) => l.key === editKey);
      if (!existingLine) return;
      if (optionInitKeyRef.current === sessionKey) return;
      optionInitKeyRef.current = sessionKey;
      applyFromLine(existingLine);
      return;
    }

    if (optionInitKeyRef.current === sessionKey) return;
    optionInitKeyRef.current = sessionKey;

    if (!isNew) {
      const existingLine = cart.find((l) => l.branchMenuItemId === menuItem.id);
      if (existingLine) {
        applyFromLine(existingLine);
        return;
      }
    }

    setExistingKey(null);
    setQty(1);
    setNote("");
    const remembered = loadBranchOptionDefaults(branchId);
    setSelectedByGroup(
      applyOptionDefaultsToGroups(menuItem.optionGroups, remembered),
    );
  }, [itemId, editKey, isNew, item, cart, branchId]);

  const priced = useMemo(
    () => (item ? menuItemSellPrice(item, fulfillment) : null),
    [item, fulfillment],
  );
  const itemBasePrice = priced?.final ?? 0;
  const computed = useMemo(
    () =>
      item ? computeSelectedOptions(item.optionGroups, selectedByGroup) : null,
    [item, selectedByGroup],
  );
  const unitTotal = item ? itemBasePrice + (computed?.optionsPrice ?? 0) : 0;
  const lineTotal = unitTotal * qty;

  function addToCart() {
    setError("");
    if (!item || !branch) return;

    // Editing an existing cart line down to 0 = remove it
    if (existingKey && qty <= 0) {
      removeLine(existingKey);
      if (returnTo) {
        clearMenuItemScroll();
        router.push(returnTo);
      } else {
        markMenuItemScroll(branch.id, item.id);
        router.push(`/order/store/${branch.id}`);
      }
      return;
    }

    if (qty < 1) {
      setError("กรุณาเลือกจำนวนอย่างน้อย 1");
      return;
    }

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
    const validation = validateOptionGroupSelections(
      item.optionGroups,
      selectedByGroup,
    );
    if (validation) {
      setError(validation.error);
      setErrorGroupId(validation.groupId);
      // Give a tiny delay for React to render the error message before scrolling to center it accurately
      setTimeout(() => {
        document.getElementById(`option-group-${validation.groupId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
      return;
    }
    const opts = computeSelectedOptions(item.optionGroups, selectedByGroup);
    const newLine = {
      branchMenuItemId: item.id,
      name: item.name,
      unitPrice: itemBasePrice,
      quantity: qty,
      optionIds: opts.optionIds,
      optionNames: opts.optionNames,
      optionsPrice: opts.optionsPrice,
      note: note.trim() || undefined,
    };

    if (existingKey) {
      replaceLine(existingKey, newLine);
    } else {
      addLine(branch.id, newLine);
    }
    if (returnTo) {
      clearMenuItemScroll();
      router.push(returnTo);
    } else {
      markMenuItemScroll(branch.id, item.id);
      router.push(`/order/store/${branch.id}`);
    }
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
        <Link
          href={`/order/store/${branchId}`}
          onClick={() => {
            if (itemId) markMenuItemScroll(branchId, itemId);
          }}
          className="text-site-primary underline"
        >
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
          onClick={() => {
            if (returnTo) {
              clearMenuItemScroll();
              router.push(returnTo);
            } else {
              markMenuItemScroll(branchId, itemId);
              // Prefer explicit store URL so remount always restores scroll.
              router.push(`/order/store/${branchId}`);
            }
          }}
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
          item.optionGroups.map((group, gi) => (
              <div
                id={`option-group-${group.id}`}
                key={group.id}
                className={`transition-colors duration-300 ${gi > 0 ? "border-t border-gray-100" : ""} ${errorGroupId === group.id ? "bg-red-50/30" : ""}`}
              >
                <div className="flex items-start justify-between gap-4 px-4 pb-1 pt-4">
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-[16px] font-bold ${errorGroupId === group.id ? "text-red-600" : "text-gray-900"}`}
                    >
                      {group.name}
                    </p>
                  </div>
                  <div className="shrink-0 mt-0.5">
                    {group.required ? (
                      <span
                        className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-bold ${errorGroupId === group.id ? "bg-red-100 text-red-700" : "bg-orange-100 text-site-primary"}`}
                      >
                        จำเป็น
                      </span>
                    ) : (
                      <span className="inline-block rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-500">
                        ไม่จำเป็น
                      </span>
                    )}
                  </div>
                </div>

                <div className="px-4 pb-1">
                  <MenuOptionGroupPicker
                    group={group}
                    selectedIds={selectedByGroup[group.id] ?? []}
                    onChange={(ids) => {
                      setSelectedByGroup((prev) => ({
                        ...prev,
                        [group.id]: ids,
                      }));
                      rememberGroupSelection(branchId, group, ids);
                      if (ids.length > 0 && errorGroupId === group.id) {
                        setErrorGroupId(null);
                        setError("");
                      }
                    }}
                    highlightError={errorGroupId === group.id}
                  />
                </div>

                {errorGroupId === group.id && error ? (
                  <div className="mx-4 mt-1 mb-2 flex items-center gap-2 rounded-lg bg-red-100 px-3 py-2 text-[13px] font-medium text-red-600">
                    {error}
                  </div>
                ) : null}
              </div>
            ))
        )}
      </section>

      <div className="h-2 w-full bg-[#f5f5f6]"></div>

      <section className="bg-white p-4">
        <IconLabel icon={IconNote} className="mb-2 text-[15px] font-bold text-site-primary" iconClassName="text-site-primary">
          หมายเหตุ
          <span className="ml-1 text-[13px] font-normal text-gray-400">(ไม่จำเป็น)</span>
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

      <div className="fixed bottom-0 left-1/2 z-20 flex w-full max-w-md -translate-x-1/2 items-center gap-4 bg-white px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() =>
              setQty((q) => Math.max(existingKey ? 0 : 1, q - 1))
            }
            disabled={!existingKey && qty <= 1}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-600 active:bg-gray-200 disabled:opacity-40"
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
          className={`flex flex-1 items-center justify-between rounded-xl px-4 py-3 font-bold text-white hover:opacity-90 ${
            existingKey && qty <= 0 ? "bg-red-500" : "bg-site-primary"
          }`}
        >
          <span className="text-[17px]">
            {existingKey && qty <= 0
              ? "ลบออกจากตะกร้า"
              : existingKey
                ? "อัปเดตตะกร้า"
                : "ใส่ตะกร้า"}
          </span>
          <span className="text-[17px]">
            {existingKey && qty <= 0 ? "" : `฿${formatPrice(lineTotal)}`}
          </span>
        </button>
      </div>
    </main>
  );
}

