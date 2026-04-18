import * as admin from 'firebase-admin';
import { validateProductionEnv } from './env';

// NEXT_PHASE is 'phase-production-build' during `next build`. Secrets are not
// injected at build time on Vercel (only at runtime), so skip all validation
// and SDK init during build to prevent false-positive crashes.
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';
const shouldEnforce = !isBuildPhase && (process.env.VERCEL === '1' || process.env.ENFORCE_ENV_VALIDATION === '1');

function parseServiceAccount(raw: string | undefined) {
  if (!raw) return null;

  const normalized = raw.trim().replace(/^['\"]|['\"]$/g, '');
  const candidates = [
    raw,
    normalized,
    normalized.replace(/\\\"/g, '"').replace(/\\n/g, '\n'),
  ];

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // continue
    }
  }

  // Some deployment systems provide JSON as base64 to avoid quoting issues.
  try {
      const decoded = Buffer.from(raw, 'base64').toString('utf8');
      return JSON.parse(decoded);
  } catch {
    return null;
  }
}

if (process.env.NODE_ENV === 'production' && shouldEnforce) {
  validateProductionEnv();
}

if (!admin.apps.length) {
  try {
    const serviceAccount = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
      });
    } else {
      if (process.env.NODE_ENV === 'production' && shouldEnforce) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON could not be parsed as JSON or base64 JSON');
      }

      admin.initializeApp({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
      });
    }
  } catch (error) {
    if (process.env.NODE_ENV === 'production' && shouldEnforce) {
      throw error;
    }
    console.error('Firebase admin initialization error', error);
  }
}

// Guard against calling these when no app was successfully initialised
const app = admin.apps[0] ?? null;

export const adminDb = app ? admin.firestore() : null as unknown as admin.firestore.Firestore;
export const adminStorage = app ? admin.storage() : null as unknown as admin.storage.Storage;
export const FieldValue = admin.firestore.FieldValue;
