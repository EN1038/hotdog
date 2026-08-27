import { redirect } from "next/navigation";

type Props = { params: Promise<{ token: string }> };

/** Legacy SMS links → short `/s/[token]` path. */
export default async function LegacyPublicSkewerShareRedirect({
  params,
}: Props) {
  const { token } = await params;
  redirect(`/s/${encodeURIComponent(token)}`);
}
