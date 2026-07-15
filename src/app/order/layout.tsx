import { OrderBrandingShell } from "@/components/customer/OrderBrandingShell";

export default function OrderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <OrderBrandingShell>{children}</OrderBrandingShell>;
}
