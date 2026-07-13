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

type CustomerSession = { phone: string; name: string } | null;

type CustomerContextValue = {
  session: CustomerSession;
  sessionChecked: boolean;
  refreshSession: () => Promise<void>;
  login: (phone: string, name?: string) => Promise<string | null>;
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

const CART_KEY = "hunterdog_cart_v3";
const FULFILLMENT_KEY = "hunterdog_fulfillment_v1";

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
        setSession({
          phone: data.session.customerPhone ?? "",
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
      setSession({
        phone: data.phone ?? phone,
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
