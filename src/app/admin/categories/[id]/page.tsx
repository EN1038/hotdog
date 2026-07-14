"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CategoryEditorRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin");
  }, [router]);
  return (
    <p className="text-sm text-gray-500">
      หมวดหมู่ย้ายไปตั้งในหน้าสาขาแล้ว — กำลังพาไปแดชบอร์ด...
    </p>
  );
}
