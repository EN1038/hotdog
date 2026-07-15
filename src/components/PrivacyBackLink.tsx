"use client";

import { useRouter, useSearchParams } from "next/navigation";

function safeReturnPath(path: string | null): string | null {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return null;
  if (path.startsWith("/privacy")) return null;
  return path;
}

export function PrivacyBackLink({
  className,
  children = "กลับ",
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = safeReturnPath(searchParams.get("returnTo"));

  return (
    <button
      type="button"
      onClick={() => {
        if (returnTo) {
          router.push(returnTo);
          return;
        }
        router.back();
      }}
      className={className}
    >
      {children}
    </button>
  );
}
