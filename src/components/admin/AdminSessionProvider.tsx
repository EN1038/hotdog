"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type AdminSessionInfo = {
  type: "admin";
  adminId?: string;
  username?: string;
  isPlatformAdmin: boolean;
  brandIds: string[];
};

type AdminSessionContextValue = {
  session: AdminSessionInfo | null;
  loaded: boolean;
  refresh: () => Promise<void>;
};

const AdminSessionContext = createContext<AdminSessionContextValue>({
  session: null,
  loaded: false,
  refresh: async () => {},
});

export function useAdminSession() {
  return useContext(AdminSessionContext);
}

export function AdminSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, setSession] = useState<AdminSessionInfo | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session");
      if (!res.ok) {
        setSession(null);
        return;
      }
      const data = await res.json();
      const s = data.session;
      if (!s || s.type !== "admin") {
        setSession(null);
        return;
      }
      setSession({
        type: "admin",
        adminId: s.adminId,
        username: s.username,
        isPlatformAdmin: Boolean(s.isPlatformAdmin),
        brandIds: Array.isArray(s.brandIds) ? s.brandIds : [],
      });
    } catch {
      setSession(null);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ session, loaded, refresh }),
    [session, loaded, refresh],
  );

  return (
    <AdminSessionContext.Provider value={value}>
      {children}
    </AdminSessionContext.Provider>
  );
}
