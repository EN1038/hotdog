"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { CartLine } from "@/lib/customer-types";
import type { FulfillmentType } from "@prisma/client";
import { rememberCustomerPhone } from "@/lib/customer-remember";

type CustomerSession = { phone: string; name: string } | null;

export type SendOtpResult =
  | { ok: true; challengeId: string; otpRefNo: string | null; resendIn: number }
  | { ok: false; error: string; needsName?: boolean };

type CustomerContextValue = {
  session: CustomerSession;
  sessionChecked: boolean;
  refreshSession: () => Promise<void>;
  /** Legacy login without OTP (used when Taximail is not configured). */
  login: (phone: string, name?: string) => Promise<string | null>;
  sendOtp: (phone: string, name?: string) => Promise<SendOtpResult>;
  verifyOtp: (
    phone: string,
    otpCode: string,
    challengeId: string,
    name?: string,
  ) => Promise<string | null>;
  logout: () => Promise<void>;
  cart: CartLine[];
  cartBranchId: string | null;
  fulfillment: FulfillmentType;
  setFulfillment: (type: FulfillmentType) => void;
  addLine: (branchId: string, line: Omit<CartLine, "key">) => void;
  updateQuantity: (key: string, delta: number) => void;
  replaceLine: (oldKey: string, line: Omit<CartLine, "key">) => void;
  removeLine: (key: string) => void;
  clearCart: () => void;
};

const CustomerContext = createContext<CustomerContextValue | null>(null);

const CART_KEY = "skillsale_cart_v1";
const FULFILLMENT_KEY = "skillsale_fulfillment_v1";

function normalizeNote(note?: string) {
  return (note ?? "").trim().replace(/\s+/g, " ");
}

function createCartKey(line: Omit<CartLine, "key">) {
  const optionPart = [...(line.optionIds ?? [])].sort().join(".");
  const notePart = normalizeNote(line.note);
  return `${line.branchMenuItemId}:${optionPart}:${notePart}`;
}

