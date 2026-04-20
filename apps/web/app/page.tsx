"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  Building2, Users, BarChart3, Zap, Shield, Globe,
  Menu, X, ArrowRight, MapPin, Bell, CheckCircle2,
  ChevronRight, Star, TrendingUp, Clock,
} from "lucide-react";
import { signInWithGoogle as firebaseSignIn } from "@/lib/firebase-auth";
import { api, friendlyError, googleAuthWithRetry } from "@/lib/ngo-api";
import { authErrorCode, authErrorMessage, isDismissedPopupError } from "@/lib/auth-errors";
import { useTheme } from "@/components/ui/ThemeProvider";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ChatbotWidget } from "@/components/ui/ChatbotWidget";

// ── Shared sign-in logic ──────────────────────────────────────────────────────

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

async function exchangeAndRedirect(
  firebaseUser: { email: string; uid: string },
  role: "ngo_admin" | "volunteer",
  inviteCode: string,
  router: ReturnType<typeof useRouter>,
  setError: (e: string) => void,
  setBusy: (b: boolean) => void,
): Promise<void> {
  if (BACKEND.includes("localhost") && typeof window !== "undefined" && location.protocol === "https:") {
    console.error("[auth] NEXT_PUBLIC_BACKEND_URL is not set — will fail on deployed frontend.");
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);
  try {
    const data = await googleAuthWithRetry(
      {
        email: firebaseUser.email,
        firebase_uid: firebaseUser.uid,
        role,
        invite_code: role === "volunteer" ? inviteCode.trim() || undefined : undefined,
      },
      { attempts: 3, timeoutMs: 30000 },
    );
    clearTimeout(timeoutId);
    localStorage.setItem("ngo_token", data.token);
    document.cookie = `ngo_token=${data.token}; path=/; max-age=${60 * 60 * 24}; SameSite=Strict${location.protocol === "https:" ? "; Secure" : ""}`;
    if (data.needs_ngo_setup) router.replace("/ngo/setup");
    else if (role === "ngo_admin") router.replace("/ngo/dashboard");
    else router.replace("/vol/dashboard");
  } catch (e: unknown) {
    clearTimeout(timeoutId);
    setError(friendlyError(e));
    setBusy(false);
  }
}

