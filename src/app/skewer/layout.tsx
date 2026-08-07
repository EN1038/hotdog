import { OrderBrandingShell } from "@/components/customer/OrderBrandingShell";

export default function SkewerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <OrderBrandingShell>{children}</OrderBrandingShell>;
}