export function CustomerProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<CustomerSession>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartBranchId, setCartBranchId] = useState<string | null>(null);
  const [fulfillment, setFulfillmentState] = useState<FulfillmentType>("PICKUP");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(FULFILLMENT_KEY);
      if (saved === "PICKUP" || saved === "DELIVERY") {
        setFulfillmentState(saved);
      }
    } catch {
      // ignore
    }
  }, []);

  const setFulfillment = useCallback((type: FulfillmentType) => {
    setFulfillmentState(type);
    localStorage.setItem(FULFILLMENT_KEY, type);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CART_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          branchId: string | null;
          lines: CartLine[];
        };
        const lines = (parsed.lines ?? []).map((l) => ({
          ...l,
          optionIds: l.optionIds ?? [],
          optionNames: l.optionNames ?? [],
          optionsPrice: Number((l as any).optionsPrice ?? 0),
          note: normalizeNote(l.note),
        }));
        setCart(lines);
        setCartBranchId(parsed.branchId ?? null);
      }
    } catch {
      // corrupted cart -> start fresh
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      CART_KEY,
      JSON.stringify({
        branchId: cartBranchId,
        lines: cart,
      }),
    );
  }, [cart, cartBranchId]);

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session");
      const data = await res.json();
      if (data.session?.type === "customer") {
        const phone = data.session.customerPhone ?? "";
        if (phone) rememberCustomerPhone(phone);
        setSession({
          phone,
          name: data.session.customerName ?? "",
        });
      } else {
        setSession(null);
      }
    } catch {
      setSession(null);
    } finally {
      setSessionChecked(true);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const login = useCallback(
    async (phone: string, name?: string): Promise<string | null> => {
      const res = await fetch("/api/auth/login?type=customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, name: name?.trim() || undefined }),
      });
      const data = await res.json();
      if (data.needsName) return "NEEDS_NAME";
      if (!res.ok) return data.error ?? "เข้าสู่ระบบไม่สำเร็จ";
      const nextPhone = data.phone ?? phone;
      rememberCustomerPhone(nextPhone);
      setSession({
        phone: nextPhone,
        name: data.name ?? name ?? "",
      });
      return null;
    },
    [],
  );

  const sendOtp = useCallback(
    async (phone: string, name?: string): Promise<SendOtpResult> => {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, name: name?.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.needsName) {
        return { ok: false, error: "NEEDS_NAME", needsName: true };
      }
      if (!res.ok) {
        return {
          ok: false,
          error:
            typeof data.error === "string"
              ? data.error
              : "ส่งรหัส OTP ไม่สำเร็จ",
        };
      }
      return {
        ok: true,
        challengeId: data.challengeId as string,
        otpRefNo: (data.otpRefNo as string | null) ?? null,
        resendIn: Number(data.resendIn) || 60,
      };
    },
    [],
  );

  const verifyOtp = useCallback(
    async (
      phone: string,
      otpCode: string,
      challengeId: string,
      name?: string,
    ): Promise<string | null> => {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          otpCode,
          challengeId,
          name: name?.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.needsName) return "NEEDS_NAME";
      if (!res.ok) return data.error ?? "ยืนยัน OTP ไม่สำเร็จ";
      const nextPhone = data.phone ?? phone;
      rememberCustomerPhone(nextPhone);
      setSession({
        phone: nextPhone,
        name: data.name ?? name ?? "",
      });
      return null;
    },
    [],
  );

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setSession(null);
  }, []);

  const addLine = useCallback(
    (branchId: string, line: Omit<CartLine, "key">) => {
      setCart((prev) => {
        const switchingBranch = cartBranchId !== null && cartBranchId !== branchId;
        const base = cartBranchId === branchId ? prev : [];
        const key = createCartKey(line);
        const existing = base.find((l) => l.key === key);
        if (existing) {
          return base.map((l) =>
            l.key === key ? { ...l, quantity: l.quantity + line.quantity } : l,
          );
        }
        return [
          ...base,
          {
            ...line,
            key,
            optionIds: line.optionIds ?? [],
            optionNames: line.optionNames ?? [],
            optionsPrice: line.optionsPrice ?? 0,
            note: normalizeNote(line.note),
          },
        ];
      });
      setCartBranchId(branchId);
    },
    [cartBranchId],
  );

  const updateQuantity = useCallback((key: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) => (l.key === key ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0),
    );
  }, []);

  const replaceLine = useCallback(
    (oldKey: string, line: Omit<CartLine, "key">) => {
      setCart((prev) => {
        const nextKey = createCartKey(line);
        const withoutOld = prev.filter((l) => l.key !== oldKey);
        const existing = withoutOld.find((l) => l.key === nextKey);
        if (existing) {
          return withoutOld.map((l) =>
            l.key === nextKey ? { ...l, quantity: l.quantity + line.quantity } : l,
          );
        }
        return [
          ...withoutOld,
          {
            ...line,
            key: nextKey,
            optionIds: line.optionIds ?? [],
            optionNames: line.optionNames ?? [],
            optionsPrice: line.optionsPrice ?? 0,
            note: normalizeNote(line.note),
          },
        ];
      });
    },
    [],
  );

  const removeLine = useCallback((key: string) => {
    setCart((prev) => prev.filter((l) => l.key !== key));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setCartBranchId(null);
  }, []);

  const value = useMemo(
    () => ({
      session,
      sessionChecked,
      refreshSession,
      login,
      sendOtp,
      verifyOtp,
      logout,
      cart,
      cartBranchId,
      fulfillment,
      setFulfillment,
      addLine,
      updateQuantity,
      replaceLine,
      removeLine,
      clearCart,
    }),
    [
      session,
      sessionChecked,
      refreshSession,
      login,
      sendOtp,
      verifyOtp,
      logout,
      cart,
      cartBranchId,
      fulfillment,
      setFulfillment,
      addLine,
      updateQuantity,
      replaceLine,
      removeLine,
      clearCart,
    ],
  );

  return (
    <CustomerContext.Provider value={value}>
      {children}
    </CustomerContext.Provider>
  );
}

export function useCustomer() {
  const ctx = useContext(CustomerContext);
  if (!ctx) throw new Error("useCustomer must be used within CustomerProvider");
  return ctx;
}
