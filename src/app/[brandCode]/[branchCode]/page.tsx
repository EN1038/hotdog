import { CustomerEntryGate } from "@/components/customer/CustomerEntryGate";

type Params = { params: Promise<{ brandCode: string; branchCode: string }> };

export default async function BranchEntryPage({ params }: Params) {
  const { brandCode, branchCode } = await params;
  return <CustomerEntryGate brandCode={brandCode} branchCode={branchCode} />;
}
