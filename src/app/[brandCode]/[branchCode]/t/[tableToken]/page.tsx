"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type WeighBoardItem = {
  id: string;
  name: string;
  pricePerKg: number;
  categoryName: string | null;
  imageUrl: string | null;
};

type SessionLine = {
  id: string;
  itemName: string;
  kind: string;
  quantity: number;
  weightKg: number | null;
  unitPrice: number;
  lineTotal: number;
};

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
  weighPriceBoard?: WeighBoardItem[];
  session: {
    id: string;
    status: string;
    openedAt: string;
    runningTotal: number;
    lines: SessionLine[];
  } | null;
};

function money(n: number) {
  return `฿${n.toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatKg(n: number) {
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
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
  const [boardOpen, setBoardOpen] = useState(true);

  const apiPath = useMemo(() => {
    if (!params.brandCode || !params.branchCode || !params.tableToken) {
      return null;
    }
    return `/api/bbq/${encodeURIComponent(params.brandCode)}/${encodeURIComponent(params.branchCode)}/t/${encodeURIComponent(params.tableToken)}`;
  }, [params.brandCode, params.branchCode, params.tableToken]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!apiPath) return;
    if (!opts?.silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await fetch(apiPath, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body.error === "string" ? body.error : "โหลดไม่สำเร็จ",
        );
      }
      setData(body);
    } catch (e) {
      if (!opts?.silent) {
        setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
        setData(null);
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [apiPath]);

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-refresh bill so customers see new weigh lines without tapping
  useEffect(() => {
    if (!data?.session) return;
    const id = window.setInterval(() => {
      void load({ silent: true });
    }, 8_000);
    return () => window.clearInterval(id);
  }, [data?.session?.id, load]);

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

  const boardByCategory = useMemo(() => {
    const board = data?.weighPriceBoard ?? [];
    const map = new Map<string, WeighBoardItem[]>();
    for (const item of board) {
      const key = item.categoryName?.trim() || "อื่นๆ";
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [data?.weighPriceBoard]);

  if (loading && !data) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg items-center justify-center bg-stone-100 px-4">
        <p className="text-sm text-stone-500">กำลังโหลดโต๊ะ…</p>
      </main>
    );
  }

  if ((error && !data) || !data) {
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
  const weightLines =
    data.session?.lines.filter((l) => l.kind === "WEIGHT") ?? [];
  const pieceLines =
    data.session?.lines.filter((l) => l.kind !== "WEIGHT") ?? [];

  return (
    <main
      className="min-h-dvh bg-gradient-to-b from-rose-950 via-stone-900 to-stone-950 text-stone-50"
      style={{ ["--brand" as string]: brandColor }}
    >
      <div className="mx-auto max-w-lg px-4 pb-20 pt-8">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-rose-200/80">
          {data.branch.brand.name}
        </p>
        <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight text-white">
          {data.table.name}
        </h1>
        <p className="mt-2 text-sm text-stone-300">{data.branch.name}</p>

        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-rose-500/20 px-3 py-1 text-xs font-semibold text-rose-100 ring-1 ring-rose-400/30">
          <span aria-hidden>⚖</span>
          โหมดชั่งกิโล — ดูราคา/กก. ชัดเจน
        </div>

        {/* Price board — ให้ลูกค้าเห็นภาพราคาก่อนชั่ง */}
        {(data.weighPriceBoard?.length ?? 0) > 0 ? (
          <section className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-white/5 backdrop-blur">
            <button
              type="button"
              onClick={() => setBoardOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
            >
              <div>
                <p className="text-sm font-bold text-white">ป้ายราคาชั่งกิโล</p>
                <p className="mt-0.5 text-xs text-stone-400">
                  {data.weighPriceBoard!.length} รายการ · บาทต่อกิโลกรัม
                </p>
              </div>
              <span className="text-stone-400">{boardOpen ? "▴" : "▾"}</span>
            </button>
            {boardOpen ? (
              <div className="max-h-[40vh] space-y-4 overflow-y-auto border-t border-white/10 px-5 pb-5 pt-3">
                {boardByCategory.map(([cat, items]) => (
                  <div key={cat}>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-rose-200/70">
                      {cat}
                    </p>
                    <ul className="space-y-1.5">
                      {items.map((m) => (
                        <li
                          key={m.id}
                          className="flex items-baseline justify-between gap-3 text-sm"
                        >
                          <span className="min-w-0 flex-1 text-stone-100">
                            {m.name}
                          </span>
                          <span className="shrink-0 font-bold tabular-nums text-amber-200">
                            {money(m.pricePerKg)}
                            <span className="text-[11px] font-semibold text-amber-200/70">
                              /กก.
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ) : (
          <p className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            ยังไม่มีป้ายราคาชั่งกิโล — รอร้านตั้งเมนูชั่ง
          </p>
        )}

        {!data.session ? (
          <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <p className="text-sm leading-relaxed text-stone-200">
              สแกน QR โต๊ะนี้แล้ว — กดเริ่มบิลเพื่อเปิดเช็ค
              พนักงานจะชั่งกิโลแล้วใส่รายการให้ คุณดูน้ำหนัก × ราคา/กก. =
              ยอดได้บนหน้านี้
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
          <div className="mt-6 space-y-4">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs text-stone-400">ยอดบิลตอนนี้</p>
                  <p className="mt-1 text-3xl font-semibold tabular-nums text-white">
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

              {weightLines.length > 0 ? (
                <div className="mt-5 border-t border-white/10 pt-4">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-rose-200/80">
                    รายการชั่งกิโล
                  </p>
                  <ul className="space-y-3">
                    {weightLines.map((l) => (
                      <li key={l.id} className="text-sm text-stone-100">
                        <div className="flex justify-between gap-3">
                          <span className="font-medium">{l.itemName}</span>
                          <span className="shrink-0 font-bold tabular-nums">
                            {money(l.lineTotal)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs tabular-nums text-stone-400">
                          {l.weightKg != null ? formatKg(l.weightKg) : "—"} กก. ×{" "}
                          {money(l.unitPrice)}/กก.
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="mt-5 border-t border-white/10 pt-4 text-sm text-stone-400">
                  ยังไม่มีรายการชั่ง — รอพนักงานชั่งของสด
                </p>
              )}

              {pieceLines.length > 0 ? (
                <div className="mt-5 border-t border-white/10 pt-4">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-400">
                    รายการชิ้น / เครื่องเคียง
                  </p>
                  <ul className="space-y-2">
                    {pieceLines.map((l) => (
                      <li
                        key={l.id}
                        className="flex justify-between gap-3 text-sm text-stone-200"
                      >
                        <span>
                          {l.itemName}
                          <span className="text-stone-500"> · x{l.quantity}</span>
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {money(l.lineTotal)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <p className="text-center text-xs text-stone-400">
              คิดเงินท้ายมื้อที่เคาน์เตอร์ — หน้านี้รีเฟรชอัตโนมัติทุก 8 วินาที
            </p>
            <button
              type="button"
              onClick={() => void load()}
              className="mx-auto block text-sm font-medium text-rose-300 underline"
            >
              รีเฟรชบิลทันที
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
