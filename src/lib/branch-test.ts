/** Helpers for brand test branches (ไม่ปนกับสาขาจริง). */

export function nameLooksLikeTestBranch(name: string | null | undefined): boolean {
  const n = (name ?? "").trim();
  if (!n) return false;
  return /ทดสอบ|test\b|sandbox|demo\b/i.test(n);
}

export function isTestBranch(branch: {
  isTest?: boolean | null;
  name?: string | null;
}): boolean {
  if (branch.isTest) return true;
  return nameLooksLikeTestBranch(branch.name);
}
