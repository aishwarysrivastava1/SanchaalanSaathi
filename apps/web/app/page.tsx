"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { HOVER_LIFT_ICON, riseIn } from "../lib/motion";
import {
  Building2, Users, BarChart3, Zap, Shield,
  Menu, X, ArrowRight, MapPin, Bell, CheckCircle2,
  ChevronRight, ChevronDown, Star, TrendingUp, Clock,
} from "lucide-react";
import { signInWithGoogle as firebaseSignIn } from "@/lib/firebase-auth";
import { api, friendlyError, googleAuthWithRetry } from "@/lib/ngo-api";
import { enterGuestMode } from "@/lib/guest-mode";
import { authErrorCode, authErrorMessage, isDismissedPopupError } from "@/lib/auth-errors";
import { useTheme } from "@/components/ui/ThemeProvider";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ChatbotWidget } from "@/components/ui/ChatbotWidget";
import { setTokens } from "@/lib/token-manager";

const BACKEND = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");

// ── Auth helpers ──────────────────────────────────────────────────────────────

async function handleGoogleSignIn(
  router: ReturnType<typeof useRouter>,
  setError: (e: string) => void,
  setBusy: (b: boolean) => void,
  role: "ngo_admin" | "volunteer",
  inviteCode?: string,
) {
  setError("");
  setBusy(true);
  let firebaseUser;
  try {
    firebaseUser = await firebaseSignIn();
  } catch (e: unknown) {
    const code = authErrorCode(e);
    if (isDismissedPopupError(e)) {
      // silent
    } else if (code === "auth/redirect-started") {
      setError("Redirecting to Google sign-in...");
    } else if (code === "auth/popup-blocked") {
      setError(authErrorMessage(e));
    } else {
      setError(authErrorMessage(e) || friendlyError(e));
    }
    if (code !== "auth/redirect-started") setBusy(false);
    return;
  }

  const email = firebaseUser.email!;
  const uid   = firebaseUser.uid;
  const name  = firebaseUser.displayName ?? "";

  let check: { exists: boolean; role: "ngo_admin" | "volunteer" | null };
  try {
    check = await api.checkEmail(email);
  } catch (e: unknown) {
    setError(friendlyError(e));
    setBusy(false);
    return;
  }

  // Pre-check: email exists under a different role — fail immediately before auth round-trip
  if (check.exists && check.role && check.role !== role) {
    const label = check.role === "ngo_admin" ? "NGO Admin" : "Volunteer";
    setError(`This email is already registered as a ${label} account. Please use the ${label} sign-in button.`);
    setBusy(false);
    return;
  }

  if (check.exists) {
    try {
      const data = await googleAuthWithRetry(
        { email, firebase_uid: uid, role: role as "ngo_admin" | "volunteer" },
        { attempts: 3, timeoutMs: 30000 },
      );
      setTokens(data.token, data.refresh_token);
      if (data.needs_ngo_setup) window.location.href = "/ngo/setup";
      else if (data.role === "ngo_admin") window.location.href = "/ngo/dashboard";
      else window.location.href = "/vol/dashboard";
    } catch (e: unknown) {
      setError(friendlyError(e));
      setBusy(false);
    }
  } else {
    const params = new URLSearchParams({ mode: "google", email, uid, name });
    if (role === "volunteer" && inviteCode) params.set("invite", inviteCode);
    window.location.href = role === "ngo_admin"
      ? `/register/ngo?${params.toString()}`
      : `/register/volunteer?${params.toString()}`;
  }
}

function handleGuestSignIn() {
  enterGuestMode("ngo_admin");
  window.location.href = "/ngo/dashboard";
}

function handleGuestVolunteerSignIn() {
  enterGuestMode("volunteer");
  window.location.href = "/vol/dashboard";
}

// ── Google icon ───────────────────────────────────────────────────────────────

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M17.64 9.2045c0-.638-.0573-1.252-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.6149z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.4673-.8059 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.8591-3.0477.8591-2.3441 0-4.3282-1.5836-5.036-3.7104H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18z" fill="#34A853"/>
    <path d="M3.964 10.71C3.7841 10.17 3.6818 9.5932 3.6818 9c0-.5932.1023-1.17.2822-1.71V4.9582H.9574C.3477 6.1732 0 7.5477 0 9c0 1.4523.3477 2.8268.9574 4.0418L3.964 10.71z" fill="#FBBC05"/>
    <path d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.4259 0 9 0 5.4818 0 2.4382 2.0168.9574 4.9582L3.964 7.29C4.6718 5.1632 6.6559 3.5795 9 3.5795z" fill="#EA4335"/>
  </svg>
);

// ── Connectivity banner ───────────────────────────────────────────────────────

