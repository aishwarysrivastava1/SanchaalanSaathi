"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { useNGOAuth } from "@/lib/ngo-auth";

// ── Icons ────────────────────────────────────────────────────────────────────

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M17.64 9.2045c0-.638-.0573-1.252-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.6149z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.4673-.8059 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.8591-3.0477.8591-2.3441 0-4.3282-1.5836-5.036-3.7104H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18z" fill="#34A853"/>
    <path d="M3.964 10.71C3.7841 10.17 3.6818 9.5932 3.6818 9c0-.5932.1023-1.17.2822-1.71V4.9582H.9574C.3477 6.1732 0 7.5477 0 9c0 1.4523.3477 2.8268.9574 4.0418L3.964 10.71z" fill="#FBBC05"/>
    <path d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.4259 0 9 0 5.4818 0 2.4382 2.0168.9574 4.9582L3.964 7.29C4.6718 5.1632 6.6559 3.5795 9 3.5795z" fill="#EA4335"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="7" cy="7" r="7" fill="rgba(72,161,94,0.2)"/>
    <path d="M4 7l2 2 4-4" stroke="#48A15E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// ── Feature content per role ─────────────────────────────────────────────────

const FEATURES = {
  ngo_admin: {
    headline: "Coordinate your NGO\nwith AI-powered tools",
    sub: "Manage volunteers, allocate resources, and get real-time analytics — all in one place.",
    bullets: [
      "AI-matched volunteer assignments",
      "Real-time task & resource tracking",
      "Analytics dashboard with insights",
      "Invite volunteers with a single code",
    ],
    stat1: { value: "AI-Powered", label: "Matching Engine" },
    stat2: { value: "Real-time", label: "Coordination" },
    stat3: { value: "Zero Cost", label: "To Get Started" },
  },
  volunteer: {
    headline: "Make a difference\nwhere it matters most",
    sub: "Accept tasks matched to your skills, track your impact, and stay connected with your NGO.",
    bullets: [
      "Tasks matched to your skills",
      "Flexible availability scheduling",
      "Instant assignment notifications",
      "Track your volunteer impact",
    ],
    stat1: { value: "Skill-based", label: "Task Matching" },
    stat2: { value: "Flexible", label: "Scheduling" },
    stat3: { value: "Instant", label: "Notifications" },
  },
};

// ── Floating particle ────────────────────────────────────────────────────────

function Particle({ x, y, size, delay }: { x: number; y: number; size: number; delay: number }) {
  return (
    <motion.div
      style={{ position: "absolute", left: `${x}%`, top: `${y}%`, width: size, height: size, borderRadius: "50%", background: "rgba(72,161,94,0.15)", pointerEvents: "none" }}
      animate={{ y: [0, -20, 0], opacity: [0.3, 0.7, 0.3] }}
      transition={{ duration: 4 + delay, repeat: Infinity, delay, ease: "easeInOut" }}
    />
  );
}

const PARTICLES = [
  { x: 10, y: 20, size: 6, delay: 0 },
  { x: 75, y: 10, size: 10, delay: 1 },
  { x: 85, y: 60, size: 5, delay: 2 },
  { x: 20, y: 75, size: 8, delay: 0.5 },
  { x: 50, y: 85, size: 4, delay: 1.5 },
  { x: 90, y: 30, size: 7, delay: 2.5 },
  { x: 35, y: 15, size: 5, delay: 0.8 },
];

