import { StaffBrandingShell } from "@/components/staff/StaffBrandingShell";

export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <StaffBrandingShell>{children}</StaffBrandingShell>;
}
