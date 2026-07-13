import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { StaffRole } from "./constants";

const COOKIE_NAME = "hunterdog_session";
const secret = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "dev-secret",
);

export type SessionPayload = {
  type: "admin" | "staff" | "customer";
  adminId?: string;
  username?: string;
  staffPhone?: string;
  branchId?: string;
  staffRoles?: StaffRole[];
  branchName?: string;
  customerPhone?: string;
  customerId?: string;
  customerName?: string;
};

export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function requireAdmin() {
  const session = await getSession();
  if (!session || session.type !== "admin") {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

export async function requireStaff() {
  const session = await getSession();
  if (!session || session.type !== "staff" || !session.branchId || !session.staffRoles) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

export async function requireCustomer() {
  const session = await getSession();
  if (!session || session.type !== "customer" || !session.customerId) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}
