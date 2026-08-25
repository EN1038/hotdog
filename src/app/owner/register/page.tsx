import Link from "next/link";
import { PlatformMark } from "@/components/PlatformMark";
import {
  PLATFORM_LINE_ADD_URL,
  PLATFORM_LINE_QR_SRC,
} from "@/lib/platform-support";

export default function OwnerRegisterPage() {
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
          สมัครเป็นร้านค้า
        </h1>
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-8">
        <PlatformMark placement="login" height={36} priority />
        <p className="mt-4 text-lg font-bold text-gray-900">
          แอดไลน์ แล้วแอดมินสมัครให้
        </p>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          ไม่ต้องกรอกฟอร์มเอง — ส่งชื่อร้านมาทาง LINE ทีมงานจะเปิดบัญชีให้
        </p>

        <div className="mt-8 rounded-3xl bg-white p-6 text-center shadow-sm">
          <a
            href={PLATFORM_LINE_ADD_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={PLATFORM_LINE_QR_SRC}
              alt="QR เพิ่มเพื่อน LINE SkillSale"
              width={240}
              height={240}
              className="mx-auto h-56 w-56 object-contain"
            />
          </a>
          <p className="mt-3 text-sm font-medium text-gray-700">
            สแกน QR ด้วยแอป LINE
          </p>
        </div>

        <a
          href={PLATFORM_LINE_ADD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 flex min-h-14 w-full items-center justify-center rounded-2xl bg-[#06C755] px-4 py-4 text-base font-extrabold text-white shadow-sm active:scale-[0.99]"
        >
          เพิ่มเพื่อนใน LINE
        </a>

        <p className="mt-8 text-center text-sm text-gray-500">
          มีบัญชีแล้ว?{" "}
          <Link href="/owner/login" className="font-semibold text-site-primary">
            เข้าสู่ระบบ
          </Link>
        </p>
      </div>
    </main>
  );
}