function ConnectivityBanner() {
  // Start ONLINE — assume backend is reachable. Only show the banner if
  // the backend is provably unreachable after sustained failures.
  const [offline, setOffline] = useState(false);
  const failCountRef = React.useRef(0);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = React.useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    const check = async () => {
      if (!isMountedRef.current) return;
      const controller = new AbortController();
      const abortTimer = setTimeout(() => controller.abort(), 20000);
      try {
        const res = await fetch("/api/health", { signal: controller.signal });
        clearTimeout(abortTimer);
        if (!isMountedRef.current) return;
        if (res.ok) {
          failCountRef.current = 0;
          setOffline(false);
        } else {
          failCountRef.current += 1;
          // Only show error after 5 consecutive failures (~3+ minutes of downtime)
          if (failCountRef.current >= 5) setOffline(true);
        }
      } catch {
        clearTimeout(abortTimer);
        if (!isMountedRef.current) return;
        failCountRef.current += 1;
        if (failCountRef.current >= 5) setOffline(true);
      }
      if (isMountedRef.current) {
        timerRef.current = setTimeout(check, 30000);
      }
    };

    // First check after 10s — give both Vercel and Railway time to warm up
    timerRef.current = setTimeout(check, 10000);
    return () => {
      isMountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!offline) return null;
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      style={{ background: "#7f1d1d", color: "#fff", padding: "8px 24px", fontSize: 12, fontWeight: 600, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, zIndex: 200 }}
    >
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#f87171", animation: "blink 2s infinite" }} />
      Cannot reach servers. Check your connection or wait for maintenance to finish.
    </motion.div>
  );
}

// ── Login card ────────────────────────────────────────────────────────────────

