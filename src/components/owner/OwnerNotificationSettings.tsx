"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/admin/Toast";
import { OwnerSmsQuotaCard } from "@/components/owner/OwnerSmsQuotaCard";

type BranchRow = {
  id: string;
  name: string;
  kind: string;
  isTest: boolean;
  operatingMode: string;
  alertSmsPhone: string | null;
  smsNotifyNewOrder: boolean;
  smsNotifySkewerOrder: boolean;
};

type NotificationPayload = {
  brand: {
    id: string;
    name: string;
    lineNotifyNewOrder: boolean;
    lineNotifySkewerOrder: boolean;
    lineNotifyDailySummary: boolean;
  };
  sms: { granted: number; used: number; remaining: number };
  line: {
    platformReady: boolean;
    linkedOwnerCount: number;
    connectUrl: string;
  };
  branches: BranchRow[];
};

export function OwnerNotificationSettings() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<NotificationPayload | null>(null);
  const [lineFlags, setLineFlags] = useState({
    lineNotifyNewOrder: true,
    lineNotifySkewerOrder: true,
    lineNotifyDailySummary: true,
  });
  const [branches, setBranches] = useState<BranchRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/owner/notifications");
      if (!res.ok) {
        setData(null);
        return;
      }
      const json = (await res.json()) as NotificationPayload;
      setData(json);
      setLineFlags({
        lineNotifyNewOrder: json.brand.lineNotifyNewOrder,
        lineNotifySkewerOrder: json.brand.lineNotifySkewerOrder,
        lineNotifyDailySummary: json.brand.lineNotifyDailySummary,
      });
      setBranches(json.branches);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function updateBranch(
    branchId: string,
    patch: Partial<
      Pick<
        BranchRow,
        "alertSmsPhone" | "smsNotifyNewOrder" | "smsNotifySkewerOrder"
      >
    >,
  ) {
    setBranches((rows) =>
      rows.map((b) => (b.id === branchId ? { ...b, ...patch } : b)),
    );
  }

  async function save() {
    if (!data) return;
    setSaving(true);
    try {
      const res = await fetch("/api/owner/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...lineFlags,
          branches: branches.map((b) => ({
            branchId: b.id,
            alertSmsPhone: b.alertSmsPhone,
            smsNotifyNewOrder: b.smsNotifyNewOrder,
            smsNotifySkewerOrder: b.smsNotifySkewerOrder,
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error("บันทึกไม่สำเร็จ", err.error ?? "ลองใหม่อีกครั้ง");
        return;
      }
      const json = (await res.json()) as NotificationPayload;
      setData(json);
      setBranches(json.branches);
      toast.success("บันทึกการแจ้งเตือนแล้ว");
    } catch {
      toast.error("บันทึกไม่สำเร็จ", "เชื่อมต่อไม่ได้");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        กำลังโหลดการตั้งค่าแจ้งเตือน…
      </section>
    );
  }

  if (!data) return null;

  const smsBranches = branches.filter(
    (b) => b.kind !== "WAREHOUSE",
  );

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div>
        <h2 className="text-base font-bold text-slate-900">การแจ้งเตือน</h2>
        <p className="mt-1 text-sm text-slate-600">
          ตั้งเบอร์รับ SMS แยกต่อสาขา และเปิด/ปิด LINE สำหรับแบรนด์
        </p>
      </div>

      <OwnerSmsQuotaCard quota={data.sms} manageHref={undefined} />

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">SMS ต่อสาขา</h3>
        {smsBranches.length === 0 ? (
          <p className="text-sm text-slate-500">ยังไม่มีสาขาที่ตั้งค่าได้</p>
        ) : (
          smsBranches.map((b) => (
            <div
              key={b.id}
              className="space-y-2 rounded-xl border border-slate-200 p-3"
            >
              <p className="text-sm font-semibold text-slate-900">
                {b.name}
                {b.isTest ? (
                  <span className="ml-2 text-xs font-medium text-amber-700">
                    ทดสอบ
                  </span>
                ) : null}
              </p>
              <label className="block text-xs text-slate-600">
                เบอร์รับ SMS
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={b.alertSmsPhone ?? ""}
                  onChange={(e) =>
                    updateBranch(b.id, { alertSmsPhone: e.target.value })
                  }
                  placeholder="08x-xxx-xxxx"
                  inputMode="tel"
                />
              </label>
              <div className="flex flex-wrap gap-4 text-sm">
                {b.operatingMode !== "SKEWER" ? (
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={b.smsNotifyNewOrder}
                      onChange={(e) =>
                        updateBranch(b.id, {
                          smsNotifyNewOrder: e.target.checked,
                        })
                      }
                    />
                    ออเดอร์ลูกค้า
                  </label>
                ) : null}
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={b.smsNotifySkewerOrder}
                    onChange={(e) =>
                      updateBranch(b.id, {
                        smsNotifySkewerOrder: e.target.checked,
                      })
                    }
                  />
                  สั่งเสียบไม้
                </label>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="space-y-2 rounded-xl border border-slate-200 p-3">
        <h3 className="text-sm font-semibold text-slate-900">LINE (SkillSale OA)</h3>
        {!data.line.platformReady ? (
          <p className="text-xs text-amber-700">
            ระบบ LINE ยังไม่พร้อม — ติดต่อทีม SkillSale
          </p>
        ) : null}
        <p className="text-xs text-slate-600">
          เชื่อม LINE ส่วนตัวแล้ว {data.line.linkedOwnerCount} บัญชี ·{" "}
          <Link
            href={data.line.connectUrl}
            className="font-medium text-emerald-700 underline"
          >
            ผูก LINE
          </Link>
        </p>
        <div className="flex flex-col gap-2 text-sm">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={lineFlags.lineNotifyNewOrder}
              onChange={(e) =>
                setLineFlags((f) => ({
                  ...f,
                  lineNotifyNewOrder: e.target.checked,
                }))
              }
            />
            แจ้งออเดอร์ลูกค้าใหม่
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={lineFlags.lineNotifySkewerOrder}
              onChange={(e) =>
                setLineFlags((f) => ({
                  ...f,
                  lineNotifySkewerOrder: e.target.checked,
                }))
              }
            />
            แจ้งสั่งเสียบไม้ใหม่
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={lineFlags.lineNotifyDailySummary}
              onChange={(e) =>
                setLineFlags((f) => ({
                  ...f,
                  lineNotifyDailySummary: e.target.checked,
                }))
              }
            />
            สรุปยอดขาย / ปิดรอบ (LINE)
          </label>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {saving ? "กำลังบันทึก…" : "บันทึกการแจ้งเตือน"}
      </button>
    </section>
  );
}
