"use client";

import Link from "next/link";
import { useState } from "react";
import { PlatformMark } from "@/components/PlatformMark";
import {
  merchantButtonClass,
  merchantInputClass,
  merchantLabelClass,
} from "@/components/merchant-login-ui";

export type AdminLoginMode = "owner" | "platform";

const LOGIN_COPY: Record<
  AdminLoginMode,
  { title: string; description: string; usernameLabel: string; hint: string }
> = {
  owner: {
    title: "เข้าใช้งาน SkillSale",
    description: "ใช้ไอดีที่ได้ตอนเปิดร้าน",
    usernameLabel: "ชื่อสำหรับเข้าใช้งาน",
    hint: "ใช้ไอดีและรหัสผ่านที่ได้รับตอนเปิดร้าน",
  },
  platform: {
    title: "เข้าใช้งานแพลตฟอร์ม",
    description: "สำหรับทีม SkillSale",
    usernameLabel: "ไอดีแพลตฟอร์ม",
    hint: "หน้านี้สำหรับทีม SkillSale เท่านั้น",
  },
};

export function AdminLoginScreen({ mode = "platform" }: { mode?: AdminLoginMode }) {
  const copy = LOGIN_COPY[mode];
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
      const text = await res.text();
      let data: { error?: string; isPlatformAdmin?: boolean } = {};
      try {
        data = text ? (JSON.parse(text) as typeof data) : {};
      } catch {
        if (res.status === 502 || res.status === 503 || res.status === 504) {
          setError("ระบบล็อกอินขัดข้องชั่วคราว — ลองใหม่ในอีกสักครู่");
        } else {
          setError("เข้าไม่ได้ — ลองใหม่ หรือแจ้งแอดมิน");
        }
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "ไอดีหรือรหัสผ่านไม่ถูกต้อง");
        return;
      }
      window.location.assign(
        mode === "owner" && !data.isPlatformAdmin ? "/owner" : "/admin",
      );
    } catch {
      setError("เชื่อมต่อไม่ได้ — ตรวจเน็ตแล้วลองใหม่");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col bg-[#f4f5f7]">
      <header className="flex items-center gap-2 border-b border-gray-200 bg-white px-2 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link
          href="/"
          className="flex h-12 w-12 items-center justify-center rounded-xl text-gray-700"
          aria-label="กลับ"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M15 5l-7 7 7 7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <h1 className="flex-1 pr-12 text-center text-base font-bold text-gray-900">
          {copy.title}
        </h1>
      </header>

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-8">
        <PlatformMark placement="login" height={36} priority />
        <p className="mt-3 text-sm text-gray-600">{copy.description}</p>

        <form onSubmit={handleSubmit} className="mt-10 space-y-6">
          <div>
            <label htmlFor="admin-username" className={merchantLabelClass}>
              {copy.usernameLabel}
            </label>
            <input
              id="admin-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={merchantInputClass}
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label htmlFor="admin-password" className={merchantLabelClass}>
              รหัสผ่าน
            </label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={merchantInputClass}
              autoComplete="current-password"
              required
            />
          </div>

          <div className="flex gap-2 rounded-2xl bg-sky-50 px-4 py-4 text-sm leading-relaxed text-sky-950">
            <span className="mt-0.5 text-lg" aria-hidden>
              💡
            </span>
            <p>{copy.hint}</p>
          </div>

          {error ? (
            <p className="text-base text-red-600" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className={merchantButtonClass}
          >
            {loading ? "กำลังเข้าสู่ระบบ..." : "ถัดไป"}
          </button>
        </form>

        {mode === "owner" ? (
          <p className="mt-6 text-center text-sm text-gray-500">
            ยังไม่มีบัญชี?{" "}
            <Link href="/owner/register" className="font-semibold text-site-primary">
              สมัครเป็นร้านค้า
            </Link>
          </p>
        ) : null}
      </div>
    </main>
  );
}
