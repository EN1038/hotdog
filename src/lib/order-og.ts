import type { Metadata } from "next";
import { getAppOrigin } from "@/lib/app-url";
import {
  getPlatformSettings,
  resolvePlatformMarkForPlacement,
} from "@/lib/platform-settings";

export function absoluteOgUrl(value: string, origin: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  if (!origin) return value;
  return `${origin}/${value.replace(/^\/+/, "")}`;
}

export async function buildOrderShareMetadata(input: {
  title: string;
  description: string;
  path: string;
  imageCandidates: Array<string | null | undefined>;
  imageAlt: string;
}): Promise<Metadata> {
  const platform = await getPlatformSettings();
  const origin = getAppOrigin();
  const pageUrl = absoluteOgUrl(input.path, origin);
  const platformImage = resolvePlatformMarkForPlacement(platform, "order").src;
  const picked =
    input.imageCandidates.map((v) => v?.trim()).find(Boolean) || platformImage;
  const image = absoluteOgUrl(picked, origin);

  return {
    title: input.title,
    description: input.description,
    ...(origin ? { metadataBase: new URL(origin) } : {}),
    alternates: { canonical: pageUrl },
    openGraph: {
      type: "website",
      locale: "th_TH",
      url: pageUrl,
      siteName: platform.siteName,
      title: input.title,
      description: input.description,
      images: [{ url: image, alt: input.imageAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description: input.description,
      images: [image],
    },
  };
}
