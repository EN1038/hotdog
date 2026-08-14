/** Keep in sync with staff cookie maxAge in auth.ts (7 days). */
export const STAFF_SESSION_MS = 60 * 60 * 24 * 7 * 1000;

export const STAFF_MAX_DEVICES = 3;
export const STAFF_LOGIN_UNREGISTERED = "unregistered";
export const STAFF_LOGIN_DEVICE_LIMIT = "deviceLimit";

export const staffDeviceIdPattern = /^[a-zA-Z0-9_-]{8,80}$/;
