import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  getIdToken,
  type User,
  type Unsubscribe,
} from "firebase/auth";
import { auth } from "./firebase";

function makeProvider(): GoogleAuthProvider {
  const p = new GoogleAuthProvider();
  p.addScope("email");
  p.addScope("profile");
  return p;
}

// Mutex: only one popup at a time across the dual-card layout.
let _popupInFlight = false;
let _lastAttemptAt = 0;

function shouldUseRedirectFlow(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod|Android|Mobile|FBAN|FB_IAB|Instagram|Line\//i.test(ua);
}

export async function signInWithGoogle(): Promise<User> {
  if (!auth) throw new Error("Firebase is not configured. Add NEXT_PUBLIC_FIREBASE_* env vars.");
  if (shouldUseRedirectFlow()) {
    await signInWithRedirect(auth, makeProvider());
    throw Object.assign(new Error("Redirect sign-in started."), { code: "auth/redirect-started" });
  }

  const now = Date.now();
  if (now - _lastAttemptAt < 900) {
    throw Object.assign(new Error("Sign-in already in progress — please wait."), { code: "auth/popup-in-flight" });
  }
  _lastAttemptAt = now;

  if (_popupInFlight) {
    throw Object.assign(new Error("Sign-in already in progress — please wait."), { code: "auth/popup-in-flight" });
  }
  _popupInFlight = true;
  try {
    const result = await signInWithPopup(auth, makeProvider());
    if (!result.user) {
      throw Object.assign(new Error("Google sign-in completed without a user response."), { code: "auth/popup-no-user" });
    }
    return result.user;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code ?? "";
    if (code === "auth/popup-blocked") {
      await signInWithRedirect(auth, makeProvider());
      throw Object.assign(new Error("Redirect sign-in started."), { code: "auth/redirect-started" });
    }
    throw err;
  } finally {
    _popupInFlight = false;
  }
}

export async function consumeRedirectSignInResult(): Promise<User | null> {
  if (!auth) return null;
  try {
    const result = await getRedirectResult(auth);
    return result?.user ?? null;
  } catch {
    return null;
  }
}

export async function logoutUser(): Promise<void> {
  if (auth) await signOut(auth);
  try {
    localStorage.removeItem("ngo_token");
    document.cookie = "ngo_token=; path=/; max-age=0";
  } catch {
    // SSR — no localStorage
  }
}

export function observeAuthState(cb: (user: User | null) => void): Unsubscribe {
  if (!auth) return () => {};
  return onAuthStateChanged(auth, cb);
}

export async function getCurrentIdToken(): Promise<string | null> {
  if (!auth?.currentUser) return null;
  try {
    return await getIdToken(auth.currentUser);
  } catch {
    try {
      return await getIdToken(auth.currentUser, true);
    } catch {
      return null;
    }
  }
}
