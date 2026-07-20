"use client";

import { useMemo, useState } from "react";
import { formatPrice } from "@/lib/constants";
import type { MenuOptionData, MenuOptionGroupData } from "@/lib/customer-types";
import {
  adjustOptionQty,
  groupUsesQuantityPicker,
  optionIdsToQtyMap,
  qtyMapToOptionIds,
  selectionCount,
} from "@/lib/option-selection";
import { IconPlus, IconSkewerPlaceholder } from "@/components/icons";

type Props = {
  group: MenuOptionGroupData;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  highlightError?: boolean;
};

function OptionThumb({
  name,
  imageUrl,
  size = 56,
}: {
  name: string;
  imageUrl?: string | null;
  size?: number;
}) {
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-xl bg-site-primary-soft"
      style={{ width: size, height: size }}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <IconSkewerPlaceholder size={Math.round(size * 0.55)} />
        </div>
      )}
      <span className="sr-only">{name}</span>
    </div>
  );
}

function CategoryFilterBar({
  categories,
  value,
  onChange,
}: {
  categories: Array<{ id: string; name: string }>;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
      <button
        type="button"
        onClick={() => onChange("ALL")}
        className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${
          value === "ALL"
            ? "bg-site-primary text-white"
            : "bg-gray-100 text-gray-700"
        }`}
      >
        ทั้งหมด
      </button>
      {categories.map((cat) => (
        <button
          key={cat.id}
          type="button"
          onClick={() => onChange(cat.id)}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${
            value === cat.id
              ? "bg-site-primary text-white"
              : "bg-gray-100 text-gray-700"
          }`}
        >
          {cat.name}
        </button>
      ))}
    </div>
  );
}

function useMenuOptionCategories(options: MenuOptionData[]) {
  return useMemo(() => {
    const map = new Map<string, { id: string; name: string; sortOrder: number }>();
    for (const opt of options) {
      const id = opt.categoryId ?? "__other__";
      const name = opt.categoryName ?? "อื่นๆ";
      const sortOrder = opt.categorySortOrder ?? 999;
      if (!map.has(id)) map.set(id, { id, name, sortOrder });
    }
    return [...map.values()].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "th"),
    );
  }, [options]);
}

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
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
          checked ? "border-site-primary" : "border-gray-300"
        }`}
      >
        {checked ? (
          <span className="h-2.5 w-2.5 rounded-full bg-site-primary" />
        ) : null}
      </span>
    );
  }
  return (
    <span
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
        checked ? "border-site-primary bg-site-primary text-white" : "border-gray-300"
      }`}
    >
      {checked ? (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M2 6l3 3 5-5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </span>
  );
}

