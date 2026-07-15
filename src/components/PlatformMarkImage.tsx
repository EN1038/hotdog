import type { MarkAssetKind } from "@/lib/platform-branding";

type PlatformMarkImageProps = {
  src: string;
  alt: string;
  kind: MarkAssetKind;
  height?: number;
  className?: string;
  priority?: boolean;
};

/** Presentational mark — safe for server or client components. */
export function PlatformMarkImage({
  src,
  alt,
  kind,
  height = 40,
  className = "",
  priority = false,
}: PlatformMarkImageProps) {
  const isWordmark = kind === "logo";
  const width = isWordmark ? Math.round(height * 3.2) : height;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={`object-contain ${className}`}
      style={{ width, height }}
      {...(priority ? { fetchPriority: "high" as const } : {})}
    />
  );
}
