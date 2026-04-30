"use client";

import React, { Suspense, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { api, friendlyError } from "../../../lib/ngo-api";
import { NGOAuthProvider, useNGOAuth } from "../../../lib/ngo-auth";
import { enterGuestMode } from "../../../lib/guest-mode";
import {
  Building2, Eye, EyeOff, Loader2, ChevronDown, X,
  User, Phone, Globe, Shield, CheckCircle2, ArrowRight, MapPin, Star,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// ── Tag Input ─────────────────────────────────────────────────────────────────

function TagInput({ tags, onChange, placeholder, suggestions }: {
  tags: string[]; onChange: (t: string[]) => void;
  placeholder: string; suggestions?: string[];
}) {
  const [input, setInput] = useState("");
  const [showSug, setShowSug] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const add = (val: string) => {
    const v = val.trim();
    if (v && !tags.includes(v)) onChange([...tags, v]);
    setInput(""); setShowSug(false);
  };
  const filtered = suggestions?.filter(s => s.toLowerCase().includes(input.toLowerCase()) && !tags.includes(s)) ?? [];

  return (
    <div className="relative">
      <div className="min-h-[46px] flex flex-wrap gap-1.5 px-3 py-2 rounded-xl cursor-text"
        style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}
        onClick={() => inputRef.current?.focus()}>
        {tags.map(tag => (
          <span key={tag} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold"
            style={{ background: "rgba(42,130,86,0.35)", color: "#86efac", border: "1px solid rgba(42,130,86,0.4)" }}>
            {tag}
            <button type="button" onClick={e => { e.stopPropagation(); onChange(tags.filter(t => t !== tag)); }}
              className="hover:text-white ml-0.5"><X size={10} /></button>
          </span>
        ))}
        <input ref={inputRef} type="text" value={input}
          onChange={e => { setInput(e.target.value); setShowSug(true); }}
          onKeyDown={e => {
            if ((e.key === "Enter" || e.key === ",") && input.trim()) { e.preventDefault(); add(input); }
            if (e.key === "Backspace" && !input && tags.length) onChange(tags.slice(0, -1));
          }}
          onFocus={() => setShowSug(true)}
          onBlur={() => setTimeout(() => setShowSug(false), 150)}
          placeholder={tags.length === 0 ? placeholder : "Add more…"}
          className="flex-1 bg-transparent text-sm text-white placeholder-white/30 outline-none min-w-[140px] py-0.5" />
      </div>
      {showSug && filtered.length > 0 && (
        <div className="absolute z-20 w-full mt-1 rounded-xl overflow-hidden shadow-xl"
          style={{ background: "#0c2520", border: "1px solid rgba(255,255,255,0.1)" }}>
          {filtered.slice(0, 6).map(s => (
            <button key={s} type="button" onMouseDown={() => add(s)}
              className="w-full text-left px-4 py-2.5 text-sm text-white/75 hover:bg-white/10 hover:text-white transition-colors">
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Select ────────────────────────────────────────────────────────────────────

function SelectField({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void;
  options: { label: string; value: string }[]; placeholder: string;
}) {
  return (
    <div className="relative">
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full rounded-xl px-4 py-3 text-sm appearance-none outline-none pr-10"
        style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", color: value ? "#fff" : "rgba(255,255,255,0.3)" }}>
        <option value="" style={{ color: "#888" }}>{placeholder}</option>
        {options.map(o => <option key={o.value} value={o.value} style={{ background: "#0c2520", color: "#fff" }}>{o.label}</option>)}
      </select>
      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
    </div>
  );
}

// ── Field ─────────────────────────────────────────────────────────────────────

function Field({ label, required, children, hint }: {
  label: string; required?: boolean; children: React.ReactNode; hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold tracking-wider uppercase flex items-center gap-1" style={{ color: "rgba(255,255,255,0.45)" }}>
        {label}{required && <span className="text-red-400">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.25)" }}>{hint}</p>}
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

function Section({ num, icon, title, children }: {
  num: number; icon: React.ReactNode; title: string; children: React.ReactNode;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: num * 0.08 }}
      className="rounded-2xl p-6 space-y-5"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="flex items-center gap-3 pb-1">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
          style={{ background: "linear-gradient(135deg,#2A8256,#48A15E)" }}>{num}</div>
        <div className="flex items-center gap-2 text-white/60">{icon}
          <span className="text-sm font-bold text-white">{title}</span>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </motion.div>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SECTORS = [
  { value: "health", label: "Health & Medical" }, { value: "education", label: "Education" },
  { value: "disaster", label: "Disaster Relief" }, { value: "environment", label: "Environment" },
  { value: "women_safety", label: "Women Safety" }, { value: "food", label: "Food Distribution" },
  { value: "livelihood", label: "Livelihood & Employment" }, { value: "child_welfare", label: "Child Welfare" },
  { value: "elderly", label: "Elderly Care" }, { value: "other", label: "Other" },
];
const REGIONS = ["Mumbai", "Delhi", "Bangalore", "Chennai", "Kolkata", "Hyderabad", "Pune", "Ahmedabad", "Jaipur", "Lucknow", "Surat", "Pan-India"];
const MISSION = ["Women safety", "Food distribution", "Clean water", "Rural education", "Disaster relief", "Climate action", "Child welfare", "Elder care", "Mental health", "Poverty alleviation", "Digital literacy", "Healthcare access"];

// ── Form ──────────────────────────────────────────────────────────────────────

function NGORegisterForm() {
  const router = useRouter();
  const { setUser } = useNGOAuth();
  const searchParams = useSearchParams();

  const googleMode  = searchParams.get("mode") === "google";
  const googleEmail = searchParams.get("email") ?? "";
  const googleUid   = searchParams.get("uid")   ?? "";
  const googleName  = searchParams.get("name")  ?? "";

  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [showPwd,   setShowPwd]   = useState(false);
  const [success,   setSuccess]   = useState(false);
  const [email,    setEmail]    = useState(googleMode ? googleEmail : "");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState(googleMode ? googleName  : "");
  const [phone,    setPhone]    = useState("");
  const [lang,     setLang]     = useState("en");

  const [ngoName,    setNgoName]    = useState("");
  const [ngoDesc,    setNgoDesc]    = useState("");
  const [ngoSector,  setNgoSector]  = useState("");
  const [ngoWebsite, setNgoWebsite] = useState("");
  const [ngoCity,    setNgoCity]    = useState("");
  const [ngoRegions, setNgoRegions] = useState<string[]>([]);
  const [ngoMission, setNgoMission] = useState<string[]>([]);
  const [pcName,     setPcName]     = useState("");
  const [pcPhone,    setPcPhone]    = useState("");

  const [commOptIn,     setCommOptIn]     = useState(true);
  const [analytics,     setAnalytics]     = useState(true);
  const [personalize,   setPersonalize]   = useState(true);
  const [aiTraining,    setAiTraining]    = useState(false);

  const inputCls = "w-full rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 outline-none";
  const inputSty = { background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" };

  const finalize = (token: string, emailUsed: string) => {
    localStorage.setItem("ngo_token", token);
    document.cookie = `ngo_token=${token}; path=/; max-age=${60 * 60 * 24}; SameSite=Strict${location.protocol === "https:" ? "; Secure" : ""}`;
    const p = JSON.parse(atob(token.split(".")[1]));
    setUser({ user_id: p.sub, role: "ngo_admin", ngo_id: p.ngo_id, email: emailUsed, token });
    setSuccess(true);
    setTimeout(() => router.push("/ngo/dashboard"), 900);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      if (googleMode) {
        const auth = await api.googleAuth({
          email: googleEmail, firebase_uid: googleUid, role: "ngo_admin",
          full_name: fullName || undefined, phone: phone || undefined, preferred_language: lang,
          communication_opt_in: commOptIn, consent_analytics: analytics,
          consent_personalization: personalize, consent_ai_training: aiTraining,
        });
        const ngo = await api.createNGO(auth.token, {
          name: ngoName, description: ngoDesc, sector: ngoSector || undefined,
          website: ngoWebsite || undefined, headquarters_city: ngoCity || undefined,
          primary_contact_name: pcName || fullName || undefined,
          primary_contact_phone: pcPhone || phone || undefined,
          operating_regions: ngoRegions, mission_focus: ngoMission,
        });
        finalize(ngo.token, googleEmail);
      } else {
        const signup = await api.signup({
          email, password, role: "ngo_admin",
          full_name: fullName || undefined, phone: phone || undefined, preferred_language: lang,
          communication_opt_in: commOptIn, consent_analytics: analytics,
          consent_personalization: personalize, consent_ai_training: aiTraining,
        });
        const ngo = await api.createNGO(signup.token, {
          name: ngoName, description: ngoDesc, sector: ngoSector || undefined,
          website: ngoWebsite || undefined, headquarters_city: ngoCity || undefined,
          primary_contact_name: pcName || fullName || undefined,
          primary_contact_phone: pcPhone || phone || undefined,
          operating_regions: ngoRegions, mission_focus: ngoMission,
        });
        finalize(ngo.token, email);
      }
    } catch (err: unknown) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: "radial-gradient(ellipse at 50% 0%, #115E54 0%, #0B3D36 50%, #072921 100%)" }}>
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center space-y-4">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
            style={{ background: "linear-gradient(135deg,#2A8256,#48A15E)", boxShadow: "0 0 40px rgba(42,130,86,0.5)" }}>
            <CheckCircle2 size={36} className="text-white" />
          </div>
          <p className="text-2xl font-bold text-white">NGO Created!</p>
          <p className="text-sm text-white/50">Redirecting to your dashboard…</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "radial-gradient(ellipse at 40% 0%, #115E54 0%, #0B3D36 45%, #072921 100%)" }}>
      <div className="fixed top-0 right-0 w-[600px] h-[600px] rounded-full pointer-events-none opacity-40"
        style={{ background: "rgba(42,130,86,0.15)", filter: "blur(100px)", transform: "translate(30%,-30%)" }} />
      <div className="fixed bottom-0 left-0 w-[400px] h-[400px] rounded-full pointer-events-none opacity-30"
        style={{ background: "rgba(72,161,94,0.12)", filter: "blur(80px)", transform: "translate(-30%,30%)" }} />

      {/* Sticky header */}
      <header className="sticky top-0 z-40 flex items-center justify-between px-6 py-4"
        style={{ background: "rgba(7,41,33,0.85)", backdropFilter: "blur(24px)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/logo-icon.png" alt="logo" className="h-8 w-8 object-contain" />
          <span className="text-sm font-bold text-white hidden sm:block">Sanchaalan Saathi</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-white/35">Already registered?</span>
          <a href="/login-ngo"
            className="px-3 py-1.5 rounded-lg font-semibold transition-all hover:bg-white/10"
            style={{ color: "#86efac", border: "1px solid rgba(42,130,86,0.4)" }}>
            Sign In
          </a>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pt-10 pb-16 relative z-10">
        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold mb-5"
            style={{ background: "rgba(42,130,86,0.2)", border: "1px solid rgba(42,130,86,0.4)", color: "#86efac" }}>
            <Building2 size={13} />NGO Registration
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight tracking-tight">
            Register your <span style={{ background: "linear-gradient(90deg,#48A15E,#86efac)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Organisation</span>
          </h1>
          <p className="text-sm text-white/40 mt-3 max-w-md mx-auto">
            Create your admin account, set up your NGO, and start coordinating volunteers efficiently.
          </p>
        </motion.div>

        {googleMode && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="mb-6 flex items-center gap-3 rounded-xl px-4 py-3 text-sm"
            style={{ background: "rgba(42,130,86,0.12)", border: "1px solid rgba(42,130,86,0.3)", color: "#86efac" }}>
            <CheckCircle2 size={16} className="flex-shrink-0" />
            Signed in with Google as <strong className="ml-1">{googleEmail}</strong>
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* ── Section 1: Account ── */}
          <Section num={1} icon={<User size={14} />} title="Your Account">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Full Name" required>
                <input className={inputCls} style={inputSty} type="text" required
                  value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" />
              </Field>
              <Field label="Phone Number">
                <div className="relative">
                  <Phone size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
                  <input className={`${inputCls} pl-9`} style={inputSty} type="tel"
                    value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98765 43210" />
                </div>
              </Field>
            </div>

            <Field label="Email Address" required>
              <input className={inputCls} type="email" required
                value={googleMode ? googleEmail : email}
                onChange={googleMode ? undefined : e => setEmail(e.target.value)}
                readOnly={googleMode}
                style={{ ...inputSty, ...(googleMode ? { opacity: 0.6, cursor: "not-allowed" } : {}) }}
                placeholder="you@organisation.com" />
            </Field>

            {!googleMode && (
              <Field label="Password" required>
                <div className="relative">
                  <input className={`${inputCls} pr-12`} style={inputSty}
                    type={showPwd ? "text" : "password"} required minLength={8}
                    value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 8 characters" />
                  <button type="button" onClick={() => setShowPwd(s => !s)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/35 hover:text-white/70 transition-colors">
                    {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </Field>
            )}

            <Field label="Preferred Language">
              <SelectField value={lang} onChange={setLang} placeholder="Select language"
                options={[
                  { value: "en", label: "English" }, { value: "hi", label: "Hindi" },
                  { value: "mr", label: "Marathi" }, { value: "ta", label: "Tamil" },
                  { value: "te", label: "Telugu" }, { value: "kn", label: "Kannada" },
                  { value: "bn", label: "Bengali" }, { value: "gu", label: "Gujarati" },
                ]} />
            </Field>
          </Section>

          {/* ── Section 2: Organisation ── */}
          <Section num={2} icon={<Building2 size={14} />} title="Organisation Details">
            <Field label="NGO Name" required>
              <input className={inputCls} style={inputSty} type="text" required minLength={2}
                value={ngoName} onChange={e => setNgoName(e.target.value)}
                placeholder="e.g. Green Earth Foundation" />
            </Field>

            <Field label="Description" hint="Help volunteers understand your mission and work.">
              <textarea rows={3} className={`${inputCls} resize-none`} style={inputSty}
                value={ngoDesc} onChange={e => setNgoDesc(e.target.value)}
                placeholder="Brief description of your NGO's mission, activities, and impact…" />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Sector / Focus Area">
                <SelectField value={ngoSector} onChange={setNgoSector}
                  placeholder="Select sector" options={SECTORS} />
              </Field>
              <Field label="Headquarters City" required>
                <div className="relative">
                  <MapPin size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
                  <input className={`${inputCls} pl-9`} style={inputSty} type="text" required
                    value={ngoCity} onChange={e => setNgoCity(e.target.value)} placeholder="e.g. Mumbai" />
                </div>
              </Field>
            </div>

            <Field label="Website">
              <div className="relative">
                <Globe size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
                <input className={`${inputCls} pl-9`} style={inputSty} type="url"
                  value={ngoWebsite} onChange={e => setNgoWebsite(e.target.value)}
                  placeholder="https://your-ngo.org" />
              </div>
            </Field>

            <Field label="Operating Regions" hint="Where is your NGO active? Press Enter or comma to add a region.">
              <TagInput tags={ngoRegions} onChange={setNgoRegions}
                placeholder="Type a region and press Enter…" suggestions={REGIONS} />
            </Field>

            <Field label="Mission Focus" hint="Key causes your NGO works on. Press Enter or comma to add.">
              <TagInput tags={ngoMission} onChange={setNgoMission}
                placeholder="e.g. Women safety, Food distribution…" suggestions={MISSION} />
            </Field>
          </Section>

          {/* ── Section 3: Primary Contact ── */}
          <Section num={3} icon={<User size={14} />} title="Primary Contact">
            <p className="text-xs text-white/35">Who should volunteers contact? Defaults to your account details if left blank.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Contact Name">
                <input className={inputCls} style={inputSty} type="text"
                  value={pcName} onChange={e => setPcName(e.target.value)} placeholder="Full name" />
              </Field>
              <Field label="Contact Phone">
                <div className="relative">
                  <Phone size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
                  <input className={`${inputCls} pl-9`} style={inputSty} type="tel"
                    value={pcPhone} onChange={e => setPcPhone(e.target.value)} placeholder="+91 …" />
                </div>
              </Field>
            </div>
          </Section>

          {/* ── Section 4: Consent ── */}
          <Section num={4} icon={<Shield size={14} />} title="Privacy & Consent">
            <p className="text-xs text-white/35">You can update these preferences anytime from your profile settings.</p>
            <div className="space-y-3">
              {[
                { label: "Allow service communication and important operational updates", val: commOptIn, set: setCommOptIn },
                { label: "Allow anonymised analytics to improve NGO and platform operations", val: analytics, set: setAnalytics },
                { label: "Allow personalised task-matching and volunteer recommendations", val: personalize, set: setPersonalize },
                { label: "Opt in to anonymised AI training data usage (helps improve AI features)", val: aiTraining, set: setAiTraining },
              ].map(({ label, val, set }) => (
                <label key={label} className="flex items-start gap-3 cursor-pointer group">
                  <div onClick={() => set(!val)}
                    className="mt-0.5 w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-all"
                    style={{ background: val ? "linear-gradient(135deg,#2A8256,#48A15E)" : "rgba(255,255,255,0.07)", border: `1px solid ${val ? "transparent" : "rgba(255,255,255,0.18)"}` }}>
                    {val && <CheckCircle2 size={12} className="text-white" />}
                  </div>
                  <span className="text-sm text-white/60 group-hover:text-white/80 transition-colors leading-relaxed">{label}</span>
                </label>
              ))}
            </div>
          </Section>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div key="err" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="rounded-xl px-4 py-3 text-sm text-red-300"
                style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)" }}>
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Submit */}
          <motion.button type="submit" disabled={loading}
            whileHover={{ scale: loading ? 1 : 1.015 }} whileTap={{ scale: loading ? 1 : 0.985 }}
            className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl text-base font-bold text-white disabled:opacity-60"
            style={{
              background: loading ? "rgba(42,130,86,0.35)" : "linear-gradient(135deg,#1a5e45,#2A8256 40%,#48A15E)",
              boxShadow: loading ? "none" : "0 8px 32px rgba(42,130,86,0.35)",
            }}>
            {loading
              ? <><Loader2 size={18} className="animate-spin" />Creating NGO…</>
              : <><Building2 size={18} />Create NGO Account<ArrowRight size={16} /></>}
          </motion.button>

          {/* Hackathon guest shortcuts */}
          <div className="grid grid-cols-2 gap-2">
            <button type="button"
              onClick={() => { enterGuestMode("ngo_admin"); window.location.href = "/ngo/dashboard"; }}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold text-white"
              style={{ background: "linear-gradient(135deg,#8B5CF6,#6D28D9)", boxShadow: "0 3px 10px rgba(139,92,246,0.25)" }}>
              <Star size={12} />
              NGO Demo
            </button>
            <button type="button"
              onClick={() => { enterGuestMode("volunteer"); window.location.href = "/vol/dashboard"; }}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold text-white"
              style={{ background: "linear-gradient(135deg,#0e7490,#0891b2)", boxShadow: "0 3px 10px rgba(8,145,178,0.25)" }}>
              <Star size={12} />
              Volunteer Demo
            </button>
          </div>

          <p className="text-center text-xs text-white/25 pb-4">
            Already have an account?{" "}
            <a href="/login-ngo" className="font-semibold hover:underline" style={{ color: "#86efac" }}>Sign In</a>
            {" "}·{" "}
            <a href="/register/volunteer" className="font-semibold hover:underline" style={{ color: "#86efac" }}>Register as Volunteer</a>
          </p>
        </form>
      </div>
    </div>
  );
}

export default function NGORegisterPage() {
  return (
    <NGOAuthProvider>
      <Suspense fallback={
        <div className="min-h-screen"
          style={{ background: "radial-gradient(ellipse at 40% 0%, #115E54 0%, #0B3D36 45%, #072921 100%)" }} />
      }>
        <NGORegisterForm />
      </Suspense>
    </NGOAuthProvider>
  );
}
