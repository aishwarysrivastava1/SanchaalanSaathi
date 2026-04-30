"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, Building2, Users, ArrowRight, Star } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { NGOAuthProvider, useNGOAuth } from "../../lib/ngo-auth";
import { api, friendlyError } from "../../lib/ngo-api";
import { enterGuestMode } from "../../lib/guest-mode";

function LoginForm() {
  const router   = useRouter();
  const { login } = useNGOAuth();
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [showPwd, setShowPwd]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [notFound, setNotFound] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setNotFound(false); setLoading(true);
    try {
      const user = await login(email, password);
      document.cookie = `ngo_token=${user.token}; path=/; max-age=${60 * 60 * 24}`;
      if (user.role === "ngo_admin") {
        router.push(user.ngo_id ? "/ngo/dashboard" : "/ngo/setup");
      } else {
        router.push("/vol/dashboard");
      }
    } catch (err: unknown) {
      // On 401, check if the email simply doesn't exist yet
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
      if (msg.includes("invalid credentials") || msg.includes("401")) {
        try {
          const check = await api.checkEmail(email);
          if (!check.exists) { setNotFound(true); return; }
        } catch { /* fall through to generic error */ }
      }
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  const inputSty = { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "radial-gradient(ellipse at 50% 0%, #115E54 0%, #0B3D36 50%, #072921 100%)" }}
    >
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#2A8256]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-[#48A15E]/8 rounded-full blur-3xl pointer-events-none" />

      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-sm relative"
      >
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8 justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/logo-icon.png" alt="logo" className="h-10 w-10 object-contain" />
          <div>
            <h1 className="text-lg font-bold text-white leading-tight">Sanchaalan Saathi</h1>
            <p className="text-xs text-white/40">Smart Resource Allocation Platform</p>
          </div>
        </div>

        <div className="rounded-2xl overflow-hidden"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(20px)" }}>
          <div className="px-6 pt-6 pb-4">
            <p className="text-base font-bold text-white">Sign In</p>
            <p className="text-xs text-white/40 mt-0.5">NGO admin or volunteer account</p>
          </div>

          <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
            <div>
              <label className="text-xs font-medium text-white/60 block mb-1">Email</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none transition-colors"
                style={inputSty} />
            </div>

            <div>
              <label className="text-xs font-medium text-white/60 block mb-1">Password</label>
              <div className="relative">
                <input type={showPwd ? "text" : "password"} required value={password}
                  onChange={e => setPassword(e.target.value)} placeholder="Your password"
                  className="w-full rounded-lg px-3 py-2.5 pr-10 text-sm text-white placeholder-white/30 outline-none transition-colors"
                  style={inputSty} />
                <button type="button" onClick={() => setShowPwd(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">
                  {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* Generic error */}
            <AnimatePresence>
              {error && (
                <motion.p key="err" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="text-xs text-red-300 rounded-lg px-3 py-2"
                  style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.25)" }}>
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            {/* New-user panel — shown when email not found */}
            <AnimatePresence>
              {notFound && (
                <motion.div key="notfound" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="rounded-xl p-4 space-y-3"
                  style={{ background: "rgba(42,130,86,0.1)", border: "1px solid rgba(42,130,86,0.3)" }}>
                  <p className="text-xs font-semibold text-white/70">
                    No account found for <span className="text-white">{email}</span>. Create one:
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <a href="/register/ngo"
                      className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold text-white transition-all hover:scale-105"
                      style={{ background: "linear-gradient(135deg,#2A8256,#48A15E)" }}>
                      <Building2 size={13} />NGO Admin<ArrowRight size={12} />
                    </a>
                    <a href="/register/volunteer"
                      className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold text-white transition-all hover:scale-105"
                      style={{ background: "linear-gradient(135deg,#1a7a5e,#2A8256)" }}>
                      <Users size={13} />Volunteer<ArrowRight size={12} />
                    </a>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button type="submit" disabled={loading}
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              className="w-full py-2.5 rounded-xl text-sm font-bold text-white transition-opacity disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
              style={{ background: "linear-gradient(135deg, #2A8256 0%, #48A15E 100%)" }}>
              {loading && <Loader2 size={14} className="animate-spin" />}
              Sign In
            </motion.button>

            {/* Guest demo shortcuts */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button type="button"
                onClick={() => { enterGuestMode("ngo_admin"); window.location.href = "/ngo/dashboard"; }}
                className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold text-white"
                style={{ background: "linear-gradient(135deg, #8B5CF6, #6D28D9)", boxShadow: "0 3px 10px rgba(139,92,246,0.3)" }}>
                <Star size={12} />
                NGO Demo
              </button>
              <button type="button"
                onClick={() => { enterGuestMode("volunteer"); window.location.href = "/vol/dashboard"; }}
                className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold text-white"
                style={{ background: "linear-gradient(135deg, #0e7490, #0891b2)", boxShadow: "0 3px 10px rgba(8,145,178,0.3)" }}>
                <Star size={12} />
                Volunteer Demo
              </button>
            </div>

            <div className="flex items-center justify-center gap-3 pt-1">
              <a href="/register/ngo" className="text-xs text-white/30 hover:text-[#95C78F] transition-colors flex items-center gap-1">
                <Building2 size={11} />Register NGO
              </a>
              <span className="text-white/20 text-xs">·</span>
              <a href="/register/volunteer" className="text-xs text-white/30 hover:text-[#95C78F] transition-colors flex items-center gap-1">
                <Users size={11} />Register as Volunteer
              </a>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <NGOAuthProvider>
      <LoginForm />
    </NGOAuthProvider>
  );
}
