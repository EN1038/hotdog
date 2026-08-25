/** App-like persistence — keep staff/owner signed in across browser restarts. */
export const SESSION_DAYS = 90;
export const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
export const SESSION_MAX_AGE_SEC = SESSION_DAYS * 24 * 60 * 60;
export const SESSION_JWT_EXP = `${SESSION_DAYS}d` as const;

/** Keep in sync with staff cookie / JWT (SESSION_DAYS). */
export const STAFF_SESSION_MS = SESSION_MS;

export const STAFF_MAX_DEVICES = 3;
export const STAFF_LOGIN_UNREGISTERED = "unregistered";
export const STAFF_LOGIN_DEVICE_LIMIT = "deviceLimit";

export const staffDeviceIdPattern = /^[a-zA-Z0-9_-]{8,80}$/;
