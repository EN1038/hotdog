import { BrandHubPage } from "@/components/customer/BrandHubPage";

type Params = { params: Promise<{ brandCode: string }> };

export default async function BrandEntryPage({ params }: Params) {
  const { brandCode } = await params;
  return <BrandHubPage brandCode={brandCode} />;
}