async function handleGoogleSignIn(
  role: "ngo_admin" | "volunteer",
  inviteCode: string,
  router: ReturnType<typeof useRouter>,
  setError: (e: string) => void,
  setBusy: (b: boolean) => void,
) {
  setError("");
  setBusy(true);
  let firebaseUser;
  try {
    firebaseUser = await firebaseSignIn();
  } catch (e: unknown) {
    const code = authErrorCode(e);
    if (isDismissedPopupError(e)) {
      // dismissed
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
  await exchangeAndRedirect(
    { email: firebaseUser.email!, uid: firebaseUser.uid },
    role, inviteCode, router, setError, setBusy,
  );
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

// ── Floating particle ─────────────────────────────────────────────────────────

function Particle({ x, y, size, delay, isDark }: { x: number; y: number; size: number; delay: number; isDark: boolean }) {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({
        x: (e.clientX - window.innerWidth / 2) / (25 + delay * 5),
        y: (e.clientY - window.innerHeight / 2) / (25 + delay * 5),
      });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [delay]);

  return (
    <motion.div
      style={{
        position: "absolute", left: `${x}%`, top: `${y}%`, width: size, height: size,
        borderRadius: "50%",
        background: isDark ? "rgba(72,161,94,0.12)" : "rgba(17,94,84,0.08)",
        pointerEvents: "none",
      }}
      animate={{ 
        x: mousePos.x,
        y: [
          mousePos.y + (Math.sin(Date.now() / 1000) * 10),
          mousePos.y + (Math.sin(Date.now() / 1000) * 10) - 18,
          mousePos.y + (Math.sin(Date.now() / 1000) * 10)
        ],
        opacity: [0.25, 0.6, 0.25] 
      }}
      transition={{ 
        x: { type: "spring", damping: 30, stiffness: 50 },
        y: { type: "spring", damping: 30, stiffness: 50 },
        opacity: { duration: 5 + delay, repeat: Infinity, delay, ease: "easeInOut" }
      }}
    />
  );
}

// ── Login card ────────────────────────────────────────────────────────────────

function LoginCard({ role, router, isDark }: { role: "ngo_admin" | "volunteer"; router: ReturnType<typeof useRouter>; isDark: boolean }) {
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [inviteCode, setInviteCode] = useState("");
  const [ngoName, setNgoName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lookupTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isNgo = role === "ngo_admin";

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      style={{
        background: isDark ? "rgba(255,255,255,0.06)" : "#ffffff",
        backdropFilter: isDark ? "blur(24px)" : "none",
        border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(17,94,84,0.12)"}`,
        borderRadius: 24,
        padding: "36px 32px",
        boxShadow: isDark
          ? "0 32px 72px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)"
          : "0 8px 40px rgba(17,94,84,0.1), 0 2px 8px rgba(0,0,0,0.04)",
        flex: 1,
        minWidth: 0,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12,
          background: isNgo ? "linear-gradient(135deg, #2A8256, #48A15E)" : "linear-gradient(135deg, #1a7a5e, #2A8256)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {isNgo ? <Building2 size={20} color="#fff" /> : <Users size={20} color="#fff" />}
        </div>
        <div>
          <h3 style={{ color: isDark ? "#fff" : "#111827", fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: "-0.3px" }}>
            {isNgo ? "NGO Admin Login" : "Volunteer Login"}
          </h3>
          <p style={{ color: isDark ? "rgba(255,255,255,0.4)" : "#6B7280", fontSize: 12, margin: 0 }}>
            {isNgo ? "Manage your organisation" : "Join & contribute"}
          </p>
        </div>
      </div>

      <div style={{ height: 1, background: isDark ? "rgba(255,255,255,0.07)" : "#E5E7EB", margin: "20px 0" }} />

      {/* Mode switcher */}
      <div style={{ display: "flex", background: isDark ? "rgba(0,0,0,0.2)" : "#F3F4F6", borderRadius: 10, padding: 3, marginBottom: 22, gap: 3 }}>
        {(["login", "signup"] as const).map((m) => (
          <button
            key={m}
            onClick={() => { setAuthMode(m); setError(""); }}
            style={{
              flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: "none", cursor: "pointer", transition: "all 0.2s",
              ...(authMode === m
                ? { background: isDark ? "rgba(255,255,255,0.12)" : "#ffffff", color: isDark ? "#fff" : "#111827", boxShadow: isDark ? "none" : "0 1px 4px rgba(0,0,0,0.08)" }
                : { background: "transparent", color: isDark ? "rgba(255,255,255,0.35)" : "#9CA3AF" }),
            }}
          >
            {m === "login" ? "Log In" : "Sign Up"}
          </button>
        ))}
      </div>

      {/* Invite code */}
      {!isNgo && (
        <div style={{ marginBottom: 18 }}>
          <label style={{ display: "block", color: isDark ? "rgba(255,255,255,0.55)" : "#6B7280", fontSize: 12, fontWeight: 600, marginBottom: 7, letterSpacing: "0.03em", textTransform: "uppercase" }}>
            Invite Code
          </label>
          <input
            type="text"
            placeholder="e.g. ABC12345"
            value={inviteCode}
            onChange={(e) => {
              const val = e.target.value.toUpperCase();
              setInviteCode(val);
              setError("");
              setNgoName("");
              if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);
              if (val.length >= 6) {
                lookupTimerRef.current = setTimeout(() => {
                  api.lookupNGO(val).then((d: { ngo_name: string }) => setNgoName(d.ngo_name)).catch(() => setNgoName(""));
                }, 300);
              }
            }}
            maxLength={16}
            style={{
              width: "100%", padding: "12px 15px", borderRadius: 11,
              border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "#E5E7EB"}`,
              background: isDark ? "rgba(255,255,255,0.07)" : "#F9FAFB",
              color: isDark ? "#fff" : "#111827", fontSize: 15,
              fontFamily: "'SF Mono', 'Fira Code', monospace", letterSpacing: "0.12em",
              outline: "none", boxSizing: "border-box", transition: "border-color 0.2s",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(72,161,94,0.5)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = isDark ? "rgba(255,255,255,0.12)" : "#E5E7EB"; }}
          />
          {ngoName ? (
            <p style={{ color: "#6ee7b7", fontSize: 11, margin: "6px 0 0", display: "flex", alignItems: "center", gap: 4 }}>
              <span>✓</span> Joining: <strong>{ngoName}</strong>
            </p>
          ) : (
            <p style={{ color: isDark ? "rgba(255,255,255,0.3)" : "#9CA3AF", fontSize: 11, margin: "6px 0 0" }}>
              Get this code from your NGO administrator.
            </p>
          )}
        </div>
      )}

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{
              background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.25)",
              borderRadius: 10, padding: "10px 14px", marginBottom: 14,
              color: "#fca5a5", fontSize: 13, textAlign: "center",
            }}
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Divider */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1, height: 1, background: isDark ? "rgba(255,255,255,0.08)" : "#E5E7EB" }} />
        <span style={{ color: isDark ? "rgba(255,255,255,0.25)" : "#9CA3AF", fontSize: 11, fontWeight: 500 }}>CONTINUE WITH</span>
        <div style={{ flex: 1, height: 1, background: isDark ? "rgba(255,255,255,0.08)" : "#E5E7EB" }} />
      </div>

      {/* Google button */}
      <motion.button
        onClick={() => {
          if (role === "volunteer" && !inviteCode.trim()) {
            setError("Enter your invite code before continuing.");
            return;
          }
          handleGoogleSignIn(role, inviteCode, router, setError, setBusy);
        }}
        disabled={busy}
        whileHover={{ scale: busy ? 1 : 1.015, boxShadow: busy ? undefined : "0 8px 24px rgba(0,0,0,0.2)" }}
        whileTap={{ scale: busy ? 1 : 0.975 }}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
          gap: 12, padding: "14px 0", borderRadius: 12,
          border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "#E5E7EB"}`,
          background: busy ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.95)",
          color: "#1a1a1a", fontSize: 15, fontWeight: 600,
          cursor: busy ? "not-allowed" : "pointer",
          boxShadow: "0 4px 20px rgba(0,0,0,0.15)", transition: "background 0.2s",
          letterSpacing: "-0.1px", marginBottom: 10,
        }}
      >
        {busy ? (
          <div style={{ display: "flex", gap: 5 }}>
            {[0, 1, 2].map((i) => (
              <motion.div key={i} animate={{ y: [0, -6, 0] }} transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.12 }}
                style={{ width: 6, height: 6, borderRadius: 3, background: "#6b7280" }} />
            ))}
          </div>
        ) : (
          <><GoogleIcon />{authMode === "login" ? "Log In with Google" : "Sign Up with Google"}</>
        )}
      </motion.button>

      <p style={{ color: isDark ? "rgba(255,255,255,0.22)" : "#9CA3AF", fontSize: 11.5, textAlign: "center", marginTop: 12, lineHeight: 1.6 }}>
        {isNgo
          ? authMode === "signup"
            ? "First time? You'll set up your NGO profile right after sign-in."
            : "Welcome back. Sign in to access your NGO dashboard."
          : authMode === "signup"
            ? "New volunteer accounts require an invite code from your NGO admin."
            : "Enter your invite code above, then sign in with Google."}
      </p>
    </motion.div>
  );
}

// ── Scroll utility ────────────────────────────────────────────────────────────

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

function readStoredRole(): "ngo_admin" | "volunteer" | null {
  try {
    const token = localStorage.getItem("ngo_token");
    if (!token) return null;
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      localStorage.removeItem("ngo_token");
      return null;
    }
    return payload.role ?? null;
  } catch {
    return null;
  }
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

  // ── Theme tokens ─────────────────────────────────────────────────────────────
  const T = {
    pageBg:        isDark ? "linear-gradient(180deg, #072921 0%, #0B3D36 15%, #0d4a42 35%, #0B3D36 60%, #072921 100%)" : "linear-gradient(180deg, #f5faf7 0%, #ffffff 40%, #f0f7f3 100%)",
    navBg:         isDark ? "rgba(7,41,33,0.92)"    : "rgba(255,255,255,0.95)",
    navBorder:     isDark ? "rgba(255,255,255,0.06)" : "rgba(17,94,84,0.1)",
    navLink:       isDark ? "rgba(255,255,255,0.6)"  : "#6B7280",
    mobileBg:      isDark ? "rgba(7,41,33,0.98)"    : "rgba(255,255,255,0.98)",
    mobileBorder:  isDark ? "rgba(255,255,255,0.06)" : "#E5E7EB",
    mobileLink:    isDark ? "rgba(255,255,255,0.7)"  : "#374151",
    mobileDivider: isDark ? "rgba(255,255,255,0.04)" : "#F3F4F6",
    text:          isDark ? "#fff"                   : "#111827",
    textSub:       isDark ? "rgba(255,255,255,0.55)" : "#6B7280",
    textMuted:     isDark ? "rgba(255,255,255,0.45)" : "#9CA3AF",
    textFaint:     isDark ? "rgba(255,255,255,0.3)"  : "#9CA3AF",
    cardBg:        isDark ? "rgba(255,255,255,0.05)" : "#ffffff",
    cardBorder:    isDark ? "rgba(255,255,255,0.08)" : "#E5E7EB",
    sectionOverlay:isDark ? "rgba(0,0,0,0.12)"      : "rgba(17,94,84,0.02)",
    stepBg:        isDark ? "rgba(255,255,255,0.04)" : "#ffffff",
    stepBorder:    isDark ? "rgba(255,255,255,0.07)" : "#E5E7EB",
    statBg:        isDark ? "rgba(42,130,86,0.1)"   : "rgba(42,130,86,0.06)",
    statBorder:    isDark ? "rgba(72,161,94,0.2)"   : "rgba(17,94,84,0.12)",
    impactBg:      isDark ? "rgba(255,255,255,0.04)" : "#ffffff",
    impactBorder:  isDark ? "rgba(255,255,255,0.08)" : "#E5E7EB",
    impactItem:    isDark ? "rgba(255,255,255,0.7)"  : "#374151",
    diffGenericBg:     isDark ? "rgba(255,255,255,0.03)" : "#ffffff",
    diffGenericBorder: isDark ? "rgba(255,255,255,0.06)" : "#E5E7EB",
    diffGenericLabel:  isDark ? "rgba(255,255,255,0.3)"  : "#9CA3AF",
    diffGenericItem:   isDark ? "rgba(255,255,255,0.35)" : "#9CA3AF",
    ctaBg:         isDark ? "rgba(42,130,86,0.1)"   : "rgba(42,130,86,0.06)",
    ctaBorder:     isDark ? "rgba(72,161,94,0.2)"   : "rgba(17,94,84,0.12)",
    footerBorder:  isDark ? "rgba(255,255,255,0.06)" : "#E5E7EB",
    footerText:    isDark ? "rgba(255,255,255,0.35)" : "#6B7280",
    footerMuted:   isDark ? "rgba(255,255,255,0.2)"  : "#9CA3AF",
    loginDivider:  isDark ? "rgba(255,255,255,0.06)" : "#E5E7EB",
    loginOR:       isDark ? "rgba(255,255,255,0.2)"  : "#9CA3AF",
    iconBg:        isDark ? "rgba(72,161,94,0.12)"   : "rgba(42,130,86,0.08)",
  };

  if (redirecting) {
    return (
      <div style={{ minHeight: "100vh", background: T.pageBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {[0, 1, 2].map((i) => (
            <motion.div key={i} animate={{ y: [0, -10, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
              style={{ width: 8, height: 8, borderRadius: 4, background: "#48A15E" }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: T.pageBg, fontFamily: "system-ui, -apple-system, sans-serif", overflowX: "hidden" }}>

      {/* ── 1. NAVBAR ────────────────────────────────────────────────────────── */}
      <nav
        aria-label="Main navigation"
        style={{
          position: "sticky", top: 0, zIndex: 100,
          background: scrolled ? T.navBg : "transparent",
          backdropFilter: scrolled ? "blur(20px)" : "none",
          borderBottom: scrolled ? `1px solid ${T.navBorder}` : "1px solid transparent",
          transition: "all 0.3s ease",
          padding: "0 24px",
        }}
      >
        <div style={{ maxWidth: 1120, margin: "0 auto", display: "flex", alignItems: "center", height: 64 }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "0 0 auto", marginRight: 48 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo/logo-icon.png" alt="Sanchaalan Saathi" style={{ height: 34, width: 34, objectFit: "contain" }} />
            <div>
              <p style={{ color: isDark ? "#fff" : "#115E54", fontWeight: 700, fontSize: 15, margin: 0, letterSpacing: "-0.3px" }}>Sanchaalan Saathi</p>
              <p style={{ color: T.textMuted, fontSize: 10, margin: 0 }}>NGO Coordination Platform</p>
            </div>
          </div>

          {/* Desktop nav links */}
          <div className="nav-links" style={{ display: "flex", gap: 32, flex: 1 }}>
            {[["Home", "top"], ["Features", "features"], ["How It Works", "how-it-works"], ["Impact", "impact"], ["Login", "login"]].map(([label, id]) => (
              <button key={id} onClick={() => scrollTo(id)}
                style={{ background: "none", border: "none", color: T.navLink, fontSize: 14, fontWeight: 500, cursor: "pointer", padding: "4px 0", transition: "color 0.2s", fontFamily: "inherit" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = isDark ? "#fff" : "#115E54"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = T.navLink; }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Right side: ThemeToggle + CTA */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            <ThemeToggle size="sm" />
            <button
              className="nav-cta"
              onClick={() => scrollTo("login")}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "9px 20px", borderRadius: 10,
                background: "linear-gradient(135deg, #2A8256, #48A15E)",
                color: "#fff", fontSize: 14, fontWeight: 600,
                border: "none", cursor: "pointer", transition: "opacity 0.2s",
                boxShadow: "0 4px 14px rgba(42,130,86,0.35)", fontFamily: "inherit",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.88"; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
            >
              Get Started <ArrowRight size={14} />
            </button>
          </div>

          {/* Hamburger */}
          <button
            className="hamburger"
            aria-label="Toggle menu"
            onClick={() => setMenuOpen(!menuOpen)}
            style={{ display: "none", background: "none", border: "none", color: isDark ? "#fff" : "#115E54", cursor: "pointer", padding: 4, marginLeft: 12 }}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              style={{ overflow: "hidden", background: T.mobileBg, borderTop: `1px solid ${T.mobileBorder}` }}
            >
              <div style={{ padding: "12px 24px 20px", display: "flex", flexDirection: "column", gap: 4 }}>
                {[["Home", "top"], ["Features", "features"], ["How It Works", "how-it-works"], ["Impact", "impact"], ["Login", "login"]].map(([label, id]) => (
                  <button key={id}
                    onClick={() => { scrollTo(id); setMenuOpen(false); }}
                    style={{ background: "none", border: "none", color: T.mobileLink, fontSize: 15, fontWeight: 500, cursor: "pointer", padding: "10px 0", textAlign: "left", fontFamily: "inherit", borderBottom: `1px solid ${T.mobileDivider}` }}
                  >
                    {label}
                  </button>
                ))}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
                  <ThemeToggle size="sm" />
                  <button
                    onClick={() => { scrollTo("login"); setMenuOpen(false); }}
                    style={{ flex: 1, padding: "12px 0", borderRadius: 10, background: "linear-gradient(135deg, #2A8256, #48A15E)", color: "#fff", fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer", fontFamily: "inherit" }}
                  >
                    Get Started
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* ── 2. HERO ──────────────────────────────────────────────────────────── */}
      <section id="top" style={{ position: "relative", padding: "100px 24px 120px", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, opacity: 0.03, backgroundImage: "linear-gradient(rgba(17,94,84,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(17,94,84,0.5) 1px, transparent 1px)", backgroundSize: "48px 48px", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: "5%", left: "15%", width: 500, height: 500, borderRadius: "50%", background: isDark ? "radial-gradient(circle, rgba(42,130,86,0.18) 0%, transparent 70%)" : "radial-gradient(circle, rgba(42,130,86,0.1) 0%, transparent 70%)", filter: "blur(60px)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: "0%", right: "5%", width: 400, height: 400, borderRadius: "50%", background: isDark ? "radial-gradient(circle, rgba(72,161,94,0.12) 0%, transparent 70%)" : "radial-gradient(circle, rgba(72,161,94,0.08) 0%, transparent 70%)", filter: "blur(60px)", pointerEvents: "none" }} />
        {[{ x: 8, y: 15, size: 7, delay: 0 }, { x: 80, y: 10, size: 10, delay: 1.2 }, { x: 92, y: 55, size: 5, delay: 2.1 }, { x: 5, y: 70, size: 8, delay: 0.7 }, { x: 55, y: 90, size: 5, delay: 1.8 }]
          .map((p, i) => <Particle key={i} {...p} isDark={isDark} />)}

        <div style={{ maxWidth: 800, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(42,130,86,0.15)", border: "1px solid rgba(72,161,94,0.3)", borderRadius: 100, padding: "6px 16px", marginBottom: 28 }}
          >
            <Star size={13} color="#48A15E" fill="#48A15E" />
            <span className="text-shimmer" style={{ fontSize: 13, fontWeight: 600 }}>AI-Powered NGO Coordination</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            style={{ color: T.text, fontSize: "clamp(38px, 7vw, 68px)", fontWeight: 900, margin: "0 0 20px", lineHeight: 1.08, letterSpacing: "-2px" }}
          >
            Coordinate NGOs.{" "}
            <span style={{ background: "linear-gradient(135deg, #48A15E, #95C78F)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Amplify Impact.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            style={{ color: T.textSub, fontSize: "clamp(16px, 2.5vw, 20px)", lineHeight: 1.65, margin: "0 auto 44px", maxWidth: 580 }}
          >
            Sanchaalan Saathi brings AI-powered volunteer matching, real-time task coordination, and deep analytics to every NGO — at zero cost.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}
          >
            <button
              onClick={() => scrollTo("login")}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "14px 28px", borderRadius: 12,
                background: "linear-gradient(135deg, #2A8256, #48A15E)",
                color: "#fff", fontSize: 16, fontWeight: 700,
                border: "none", cursor: "pointer",
                boxShadow: "0 8px 28px rgba(42,130,86,0.45)",
                transition: "transform 0.2s, box-shadow 0.2s", fontFamily: "inherit",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 12px 36px rgba(42,130,86,0.55)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 8px 28px rgba(42,130,86,0.45)"; }}
            >
              <Users size={18} /> Join as Volunteer
            </button>
            <button
              onClick={() => scrollTo("login")}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "14px 28px", borderRadius: 12,
                background: isDark ? "rgba(255,255,255,0.08)" : "rgba(17,94,84,0.06)",
                border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "rgba(17,94,84,0.2)"}`,
                color: isDark ? "#fff" : "#115E54", fontSize: 16, fontWeight: 700,
                cursor: "pointer", transition: "background 0.2s", fontFamily: "inherit",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.14)" : "rgba(17,94,84,0.1)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.08)" : "rgba(17,94,84,0.06)"; }}
            >
              <Building2 size={18} /> Register as NGO
            </button>
          </motion.div>
        </div>
      </section>

      {/* ── 3. FEATURES ──────────────────────────────────────────────────────── */}
      <section id="features" style={{ padding: "96px 24px", position: "relative" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} style={{ textAlign: "center", marginBottom: 64 }}>
            <p style={{ color: "#48A15E", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 12px" }}>Platform Features</p>
            <h2 style={{ color: T.text, fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, margin: "0 0 16px", letterSpacing: "-1px" }}>Everything your NGO needs</h2>
            <p style={{ color: T.textMuted, fontSize: 17, margin: 0, maxWidth: 500, marginLeft: "auto", marginRight: "auto" }}>
              Built for both NGO administrators and volunteers — one platform, every workflow.
            </p>
          </motion.div>

          <div className="features-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {[
              { icon: <Zap size={22} color="#48A15E" />, title: "AI Volunteer Matching", desc: "Automatically assign the right volunteer to every task based on skills, location, and availability.", tag: "NGO Admin" },
              { icon: <BarChart3 size={22} color="#48A15E" />, title: "Real-time Analytics", desc: "Track volunteer hours, task completion rates, and mission impact with live dashboards.", tag: "NGO Admin" },
              { icon: <Shield size={22} color="#48A15E" />, title: "Invite-only Onboarding", desc: "Control who joins your organisation with unique invite codes — no open signups.", tag: "NGO Admin" },
              { icon: <MapPin size={22} color="#48A15E" />, title: "Skill-based Task Feed", desc: "Volunteers see only tasks that match their skills and availability — zero noise.", tag: "Volunteer" },
              { icon: <Bell size={22} color="#48A15E" />, title: "Instant Notifications", desc: "Get assigned to tasks the moment they're created. Never miss an opportunity to help.", tag: "Volunteer" },
              { icon: <TrendingUp size={22} color="#48A15E" />, title: "Impact Tracking", desc: "See your personal contribution stats, hours volunteered, and tasks completed over time.", tag: "Volunteer" },
            ].map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                style={{ background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 18, padding: "28px 24px", transition: "border-color 0.2s, transform 0.2s, box-shadow 0.2s", boxShadow: isDark ? "none" : "0 2px 8px rgba(0,0,0,0.04)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(72,161,94,0.35)"; (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 12px 32px rgba(42,130,86,0.12)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = T.cardBorder; (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow = isDark ? "none" : "0 2px 8px rgba(0,0,0,0.04)"; }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: T.iconBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {f.icon}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: f.tag === "NGO Admin" ? "#48A15E" : "#2A8256", background: f.tag === "NGO Admin" ? "rgba(42,130,86,0.12)" : "rgba(42,130,86,0.08)", padding: "3px 10px", borderRadius: 100 }}>
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

      {/* ── 4. HOW IT WORKS ──────────────────────────────────────────────────── */}
      <section id="how-it-works" style={{ padding: "96px 24px", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, background: T.sectionOverlay, pointerEvents: "none" }} />
        <div style={{ maxWidth: 1000, margin: "0 auto", position: "relative", zIndex: 1 }}>
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} style={{ textAlign: "center", marginBottom: 72 }}>
            <p style={{ color: "#48A15E", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 12px" }}>How It Works</p>
            <h2 style={{ color: T.text, fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, margin: "0 0 16px", letterSpacing: "-1px" }}>Up and running in minutes</h2>
            <p style={{ color: T.textMuted, fontSize: 17, margin: 0 }}>Three simple steps to transform how your NGO operates.</p>
          </motion.div>

          <div className="steps-row" style={{ display: "flex", gap: 0, alignItems: "stretch" }}>
            {[
              { num: "01", icon: <CheckCircle2 size={28} color="#48A15E" />, title: "Create or Join", desc: "NGOs register and set up their organisation. Volunteers join with an invite code from their NGO admin." },
              { num: "02", icon: <Zap size={28} color="#48A15E" />, title: "AI Assigns Tasks", desc: "Our matching engine analyses skills, location, and availability to assign the best volunteer to every task instantly." },
              { num: "03", icon: <TrendingUp size={28} color="#48A15E" />, title: "Track Your Impact", desc: "Both NGO admins and volunteers get real-time dashboards showing progress, hours, and mission outcomes." },
            ].map((step, i) => (
              <React.Fragment key={step.num}>
                <motion.div
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.15 }}
                  style={{ flex: 1, textAlign: "center", padding: "40px 32px", background: T.stepBg, border: `1px solid ${T.stepBorder}`, borderRadius: 20, boxShadow: isDark ? "none" : "0 2px 8px rgba(0,0,0,0.04)" }}
                >
                  <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 60, height: 60, borderRadius: "50%", background: "rgba(42,130,86,0.12)", marginBottom: 20 }}>
                    {step.icon}
                  </div>
                  <p style={{ color: "#48A15E", fontSize: 12, fontWeight: 800, letterSpacing: "0.1em", margin: "0 0 10px" }}>{step.num}</p>
                  <h3 style={{ color: T.text, fontSize: 20, fontWeight: 700, margin: "0 0 12px" }}>{step.title}</h3>
                  <p style={{ color: T.textMuted, fontSize: 14, lineHeight: 1.65, margin: 0 }}>{step.desc}</p>
                </motion.div>
                {i < 2 && (
                  <div className="step-arrow" style={{ display: "flex", alignItems: "center", padding: "0 12px", flexShrink: 0 }}>
                    <ChevronRight size={24} color={isDark ? "rgba(255,255,255,0.2)" : "rgba(17,94,84,0.2)"} />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* ── 5. IMPACT ────────────────────────────────────────────────────────── */}
      <section id="impact" style={{ padding: "96px 24px" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} style={{ textAlign: "center", marginBottom: 64 }}>
            <p style={{ color: "#48A15E", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 12px" }}>Real-World Impact</p>
            <h2 style={{ color: T.text, fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, margin: "0 0 16px", letterSpacing: "-1px" }}>Built to scale with your mission</h2>
            <p style={{ color: T.textMuted, fontSize: 17, margin: 0, maxWidth: 500, marginLeft: "auto", marginRight: "auto" }}>
              From local community groups to large-scale relief operations — Sanchaalan Saathi handles it all.
            </p>
          </motion.div>

          <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20, marginBottom: 60 }}>
            {[
              { value: "1,000+", label: "Volunteers Ready",  icon: <Users size={20} color="#48A15E" /> },
              { value: "Zero Cost", label: "To Get Started", icon: <Star size={20} color="#48A15E" /> },
              { value: "Real-time", label: "Task Updates",   icon: <Clock size={20} color="#48A15E" /> },
              { value: "AI-First", label: "Matching Engine", icon: <Zap size={20} color="#48A15E" /> },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                style={{ background: T.statBg, border: `1px solid ${T.statBorder}`, borderRadius: 18, padding: "28px 20px", textAlign: "center" }}
              >
                <div style={{ display: "inline-flex", width: 44, height: 44, borderRadius: 12, background: T.iconBg, alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                  {stat.icon}
                </div>
                <p style={{ color: T.text, fontSize: 26, fontWeight: 800, margin: "0 0 4px", letterSpacing: "-0.5px" }}>{stat.value}</p>
                <p style={{ color: T.textMuted, fontSize: 13, margin: 0, fontWeight: 500 }}>{stat.label}</p>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            style={{ background: T.impactBg, border: `1px solid ${T.impactBorder}`, borderRadius: 20, padding: "40px 48px", display: "flex", gap: 40, alignItems: "center", boxShadow: isDark ? "none" : "0 2px 8px rgba(0,0,0,0.04)" }}
            className="impact-statement"
          >
            <div style={{ flex: 1 }}>
              <h3 style={{ color: T.text, fontSize: 24, fontWeight: 800, margin: "0 0 12px", letterSpacing: "-0.5px" }}>Why it matters</h3>
              <p style={{ color: T.textSub, fontSize: 15, lineHeight: 1.75, margin: 0 }}>
                Traditional NGO coordination relies on WhatsApp groups, spreadsheets, and manual calls. Sanchaalan Saathi replaces all of it with a single, intelligent platform — so your team spends less time on logistics and more time on the mission that matters.
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, flexShrink: 0 }}>
              {["Eliminate coordination bottlenecks", "Match skills to tasks automatically", "Measure real-world outcomes"].map((pt) => (
                <div key={pt} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <CheckCircle2 size={16} color="#48A15E" />
                  <span style={{ color: T.impactItem, fontSize: 14 }}>{pt}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── 6. DIFFERENTIATION ───────────────────────────────────────────────── */}
      <section style={{ padding: "96px 24px", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, background: T.sectionOverlay, pointerEvents: "none" }} />
        <div style={{ maxWidth: 1120, margin: "0 auto", position: "relative", zIndex: 1 }}>
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} style={{ textAlign: "center", marginBottom: 64 }}>
            <p style={{ color: "#48A15E", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 12px" }}>Why Sanchaalan Saathi</p>
            <h2 style={{ color: T.text, fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, margin: "0 0 16px", letterSpacing: "-1px" }}>Not just another tool</h2>
            <p style={{ color: T.textMuted, fontSize: 17, margin: 0, maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
              We built specifically for the NGO sector — not adapted from a generic SaaS template.
            </p>
          </motion.div>

          <div className="diff-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              style={{ background: T.diffGenericBg, border: `1px solid ${T.diffGenericBorder}`, borderRadius: 20, padding: "36px 32px", boxShadow: isDark ? "none" : "0 2px 8px rgba(0,0,0,0.04)" }}
            >
              <p style={{ color: T.diffGenericLabel, fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 24px" }}>Generic Tools</p>
              {["Manual volunteer assignment via spreadsheets", "No real-time coordination", "Paid plans with per-seat pricing", "No NGO-specific workflows", "No impact measurement"].map((item) => (
                <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
                  <X size={15} color="rgba(248,113,113,0.7)" style={{ flexShrink: 0, marginTop: 2 }} />
                  <span style={{ color: T.diffGenericItem, fontSize: 14, lineHeight: 1.5 }}>{item}</span>
                </div>
              ))}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              style={{ background: isDark ? "rgba(42,130,86,0.08)" : "rgba(42,130,86,0.05)", border: `1px solid ${isDark ? "rgba(72,161,94,0.25)" : "rgba(42,130,86,0.2)"}`, borderRadius: 20, padding: "36px 32px" }}
            >
              <p style={{ color: "#48A15E", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 24px" }}>Sanchaalan Saathi</p>
              {["AI-powered matching — right person, right task", "Live dashboards with real-time updates", "Completely free — built for social impact", "Purpose-built for NGO multi-tenancy", "Measurable outcomes with analytics"].map((item) => (
                <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
                  <CheckCircle2 size={15} color="#48A15E" style={{ flexShrink: 0, marginTop: 2 }} />
                  <span style={{ color: isDark ? "rgba(255,255,255,0.75)" : "#374151", fontSize: 14, lineHeight: 1.5 }}>{item}</span>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── 7. LOGIN ─────────────────────────────────────────────────────────── */}
      <section id="login" ref={loginRef} style={{ padding: "96px 24px 112px", position: "relative" }}>
        <div style={{ position: "absolute", top: "10%", left: "50%", transform: "translateX(-50%)", width: 700, height: 700, borderRadius: "50%", background: "radial-gradient(circle, rgba(42,130,86,0.1) 0%, transparent 70%)", filter: "blur(80px)", pointerEvents: "none" }} />
        <div style={{ maxWidth: 960, margin: "0 auto", position: "relative", zIndex: 1 }}>
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} style={{ textAlign: "center", marginBottom: 56 }}>
            <p style={{ color: "#48A15E", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 12px" }}>Get Started</p>
            <h2 style={{ color: T.text, fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, margin: "0 0 16px", letterSpacing: "-1px" }}>Choose your role and sign in</h2>
            <p style={{ color: T.textMuted, fontSize: 17, margin: 0 }}>One platform — two portals. Each built for the way you work.</p>
          </motion.div>

          <div className="login-cols" style={{ display: "flex", gap: 20, alignItems: "stretch" }}>
            <LoginCard role="ngo_admin" router={router} isDark={isDark} />
            <div className="login-divider" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, flexShrink: 0, padding: "0 8px" }}>
              <div style={{ flex: 1, width: 1, background: T.loginDivider }} />
              <span style={{ color: T.loginOR, fontSize: 11, fontWeight: 600, letterSpacing: "0.05em" }}>OR</span>
              <div style={{ flex: 1, width: 1, background: T.loginDivider }} />
            </div>
            <LoginCard role="volunteer" router={router} isDark={isDark} />
          </div>
        </div>
      </section>

      {/* ── 8. PRE-FOOTER CTA ────────────────────────────────────────────────── */}
      <section style={{ padding: "80px 24px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            style={{ textAlign: "center", background: T.ctaBg, border: `1px solid ${T.ctaBorder}`, borderRadius: 24, padding: "60px 48px" }}
          >
            <Globe size={40} color="#48A15E" style={{ marginBottom: 20 }} />
            <h2 style={{ color: T.text, fontSize: "clamp(24px, 3.5vw, 38px)", fontWeight: 800, margin: "0 0 16px", letterSpacing: "-0.8px" }}>
              Be part of the change
            </h2>
            <p style={{ color: T.textSub, fontSize: 17, lineHeight: 1.7, margin: "0 0 36px", maxWidth: 460, marginLeft: "auto", marginRight: "auto" }}>
              Join thousands of NGOs and volunteers already using Sanchaalan Saathi to coordinate relief, build communities, and measure impact.
            </p>
            <button
              onClick={() => scrollTo("login")}
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "14px 32px", borderRadius: 12,
                background: "linear-gradient(135deg, #2A8256, #48A15E)",
                color: "#fff", fontSize: 16, fontWeight: 700,
                border: "none", cursor: "pointer",
                boxShadow: "0 8px 28px rgba(42,130,86,0.4)",
                transition: "transform 0.2s, box-shadow 0.2s", fontFamily: "inherit",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
            >
              Get Started for Free <ArrowRight size={16} />
            </button>
          </motion.div>
        </div>
      </section>

      {/* ── 9. FOOTER ────────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: `1px solid ${T.footerBorder}`, padding: "56px 24px 32px" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <div className="footer-grid" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 48, marginBottom: 48 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo/logo-icon.png" alt="Sanchaalan Saathi" style={{ height: 32, width: 32, objectFit: "contain" }} />
                <p style={{ color: isDark ? "#fff" : "#115E54", fontWeight: 700, fontSize: 15, margin: 0 }}>Sanchaalan Saathi</p>
              </div>
              <p style={{ color: T.footerText, fontSize: 14, lineHeight: 1.65, margin: "0 0 20px", maxWidth: 260 }}>
                AI-powered NGO coordination platform — helping organisations and volunteers work smarter together.
              </p>
              <div style={{ display: "flex", gap: 12 }}>
                {["Twitter", "LinkedIn", "GitHub"].map((s) => (
                  <div key={s} style={{ width: 34, height: 34, borderRadius: 8, background: isDark ? "rgba(255,255,255,0.07)" : "rgba(17,94,84,0.07)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    <Globe size={14} color={T.footerText} />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p style={{ color: T.textFaint, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 16px" }}>Platform</p>
              {["Features", "How It Works", "Impact", "Get Started"].map((l) => (
                <p key={l} style={{ color: T.footerText, fontSize: 14, margin: "0 0 10px", cursor: "pointer" }}
                  onClick={() => scrollTo(l === "Get Started" ? "login" : l.toLowerCase().replace(/ /g, "-"))}
                  onMouseEnter={(e) => { e.currentTarget.style.color = isDark ? "rgba(255,255,255,0.75)" : "#115E54"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = T.footerText; }}
                >{l}</p>
              ))}
            </div>

            <div>
              <p style={{ color: T.textFaint, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 16px" }}>For</p>
              {["NGO Admins", "Volunteers", "Community Groups", "Relief Organisations"].map((l) => (
                <p key={l} style={{ color: T.footerText, fontSize: 14, margin: "0 0 10px" }}>{l}</p>
              ))}
            </div>

            <div>
              <p style={{ color: T.textFaint, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 16px" }}>Contact</p>
              <p style={{ color: T.footerText, fontSize: 14, margin: "0 0 10px" }}>hello@sanchaalan.org</p>
              <p style={{ color: T.footerText, fontSize: 14, margin: "0 0 10px" }}>India</p>
              <p style={{ color: T.footerText, fontSize: 14, margin: 0 }}>support@sanchaalan.org</p>
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${T.footerBorder}`, paddingTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <p style={{ color: T.footerMuted, fontSize: 13, margin: 0 }}>© 2025 Sanchaalan Saathi. Built for NGOs. All rights reserved.</p>
            <div style={{ display: "flex", gap: 24 }}>
              {["Privacy Policy", "Terms of Service"].map((l) => (
                <p key={l} style={{ color: T.footerMuted, fontSize: 13, margin: 0, cursor: "pointer" }}>{l}</p>
              ))}
            </div>
          </div>
        </div>
      </footer>

      {/* ── Chatbot ───────────────────────────────────────────────────────────── */}
      <ChatbotWidget />

      {/* ── Responsive styles ─────────────────────────────────────────────────── */}
      <style>{`
        @media (min-width: 768px) {
          .nav-links { display: flex !important; }
          .nav-cta { display: flex !important; }
          .hamburger { display: none !important; }
        }
        @media (max-width: 767px) {
          .nav-links { display: none !important; }
          .nav-cta { display: none !important; }
          .hamburger { display: block !important; }
          .features-grid { grid-template-columns: 1fr !important; }
          .stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .login-cols { flex-direction: column !important; }
          .login-divider { flex-direction: row !important; padding: 8px 0 !important; }
          .login-divider > div { flex: unset !important; width: auto !important; flex: 1 !important; height: 1px !important; }
          .steps-row { flex-direction: column !important; }
          .step-arrow { transform: rotate(90deg); }
          .footer-grid { grid-template-columns: 1fr 1fr !important; }
          .diff-grid { grid-template-columns: 1fr !important; }
          .impact-statement { flex-direction: column !important; padding: 32px 24px !important; }
        }
        @media (max-width: 480px) {
          .stats-grid { grid-template-columns: 1fr !important; }
          .footer-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
