"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { api, friendlyError } from "../../../lib/ngo-api";
import { useNGOAuth } from "../../../lib/ngo-auth";
import { setTokens } from "../../../lib/token-manager";

export default function NGOSetupPage() {
  const router = useRouter();
  const { user, setUser } = useNGOAuth();
  const [name, setName]       = useState("");
  const [desc, setDesc]       = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError("");
    setLoading(true);
    try {
      const res = await api.createNGO(user.token, { name, description: desc });
      setTokens(res.token, res.refresh_token);
      try {
        const p = JSON.parse(atob(res.token.split(".")[1]));
        setUser({ ...user, ngo_id: p.ngo_id, token: res.token, needs_ngo_setup: false });
      } catch {
        setUser({ ...user, token: res.token, needs_ngo_setup: false });
      }
      window.location.href = "/ngo/dashboard";
    } catch (err: unknown) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        // Decorative orbs sit at -10% insets; without this they widen the page.
        overflowX: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        background: "radial-gradient(ellipse at 30% 0%, #1a5e52 0%, #0B3D36 50%, #072921 100%)",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ position: "fixed", top: "-15%", right: "-10%", width: "50%", height: "50%", borderRadius: "50%", background: "rgba(42,130,86,0.09)", filter: "blur(80px)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: "-20%", left: "-10%", width: "50%", height: "50%", borderRadius: "50%", background: "rgba(72,161,94,0.06)", filter: "blur(80px)", pointerEvents: "none" }} />

      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        style={{ width: "100%", maxWidth: 460, position: "relative", zIndex: 1 }}
      >
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/logo-icon.png" alt="Sanchaalan Saathi" style={{ height: 48, width: 48, objectFit: "contain", margin: "0 auto 12px" }} />
          <h1 style={{ color: "#fff", fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: "-0.3px" }}>Sanchaalan Saathi</h1>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, margin: "4px 0 0" }}>One last step — set up your organisation</p>
        </div>

        {/* Card */}
        <div
          style={{
            background: "rgba(255,255,255,0.06)",
            backdropFilter: "blur(24px)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 24,
            overflow: "hidden",
            boxShadow: "0 32px 72px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
        >
          {/* Header strip */}
          <div style={{ padding: "22px 28px 0", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: "linear-gradient(135deg, var(--brand-500), var(--brand-400))", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 4px 14px rgba(42,130,86,0.4)" }}>
              <Building2 size={17} color="#fff" />
            </div>
            <div>
              <h2 style={{ color: "#fff", fontSize: 16, fontWeight: 700, margin: 0, letterSpacing: "-0.2px" }}>Create your NGO</h2>
              <p style={{ color: "rgba(255,255,255,0.38)", fontSize: 12, margin: "2px 0 0" }}>
                An invite code will be generated for onboarding volunteers
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} style={{ padding: "20px 28px 28px" }}>

            {/* NGO Name */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 600, marginBottom: 7, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                NGO Name *
              </label>
              <input
                type="text"
                required
                minLength={2}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Green Earth Foundation"
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 11,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.07)",
                  color: "#fff",
                  fontSize: 14,
                  outline: "none",
                  boxSizing: "border-box",
                  transition: "border-color 0.2s",
                  fontFamily: "inherit",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(72,161,94,0.5)"; }}
                onBlur={(e)  => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
              />
            </div>

            {/* Description */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 600, marginBottom: 7, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                Description{" "}
                <span style={{ color: "rgba(255,255,255,0.22)", textTransform: "none", fontWeight: 400, fontSize: 11 }}>(optional)</span>
              </label>
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="What does your NGO do? What causes do you support?"
                rows={3}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 11,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.07)",
                  color: "#fff",
                  fontSize: 14,
                  outline: "none",
                  resize: "none",
                  boxSizing: "border-box",
                  transition: "border-color 0.2s",
                  fontFamily: "inherit",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(72,161,94,0.5)"; }}
                onBlur={(e)  => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
              />
            </div>

            {/* Error */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 10, padding: "10px 14px", marginBottom: 16, color: "#fca5a5", fontSize: 13 }}
              >
                {error}
              </motion.div>
            )}

            {/* Submit */}
            <motion.button
              type="submit"
              disabled={loading || !name.trim()}
              whileHover={{ scale: loading || !name.trim() ? 1 : 1.01 }}
              whileTap={{ scale: loading || !name.trim() ? 1 : 0.98 }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "13px 0",
                borderRadius: 12,
                border: "none",
                background: loading || !name.trim() ? "rgba(42,130,86,0.35)" : "linear-gradient(135deg, #2A8256, #48A15E)",
                color: "#fff",
                fontSize: 14,
                fontWeight: 700,
                cursor: loading || !name.trim() ? "not-allowed" : "pointer",
                boxShadow: loading || !name.trim() ? "none" : "0 4px 20px rgba(42,130,86,0.4)",
                transition: "all 0.2s",
              }}
            >
              {loading
                ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                : <><span>Create NGO & Continue</span><ArrowRight size={15} /></>
              }
            </motion.button>

            {/* Signed-in-as note */}
            <p style={{ color: "rgba(255,255,255,0.2)", fontSize: 11, textAlign: "center", marginTop: 16, lineHeight: 1.5 }}>
              Signed in as{" "}
              <span style={{ color: "rgba(255,255,255,0.38)" }}>{user?.email}</span>
            </p>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