function LoginCard({ role, router, isDark }: { role: "ngo_admin" | "volunteer"; router: ReturnType<typeof useRouter>; isDark: boolean }) {
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [inviteCode, setInviteCode] = useState("");
  const [ngoName, setNgoName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hovered, setHovered] = useState(false);
  const lookupTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isNgo = role === "ngo_admin";

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: isDark ? "rgba(255,255,255,0.06)" : "#ffffff",
        backdropFilter: isDark ? "blur(24px)" : "none",
        border: `1px solid ${hovered ? "rgba(72,161,94,0.45)" : isDark ? "rgba(255,255,255,0.1)" : "rgba(17,94,84,0.12)"}`,
        borderRadius: 24,
        padding: "36px 32px",
        boxShadow: hovered
          ? isDark ? "0 0 0 3px rgba(72,161,94,0.12), 0 32px 72px rgba(0,0,0,0.45)" : "0 0 0 3px rgba(72,161,94,0.1), 0 12px 48px rgba(17,94,84,0.14)"
          : isDark ? "0 32px 72px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)" : "0 8px 40px rgba(17,94,84,0.08)",
        flex: 1, minWidth: 0,
        transition: "border-color 0.3s, box-shadow 0.3s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: isNgo ? "linear-gradient(135deg, var(--brand-500), var(--brand-400))" : "linear-gradient(135deg, #1a7a5e, var(--brand-500))", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {isNgo ? <Building2 size={20} color="#fff" /> : <Users size={20} color="#fff" />}
        </div>
        <div>
          <h3 style={{ color: isDark ? "#fff" : "#111827", fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: "-0.3px" }}>
            {isNgo ? "NGO Admin" : "Volunteer"}
          </h3>
          <p style={{ color: isDark ? "rgba(255,255,255,0.4)" : "#6B7280", fontSize: 12, margin: 0 }}>
            {isNgo ? "Manage your organisation" : "Join & contribute"}
          </p>
        </div>
      </div>

      <button
        onClick={() => isNgo ? handleGuestSignIn() : handleGuestVolunteerSignIn()}
        disabled={busy}
        style={{
          width: "100%", padding: "11px", borderRadius: 10,
          background: isNgo ? "linear-gradient(135deg, #7c3aed, #6d28d9)" : "linear-gradient(135deg, #0e7490, #0891b2)",
          color: "#fff", border: "none", fontSize: 13, fontWeight: 600,
          cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.7 : 1,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          marginTop: 10,
          boxShadow: isNgo ? "0 4px 14px rgba(109,40,217,0.28)" : "0 4px 14px rgba(8,145,178,0.28)",
          transition: "opacity 0.2s",
        }}
      >
        <Star size={15} />
        {isNgo ? "Try Demo as Admin" : "Try Demo as Volunteer"}
      </button>

      <div style={{ height: 1, background: isDark ? "rgba(255,255,255,0.07)" : "#E5E7EB", margin: "20px 0" }} />

      <div style={{ display: "flex", background: isDark ? "rgba(0,0,0,0.2)" : "#F3F4F6", borderRadius: 10, padding: 3, marginBottom: 22, gap: 3 }}>
        {(["login", "signup"] as const).map((m) => (
          <button key={m} onClick={() => { setAuthMode(m); setError(""); }}
            style={{ flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", transition: "all 0.2s",
              ...(authMode === m
                ? { background: isDark ? "rgba(255,255,255,0.12)" : "#ffffff", color: isDark ? "#fff" : "#111827", boxShadow: isDark ? "none" : "0 1px 4px rgba(0,0,0,0.08)" }
                : { background: "transparent", color: isDark ? "rgba(255,255,255,0.35)" : "#9CA3AF" }),
            }}
          >{m === "login" ? "Log In" : "Sign Up"}</button>
        ))}
      </div>

      {!isNgo && authMode === "signup" && (
        <div style={{ marginBottom: 18 }}>
          <label style={{ display: "block", color: isDark ? "rgba(255,255,255,0.55)" : "#6B7280", fontSize: 12, fontWeight: 600, marginBottom: 7, letterSpacing: "0.03em", textTransform: "uppercase" }}>
            Invite Code
          </label>
          <input
            type="text" placeholder="e.g. ABC12345" value={inviteCode}
            onChange={(e) => {
              const val = e.target.value.toUpperCase();
              setInviteCode(val); setError(""); setNgoName("");
              if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);
              if (val.length >= 6) {
                lookupTimerRef.current = setTimeout(() => {
                  api.lookupNGO(val).then((d: { ngo_name: string }) => setNgoName(d.ngo_name)).catch(() => setNgoName(""));
                }, 300);
              }
            }}
            maxLength={16}
            style={{ width: "100%", padding: "12px 15px", borderRadius: 11, border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "#E5E7EB"}`, background: isDark ? "rgba(255,255,255,0.07)" : "#F9FAFB", color: isDark ? "#fff" : "#111827", fontSize: 15, fontFamily: "'SF Mono', 'Fira Code', monospace", letterSpacing: "0.12em", outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(72,161,94,0.5)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = isDark ? "rgba(255,255,255,0.12)" : "#E5E7EB"; }}
          />
          {ngoName
            ? <p style={{ color: "#6ee7b7", fontSize: 11, margin: "6px 0 0", display: "flex", alignItems: "center", gap: 4 }}><span>✓</span> Joining: <strong>{ngoName}</strong></p>
            : <p style={{ color: isDark ? "rgba(255,255,255,0.3)" : "#9CA3AF", fontSize: 11, margin: "6px 0 0" }}>Get this code from your NGO administrator.</p>
          }
        </div>
      )}

      <AnimatePresence>
        {error && (
          <motion.div key="error" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 10, padding: "10px 14px", marginBottom: 14, color: "#fca5a5", fontSize: 13, textAlign: "center" }}>
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1, height: 1, background: isDark ? "rgba(255,255,255,0.08)" : "#E5E7EB" }} />
        <span style={{ color: isDark ? "rgba(255,255,255,0.25)" : "#9CA3AF", fontSize: 11, fontWeight: 500 }}>CONTINUE WITH</span>
        <div style={{ flex: 1, height: 1, background: isDark ? "rgba(255,255,255,0.08)" : "#E5E7EB" }} />
      </div>

      <motion.button
        onClick={() => {
          if (!isNgo && authMode === "signup") {
            if (!inviteCode.trim()) { setError("Enter your NGO invite code to sign up."); return; }
            if (!ngoName) { setError("Invalid invite code — check with your NGO administrator."); return; }
            handleGoogleSignIn(router, setError, setBusy, "volunteer", inviteCode);
          } else {
            handleGoogleSignIn(router, setError, setBusy, role);
          }
        }}
        disabled={busy}
        whileHover={{ scale: busy ? 1 : 1.015, boxShadow: busy ? undefined : "0 8px 24px rgba(0,0,0,0.2)" }}
        whileTap={{ scale: busy ? 1 : 0.975 }}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "14px 0", borderRadius: 12, border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "#E5E7EB"}`, background: busy ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.95)", color: "#1a1a1a", fontSize: 15, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", transition: "background 0.2s", letterSpacing: "-0.1px", marginBottom: 10 }}
      >
        {busy
          ? <div style={{ display: "flex", gap: 5 }}>{[0, 1, 2].map((i) => <motion.div key={i} animate={{ y: [0, -6, 0] }} transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.12 }} style={{ width: 6, height: 6, borderRadius: 3, background: "#6b7280" }} />)}</div>
          : <><GoogleIcon />{authMode === "login" ? "Log In with Google" : "Sign Up with Google"}</>
        }
      </motion.button>

      <p style={{ color: isDark ? "rgba(255,255,255,0.22)" : "#9CA3AF", fontSize: 11.5, textAlign: "center", marginTop: 12, lineHeight: 1.6 }}>
        {isNgo
          ? authMode === "signup" ? "First time? You'll set up your NGO profile right after sign-in." : "Welcome back — access your NGO dashboard."
          : authMode === "signup" ? "Enter your invite code above, then sign up with Google." : "Welcome back — access your volunteer dashboard."}
      </p>
    </motion.div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

function readStoredRole(): "ngo_admin" | "volunteer" | null {
  try {
    const token = localStorage.getItem("ngo_token");
    if (!token) return null;
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.exp && Date.now() / 1000 > payload.exp) { localStorage.removeItem("ngo_token"); return null; }
    return payload.role ?? null;
  } catch { return null; }
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const loginRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const role = readStoredRole();
    if (role === "ngo_admin") { setRedirecting(true); router.replace("/ngo/dashboard"); return; }
    if (role === "volunteer") { setRedirecting(true); router.replace("/vol/dashboard"); return; }
  }, [router]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const T = {
    pageBg:       isDark ? "linear-gradient(180deg, #072921 0%, #0B3D36 20%, #0d4a42 50%, #072921 100%)" : "linear-gradient(180deg, #f5faf7 0%, #ffffff 40%, #f0f7f3 100%)",
    navBg:        isDark ? "rgba(7,41,33,0.92)"     : "rgba(255,255,255,0.95)",
    navBorder:    isDark ? "rgba(255,255,255,0.06)"  : "rgba(17,94,84,0.1)",
    navLink:      isDark ? "rgba(255,255,255,0.6)"   : "#6B7280",
    mobileBg:     isDark ? "rgba(7,41,33,0.98)"     : "rgba(255,255,255,0.98)",
    mobileBorder: isDark ? "rgba(255,255,255,0.06)"  : "#E5E7EB",
    mobileLink:   isDark ? "rgba(255,255,255,0.7)"   : "#374151",
    text:         isDark ? "#fff"                    : "#111827",
    textSub:      isDark ? "rgba(255,255,255,0.55)"  : "#6B7280",
    textMuted:    isDark ? "rgba(255,255,255,0.4)"   : "#9CA3AF",
    cardBg:       isDark ? "rgba(255,255,255,0.05)"  : "#ffffff",
    cardBorder:   isDark ? "rgba(255,255,255,0.08)"  : "#E5E7EB",
    sectionBg:    isDark ? "rgba(0,0,0,0.1)"         : "rgba(17,94,84,0.02)",
    stepBg:       isDark ? "rgba(255,255,255,0.04)"  : "#ffffff",
    stepBorder:   isDark ? "rgba(255,255,255,0.07)"  : "#E5E7EB",
    statBg:       isDark ? "rgba(42,130,86,0.1)"    : "rgba(42,130,86,0.06)",
    statBorder:   isDark ? "rgba(72,161,94,0.2)"    : "rgba(17,94,84,0.12)",
    impactBg:     isDark ? "rgba(255,255,255,0.04)"  : "#ffffff",
    impactBorder: isDark ? "rgba(255,255,255,0.08)"  : "#E5E7EB",
    iconBg:       isDark ? "rgba(72,161,94,0.14)"   : "rgba(42,130,86,0.09)",
    footerBorder: isDark ? "rgba(255,255,255,0.06)"  : "#E5E7EB",
    footerText:   isDark ? "rgba(255,255,255,0.38)"  : "#6B7280",
    footerMuted:  isDark ? "rgba(255,255,255,0.2)"   : "#9CA3AF",
  };

  if (redirecting) {
    return (
      <div style={{ minHeight: "100vh", background: T.pageBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {[0, 1, 2].map((i) => (
            <motion.div key={i} animate={{ y: [0, -10, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
              style={{ width: 8, height: 8, borderRadius: 4, background: "var(--brand-400)" }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: T.pageBg, fontFamily: "'Outfit', system-ui, -apple-system, sans-serif", overflowX: "hidden" }}>
      <ConnectivityBanner />

      {/* ── NAVBAR ───────────────────────────────────────────────────────────── */}
      <nav aria-label="Main navigation" style={{ position: "sticky", top: 0, zIndex: 100, background: scrolled ? T.navBg : "transparent", backdropFilter: scrolled ? "blur(20px)" : "none", borderBottom: scrolled ? `1px solid ${T.navBorder}` : "1px solid transparent", transition: "all 0.3s ease", padding: "0 24px" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", display: "flex", alignItems: "center", height: 64 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "0 0 auto", marginRight: 48 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo/logo-icon.png" alt="Sanchaalan Saathi" style={{ height: 34, width: 34, objectFit: "contain" }} />
            <div>
              <p style={{ color: isDark ? "#fff" : "var(--brand-600)", fontWeight: 700, fontSize: 15, margin: 0, letterSpacing: "-0.3px" }}>Sanchaalan Saathi</p>
              <p style={{ color: T.textMuted, fontSize: 10, margin: 0 }}>NGO Coordination Platform</p>
            </div>
          </div>

          <div className="nav-links" style={{ display: "flex", gap: 32, flex: 1 }}>
            {[["Features", "features"], ["How It Works", "how-it-works"], ["Impact", "impact"], ["Sign In", "login"]].map(([label, id]) => (
              <button key={id} onClick={() => scrollTo(id)}
                style={{ background: "none", border: "none", color: T.navLink, fontSize: 14, fontWeight: 500, cursor: "pointer", padding: "4px 0", transition: "color 0.2s", fontFamily: "inherit", position: "relative" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = isDark ? "#fff" : "#115E54"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = T.navLink; }}
              >{label}</button>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            <ThemeToggle size="sm" />
            <button className="nav-cta" onClick={() => scrollTo("login")}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 20px", borderRadius: 10, background: "linear-gradient(135deg, var(--brand-500), var(--brand-400))", color: "#fff", fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer", transition: "opacity 0.2s, transform 0.2s", boxShadow: "0 4px 14px rgba(42,130,86,0.35)", fontFamily: "inherit", whiteSpace: "nowrap" }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.88"; e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "translateY(0)"; }}
            >Get Started <ArrowRight size={14} /></button>
          </div>

          <button className="hamburger" aria-label="Toggle menu" onClick={() => setMenuOpen(!menuOpen)}
            style={{ display: "none", background: "none", border: "none", color: isDark ? "#fff" : "var(--brand-600)", cursor: "pointer", padding: 4, marginLeft: 12 }}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        <AnimatePresence>
          {menuOpen && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              style={{ overflow: "hidden", background: T.mobileBg, borderTop: `1px solid ${T.mobileBorder}` }}>
              <div style={{ padding: "12px 24px 20px", display: "flex", flexDirection: "column", gap: 4 }}>
                {[["Features", "features"], ["How It Works", "how-it-works"], ["Impact", "impact"], ["Sign In", "login"]].map(([label, id]) => (
                  <button key={id} onClick={() => { scrollTo(id); setMenuOpen(false); }}
                    style={{ background: "none", border: "none", color: T.mobileLink, fontSize: 15, fontWeight: 500, cursor: "pointer", padding: "10px 0", textAlign: "left", fontFamily: "inherit", borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.04)" : "#F3F4F6"}` }}>
                    {label}
                  </button>
                ))}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
                  <ThemeToggle size="sm" />
                  <button onClick={() => { scrollTo("login"); setMenuOpen(false); }}
                    style={{ flex: 1, padding: "12px 0", borderRadius: 10, background: "linear-gradient(135deg, var(--brand-500), var(--brand-400))", color: "#fff", fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                    Get Started
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section id="top" style={{ position: "relative", padding: "108px 24px 128px", overflow: "hidden" }}>
        {/* Grid overlay */}
        <div style={{ position: "absolute", inset: 0, opacity: 0.025, backgroundImage: "linear-gradient(rgba(17,94,84,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(17,94,84,0.6) 1px, transparent 1px)", backgroundSize: "48px 48px", pointerEvents: "none" }} />

        {/* CSS-animated orbs — no JS event listeners */}
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />

        <div style={{ maxWidth: 820, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(42,130,86,0.15)", border: "1px solid rgba(72,161,94,0.3)", borderRadius: 100, padding: "6px 16px", marginBottom: 28 }}>
            <Star size={13} color="#48A15E" fill="#48A15E" />
            <span className="text-shimmer" style={{ fontSize: 13, fontWeight: 600 }}>AI-Powered NGO Coordination</span>
          </motion.div>

          <motion.h1 {...riseIn} transition={{ duration: 0.6, delay: 0.1 }}
            style={{ color: T.text, fontSize: "clamp(40px, 7vw, 72px)", fontWeight: 900, margin: "0 0 22px", lineHeight: 1.06, letterSpacing: "-2.5px" }}>
            Coordinate NGOs.{" "}
            <span style={{ background: "linear-gradient(135deg, var(--brand-400) 0%, var(--brand-300) 50%, var(--brand-400) 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundSize: "200% auto", animation: "shimmer 4s linear infinite" }}>
              Amplify Impact.
            </span>
          </motion.h1>

          <motion.p {...riseIn} transition={{ duration: 0.6, delay: 0.2 }}
            style={{ color: T.textSub, fontSize: "clamp(16px, 2.5vw, 20px)", lineHeight: 1.68, margin: "0 auto 48px", maxWidth: 560 }}>
            AI-powered volunteer matching, real-time task coordination, and deep analytics — for every NGO, at zero cost.
          </motion.p>

          <motion.div {...riseIn} transition={{ duration: 0.6, delay: 0.3 }}
            className="hero-btns" style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={() => scrollTo("login")}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "15px 30px", borderRadius: 12, background: "linear-gradient(135deg, var(--brand-500), var(--brand-400))", color: "#fff", fontSize: 16, fontWeight: 700, border: "none", cursor: "pointer", boxShadow: "0 8px 28px rgba(42,130,86,0.45)", transition: "transform 0.2s, box-shadow 0.2s", fontFamily: "inherit" }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 14px 36px rgba(42,130,86,0.55)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 8px 28px rgba(42,130,86,0.45)"; }}>
              <Users size={18} /> Join as Volunteer
            </button>
            <button onClick={() => scrollTo("login")}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "15px 30px", borderRadius: 12, background: isDark ? "rgba(255,255,255,0.09)" : "rgba(17,94,84,0.07)", border: `1.5px solid ${isDark ? "rgba(255,255,255,0.18)" : "rgba(17,94,84,0.22)"}`, color: isDark ? "#fff" : "var(--brand-600)", fontSize: 16, fontWeight: 700, cursor: "pointer", transition: "background 0.2s, border-color 0.2s", fontFamily: "inherit" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.15)" : "rgba(17,94,84,0.12)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.09)" : "rgba(17,94,84,0.07)"; }}>
              <Building2 size={18} /> Register as NGO
            </button>
          </motion.div>

          {/* Scroll indicator */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2, duration: 0.6 }}
            style={{ marginTop: 64, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer" }}
            onClick={() => scrollTo("features")}>
            <p style={{ color: T.textMuted, fontSize: 11, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", margin: 0 }}>Explore</p>
            <motion.div animate={{ y: [0, 6, 0] }} transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}>
              <ChevronDown size={20} color={isDark ? "rgba(255,255,255,0.3)" : "rgba(17,94,84,0.35)"} />
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────────────────────── */}
      <section id="features" style={{ padding: "96px 24px", position: "relative" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} style={{ textAlign: "center", marginBottom: 60 }}>
            <p style={{ color: "var(--brand-400)", fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 12px" }}>Platform Features</p>
            <h2 style={{ color: T.text, fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, margin: "0 0 14px", letterSpacing: "-1px" }}>Everything your NGO needs</h2>
            <p style={{ color: T.textMuted, fontSize: 17, margin: 0, maxWidth: 460, marginLeft: "auto", marginRight: "auto" }}>
              One platform for administrators and volunteers — every workflow, covered.
            </p>
          </motion.div>

          <div className="features-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}>
            {[
              { icon: <Zap size={22} color="#48A15E" />, title: "AI Volunteer Matching", desc: "Automatically assign the right volunteer based on skills, location, and availability.", tag: "Admin" },
              { icon: <BarChart3 size={22} color="#48A15E" />, title: "Real-time Analytics", desc: "Live dashboards showing task completion rates, volunteer hours, and mission impact.", tag: "Admin" },
              { icon: <Shield size={22} color="#48A15E" />, title: "Invite-only Onboarding", desc: "Control who joins your organisation with unique invite codes — no open signups.", tag: "Admin" },
              { icon: <MapPin size={22} color="#48A15E" />, title: "Skill-based Task Feed", desc: "Volunteers see only tasks that match their skills and schedule — zero noise.", tag: "Volunteer" },
              { icon: <Bell size={22} color="#48A15E" />, title: "Instant Notifications", desc: "Get assigned to tasks the moment they're created — never miss an opportunity.", tag: "Volunteer" },
              { icon: <TrendingUp size={22} color="#48A15E" />, title: "Impact Tracking", desc: "Personal stats showing contribution hours, tasks completed, and outcomes over time.", tag: "Volunteer" },
            ].map((f, i) => (
              <motion.div key={f.title}
                initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.07 }}
                className="feature-card"
                style={{ background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 18, padding: "28px 24px", transition: "border-color 0.25s, transform 0.25s, box-shadow 0.25s", boxShadow: isDark ? "none" : "0 2px 8px rgba(0,0,0,0.04)" }}
                onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "rgba(72,161,94,0.4)"; el.style.transform = "translateY(-4px)"; el.style.boxShadow = "0 16px 40px rgba(42,130,86,0.13)"; }}
                onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.borderColor = T.cardBorder; el.style.transform = ""; el.style.boxShadow = isDark ? "none" : "0 2px 8px rgba(0,0,0,0.04)"; }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
                  <motion.div whileHover={HOVER_LIFT_ICON} style={{ width: 46, height: 46, borderRadius: 13, background: T.iconBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {f.icon}
                  </motion.div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: f.tag === "Admin" ? "var(--brand-400)" : "var(--brand-500)", background: f.tag === "Admin" ? "rgba(42,130,86,0.12)" : "rgba(42,130,86,0.08)", padding: "3px 10px", borderRadius: 100 }}>
                    {f.tag}
                  </span>
                </div>
                <h3 style={{ color: T.text, fontSize: 16, fontWeight: 700, margin: "0 0 8px" }}>{f.title}</h3>
                <p style={{ color: T.textMuted, fontSize: 14, margin: 0, lineHeight: 1.6 }}>{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────────── */}
      <section id="how-it-works" style={{ padding: "96px 24px", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, background: T.sectionBg, pointerEvents: "none" }} />
        <div style={{ maxWidth: 1000, margin: "0 auto", position: "relative", zIndex: 1 }}>
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} style={{ textAlign: "center", marginBottom: 68 }}>
            <p style={{ color: "var(--brand-400)", fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 12px" }}>How It Works</p>
            <h2 style={{ color: T.text, fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, margin: "0 0 14px", letterSpacing: "-1px" }}>Up and running in minutes</h2>
            <p style={{ color: T.textMuted, fontSize: 17, margin: 0 }}>Three steps to transform how your NGO operates.</p>
          </motion.div>

          <div className="steps-row" style={{ display: "flex", gap: 0, alignItems: "stretch" }}>
            {[
              { num: "01", icon: <CheckCircle2 size={28} color="#48A15E" />, title: "Create or Join", desc: "NGOs register and configure their organisation. Volunteers join instantly with an invite code." },
              { num: "02", icon: <Zap size={28} color="#48A15E" />, title: "AI Assigns Tasks", desc: "The matching engine analyses skills, location, and availability to place the right volunteer on every task." },
              { num: "03", icon: <TrendingUp size={28} color="#48A15E" />, title: "Track Your Impact", desc: "Real-time dashboards for both admins and volunteers — progress, hours, and outcomes, live." },
            ].map((step, i) => (
              <React.Fragment key={step.num}>
                <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.15 }}
                  style={{ flex: 1, textAlign: "center", padding: "44px 32px 40px", background: T.stepBg, border: `1px solid ${T.stepBorder}`, borderRadius: 20, boxShadow: isDark ? "none" : "0 2px 8px rgba(0,0,0,0.04)", position: "relative" }}>
                  <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 64, height: 64, borderRadius: "50%", background: "rgba(42,130,86,0.12)", marginBottom: 22, border: "2px solid rgba(72,161,94,0.2)" }}>
                    {step.icon}
                  </div>
                  <p style={{ color: "var(--brand-400)", fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", margin: "0 0 10px", textTransform: "uppercase" }}>{step.num}</p>
                  <h3 style={{ color: T.text, fontSize: 20, fontWeight: 700, margin: "0 0 12px" }}>{step.title}</h3>
                  <p style={{ color: T.textMuted, fontSize: 14, lineHeight: 1.68, margin: 0 }}>{step.desc}</p>
                </motion.div>
                {i < 2 && (
                  <div className="step-arrow" style={{ display: "flex", alignItems: "center", padding: "0 10px", flexShrink: 0 }}>
                    <ChevronRight size={22} color={isDark ? "rgba(255,255,255,0.18)" : "rgba(17,94,84,0.2)"} />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* ── IMPACT ───────────────────────────────────────────────────────────── */}
      <section id="impact" style={{ padding: "96px 24px" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} style={{ textAlign: "center", marginBottom: 60 }}>
            <p style={{ color: "var(--brand-400)", fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 12px" }}>Why It Works</p>
            <h2 style={{ color: T.text, fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, margin: "0 0 14px", letterSpacing: "-1px" }}>Built to scale with your mission</h2>
            <p style={{ color: T.textMuted, fontSize: 17, margin: 0, maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
              From local community groups to large-scale relief operations.
            </p>
          </motion.div>

          <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18, marginBottom: 56 }}>
            {[
              { value: "Zero Cost",   label: "To Get Started",    icon: <Star size={20} color="#48A15E" /> },
              { value: "< 5 min",     label: "Setup Time",        icon: <Clock size={20} color="#48A15E" /> },
              { value: "Real-time",   label: "Live Task Updates",  icon: <Zap size={20} color="#48A15E" /> },
              { value: "AI-Powered",  label: "Volunteer Matching", icon: <Users size={20} color="#48A15E" /> },
            ].map((stat, i) => (
              <motion.div key={stat.label} initial={{ opacity: 0, scale: 0.94 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
                style={{ background: T.statBg, border: `1px solid ${T.statBorder}`, borderRadius: 18, padding: "30px 20px", textAlign: "center" }}>
                <div style={{ display: "inline-flex", width: 46, height: 46, borderRadius: 13, background: T.iconBg, alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                  {stat.icon}
                </div>
                <p style={{ color: T.text, fontSize: 24, fontWeight: 800, margin: "0 0 5px", letterSpacing: "-0.5px" }}>{stat.value}</p>
                <p style={{ color: T.textMuted, fontSize: 13, margin: 0, fontWeight: 500 }}>{stat.label}</p>
              </motion.div>
            ))}
          </div>

          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="impact-statement"
            style={{ background: T.impactBg, border: `1px solid ${T.impactBorder}`, borderRadius: 22, padding: "44px 52px", display: "flex", gap: 48, alignItems: "center", boxShadow: isDark ? "none" : "0 4px 16px rgba(0,0,0,0.04)" }}>
            <div style={{ flex: 1 }}>
              <h3 style={{ color: T.text, fontSize: 24, fontWeight: 800, margin: "0 0 14px", letterSpacing: "-0.5px" }}>Why it matters</h3>
              <p style={{ color: T.textSub, fontSize: 15, lineHeight: 1.78, margin: 0 }}>
                Traditional NGO coordination relies on WhatsApp groups, spreadsheets, and manual calls. Sanchaalan Saathi replaces all of it with a single, intelligent platform — so your team spends less time on logistics and more time on the mission.
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, flexShrink: 0 }}>
              {["Eliminate coordination bottlenecks", "Match skills to tasks automatically", "Measure real-world outcomes"].map((pt) => (
                <div key={pt} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <CheckCircle2 size={16} color="#48A15E" />
                  <span style={{ color: isDark ? "rgba(255,255,255,0.72)" : "#374151", fontSize: 14, fontWeight: 500 }}>{pt}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── LOGIN ────────────────────────────────────────────────────────────── */}
      <section id="login" ref={loginRef} style={{ padding: "96px 24px 120px", position: "relative", overflowX: "hidden" }}>
        <div style={{ position: "absolute", top: "5%", left: "50%", transform: "translateX(-50%)", width: 700, height: 700, borderRadius: "50%", background: "radial-gradient(circle, rgba(42,130,86,0.09) 0%, transparent 70%)", filter: "blur(80px)", pointerEvents: "none" }} />
        <div style={{ maxWidth: 960, margin: "0 auto", position: "relative", zIndex: 1 }}>
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} style={{ textAlign: "center", marginBottom: 52 }}>
            <p style={{ color: "var(--brand-400)", fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 12px" }}>Get Started</p>
            <h2 style={{ color: T.text, fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, margin: "0 0 14px", letterSpacing: "-1px" }}>Choose your role</h2>
            <p style={{ color: T.textMuted, fontSize: 17, margin: 0 }}>One platform, two portals — each built for the way you work.</p>
          </motion.div>

          <div className="login-cols" style={{ display: "flex", gap: 20, alignItems: "stretch" }}>
            <LoginCard role="ngo_admin" router={router} isDark={isDark} />
            <div className="login-divider" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, flexShrink: 0, padding: "0 8px" }}>
              <div style={{ flex: 1, width: 1, background: isDark ? "rgba(255,255,255,0.06)" : "#E5E7EB" }} />
              <span style={{ color: isDark ? "rgba(255,255,255,0.2)" : "#9CA3AF", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em" }}>OR</span>
              <div style={{ flex: 1, width: 1, background: isDark ? "rgba(255,255,255,0.06)" : "#E5E7EB" }} />
            </div>
            <LoginCard role="volunteer" router={router} isDark={isDark} />
          </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: `1px solid ${T.footerBorder}`, padding: "52px 24px 32px" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <div className="footer-cols" style={{ display: "flex", gap: 64, marginBottom: 44, justifyContent: "space-between" }}>
            {/* Brand */}
            <div style={{ maxWidth: 300 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo/logo-icon.png" alt="Sanchaalan Saathi" style={{ height: 32, width: 32, objectFit: "contain" }} />
                <p style={{ color: isDark ? "#fff" : "var(--brand-600)", fontWeight: 700, fontSize: 15, margin: 0 }}>Sanchaalan Saathi</p>
              </div>
              <p style={{ color: T.footerText, fontSize: 14, lineHeight: 1.68, margin: 0 }}>
                AI-powered NGO coordination — helping organisations and volunteers work smarter together.
              </p>
            </div>

            {/* Platform links */}
            <div>
              <p style={{ color: T.textMuted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 16px" }}>Platform</p>
              {[["Features", "features"], ["How It Works", "how-it-works"], ["Impact", "impact"], ["Sign In", "login"]].map(([label, id]) => (
                <p key={label} style={{ color: T.footerText, fontSize: 14, margin: "0 0 10px", cursor: "pointer", transition: "color 0.2s" }}
                  onClick={() => scrollTo(id)}
                  onMouseEnter={(e) => { e.currentTarget.style.color = isDark ? "rgba(255,255,255,0.75)" : "#115E54"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = T.footerText; }}>
                  {label}
                </p>
              ))}
            </div>
          </div>

          {/* Bottom bar */}
          <div style={{ borderTop: `1px solid ${T.footerBorder}`, paddingTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <p style={{ color: T.footerMuted, fontSize: 13, margin: 0 }}>© 2025 Sanchaalan Saathi. All rights reserved.</p>
            <p style={{ color: T.footerMuted, fontSize: 13, margin: 0 }}>
              Built by{" "}
              <span style={{ color: isDark ? "rgba(255,255,255,0.55)" : "var(--brand-400)", fontWeight: 600 }}>Aishwary Srivastava</span>
            </p>
          </div>
        </div>
      </footer>

      <ChatbotWidget />

      {/* ── Styles ───────────────────────────────────────────────────────────── */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: 0% center; }
          100% { background-position: 200% center; }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        @keyframes float1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -40px) scale(1.05); }
          66% { transform: translate(-20px, 20px) scale(0.97); }
        }
        @keyframes float2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          40% { transform: translate(-40px, 30px) scale(1.08); }
          70% { transform: translate(20px, -20px) scale(0.95); }
        }
        @keyframes float3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          30% { transform: translate(25px, 35px) scale(1.04); }
          60% { transform: translate(-30px, -15px) scale(0.98); }
        }
        .orb {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          filter: blur(72px);
        }
        .orb-1 {
          width: 520px; height: 520px;
          top: -80px; left: 10%;
          background: radial-gradient(circle, rgba(42,130,86,0.18) 0%, transparent 70%);
          animation: float1 12s ease-in-out infinite;
        }
        .orb-2 {
          width: 400px; height: 400px;
          bottom: -60px; right: 8%;
          background: radial-gradient(circle, rgba(72,161,94,0.14) 0%, transparent 70%);
          animation: float2 15s ease-in-out infinite;
        }
        .orb-3 {
          width: 300px; height: 300px;
          top: 40%; left: 55%;
          background: radial-gradient(circle, rgba(17,94,84,0.1) 0%, transparent 70%);
          animation: float3 10s ease-in-out infinite;
        }
        .text-shimmer {
          background: linear-gradient(90deg, #48A15E, #95C78F, #48A15E);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: shimmer 3s linear infinite;
        }

        /* Desktop */
        @media (min-width: 768px) {
          .nav-links { display: flex !important; }
          .nav-cta { display: flex !important; }
          .hamburger { display: none !important; }
        }

        /* Tablet */
        @media (max-width: 767px) {
          .nav-links { display: none !important; }
          .nav-cta { display: none !important; }
          .hamburger { display: block !important; }
          .features-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .login-cols { flex-direction: column !important; }
          .login-divider { flex-direction: row !important; padding: 8px 0 !important; }
          .login-divider > div { flex: 1 !important; height: 1px !important; width: auto !important; }
          .steps-row { flex-direction: column !important; }
          .step-arrow { transform: rotate(90deg); justify-content: center; }
          .impact-statement { flex-direction: column !important; padding: 32px 28px !important; gap: 28px !important; }
          .footer-cols { flex-direction: column !important; gap: 36px !important; }
        }

        /* Mobile */
        @media (max-width: 480px) {
          .features-grid { grid-template-columns: 1fr !important; }
          .stats-grid { grid-template-columns: 1fr !important; }
          .hero-btns { flex-direction: column !important; align-items: stretch !important; }
          .hero-btns button { justify-content: center !important; }
          .footer-cols { gap: 28px !important; }
        }
      `}</style>
    </div>
  );
}
