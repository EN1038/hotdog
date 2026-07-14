"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { OrderStatus } from "@prisma/client";
import { OrderCard, StatusLegend, type OrderCardData } from "@/components/OrderCard";
import { logout } from "@/components/LoginForm";
import type { StaffRole } from "@/lib/constants";
import {
  playOrderAlertSound,
  STAFF_SOUND_PREF_KEY,
  unlockOrderAlertSound,
  vibrateForNewOrder,
} from "@/lib/staff-order-alert";

const DEFAULT_DOC_TITLE = "Staff | HunterDog";

export default function StaffPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderCardData[]>([]);
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [branchName, setBranchName] = useState("");
  const [loading, setLoading] = useState(true);
  const [soundOn, setSoundOn] = useState(false);
  const [soundError, setSoundError] = useState("");
  const [newOrderFlash, setNewOrderFlash] = useState(false);
  const [preferSound, setPreferSound] = useState(false);
  const knownIdsRef = useRef<Set<string> | null>(null);
  const soundOnRef = useRef(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);

  useEffect(() => {
    try {
      setPreferSound(localStorage.getItem(STAFF_SOUND_PREF_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const clearTitleAlert = useCallback(() => {
    if (titleTimerRef.current) {
      clearInterval(titleTimerRef.current);
      titleTimerRef.current = null;
    }
    document.title = branchName
      ? `${branchName} · Staff`
      : DEFAULT_DOC_TITLE;
  }, [branchName]);

  const flashNewOrders = useCallback(
    (count: number) => {
      setNewOrderFlash(true);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setNewOrderFlash(false), 8000);

      clearTitleAlert();
      let tick = false;
      document.title = `(${count}) ออเดอร์ใหม่!`;
      titleTimerRef.current = setInterval(() => {
        tick = !tick;
        document.title = tick
          ? `(${count}) ออเดอร์ใหม่!`
          : branchName
            ? `${branchName} · Staff`
            : DEFAULT_DOC_TITLE;
      }, 1200);
    },
    [branchName, clearTitleAlert],
  );

  const fetchOrders = useCallback(async () => {
    const res = await fetch("/api/staff/orders");
    if (res.status === 401) {
      router.push("/staff/login");
      return;
    }
    const data = await res.json();
    const nextOrders: OrderCardData[] = data.orders ?? [];
    const nextIds = new Set(nextOrders.map((o) => o.id));

    if (knownIdsRef.current === null) {
      knownIdsRef.current = nextIds;
    } else {
      const added = nextOrders.filter((o) => !knownIdsRef.current!.has(o.id));
      if (added.length > 0) {
        flashNewOrders(added.length);
        vibrateForNewOrder();
        if (soundOnRef.current) {
          playOrderAlertSound();
        }
      }
      knownIdsRef.current = nextIds;
    }

    setOrders(nextOrders);
    setRoles(data.roles ?? []);
    setBranchName(data.branchName ?? "");
    setLoading(false);
  }, [router, flashNewOrders]);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 5000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      if (titleTimerRef.current) clearInterval(titleTimerRef.current);
      document.title = DEFAULT_DOC_TITLE;
    };
  }, []);

  async function enableSound() {
    setSoundError("");
    try {
      const ok = await unlockOrderAlertSound();
      if (!ok) {
        setSoundError("เบราว์เซอร์นี้ไม่รองรับเสียงแจ้งเตือน");
        return;
      }
      playOrderAlertSound();
      setSoundOn(true);
      setPreferSound(true);
      try {
        localStorage.setItem(STAFF_SOUND_PREF_KEY, "1");
      } catch {
        /* ignore */
      }
    } catch {
      setSoundError("เปิดเสียงไม่สำเร็จ กรุณาแตะอีกครั้ง");
    }
  }

  function disableSound() {
    setSoundOn(false);
    setPreferSound(false);
    setSoundError("");
    try {
      localStorage.setItem(STAFF_SOUND_PREF_KEY, "0");
    } catch {
      /* ignore */
    }
  }

  async function handleStatusChange(orderId: string, status: OrderStatus) {
    const res = await fetch(`/api/staff/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      clearTitleAlert();
      fetchOrders();
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">กำลังโหลด...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 p-4">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{branchName}</h1>
          <p className="text-sm text-gray-600">
            พนักงาน: {roles.join(", ")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => logout()}
          className="shrink-0 cursor-pointer text-sm text-gray-500 hover:underline"
        >
          ออกจากระบบ
        </button>
      </header>

      {!soundOn && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 sm:p-4">
          <p className="text-sm font-medium text-amber-950">
            {preferSound
              ? "แตะเพื่อเปิดเสียงแจ้งเตือนอีกครั้ง (เบราว์เซอร์ต้องให้สิทธิ์หลังแตะ)"
              : "เปิดเสียงแจ้งเตือนเมื่อมีออเดอร์ใหม่"}
          </p>
          <p className="mt-1 text-xs text-amber-800">
            บนเว็บต้องกดเปิดเองครั้งหนึ่งต่อรอบที่เปิดหน้านี้ ตามนโยบายเบราว์เซอร์
          </p>
          <button
            type="button"
            onClick={enableSound}
            className="mt-3 w-full cursor-pointer rounded-xl bg-amber-600 px-4 py-3 text-base font-semibold text-white hover:bg-amber-700 sm:w-auto"
          >
            เปิดเสียงแจ้งเตือน
          </button>
          {soundError ? (
            <p className="mt-2 text-xs text-red-600">{soundError}</p>
          ) : null}
        </div>
      )}

      {soundOn && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
          <p className="text-sm font-medium text-emerald-900">
            เสียงแจ้งเตือนเปิดอยู่
          </p>
          <button
            type="button"
            onClick={disableSound}
            className="cursor-pointer text-sm text-emerald-800 underline"
          >
            ปิดเสียง
          </button>
        </div>
      )}

      {newOrderFlash && (
        <div
          className="mb-4 animate-pulse rounded-xl border-2 border-red-500 bg-red-600 px-4 py-3 text-center text-base font-bold text-white"
          role="status"
        >
          มีออเดอร์ใหม่!
        </div>
      )}

      <div className="mb-4">
        <StatusLegend />
      </div>

      {orders.length === 0 ? (
        <p className="rounded-lg bg-white p-8 text-center text-gray-500">
          ไม่มีออเดอร์ที่รอดำเนินการ
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              roles={roles}
              showActions
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      )}
    </main>
  );
}
