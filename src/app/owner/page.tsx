"use client";

import { useState } from "react";
import Link from "next/link";
import { OwnerAppShell, useOwnerDashboard } from "@/components/owner/OwnerAppShell";
import { useToast } from "@/components/admin/Toast";
import { appAbsoluteUrl } from "@/lib/app-url";
import type { OwnerBranchRow } from "@/lib/owner-dashboard";

function customerPath(brandCode: string, branchCode: string) {
  return `/${brandCode}/${branchCode}`;
}

function Tile({
  href,
  onClick,
  label,
  hint,
  color,
  badge,
  wide,
}: {
  href?: string;
  onClick?: () => void;
  label: string;
  hint: string;
  color: string;
  badge?: string;
  wide?: boolean;
}) {
  const className = `relative flex min-h-[6rem] flex-col justify-between overflow-hidden rounded-2xl p-4 text-left text-white shadow-sm active:scale-[0.99] ${
    wide ? "col-span-2 min-h-[6.75rem]" : ""
  }`;
  const inner = (
    <>
      {badge ? (
        <span className="absolute right-3 top-3 rounded-full bg-orange-500 px-2.5 py-1 text-[11px] font-bold">
          {badge}
        </span>
      ) : null}
      <p
        className={`font-black leading-tight ${wide ? "text-[22px]" : "text-[18px]"}`}
      >
        {label}
      </p>
      <p className="mt-1.5 text-[13px] font-medium text-white/85">{hint}</p>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className} style={{ backgroundColor: color }}>
        {inner}
      </button>
    );
  }

  return (
    <Link href={href || "#"} className={className} style={{ backgroundColor: color }}>
      {inner}
    </Link>
  );
}

function BranchLinkSheet({
  brandCode,
  branches,
  onClose,
}: {
  brandCode: string;
  branches: OwnerBranchRow[];
  onClose: () => void;
}) {
  const toast = useToast();
  const visible = branches.filter((b) => !b.isHidden && b.code);

  async function copy(branch: OwnerBranchRow) {
    if (!branch.code) return;
    const url = appAbsoluteUrl(customerPath(brandCode, branch.code));
    try {
      await navigator.clipboard.writeText(url);
      toast.success("คัดลอกลิงก์แล้ว", branch.name);
    } catch {
      toast.error("คัดลอกไม่สำเร็จ", "ลองกดเปิดลิงก์แล้วคัดลอกจากแถบที่อยู่");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div className="w-full max-w-md rounded-3xl bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-base font-bold text-slate-900">ลิงก์สั่งลูกค้า</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1.5 text-sm font-medium text-slate-500"
          >
            ปิด
          </button>
        </div>
        <p className="mb-3 text-sm text-slate-500">
          ส่งลิงก์นี้ให้ลูกค้า หรือเปิดแล้วให้สแกนจากหน้าจอ
        </p>
        <div className="space-y-2">
          {visible.length === 0 ? (
            <p className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              ยังไม่มีสาขาพร้อมลิงก์ลูกค้า
            </p>
          ) : (
            visible.map((branch) => (
              <div
                key={branch.id}
                className="flex items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{branch.name}</p>
                  <p className="text-xs text-slate-500">
                    {branch.isOpen ? "เปิดอยู่" : "ปิดร้าน"}
                    {branch.isTest ? " · ทดลอง" : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => copy(branch)}
                  className="rounded-full bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm"
                >
                  คัดลอก
                </button>
                <a
                  href={customerPath(brandCode, branch.code!)}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full bg-[#0b2a4a] px-3 py-2 text-xs font-bold text-white"
                >
                  เปิด
                </a>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function OwnerHomeInner() {
  const { data, loading, reload } = useOwnerDashboard();
  const toast = useToast();
  const [linkOpen, setLinkOpen] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const brand = data?.brand;
  const branches = data?.branches ?? [];
  const liveBranches = branches.filter((b) => !b.isTest);

  async function toggleOpen(branch: OwnerBranchRow) {
    setTogglingId(branch.id);
    try {
      const res = await fetch(`/api/admin/branches/${branch.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isOpen: !branch.isOpen }),
      });
      if (!res.ok) {
        toast.error("เปลี่ยนสถานะร้านไม่สำเร็จ");
        return;
      }
      toast.success(branch.isOpen ? "ปิดร้านแล้ว" : "เปิดร้านแล้ว", branch.name);
      reload();
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    } finally {
      setTogglingId(null);
    }
  }

  if (loading && !data) {
    return <p className="px-4 py-10 text-center text-sm text-slate-500">กำลังโหลด…</p>;
  }

  return (
    <div className="px-4 pb-6 pt-4">
      <div className="grid grid-cols-2 gap-3">
        <Tile
          wide
          color="#0b2a4a"
          label="ลิงก์สั่งลูกค้า"
          hint="ส่งลิงก์หรือเปิดหน้าให้ลูกค้าสั่ง"
          badge="ใช้บ่อย"
          onClick={() => setLinkOpen(true)}
        />
        <Tile
          wide
          color="#c4a574"
          label="คีย์ออเดอร์"
          hint="ให้พนักงานขายหน้าร้าน"
          href="/staff/login"
        />
        <Tile
          color="#0f9d8e"
          label="สาขา"
          hint={`${liveBranches.length || branches.length} สาขา`}
          href="/admin"
        />
        <Tile
          color="#e15b4a"
          label="ออเดอร์วันนี้"
          hint={
            data
              ? `${data.stats.totalOrders} รายการ`
              : "ดูรายการขาย"
          }
          href="/owner/today"
        />
        <Tile
          color="#f0a202"
          label="สรุปยอด"
          hint="ดูยอดรายวัน / รายเดือน"
          href="/owner/summary"
        />
        <Tile
          color="#3b82c4"
          label="ตั้งค่าร้าน"
          hint="เมนู พนักงาน โหมดเต็ม"
          href="/admin"
        />
      </div>

      {liveBranches.length > 0 ? (
        <section className="mt-5">
          <p className="mb-2 text-sm font-bold text-slate-800">เปิด-ปิดร้าน</p>
          <div className="space-y-2">
            {liveBranches.map((branch) => (
              <div
                key={branch.id}
                className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm"
              >
                <div className="min-w-0 pr-3">
                  <p className="truncate font-semibold text-slate-900">{branch.name}</p>
                  <p className="text-xs text-slate-500">
                    {branch.isOpen ? "ลูกค้าเห็นว่าร้านเปิด" : "ร้านปิดอยู่"}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={togglingId === branch.id}
                  onClick={() => void toggleOpen(branch)}
                  className={`h-10 min-w-[4.5rem] rounded-full px-3 text-sm font-bold text-white ${
                    branch.isOpen ? "bg-emerald-500" : "bg-slate-400"
                  }`}
                >
                  {branch.isOpen ? "เปิด" : "ปิด"}
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {linkOpen && brand ? (
        <BranchLinkSheet
          brandCode={brand.code}
          branches={branches}
          onClose={() => setLinkOpen(false)}
        />
      ) : null}
    </div>
  );
}

export default function OwnerHomePage() {
  return (
    <OwnerAppShell active="home">
      <OwnerHomeInner />
    </OwnerAppShell>
  );
}
