"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneInput } from "@/components/PhoneInput";

type LoginFormProps = {
  type: "admin" | "staff";
  title: string;
  redirectTo: string;
};

export function LoginForm({ type, title, redirectTo }: LoginFormProps) {
  const router = useRouter();
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

      // Soft nav keeps AdminSessionProvider mounted with a stale/null session,
      // which made platform vs brand home pages look swapped. Force a full load.
      if (type === "admin") {
        window.location.assign(redirectTo);
        return;
      }

      router.push(redirectTo);
      router.refresh();
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
              className="w-full rounded border border-gray-300 px-3 py-2"
              required
            />
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
        </button>
      </form>
    </div>
  );
}

export async function logout(redirectTo = "/") {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = redirectTo;
}
