import { appAbsoluteUrlOrNull } from "@/lib/app-url";

/** QR opens public label page when app URL is configured. */
export function stockLabelQrPayload(label: {
  id: string;
  labelCode: string;
}): string {
  const url = appAbsoluteUrlOrNull(`/label/${label.id}`);
  if (url) return url;
  return `skillsale:label:${label.id}:${label.labelCode}`;
}

export function parseStockLabelQrPayload(
  raw: string,
): { id: string; labelCode: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const url = new URL(trimmed);
      const parts = url.pathname.split("/").filter(Boolean);
      const labelIdx = parts.findIndex((p) => p.toLowerCase() === "label");
      const id = labelIdx >= 0 ? parts[labelIdx + 1] : parts[parts.length - 1];
      if (id) return { id, labelCode: "" };
    }
  } catch {
    /* not a URL */
  }

  const relativeMatch = /\/label\/([^/?#]+)/i.exec(trimmed);
  if (relativeMatch) {
    return { id: relativeMatch[1], labelCode: "" };
  }

  const schemeMatch = /^(?:skillsale|hotdog):label:([^:]+):(.+)$/.exec(trimmed);
  if (schemeMatch) {
    return { id: schemeMatch[1], labelCode: schemeMatch[2] };
  }

  return null;
}

export function isStockLabelQrPayload(raw: string): boolean {
  return parseStockLabelQrPayload(raw) != null;
}
