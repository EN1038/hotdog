import { Suspense } from "react";
import { StaffBrandingShell } from "@/components/staff/StaffBrandingShell";

export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <StaffBrandingShell>{children}</StaffBrandingShell>
    </Suspense>
  );
}
