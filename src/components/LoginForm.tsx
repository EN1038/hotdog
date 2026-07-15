"use client";

import { useState } from "react";
import { PhoneInput } from "@/components/PhoneInput";
import { syncStaffBrandFromLogin } from "@/components/staff/StaffBrandingShell";
import { clearStaffBrand } from "@/lib/staff-brand-session";

type LoginFormProps = {
  type: "admin" | "staff";
  title: string;
  redirectTo: string;
};

export function LoginForm({ type, title, redirectTo }: LoginFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const body =
        type === "admin" ? { username, password } : { phone };
      const res = await fetch(`/api/auth/login?type=${type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "เข้าสู่ระบบไม่สำเร็จ");
        return;
      }

      if (type === "staff") {
        syncStaffBrandFromLogin(data.brand);
      }
      window.location.assign(redirectTo);
    } catch {
      setError("เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h1 className="mb-4 text-xl font-bold text-gray-900">{title}</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        {type === "admin" ? (
          <>
            <div>
              <label className="mb-1 block text-sm text-gray-600">
                ชื่อผู้ใช้
              </label>
              <input
                className="w-full rounded border border-gray-300 px-3 py-2"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">
                รหัสผ่าน
              </label>
              <input
                type="password"
                className="w-full rounded border border-gray-300 px-3 py-2"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </>
        ) : (
          <div>
            <label className="mb-1 block text-sm text-gray-600">
              เบอร์โทรศัพท์
            </label>
            <PhoneInput
              value={phone}
              onChange={setPhone}
              className="w-full rounded border border-gray-300 px-3 py-2 focus:border-site-primary focus:outline-none focus:ring-2 ring-site-primary"
              required
            />
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-site-primary px-4 py-2 font-medium text-white hover:bg-site-primary-hover active:bg-site-primary-active disabled:opacity-50"
        >
          {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
        </button>
      </form>
    </div>
  );
}

export async function logout(redirectTo = "/") {
  clearStaffBrand();
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = redirectTo;
}
