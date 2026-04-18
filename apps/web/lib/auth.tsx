"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "./firebase";
import {
  onAuthStateChanged, User, GoogleAuthProvider,
  signInWithPopup, signOut as fbSignOut,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

export type UserRole = "NGO" | "Volunteer";

interface AuthContextType {
  user: User | null;
  role: UserRole | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  setUserRole: (role: UserRole) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  loading: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
  setUserRole: async () => {},
});

/** Rejects after `ms` milliseconds — wraps any promise with a timeout. */
function withTimeout<T>(promise: Promise<T>, ms = 8000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Firestore timeout after ${ms}ms`)), ms)
    ),
  ]);
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser]       = useState<User | null>(null);
  const [role, setRole]       = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth || !db) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        try {
          const volRef  = doc(db, "volunteers", currentUser.uid);
          const volSnap = await withTimeout(getDoc(volRef));

          if (!volSnap.exists()) {
            // New user — create base profile; role chosen on next screen
            await withTimeout(
              setDoc(volRef, {
                uid:                currentUser.uid,
                name:               currentUser.displayName || "New User",
                phone:              currentUser.phoneNumber  || "",
                skills:             [],
                location:           { lat: 28.6139, lng: 77.2090 },
                reputationScore:    100,
                totalXP:            0,
                totalTasksCompleted: 0,
                currentActiveTasks: 0,
                availabilityStatus: "ACTIVE",
                role:               null,
              })
            );
            setRole(null);
          } else {
            const data = volSnap.data();
            setRole((data.role as UserRole) ?? null);
          }
        } catch (err) {
          console.error("[Auth] Firestore profile error:", err);
          setRole(null);
        }
      } else {
        setRole(null);
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signInWithGoogle = async () => {
    if (!auth) throw new Error("Firebase auth is not configured. Set NEXT_PUBLIC_FIREBASE_* env vars.");
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const signOut = async () => {
    if (!auth) return;
    await fbSignOut(auth);
  };

  /**
   * Persists the chosen role to Firestore using setDoc+merge (safe even if the
   * doc was just created moments ago and updateDoc would race).
   */
  const setUserRole = async (newRole: UserRole) => {
    if (!user) throw new Error("No authenticated user");
    if (!db) throw new Error("Firestore is not configured. Set NEXT_PUBLIC_FIREBASE_* env vars.");
    const volRef = doc(db, "volunteers", user.uid);
    await withTimeout(
      setDoc(volRef, { role: newRole }, { merge: true })
    );
    setRole(newRole);
  };

  return (
    <AuthContext.Provider
      value={{ user, role, loading, signInWithGoogle, signOut, setUserRole }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
