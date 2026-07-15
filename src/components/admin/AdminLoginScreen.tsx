"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PlatformMark } from "@/components/PlatformMark";

export function AdminLoginScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login?type=admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "เข้าสู่ระบบไม่สำเร็จ");
        return;
      }
      window.location.assign("/admin");
    } catch {
      setError("เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[#f3f1ef]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--site-primary) 35%, transparent), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.045]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #171717 1px, transparent 1px), linear-gradient(to bottom, #171717 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
        <div
          className={`transition-all duration-700 ease-out ${
            ready ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
          }`}
        >
          <PlatformMark placement="login" height={44} priority />
          <h1 className="mt-6 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            เข้าสู่ระบบ Admin
          </h1>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-gray-600">
            สำหรับผู้ดูแลแพลตฟอร์มและผู้ดูแลแบรนด์ในการจัดการร้านค้าและออเดอร์
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className={`mt-10 space-y-5 transition-all delay-150 duration-700 ease-out ${
            ready ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
          }`}
        >
          <div>
            <label
              htmlFor="admin-username"
              className="mb-2 block text-sm font-medium text-gray-800"
            >
              ชื่อผู้ใช้
            </label>
            <input
              id="admin-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-2xl border border-gray-200 bg-white/90 px-4 py-3.5 text-base text-gray-900 shadow-sm backdrop-blur-sm placeholder:text-gray-400 focus:border-site-primary focus:outline-none focus:ring-2 ring-site-primary"
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label
              htmlFor="admin-password"
              className="mb-2 block text-sm font-medium text-gray-800"
            >
              รหัสผ่าน
            </label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-2xl border border-gray-200 bg-white/90 px-4 py-3.5 text-base text-gray-900 shadow-sm backdrop-blur-sm placeholder:text-gray-400 focus:border-site-primary focus:outline-none focus:ring-2 ring-site-primary"
              autoComplete="current-password"
              required
            />
          </div>

          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-site-primary px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-site-primary-hover active:bg-site-primary-active active:scale-[0.99] disabled:opacity-50"
          >
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>

        <p
          className={`mt-8 text-center transition-opacity delay-300 duration-700 ${
            ready ? "opacity-100" : "opacity-0"
          }`}
        >
          <Link
            href="/"
            className="text-sm font-medium text-gray-500 hover:text-site-primary"
          >
            กลับหน้าหลัก
          </Link>
        </p>
      </div>
    </main>
  );
}
