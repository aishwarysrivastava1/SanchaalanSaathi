"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../lib/auth";
import { ThemeToggle } from "../../../components/ui/ThemeToggle";
import { Building2, ArrowLeft, Map, BarChart3, Users, Shield, AlertCircle } from "lucide-react";
import Link from "next/link";

const FEATURES = [
  { icon: Map,       text: "Intelligence map with live need visualisation" },
  { icon: BarChart3, text: "Real-time analytics and task tracking" },
  { icon: Users,     text: "Register and coordinate field volunteers" },
  { icon: Shield,    text: "AI-powered task verification pipeline" },
];

export default function NGOLoginPage() {
  const { user, role, loading, signInWithGoogle, setUserRole, signOut } = useAuth();
  const router = useRouter();
  const roleAssigned = useRef(false);
  const [signingIn, setSigningIn] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !user) return;
    if (roleAssigned.current) return;

    if (role === "NGO") {
      setRedirecting(true);
      router.replace("/ngo-dashboard");
    } else if (role === "Volunteer") {
      setRedirecting(true);
      router.replace("/volunteer-dashboard");
    } else {
      // New user — assign NGO role
      roleAssigned.current = true;
      setRedirecting(true);
      setUserRole("NGO")
        .then(() => router.replace("/ngo-dashboard"))
        .catch((err) => {
          console.error("setUserRole failed:", err);
          roleAssigned.current = false;
          setRedirecting(false);
          setSetupError("Account setup failed. Please try signing in again.");
          signOut();
        });
    }
  }, [user, role, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogin = async () => {
    setSetupError(null);
    setSigningIn(true);
    try {
      await signInWithGoogle();
      // onAuthStateChanged will fire and useEffect will redirect
    } catch (err: any) {
      const code = err?.code ?? "";
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        // User dismissed — not an error
      } else if (code === "auth/popup-blocked") {
        setSetupError("Popup was blocked by your browser. Please allow popups for this site and try again.");
      } else {
        setSetupError(err?.message ?? "Sign-in failed. Please try again.");
      }
      setSigningIn(false);
    }
  };

  // Show full-screen spinner only during initial auth load or after triggering redirect
  if (loading || redirecting) {
    return (
      <div className="min-h-screen bg-[#F5F6F1] dark:bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-[#115E54] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-gray-400 dark:text-gray-500">Setting up your account…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F6F1] dark:bg-gray-950 flex flex-col relative overflow-hidden">

      {/* Ambient glows */}
      <div className="pointer-events-none absolute top-[-15%] right-[-10%] w-[50%] h-[50%] rounded-full bg-[#115E54]/8 dark:bg-[#115E54]/12 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-20%] left-[-10%] w-[45%] h-[45%] rounded-full bg-[#2A8256]/5 dark:bg-[#2A8256]/8 blur-3xl" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
          <ArrowLeft size={15} />
          Back
        </Link>
        <ThemeToggle size="sm" />
      </header>

      {/* Main */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-6 py-8">
        <div className="w-full max-w-4xl grid md:grid-cols-2 gap-10 items-center">

          {/* Left — branding */}
          <div className="text-center md:text-left animate-slide-up">
            <div className="inline-flex items-center justify-center md:justify-start mb-5">
              <div className="w-14 h-14 rounded-2xl bg-[#115E54]/12 dark:bg-[#115E54]/20 flex items-center justify-center">
                <Building2 size={28} className="text-[#115E54]" />
              </div>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 leading-tight mb-2">
              NGO Command Portal
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed mb-8">
              Join India&apos;s network of emergency coordinators. Manage needs, assign tasks, and track volunteer deployment in real time.
            </p>
            <ul className="space-y-3 text-left">
              {FEATURES.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                  <div className="w-7 h-7 rounded-lg bg-[#115E54]/8 dark:bg-[#115E54]/15 flex items-center justify-center shrink-0">
                    <Icon size={13} className="text-[#115E54]" />
                  </div>
                  {text}
                </li>
              ))}
            </ul>
          </div>

          {/* Right — login card */}
          <div className="animate-slide-up delay-100">
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-sm border border-gray-200 dark:border-gray-800 flex flex-col gap-5">
              <div className="text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo/logo-icon.png" alt="logo" className="h-10 w-10 mx-auto mb-3 object-contain" />
                <h2 className="font-bold text-gray-900 dark:text-gray-100 text-base">Sign in to your NGO account</h2>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  First sign-in? Your account is set up as NGO automatically.
                </p>
              </div>

              <div className="h-px bg-gray-100 dark:bg-gray-800" />

              {setupError && (
                <div className="flex items-start gap-2.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-3 text-xs text-red-700 dark:text-red-400">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span>{setupError}</span>
                </div>
              )}

              <button
                onClick={handleLogin}
                disabled={signingIn}
                className="w-full flex items-center justify-center gap-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold py-3 px-6 rounded-xl border border-gray-300 dark:border-gray-700 transition-all shadow-sm hover:shadow-md active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {signingIn ? (
                  <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin shrink-0" />
                ) : (
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                )}
                {signingIn ? "Signing in…" : "Continue with Google"}
              </button>

              <p className="text-center text-xs text-gray-400 dark:text-gray-600">
                Are you a volunteer?{" "}
                <Link href="/login/volunteer" className="text-[#48A15E] hover:underline font-medium">
                  Volunteer sign-in →
                </Link>
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 text-center py-4 text-xs text-gray-400 dark:text-gray-600">
        Sanchaalan Saathi — Team CrownBreakers
      </footer>
    </div>
  );
}
