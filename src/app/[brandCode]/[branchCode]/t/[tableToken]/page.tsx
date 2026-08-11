"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type TablePayload = {
  table: { id: string; name: string; token: string };
  branch: {
    id: string;
    name: string;
    code: string | null;
    imageUrl: string | null;
    isOpen: boolean;
    brand: { id: string; code: string; name: string; color: string | null };
  };
  session: {
    id: string;
    status: string;
    openedAt: string;
    runningTotal: number;
    lines: {
      id: string;
      itemName: string;
      kind: string;
      quantity: number;
      weightKg: number | null;
      lineTotal: number;
    }[];
  } | null;
};

function money(n: number) {
  return `฿${n.toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export default function TableQrGuestPage() {
  const params = useParams<{
    brandCode: string;
    branchCode: string;
    tableToken: string;
  }>();
  const [data, setData] = useState<TablePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);

  const apiPath = useMemo(() => {
    if (!params.brandCode || !params.branchCode || !params.tableToken) {
      return null;
    }
    return `/api/bbq/${encodeURIComponent(params.brandCode)}/${encodeURIComponent(params.branchCode)}/t/${encodeURIComponent(params.tableToken)}`;
  }, [params.brandCode, params.branchCode, params.tableToken]);

  async function load() {
    if (!apiPath) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiPath);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body.error === "string" ? body.error : "โหลดไม่สำเร็จ",
        );
      }
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [apiPath]);

  async function startSession() {
    if (!apiPath) return;
    setOpening(true);
    try {
      const res = await fetch(apiPath, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body.error === "string" ? body.error : "เปิดบิลไม่สำเร็จ",
        );
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เปิดบิลไม่สำเร็จ");
    } finally {
      setOpening(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg items-center justify-center bg-stone-100 px-4">
        <p className="text-sm text-stone-500">กำลังโหลดโต๊ะ…</p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-3 bg-stone-100 px-4 text-center">
        <p className="text-base font-semibold text-stone-900">
          {error || "ไม่พบโต๊ะ"}
        </p>
        <Link href="/" className="text-sm text-rose-800 underline">
          กลับหน้าแรก
        </Link>
      </main>
    );
  }

  const brandColor = data.branch.brand.color || "#9f1239";

  return (
    <main
      className="min-h-dvh bg-gradient-to-b from-rose-950 via-stone-900 to-stone-950 text-stone-50"
      style={{ ["--brand" as string]: brandColor }}
    >
      <div className="mx-auto max-w-lg px-4 pb-16 pt-10">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-rose-200/80">
          {data.branch.brand.name}
        </p>
        <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight text-white">
          {data.table.name}
        </h1>
        <p className="mt-2 text-sm text-stone-300">{data.branch.name}</p>

        {!data.session ? (
          <div className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <p className="text-sm leading-relaxed text-stone-200">
              สแกน QR โต๊ะนี้แล้ว — กดเริ่มบิลเพื่อเปิดเช็ค
              พนักงานจะชั่งกิโลและใส่รายการให้ จากนั้นคิดเงินท้ายมื้อ
            </p>
            <button
              type="button"
              disabled={opening}
              onClick={() => void startSession()}
              className="mt-6 w-full rounded-2xl bg-rose-600 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
            >
              {opening ? "กำลังเปิดบิล…" : "เริ่มบิลโต๊ะนี้"}
            </button>
          </div>
        ) : (
          <div className="mt-10 space-y-4">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs text-stone-400">บิลเปิดอยู่</p>
                  <p className="mt-1 text-3xl font-semibold text-white">
                    {money(data.session.runningTotal)}
                  </p>
                </div>
                <p className="text-xs text-stone-400">
                  ตั้งแต่{" "}
                  {new Date(data.session.openedAt).toLocaleTimeString("th-TH", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <ul className="mt-5 space-y-2 border-t border-white/10 pt-4">
                {data.session.lines.length === 0 && (
                  <li className="text-sm text-stone-400">
                    ยังไม่มีรายการ — รอพนักงานชั่งหรือใส่เครื่องเคียง
                  </li>
                )}
                {data.session.lines.map((l) => (
                  <li
                    key={l.id}
                    className="flex justify-between gap-3 text-sm text-stone-100"
                  >
                    <span>
                      {l.itemName}
                      {l.kind === "WEIGHT"
                        ? ` · ${l.weightKg} กก.`
                        : ` · x${l.quantity}`}
                    </span>
                    <span className="shrink-0 font-medium">
                      {money(l.lineTotal)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-center text-xs text-stone-400">
              คิดเงินท้ายมื้อที่เคาน์เตอร์ — รีเฟรชหน้านี้เพื่อดูรายการล่าสุด
            </p>
            <button
              type="button"
              onClick={() => void load()}
              className="mx-auto block text-sm font-medium text-rose-300 underline"
            >
              รีเฟรชบิล
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
