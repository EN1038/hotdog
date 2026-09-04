import { ShopDirectory } from "@/components/customer/ShopDirectory";

export default function ShopsPage() {
  return (
    <ShopDirectory
      backHref="/"
      title="เลือกร้าน"
      showBrandHeaders
    />
  );
}
