"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { api, googleAuthWithRetry } from "./ngo-api";
import { signInWithGoogle as firebaseSignInWithGoogle } from "./firebase-auth";
import { authErrorMessage, isDismissedPopupError } from "./auth-errors";

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

const API = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

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
    const res = await fetch(`${API}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Login failed");
    }
    const data = await res.json();
    localStorage.setItem("ngo_token", data.token);
    document.cookie = `ngo_token=${data.token}; path=/; max-age=${60 * 60 * 24}; SameSite=Strict${location.protocol === 'https:' ? '; Secure' : ''}`;
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

    // Step 2: Exchange Firebase identity with backend for a custom JWT
    let data;
    try {
      data = await googleAuthWithRetry({
        email: firebaseUser.email!,
        firebase_uid: firebaseUser.uid,
        role,
        invite_code: inviteCode,
      });
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? "Backend authentication failed.";
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
        throw new Error("Cannot reach the server. Check NEXT_PUBLIC_BACKEND_URL and ensure the backend is running.");
      }
      throw new Error(msg);
    }

    localStorage.setItem("ngo_token", data.token);
    document.cookie = `ngo_token=${data.token}; path=/; max-age=${60 * 60 * 24}; SameSite=Strict${location.protocol === 'https:' ? '; Secure' : ''}`;
    const parsed = parseToken(data.token) as NGOUser;
    setUser(parsed);
    return parsed;
  };

  const logout = () => {
    localStorage.removeItem("ngo_token");
    document.cookie = "ngo_token=; path=/; max-age=0";
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
