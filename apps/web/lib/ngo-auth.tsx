"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { api, googleAuthWithRetry, friendlyError, fetchSafe } from "./ngo-api";
import { signInWithGoogle as firebaseSignInWithGoogle } from "./firebase-auth";
import { authErrorMessage, isDismissedPopupError } from "./auth-errors";
import { setTokens, clearToken, getRefreshToken } from "./token-manager";

export type NGOUser = {
  user_id: string;
  email:   string;
  role:    "ngo_admin" | "volunteer";
  ngo_id:  string | null;
  token:   string;
  needs_ngo_setup?: boolean;
};

type NGOAuthCtx = {
  user:            NGOUser | null;
  loading:         boolean;
  login:           (email: string, password: string) => Promise<NGOUser>;
  loginWithGoogle: (role: "ngo_admin" | "volunteer", inviteCode?: string) => Promise<NGOUser>;
  logout:          () => void;
  setUser:         (u: NGOUser) => void;
};

const Ctx = createContext<NGOAuthCtx>({} as NGOAuthCtx);

// Relative path — proxied to the backend by next.config.js rewrites().
const API = "";

function parseToken(token: string): (Omit<NGOUser, "email"> & { email: string }) | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (!payload?.sub || !payload?.role) return null;
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    return {
      user_id: payload.sub,
      role:    payload.role,
      ngo_id:  payload.ngo_id ?? null,
      email:   payload.email ?? "",
      token,
      needs_ngo_setup: payload.role === "ngo_admin" && !payload.ngo_id,
    };
  } catch {
    return null;
  }
}

export function NGOAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<NGOUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("ngo_token");
      if (stored) {
        const p = parseToken(stored);
        if (p) {
          setUser(p as NGOUser);
        } else {
          localStorage.removeItem("ngo_token");
        }
      }
    } catch {
      localStorage.removeItem("ngo_token");
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string): Promise<NGOUser> => {
    // fetchSafe gives retry logic + timeout handling — replacing raw fetch
    const res = await fetchSafe(`${API}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Login failed (${res.status})`);
    }
    const data = await res.json();
    setTokens(data.token, data.refresh_token);
    const parsed = parseToken(data.token) as NGOUser;
    setUser(parsed);
    return parsed;
  };

  const loginWithGoogle = async (role: "ngo_admin" | "volunteer", inviteCode?: string): Promise<NGOUser> => {
    // Step 1: Firebase Google popup (mutex-protected, forces account picker)
    let firebaseUser;
    try {
      firebaseUser = await firebaseSignInWithGoogle();
    } catch (err: unknown) {
      if (isDismissedPopupError(err)) {
        throw new Error("Google sign-in window was closed. Please try again.");
      }
      throw new Error(authErrorMessage(err));
    }

    // Step 2: Pre-check email — detect role mismatch before auth round-trip
    const email = firebaseUser.email!;
    try {
      const check = await api.checkEmail(email);
      if (check.exists && check.role && check.role !== role) {
        const label = check.role === "ngo_admin" ? "NGO Admin" : "Volunteer";
        throw new Error(`This email is already registered as a ${label} account. Please use the ${label} sign-in button.`);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("registered as")) throw err;
      // checkEmail failure is non-fatal — let googleAuth handle it
    }

    // Step 3: Exchange Firebase identity with backend for a custom JWT
    let data;
    try {
      data = await googleAuthWithRetry({
        email,
        firebase_uid: firebaseUser.uid,
        role,
        invite_code: inviteCode,
      });
    } catch (err: unknown) {
      throw new Error(friendlyError(err));
    }

    setTokens(data.token, data.refresh_token);
    const parsed = parseToken(data.token) as NGOUser;
    setUser(parsed);
    return parsed;
  };

  const logout = () => {
    const refresh = getRefreshToken();
    if (refresh) {
      // Fire and forget: the session must end locally even if this fails.
      fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refresh }),
        keepalive: true,
      }).catch(() => {});
    }
    clearToken();
    setUser(null);
  };

  return (
    <Ctx.Provider value={{ user, loading, login, loginWithGoogle, logout, setUser }}>
      {children}
    </Ctx.Provider>
  );
}

export function useNGOAuth() {
  return useContext(Ctx);
}
