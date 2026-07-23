"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AdminLoadingState,
  AdminPageHeader,
  adminCardClass,
  btnPrimary,
} from "@/components/admin/AdminShell";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { useToast } from "@/components/admin/Toast";

type LineLinkStatus = {
  username: string;
  linked: boolean;
  canReceiveDailySummary: boolean;
  brands: Array<{ id: string; name: string; role: string }>;
  activeCode: string | null;
  codeExpiresAt: string | null;
};

export default function AdminLineConnectPage() {
  const { session, loaded: sessionLoaded } = useAdminSession();
  const router = useRouter();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<LineLinkStatus | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/me/line-link");
      if (res.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!res.ok) throw new Error("โหลดไม่สำเร็จ");
      const data = (await res.json()) as LineLinkStatus;
      setStatus(data);
      if (data.activeCode && data.codeExpiresAt) {
        setCode(data.activeCode);
        setExpiresAt(data.codeExpiresAt);
      }
    } catch {
      toast.error("โหลดสถานะ LINE ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [router, toast]);

  useEffect(() => {
    if (!sessionLoaded) return;
    if (!session) {
      router.replace("/admin/login");
      return;
    }
    void load();
  }, [session, sessionLoaded, router, load]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const remainingSec = expiresAt
    ? Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000))
    : 0;

  useEffect(() => {
    if (expiresAt && remainingSec <= 0) {
      setCode(null);
      setExpiresAt(null);
    }
  }, [expiresAt, remainingSec]);

  async function issueCode() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/me/line-link", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "สร้างรหัสไม่สำเร็จ");
      setCode(data.code);
      setExpiresAt(data.expiresAt);
      toast.success("สร้างรหัสแล้ว — ส่งในแชท LINE OA ภายใน 10 นาที");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "สร้างรหัสไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    if (!confirm("ยกเลิกการเชื่อม LINE กับบัญชีนี้?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/me/line-link", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "ยกเลิกไม่สำเร็จ");
      setCode(null);
      setExpiresAt(null);
      toast.success("ยกเลิกการเชื่อมแล้ว");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ยกเลิกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      toast.success("คัดลอกรหัสแล้ว");
    } catch {
      toast.error("คัดลอกไม่สำเร็จ");
    }
  }

  if (!sessionLoaded || loading || !status) {
    return <AdminLoadingState />;
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="เชื่อม LINE"
        description="ผูกบัญชีแอดมินกับ LINE OA เพื่อรับสรุปตัดรอบสาขา — ต้องล็อกอินและใช้รหัสครั้งเดียว"
      />

      <section className={`${adminCardClass} space-y-3`}>
        <h2 className="text-base font-semibold text-slate-900">สถานะ</h2>
        <ul className="space-y-2 text-sm text-slate-700">
          <li>
            บัญชี: <strong>{status.username}</strong>
          </li>
          <li>
            LINE:{" "}
            <strong>{status.linked ? "เชื่อมแล้ว" : "ยังไม่เชื่อม"}</strong>
          </li>
          <li>
            สิทธิ์รับสรุปตัดรอบ:{" "}
            <strong>
              {status.canReceiveDailySummary ? "ได้" : "ไม่ได้ (ไม่ใช่เจ้าของ/ผู้จัดการแบรนด์)"}
            </strong>
          </li>
          {status.brands.length > 0 && (
            <li>
              แบรนด์:{" "}
              {status.brands
                .map(
                  (b) =>
                    `${b.name} (${b.role === "OWNER" ? "เจ้าของ" : "ผู้จัดการ"})`,
                )
                .join(", ")}
            </li>
          )}
        </ul>
      </section>

      <section className={`${adminCardClass} space-y-4`}>
        <h2 className="text-base font-semibold text-slate-900">วิธีเชื่อมต่อ</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
          <li>กดสร้างรหัสด้านล่าง (ใช้ได้ 10 นาที)</li>
          <li>เปิด LINE แล้วเพิ่มเพื่อน Official Account ของร้าน</li>
          <li>ส่งรหัส 6 หลักในแชท OA</li>
          <li>รอข้อความยืนยันการเชื่อมต่อ</li>
        </ol>

        {!status.canReceiveDailySummary ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
            บัญชีนี้ไม่ใช่เจ้าของ/ผู้จัดการแบรนด์ จึงสร้างรหัสเชื่อมสำหรับสรุปตัดรอบไม่ได้
          </p>
        ) : (
          <>
            {code && remainingSec > 0 ? (
              <div className="rounded-xl bg-slate-50 px-4 py-5 text-center ring-1 ring-slate-200">
                <p className="text-xs font-medium text-slate-500">รหัสเชื่อมต่อ</p>
                <p className="mt-1 font-mono text-4xl font-bold tracking-[0.2em] text-slate-900">
                  {code}
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  หมดอายุใน {Math.floor(remainingSec / 60)}:
                  {String(remainingSec % 60).padStart(2, "0")} นาที
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => void copyCode()}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-white"
                  >
                    คัดลอกรหัส
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void issueCode()}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-white disabled:opacity-50"
                  >
                    สร้างรหัสใหม่
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => void issueCode()}
                className={btnPrimary}
              >
                {busy ? "กำลังสร้าง..." : "สร้างรหัสเชื่อม LINE"}
              </button>
            )}
          </>
        )}
      </section>

      {status.linked && (
        <section className={`${adminCardClass} space-y-3`}>
          <h2 className="text-base font-semibold text-slate-900">จัดการ</h2>
          <button
            type="button"
            disabled={busy}
            onClick={() => void unlink()}
            className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            ยกเลิกการเชื่อม LINE
          </button>
        </section>
      )}
    </div>
  );
}
