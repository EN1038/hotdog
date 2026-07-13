"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CustomerLoginScreen } from "@/components/customer/CustomerLoginScreen";

function safeReturnPath(path: string | null): string {
  if (!path || !path.startsWith("/order")) return "/order";
  return path;
}

function OrderLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = safeReturnPath(searchParams.get("returnTo"));

  return (
    <CustomerLoginScreen
      showBrowseOption={false}
      onBack={() => router.replace(returnTo)}
      onSuccess={() => router.replace(returnTo)}
    />
  );
}

export default function OrderLoginPage() {
  return (
    <Suspense fallback={null}>
      <OrderLoginContent />
    </Suspense>
  );
}
