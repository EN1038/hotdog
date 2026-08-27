import { handleApiError, jsonError } from "@/lib/api";

/**
 * Same-origin image proxy for html-to-image / canvas capture.
 * Browser cannot read DigitalOcean Spaces pixels without CORS;
 * server fetch has no CORS restriction.
 *
 * Only allows https hosts under digitaloceanspaces.com (and optional CDN alias).
 */
function isAllowedImageHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "digitaloceanspaces.com" || host.endsWith(".digitaloceanspaces.com")) {
    return true;
  }
  // Optional custom CDN / public URL host from env
  try {
    const publicHost = process.env.S3_PUBLIC_URL
      ? new URL(process.env.S3_PUBLIC_URL).hostname.toLowerCase()
      : "";
    if (publicHost && host === publicHost) return true;
  } catch {
    /* ignore */
  }
  return false;
}

export async function GET(request: Request) {
  try {
    const raw = new URL(request.url).searchParams.get("url")?.trim();
    if (!raw) return jsonError("ต้องระบุ url");

    let target: URL;
    try {
      target = new URL(raw);
    } catch {
      return jsonError("url ไม่ถูกต้อง");
    }

    if (target.protocol !== "https:") {
      return jsonError("รองรับเฉพาะ https");
    }
    if (!isAllowedImageHost(target.hostname)) {
      return jsonError("โฮสต์รูปไม่อนุญาต");
    }

    const upstream = await fetch(target.toString(), {
      headers: { Accept: "image/*,*/*;q=0.8" },
      // Avoid caching stale 403/redirect forever in edge
      next: { revalidate: 3600 },
    });

    if (!upstream.ok) {
      return jsonError("โหลดรูปไม่สำเร็จ", upstream.status === 404 ? 404 : 502);
    }

    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/") && !contentType.includes("octet-stream")) {
      return jsonError("ไฟล์ไม่ใช่รูปภาพ");
    }

    const buffer = await upstream.arrayBuffer();
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType.startsWith("image/")
          ? contentType
          : "image/jpeg",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
