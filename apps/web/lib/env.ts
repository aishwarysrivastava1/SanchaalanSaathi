const isProd = process.env.NODE_ENV === "production";

const REQUIRED_PUBLIC_VARS = [
  "NEXT_PUBLIC_BACKEND_URL",
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
] as const;

const REQUIRED_SERVER_VARS = [
  "FIREBASE_SERVICE_ACCOUNT_JSON",
  "GEMINI_API_KEY",
] as const;

function validateUrl(name: string, value: string) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && !parsed.hostname.includes("localhost")) {
      throw new Error(`${name} must use https in production unless targeting localhost`);
    }
  } catch {
    throw new Error(`${name} must be a valid absolute URL`);
  }
}

function listMissing(keys: readonly string[]) {
  return keys.filter((key) => !process.env[key] || String(process.env[key]).trim().length === 0);
}

function parseJsonFromEnv(rawValue: string) {
  const trimmed = rawValue.trim();
  const normalized = trimmed.replace(/^['\"]|['\"]$/g, '');
  const candidates = [
    trimmed,
    normalized,
    normalized.replace(/\\\"/g, '"').replace(/\\n/g, '\n'),
  ];

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try next candidate
    }
  }

  return null;
}

export function validateProductionEnv() {
  const shouldEnforce = process.env.VERCEL === '1' || process.env.ENFORCE_ENV_VALIDATION === '1';
  if (!shouldEnforce) return;
  if (!isProd) return;

  const missing = [
    ...listMissing(REQUIRED_PUBLIC_VARS),
    ...listMissing(REQUIRED_SERVER_VARS),
  ];

  if (missing.length > 0) {
    throw new Error(
      `[env] Missing required production env vars: ${missing.join(", ")}`
    );
  }

  validateUrl("NEXT_PUBLIC_BACKEND_URL", String(process.env.NEXT_PUBLIC_BACKEND_URL));

  const serviceAccount = parseJsonFromEnv(String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
  if (!serviceAccount) {
    throw new Error("[env] FIREBASE_SERVICE_ACCOUNT_JSON must be valid JSON");
  }

  const requiredServiceAccountFields = [
    'project_id',
    'client_email',
    'private_key',
  ];

  const missingServiceAccountFields = requiredServiceAccountFields.filter(
    (field) => !serviceAccount[field] || String(serviceAccount[field]).trim().length === 0
  );

  if (missingServiceAccountFields.length > 0) {
    throw new Error(
      `[env] FIREBASE_SERVICE_ACCOUNT_JSON missing required fields: ${missingServiceAccountFields.join(', ')}`
    );
  }
}
