/** Fails the deploy loudly rather than shipping a build that 404s every API call. */

const REQUIRED = [
  "NEXT_PUBLIC_BACKEND_URL",
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
] as const;

function assertHttpsUrl(name: string, value: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`[env] ${name} must be a valid absolute URL`);
  }
  if (parsed.protocol !== "https:" && !parsed.hostname.includes("localhost")) {
    throw new Error(`[env] ${name} must use https unless targeting localhost`);
  }
}

export function validateProductionEnv(): void {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.VERCEL !== "1" && process.env.ENFORCE_ENV_VALIDATION !== "1") return;

  const missing = REQUIRED.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(`[env] Missing required production env vars: ${missing.join(", ")}`);
  }

  assertHttpsUrl("NEXT_PUBLIC_BACKEND_URL", String(process.env.NEXT_PUBLIC_BACKEND_URL));
}
