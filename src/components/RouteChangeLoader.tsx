"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { LoadingState } from "@/components/LoadingState";

/**
 * แถบโหลดด้านบน + overlay เมื่อเปลี่ยนหน้า (ลิงก์ / ปุ่มย้อนกลับ)
 * ใช้ได้ทั้งแอป — ใส่ครั้งเดียวใน AppProviders
 */
function RouteChangeLoaderInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;

  const [barVisible, setBarVisible] = useState(false);
  const [barDone, setBarDone] = useState(false);
  const [overlay, setOverlay] = useState(false);

  const pendingRef = useRef(false);
  const startedAtRef = useRef(0);
  const overlayTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const lastRouteRef = useRef(routeKey);

  const clearTimers = useCallback(() => {
    if (overlayTimerRef.current != null) {
      window.clearTimeout(overlayTimerRef.current);
      overlayTimerRef.current = null;
    }
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const finish = useCallback(() => {
    if (!pendingRef.current) return;
    pendingRef.current = false;
    clearTimers();
    setBarDone(true);
    setOverlay(false);
    hideTimerRef.current = window.setTimeout(() => {
      setBarVisible(false);
      setBarDone(false);
    }, 320);
  }, [clearTimers]);

  const start = useCallback(() => {
    clearTimers();
    pendingRef.current = true;
    startedAtRef.current = Date.now();
    setBarDone(false);
    setBarVisible(true);
    setOverlay(false);
    // ถ้าโหลดนานค่อยโชว์ overlay — ไม่กระพริบตอนเปลี่ยนหน้ารวดเร็ว
    overlayTimerRef.current = window.setTimeout(() => {
      if (pendingRef.current) setOverlay(true);
    }, 280);
    // กันค้างถ้า navigation ไม่ยิง route change (เช่น ถูกยกเลิก)
    hideTimerRef.current = window.setTimeout(() => {
      if (pendingRef.current) finish();
    }, 12_000);
  }, [clearTimers, finish]);

  useEffect(() => {
    if (lastRouteRef.current === routeKey) return;
    lastRouteRef.current = routeKey;
    if (pendingRef.current) {
      finish();
      return;
    }
    // programmatic / soft nav ที่ไม่ได้เริ่มจากคลิกลิงก์
    setBarVisible(true);
    setBarDone(false);
    window.requestAnimationFrame(() => {
      setBarDone(true);
      window.setTimeout(() => {
        setBarVisible(false);
        setBarDone(false);
      }, 320);
    });
  }, [routeKey, finish]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!anchor) return;
      if (anchor.hasAttribute("download")) return;
      const rawTarget = anchor.getAttribute("target");
      if (rawTarget && rawTarget !== "_self") return;

      const href = anchor.getAttribute("href");
      if (!href) return;
      if (
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("javascript:")
      ) {
        return;
      }

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;

      const nextKey = `${url.pathname}?${url.searchParams.toString()}`;
      const currentKey = `${window.location.pathname}?${window.location.search.replace(/^\?/, "")}`;
      if (nextKey === currentKey) return;

      start();
    };

    const onPopState = () => start();

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
      clearTimers();
    };
  }, [start, clearTimers]);

  if (!barVisible && !overlay) return null;

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[200]"
        aria-hidden={!barVisible}
      >
        <div
          className={`h-[3px] origin-left bg-site-primary shadow-[0_0_12px_rgba(22,163,74,0.45)] transition-transform ease-out ${
            barDone ? "duration-300" : "duration-[12s]"
          }`}
          style={{
            transform: barVisible
              ? barDone
                ? "scaleX(1)"
                : "scaleX(0.72)"
              : "scaleX(0)",
            opacity: barVisible ? 1 : 0,
          }}
        />
      </div>

      {overlay ? (
        <div
          className="fixed inset-0 z-[190] flex items-center justify-center bg-[#eef3f8]/75 px-4 backdrop-blur-[2px]"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <LoadingState
            label="กำลังเปิดหน้า…"
            className="w-full max-w-sm shadow-lg"
            recoveryAfterMs={0}
          />
        </div>
      ) : null}
    </>
  );
}

export function RouteChangeLoader() {
  return (
    <Suspense fallback={null}>
      <RouteChangeLoaderInner />
    </Suspense>
  );
}
