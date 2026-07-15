/** Persist last customer phone for login prefill (not used as auth). */
export const CUSTOMER_PHONE_KEY = "skillsale_customer_phone_v1";

export function getRememberedCustomerPhone(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(CUSTOMER_PHONE_KEY)?.replace(/\D/g, "") ?? "";
  } catch {
    return "";
  }
}

export function rememberCustomerPhone(phone: string) {
  if (typeof window === "undefined") return;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 9) return;
  try {
    localStorage.setItem(CUSTOMER_PHONE_KEY, digits);
  } catch {
    // ignore quota / private mode
  }
}
