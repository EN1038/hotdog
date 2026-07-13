import { CustomerProvider } from "@/components/customer/CustomerProvider";
import { SiteBrandingProvider } from "@/components/customer/SiteBrandingProvider";

export default function OrderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SiteBrandingProvider>
      <CustomerProvider>
        <div className="mx-auto min-h-screen w-full max-w-md bg-[#f5f5f6] shadow-xl">
          {children}
        </div>
      </CustomerProvider>
    </SiteBrandingProvider>
  );
}
