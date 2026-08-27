/** Client helpers: save image, share image, share/copy public link. */

export function downloadDataUrl(
  dataUrl: string,
  filename: string,
): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename.includes(".") ? filename : `${filename}.png`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function safeShareFilename(filename: string): string {
  const base = filename.includes(".")
    ? filename
    : `${filename}.png`;
  // Some browsers reject Web Share File names with Thai / spaces
  return base.replace(/[^\w.\-]+/g, "_").replace(/^_+|_+$/g, "") || "share.png";
}

function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("invalid data url");
  const header = dataUrl.slice(0, comma);
  const data = dataUrl.slice(comma + 1);
  const mime = /data:([^;]+)/.exec(header)?.[1] || "image/png";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

async function dataUrlToFile(
  dataUrl: string,
  filename: string,
): Promise<File> {
  const blob = dataUrlToBlob(dataUrl);
  const name = safeShareFilename(filename);
  return new File([blob], name, { type: blob.type || "image/png" });
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

/** Soft gray tile used when a menu photo cannot be inlined. */
const CAPTURE_IMAGE_PLACEHOLDER =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="112" height="112" viewBox="0 0 112 112"><rect width="112" height="112" fill="#f3f4f6"/><path d="M28 72l16-20 12 14 16-22 20 28H28z" fill="#d1d5db"/><circle cx="42" cy="40" r="8" fill="#d1d5db"/></svg>`,
  );

function isProbablyRemoteHttpUrl(src: string): boolean {
  return /^https?:\/\//i.test(src);
}

/** Same-origin proxy so Spaces images load (and capture) without CORS/hotlink issues. */
export function sameOriginMediaProxyUrl(absoluteImageUrl: string): string {
  return `/api/media/proxy?url=${encodeURIComponent(absoluteImageUrl)}`;
}

function sameOriginProxyUrl(absoluteImageUrl: string): string {
  return sameOriginMediaProxyUrl(absoluteImageUrl);
}

/**
 * Rewrite remote Spaces/CDN image URLs through `/api/media/proxy`.
 * Leaves relative, data:, and blob: URLs unchanged.
 */
export function toPublicDisplayImageUrl(
  src: string | null | undefined,
): string | null {
  const url = src?.trim();
  if (!url) return null;
  if (
    url.startsWith("data:") ||
    url.startsWith("blob:") ||
    url.startsWith("/")
  ) {
    return url;
  }
  if (!isProbablyRemoteHttpUrl(url)) return url;
  try {
    const host = new URL(url).hostname.toLowerCase();
    const isSpaces =
      host === "digitaloceanspaces.com" ||
      host.endsWith(".digitaloceanspaces.com");
    let isPublicHost = false;
    try {
      const publicHost = process.env.NEXT_PUBLIC_S3_PUBLIC_URL
        ? new URL(process.env.NEXT_PUBLIC_S3_PUBLIC_URL).hostname.toLowerCase()
        : process.env.S3_PUBLIC_URL
          ? new URL(process.env.S3_PUBLIC_URL).hostname.toLowerCase()
          : "";
      isPublicHost = Boolean(publicHost && host === publicHost);
    } catch {
      /* ignore */
    }
    if (isSpaces || isPublicHost) {
      return sameOriginMediaProxyUrl(url);
    }
  } catch {
    /* ignore */
  }
  return url;
}

async function fetchImageAsDataUrl(src: string): Promise<string | null> {
  const attempts: string[] = [];
  if (isProbablyRemoteHttpUrl(src)) {
    // Prefer same-origin proxy — Spaces typically has no CORS for the app origin
    attempts.push(sameOriginProxyUrl(src));
  }
  attempts.push(src);

  for (const url of attempts) {
    try {
      const res = await fetch(url, {
        credentials: url.startsWith("/") ? "same-origin" : "omit",
      });
      if (!res.ok) continue;
      const blob = await res.blob();
      if (!blob.type.startsWith("image/") && blob.type !== "application/octet-stream") {
        continue;
      }
      return await blobToDataUrl(blob);
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Replace remote <img> with data URLs (via same-origin proxy) so html-to-image
 * never hits Spaces CORS. Falls back to a placeholder tile. Returns restore fn.
 */
async function prepareImagesForCapture(
  root: HTMLElement,
): Promise<() => void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  const restores: Array<() => void> = [];

  await Promise.all(
    imgs.map(async (img) => {
      const src = img.currentSrc || img.getAttribute("src") || "";
      if (!src || src.startsWith("data:") || src.startsWith("blob:")) return;

      const prevSrc = img.getAttribute("src");
      const dataUrl = await fetchImageAsDataUrl(src);
      img.setAttribute("src", dataUrl || CAPTURE_IMAGE_PLACEHOLDER);
      restores.push(() => {
        if (prevSrc != null) img.setAttribute("src", prevSrc);
        else img.removeAttribute("src");
      });
    }),
  );

  return () => {
    for (const restore of restores) restore();
  };
}

function applyCaptureFontVars(node: HTMLElement): () => void {
  const html = document.documentElement;
  const body = document.body;
  const prev: Array<[string, string]> = [];

  const copyVar = (name: string) => {
    const value = getComputedStyle(html).getPropertyValue(name).trim();
    if (!value) return;
    prev.push([name, node.style.getPropertyValue(name)]);
    node.style.setProperty(name, value);
  };
  copyVar("--font-prompt");
  copyVar("--font-sans");

  const prevFamily = node.style.fontFamily;
  const family = getComputedStyle(body).fontFamily;
  if (family) node.style.fontFamily = family;

  return () => {
    node.style.fontFamily = prevFamily;
    for (const [name, value] of prev) {
      if (value) node.style.setProperty(name, value);
      else node.style.removeProperty(name);
    }
  };
}

/** Capture a DOM node to PNG data URL (html-to-image). */
export async function captureElementToPng(
  node: HTMLElement,
): Promise<string> {
  const { toPng, getFontEmbedCSS } = await import("html-to-image");
  const restoreImages = await prepareImagesForCapture(node);
  const restoreFonts = applyCaptureFontVars(node);
  try {
    // Wait for inlined data-URL images to decode before rasterizing
    await Promise.all(
      Array.from(node.querySelectorAll("img")).map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise<void>((resolve) => {
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        });
      }),
    );

    let fontEmbedCSS = "";
    try {
      fontEmbedCSS = await getFontEmbedCSS(node, {
        cacheBust: false,
        preferredFontFormat: "woff2",
      });
    } catch {
      fontEmbedCSS = "";
    }

    const fontFamily = getComputedStyle(document.body).fontFamily;
    return await toPng(node, {
      cacheBust: false,
      pixelRatio: 2,
      backgroundColor: "#ffffff",
      skipFonts: false,
      ...(fontEmbedCSS ? { fontEmbedCSS } : {}),
      style: fontFamily ? { fontFamily } : undefined,
    });
  } finally {
    restoreFonts();
    restoreImages();
  }
}

/** Save a captured/element PNG data URL to the device. */
export async function downloadPngDataUrl(
  dataUrl: string,
  filename: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    downloadDataUrl(dataUrl, filename);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "บันทึกรูปไม่สำเร็จ",
    };
  }
}

/** Share PNG data URL via Web Share; fall back to download. */
export async function sharePngDataUrl(
  dataUrl: string,
  filename: string,
  title: string,
): Promise<{ ok: boolean; mode: "share" | "download" | "none"; error?: string }> {
  try {
    const file = await dataUrlToFile(dataUrl, filename);
    const canShareFiles =
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] });

    if (canShareFiles) {
      try {
        await navigator.share({
          files: [file],
          title,
          text: title,
        });
        return { ok: true, mode: "share" };
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
          return { ok: false, mode: "none", error: "cancelled" };
        }
        // NotAllowed / unsupported — fall through to download
      }
    }

    // Desktop browsers often lack file sharing; save image instead
    downloadDataUrl(dataUrl, filename);
    return { ok: true, mode: "download" };
  } catch (e) {
    try {
      downloadDataUrl(dataUrl, filename);
      return { ok: true, mode: "download" };
    } catch {
      return {
        ok: false,
        mode: "none",
        error: e instanceof Error ? e.message : "แชร์รูปไม่สำเร็จ",
      };
    }
  }
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

async function imageUrlToFile(
  url: string,
  filename: string,
): Promise<File | null> {
  try {
    const dataUrl = await fetchImageAsDataUrl(url);
    if (!dataUrl) return null;
    const blob = dataUrlToBlob(dataUrl);
    const type = blob.type || "image/jpeg";
    const name = filename.includes(".") ? filename : `${filename}.jpg`;
    return new File([blob], name, { type });
  } catch {
    return null;
  }
}

/** Download / save image to device. */
export async function downloadImageFromUrl(
  url: string,
  filename: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const file = await imageUrlToFile(url, filename);
    if (file) {
      const objectUrl = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = file.name;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
      return { ok: true };
    }
    // Fallback: open in new tab (cross-origin without CORS)
    window.open(url, "_blank", "noopener,noreferrer");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "บันทึกรูปไม่สำเร็จ",
    };
  }
}

/** Share image via Web Share API when supported; else download. */
export async function shareImageFromUrl(
  url: string,
  filename: string,
  title: string,
): Promise<{ ok: boolean; mode: "share" | "download" | "none"; error?: string }> {
  const file = await imageUrlToFile(url, filename);
  if (
    file &&
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        files: [file],
        title,
        text: title,
      });
      return { ok: true, mode: "share" };
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        return { ok: false, mode: "none", error: "cancelled" };
      }
      // fall through to download
    }
  }
  const dl = await downloadImageFromUrl(url, filename);
  return {
    ok: dl.ok,
    mode: dl.ok ? "download" : "none",
    error: dl.error,
  };
}

/** Share public URL text (and optional title) via Web Share or copy. */
export async function sharePublicLink(input: {
  url: string;
  title: string;
  text?: string;
}): Promise<{ ok: boolean; mode: "share" | "copy" | "none"; error?: string }> {
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function"
  ) {
    try {
      await navigator.share({
        title: input.title,
        text: input.text ?? input.title,
        url: input.url,
      });
      return { ok: true, mode: "share" };
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        return { ok: false, mode: "none", error: "cancelled" };
      }
    }
  }
  const copied = await copyTextToClipboard(input.url);
  return {
    ok: copied,
    mode: copied ? "copy" : "none",
    error: copied ? undefined : "คัดลอกลิงก์ไม่สำเร็จ",
  };
}

export function absoluteUrlFromPath(path: string): string {
  if (typeof window === "undefined") return path;
  return new URL(path, window.location.origin).toString();
}
