"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AdminLoadingState,
  AdminPageHeader,
  adminCardClass,
  adminInputClass,
  adminLabelClass,
  btnPrimary,
} from "@/components/admin/AdminShell";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { useToast } from "@/components/admin/Toast";
import type { LineSettingsPublic } from "@/lib/line-settings-types";

export default function AdminLinePage() {
  const { session, loaded: sessionLoaded } = useAdminSession();
  const router = useRouter();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [settings, setSettings] = useState<LineSettingsPublic | null>(null);
  const [token, setToken] = useState("");
  const [secret, setSecret] = useState("");
  const [testStaffId, setTestStaffId] = useState("");
  const [linkedStaff, setLinkedStaff] = useState<
    { id: string; name: string | null; phone: string; branchName: string }[]
  >([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, staffRes] = await Promise.all([
        fetch("/api/admin/line-settings"),
        fetch("/api/admin/line-settings/linked-staff"),
      ]);
      if (settingsRes.status === 403) {
        router.replace("/admin");
        return;
      }
      if (!settingsRes.ok) throw new Error("โหลดไม่สำเร็จ");
      const data = (await settingsRes.json()) as LineSettingsPublic;
      setSettings(data);
      if (staffRes.ok) {
        const staffData = (await staffRes.json()) as {
          items: typeof linkedStaff;
        };
        setLinkedStaff(staffData.items ?? []);
      }
    } catch {
      toast.error("โหลดตั้งค่า LINE ไม่สำเร็จ");
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
    if (!session.isPlatformAdmin) {
      router.replace("/admin");
      return;
    }
    void load();
  }, [session, sessionLoaded, router, load]);

  async function saveCredentials(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (token.trim()) body.channelAccessToken = token.trim();
      if (secret.trim()) body.channelSecret = secret.trim();
      if (Object.keys(body).length === 0) {
        toast.error("กรอก token หรือ secret ที่ต้องการบันทึก");
        return;
      }
      const res = await fetch("/api/admin/line-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "บันทึกไม่สำเร็จ");
      setSettings(data);
      setToken("");
      setSecret("");
      toast.success("บันทึก Channel แล้ว");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "บันทึกไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }

  async function patchFlags(patch: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/line-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "บันทึกไม่สำเร็จ");
      setSettings(data);
      toast.success("อัปเดตแล้ว");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "บันทึกไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }

  async function clearField(field: "accessToken" | "secret") {
    if (!confirm("ลบค่าที่บันทึกในระบบ? (ค่าใน env ยังใช้ได้ถ้ามี)")) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/line-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          field === "accessToken"
            ? { clearAccessToken: true }
            : { clearChannelSecret: true },
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "ลบไม่สำเร็จ");
      setSettings(data);
      toast.success("ลบแล้ว");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function copyWebhook() {
    if (!settings?.webhookUrl) return;
    try {
      await navigator.clipboard.writeText(settings.webhookUrl);
      toast.success("คัดลอก Webhook URL แล้ว");
    } catch {
      toast.error("คัดลอกไม่สำเร็จ");
    }
  }

  async function sendTest() {
    if (!testStaffId) {
      toast.error("เลือกพนักงานที่เชื่อม LINE แล้ว");
      return;
    }
    setTesting(true);
    try {
      const res = await fetch("/api/admin/line-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId: testStaffId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "ส่งไม่สำเร็จ");
      toast.success("ส่งข้อความทดสอบแล้ว");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ส่งไม่สำเร็จ");
    } finally {
      setTesting(false);
    }
  }

  if (!sessionLoaded || loading || !settings) {
    return <AdminLoadingState />;
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="LINE Official Account"
        description="เชื่อม Messaging API เพื่อแจ้งเตือนพนักงานเมื่อมีออเดอร์ใหม่"
      />

      <section className={`${adminCardClass} space-y-3`}>
        <h2 className="text-base font-semibold text-slate-900">สถานะ</h2>
        <ul className="space-y-2 text-sm text-slate-700">
          <li>
            Channel:{" "}
            <strong>
              {settings.configured ? "พร้อมใช้งาน" : "ยังไม่ครบ"}
            </strong>
            {" · "}
            token ({settings.accessTokenSource}) / secret (
            {settings.channelSecretSource})
          </li>
          <li>
            การแจ้งเตือน:{" "}
            <strong>
              {settings.messagingEnabled ? "เปิดอยู่" : "ปิดอยู่"}
            </strong>
          </li>
          <li>
            พนักงานที่เชื่อม LINE แล้ว:{" "}
            <strong>{settings.linkedStaffCount}</strong> คน
          </li>
        </ul>
      </section>

      <section className={`${adminCardClass} space-y-4`}>
        <h2 className="text-base font-semibold text-slate-900">
          ขั้นตอนเชื่อมต่อ
        </h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
          <li>
            สร้าง LINE Official Account ที่{" "}
            <a
              className="text-sky-700 underline"
              href="https://manager.line.biz"
              target="_blank"
              rel="noreferrer"
            >
              manager.line.biz
            </a>
          </li>
          <li>
            เปิด Messaging API ใน OA → ตั้งค่า → Messaging API แล้วออก{" "}
            <strong>Channel access token</strong> และคัดลอก{" "}
            <strong>Channel secret</strong>
          </li>
          <li>วางค่าด้านล่าง (หรือใส่ในไฟล์ env ของเซิร์ฟเวอร์)</li>
          <li>
            ตั้ง Webhook URL ใน LINE Developers เป็น URL ด้านล่าง แล้วเปิดใช้
            Webhook
          </li>
          <li>
            ให้พนักงานเพิ่มเพื่อน OA แล้วส่งเบอร์โทรในระบบมาในแชท เช่น
            0812345678
          </li>
          <li>เปิดสวิตช์แจ้งเตือนด้านล่าง แล้วทดสอบส่งข้อความ</li>
        </ol>
      </section>

      <section className={`${adminCardClass} space-y-3`}>
        <h2 className="text-base font-semibold text-slate-900">Webhook URL</h2>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="flex-1 break-all rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-800 ring-1 ring-slate-200">
            {settings.webhookUrl || "(ตั้ง NEXT_PUBLIC_APP_URL ก่อน)"}
          </code>
          <button
            type="button"
            onClick={() => void copyWebhook()}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            คัดลอก
          </button>
        </div>
        <p className="text-xs text-slate-500">
          วางใน LINE Developers → Messaging API → Webhook URL แล้วกด Verify /
          Enable
        </p>
      </section>

      <form
        onSubmit={(e) => void saveCredentials(e)}
        className={`${adminCardClass} space-y-4`}
      >
        <h2 className="text-base font-semibold text-slate-900">
          Channel credentials
        </h2>
        <p className="text-xs text-slate-500">
          ค่าว่าง = ไม่ทับของเดิม · ถ้ามีใน env จะใช้ env ก่อนค่าในฐานข้อมูล
        </p>
        <div>
          <label className={adminLabelClass} htmlFor="line-token">
            Channel access token
          </label>
          <input
            id="line-token"
            type="password"
            autoComplete="off"
            className={adminInputClass}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={
              settings.hasAccessToken
                ? "มีค่าอยู่แล้ว — วางใหม่เพื่อแทนที่"
                : "วาง Long-lived channel access token"
            }
          />
          {settings.accessTokenSource === "database" && (
            <button
              type="button"
              className="mt-1 text-xs text-red-600 underline"
              onClick={() => void clearField("accessToken")}
            >
              ลบ token ในฐานข้อมูล
            </button>
          )}
        </div>
        <div>
          <label className={adminLabelClass} htmlFor="line-secret">
            Channel secret
          </label>
          <input
            id="line-secret"
            type="password"
            autoComplete="off"
            className={adminInputClass}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder={
              settings.hasChannelSecret
                ? "มีค่าอยู่แล้ว — วางใหม่เพื่อแทนที่"
                : "วาง Channel secret"
            }
          />
          {settings.channelSecretSource === "database" && (
            <button
              type="button"
              className="mt-1 text-xs text-red-600 underline"
              onClick={() => void clearField("secret")}
            >
              ลบ secret ในฐานข้อมูล
            </button>
          )}
        </div>
        <button type="submit" disabled={saving} className={btnPrimary}>
          {saving ? "กำลังบันทึก..." : "บันทึก Channel"}
        </button>
      </form>

      <section className={`${adminCardClass} space-y-4`}>
        <h2 className="text-base font-semibold text-slate-900">การแจ้งเตือน</h2>
        <label className="flex items-center justify-between gap-3 text-sm text-slate-800">
          <span>เปิดใช้การแจ้งเตือน LINE</span>
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={settings.messagingEnabled}
            disabled={saving || !settings.configured}
            onChange={(e) =>
              void patchFlags({ messagingEnabled: e.target.checked })
            }
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm text-slate-800">
          <span>แจ้ง staff (บทบาทขาย) เมื่อมีออเดอร์ใหม่</span>
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={settings.notifyStaffOnNewOrder}
            disabled={saving}
            onChange={(e) =>
              void patchFlags({ notifyStaffOnNewOrder: e.target.checked })
            }
          />
        </label>
      </section>

      <section className={`${adminCardClass} space-y-4`}>
        <h2 className="text-base font-semibold text-slate-900">ทดสอบส่ง</h2>
        {linkedStaff.length === 0 ? (
          <p className="text-sm text-slate-600">
            ยังไม่มีพนักงานเชื่อม LINE — ให้เพิ่มเพื่อน OA แล้วส่งเบอร์โทรในแชท
          </p>
        ) : (
          <>
            <div>
              <label className={adminLabelClass} htmlFor="test-staff">
                พนักงาน
              </label>
              <select
                id="test-staff"
                className={adminInputClass}
                value={testStaffId}
                onChange={(e) => setTestStaffId(e.target.value)}
              >
                <option value="">เลือก...</option>
                {linkedStaff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {(s.name || s.phone) + " · " + s.branchName}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={testing}
              onClick={() => void sendTest()}
              className={btnPrimary}
            >
              {testing ? "กำลังส่ง..." : "ส่งข้อความทดสอบ"}
            </button>
          </>
        )}
      </section>
    </div>
  );
}
