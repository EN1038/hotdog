const STORAGE_KEY = "skillsale_staff_device_id";

function readStoredId(storage: Storage): string | null {
  const value = storage.getItem(STORAGE_KEY)?.trim() ?? "";
  if (/^[a-zA-Z0-9_-]{8,80}$/.test(value)) return value;
  return null;
}

/** Stable per-browser id so re-login on the same phone does not consume a new slot. */
export function getStaffDeviceId(): string {
  try {
    const existing = readStoredId(window.localStorage);
    if (existing) return existing;
    const id = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    try {
      const existing = readStoredId(window.sessionStorage);
      if (existing) return existing;
      const id = crypto.randomUUID();
      window.sessionStorage.setItem(STORAGE_KEY, id);
      return id;
    } catch {
      return crypto.randomUUID();
    }
  }
}