export function MenuOptionGroupPicker({
  group,
  selectedIds,
  onChange,
  highlightError,
}: Props) {
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const selectedCount = selectionCount(selectedIds);
  const useQty = groupUsesQuantityPicker(group);
  const fromMenu = group.mode === "FROM_MENU";
  const categories = useMenuOptionCategories(group.options);
  const showCategoryFilter = fromMenu && categories.length > 1;

  const visibleOptions = useMemo(() => {
    if (!showCategoryFilter || categoryFilter === "ALL") return group.options;
    return group.options.filter(
      (o) => (o.categoryId ?? "__other__") === categoryFilter,
    );
  }, [group.options, showCategoryFilter, categoryFilter]);

  const min =
    group.minSelect > 0 ? group.minSelect : group.required ? 1 : 0;
  const subtitle = useQty
    ? min === group.maxSelect && min > 0
      ? `เลือกให้ครบ ${min} รายการ • เลือกแล้ว ${selectedCount}/${group.maxSelect}`
      : `เลือกได้สูงสุด ${group.maxSelect} • เลือกแล้ว ${selectedCount}`
    : group.maxSelect > 1
      ? `เลือกได้สูงสุด ${group.maxSelect}${
          selectedCount > 0 ? ` • เลือกแล้ว ${selectedCount}` : ""
        }`
      : null;

  if (useQty) {
    const qtyMap = optionIdsToQtyMap(selectedIds);
    return (
      <div>
        {subtitle && (
          <p
            className={`mt-0.5 text-[13px] ${
              highlightError ? "text-red-500" : "text-gray-400"
            }`}
          >
            {subtitle}
          </p>
        )}
        {showCategoryFilter ? (
          <CategoryFilterBar
            categories={categories}
            value={categoryFilter}
            onChange={setCategoryFilter}
          />
        ) : null}
        <ul className="pb-2">
          {visibleOptions.map((opt) => {
            const qty = qtyMap[opt.id] ?? 0;
            const disabled = opt.isOutOfStock;
            const atMax = selectedCount >= group.maxSelect;
            const showThumb = fromMenu || Boolean(opt.imageUrl);
            return (
              <li
                key={opt.id}
                className={`flex w-full items-center gap-3 border-b border-gray-50 px-4 py-3 last:border-b-0 ${
                  disabled ? "opacity-50" : ""
                }`}
              >
                {showThumb ? (
                  <OptionThumb name={opt.name} imageUrl={opt.imageUrl} />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium leading-snug text-gray-900">
                    {opt.name}
                  </p>
                  {opt.isOutOfStock ? (
                    <p className="mt-0.5 text-xs text-gray-400">หมดชั่วคราว</p>
                  ) : null}
                  {Number(opt.priceDelta) > 0 && (
                    <p className="mt-0.5 text-[14px] font-medium text-site-primary">
                      +฿{formatPrice(opt.priceDelta)}
                    </p>
                  )}
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-2 pl-2">
                  <button
                    type="button"
                    disabled={disabled || qty <= 0}
                    onClick={() =>
                      onChange(
                        qtyMapToOptionIds(
                          adjustOptionQty(qtyMap, opt.id, -1, group.maxSelect),
                        ),
                      )
                    }
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-lg text-gray-700 disabled:opacity-40"
                    aria-label={`ลด ${opt.name}`}
                  >
                    −
                  </button>
                  <span className="w-7 text-center text-sm font-bold tabular-nums">
                    {qty}
                  </span>
                  <button
                    type="button"
                    disabled={disabled || atMax}
                    onClick={() =>
                      onChange(
                        qtyMapToOptionIds(
                          adjustOptionQty(qtyMap, opt.id, 1, group.maxSelect),
                        ),
                      )
                    }
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-site-primary text-white disabled:opacity-40"
                    aria-label={`เพิ่ม ${opt.name}`}
                  >
                    <IconPlus size={16} />
                  </button>
                </div>
              </li>
            );
          })}
          {visibleOptions.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-gray-500">
              ไม่มีเมนูในหมวดนี้
            </li>
          )}
        </ul>
      </div>
    );
  }

  const isSingle = group.maxSelect <= 1;

  function toggle(optionId: string) {
    const has = selectedIds.includes(optionId);
    if (has) {
      onChange(selectedIds.filter((id) => id !== optionId));
    } else if (isSingle) {
      onChange([optionId]);
    } else if (selectedCount < group.maxSelect) {
      onChange([...selectedIds, optionId]);
    }
  }

  return (
    <div>
      {subtitle && (
        <p
          className={`mt-0.5 text-[13px] ${
            highlightError ? "text-red-500" : "text-gray-400"
          }`}
        >
          {subtitle}
        </p>
      )}
      {showCategoryFilter ? (
        <CategoryFilterBar
          categories={categories}
          value={categoryFilter}
          onChange={setCategoryFilter}
        />
      ) : null}
      <ul className="pb-2">
        {visibleOptions.map((opt) => {
          const active = selectedIds.includes(opt.id);
          const atMax = !isSingle && !active && selectedCount >= group.maxSelect;
          const showThumb = fromMenu || Boolean(opt.imageUrl);
          return (
            <li key={opt.id}>
              <button
                type="button"
                disabled={atMax || opt.isOutOfStock}
                onClick={() => toggle(opt.id)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                  atMax || opt.isOutOfStock
                    ? "cursor-not-allowed opacity-40"
                    : "active:bg-gray-50"
                } ${active ? "bg-site-primary-soft/40" : ""}`}
              >
                {showThumb ? (
                  <OptionThumb name={opt.name} imageUrl={opt.imageUrl} size={48} />
                ) : null}
                <span className="min-w-0 flex-1">
                  <span
                    className={`text-[15px] ${
                      active ? "font-semibold text-gray-900" : "text-gray-800"
                    }`}
                  >
                    {opt.name}
                  </span>
                  {Number(opt.priceDelta) > 0 && (
                    <span className="ml-1.5 text-[15px] font-medium text-site-primary">
                      +฿{formatPrice(opt.priceDelta)}
                    </span>
                  )}
                </span>
                <CheckIndicator
                  checked={active}
                  variant={isSingle ? "radio" : "checkbox"}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
