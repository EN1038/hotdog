"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { LoadingState } from "@/components/LoadingState";
import { IconSkewerPlaceholder } from "@/components/icons";
import {
  SKEWER_CATEGORY_ROLE_LABELS,
  formatSkewerQtyLabel,
} from "@/lib/skewer-order";
import type { PublicSkewerOrderReceipt } from "@/lib/skewer-order-public-share";
import { splitLinesBySkewerRole } from "@/components/skewer/SkewerSplitOrderSections";
import {
  absoluteUrlFromPath,
  captureElementToPng,
  downloadPngDataUrl,
  sharePngDataUrl,
  sharePublicLink,
} from "@/lib/share-media";

const btnTop =
  "rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-50";

function formatDateLabel(ymd: string) {
  try {
    return new Date(`${ymd}T12:00:00+07:00`).toLocaleDateString("th-TH", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return ymd;
  }
}

export default function PublicSkewerOrderSharePage() {
  const { token } = useParams<{ token: string }>();
  const captureRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<PublicSkewerOrderReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pageUrl, setPageUrl] = useState("");
  const [exportBusy, setExportBusy] = useState<
    "save" | "share" | "link" | null
  >(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/public/skewer-orders/${encodeURIComponent(token)}`,
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? "α╣äα╕íα╣êα╕₧α╕Üα╣âα╕Üα╕¡α╕¡α╣Çα╕öα╕¡α╕úα╣îα╣Çα╕¬α╕╡α╕óα╕Üα╣äα╕íα╣ë");
      }
      setData(body as PublicSkewerOrderReceipt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "α╣éα╕½α╕Ñα╕öα╣äα╕íα╣êα╕¬α╕│α╣Çα╕úα╣çα╕ê");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (data?.token) {
      setPageUrl(absoluteUrlFromPath(`/s/${data.token}`));
    }
  }, [data?.token]);

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  }

  async function handleSaveImage() {
    if (!data || exportBusy) return;
    const node = captureRef.current;
    if (!node) return;
    setExportBusy("save");
    try {
      const dataUrl = await captureElementToPng(node);
      const r = await downloadPngDataUrl(
        dataUrl,
        `skewer-${data.orderNumber}`,
      );
      flash(r.ok ? "α╕Üα╕▒α╕Öα╕ùα╕╢α╕üα╕úα╕╣α╕¢α╣üα╕Ñα╣ëα╕º" : r.error ?? "α╕Üα╕▒α╕Öα╕ùα╕╢α╕üα╣äα╕íα╣êα╕¬α╕│α╣Çα╕úα╣çα╕ê");
    } catch (e) {
      flash(e instanceof Error ? e.message : "α╕Üα╕▒α╕Öα╕ùα╕╢α╕üα╕úα╕╣α╕¢α╣äα╕íα╣êα╕¬α╕│α╣Çα╕úα╣çα╕ê");
    } finally {
      setExportBusy(null);
    }
  }

  async function handleShareImage() {
    if (!data || exportBusy) return;
    const node = captureRef.current;
    if (!node) return;
    setExportBusy("share");
    try {
      const dataUrl = await captureElementToPng(node);
      const r = await sharePngDataUrl(
        dataUrl,
        `skewer-${data.orderNumber}`,
        `α╕¡α╕¡α╣Çα╕öα╕¡α╕úα╣îα╣Çα╕¬α╕╡α╕óα╕Üα╣äα╕íα╣ë #${data.orderNumber}`,
      );
      if (r.error === "cancelled") return;
      flash(
        r.mode === "share"
          ? "α╣üα╕èα╕úα╣îα╕úα╕╣α╕¢α╣üα╕Ñα╣ëα╕º"
          : r.ok
            ? "α╕Üα╕▒α╕Öα╕ùα╕╢α╕üα╕úα╕╣α╕¢α╣üα╕ùα╕Ö (α╣Çα╕äα╕úα╕╖α╣êα╕¡α╕çα╕Öα╕╡α╣ëα╕óα╕▒α╕çα╣üα╕èα╕úα╣îα╕úα╕╣α╕¢α╣äα╕íα╣êα╣äα╕öα╣ë)"
            : r.error ?? "α╣üα╕èα╕úα╣îα╣äα╕íα╣êα╕¬α╕│α╣Çα╕úα╣çα╕ê",
      );
    } catch (e) {
      flash(e instanceof Error ? e.message : "α╣üα╕èα╕úα╣îα╕úα╕╣α╕¢α╣äα╕íα╣êα╕¬α╕│α╣Çα╕úα╣çα╕ê");
    } finally {
      setExportBusy(null);
    }
  }

  async function handleShareLink() {
    if (!data || exportBusy) return;
    setExportBusy("link");
    try {
      const url = pageUrl || absoluteUrlFromPath(`/s/${data.token}`);
      const r = await sharePublicLink({
        url,
        title: `α╕¡α╕¡α╣Çα╕öα╕¡α╕úα╣îα╣Çα╕¬α╕╡α╕óα╕Üα╣äα╕íα╣ë #${data.orderNumber}`,
        text: `α╕öα╕╣α╕¡α╕¡α╣Çα╕öα╕¡α╕úα╣î #${data.orderNumber} ┬╖ ${data.summaryLabel}`,
      });
      if (r.error === "cancelled") return;
      flash(
        r.mode === "share"
          ? "α╣üα╕èα╕úα╣îα╕Ñα╕┤α╕çα╕üα╣îα╣üα╕Ñα╣ëα╕º"
          : r.mode === "copy"
            ? "α╕äα╕▒α╕öα╕Ñα╕¡α╕üα╕Ñα╕┤α╕çα╕üα╣îα╣üα╕Ñα╣ëα╕º"
            : r.error ?? "α╣üα╕èα╕úα╣îα╣äα╕íα╣êα╕¬α╕│α╣Çα╕úα╣çα╕ê",
      );
    } finally {
      setExportBusy(null);
    }
  }

  if (loading) return <LoadingState label="α╕üα╕│α╕Ñα╕▒α╕çα╣éα╕½α╕Ñα╕öα╣âα╕Üα╕¡α╕¡α╣Çα╕öα╕¡α╕úα╣î" />;

  if (error || !data) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-lg font-semibold text-gray-900">
          {error ?? "α╣äα╕íα╣êα╕₧α╕Üα╣âα╕Üα╕¡α╕¡α╣Çα╕öα╕¡α╕úα╣î"}
        </p>
        <p className="mt-2 text-sm text-gray-500">
          α╕Ñα╕┤α╕çα╕üα╣îα╕¡α╕▓α╕êα╣äα╕íα╣êα╕ûα╕╣α╕üα╕òα╣ëα╕¡α╕ç ΓÇö α╕òα╕┤α╕öα╕òα╣êα╕¡α╕úα╣ëα╕▓α╕Öα╣Çα╕₧α╕╖α╣êα╕¡α╕éα╕¡α╕Ñα╕┤α╕çα╕üα╣îα╣âα╕½α╕íα╣ê
        </p>
      </div>
    );
  }

  const { saleLines, supplyLines } = splitLinesBySkewerRole(data.items);
  const showConfirmed = data.status === "CONFIRMED";

  function renderItem(
    item: PublicSkewerOrderReceipt["items"][number],
    index: number,
  ) {
    const displayQty = showConfirmed
      ? (item.confirmedQuantity ?? 0)
      : item.requestedQuantity;
    return (
      <li
        key={`${item.skewerCategoryRole}-${item.itemName}-${index}`}
        className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-2.5"
      >
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-gray-100">
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.display = "none";
                const fallback = e.currentTarget.nextElementSibling;
                if (fallback instanceof HTMLElement) {
                  fallback.style.display = "flex";
                }
              }}
            />
          ) : null}
          <div
            className="flex h-full w-full items-center justify-center text-gray-400"
            style={item.imageUrl ? { display: "none" } : undefined}
          >
            <IconSkewerPlaceholder size={22} />
          </div>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">
            {item.itemName}
          </p>
          <p className="truncate text-xs text-gray-500">
            α╕¬α╕▒α╣êα╕ç{" "}
            {formatSkewerQtyLabel(item.requestedQuantity, {
              quantityUnit: item.quantityUnit,
              sticksPerUnit: item.sticksPerUnit,
              countsAsSticks: item.countsAsSticks,
            })}
            {showConfirmed && item.confirmedQuantity != null
              ? ` ┬╖ α╣äα╕öα╣ë ${formatSkewerQtyLabel(item.confirmedQuantity, {
                  quantityUnit: item.quantityUnit,
                  sticksPerUnit: item.sticksPerUnit,
                  countsAsSticks: item.countsAsSticks,
                })}`
              : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-base font-black tabular-nums text-gray-900">
            {displayQty}
          </p>
          <p className="text-[10px] font-semibold text-gray-500">
            {item.quantityUnit}
          </p>
        </div>
      </li>
    );
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-amber-50/60 to-white">
      <div className="mx-auto max-w-lg px-4 py-6 pb-16">
        <div className="mb-3 flex items-start justify-between gap-2">
          <header className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
              α╣âα╕Üα╕¡α╕¡α╣Çα╕öα╕¡α╕úα╣îα╣Çα╕¬α╕╡α╕óα╕Üα╣äα╕íα╣ë (α╕¬α╕▓α╕ÿα╕▓α╕úα╕ôα╕░)
            </p>
            <h1 className="mt-1 text-xl font-bold text-gray-900">
              {data.branch.brandName ?? data.branch.name}
            </h1>
            <p className="text-sm text-gray-600">{data.branch.name}</p>
          </header>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <div className="flex flex-wrap justify-end gap-1.5">
              <button
                type="button"
                className={btnTop}
                disabled={exportBusy != null}
                onClick={() => void handleSaveImage()}
              >
                {exportBusy === "save" ? "ΓÇª" : "α╕Üα╕▒α╕Öα╕ùα╕╢α╕üα╕úα╕╣α╕¢"}
              </button>
              <button
                type="button"
                className={btnTop}
                disabled={exportBusy != null}
                onClick={() => void handleShareImage()}
              >
                {exportBusy === "share" ? "ΓÇª" : "α╣üα╕èα╕úα╣îα╕úα╕╣α╕¢"}
              </button>
              <button
                type="button"
                className={btnTop}
                disabled={exportBusy != null}
                onClick={() => void handleShareLink()}
              >
                {exportBusy === "link" ? "ΓÇª" : "α╣üα╕èα╕úα╣îα╕Ñα╕┤α╕çα╕üα╣î"}
              </button>
            </div>
            {toast ? (
              <p className="text-[11px] font-medium text-emerald-700">{toast}</p>
            ) : null}
          </div>
        </div>

        <div
          ref={captureRef}
          className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 pb-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-500">
                #{data.orderNumber} ┬╖ {data.statusLabel}
              </p>
              <p className="mt-1 text-sm font-semibold text-gray-900">
                α╕òα╣ëα╕¡α╕çα╕üα╕▓α╕ú {formatDateLabel(data.requestedDate)}
              </p>
              {(data.customerName || data.customerPhoneMasked) && (
                <p className="mt-0.5 text-xs text-gray-600">
                  {[data.customerName, data.customerPhoneMasked]
                    .filter(Boolean)
                    .join(" ┬╖ ")}
                </p>
              )}
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800/70">
                α╕úα╕ºα╕íα╕¡α╕¡α╣Çα╕öα╕¡α╕úα╣î
              </p>
              <p className="text-base font-black tabular-nums text-amber-950">
                {data.summaryLabel}
              </p>
            </div>
          </div>

          <div className="space-y-1.5 text-sm text-gray-700">
            <p className="whitespace-pre-wrap">α╕ùα╕╡α╣êα╕¡α╕óα╕╣α╣ê: {data.addressText}</p>
            {data.note ? <p>α╣éα╕Öα╣ëα╕òα╕Ñα╕╣α╕üα╕äα╣ëα╕▓: {data.note}</p> : null}
            {data.status === "CANCELLED" && data.cancelReason ? (
              <p className="rounded-xl bg-gray-100 px-3 py-2 text-sm text-gray-700">
                α╣Çα╕½α╕òα╕╕α╕£α╕Ñα╕óα╕üα╣Çα╕Ñα╕┤α╕ü: {data.cancelReason}
              </p>
            ) : null}
          </div>

          <div className="space-y-4">
            {saleLines.length > 0 ? (
              <div>
                <p className="mb-1 text-xs font-semibold text-gray-700">
                  {SKEWER_CATEGORY_ROLE_LABELS.SKEWER_SALE}
                </p>
                <ul className="divide-y divide-gray-100">
                  {saleLines.map((item, i) => renderItem(item, i))}
                </ul>
              </div>
            ) : null}
            {supplyLines.length > 0 ? (
              <div>
                <p className="mb-1 text-xs font-semibold text-gray-700">
                  {SKEWER_CATEGORY_ROLE_LABELS.SKEWER_SUPPLY}
                </p>
                <ul className="divide-y divide-gray-100">
                  {supplyLines.map((item, i) => renderItem(item, i))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>

        {pageUrl ? (
          <p className="mt-4 break-all text-center text-[11px] text-gray-400">
            {pageUrl}
          </p>
        ) : null}
      </div>
    </div>
  );
}
