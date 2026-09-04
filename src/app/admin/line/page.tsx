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

type LinkedAdmin = {
  id: string;
  username: string;
  brands: string[];
};

export default function AdminLinePage() {
  const { session, loaded: sessionLoaded } = useAdminSession();
  const router = useRouter();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [richMenuBusy, setRichMenuBusy] = useState(false);
  const [settings, setSettings] = useState<LineSettingsPublic | null>(null);
  const [token, setToken] = useState("");
  const [secret, setSecret] = useState("");
  const [testAdminId, setTestAdminId] = useState("");
  const [linkedAdmins, setLinkedAdmins] = useState<LinkedAdmin[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, adminRes] = await Promise.all([
        fetch("/api/admin/line-settings"),
        fetch("/api/admin/line-settings/linked-admins"),
      ]);
      if (settingsRes.status === 403) {
        router.replace("/admin");
        return;
      }
      if (!settingsRes.ok) throw new Error("โหลดไม่สำเร็จ");
      const data = (await settingsRes.json()) as LineSettingsPublic;
      setSettings(data);
      if (adminRes.ok) {
        const adminData = (await adminRes.json()) as { items: LinkedAdmin[] };
        setLinkedAdmins(adminData.items ?? []);
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

  async function sendTestAdmin() {
    if (!testAdminId) {
      toast.error("เลือกแอดมินที่เชื่อม LINE แล้ว");
      return;
    }
    setTesting(true);
    try {
      const res = await fetch("/api/admin/line-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminId: testAdminId }),
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

  async function deployRichMenu() {
    setRichMenuBusy(true);
    try {
      const res = await fetch("/api/admin/line-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deployRichMenu: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "สร้างเมนูไม่สำเร็จ");
      if (data.settings) setSettings(data.settings as LineSettingsPublic);
      const linked = data.richMenu?.linkedAdmins ?? 0;
      toast.success("สร้างเมนูแอดมินแล้ว", `ลิงก์ให้แอดมิน ${linked} คน`);
      if (Array.isArray(data.richMenu?.errors) && data.richMenu.errors.length) {
        toast.error("บางคนลิงก์ไม่สำเร็จ", String(data.richMenu.errors[0]));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "สร้างเมนูไม่สำเร็จ");
    } finally {
      setRichMenuBusy(false);
    }
  }

  async function relinkRichMenu() {
    setRichMenuBusy(true);
    try {
      const res = await fetch("/api/admin/line-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkRichMenu: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "ลิงก์เมนูไม่สำเร็จ");
      const linked = data.richMenuLink?.linked ?? 0;
      toast.success("ลิงก์เมนูแล้ว", `${linked} แอดมิน`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ลิงก์เมนูไม่สำเร็จ");
    } finally {
      setRichMenuBusy(false);
    }
  }

  if (!sessionLoaded || loading || !settings) {
    return <AdminLoadingState />;
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="LINE Official Account"
        description="OA หลังบ้าน SkillSale POS — รหัสผ่านแชท · แจ้งสมัคร Owner · แก้ไข/ลบออเดอร์"
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
            เพื่อน OA ที่ปลดล็อกรหัสผ่าน:{" "}
            <strong>{settings.unlockedLineUserCount}</strong> คน ·
            แอดมินที่เชื่อมสิทธิ์แก้ไข-ลบ:{" "}
            <strong>{settings.linkedAdminCount}</strong> คน
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
            เปิด Messaging API แล้วออก{" "}
            <strong>Channel access token</strong> + คัดลอก{" "}
            <strong>Channel secret</strong>
          </li>
          <li>วางค่าด้านล่าง ตั้ง Webhook URL แล้วเปิดใช้ Webhook</li>
          <li>
            แอดเพื่อน OA แล้วพิมพ์รหัสผ่านแชท{" "}
            <code className="rounded bg-slate-100 px-1">อร่อยจังเลย</code>
          </li>
          <li>
            ต้องการแก้ไข/ลบออเดอร์: เข้า{" "}
            <strong>/admin/line-connect</strong> สร้างรหัส 6 หลัก แล้วส่งในแชท
          </li>
          <li>เปิดสวิตช์แจ้งเตือนด้านล่างเมื่อต้องการรับแจ้งสมัคร Owner</li>
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
        <h2 className="text-base font-semibold text-slate-900">
          เมนูแอดมิน (Rich Menu)
        </h2>
        <p className="text-sm text-slate-600">
          สร้างเมนูสำหรับแอดมินแพลตฟอร์มที่เชื่อมแล้ว (โหมดลบ / แก้ไข /
          ช่วยเหลือ)
        </p>
        <ul className="space-y-1 text-sm text-slate-700">
          <li>
            เมนูแอดมิน:{" "}
            <strong>
              {settings.adminRichMenuId ? "สร้างแล้ว" : "ยังไม่สร้าง"}
            </strong>
          </li>
          <li>
            เมนูเข้าสู่ระบบ:{" "}
            <strong>
              {settings.guestRichMenuId ? "สร้างแล้ว" : "ยังไม่สร้าง"}
            </strong>
          </li>
        </ul>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={richMenuBusy || !settings.configured}
            onClick={() => void deployRichMenu()}
            className={btnPrimary}
          >
            {richMenuBusy ? "กำลังทำงาน…" : "สร้าง / อัปเดตเมนู LINE"}
          </button>
          <button
            type="button"
            disabled={
              richMenuBusy || !settings.configured || !settings.adminRichMenuId
            }
            onClick={() => void relinkRichMenu()}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            ลิงก์เมนูแอดมินให้ทุกคนที่เชื่อมแล้ว
          </button>
        </div>
      </section>

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
          <span>แจ้งเมื่อมีคนสมัครเข้าใช้งาน Owner</span>
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={settings.notifyOwnerRegistration}
            disabled={saving || !settings.messagingEnabled}
            onChange={(e) =>
              void patchFlags({ notifyOwnerRegistration: e.target.checked })
            }
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm text-slate-800">
          <span>แจ้งทดลองใกล้หมดอายุ (1 / 3 วัน)</span>
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={settings.notifyTrialEnding}
            disabled={saving || !settings.messagingEnabled}
            onChange={(e) =>
              void patchFlags({ notifyTrialEnding: e.target.checked })
            }
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm text-slate-800">
          <span>แจ้งเมื่อแบรนด์หยุดใช้ / หมดอายุ</span>
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={settings.notifyBrandStatus}
            disabled={saving || !settings.messagingEnabled}
            onChange={(e) =>
              void patchFlags({ notifyBrandStatus: e.target.checked })
            }
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm text-slate-800">
          <span>แจ้งสมัครแล้วยังไม่เริ่มใช้งาน</span>
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={settings.notifyInactiveOnboard}
            disabled={saving || !settings.messagingEnabled}
            onChange={(e) =>
              void patchFlags({ notifyInactiveOnboard: e.target.checked })
            }
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm text-slate-800">
          <span>แจ้งข้อผิดพลาดระบบ (SMS ล้มเหลวพุ่ง)</span>
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={settings.notifySystemErrors}
            disabled={saving || !settings.messagingEnabled}
            onChange={(e) =>
              void patchFlags({ notifySystemErrors: e.target.checked })
            }
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm text-slate-800">
          <span>สรุปรายวันแพลตฟอร์ม</span>
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={settings.notifyDailyOpsSummary}
            disabled={saving || !settings.messagingEnabled}
            onChange={(e) =>
              void patchFlags({ notifyDailyOpsSummary: e.target.checked })
            }
          />
        </label>
        <p className="text-xs text-slate-500">
          ส่งไปยังเพื่อน OA ที่พิมพ์รหัสผ่านถูกต้องแล้ว · ดูรายการที่{" "}
          <a href="/admin/ops" className="text-sky-700 underline">
            /admin/ops
          </a>
          {" · "}
          cron{" "}
          <code className="rounded bg-slate-100 px-1">
            /api/cron/platform-ops
          </code>
        </p>
      </section>

      <section className={`${adminCardClass} space-y-4`}>
        <h2 className="text-base font-semibold text-slate-900">
          ทดสอบ · แอดมินที่เชื่อมแล้ว
        </h2>
        {linkedAdmins.length === 0 ? (
          <p className="text-sm text-slate-600">
            ยังไม่มีแอดมินเชื่อม LINE — เข้า{" "}
            <strong>/admin/line-connect</strong> สร้างรหัสแล้วส่งในแชท OA
          </p>
        ) : (
          <>
            <ul className="space-y-1 text-sm text-slate-700">
              {linkedAdmins.map((a) => (
                <li key={a.id}>
                  <strong>{a.username}</strong>
                  {a.brands.length > 0 ? ` · ${a.brands.join(", ")}` : ""}
                </li>
              ))}
            </ul>
            <div>
              <label className={adminLabelClass} htmlFor="test-admin">
                แอดมิน
              </label>
              <select
                id="test-admin"
                className={adminInputClass}
                value={testAdminId}
                onChange={(e) => setTestAdminId(e.target.value)}
              >
                <option value="">เลือก...</option>
                {linkedAdmins.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.username}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={testing}
              onClick={() => void sendTestAdmin()}
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
