import {
  SKILLSALE_ICON_URL,
  SKILLSALE_LOGO_URL,
  SKILLSALE_NAME,
} from "@/lib/brand-assets";

type SkillSaleMarkProps = {
  /** icon = ไอคอนอย่างเดียว, wordmark = โลโก้มีตัวอักษร */
  variant?: "icon" | "wordmark";
  /** ความสูงโดยประมาณ (px) — width คำนวณอัตโนมัติ */
  height?: number;
  className?: string;
  priority?: boolean;
};

export function SkillSaleMark({
  variant = "icon",
  height = 40,
  className = "",
  priority = false,
}: SkillSaleMarkProps) {
  const isWordmark = variant === "wordmark";
  const src = isWordmark ? SKILLSALE_LOGO_URL : SKILLSALE_ICON_URL;
  const width = isWordmark ? Math.round(height * 3.2) : height;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={SKILLSALE_NAME}
      width={width}
      height={height}
      className={`object-contain ${className}`}
      style={{ width, height }}
      {...(priority ? { fetchPriority: "high" as const } : {})}
    />
  );
}
