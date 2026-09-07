"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { IconBack } from "@/components/icons";

function safeReturnPath(path: string | null): string | null {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return null;
  if (path.startsWith("/privacy")) return null;
  return path;
}

export function PrivacyBackLink({
  className,
  ariaLabel = "กลับ",
  children = <IconBack size={22} />,
}: {
  className?: string;
  ariaLabel?: string;
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
      aria-label={ariaLabel}
      className={className}
    >
      {children}
    </button>
  );
}
