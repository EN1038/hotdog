"use client";

import { useEffect, useState } from "react";
import { IconClose } from "@/components/icons";
import { IconLine } from "@/components/owner/owner-register-ui";
import { useToast } from "@/components/admin/Toast";
import { PLATFORM_LINE_ADD_URL } from "@/lib/platform-support";

type InvoiceRow = {
  id: string;
  number: string;
  title: string;
  amountBaht: number;
  status: string;
  periodLabel: string | null;
  issuedAt: string | null;
  paidAt: string | null;
  createdAt: string;
};

type BillingPayload = {
  brandId: string;
  brandName: string;
  nextDueAt: string | null;
  lastPaidAt: string | null;
  contactPhone: string | null;
  invoices: InvoiceRow[];
};

const STATUS_LABEL: Record<string, string> = {
  ISSUED: "รอชำระ",
  PAID: "ชำระแล้ว",
  VOID: "ยกเลิก",
};

function formatDateLabel(iso: string | null) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

function formatMoney(n: number) {
  return n.toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

type Props = {
  brandId: string;
  open: boolean;
  onClose: () => void;
};

export function OwnerBillingModal({ brandId, open, onClose }: Props) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<BillingPayload | null>(null);

  useEffect(() => {
    if (!open || !brandId) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch(
          `/api/owner/billing?brandId=${encodeURIComponent(brandId)}`,
        );
        if (!res.ok) {
          if (!cancelled) {
            toast.error("โหลดบิลไม่สำเร็จ", "ลองใหม่อีกครั้ง");
            setLoading(false);
          }
          return;
        }
        const json = (await res.json()) as BillingPayload;
        if (cancelled) return;
        setData(json);
      } catch {
        if (!cancelled) {
          toast.error("โหลดบิลไม่สำเร็จ", "เชื่อมต่อไม่ได้");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast is stable enough
  }, [open, brandId]);

  if (!open) return null;

  const nextDue = formatDateLabel(data?.nextDueAt ?? null);
  const lastPaid = formatDateLabel(data?.lastPaidAt ?? null);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="ปิด"
        className="absolute inset-0 bg-black/45"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="owner-billing-modal-title"
        className="relative z-10 flex max-h-[min(92dvh,40rem)] w-full max-w-md flex-col overflow-hidden rounded-t-[1.75rem] bg-white shadow-2xl sm:mx-4 sm:rounded-[1.75rem]"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="min-w-0">
            <p
              id="owner-billing-modal-title"
              className="text-[17px] font-extrabold text-slate-900"
            >
              บิล
            </p>
            <p className="mt-0.5 text-[12px] text-slate-500">
              ใบแจ้งหนี้และประวัติชำระ
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 active:bg-slate-200"
            aria-label="ปิด"
          >
            <IconClose size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <p className="py-10 text-center text-sm text-slate-500">
              กำลังโหลด…
            </p>
          ) : (
            <div className="space-y-4 pb-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-slate-50 px-3 py-3">
                  <p className="text-[11px] font-semibold text-slate-500">
                    ครบกำหนดถัดไป
                  </p>
                  <p className="mt-1 text-[14px] font-extrabold text-slate-900">
                    {nextDue ?? "—"}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-3 py-3">
                  <p className="text-[11px] font-semibold text-slate-500">
                    ชำระล่าสุด
                  </p>
                  <p className="mt-1 text-[14px] font-extrabold text-slate-900">
                    {lastPaid ?? "—"}
                  </p>
                </div>
              </div>

              {(data?.invoices.length ?? 0) === 0 ? (
                <div className="rounded-2xl bg-slate-50 px-4 py-8 text-center">
                  <p className="text-[15px] font-extrabold text-slate-900">
                    ยังไม่มีบิล
                  </p>
                  <p className="mt-1 text-[13px] font-medium text-slate-500">
                    เมื่อมีใบแจ้งหนี้จากแอดมิน จะแสดงที่นี่
                  </p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-100">
                  {data!.invoices.map((inv, index) => {
                    const statusLabel =
                      STATUS_LABEL[inv.status] ?? inv.status;
                    const paid = inv.status === "PAID";
                    const voided = inv.status === "VOID";
                    return (
                      <div
                        key={inv.id}
                        className={`px-4 py-3 ${
                          index > 0 ? "border-t border-slate-100" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-[15px] font-extrabold text-slate-900">
                              {inv.title}
                            </p>
                            <p className="mt-0.5 text-[12px] font-medium text-slate-500">
                              {inv.number}
                              {inv.periodLabel ? ` · ${inv.periodLabel}` : ""}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-[15px] font-extrabold tabular-nums text-slate-900">
                              ฿{formatMoney(inv.amountBaht)}
                            </p>
                            <p
                              className={`mt-0.5 text-[11px] font-bold ${
                                paid
                                  ? "text-emerald-700"
                                  : voided
                                    ? "text-slate-400"
                                    : "text-amber-800"
                              }`}
                            >
                              {statusLabel}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <a
                href={PLATFORM_LINE_ADD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#06C755] px-4 text-[15px] font-extrabold text-white active:brightness-95"
              >
                <IconLine className="h-5 w-5 shrink-0" />
                ติดต่อแอดมินทาง LINE
              </a>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-slate-100 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-slate-900 text-white active:bg-slate-800"
          >
            <IconClose size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
