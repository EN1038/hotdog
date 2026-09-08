"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/constants";
import {
  OPTION_FILTER_NONE,
  optionFilterLabel,
  type OptionQtySlice,
} from "@/lib/order-option-tokens";
import type { CookBreakdown } from "@/lib/cook-method";
import { IconLinkSuffix, IconTrend } from "@/components/icons";

type TopSellerRow = {
  name: string;
  quantity: number;
  revenueBaht: number;
};

type Chip = {
  id: string | null;
  label: string;
  count: number;
};

type Props = {
  from: string;
  to: string;
  branchId?: string | null;
  href: string;
  title?: string;
  linkLabel?: string;
  limit?: number;
  defaultOpen?: boolean;
  /** false = always show list, no toggle (summary page) */
  collapsible?: boolean;
};

function OverviewShowSwitch({
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
      className={`relative h-8 w-14 shrink-0 rounded-full transition ${
        checked ? "bg-site-primary" : "bg-slate-300"
      }`}
    >
      <span
        className="absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition"
        style={{ left: checked ? "1.65rem" : "0.2rem" }}
      />
    </button>
  );
}

function chipsFromSummaries(
  optionSummary: OptionQtySlice[],
  cookSummary: CookBreakdown | null,
): Chip[] {
  const fromOptions = optionSummary.filter((o) => o.quantity > 0);
  if (fromOptions.length > 0) {
    const total = fromOptions.reduce((s, o) => s + o.quantity, 0);
    return [
      { id: null, label: "รวมทั้งหมด", count: total },
      ...fromOptions.map((o) => ({
        id: o.name,
        label:
          o.name === OPTION_FILTER_NONE
            ? "ไม่มีตัวเลือก"
            : `อันดับ${o.name}`,
        count: o.quantity,
      })),
    ];
  }

  if (!cookSummary) return [];
  const parts: Chip[] = [];
  if (cookSummary.grill.quantity > 0) {
    parts.push({
      id: "ย่าง",
      label: "อันดับย่าง",
      count: cookSummary.grill.quantity,
    });
  }
  if (cookSummary.fry.quantity > 0) {
    parts.push({
      id: "ทอด",
      label: "อันดับทอด",
      count: cookSummary.fry.quantity,
    });
  }
  if (cookSummary.unknown.quantity > 0) {
    parts.push({
      id: OPTION_FILTER_NONE,
      label: "ไม่มีตัวเลือก",
      count: cookSummary.unknown.quantity,
    });
  }
  if (parts.length === 0) return [];
  const total = parts.reduce((s, p) => s + p.count, 0);
  return [{ id: null, label: "รวมทั้งหมด", count: total }, ...parts];
}

