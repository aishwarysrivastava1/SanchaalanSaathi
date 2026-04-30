"use client";

import React, { Suspense, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { api, friendlyError } from "../../../lib/ngo-api";
import { NGOAuthProvider, useNGOAuth } from "../../../lib/ngo-auth";
import { enterGuestMode } from "../../../lib/guest-mode";
import {
  Users, Eye, EyeOff, Loader2, ChevronDown, X,
  Phone, Shield, CheckCircle2, ArrowRight, MapPin, Heart, Briefcase, Star,
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
            style={{ background: "rgba(26,122,94,0.4)", color: "#6ee7b7", border: "1px solid rgba(26,122,94,0.5)" }}>
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
          style={{ background: "linear-gradient(135deg,#1a7a5e,#2A8256)" }}>{num}</div>
        <div className="flex items-center gap-2 text-white/60">{icon}
          <span className="text-sm font-bold text-white">{title}</span>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </motion.div>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SKILLS    = ["Teaching", "Medical", "Logistics", "Driving", "Cooking", "Python", "Data Analysis", "Carpentry", "Plumbing", "Counselling", "Photography", "Social Media", "Fundraising", "Legal", "Translation", "First Aid", "CPR", "Construction", "Farming"];
const CAUSES    = ["Education", "Environment", "Healthcare", "Women Safety", "Child Welfare", "Poverty Alleviation", "Disaster Relief", "Elder Care", "Mental Health", "Food Security", "Clean Water", "Animal Welfare", "Digital Literacy"];
const LANGUAGES = ["English", "Hindi", "Marathi", "Tamil", "Telugu", "Kannada", "Bengali", "Gujarati", "Punjabi", "Urdu", "Malayalam", "Odia"];
const ROLES     = ["Mentor", "Driver", "Cook", "Medical Assistant", "Coordinator", "Teacher", "Counsellor", "Photographer", "Data Volunteer", "Field Worker", "Camp Helper", "Translator", "Fundraiser"];
const CERTS     = ["CPR", "First Aid", "Food Safety", "Child Protection", "Mental Health First Aid", "Driver's License", "Medical Certificate", "Fire Safety"];

const EDUCATION = [
  { value: "secondary",        label: "Secondary (10th)" },
  { value: "higher_secondary", label: "Higher Secondary (12th)" },
  { value: "diploma",          label: "Diploma" },
  { value: "undergraduate",    label: "Undergraduate / Bachelor's" },
  { value: "postgraduate",     label: "Postgraduate / Master's" },
  { value: "doctorate",        label: "Doctorate / PhD" },
  { value: "other",            label: "Other" },
];

// ── Form ──────────────────────────────────────────────────────────────────────

function VolunteerRegisterForm() {
  const router = useRouter();
  const { setUser } = useNGOAuth();
  const searchParams = useSearchParams();

  const googleMode    = searchParams.get("mode") === "google";
  const googleEmail   = searchParams.get("email") ?? "";
  const googleUid     = searchParams.get("uid")   ?? "";
  const googleName    = searchParams.get("name")  ?? "";
  const inviteFromUrl = searchParams.get("invite") ?? "";
  const inviteLocked  = !!inviteFromUrl;

  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [showPwd,   setShowPwd]   = useState(false);
  const [success,   setSuccess]   = useState(false);
  const [inviteCode,    setInviteCode]    = useState(inviteFromUrl);
  const [inviteNgoName, setInviteNgoName] = useState("");
  const [inviteValid,   setInviteValid]   = useState<boolean | null>(inviteFromUrl ? true : null);

  const [email,    setEmail]    = useState(googleMode ? googleEmail : "");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState(googleMode ? googleName  : "");
  const [phone,    setPhone]    = useState("");
  const [city,     setCity]     = useState("");
  const [dob,      setDob]      = useState("");
  const [lang,     setLang]     = useState("en");

  const [skills,     setSkills]     = useState<string[]>([]);
  const [roles,      setRoles]      = useState<string[]>([]);
  const [langs,      setLangs]      = useState<string[]>([]);
  const [education,  setEducation]  = useState("");
  const [experience, setExperience] = useState("");
  const [certs,      setCerts]      = useState<string[]>([]);
  const [availNotes, setAvailNotes] = useState("");

  const [causes,     setCauses]     = useState<string[]>([]);
  const [bio,        setBio]        = useState("");
  const [motivation, setMotivation] = useState("");

  const [emergName,  setEmergName]  = useState("");
  const [emergPhone, setEmergPhone] = useState("");

  const [commOptIn,   setCommOptIn]   = useState(true);
  const [analytics,   setAnalytics]   = useState(true);
  const [personalize, setPersonalize] = useState(true);
  const [aiTraining,  setAiTraining]  = useState(false);

  const inputCls = "w-full rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 outline-none";
  const inputSty = { background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" };

  useEffect(() => {
    if (inviteLocked) {
      if (inviteCode) api.lookupNGO(inviteCode).then(d => setInviteNgoName(d.ngo_name)).catch(() => {});
      return;
    }
    if (inviteCode.length < 6) { setInviteNgoName(""); setInviteValid(null); return; }
    const t = setTimeout(() => {
      api.lookupNGO(inviteCode)
        .then(d => { setInviteNgoName(d.ngo_name); setInviteValid(true); })
        .catch(() => { setInviteNgoName(""); setInviteValid(false); });
    }, 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteCode]);

  const finalize = (token: string, emailUsed: string) => {
    localStorage.setItem("ngo_token", token);
    document.cookie = `ngo_token=${token}; path=/; max-age=${60 * 60 * 24}; SameSite=Strict${location.protocol === "https:" ? "; Secure" : ""}`;
    const p = JSON.parse(atob(token.split(".")[1]));
    setUser({ user_id: p.sub, role: "volunteer", ngo_id: p.ngo_id, email: emailUsed, token });
    setSuccess(true);
    setTimeout(() => router.push("/vol/dashboard"), 900);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inviteValid === false) { setError("Invalid Invite Code — get a valid code from your NGO administrator."); return; }
    if (!inviteCode.trim()) { setError("An NGO invite code is required to register as a volunteer."); return; }
    setError(""); setLoading(true);
    try {
      const common = {
        invite_code: inviteCode,
        full_name: fullName || undefined, phone: phone || undefined,
        city: city || undefined, preferred_language: lang,
        communication_opt_in: commOptIn, consent_analytics: analytics,
        consent_personalization: personalize, consent_ai_training: aiTraining,
        skills, preferred_roles: roles, languages: langs,
        education_level: education || undefined,
        years_experience: experience ? Number(experience) : undefined,
        certifications: certs, causes_supported: causes,
        bio: bio || undefined, motivation_statement: motivation || undefined,
        date_of_birth: dob || undefined,
        emergency_contact_name: emergName || undefined,
        emergency_contact_phone: emergPhone || undefined,
        availability_notes: availNotes || undefined,
      };
      if (googleMode) {
        const auth = await api.googleAuth({ email: googleEmail, firebase_uid: googleUid, role: "volunteer", ...common });
        finalize(auth.token, googleEmail);
      } else {
        const signup = await api.signup({ email, password, role: "volunteer", ...common });
        finalize(signup.token, email);
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
            style={{ background: "linear-gradient(135deg,#1a7a5e,#2A8256)", boxShadow: "0 0 40px rgba(26,122,94,0.5)" }}>
            <CheckCircle2 size={36} className="text-white" />
          </div>
          <p className="text-2xl font-bold text-white">Welcome aboard!</p>
          <p className="text-sm text-white/50">Redirecting to your dashboard…</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "radial-gradient(ellipse at 60% 0%, #0f3d32 0%, #0B3D36 40%, #072921 100%)" }}>
      <div className="fixed top-0 left-0 w-[500px] h-[500px] rounded-full pointer-events-none opacity-30"
        style={{ background: "rgba(26,122,94,0.2)", filter: "blur(100px)", transform: "translate(-30%,-30%)" }} />
      <div className="fixed bottom-0 right-0 w-[400px] h-[400px] rounded-full pointer-events-none opacity-20"
        style={{ background: "rgba(72,161,94,0.15)", filter: "blur(80px)", transform: "translate(30%,30%)" }} />

      <header className="sticky top-0 z-40 flex items-center justify-between px-6 py-4"
        style={{ background: "rgba(7,41,33,0.85)", backdropFilter: "blur(24px)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/logo-icon.png" alt="logo" className="h-8 w-8 object-contain" />
          <span className="text-sm font-bold text-white hidden sm:block">Sanchaalan Saathi</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-white/35">Already registered?</span>
          <a href="/login-ngo" className="px-3 py-1.5 rounded-lg font-semibold transition-all hover:bg-white/10"
            style={{ color: "#6ee7b7", border: "1px solid rgba(26,122,94,0.45)" }}>
            Sign In
          </a>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pt-10 pb-16 relative z-10">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold mb-5"
            style={{ background: "rgba(26,122,94,0.2)", border: "1px solid rgba(26,122,94,0.45)", color: "#6ee7b7" }}>
            <Users size={13} />Volunteer Registration
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight tracking-tight">
            Join as a <span style={{ background: "linear-gradient(90deg,#2A8256,#6ee7b7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Volunteer</span>
          </h1>
          <p className="text-sm text-white/40 mt-3 max-w-md mx-auto">
            Register with your NGO&apos;s invite code and start making a difference in your community.
          </p>
        </motion.div>

        {googleMode && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="mb-6 flex items-center gap-3 rounded-xl px-4 py-3 text-sm"
            style={{ background: "rgba(26,122,94,0.12)", border: "1px solid rgba(26,122,94,0.35)", color: "#6ee7b7" }}>
            <CheckCircle2 size={16} className="flex-shrink-0" />
            Signed in with Google as <strong className="ml-1">{googleEmail}</strong>
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Section 1: Identity */}
          <Section num={1} icon={<Users size={14} />} title="Identity & Access">
            <Field label="NGO Invite Code" required hint="Get this from your NGO administrator.">
              <input className={`${inputCls} font-mono tracking-widest`}
                style={{ ...inputSty, ...(inviteLocked ? { opacity: 0.65, cursor: "not-allowed" } : {}) }}
                type="text" required maxLength={16}
                value={inviteCode}
                onChange={inviteLocked ? undefined : e => setInviteCode(e.target.value.toUpperCase())}
                readOnly={inviteLocked}
                placeholder="e.g. AB3K7XPQ" />
              {inviteNgoName && (
                <p className="text-[11px] flex items-center gap-1.5 mt-1" style={{ color: "#6ee7b7" }}>
                  <CheckCircle2 size={11} />Joining: <strong>{inviteNgoName}</strong>
                </p>
              )}
              {inviteValid === false && (
                <p className="text-[11px] mt-1" style={{ color: "#fca5a5" }}>✗ Invalid Invite Code — check with your NGO admin</p>
              )}
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Full Name" required>
                <input className={inputCls} style={inputSty} type="text" required
                  value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" />
              </Field>
              <Field label="Phone Number" required>
                <div className="relative">
                  <Phone size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
                  <input className={`${inputCls} pl-9`} style={inputSty} type="tel" required
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
                placeholder="you@example.com" />
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="City" required>
                <div className="relative">
                  <MapPin size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
                  <input className={`${inputCls} pl-9`} style={inputSty} type="text" required
                    value={city} onChange={e => setCity(e.target.value)} placeholder="Your city" />
                </div>
              </Field>
              <Field label="Date of Birth">
                <input className={inputCls} style={inputSty} type="date"
                  value={dob} onChange={e => setDob(e.target.value)} />
              </Field>
            </div>

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

          {/* Section 2: Skills */}
          <Section num={2} icon={<Briefcase size={14} />} title="Skills & Experience">
            <Field label="Your Skills" required hint="Press Enter or comma to add. These help match you to the right tasks.">
              <TagInput tags={skills} onChange={setSkills}
                placeholder="e.g. Teaching, First Aid, Driving…" suggestions={SKILLS} />
            </Field>

            <Field label="Preferred Volunteer Roles" hint="What roles fit you best?">
              <TagInput tags={roles} onChange={setRoles}
                placeholder="e.g. Mentor, Driver, Cook…" suggestions={ROLES} />
            </Field>

            <Field label="Languages Spoken">
              <TagInput tags={langs} onChange={setLangs}
                placeholder="e.g. Hindi, English…" suggestions={LANGUAGES} />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Education Level">
                <SelectField value={education} onChange={setEducation}
                  placeholder="Select level" options={EDUCATION} />
              </Field>
              <Field label="Years of Volunteer Experience">
                <input className={inputCls} style={inputSty} type="number" min={0} max={80}
                  value={experience} onChange={e => setExperience(e.target.value)} placeholder="0" />
              </Field>
            </div>

            <Field label="Certifications" hint="Add any relevant certifications.">
              <TagInput tags={certs} onChange={setCerts}
                placeholder="e.g. CPR, First Aid…" suggestions={CERTS} />
            </Field>

            <Field label="Availability Notes" hint="When are you typically free to volunteer?">
              <textarea rows={2} className={`${inputCls} resize-none`} style={inputSty}
                value={availNotes} onChange={e => setAvailNotes(e.target.value)}
                placeholder="e.g. Weekends only, available after 6pm on weekdays…" />
            </Field>
          </Section>

          {/* Section 3: Motivation */}
          <Section num={3} icon={<Heart size={14} />} title="Causes & Motivation">
            <Field label="Causes You Care About" hint="What issues inspire you to volunteer?">
              <TagInput tags={causes} onChange={setCauses}
                placeholder="e.g. Education, Environment…" suggestions={CAUSES} />
            </Field>

            <Field label="About You">
              <textarea rows={3} className={`${inputCls} resize-none`} style={inputSty}
                value={bio} onChange={e => setBio(e.target.value)}
                placeholder="Tell us about yourself — your background, interests, and what drives you…" />
            </Field>

            <Field label="Motivation Statement" hint="Why do you want to volunteer with this NGO?">
              <textarea rows={3} className={`${inputCls} resize-none`} style={inputSty}
                value={motivation} onChange={e => setMotivation(e.target.value)}
                placeholder="What motivates you? What impact do you hope to create?…" />
            </Field>
          </Section>

          {/* Section 4: Emergency Contact */}
          <Section num={4} icon={<Phone size={14} />} title="Emergency Contact">
            <p className="text-xs text-white/35">Used only for safety during field operations. Optional but recommended.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Contact Name">
                <input className={inputCls} style={inputSty} type="text"
                  value={emergName} onChange={e => setEmergName(e.target.value)} placeholder="Full name" />
              </Field>
              <Field label="Contact Phone">
                <div className="relative">
                  <Phone size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
                  <input className={`${inputCls} pl-9`} style={inputSty} type="tel"
                    value={emergPhone} onChange={e => setEmergPhone(e.target.value)} placeholder="+91 …" />
                </div>
              </Field>
            </div>
          </Section>

          {/* Section 5: Consent */}
          <Section num={5} icon={<Shield size={14} />} title="Privacy & Consent">
            <p className="text-xs text-white/35">You can update these anytime from your profile settings.</p>
            <div className="space-y-3">
              {[
                { label: "Allow service communication and important updates from your NGO", val: commOptIn, set: setCommOptIn },
                { label: "Allow anonymised analytics to improve volunteer matching and operations", val: analytics, set: setAnalytics },
                { label: "Allow personalised task and opportunity recommendations", val: personalize, set: setPersonalize },
                { label: "Opt in to anonymised AI training data (helps improve AI features)", val: aiTraining, set: setAiTraining },
              ].map(({ label, val, set }) => (
                <label key={label} className="flex items-start gap-3 cursor-pointer group">
                  <div onClick={() => set(!val)}
                    className="mt-0.5 w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-all"
                    style={{ background: val ? "linear-gradient(135deg,#1a7a5e,#2A8256)" : "rgba(255,255,255,0.07)", border: `1px solid ${val ? "transparent" : "rgba(255,255,255,0.18)"}` }}>
                    {val && <CheckCircle2 size={12} className="text-white" />}
                  </div>
                  <span className="text-sm text-white/60 group-hover:text-white/80 transition-colors leading-relaxed">{label}</span>
                </label>
              ))}
            </div>
          </Section>

          <AnimatePresence>
            {error && (
              <motion.div key="err" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="rounded-xl px-4 py-3 text-sm text-red-300"
                style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)" }}>
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button type="submit" disabled={loading || inviteValid === false}
            whileHover={{ scale: (loading || inviteValid === false) ? 1 : 1.015 }}
            whileTap={{ scale: (loading || inviteValid === false) ? 1 : 0.985 }}
            className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl text-base font-bold text-white disabled:opacity-60"
            style={{
              background: (loading || inviteValid === false) ? "rgba(26,122,94,0.3)" : "linear-gradient(135deg,#0f3d2e,#1a7a5e 40%,#2A8256)",
              boxShadow: (loading || inviteValid === false) ? "none" : "0 8px 32px rgba(26,122,94,0.35)",
            }}>
            {loading
              ? <><Loader2 size={18} className="animate-spin" />Registering…</>
              : <><Users size={18} />Join as Volunteer<ArrowRight size={16} /></>}
          </motion.button>

          {/* Hackathon guest shortcuts */}
          <div className="grid grid-cols-2 gap-2">
            <button type="button"
              onClick={() => { enterGuestMode("volunteer"); window.location.href = "/vol/dashboard"; }}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold text-white"
              style={{ background: "linear-gradient(135deg,#0e7490,#0891b2)", boxShadow: "0 3px 10px rgba(8,145,178,0.25)" }}>
              <Star size={12} />
              Volunteer Demo
            </button>
            <button type="button"
              onClick={() => { enterGuestMode("ngo_admin"); window.location.href = "/ngo/dashboard"; }}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold text-white"
              style={{ background: "linear-gradient(135deg,#8B5CF6,#6D28D9)", boxShadow: "0 3px 10px rgba(139,92,246,0.25)" }}>
              <Star size={12} />
              NGO Demo
            </button>
          </div>

          <p className="text-center text-xs text-white/25 pb-4">
            Already have an account?{" "}
            <a href="/login-ngo" className="font-semibold hover:underline" style={{ color: "#6ee7b7" }}>Sign In</a>
            {" "}·{" "}
            <a href="/register/ngo" className="font-semibold hover:underline" style={{ color: "#6ee7b7" }}>Register as NGO Admin</a>
          </p>
        </form>
      </div>
    </div>
  );
}

export default function VolunteerRegisterPage() {
  return (
    <NGOAuthProvider>
      <Suspense fallback={
        <div className="min-h-screen"
          style={{ background: "radial-gradient(ellipse at 60% 0%, #0f3d32 0%, #0B3D36 40%, #072921 100%)" }} />
      }>
        <VolunteerRegisterForm />
      </Suspense>
    </NGOAuthProvider>
  );
}
