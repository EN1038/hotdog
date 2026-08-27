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

/**
 * Inline <img> as data URLs (or hide if CORS blocks) so html-to-image
 * does not taint the canvas. Returns a restore function.
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
      const prevDisplay = img.style.display;

      try {
        const res = await fetch(src, { mode: "cors", credentials: "omit" });
        if (!res.ok) throw new Error(`image ${res.status}`);
        const dataUrl = await blobToDataUrl(await res.blob());
        img.setAttribute("src", dataUrl);
        restores.push(() => {
          if (prevSrc != null) img.setAttribute("src", prevSrc);
          else img.removeAttribute("src");
        });
      } catch {
        img.style.display = "none";
        restores.push(() => {
          img.style.display = prevDisplay;
        });
      }
    }),
  );

  return () => {
    for (const restore of restores) restore();
  };
}

/** Capture a DOM node to PNG data URL (html-to-image). */
export async function captureElementToPng(
  node: HTMLElement,
): Promise<string> {
  const { toPng } = await import("html-to-image");
  const restore = await prepareImagesForCapture(node);
  try {
    return await toPng(node, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: "#ffffff",
      // Prefer CORS when library fetches resources itself
      fetchRequestInit: { mode: "cors", credentials: "omit" },
    });
  } finally {
    restore();
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
    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const type = blob.type || "image/jpeg";
    const name =
      filename.includes(".") ? filename : `${filename}.jpg`;
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
