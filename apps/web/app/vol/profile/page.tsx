"use client";

import React, { useEffect, useState } from "react";
import { Loader2, AlertCircle, CheckCircle2, Award, MapPin, MapPinOff, User, Shield, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { api, friendlyError } from "../../../lib/ngo-api";
import { useNGOAuth } from "../../../lib/ngo-auth";

const PREDEFINED_SKILLS = [
  "First Aid", "Teaching", "Medical", "Counseling", "Driving",
  "Cooking", "Construction", "IT Support", "Translation", "Legal",
  "Fundraising", "Photography", "Social Media", "Logistics", "Research",
  "Childcare", "Elder Care", "Mental Health", "Data Entry", "Accounting",
];

const BADGES = [
  { id: "starter",     label: "Starter",     desc: "First task completed",    threshold: 1,  emoji: "🌱" },
  { id: "contributor", label: "Contributor",  desc: "5 tasks completed",       threshold: 5,  emoji: "⭐" },
  { id: "champion",    label: "Champion",     desc: "15 tasks completed",      threshold: 15, emoji: "🏆" },
  { id: "legend",      label: "Legend",       desc: "30 tasks completed",      threshold: 30, emoji: "🔥" },
];

const DAYS = ["mon","tue","wed","thu","fri","sat","sun"] as const;
const DAY_LABELS: Record<string, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

const CONSENT_KEY = "vol_location_consent_given";

export default function VolProfilePage() {
  const { user, loading: authLoading } = useNGOAuth();
  const [skills, setSkills]             = useState<string[]>([]);
  const [availability, setAvail]        = useState<Record<string, boolean>>({});
  const [performance, setPerformance]   = useState<{ completed_tasks: number; total_assigned: number; performance_score: number } | null>(null);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState("");
  const [saved, setSaved]           = useState(false);
  const [shareLocation, setShareLocation] = useState(false);
  const [locationStatus, setLocationStatus] = useState<"idle" | "active" | "denied" | "error">("idle");
  const [showConsentModal, setShowConsentModal] = useState(false);
  const watchIdRef = React.useRef<number | null>(null);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone]       = useState("");
  const [city, setCity]         = useState("");
  const [bio, setBio]           = useState("");
  const [dob, setDob]           = useState("");

  useEffect(() => {
    if (!user) return;
    api.volProfile(user.token)
      .then((p: any) => {
        setSkills(p.skills ?? []);
        setAvail(p.availability ?? {});
        setFullName(p.full_name ?? "");
        setPhone(p.phone ?? "");
        setCity(p.city ?? "");
        setBio(p.bio ?? "");
        setDob(p.date_of_birth ?? "");
        if (p.share_location) { setShareLocation(true); setLocationStatus("active"); }
        if (p.performance_score !== undefined) {
          setPerformance({ completed_tasks: p.completed_tasks ?? 0, total_assigned: p.total_assigned ?? 0, performance_score: p.performance_score ?? 0 });
        }
      })
      .catch((e) => setError(friendlyError(e)))
      .finally(() => setLoading(false));
  }, [user]);

  // Geolocation watcher — starts only when shareLocation becomes true
  useEffect(() => {
    if (!user || !shareLocation) {
      if (watchIdRef.current !== null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
      return;
    }
    if (!navigator.geolocation) { setLocationStatus("error"); setShareLocation(false); return; }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => { setLocationStatus("active"); api.updateVolLocation(user.token, pos.coords.latitude, pos.coords.longitude).catch(() => {}); },
      (err) => { setLocationStatus(err.code === err.PERMISSION_DENIED ? "denied" : "error"); setShareLocation(false); },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 },
    );
    return () => { if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current); };
  }, [user, shareLocation]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLocationToggle = async () => {
    if (!user) return;
    if (shareLocation) {
      // Turning OFF — no popup needed
      setShareLocation(false);
      setLocationStatus("idle");
      await api.clearVolLocation(user.token).catch(() => {});
    } else {
      // Turning ON — check if already consented (localStorage)
      const alreadyConsented = typeof window !== "undefined" && localStorage.getItem(CONSENT_KEY) === "true";
      if (alreadyConsented) {
        setShareLocation(true); // one-click re-enable
      } else {
        setShowConsentModal(true); // first time: show consent popup
      }
    }
  };

  const handleConsentAllow = () => {
    if (typeof window !== "undefined") localStorage.setItem(CONSENT_KEY, "true");
    setShowConsentModal(false);
    setShareLocation(true);
  };

  const handleConsentDeny = () => {
    setShowConsentModal(false);
  };

  const toggleSkill = (s: string) =>
    setSkills((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);

  const toggleDay = (day: string) =>
    setAvail((prev) => ({ ...prev, [day]: !prev[day] }));

  const handleSave = async () => {
    if (!user) return;
    setSaving(true); setError(""); setSaved(false);
    try {
      await api.updateVolProfile(user.token, {
        skills, availability,
        full_name: fullName || undefined,
        phone: phone || undefined,
        city: city || undefined,
        bio: bio || undefined,
        date_of_birth: dob || undefined,
      } as any);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) { setError(friendlyError(e)); }
    finally { setSaving(false); }
  };

  if (authLoading || loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={22} className="animate-spin text-[#48A15E]" />
    </div>
  );
  if (!user) return null;

  const activeDayCount = DAYS.filter((d) => availability[d]).length;
  const inputCls = "w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#115E54]/50 text-gray-800 placeholder-gray-400";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="p-6 space-y-6 max-w-xl"
    >
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-red-300"
            style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}>
            <AlertCircle size={14} /> {error}
          </motion.div>
        )}
        {saved && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-emerald-300"
            style={{ background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.25)" }}>
            <CheckCircle2 size={14} /> Profile saved successfully.
          </motion.div>
        )}
      </AnimatePresence>

      {/* Personal Info */}
      <motion.div
        whileHover={{ y: -2, boxShadow: "0 12px 32px rgba(42,130,86,0.12)", borderColor: "#95C78F" }}
        className="rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4"
        style={{ background: "var(--card-bg)" }}
      >
        <div className="flex items-center gap-2">
          <User size={14} className="text-[#2A8256]" />
          <h2 className="text-sm font-semibold text-gray-700">Personal Info</h2>
          <span className="ml-auto text-[10px] text-gray-400">* optional</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs text-gray-500 font-medium">Full Name *</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500 font-medium">Phone *</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500 font-medium">City *</label>
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Mumbai" className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500 font-medium">Date of Birth *</label>
            <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-500 font-medium">Bio *</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            placeholder="Tell your NGO about yourself, your experience, and what motivates you…"
            className={`${inputCls} resize-none`}
          />
        </div>
        <p className="text-[11px] text-gray-400">Account: <span className="font-mono">{user.email}</span></p>
      </motion.div>

      {/* Skills */}
      <motion.div
        whileHover={{ y: -2, boxShadow: "0 12px 32px rgba(42,130,86,0.12)", borderColor: "#95C78F" }}
        className="rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4"
        style={{ background: "var(--card-bg)" }}
      >
        <h2 className="text-sm font-semibold text-gray-700">Skills</h2>
        <div className="flex flex-wrap gap-2">
          {PREDEFINED_SKILLS.map((s) => {
            const selected = skills.includes(s);
            return (
              <motion.button
                key={s} type="button" onClick={() => toggleSkill(s)} whileTap={{ scale: 0.92 }}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                  selected ? "text-[#2A8256] border-[#2A8256]/30" : "bg-gray-50 border-gray-200 text-gray-500 hover:border-[#2A8256]/40 hover:text-[#2A8256]"
                }`}
                style={selected ? { background: "rgba(42,130,86,0.1)" } : {}}
              >
                {selected && <span className="w-1.5 h-1.5 rounded-full bg-[#48A15E] shrink-0" />}
                {s}
              </motion.button>
            );
          })}
        </div>
      </motion.div>

      {/* Availability */}
      <motion.div
        whileHover={{ y: -2, boxShadow: "0 12px 32px rgba(42,130,86,0.12)", borderColor: "#95C78F" }}
        className="rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4"
        style={{ background: "var(--card-bg)" }}
      >
        <h2 className="text-sm font-semibold text-gray-700">Weekly Availability</h2>
        <div className="grid grid-cols-7 gap-1.5">
          {DAYS.map((d) => (
            <motion.button
              key={d} type="button" onClick={() => toggleDay(d)} whileTap={{ scale: 0.88 }}
              transition={{ type: "spring", stiffness: 500, damping: 20 }}
              className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-semibold transition-colors ${
                availability[d] ? "text-white border-transparent" : "bg-gray-50 border-gray-200 text-gray-400 hover:border-[#2A8256]/40 hover:text-[#2A8256]"
              }`}
              style={availability[d] ? { background: "linear-gradient(135deg,#2A8256,#48A15E)" } : {}}
            >
              <span>{DAY_LABELS[d]}</span>
              <div className={`w-1.5 h-1.5 rounded-full ${availability[d] ? "bg-white/60" : "bg-gray-200"}`} />
            </motion.button>
          ))}
        </div>
        <p className="text-[10px] text-gray-400">{activeDayCount} day{activeDayCount !== 1 ? "s" : ""} available per week</p>
      </motion.div>

      {/* Performance */}
      {performance && (
        <motion.div
          whileHover={{ y: -2, boxShadow: "0 12px 32px rgba(42,130,86,0.12)", borderColor: "#95C78F" }}
          className="rounded-2xl border border-gray-200 shadow-sm p-5"
          style={{ background: "var(--card-bg)" }}
        >
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Performance</h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="text-xl font-bold" style={{ color: "#2A8256" }}>{performance.performance_score.toFixed(0)}%</div>
              <div className="text-[10px] text-gray-400 mt-0.5">Score</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-gray-800">{performance.completed_tasks}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">Completed</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-gray-800">{performance.total_assigned}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">Total Assigned</div>
            </div>
          </div>
          <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }} animate={{ width: `${performance.performance_score}%` }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
              className="h-full rounded-full"
              style={{ background: "linear-gradient(90deg,#2A8256,#48A15E)" }}
            />
          </div>
        </motion.div>
      )}

      {/* Badges */}
      <motion.div
        whileHover={{ y: -2, boxShadow: "0 12px 32px rgba(42,130,86,0.12)", borderColor: "#95C78F" }}
        className="rounded-2xl border border-gray-200 shadow-sm p-5"
        style={{ background: "var(--card-bg)" }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Award size={14} className="text-[#2A8256]" />
          <h2 className="text-sm font-semibold text-gray-700">Achievements</h2>
          {performance && <span className="ml-auto text-[10px] text-gray-400">{performance.completed_tasks} task{performance.completed_tasks !== 1 ? "s" : ""} done</span>}
        </div>
        <div className="grid grid-cols-4 gap-2">
          {BADGES.map((b) => {
            const unlocked = (performance?.completed_tasks ?? 0) >= b.threshold;
            return (
              <motion.div
                key={b.id} whileHover={{ scale: unlocked ? 1.06 : 1 }}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all ${
                  unlocked ? "border-[#2A8256]/30 bg-gradient-to-b from-emerald-50 to-white" : "border-gray-100 bg-gray-50 opacity-40 grayscale"
                }`}
              >
                <span className="text-xl">{b.emoji}</span>
                <p className="text-[10px] font-bold text-gray-700">{b.label}</p>
                <p className="text-[9px] text-gray-400 leading-tight">{b.desc}</p>
                {unlocked && <div className="w-1.5 h-1.5 rounded-full bg-[#48A15E]" />}
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* Location sharing */}
      <motion.div
        whileHover={{ y: -2, boxShadow: "0 12px 32px rgba(42,130,86,0.12)", borderColor: "#95C78F" }}
        className="rounded-2xl border border-gray-200 shadow-sm p-5"
        style={{ background: "var(--card-bg)" }}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: shareLocation ? "linear-gradient(135deg,#2A8256,#48A15E)" : "rgba(107,114,128,0.12)" }}>
              {shareLocation ? <MapPin size={16} className="text-white" /> : <MapPinOff size={16} className="text-gray-400" />}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Share Live Location</p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {locationStatus === "active"  && "Location is being shared with your NGO"}
                {locationStatus === "denied"  && "Permission denied — enable location in browser settings"}
                {locationStatus === "error"   && "Geolocation unavailable on this device"}
                {locationStatus === "idle"    && "Allow your NGO to see your position on the map"}
              </p>
            </div>
          </div>
          <button
            type="button" onClick={handleLocationToggle}
            className="shrink-0 relative w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none"
            style={{ background: shareLocation ? "linear-gradient(135deg,#2A8256,#48A15E)" : "rgba(209,213,219,1)" }}
            aria-label="Toggle location sharing"
          >
            <motion.span
              animate={{ x: shareLocation ? 24 : 2 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm"
              style={{ left: 0 }}
            />
          </button>
        </div>
      </motion.div>

      <motion.button
        onClick={handleSave} disabled={saving}
        whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
        className="w-full text-white py-3 rounded-xl text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-2"
        style={{ background: "linear-gradient(135deg,#2A8256,#48A15E)" }}
      >
        {saving && <Loader2 size={14} className="animate-spin" />}
        Save Profile
      </motion.button>

      {/* Location Consent Modal */}
      <AnimatePresence>
        {showConsentModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 16 }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
            >
              {/* Header */}
              <div className="px-6 pt-6 pb-4 text-center">
                <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg,rgba(42,130,86,0.12),rgba(72,161,94,0.18))" }}>
                  <Shield size={26} style={{ color: "#2A8256" }} />
                </div>
                <h3 className="text-base font-bold text-gray-800">Location Sharing Request</h3>
                <p className="text-xs text-gray-500 mt-2.5 leading-relaxed">
                  Your NGO would like to share your live location so coordinators can see your
                  position on the deployment map. This helps your team coordinate more effectively
                  during field operations.
                </p>
                <p className="text-xs font-semibold mt-3" style={{ color: "#2A8256" }}>
                  You can stop sharing at any time by toggling this off.
                </p>
              </div>

              {/* Privacy note */}
              <div className="mx-6 mb-4 rounded-xl px-3 py-2.5 flex items-start gap-2.5"
                style={{ background: "rgba(42,130,86,0.06)", border: "1px solid rgba(42,130,86,0.15)" }}>
                <MapPin size={12} className="mt-0.5 shrink-0" style={{ color: "#2A8256" }} />
                <p className="text-[10px] text-gray-500 leading-relaxed">
                  Your location is only shared with your NGO administrators and is never sold or shared with third parties.
                </p>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 px-6 pb-6">
                <button
                  onClick={handleConsentDeny}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  Deny
                </button>
                <motion.button
                  onClick={handleConsentAllow}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white"
                  style={{ background: "linear-gradient(135deg,#2A8256,#48A15E)" }}
                >
                  Allow
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
