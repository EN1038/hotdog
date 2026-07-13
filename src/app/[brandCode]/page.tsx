import { CustomerEntryGate } from "@/components/customer/CustomerEntryGate";

type Params = { params: Promise<{ brandCode: string }> };

export default async function BrandEntryPage({ params }: Params) {
  const { brandCode } = await params;
  return <CustomerEntryGate brandCode={brandCode} />;
}
