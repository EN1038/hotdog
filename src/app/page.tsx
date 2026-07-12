import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md space-y-6 text-center">
        <div>
          <h1 className="text-3xl font-bold text-red-700">HunterDog</h1>
          <p className="mt-2 text-gray-600">ระบบจัดการร้านหมาล่า</p>
        </div>
        <div className="space-y-3">
          <Link
            href="/order"
            className="block rounded-lg bg-red-600 px-6 py-4 font-medium text-white hover:bg-red-700"
          >
            สั่งอาหาร (ลูกค้า)
          </Link>
          <Link
            href="/staff/login"
            className="block rounded-lg border border-gray-300 bg-white px-6 py-4 font-medium text-gray-800 hover:bg-gray-50"
          >
            พนักงาน (ขาย / ส่ง)
          </Link>
          <Link
            href="/admin/login"
            className="block rounded-lg border border-gray-300 bg-white px-6 py-4 font-medium text-gray-800 hover:bg-gray-50"
          >
            ผู้ดูแลระบบ (Admin)
          </Link>
        </div>
      </div>
    </main>
  );
}
