"use client";

import { createContext, useContext } from "react";

type AdminBranchShellContextValue = {
  embeddedInOwnerShell: boolean;
};

const AdminBranchShellContext = createContext<AdminBranchShellContextValue>({
  embeddedInOwnerShell: false,
});

export function AdminBranchShellProvider({
  embeddedInOwnerShell,
  children,
}: {
  embeddedInOwnerShell: boolean;
  children: React.ReactNode;
}) {
  return (
    <AdminBranchShellContext.Provider value={{ embeddedInOwnerShell }}>
      {children}
    </AdminBranchShellContext.Provider>
  );
}

export function useAdminBranchShell() {
  return useContext(AdminBranchShellContext);
}
