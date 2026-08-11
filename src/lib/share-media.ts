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

async function dataUrlToFile(
  dataUrl: string,
  filename: string,
): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const name = filename.includes(".") ? filename : `${filename}.png`;
  return new File([blob], name, { type: blob.type || "image/png" });
}

/** Capture a DOM node to PNG data URL (html-to-image). */
export async function captureElementToPng(
  node: HTMLElement,
): Promise<string> {
  const { toPng } = await import("html-to-image");
  return toPng(node, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: "#ffffff",
  });
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
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function" &&
      (!navigator.canShare || navigator.canShare({ files: [file] }))
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
      }
    }
    downloadDataUrl(dataUrl, filename);
    return { ok: true, mode: "download" };
  } catch (e) {
    return {
      ok: false,
      mode: "none",
      error: e instanceof Error ? e.message : "แชร์รูปไม่สำเร็จ",
    };
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
