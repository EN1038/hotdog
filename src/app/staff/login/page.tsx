import { LoginForm } from "@/components/LoginForm";
import Link from "next/link";

export default function StaffLoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6">
      <LoginForm
        type="staff"
        title="เข้าสู่ระบบพนักงาน"
        redirectTo="/staff"
      />
      <Link href="/" className="mt-4 text-sm text-gray-500 hover:underline">
        กลับหน้าหลัก
      </Link>
    </main>
  );
}
