"use client";

import { useRouter } from "next/navigation";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { StaffPackageOutPanel } from "@/components/staff/StaffPackageOutPanel";

export default function PackageOutPage() {
  const router = useRouter();
  return (
    <StaffAppShell active="stock">
      <StaffPackageOutPanel onBack={() => router.push("/staff/stock")} />
    </StaffAppShell>
  );
}
