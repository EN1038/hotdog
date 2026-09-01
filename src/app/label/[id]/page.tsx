"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { LoadingState } from "@/components/LoadingState";
import {
  formatPackageLabelDate,
  STOCK_LABEL_STATUS_LABEL,
  type PublicStockLabel,
} from "@/lib/stock-label-public";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 border-b border-slate-100 py-2.5 text-sm last:border-0">
      <dt className="w-[7.5rem] shrink-0 font-semibold text-slate-500">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 font-bold text-slate-900">{value}</dd>
    </div>
  );
}

export default function PublicStockLabelPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<PublicStockLabel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/public/stock-label/${encodeURIComponent(id)}`,
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body.error === "string" ? body.error : "ไม่พบป้ายแพ็ก",
        );
      }
      setData(body as PublicStockLabel);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <LoadingState label="กำลังโหลดข้อมูลป้ายแพ็ก…" />;
  }

  if (error || !data) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg items-center justify-center p-6">
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
          <p className="text-base font-bold text-slate-900">ไม่พบป้ายแพ็ก</p>
          <p className="mt-2 text-sm text-slate-600">
            {error ?? "ตรวจสอบ QR หรือรหัสป้ายอีกครั้ง"}
          </p>
        </div>
      </main>
    );
  }

  const statusTone =
    data.status === "ACTIVE"
      ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
      : data.status === "CONSUMED"
        ? "bg-amber-50 text-amber-900 ring-amber-200"
        : "bg-slate-100 text-slate-700 ring-slate-200";

  return (
    <main className="mx-auto min-h-dvh max-w-lg bg-slate-50 px-4 py-6">
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="border-b border-slate-100 bg-slate-900 px-5 py-4 text-white">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-300">
            SkillSale
          </p>
          <h1 className="mt-1 text-xl font-extrabold leading-tight">
            {data.productName}
          </h1>
          {data.brandName ? (
            <p className="mt-1 text-sm font-semibold text-slate-300">
              {data.brandName}
            </p>
          ) : null}
        </div>

        <div className="px-5 py-4">
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${statusTone}`}
          >
            {STOCK_LABEL_STATUS_LABEL[data.status]}
          </span>

          <dl className="mt-4">
            <InfoRow label="รหัสสินค้า" value={data.productCode} />
            <InfoRow label="รหัสป้าย" value={data.labelCode} />
            <InfoRow label="จำนวน" value={`${data.quantity} ${data.unit}`} />
            <InfoRow
              label="วันที่ผลิต"
              value={formatPackageLabelDate(data.producedAt)}
            />
            <InfoRow label="Lot" value={data.lotNumber} />
            {data.sourceBranchName ? (
              <InfoRow label="มาจาก" value={data.sourceBranchName} />
            ) : null}
            {data.branchName ? (
              <InfoRow label="สาขา" value={data.branchName} />
            ) : null}
            <InfoRow
              label="รับเข้า"
              value={formatPackageLabelDate(data.receivedAt)}
            />
            {data.expiresAt ? (
              <InfoRow
                label="หมดอายุ"
                value={formatPackageLabelDate(data.expiresAt)}
              />
            ) : null}
            {data.documentNo ? (
              <InfoRow label="เอกสาร" value={data.documentNo} />
            ) : null}
          </dl>
        </div>
      </div>
    </main>
  );
}