// ── Main component ───────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, loginWithGoogle } = useNGOAuth();
  const [role, setRole]             = useState<"ngo_admin" | "volunteer">("ngo_admin");
  const [authMode, setAuthMode]     = useState<"login" | "signup">("login");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy]             = useState(false);
  const [error, setError]           = useState("");

  useEffect(() => {
    if (loading || !user) return;
    if (user.needs_ngo_setup) router.replace("/ngo/setup");
    else if (user.role === "ngo_admin") router.replace("/ngo/dashboard");
    else router.replace("/vol/dashboard");
  }, [user, loading, router]);

  const handleGoogle = async () => {
    if (role === "volunteer" && !inviteCode.trim()) {
      setError("Enter your invite code before continuing.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const u = await loginWithGoogle(role, role === "volunteer" ? inviteCode.trim() : undefined);
      if (u.needs_ngo_setup) router.replace("/ngo/setup");
      else if (u.role === "ngo_admin") router.replace("/ngo/dashboard");
      else router.replace("/vol/dashboard");
    } catch (e: unknown) {
      setError((e as Error).message || "Sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const switchRole = (newRole: "ngo_admin" | "volunteer") => {
    setRole(newRole);
    setError("");
    setInviteCode("");
  };

  if (loading || user) {
    return (
      <div style={{ minHeight: "100vh", background: "#0B3D36", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {[0, 1, 2].map((i) => (
            <motion.div key={i} animate={{ y: [0, -10, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
              style={{ width: 8, height: 8, borderRadius: 4, background: "#48A15E" }} />
          ))}
        </div>
      </div>
    );
  }

  const feat = FEATURES[role];

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: "#0B3D36", fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* ── Left: Brand panel ─────────────────────────────── */}
      <div
        style={{
          flex: "0 0 52%",
          display: "none",
          position: "relative",
          overflow: "hidden",
          background: "linear-gradient(145deg, #0d4a42 0%, #0B3D36 40%, #072921 100%)",
          borderRight: "1px solid rgba(255,255,255,0.06)",
        }}
        className="brand-panel"
      >
        {/* Decorative grid */}
        <div style={{
          position: "absolute", inset: 0, opacity: 0.04,
          backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }} />

        {/* Glow orbs */}
        <div style={{ position: "absolute", top: "-10%", left: "20%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(42,130,86,0.2) 0%, transparent 70%)", filter: "blur(40px)" }} />
        <div style={{ position: "absolute", bottom: "10%", right: "-10%", width: 350, height: 350, borderRadius: "50%", background: "radial-gradient(circle, rgba(72,161,94,0.15) 0%, transparent 70%)", filter: "blur(40px)" }} />

        {/* Particles */}
        {PARTICLES.map((p, i) => <Particle key={i} {...p} />)}

        {/* Content */}
        <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "60px 56px" }}>

          {/* Logo + wordmark */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}
            style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 64 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo/logo-icon.png" alt="SynapseAI" style={{ height: 40, width: 40, objectFit: "contain" }} />
            <div>
              <p style={{ color: "#fff", fontWeight: 700, fontSize: 18, margin: 0, letterSpacing: "-0.3px" }}>SynapseAI</p>
              <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, margin: 0, fontWeight: 500 }}>NGO Coordination Platform</p>
            </div>
          </motion.div>

          {/* Headline — animates on role change */}
          <AnimatePresence mode="wait">
            <motion.div key={role} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }}>
              <h1 style={{ color: "#fff", fontSize: 38, fontWeight: 800, margin: "0 0 16px", lineHeight: 1.15, letterSpacing: "-0.8px", whiteSpace: "pre-line" }}>
                {feat.headline}
              </h1>
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 15, lineHeight: 1.65, margin: "0 0 40px", maxWidth: 380 }}>
                {feat.sub}
              </p>

              {/* Feature bullets */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 56 }}>
                {feat.bullets.map((b, i) => (
                  <motion.div key={b} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.07 }}
                    style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <CheckIcon />
                    <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 14 }}>{b}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Stats strip */}
          <div style={{ display: "flex", gap: 0 }}>
            {[feat.stat1, feat.stat2, feat.stat3].map((s, i) => (
              <React.Fragment key={s.label}>
                <div>
                  <p style={{ color: "#48A15E", fontWeight: 700, fontSize: 16, margin: 0 }}>{s.value}</p>
                  <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, margin: "2px 0 0", fontWeight: 500 }}>{s.label}</p>
                </div>
                {i < 2 && <div style={{ width: 1, background: "rgba(255,255,255,0.08)", margin: "0 24px" }} />}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right: Login panel ────────────────────────────── */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
        background: "radial-gradient(ellipse at 60% 0%, #1a5e52 0%, #0B3D36 55%, #072921 100%)",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Ambient glow */}
        <div style={{ position: "absolute", top: "-20%", right: "-20%", width: "60%", height: "60%", borderRadius: "50%", background: "rgba(42,130,86,0.1)", filter: "blur(80px)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: "-20%", left: "-10%", width: "50%", height: "50%", borderRadius: "50%", background: "rgba(72,161,94,0.07)", filter: "blur(80px)", pointerEvents: "none" }} />

        {/* Mobile logo */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mobile-logo"
          style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 36 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/logo-icon.png" alt="SynapseAI" style={{ height: 36, width: 36, objectFit: "contain" }} />
          <div>
            <p style={{ color: "#fff", fontWeight: 700, fontSize: 16, margin: 0 }}>SynapseAI</p>
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, margin: 0 }}>NGO Coordination Platform</p>
          </div>
        </motion.div>

        {/* Card */}
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          style={{
            width: "100%",
            maxWidth: 440,
            background: "rgba(255,255,255,0.06)",
            backdropFilter: "blur(24px)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 24,
            padding: "36px 32px",
            boxShadow: "0 32px 72px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)",
            position: "relative",
            zIndex: 1,
          }}
        >
          {/* Card header */}
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ color: "#fff", fontSize: 20, fontWeight: 700, margin: "0 0 6px", letterSpacing: "-0.3px" }}>
              {authMode === "login" ? "Welcome back" : "Get started"}
            </h2>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: 0 }}>
              {authMode === "login"
                ? `Sign in to your ${role === "ngo_admin" ? "NGO Admin" : "Volunteer"} account`
                : `Create your ${role === "ngo_admin" ? "NGO Admin" : "Volunteer"} account`}
            </p>
          </div>

          {/* Role switcher */}
          <div style={{ display: "flex", background: "rgba(0,0,0,0.2)", borderRadius: 12, padding: 3, marginBottom: 20, gap: 3 }}>
            {(["ngo_admin", "volunteer"] as const).map((r) => (
              <motion.button
                key={r}
                onClick={() => switchRole(r)}
                whileTap={{ scale: 0.97 }}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 700,
                  border: "none",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  letterSpacing: "0.01em",
                  ...(role === r
                    ? {
                        background: r === "ngo_admin"
                          ? "linear-gradient(135deg, #2A8256, #48A15E)"
                          : "linear-gradient(135deg, #1a7a5e, #2A8256)",
                        color: "#fff",
                        boxShadow: "0 4px 14px rgba(42,130,86,0.4)",
                      }
                    : {
                        background: "transparent",
                        color: "rgba(255,255,255,0.45)",
                      }),
                }}
              >
                {r === "ngo_admin" ? "NGO Admin" : "Volunteer"}
              </motion.button>
            ))}
          </div>

          {/* Login / Signup mode switcher */}
          <div style={{ display: "flex", background: "rgba(0,0,0,0.15)", borderRadius: 10, padding: 3, marginBottom: 22, gap: 3 }}>
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setAuthMode(m); setError(""); }}
                style={{
                  flex: 1,
                  padding: "8px 0",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  border: "none",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  ...(authMode === m
                    ? { background: "rgba(255,255,255,0.12)", color: "#fff" }
                    : { background: "transparent", color: "rgba(255,255,255,0.35)" }),
                }}
              >
                {m === "login" ? "Log In" : "Sign Up"}
              </button>
            ))}
          </div>

          {/* Invite code (volunteer only) */}
          <AnimatePresence>
            {role === "volunteer" && (
              <motion.div
                key="invite"
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: "auto", marginBottom: 18 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                style={{ overflow: "hidden" }}
              >
                <label style={{ display: "block", color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: 600, marginBottom: 7, letterSpacing: "0.03em", textTransform: "uppercase" }}>
                  Invite Code
                </label>
                <input
                  type="text"
                  placeholder="e.g. ABC12345"
                  value={inviteCode}
                  onChange={(e) => { setInviteCode(e.target.value.toUpperCase()); setError(""); }}
                  maxLength={16}
                  style={{
                    width: "100%",
                    padding: "12px 15px",
                    borderRadius: 11,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.07)",
                    color: "#fff",
                    fontSize: 15,
                    fontFamily: "'SF Mono', 'Fira Code', monospace",
                    letterSpacing: "0.12em",
                    outline: "none",
                    boxSizing: "border-box",
                    transition: "border-color 0.2s",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(72,161,94,0.5)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
                />
                <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, margin: "6px 0 0" }}>
                  Get this code from your NGO administrator.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                style={{
                  background: "rgba(248,113,113,0.12)",
                  border: "1px solid rgba(248,113,113,0.25)",
                  borderRadius: 10,
                  padding: "10px 14px",
                  marginBottom: 14,
                  color: "#fca5a5",
                  fontSize: 13,
                  textAlign: "center",
                }}
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
            <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, fontWeight: 500 }}>CONTINUE WITH</span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
          </div>

          {/* Primary: Google button */}
          <motion.button
            onClick={handleGoogle}
            disabled={busy}
            whileHover={{ scale: busy ? 1 : 1.015, boxShadow: busy ? undefined : "0 8px 24px rgba(0,0,0,0.35)" }}
            whileTap={{ scale: busy ? 1 : 0.975 }}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              padding: "14px 0",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.15)",
              background: busy ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.95)",
              color: "#1a1a1a",
              fontSize: 15,
              fontWeight: 600,
              cursor: busy ? "not-allowed" : "pointer",
              boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
              transition: "background 0.2s",
              letterSpacing: "-0.1px",
              marginBottom: 10,
            }}
          >
            {busy ? (
              <div style={{ display: "flex", gap: 5 }}>
                {[0, 1, 2].map((i) => (
                  <motion.div key={i} animate={{ y: [0, -5, 0] }} transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.1 }}
                    style={{ width: 6, height: 6, borderRadius: 3, background: "#6b7280" }} />
                ))}
              </div>
            ) : (
              <>
                <GoogleIcon />
                {authMode === "login" ? "Log In with Google" : "Sign Up with Google"}
              </>
            )}
          </motion.button>

          {/* Footer note */}
          <p style={{ color: "rgba(255,255,255,0.22)", fontSize: 11.5, textAlign: "center", marginTop: 16, lineHeight: 1.6 }}>
            {role === "volunteer"
              ? authMode === "signup"
                ? "New volunteer accounts require an invite code from your NGO admin."
                : "Enter your invite code above, then sign in with Google."
              : authMode === "signup"
                ? "First time? You'll set up your NGO profile right after sign-in."
                : "Welcome back. Sign in to access your NGO dashboard."}
          </p>
        </motion.div>

        {/* Footer */}
        <p style={{ color: "rgba(255,255,255,0.18)", fontSize: 11, marginTop: 28, position: "relative", zIndex: 1 }}>
          © 2025 SynapseAI — Built for NGOs
        </p>
      </div>

      {/* Responsive styles */}
      <style>{`
        @media (min-width: 900px) {
          .brand-panel { display: flex !important; }
          .mobile-logo { display: none !important; }
        }
      `}</style>
    </div>
  );
}
