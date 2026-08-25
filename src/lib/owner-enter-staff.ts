"use client";

import { getStaffDeviceId } from "@/lib/staff-device";

export type OwnerEnterStaffBranch = {
  branchId: string;
  branchName: string;
  isOpen?: boolean;
};

export type OwnerEnterStaffResult =
  | { ok: true; branchId: string; branchName: string }
  | { ok: true; needsBranchSelect: true; branches: OwnerEnterStaffBranch[] }
  | { ok: false; error: string };

/** One-tap owner → staff sell mode (stashes owner session). */
export async function enterOwnerStaffMode(
  branchId?: string,
): Promise<OwnerEnterStaffResult> {
  const res = await fetch("/api/owner/enter-staff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceId: getStaffDeviceId(),
      branchId,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    ok?: boolean;
    needsBranchSelect?: boolean;
    branches?: OwnerEnterStaffBranch[];
    branchId?: string;
    branchName?: string;
  };

  if (res.ok && data.needsBranchSelect && data.branches) {
    return {
      ok: true,
      needsBranchSelect: true,
      branches: data.branches,
    };
  }

  if (!res.ok) {
    return { ok: false, error: data.error ?? "เข้าโหมดขายไม่สำเร็จ" };
  }

  return {
    ok: true,
    branchId: data.branchId ?? "",
    branchName: data.branchName ?? "",
  };
}

/** Enter staff then go to sell home or key-order. */
export async function enterOwnerStaffAndGo(
  opts?: {
    branchId?: string;
    /** default /staff — use key-order for one-tap sell */
    href?: string;
  },
): Promise<OwnerEnterStaffResult> {
  const result = await enterOwnerStaffMode(opts?.branchId);
  if (
    result.ok &&
    !("needsBranchSelect" in result && result.needsBranchSelect)
  ) {
    window.location.assign(opts?.href ?? "/staff");
  }
  return result;
}

export async function returnToOwnerFromStaff(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const res = await fetch("/api/owner/return-from-staff", { method: "POST" });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    return { ok: false, error: data.error ?? "กลับบัญชีร้านไม่สำเร็จ" };
  }
  const { markSkipAutoShopFloor } = await import("@/lib/owner-sole-start");
  markSkipAutoShopFloor();
  return { ok: true };
}

export async function canReturnToOwnerFromStaff(): Promise<boolean> {
  try {
    const res = await fetch("/api/owner/return-from-staff", {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { canReturnToOwner?: boolean };
    return Boolean(data.canReturnToOwner);
  } catch {
    return false;
  }
}
