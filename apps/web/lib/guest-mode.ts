const GUEST_KEY = "synapse_guest";
const FAKE_NGO_ID = "guest-ngo-demo-0001";
const FAKE_USER_ID = "guest-user-demo-0001";

function b64url(s: string): string {
  return btoa(s).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function makeFakeJWT(role: "ngo_admin" | "volunteer"): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      sub: FAKE_USER_ID,
      role,
      ngo_id: FAKE_NGO_ID,
      email: "guest@synapse.demo",
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8,
      is_guest: true,
    })
  );
  return `${header}.${payload}.demo_signature`;
}

export function enterGuestMode(role: "ngo_admin" | "volunteer"): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(GUEST_KEY, role);
  const token = makeFakeJWT(role);
  localStorage.setItem("ngo_token", token);
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `ngo_token=${token}; path=/; max-age=${60 * 60 * 8}; SameSite=Strict${secure}`;
}

export function isGuestMode(): boolean {
  if (typeof window === "undefined") return false;
  return !!sessionStorage.getItem(GUEST_KEY);
}

export function getGuestRole(): "ngo_admin" | "volunteer" | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(GUEST_KEY) as "ngo_admin" | "volunteer" | null;
}

export function exitGuestMode(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(GUEST_KEY);
  localStorage.removeItem("ngo_token");
  document.cookie = "ngo_token=; path=/; max-age=0";
}