export function OwnerHomeTopSellersPanel({
  from,
  to,
  branchId = null,
  href,
  title = "เมนูขายดี",
  linkLabel = "วิเคราะห์",
  limit = 5,
  defaultOpen = true,
  collapsible = true,
}: Props) {
  const [show, setShow] = useState(collapsible ? defaultOpen : true);
  const open = collapsible ? show : true;
  const [optionFilter, setOptionFilter] = useState<string | null>(null);
  const [items, setItems] = useState<TopSellerRow[]>([]);
  const [optionSummary, setOptionSummary] = useState<OptionQtySlice[]>([]);
  const [cookSummary, setCookSummary] = useState<CookBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setLoadError(false);
    void (async () => {
      try {
        const params = new URLSearchParams({
          from,
          to,
          sort: "quantity",
          limit: "10",
        });
        if (branchId) params.set("branchId", branchId);
        if (optionFilter) params.set("option", optionFilter);
        const res = await fetch(`/api/owner/top-sellers?${params}`, {
          signal: ac.signal,
          cache: "no-store",
        });
        if (!res.ok || ac.signal.aborted) {
          if (!ac.signal.aborted) {
            setLoadError(true);
            setItems([]);
            setOptionSummary([]);
            setCookSummary(null);
          }
          return;
        }
        const data = (await res.json()) as {
          items?: TopSellerRow[];
          optionSummary?: OptionQtySlice[];
          cookSummary?: CookBreakdown;
        };
        if (ac.signal.aborted) return;
        setItems(Array.isArray(data.items) ? data.items.slice(0, limit) : []);
        setOptionSummary(
          Array.isArray(data.optionSummary) ? data.optionSummary : [],
        );
        setCookSummary(data.cookSummary ?? null);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setLoadError(true);
        setItems([]);
        setOptionSummary([]);
        setCookSummary(null);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [from, to, branchId, optionFilter, limit]);

  const chips = useMemo(
    () => chipsFromSummaries(optionSummary, cookSummary),
    [optionSummary, cookSummary],
  );
  const showChips = chips.length > 1;
  const optionLabel =
    optionFilter != null ? optionFilterLabel(optionFilter) : "";

  return (
    <section
      className={`rounded-[1.25rem] bg-white p-4 shadow-[0_2px_16px_rgba(6,43,75,0.06)] ring-1 ring-slate-100 ${
        loading ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-site-primary-soft text-site-primary">
            <IconTrend size={20} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[14px] font-extrabold text-[#0b2a4a]">
              {title}
            </h2>
            <Link
              href={href}
              className="mt-0.5 inline-block text-[12px] font-bold text-site-primary"
            >
              <IconLinkSuffix size={13}>{linkLabel}</IconLinkSuffix>
            </Link>
          </div>
        </div>
        {collapsible ? (
          <OverviewShowSwitch
            checked={show}
            onChange={setShow}
            label={`แสดง${title}`}
          />
        ) : null}
      </div>

      {!open ? null : (
        <>
          {showChips ? (
            <div className="mt-3">
              <div className="-mx-4 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex flex-nowrap gap-2 px-4">
                  {chips.map((opt) => {
                    const active = optionFilter === opt.id;
                    return (
                      <button
                        key={opt.id ?? "all"}
                        type="button"
                        onClick={() => setOptionFilter(opt.id)}
                        className={`shrink-0 rounded-full px-3.5 py-2 text-[13px] font-extrabold tabular-nums ${
                          active
                            ? "bg-amber-600 text-white"
                            : "bg-white text-slate-600 ring-1 ring-slate-200"
                        }`}
                      >
                        {opt.label}
                        {opt.count > 0 ? (
                          <span
                            className={`ml-1 ${
                              active ? "opacity-90" : "text-slate-400"
                            }`}
                          >
                            {formatPrice(opt.count)}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
              {optionFilter != null ? (
                <p className="mt-1.5 text-[11px] font-semibold text-amber-800">
                  · {optionLabel}
                </p>
              ) : null}
            </div>
          ) : null}

          {loading && items.length === 0 ? (
            <p className="mt-3 py-4 text-center text-sm text-slate-400">
              กำลังโหลด…
            </p>
          ) : loadError ? (
            <p className="mt-3 py-4 text-center text-sm text-slate-400">
              โหลดไม่สำเร็จ
            </p>
          ) : items.length === 0 ? (
            <p className="mt-3 py-4 text-center text-sm text-slate-400">
              ยังไม่มียอดขายในช่วงนี้
            </p>
          ) : (
            <ol className="mt-3 divide-y divide-slate-100/80">
              {items.map((item, index) => (
                <li
                  key={`${item.name}-${index}`}
                  className="flex items-center gap-3 py-2.5"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-site-primary-badge text-[12px] font-black tabular-nums text-site-primary-badge">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-bold text-[#0b2a4a]">
                      {item.name}
                    </p>
                    <p className="mt-0.5 text-[12px] font-medium text-slate-500">
                      {formatPrice(item.quantity)} ชิ้น
                    </p>
                  </div>
                  <p className="shrink-0 text-[14px] font-extrabold tabular-nums text-site-primary">
                    {formatPrice(item.revenueBaht)} ฿
                  </p>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
