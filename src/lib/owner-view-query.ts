import { isBangkokDateKey } from "@/lib/constants";

/** Query สำหรับส่งต่อช่วงวัน / สาขา ระหว่างหน้า owner */

export function buildOwnerViewQuery(opts: {
  branchId?: string | null;
  from?: string | null;
  to?: string | null;
}): string {
  const params = new URLSearchParams();
  if (opts.branchId) params.set("branchId", opts.branchId);
  if (opts.from) params.set("from", opts.from);
  if (opts.to) params.set("to", opts.to);
  const q = params.toString();
  return q ? `?${q}` : "";
}

export function ownerHomeHref(opts: {
  branchId?: string | null;
  from?: string | null;
  to?: string | null;
}) {
  return `/owner${buildOwnerViewQuery(opts)}`;
}

export function ownerSummaryHref(opts: {
  branchId?: string | null;
  from?: string | null;
  to?: string | null;
}) {
  return `/owner/summary${buildOwnerViewQuery(opts)}`;
}

export function ownerWasteHref(opts: {
  branchId?: string | null;
  from?: string | null;
  to?: string | null;
}) {
  return `/owner/waste${buildOwnerViewQuery(opts)}`;
}

export function ownerExpensesHref(opts: {
  branchId?: string | null;
  from?: string | null;
  to?: string | null;
}) {
  return `/owner/expenses${buildOwnerViewQuery(opts)}`;
}

export function ownerAgingHref(opts: {
  branchId?: string | null;
}) {
  return `/owner/aging${buildOwnerViewQuery({ branchId: opts.branchId })}`;
}

export function ownerCancelsHref(opts: {
  branchId?: string | null;
  from?: string | null;
  to?: string | null;
}) {
  return `/owner/cancels${buildOwnerViewQuery(opts)}`;
}

export function ownerStockHref(opts: {
  branchId?: string | null;
}) {
  if (opts.branchId) {
    return `/admin/branches/${opts.branchId}?tab=stock`;
  }
  return "/owner/stock";
}

export function ownerTopSellersHref(opts: {
  branchId?: string | null;
  from?: string | null;
  to?: string | null;
}) {
  return `/owner/top-sellers${buildOwnerViewQuery(opts)}`;
}

/** วิเคราะห์สต๊อกรับเข้า / จ่าย / ขาย / เสีย / คงเหลือ · เทียบสาขา */
export function ownerStockFlowHref(opts: {
  branchId?: string | null;
  from?: string | null;
  to?: string | null;
}) {
  return `/owner/stock-flow${buildOwnerViewQuery(opts)}`;
}

/** ประวัติสต๊อกสาขา รับ / ขาย / ของเสีย / จ่ายออก */
export function ownerStockHistoryHref(opts: {
  branchId?: string | null;
  from?: string | null;
  to?: string | null;
}) {
  return `/owner/stock-history${buildOwnerViewQuery(opts)}`;
}

/** แนะนำ Par Stock ต่อสาขา (เจ้าของ / ผู้จัดการ) */
export function ownerParStockHref(opts: {
  branchId?: string | null;
}) {
  return `/owner/par-stock${buildOwnerViewQuery({ branchId: opts.branchId })}`;
}

/** แผนผลิต-เติมต่อสาขา (เจ้าของ / ผู้จัดการ) */
export function ownerTomorrowPlansHref(opts: {
  branchId?: string | null;
}) {
  return `/owner/tomorrow-plans${buildOwnerViewQuery({
    branchId: opts.branchId,
  })}`;
}

/** วันขายดี / วันยอดอ่อน · ช่วงที่ลูกค้าใช้จ่าย */
export function ownerSalesDaysHref(opts: {
  branchId?: string | null;
  from?: string | null;
  to?: string | null;
}) {
  return `/owner/sales-days${buildOwnerViewQuery(opts)}`;
}

export function readOwnerViewRangeParams(
  searchParams: URLSearchParams,
  todayKey: string,
): {
  from: string;
  to: string;
  branchId: string | null;
  hasRange: boolean;
} {
  const branchId = searchParams.get("branchId")?.trim() || null;
  const from = searchParams.get("from")?.trim() || null;
  const to = searchParams.get("to")?.trim() || null;
  if (
    from &&
    to &&
    isBangkokDateKey(from) &&
    isBangkokDateKey(to) &&
    from <= to
  ) {
    return { from, to, branchId, hasRange: true };
  }
  return {
    from: todayKey,
    to: todayKey,
    branchId,
    hasRange: false,
  };
}
