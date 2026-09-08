/**
 * Access and refresh token storage.
 *
 * Access tokens are short lived (60 minutes). Without a refresh flow the user
 * would be signed out mid-session, so `withFreshToken` transparently exchanges
 * the refresh token when the access token is close to expiry or has been
 * rejected.
 */

const ACCESS_KEY = "ngo_token";
const REFRESH_KEY = "ngo_refresh_token";

// The middleware reads the access token from a cookie to guard routes.
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

// Refresh this long before expiry so an in-flight request never races the clock.
const RENEW_BEFORE_MS = 2 * 60 * 1000;

function writeCookie(name: string, value: string, maxAge: number): void {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${value}; path=/; max-age=${maxAge}; SameSite=Lax${secure}`;
}

export function setTokens(access: string, refresh?: string | null): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCESS_KEY, access);
  writeCookie(ACCESS_KEY, access, COOKIE_MAX_AGE);
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
}

/** Kept for call sites that only ever had an access token (guest mode). */
export function setToken(token: string): void {
  setTokens(token);
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  writeCookie(ACCESS_KEY, "", 0);
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_KEY);
}

/** Milliseconds until the token expires. Negative once expired. */
function timeUntilExpiry(token: string | null): number {
  if (!token) return -1;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (typeof payload.exp !== "number") return -1;
    return payload.exp * 1000 - Date.now();
  } catch {
    return -1;
  }
}


// One refresh at a time. Ten parallel requests hitting a stale token must not
// fire ten refreshes and rotate the token out from under each other.
let inFlight: Promise<string | null> | null = null;

async function requestRefresh(): Promise<string | null> {
  const refresh = getRefreshToken();
  if (!refresh) return null;

  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) {
      clearToken();
      return null;
    }
    const data = await res.json();
    if (!data?.token) {
      clearToken();
      return null;
    }
    setTokens(data.token, data.refresh_token);
    return data.token as string;
  } catch {
    // Network failure: keep the tokens so the next attempt can retry.
    return null;
  }
}

export function refreshTokens(): Promise<string | null> {
  if (!inFlight) {
    inFlight = requestRefresh().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

/**
 * Returns a token that is valid now, refreshing first if it is about to
 * expire. Returns null when the session cannot be recovered.
 */
export async function withFreshToken(current?: string | null): Promise<string | null> {
  const token = current ?? getToken();
  if (token && timeUntilExpiry(token) > RENEW_BEFORE_MS) return token;
  if (!getRefreshToken()) return token;
  return (await refreshTokens()) ?? token;
}
